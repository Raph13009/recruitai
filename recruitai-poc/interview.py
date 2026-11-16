"""Conversational interview engine for RecruitAI (stdlib only).

Structured stages remain app-controlled, but progression is conditional on
intent + whether the current slot is actually filled. Qwen only naturalizes.
"""
from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

ROOT = pathlib.Path(__file__).parent
JOB_PATH = ROOT / "data" / "demo_job.json"

STAGES = [
    "intro",
    "experience",
    "availability",
    "hours",
    "salary",
    "questions",
    "closing",
]

COLLECT_STAGES = ("experience", "availability", "hours", "salary", "questions")

MAX_USER_TURNS = 16
MAX_FOLLOWUPS_PER_STAGE = 1
MAX_REASKS_PER_STAGE = 2

Intent = str  # ANSWER | QUESTION_ABOUT_JOB | CLARIFICATION_REQUEST | INCOMPLETE_ANSWER | OFF_TOPIC | END_INTERVIEW


def next_monday(today: date | None = None) -> date:
    today = today or date.today()
    days = (0 - today.weekday()) % 7
    if days == 0:
        days = 7
    return today + timedelta(days=days)


def format_fr_date(d: date) -> str:
    months = (
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    )
    return f"{d.day} {months[d.month - 1]} {d.year}"


def load_job(path: pathlib.Path | None = None) -> dict[str, Any]:
    data = json.loads((path or JOB_PATH).read_text(encoding="utf-8"))
    start = next_monday()
    data = dict(data)
    data["start_date"] = start.isoformat()
    data["start_date_fr"] = format_fr_date(start)
    return data


def job_brief(job: dict[str, Any]) -> str:
    hours = " ou ".join(job["working_hours"])
    return (
        f"Agence {job['agency']}, poste {job['job_title']} à {job['location']}. "
        f"Mission de 2 semaines renouvelable, début le {job['start_date_fr']}. "
        f"Tâches : {job['tasks']}. Horaires : {hours}. "
        f"Rémunération : {job['salary_note']}. {job['experience']}."
    )


def strip_roleplay_prefixes(text: str) -> str:
    """Remove artificial labels small models love to emit."""
    t = text.strip()
    t = re.sub(r"^(?:question|réponse|reponse|camille|assistant)\s*:\s*", "", t, flags=re.I)
    t = re.sub(r"\n\s*(?:question|réponse|reponse)\s*:\s*", "\n", t, flags=re.I)
    return t.strip()


# --- Job fact answers ---

def answer_job_topic(topic: str, job: dict[str, Any]) -> str:
    hours = " ou ".join(job["working_hours"])
    if topic == "salary":
        return f"La mission est rémunérée {job['salary_note']}."
    if topic == "hours":
        return f"La mission propose deux créneaux : {hours}."
    if topic == "duties":
        return (
            f"Les tâches prévues sont : {job['tasks']}. "
            f"C'est une {job['contract'].lower()} à {job['location']}, "
            f"début le {job['start_date_fr']}. Les débutants sont acceptés."
        )
    if topic == "contract":
        return (
            f"Il s'agit d'une {job['contract'].lower()}, pour {job['agency']}, "
            f"à {job['location']}, début le {job['start_date_fr']}."
        )
    if topic == "start":
        return f"La date de début indiquée sur la fiche est le {job['start_date_fr']}."
    if topic == "location":
        return f"Le poste est situé à {job['location']}."
    return (
        "Je ne dispose que des informations de la fiche de poste. "
        "Un recruteur humain pourra préciser le reste."
    )


def detect_job_topic(text: str) -> str | None:
    low = text.lower()
    if re.search(r"\b(salaire|r[eé]mun[eé]ration|pay[eé]|combien|taux\s*horaire|indemnit)", low):
        return "salary"
    if re.search(r"\b(horaire|cr[eé]neaux?|shift|plage\s+horaire)", low):
        return "hours"
    if re.search(r"\b(t[aâ]ches?|missions?|quoi\s+faire|colis|manutention|quai|quotidien)", low):
        return "duties"
    if re.search(r"\b(contrat|dur[eé]e|renouvel|mission\s+de)", low):
        return "contract"
    if re.search(r"\b(d[eé]but|commencer|date\s+de\s+prise|lundi\s+prochain)", low):
        return "start"
    if re.search(r"\b(o[uù]|localisation|adresse|lyon)", low) and ("?" in text or "où" in low):
        return "location"
    return None


# --- Intent detection ---

_CLARIFY = re.compile(
    r"(?i)\b("
    r"comment\s+ça|comment\s+ca|je\s+ne\s+comprends?\s+pas|j[' ]comprends?\s+pas|"
    r"vous\s+pouvez\s+r[eé]p[eé]ter|peux[- ]tu\s+r[eé]p[eé]ter|r[eé]p[eé]tez|"
    r"c[' ]est[- ][àa]\s+dire|qu[' ]est[- ]ce\s+que\s+vous\s+voulez\s+dire|"
    r"je\s+sais\s+pas\s+ce\s+que\s+vous\s+voulez|quoi\s*\?|hein\s*\?"
    r")\b|^quoi\s*\?$|^comment\s*\?$|^hein\s*\?$"
)
_END = re.compile(
    r"(?i)\b(au\s+revoir|terminons|on\s+arr[eê]te|fin\s+de\s+l[' ]entretien|"
    r"j[' ]ai\s+fini|je\s+dois\s+y\s+aller|stop\s+l[' ]entretien)\b"
)
_OFF = re.compile(
    r"(?i)\b(m[eé]t[eé]o|foot|football|blague|recette|film|s[eé]rie)\b"
)


def looks_like_question(text: str) -> bool:
    t = text.strip()
    low = t.lower()
    if "?" in t:
        return True
    return low.startswith(
        (
            "est-ce", "c'est combien", "combien", "quel", "quelle", "quels", "quelles",
            "pouvez", "peux", "pourquoi", "où", "ou est", "comment",
        )
    )


def detect_intent(text: str, stage: str, slots: "InterviewSlots") -> tuple[Intent, str | None]:
    """Return (intent, job_topic_or_none). Deterministic rules first."""
    raw = text.strip()
    if not raw:
        return "INCOMPLETE_ANSWER", None

    if _END.search(raw):
        return "END_INTERVIEW", None

    if _CLARIFY.search(raw):
        # "Comment ça ?" alone is clarification; "Comment ça se passe pour le salaire ?" is a job Q
        topic = detect_job_topic(raw)
        if topic and ("salaire" in raw.lower() or "horaire" in raw.lower() or "tâche" in raw.lower()):
            return "QUESTION_ABOUT_JOB", topic
        return "CLARIFICATION_REQUEST", None

    topic = detect_job_topic(raw)
    if topic and looks_like_question(raw):
        return "QUESTION_ABOUT_JOB", topic
    # Soft job question without '?': "c'est combien le salaire" (not "le salaire aussi/me va")
    low_full = raw.lower()
    if topic == "salary" and any(w in low_full for w in ("combien", "c'est combien", "quel salaire", "c'est quel")):
        return "QUESTION_ABOUT_JOB", topic
    if topic == "salary" and "le salaire" in low_full and looks_like_question(raw):
        return "QUESTION_ABOUT_JOB", topic

    if _OFF.search(raw) and not any(
        k in raw.lower() for k in ("disponible", "horaire", "salaire", "expérience", "experience", "entrepôt")
    ):
        return "OFF_TOPIC", None

    # Stage-aware completeness
    if stage == "intro":
        return "ANSWER", None

    if stage == "experience":
        if is_ready_affirmation(raw):
            return "INCOMPLETE_ANSWER", None
        if experience_sufficient(raw, slots):
            return "ANSWER", None
        if experience_needs_followup(raw, slots):
            return "ANSWER", None  # answer, but engine will follow up
        if _vague_only(raw):
            return "INCOMPLETE_ANSWER", None
        if len(raw.split()) >= 2:
            return "ANSWER", None
        return "INCOMPLETE_ANSWER", None

    if stage == "availability":
        # "Je suis prêt à commencer" without a date is not a usable availability
        if is_ready_affirmation(raw):
            dateish = any(
                c in raw.lower()
                for c in (
                    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
                    "immédiat", "immediat", "semaine", "mois", "novembre", "décembre", "decembre",
                    "janvier", "février", "fevrier", "202", "dès", "des que", "demain", "après", "apres",
                )
            )
            if not dateish:
                return "INCOMPLETE_ANSWER", None
        if extract_availability_value(raw):
            return "ANSWER", None
        if _vague_only(raw):
            return "INCOMPLETE_ANSWER", None
        return "INCOMPLETE_ANSWER", None

    if stage == "hours":
        if extract_hours_value(raw) or mentions_custom_hours(raw):
            return "ANSWER", None
        # Availability correction mid-hours
        if extract_availability_value(raw) and any(
            w in raw.lower() for w in ("en fait", "disponible", "dispo", "commencer", "mois", "semaine")
        ):
            return "ANSWER", None
        if _vague_only(raw):
            return "INCOMPLETE_ANSWER", None
        return "INCOMPLETE_ANSWER", None

    if stage == "salary":
        if extract_salary_value(raw):
            return "ANSWER", None
        return "INCOMPLETE_ANSWER", None

    if stage == "questions":
        return "ANSWER", None

    return "ANSWER", None


def _vague_only(text: str) -> bool:
    low = text.lower().strip().rstrip(".!")
    return low in {
        "oui", "non", "ok", "okay", "d'accord", "daccord", "euh", "hmm", "bof",
        "peut-être", "peut etre", "je ne sais pas", "je sais pas", "...", "mh", "bah",
    } or len(text.split()) < 2


# --- Extraction ---

_TIME_CUES = (
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "semaine", "mois", "immédiat", "immediat", "disponible", "dispo",
    "après", "apres", "demain", "dès", "des que", "dès que",
    "janvier", "février", "fevrier", "mars", "avril", "mai", "juin",
    "juillet", "août", "aout", "septembre", "octobre", "novembre", "décembre", "decembre",
    "202", "pas disponible", "indisponible", "impossible", "mercredi",
)

_TASK_CUES = (
    "prépar", "prepar", "emball", "picking", "packing", "charg", "décharg", "decharg",
    "tri", "colis", "quai", "manutention", "inventaire", "réception", "reception",
)

_COMPANY_CUES = ("chez ", "amazon", "carrefour", "fnac", "entrepôt", "entrepot", "logistique")


def is_ready_affirmation(text: str) -> bool:
    """True for 'yes I'm ready to start' — not a real experience/hours answer."""
    low = re.sub(r"\s+", " ", text.lower().strip()).rstrip(".!,;")
    ready_exact = {
        "oui", "ok", "okay", "d'accord", "daccord", "oui je suis prêt", "oui je suis prete",
        "oui je suis prête", "je suis prêt", "je suis prete", "je suis prête",
        "prêt", "prete", "prête", "allons-y", "allons y", "on y va", "c'est parti",
        "je veux bien", "oui allons-y",
    }
    if low in ready_exact:
        return True
    if re.fullmatch(
        r"(oui[, ]*)?(je\s+suis\s+)?pr[eê]t[e]?(\s+à\s+commencer(\s+(cet\s+)?entretien|\s+l['’]entretien)?)?",
        low,
    ):
        return True
    if re.search(r"pr[eê]t[e]?\s+(à|a)\s+commencer", low) and not any(
        c in low for c in _TIME_CUES + _TASK_CUES + ("horaire", "salaire", "logistique", "manutention", "disponible")
    ):
        # e.g. Whisper: "prêt à commencer cette entreprise" without a real start date
        if "entreprise" in low or "entretien" in low or len(low.split()) <= 8:
            return True
    return False


def experience_needs_followup(text: str, slots: "InterviewSlots") -> bool:
    """True when candidate claims experience but without concrete tasks yet."""
    if slots.followups.get("experience", 0) >= MAX_FOLLOWUPS_PER_STAGE:
        return False
    low = text.lower()
    if any(b in low for b in ("débutant", "debutant", "jamais", "pas d'expérience", "pas d'experience", "aucune expérience")):
        return False
    if low.strip().rstrip(".!") in {"non", "non merci"}:
        return False
    has_yes_exp = (
        low.startswith("oui")
        or any(c in low for c in _COMPANY_CUES)
        or "expérience" in low
        or "experience" in low
        or "travaill" in low
        or "ans" in low
        or "mois" in low
    )
    has_tasks = any(c in low for c in _TASK_CUES)
    return bool(has_yes_exp and not has_tasks)


def experience_sufficient(text: str, slots: "InterviewSlots") -> bool:
    low = text.lower()
    if any(b in low for b in ("débutant", "debutant", "jamais travaill", "pas d'expérience", "pas d'experience")):
        return True
    if low.strip().rstrip(".!") in {"non", "non."}:
        return True
    if any(c in low for c in _TASK_CUES):
        return True
    # Already did a follow-up: accept whatever substantive reply
    if slots.followups.get("experience", 0) >= 1 and len(text.split()) >= 3:
        return True
    if any(c in low for c in _COMPANY_CUES) and any(c in low for c in ("mois", "an", "ans", "semaine")):
        # company + duration but no tasks → not yet sufficient (follow-up)
        return False
    return False


_AVAIL_STRONG = (
    "disponible", "dispo", "commencer", "disponibilité", "à partir", "a partir",
    "dès", "des que", "dès que", "immédiat", "immediat", "semaine prochaine",
    "dans un mois", "dans deux", "pas disponible", "indisponible",
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
)


def extract_availability_value(text: str) -> str | None:
    if len(text.strip()) < 2:
        return None
    low = text.lower()
    # Duration words like "mois" alone often describe experience, not availability
    if not any(c in low for c in _AVAIL_STRONG):
        return None
    if re.search(r"\b\d{1,2}\s*h|\b\d{1,2}:\d{2}", low) and not any(
        c in low for c in _AVAIL_STRONG
    ):
        return None
    return text.strip()


def mentions_custom_hours(text: str) -> bool:
    low = text.lower()
    return bool(re.search(r"\b\d{1,2}\s*h(?:eurs?)?\b|\b\d{1,2}:\d{2}\b|\bpause\b", low))


def official_hours_match(text: str) -> bool:
    low = text.lower().replace(" ", "")
    if "lesdeux" in low or "deux" in text.lower() and "créneau" in text.lower():
        return True
    if "indifférent" in text.lower() or "indifferent" in text.lower() or "peuimporte" in low:
        return True
    # 6-13
    if any(x in low for x in ("6:00", "6h", "06h", "6h00", "06:00")) and any(
        x in low for x in ("13", "13h", "13:00")
    ):
        return True
    if "matin" in text.lower() and "après" not in text.lower() and "apres" not in text.lower():
        return True
    # 13-20
    if any(x in low for x in ("13:00", "13h", "13h00")) and any(x in low for x in ("20", "20h", "20:00")):
        return True
    if "après-midi" in text.lower() or "apres-midi" in text.lower() or "après midi" in text.lower() or "soir" in text.lower():
        return True
    if "les deux" in text.lower() or "tous" in text.lower():
        return True
    return False


def extract_hours_value(text: str) -> str | None:
    if len(text.strip()) < 2:
        return None
    if official_hours_match(text) or mentions_custom_hours(text):
        return text.strip()
    low = text.lower()
    if any(w in low for w in ("accepte", "ok pour", "ça me va", "ca me va", "convient")):
        return text.strip()
    if len(text.split()) >= 3 and any(w in low for w in ("horaire", "créneau", "creneau", "matin", "soir")):
        return text.strip()
    return None


def hours_need_alignment(text: str) -> bool:
    """Candidate gave hours that don't clearly map to the two official slots."""
    if official_hours_match(text):
        return False
    return mentions_custom_hours(text)


def extract_salary_value(text: str) -> str | None:
    low = text.lower().strip()
    if not low:
        return None
    if any(
        w in low
        for w in (
            "oui", "non", "ok", "d'accord", "accepte", "convient", "correspond",
            "trop bas", "insuffisant", "ça me va", "ca me va", "attendu", "attente",
            "d'accord pour", "ça marche", "ca marche",
        )
    ) or len(text.split()) >= 2:
        return text.strip()
    return None


def extract_bundled_slots(text: str, slots: "InterviewSlots") -> dict[str, str]:
    """Pull any slot values present in a single utterance (multi-answer)."""
    found: dict[str, str] = {}
    low = text.lower()
    # Never treat a question as a filled expectation slot
    asking = looks_like_question(text) or detect_job_topic(text) and any(
        w in low for w in ("combien", "c'est combien", "quel est")
    )
    av = extract_availability_value(text)
    if av and not (asking and detect_job_topic(text) == "salary" and "mercredi" not in low and "disponible" not in low):
        # Keep availability if clearly stated even inside a mixed sentence
        if any(c in low for c in _AVAIL_STRONG):
            found["availability"] = av
    hv = extract_hours_value(text)
    if hv and official_hours_match(text):
        found["accepted_hours"] = hv
    if not asking and any(
        w in low
        for w in (
            "salaire me va", "ça me va", "ca me va", "accepte le salaire",
            "pour le salaire oui", "oui pour le salaire", "le salaire aussi",
        )
    ):
        found["salary_expectations"] = text.strip()
    # Leading yes/no after a salary discussion often accepts compensation while adding other info
    if not asking and slots.salary_expectations is None and re.match(
        r"(?i)^\s*(oui|non)\b", text
    ) and any(c in low for c in _AVAIL_STRONG):
        found["salary_expectations"] = text.strip().split(",")[0].strip() or text.strip()
    # Bundle experience from experiential utterances (allowed even in multi-answer lines)
    if any(c in low for c in _TASK_CUES + _COMPANY_CUES + ("expérience", "experience", "débutant", "debutant", "manutention", "logistique", "jamais travaill")):
        found["experience"] = text.strip()
    return found


# --- Stage questions (deterministic fallbacks) ---

def stage_question(stage: str, job: dict[str, Any], *, variant: str = "default") -> str:
    hours = " ou ".join(job["working_hours"])
    if stage == "intro":
        return (
            f"Bonjour, je suis Camille, une assistante de recrutement basée sur une intelligence artificielle "
            f"pour {job['agency']}. Le poste concerne un {job['job_title']} à {job['location']} : "
            f"{job['tasks']}, mission de 2 semaines renouvelable à partir du {job['start_date_fr']}. "
            f"Êtes-vous prêt(e) à commencer cet entretien ?"
        )
    if stage == "experience":
        if variant == "followup":
            return "Qu'est-ce que vous faisiez concrètement comme tâches ?"
        if variant == "reask":
            return "Avez-vous déjà travaillé en logistique ou en manutention, même brièvement, ou êtes-vous débutant(e) ?"
        return "Avez-vous déjà travaillé en logistique ou en manutention ?"
    if stage == "availability":
        if variant == "reask":
            return f"À partir de quelle date seriez-vous disponible ? Le début prévu sur la fiche est le {job['start_date_fr']}."
        return f"Le début de mission est prévu le {job['start_date_fr']}. À partir de quand seriez-vous disponible ?"
    if stage == "hours":
        if variant == "align":
            return (
                f"La mission propose deux créneaux : {hours}. "
                f"Lequel vous conviendrait, ou les deux ?"
            )
        if variant == "reask":
            return f"Parmi {hours}, quel créneau vous conviendrait ?"
        return f"Concernant les horaires, la mission propose deux créneaux : {hours}. Lequel vous conviendrait ?"
    if stage == "salary":
        if variant == "reask":
            return f"Est-ce que {job['salary_note']} correspond à vos attentes ?"
        return f"La mission est rémunérée {job['salary_note']}. Est-ce que cela correspond à ce que vous recherchez ?"
    if stage == "questions":
        return "Avez-vous des questions sur le poste, les horaires ou la rémunération ?"
    if stage == "closing":
        return (
            "Merci pour cet échange. Un recruteur humain pourra examiner les informations "
            "que vous avez partagées. Je clôture cet entretien sans décision d'embauche. Au revoir."
        )
    return "Poursuivons l'entretien."


def acknowledge(text: str, stage: str) -> str:
    """Short deterministic acknowledgment referencing the answer."""
    snippet = re.sub(r"\s+", " ", text.strip())
    if len(snippet) > 90:
        snippet = snippet[:87] + "…"
    low = text.lower()
    if stage == "experience":
        if any(b in low for b in ("débutant", "debutant", "jamais", "pas d'expérience", "pas d'experience")):
            return "D'accord, je note que vous débutez."
        return f"D'accord, je retiens : {snippet}."
    if stage == "availability":
        return f"D'accord, je retiens comme disponibilité : {snippet}."
    if stage == "hours":
        if hours_need_alignment(text):
            return f"Je comprends votre préférence ({snippet})."
        return f"Très bien, je note pour les horaires : {snippet}."
    if stage == "salary":
        if any(w in low for w in ("non", "trop bas", "insuffisant")):
            return "Je note votre retour sur la rémunération."
        return "Très bien, je note votre position sur le salaire."
    if stage == "intro":
        return "Parfait."
    if stage == "questions":
        return "Très bien."
    return "D'accord."


# --- State ---

@dataclass
class InterviewSlots:
    experience: str | None = None
    availability: str | None = None
    accepted_hours: str | None = None
    salary_expectations: str | None = None
    candidate_questions: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    reasks: dict[str, int] = field(default_factory=dict)
    followups: dict[str, int] = field(default_factory=dict)
    last_question: str = ""
    contradictions: list[str] = field(default_factory=list)
    hours_pending_align: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "experience": self.experience,
            "availability": self.availability,
            "accepted_hours": self.accepted_hours,
            "salary_expectations": self.salary_expectations,
            "candidate_questions": list(self.candidate_questions),
            "missing_information": list(self.missing),
            "contradictions": list(self.contradictions),
        }

    def filled(self, stage: str) -> bool:
        if stage == "experience":
            return self.experience is not None
        if stage == "availability":
            return self.availability is not None
        if stage == "hours":
            return self.accepted_hours is not None and not self.hours_pending_align
        if stage == "salary":
            return self.salary_expectations is not None
        if stage == "questions":
            return bool(getattr(self, "_questions_done", False))
        return False


@dataclass
class TurnResult:
    reply: str
    stage: str
    done: bool
    slots: InterviewSlots
    mode_hint: str
    intent: str = "ANSWER"
    interrupted: bool = False
    progress_turn: int = 0
    progress_max: int = MAX_USER_TURNS


def _apply_bundle(slots: InterviewSlots, found: dict[str, str]) -> None:
    for key, val in found.items():
        prev = getattr(slots, key, None)
        if key == "experience":
            if prev and val and val not in prev and prev not in val:
                slots.experience = f"{prev} — {val}"
            elif not prev:
                slots.experience = val
            continue
        if prev and prev != val and key in ("availability", "accepted_hours", "salary_expectations"):
            slots.contradictions.append(f"{key}: « {prev} » → « {val} »")
        setattr(slots, key, val)


def _next_open_stage(slots: InterviewSlots) -> str:
    if slots.experience is None:
        return "experience"
    if slots.availability is None:
        return "availability"
    if slots.accepted_hours is None or slots.hours_pending_align:
        return "hours"
    if slots.salary_expectations is None:
        return "salary"
    if not getattr(slots, "_questions_done", False):
        return "questions"
    return "closing"


def _mark_missing(slots: InterviewSlots, stage: str) -> None:
    labels = {
        "experience": "expérience",
        "availability": "disponibilité",
        "hours": "horaires acceptés",
        "salary": "attentes salariales",
    }
    label = labels.get(stage)
    if label and label not in slots.missing:
        slots.missing.append(label)


def replay_state(history: list[dict]) -> tuple[str, InterviewSlots, int]:
    """
    Replay history with the same intent rules to rebuild slots/stage.
    Used for report + progress; process_turn still decides the live reply from last message.
    """
    slots = InterviewSlots()
    stage = "intro"
    user_turns = 0
    for msg in history:
        role = msg.get("role")
        content = str(msg.get("content", "")).strip()
        if role == "assistant":
            slots.last_question = content
            continue
        if role != "user":
            continue
        user_turns += 1
        intent, topic = detect_intent(content, stage, slots)

        if intent == "END_INTERVIEW":
            stage = "closing"
            continue
        if intent == "CLARIFICATION_REQUEST":
            slots.reasks[stage] = slots.reasks.get(stage, 0) + 1
            continue
        if intent == "QUESTION_ABOUT_JOB":
            slots.candidate_questions.append(content)
            _apply_bundle(slots, extract_bundled_slots(content, slots))
            if stage == "intro":
                stage = _next_open_stage(slots)
            continue
        if intent == "OFF_TOPIC":
            continue
        if intent == "INCOMPLETE_ANSWER":
            slots.reasks[stage] = slots.reasks.get(stage, 0) + 1
            if slots.reasks[stage] >= MAX_REASKS_PER_STAGE:
                _mark_missing(slots, stage)
                if stage == "experience" and not slots.experience:
                    slots.experience = content if not is_ready_affirmation(content) else "(non précisé)"
                elif stage == "availability" and not slots.availability:
                    slots.availability = content if not is_ready_affirmation(content) else "(non précisé)"
                elif stage == "questions":
                    slots._questions_done = True  # type: ignore[attr-defined]
                idx = STAGES.index(stage) if stage in STAGES else 1
                nxt = STAGES[min(idx + 1, len(STAGES) - 1)]
                stage = nxt if nxt == "closing" else _next_open_stage(slots)
            continue

        # ANSWER
        if stage == "intro":
            stage = "experience"
            continue

        if stage == "experience":
            if experience_needs_followup(content, slots):
                slots.experience = content  # partial
                slots.followups["experience"] = slots.followups.get("experience", 0) + 1
                continue
            if slots.experience and slots.experience != content:
                slots.experience = f"{slots.experience} — {content}"
            else:
                slots.experience = content
            _apply_bundle(slots, extract_bundled_slots(content, slots))
            stage = _next_open_stage(slots)
            continue

        if stage == "availability":
            val = extract_availability_value(content) or content
            if slots.availability and slots.availability != val:
                slots.contradictions.append(f"availability: « {slots.availability} » → « {val} »")
            slots.availability = val
            _apply_bundle(slots, extract_bundled_slots(content, slots))
            stage = _next_open_stage(slots)
            continue

        if stage == "hours":
            av = extract_availability_value(content)
            if (
                av
                and not official_hours_match(content)
                and not mentions_custom_hours(content)
                and any(w in content.lower() for w in ("en fait", "disponible", "dispo", "commencer", "mois", "semaine"))
            ):
                if slots.availability and slots.availability != av:
                    slots.contradictions.append(f"availability: « {slots.availability} » → « {av} »")
                slots.availability = av
                continue
            if hours_need_alignment(content) and slots.followups.get("hours", 0) < MAX_FOLLOWUPS_PER_STAGE:
                slots.followups["hours"] = slots.followups.get("hours", 0) + 1
                slots.hours_pending_align = True
                slots.accepted_hours = None
                continue
            val = extract_hours_value(content) or content
            if slots.accepted_hours and slots.accepted_hours != val:
                slots.contradictions.append(f"accepted_hours: « {slots.accepted_hours} » → « {val} »")
            slots.accepted_hours = val
            slots.hours_pending_align = False
            _apply_bundle(slots, extract_bundled_slots(content, slots))
            stage = _next_open_stage(slots)
            continue

        if stage == "salary":
            slots.salary_expectations = extract_salary_value(content) or content
            _apply_bundle(slots, extract_bundled_slots(content, slots))
            stage = _next_open_stage(slots)
            continue

        if stage == "questions":
            low = content.lower()
            if looks_like_question(content) and detect_job_topic(content):
                slots.candidate_questions.append(content)
                # stay to allow answer then close on next turn — for replay, mark done after any reply
            slots._questions_done = True  # type: ignore[attr-defined]
            stage = "closing"
            continue

    return stage, slots, user_turns


def compose_reply(
    *,
    intent: Intent,
    topic: str | None,
    stage: str,
    slots: InterviewSlots,
    user_text: str,
    job: dict[str, Any],
) -> tuple[str, str, bool, InterviewSlots]:
    """
    Build deterministic reply + updated stage/slots for THIS turn.
    Returns (reply, new_stage, done, slots).
    """
    done = False

    if intent == "END_INTERVIEW":
        reply = stage_question("closing", job)
        return reply, "closing", True, slots

    if intent == "CLARIFICATION_REQUEST":
        prev = slots.last_question or stage_question(stage if stage != "intro" else "experience", job)
        # Rephrase without advancing
        clarify = stage_question(stage if stage in COLLECT_STAGES else "experience", job, variant="reask")
        reply = f"Bien sûr. Je reformule : {clarify}"
        slots.last_question = clarify
        return reply, stage if stage != "intro" else "experience", False, slots

    if intent == "OFF_TOPIC":
        q = stage_question(stage if stage in COLLECT_STAGES else "experience", job)
        reply = f"Je reste concentrée sur l'entretien. {q}"
        slots.last_question = q
        return reply, stage if stage != "intro" else "experience", False, slots

    if intent == "QUESTION_ABOUT_JOB":
        topic = topic or detect_job_topic(user_text) or "duties"
        fact = answer_job_topic(topic, job)
        slots.candidate_questions.append(user_text)
        # Mixed answers only (e.g. accept salary + give availability) — never mark a question as the answer
        bundled = extract_bundled_slots(user_text, slots)
        _apply_bundle(slots, bundled)
        if topic == "salary":
            q = "Est-ce que ça correspond à ce que vous recherchez ?"
            reply = f"{fact} {q}"
            slots.last_question = q
            # Keep collecting current open info; salary confirmation may fill next
            open_stage = stage if stage in COLLECT_STAGES and stage != "intro" else _next_open_stage(slots)
            return reply, open_stage, False, slots
        if stage in COLLECT_STAGES and not slots.filled(stage):
            open_stage = stage
        else:
            open_stage = _next_open_stage(slots) if stage != "intro" else _next_open_stage(slots)
        if stage == "intro":
            open_stage = _next_open_stage(slots)
        q = stage_question(open_stage, job)
        reply = f"{fact} {q}"
        slots.last_question = q
        return reply, open_stage, False, slots

    if intent == "INCOMPLETE_ANSWER":
        # Still harvest any concrete facts in a vague/out-of-stage utterance
        _apply_bundle(slots, extract_bundled_slots(user_text, slots))
        if slots.experience in (None, "(non précisé)") and any(
            c in user_text.lower() for c in _TASK_CUES + _COMPANY_CUES
        ):
            slots.experience = user_text
            if "expérience" in slots.missing:
                slots.missing.remove("expérience")
        slots.reasks[stage] = slots.reasks.get(stage, 0) + 1
        if slots.reasks[stage] >= MAX_REASKS_PER_STAGE:
            _mark_missing(slots, stage)
            # Move on after exhausting attempts — never store a ready-only phrase as experience
            if stage == "experience" and not slots.experience:
                slots.experience = (
                    user_text if not is_ready_affirmation(user_text) else "(non précisé)"
                )
            elif stage == "availability" and not slots.availability:
                slots.availability = (
                    user_text if not is_ready_affirmation(user_text) else "(non précisé)"
                )
            next_stage = _next_open_stage(slots)
            if next_stage == stage and stage in COLLECT_STAGES:
                # force advance
                idx = STAGES.index(stage)
                next_stage = STAGES[min(idx + 1, len(STAGES) - 1)]
            if next_stage == "closing":
                reply = stage_question("closing", job)
                return reply, "closing", True, slots
            q = stage_question(next_stage, job)
            reply = f"Très bien, on peut avancer. {q}"
            slots.last_question = q
            return reply, next_stage, False, slots
        q = stage_question(stage if stage in COLLECT_STAGES else "experience", job, variant="reask")
        reply = f"Pour que je note correctement : {q}"
        slots.last_question = q
        return reply, stage if stage in COLLECT_STAGES else "experience", False, slots

    # ANSWER path
    if stage == "intro":
        next_stage = "experience"
        q = stage_question(next_stage, job)
        reply = f"Parfait. {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "experience":
        if experience_needs_followup(user_text, slots):
            slots.experience = user_text
            slots.followups["experience"] = slots.followups.get("experience", 0) + 1
            q = stage_question("experience", job, variant="followup")
            ack = acknowledge(user_text, "experience")
            reply = f"{ack} {q}"
            slots.last_question = q
            return reply, "experience", False, slots
        if slots.experience and slots.experience != user_text:
            slots.experience = f"{slots.experience} — {user_text}"
        else:
            slots.experience = user_text
        _apply_bundle(slots, extract_bundled_slots(user_text, slots))
        # Ensure experience counts as filled for next-stage selection
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job)
        extra = ""
        if any(c in user_text.lower() for c in _TASK_CUES):
            extra = "Ça correspond à une partie des missions proposées. "
        reply = f"{acknowledge(user_text, 'experience')} {extra}{q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "availability":
        val = extract_availability_value(user_text) or user_text
        if slots.availability and slots.availability != val:
            slots.contradictions.append(f"availability: « {slots.availability} » → « {val} »")
            ack = f"Je mets à jour la disponibilité : {val}."
        else:
            ack = acknowledge(val, "availability")
        slots.availability = val
        _apply_bundle(slots, extract_bundled_slots(user_text, slots))
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job)
        reply = f"{ack} {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "hours":
        # Candidate correcting availability instead of answering hours
        av = extract_availability_value(user_text)
        if (
            av
            and not official_hours_match(user_text)
            and not mentions_custom_hours(user_text)
            and any(w in user_text.lower() for w in ("disponible", "dispo", "commencer", "semaine", "mois", "lundi", "mardi", "mercredi", "en fait"))
        ):
            if slots.availability and slots.availability != av:
                slots.contradictions.append(f"availability: « {slots.availability} » → « {av} »")
            slots.availability = av
            q = stage_question("hours", job)
            reply = f"D'accord, je mets à jour la disponibilité ({av}). {q}"
            slots.last_question = q
            return reply, "hours", False, slots
        if hours_need_alignment(user_text) and slots.followups.get("hours", 0) < MAX_FOLLOWUPS_PER_STAGE:
            slots.followups["hours"] = slots.followups.get("hours", 0) + 1
            slots.hours_pending_align = True
            q = stage_question("hours", job, variant="align")
            reply = f"{acknowledge(user_text, 'hours')} {q}"
            slots.last_question = q
            return reply, "hours", False, slots
        val = extract_hours_value(user_text) or user_text
        if slots.accepted_hours and slots.accepted_hours != val:
            slots.contradictions.append(f"accepted_hours: « {slots.accepted_hours} » → « {val} »")
        slots.accepted_hours = val
        slots.hours_pending_align = False
        _apply_bundle(slots, extract_bundled_slots(user_text, slots))
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job)
        reply = f"{acknowledge(user_text, 'hours')} {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "salary":
        slots.salary_expectations = extract_salary_value(user_text) or user_text
        _apply_bundle(slots, extract_bundled_slots(user_text, slots))
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job)
        reply = f"{acknowledge(user_text, 'salary')} {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "questions":
        low = user_text.lower()
        topic_q = detect_job_topic(user_text)
        if topic_q and looks_like_question(user_text):
            slots.candidate_questions.append(user_text)
            fact = answer_job_topic(topic_q, job)
            reply = f"{fact} Avez-vous une autre question, ou puis-je clôturer l'entretien ?"
            slots.last_question = reply
            return reply, "questions", False, slots
        if any(p in low for p in ("pas de question", "aucune", "non", "c'est bon", "cest bon", "rien", "tout est clair")):
            slots._questions_done = True  # type: ignore[attr-defined]
            reply = stage_question("closing", job)
            return reply, "closing", True, slots
        slots.candidate_questions.append(user_text)
        slots._questions_done = True  # type: ignore[attr-defined]
        reply = stage_question("closing", job)
        return reply, "closing", True, slots

    if stage == "closing":
        reply = stage_question("closing", job)
        return reply, "closing", True, slots

    q = stage_question(_next_open_stage(slots), job)
    return q, _next_open_stage(slots), False, slots


def looks_off_topic(reply: str) -> bool:
    low = reply.lower()
    banned = ("bonheur", "blague", "rire", "je m'appelle camille et j'ai", "mon cv")
    if any(b in low for b in banned):
        return True
    if low.startswith("j'ai ") and "?" not in reply:
        return True
    if low.startswith(("question :", "réponse :", "reponse :")):
        return True
    return False


def naturalize_prompt(stage: str, scripted: str, job: dict[str, Any], history: list) -> list[dict]:
    system = (
        "Tu es Camille, IA de recrutement. Reformule UNIQUEMENT le message imposé en français parlé, naturel et court. "
        "Garde TOUS les faits (salaire, horaires, dates, tâches, nom d'agence, ville). "
        "Ne reprends JAMAIS une ancienne question de l'historique. "
        "Ne redemande PAS si le candidat est prêt à commencer l'entretien sauf si le message imposé le demande. "
        "Une seule question max. Pas de préfixe 'Question :' ni 'Réponse :'. "
        "N'invente rien. Pas de décision d'embauche. Pas de <think>."
    )
    # Do not feed prior assistant lines — they bias tiny models into repeating the intro.
    recent_user = [h for h in history if h.get("role") == "user"][-2:]
    msgs: list[dict] = [{"role": "system", "content": system}]
    for h in recent_user:
        msgs.append({"role": "user", "content": f"(Dernière déclaration candidat, ne pas reformuler) {str(h['content'])[:300]}"})
    msgs.append(
        {
            "role": "user",
            "content": (
                f"Étape actuelle={stage}. Reformule exactement ce message sans en changer le sujet :\n« {scripted} »"
            ),
        }
    )
    return msgs


def process_turn(
    history: list[dict],
    job: dict[str, Any] | None = None,
    *,
    demo: bool = False,
) -> TurnResult:
    job = job or load_job()

    if not history:
        line = stage_question("intro", job)
        slots = InterviewSlots(last_question=line)
        return TurnResult(
            reply=line,
            stage="intro",
            done=False,
            slots=slots,
            mode_hint="scripted" if demo else "naturalize",
            intent="ANSWER",
            progress_turn=0,
        )

    # State before last user message
    if history[-1].get("role") == "user":
        pre_hist = history[:-1]
        user_text = str(history[-1].get("content", "")).strip()
    else:
        pre_hist = history
        user_text = ""

    stage, slots, user_turns = replay_state(pre_hist)
    # Carry last assistant question
    for h in reversed(pre_hist):
        if h.get("role") == "assistant":
            slots.last_question = str(h.get("content", ""))
            break

    if user_turns >= MAX_USER_TURNS and stage != "closing":
        reply = stage_question("closing", job)
        return TurnResult(
            reply=reply,
            stage="closing",
            done=True,
            slots=slots,
            mode_hint="scripted",
            intent="END_INTERVIEW",
            progress_turn=user_turns,
        )

    if not user_text:
        q = stage_question(stage if stage != "intro" else "experience", job)
        return TurnResult(
            reply=q,
            stage=stage,
            done=stage == "closing",
            slots=slots,
            mode_hint="scripted" if demo else "naturalize",
            progress_turn=user_turns,
        )

    intent, topic = detect_intent(user_text, stage, slots)
    reply, new_stage, done, slots = compose_reply(
        intent=intent,
        topic=topic,
        stage=stage,
        slots=slots,
        user_text=user_text,
        job=job,
    )
    reply = strip_roleplay_prefixes(reply)

    # Finalize missing on close
    if done or new_stage == "closing":
        for st, attr, label in (
            ("experience", "experience", "expérience"),
            ("availability", "availability", "disponibilité"),
            ("hours", "accepted_hours", "horaires acceptés"),
            ("salary", "salary_expectations", "attentes salariales"),
        ):
            if not getattr(slots, attr) and label not in slots.missing:
                slots.missing.append(label)

    return TurnResult(
        reply=reply,
        stage=new_stage,
        done=done,
        slots=slots,
        mode_hint="scripted" if demo else "naturalize",
        intent=intent,
        interrupted=intent == "QUESTION_ABOUT_JOB",
        progress_turn=user_turns + 1,
    )


# Back-compat aliases used by older tests / server
def scripted_line(stage: str, job: dict[str, Any], *, reask: bool = False) -> str:
    return stage_question(stage, job, variant="reask" if reask else "default")


def detect_interruption(text: str, current_stage: str) -> str | None:
    intent, topic = detect_intent(text, current_stage, InterviewSlots())
    if intent == "QUESTION_ABOUT_JOB":
        return topic
    return None


def reconstruct_state(history: list[dict]) -> tuple[str, InterviewSlots, int]:
    return replay_state(history)


def build_report(history: list[dict], job: dict[str, Any] | None = None) -> dict[str, Any]:
    job = job or load_job()
    stage, slots, user_turns = replay_state(history)
    for attr, label in (
        ("experience", "expérience"),
        ("availability", "disponibilité"),
        ("accepted_hours", "horaires acceptés"),
        ("salary_expectations", "attentes salariales"),
    ):
        if not getattr(slots, attr) and label not in slots.missing:
            slots.missing.append(label)

    user_msgs = [str(h.get("content", "")).strip() for h in history if h.get("role") == "user"]
    name = None
    name_m = re.search(
        r"(?:je m'appelle|je suis|mon nom est)\s+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][\wÀ-ÿ'-]+)",
        "\n".join(user_msgs),
        flags=re.I,
    )
    if name_m:
        candidate = name_m.group(1)
        if candidate.lower() not in {
            "disponible", "débutant", "debutant", "débutante", "prêt", "prete", "prête",
        }:
            name = candidate

    facts = []
    if slots.experience:
        facts.append(f"Expérience déclarée : {slots.experience}")
    if slots.availability:
        facts.append(f"Disponibilité déclarée : {slots.availability}")
    if slots.accepted_hours:
        facts.append(f"Horaires acceptés : {slots.accepted_hours}")
    if slots.salary_expectations:
        facts.append(f"Attentes salariales : {slots.salary_expectations}")
    if slots.candidate_questions:
        facts.append(f"Questions posées par le candidat : {'; '.join(slots.candidate_questions)}")
    if slots.contradictions:
        facts.append(f"Informations mises à jour / contradictoires : {'; '.join(slots.contradictions)}")
    if slots.missing:
        facts.append(f"Informations manquantes : {', '.join(slots.missing)}")
    if not facts:
        facts.append("Aucune information structurée collectée.")

    return {
        "prototype": True,
        "consent_for_real_use": False,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "interview_date": datetime.now(timezone.utc).date().isoformat(),
        "agency": job["agency"],
        "target_job": job["job_title"],
        "location": job["location"],
        "start_date": job["start_date"],
        "start_date_fr": job["start_date_fr"],
        "job_facts_used": {
            "contract": job["contract"],
            "salary_note": job["salary_note"],
            "working_hours": job["working_hours"],
            "tasks": job["tasks"],
            "experience_policy": job["experience"],
        },
        "candidate_name": name,
        "experience": slots.experience,
        "availability": slots.availability,
        "accepted_working_hours": slots.accepted_hours,
        "salary_expectations": slots.salary_expectations,
        "questions_asked_by_candidate": list(slots.candidate_questions),
        "missing_information": list(slots.missing),
        "contradictions": list(slots.contradictions),
        "last_stage": stage,
        "user_turns": user_turns,
        "neutral_summary": " ".join(facts),
        "history": history,
        "scoring": None,
        "ranking": None,
        "hiring_recommendation": None,
    }
