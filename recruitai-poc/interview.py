"""Conversational interview engine for RecruitAI (stdlib only).

Architecture (separated concerns):
1. Intent detection — what the candidate is doing this turn
2. Information extraction — slots with raw + normalized values (contextual)
3. Interview state / memory — what we already know and the next goal
4. Response generation — natural French templates (+ optional LLM polish)

The stage list guides the conversation; it does not dictate every sentence.
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

# Words that look like names but are NOT names after "je suis"
_NOT_NAMES = frozenset(
    {
        "prêt", "prete", "prête", "pret", "disponible", "dispo", "débutant", "debutant",
        "débutante", "debutante", "motivé", "motive", "motivée", "curieux", "curieuse",
        "intéressé", "interesse", "intéressée", "ok", "d'accord", "daccord", "là", "la",
        "ici", "prêt(e)", "apte", "capable", "libre", "occupé", "occupe",
    }
)

_TIME_CUES = (
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "semaine", "mois", "immédiat", "immediat", "maintenant", "maintennat", "disponible",
    "dispo", "après", "apres", "demain", "dès", "des que", "dès que",
    "janvier", "février", "fevrier", "mars", "avril", "mai", "juin",
    "juillet", "août", "aout", "septembre", "octobre", "novembre", "décembre", "decembre",
    "202", "pas disponible", "indisponible",
)

_TASK_CUES = (
    "prépar", "prepar", "emball", "picking", "packing", "charg", "décharg", "decharg",
    "tri", "colis", "quai", "manutention", "inventaire", "réception", "reception",
    "salle", "service", "cuisine", "caisse", "bar",
)

_COMPANY_CUES = (
    "chez ", "amazon", "carrefour", "fnac", "entrepôt", "entrepot",
    "hôtel", "hotel", "magasin",
)

_RESTAURANT_CUES = ("restaurant", "restauration", "salle", "service", "cuisine", "barman", "serve")


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
    t = text.strip()
    t = re.sub(r"^(?:question|réponse|reponse|camille|assistant)\s*:\s*", "", t, flags=re.I)
    t = re.sub(r"\n\s*(?:question|réponse|reponse)\s*:\s*", "\n", t, flags=re.I)
    return t.strip()


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
    if re.search(r"\b(d[eé]but|commencer|date\s+de\s+prise|lundi\s+prochain)", low) and "?" in text:
        return "start"
    if re.search(r"\b(o[uù]|localisation|adresse|lyon)\b", low) and looks_like_question(text):
        return "location"
    return None


_CLARIFY = re.compile(
    r"(?i)\b("
    r"comment\s+ça|comment\s+ca|je\s+ne\s+comprends?\s+pas|j[' ]comprends?\s+pas|"
    r"vous\s+pouvez\s+r[eé]p[eé]ter|peux[- ]tu\s+r[eé]p[eé]ter|r[eé]p[eé]tez|"
    r"c[' ]est[- ][àa]\s+dire|qu[' ]est[- ]ce\s+que\s+vous\s+voulez\s+dire"
    r")\b|^quoi\s*\?$|^comment\s*\?$|^hein\s*\?$"
)
_END = re.compile(
    r"(?i)\b(au\s+revoir|terminons|on\s+arr[eê]te|fin\s+de\s+l[' ]entretien|"
    r"j[' ]ai\s+fini|je\s+dois\s+y\s+aller|stop\s+l[' ]entretien)\b"
)
_OFF = re.compile(r"(?i)\b(m[eé]t[eé]o|foot|football|blague|recette|film|s[eé]rie)\b")


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


def is_ready_affirmation(text: str) -> bool:
    low = re.sub(r"\s+", " ", text.lower().strip()).rstrip(".!,;")
    # strip leading yes/oui noise from STT
    low = re.sub(r"^(yes|oui|ok)[, ]+", "", low)
    ready_exact = {
        "oui", "ok", "okay", "d'accord", "daccord", "yes", "je suis prêt", "je suis prete",
        "je suis prête", "je suis pret", "prêt", "prete", "prête", "pret",
        "allons-y", "allons y", "on y va", "c'est parti", "je veux bien",
        "yes je suis pret", "yes je suis prêt", "oui je suis prêt", "oui je suis pret",
    }
    if low in ready_exact:
        return True
    if re.fullmatch(
        r"(oui|yes)[, ]*(je\s+suis\s+)?pr[eê]t[e]?",
        low,
    ):
        return True
    if re.fullmatch(
        r"(oui[, ]*|yes[, ]*)?(je\s+suis\s+)?pr[eê]t[e]?(\s+à\s+commencer(\s+(cet\s+)?entretien|\s+l['’]entretien)?)?",
        low,
    ):
        return True
    return False


def _vague_only(text: str) -> bool:
    low = text.lower().strip().rstrip(".!")
    return low in {
        "oui", "non", "ok", "okay", "d'accord", "daccord", "euh", "hmm", "bof", "yes",
        "peut-être", "peut etre", "je ne sais pas", "je sais pas", "...", "mh", "bah",
    } or len(text.split()) < 2


# --- Memory ---

@dataclass
class InterviewSlots:
    """Compact structured memory (raw statements + normalized values)."""

    experience: str | None = None
    experience_normalized: str | None = None
    experience_sector: str | None = None  # restauration | logistique | autre | debutant
    experience_tasks: str | None = None
    has_logistics: bool | None = None
    pending_exp_followup: bool = False

    availability: str | None = None
    availability_normalized: str | None = None

    accepted_hours: str | None = None
    hours_normalized: str | None = None
    hours_pending_align: bool = False

    salary_expectations: str | None = None
    candidate_name: str | None = None
    candidate_questions: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    reasks: dict[str, int] = field(default_factory=dict)
    followups: dict[str, int] = field(default_factory=dict)
    last_question: str = ""
    last_goal: str = ""
    contradictions: list[str] = field(default_factory=list)
    unanswered: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "experience": self.experience,
            "experience_normalized": self.experience_normalized,
            "experience_sector": self.experience_sector,
            "experience_tasks": self.experience_tasks,
            "has_logistics": self.has_logistics,
            "availability": self.availability,
            "availability_normalized": self.availability_normalized,
            "accepted_hours": self.accepted_hours,
            "hours_normalized": self.hours_normalized,
            "salary_expectations": self.salary_expectations,
            "candidate_name": self.candidate_name,
            "candidate_questions": list(self.candidate_questions),
            "missing_information": list(self.missing),
            "contradictions": list(self.contradictions),
            "pending_exp_followup": self.pending_exp_followup,
        }

    def memory_brief(self) -> str:
        parts = []
        if self.candidate_name:
            parts.append(f"Nom: {self.candidate_name}")
        if self.experience_normalized or self.experience:
            parts.append(f"Expérience: {self.experience_normalized or self.experience}")
        if self.experience_tasks:
            parts.append(f"Tâches: {self.experience_tasks}")
        if self.availability_normalized or self.availability:
            parts.append(f"Disponibilité: {self.availability_normalized or self.availability}")
        if self.hours_normalized or self.accepted_hours:
            parts.append(f"Horaires: {self.hours_normalized or self.accepted_hours}")
        if self.salary_expectations:
            parts.append(f"Salaire: {self.salary_expectations}")
        if self.candidate_questions:
            parts.append(f"Questions candidat: {'; '.join(self.candidate_questions[-3:])}")
        return " | ".join(parts) if parts else "(aucune info encore)"

    def filled(self, stage: str) -> bool:
        if stage == "experience":
            return self.experience is not None and not self.pending_exp_followup
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
    goal: str = ""


# --- Extraction ---

def extract_candidate_name(text: str) -> str | None:
    """Only extract an explicit name with confidence; never 'prêt'."""
    # Prefer explicit name phrases
    for pat in (
        r"(?i)(?:je m'appelle|mon nom est|je me nomme)\s+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][\wÀ-ÿ'-]{1,30})",
        r"(?i)(?:je m'appelle|mon nom est|je me nomme)\s+([a-zàâäéèêëîïôöùûüç][\wÀ-ÿ'-]{1,30})",
    ):
        m = re.search(pat, text)
        if m:
            name = m.group(1)
            if name.lower().rstrip("e") not in {n.rstrip("e") for n in _NOT_NAMES} and name.lower() not in _NOT_NAMES:
                return name[0].upper() + name[1:]
    # "Je suis Raphaël" only if capitalized proper-looking token AND not a status word
    m = re.search(
        r"(?i)je suis\s+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][\wÀ-ÿ'-]{2,30})\b",
        text,
    )
    if m:
        name = m.group(1)
        if name.lower() not in _NOT_NAMES and not is_ready_affirmation(name):
            # Reject if followed by adjective-like continuation without name intent
            return name
    return None


def normalize_availability(text: str, job: dict[str, Any]) -> tuple[str, str] | None:
    """Return (raw, normalized) or None."""
    low = text.lower()
    if not any(c in low for c in _TIME_CUES + ("mainten", "tout de suite", "asap")):
        if not re.search(r"dispo|disponible|commencer|partir", low):
            return None
    raw = text.strip()
    if any(w in low for w in ("maintenant", "maintennat", "immédiat", "immediat", "tout de suite", "asap", "de suite")):
        return raw, f"immédiatement (fiche: début {job['start_date_fr']})"
    if "semaine prochaine" in low:
        return raw, "semaine prochaine"
    if "dans un mois" in low or "un mois" in low:
        return raw, "dans un mois"
    # weekday mention
    for day in ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"):
        if day in low:
            return raw, f"à partir de {day}"
    if "disponible" in low or "dispo" in low or "commencer" in low:
        return raw, raw
    return None


def resolve_hours_choice(text: str, job: dict[str, Any], last_question: str = "") -> tuple[str, str] | None:
    """
    Contextual hours resolution relative to the two official slots.
    Returns (raw_or_label, normalized_official_value).
    """
    slots = list(job["working_hours"])
    first, second = slots[0], slots[1]
    low = text.lower().replace("–", "-").replace("—", "-")
    qlow = (last_question or "").lower()

    # Explicit rejection
    if re.search(r"\baucun(e)?\b|ni l'un|ni lun|aucun des deux", low):
        return text.strip(), "aucun des deux créneaux proposés"

    # Both / indifferent
    if any(
        p in low
        for p in (
            "les deux", "deux créneaux", "deux creneaux", "indifférent", "indifferent",
            "peu importe", "n'importe", "nimporte", "tous", "les 2",
        )
    ):
        return text.strip(), f"les deux ({first} ou {second})"

    # Ordinal / relative to last question offering two options
    first_cues = (
        "premier", "1er", "1er créneau", "celui du matin", "plutôt le matin", "plutot le matin",
        "le matin", "matin", "celui de 6", "de 6h", "6h", "6:00", "06h", "06:00", "6 h",
    )
    second_cues = (
        "deuxième", "deuxieme", "2e", "2ème", "second", "celui de l'après", "apres-midi",
        "après-midi", "apres midi", "après midi", "soir", "13h", "13:00", "20h", "20:00",
        "celui de 13", "plutôt l'après", "plutot l'apres",
    )

    # "le premier" / "celui du matin"
    if any(c in low for c in first_cues) and not any(c in low for c in ("deuxième", "deuxieme", "13h", "20h", "soir")):
        return text.strip(), first
    if any(c in low for c in second_cues):
        return text.strip(), second

    # Bare "le premier" / "le second"
    if re.search(r"\ble\s+premier\b|\bcélui[- ]là\b|\bcelui[- ]la\b|\ble\s+1\b", low):
        return text.strip(), first
    if re.search(r"\ble\s+deuxième\b|\ble\s+second\b|\ble\s+2\b", low):
        return text.strip(), second

    # If last question listed both windows and answer is very short ordinal
    if ("6:00" in qlow or "6h" in qlow) and ("13:00" in qlow or "20:00" in qlow or "13h" in qlow):
        if low.strip().rstrip(".!") in {"le premier", "premier", "le 1", "1", "matin"}:
            return text.strip(), first
        if low.strip().rstrip(".!") in {"le deuxième", "le deuxieme", "deuxième", "deuxieme", "le second", "2", "soir"}:
            return text.strip(), second

    # Direct match on official strings
    compact = low.replace(" ", "")
    if "6:00" in compact or "6h-13" in compact or "6h13" in compact or "6h–13" in text.lower().replace(" ", ""):
        return text.strip(), first
    if "13:00" in compact or "13h-20" in compact or "13h20" in compact:
        return text.strip(), second

    if mentions_custom_hours(text) and not official_hours_match(text):
        return None  # needs alignment — handled elsewhere
    if official_hours_match(text):
        if any(c in low for c in first_cues):
            return text.strip(), first
        if any(c in low for c in second_cues):
            return text.strip(), second
        return text.strip(), text.strip()
    return None


def mentions_custom_hours(text: str) -> bool:
    low = text.lower()
    return bool(re.search(r"\b\d{1,2}\s*h(?:eurs?)?\b|\b\d{1,2}:\d{2}\b|\bpause\b", low))


def official_hours_match(text: str) -> bool:
    low = text.lower().replace(" ", "")
    if "lesdeux" in low or ("deux" in text.lower() and "créneau" in text.lower()):
        return True
    if "indifférent" in text.lower() or "indifferent" in text.lower() or "peuimporte" in low:
        return True
    if any(x in low for x in ("6:00", "6h", "06h", "6h00", "06:00")) and any(
        x in low for x in ("13", "13h", "13:00")
    ):
        return True
    if "matin" in text.lower() and "après" not in text.lower() and "apres" not in text.lower():
        return True
    if any(x in low for x in ("13:00", "13h", "13h00")) and any(x in low for x in ("20", "20h", "20:00")):
        return True
    if "après-midi" in text.lower() or "apres-midi" in text.lower() or "soir" in text.lower():
        return True
    if "les deux" in text.lower() or "tous" in text.lower():
        return True
    if any(c in text.lower() for c in ("premier", "deuxième", "deuxieme", "second", "matin")):
        return True
    return False


def extract_hours_value(text: str, job: dict[str, Any] | None = None, last_question: str = "") -> str | None:
    job = job or load_job()
    resolved = resolve_hours_choice(text, job, last_question)
    if resolved:
        return resolved[1]
    if official_hours_match(text) or mentions_custom_hours(text):
        return text.strip()
    low = text.lower()
    if any(w in low for w in ("accepte", "ok pour", "ça me va", "ca me va", "convient")):
        return text.strip()
    return None


def hours_need_alignment(text: str) -> bool:
    if resolve_hours_choice(text, load_job(), ""):
        # If we could map to official, no align needed unless custom-only
        if mentions_custom_hours(text) and not any(
            c in text.lower() for c in ("premier", "matin", "6h", "6:00", "13h", "20h", "les deux", "soir")
        ):
            # e.g. "10h à 15h" — custom
            if not official_hours_match(text):
                return True
        return False
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
            "ça marche", "ca marche",
        )
    ) or len(text.split()) >= 2:
        return text.strip()
    return None


def analyze_experience(text: str) -> dict[str, Any]:
    """Extract experience facts without inventing logistics skills."""
    low = text.lower()
    out: dict[str, Any] = {
        "raw": text.strip(),
        "normalized": None,
        "sector": None,
        "has_logistics": None,
        "tasks": None,
        "needs_followup": False,
        "is_beginner": False,
    }
    has_rest = any(c in low for c in _RESTAURANT_CUES)
    denies_logistics = bool(
        re.search(
            r"(?i)(jamais|pas|aucune?).{0,40}(logistique|manutention|entrep[oô]t)|"
            r"(débutant|debutant)",
            low,
        )
    ) and not has_rest and not any(c in low for c in _TASK_CUES + _COMPANY_CUES)

    # Explicit beginner / no logistics — no task follow-up
    if denies_logistics or (
        any(b in low for b in ("débutant", "debutant", "jamais travaill", "pas d'expérience", "pas d'experience", "aucune expérience", "aucune experience"))
        and not has_rest
        and not any(c in low for c in _TASK_CUES + _COMPANY_CUES)
    ):
        out["is_beginner"] = True
        out["has_logistics"] = False
        out["sector"] = "debutant"
        out["normalized"] = "débutant / pas d'expérience logistique déclarée"
        out["needs_followup"] = False
        return out

    # "jamais ... logistique" but other sector mentioned (e.g. restauration) → handled below
    if "jamais" in low and any(s in low for s in ("logistique", "manutention", "entrepôt", "entrepot")) and not has_rest:
        out["is_beginner"] = True
        out["has_logistics"] = False
        out["sector"] = "debutant"
        out["normalized"] = "débutant / pas d'expérience logistique déclarée"
        out["needs_followup"] = False
        return out

    has_log = any(c in low for c in ("logistique", "manutention", "entrepôt", "entrepot", "quai", "colis", "picking"))
    if "jamais" in low and ("logistique" in low or "manutention" in low or "entrepôt" in low or "entrepot" in low):
        out["has_logistics"] = False
    elif has_log:
        out["has_logistics"] = True

    if has_rest:
        out["sector"] = "restauration"
        if out["has_logistics"] is False:
            out["normalized"] = "expérience en restauration, sans expérience logistique déclarée"
        else:
            out["normalized"] = "expérience en restauration"
        # follow-up unless concrete tasks already present
        if not any(c in low for c in ("salle", "service", "cuisine", "caisse", "bar", "prépar", "plat")):
            out["needs_followup"] = True
        else:
            out["tasks"] = text.strip()
            out["needs_followup"] = False
    elif has_log and out["has_logistics"] is not False:
        out["sector"] = "logistique"
        out["normalized"] = "expérience en logistique / manutention"
        if not any(c in low for c in _TASK_CUES):
            out["needs_followup"] = True
        else:
            out["tasks"] = text.strip()
    elif any(c in low for c in _COMPANY_CUES) or (
        ("travaill" in low or "expérience" in low or "experience" in low)
        and not denies_logistics
    ):
        out["sector"] = "autre"
        out["normalized"] = text.strip()
        if not any(c in low for c in _TASK_CUES):
            out["needs_followup"] = True

    if out["normalized"] is None and text.strip():
        out["normalized"] = text.strip()
    return out


def experience_needs_followup(text: str, slots: InterviewSlots) -> bool:
    if slots.followups.get("experience", 0) >= MAX_FOLLOWUPS_PER_STAGE:
        return False
    info = analyze_experience(text)
    if info["is_beginner"] and not info["needs_followup"]:
        return False
    if info["sector"] == "restauration" and info["needs_followup"]:
        return True
    if info["has_logistics"] and info["needs_followup"]:
        return True
    # classic: company/duration without tasks
    low = text.lower()
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
    if info["is_beginner"]:
        return False
    return bool(has_yes_exp and not has_tasks and info["sector"] != "debutant")


def experience_sufficient(text: str, slots: InterviewSlots) -> bool:
    info = analyze_experience(text)
    if info["is_beginner"]:
        return True
    if info["tasks"] or any(c in text.lower() for c in _TASK_CUES):
        return True
    if slots.followups.get("experience", 0) >= 1 and len(text.split()) >= 3:
        return True
    return False


def extract_bundled_slots(text: str, slots: InterviewSlots, job: dict[str, Any] | None = None) -> dict[str, str]:
    job = job or load_job()
    found: dict[str, str] = {}
    low = text.lower()
    asking = looks_like_question(text)

    av = normalize_availability(text, job)
    if av and any(c in low for c in _TIME_CUES + ("dispo", "disponible", "commencer", "mainten")):
        found["availability"] = av[0]
        found["availability_normalized"] = av[1]

    hv = resolve_hours_choice(text, job, slots.last_question)
    if hv and not asking:
        found["accepted_hours"] = hv[1]
        found["hours_normalized"] = hv[1]

    if not asking and any(
        w in low
        for w in (
            "salaire me va", "ça me va", "ca me va", "accepte le salaire",
            "pour le salaire oui", "oui pour le salaire", "le salaire aussi",
        )
    ):
        found["salary_expectations"] = text.strip()

    info = analyze_experience(text)
    if info["sector"] or info["is_beginner"] or info["has_logistics"] is not None:
        if any(c in low for c in _TASK_CUES + _COMPANY_CUES + _RESTAURANT_CUES + ("expérience", "experience", "débutant", "debutant", "jamais", "travaill")):
            found["experience"] = text.strip()

    name = extract_candidate_name(text)
    if name:
        found["candidate_name"] = name
    return found


def _apply_bundle(slots: InterviewSlots, found: dict[str, str], job: dict[str, Any] | None = None) -> None:
    job = job or load_job()
    if "candidate_name" in found and not slots.candidate_name:
        slots.candidate_name = found["candidate_name"]
    if "experience" in found:
        info = analyze_experience(found["experience"])
        prev = slots.experience
        val = found["experience"]
        if prev and val and val not in prev and prev not in val and prev != "(non précisé)":
            slots.experience = f"{prev} — {val}"
        elif not prev or prev == "(non précisé)":
            slots.experience = val
        if info["normalized"]:
            slots.experience_normalized = info["normalized"]
        if info["sector"]:
            slots.experience_sector = info["sector"]
        if info["has_logistics"] is not None:
            slots.has_logistics = info["has_logistics"]
        if info["tasks"]:
            slots.experience_tasks = info["tasks"]
        if info["needs_followup"] and slots.followups.get("experience", 0) < MAX_FOLLOWUPS_PER_STAGE:
            slots.pending_exp_followup = True
        elif info["tasks"] or info["is_beginner"]:
            slots.pending_exp_followup = False
        if "expérience" in slots.missing and slots.experience and slots.experience != "(non précisé)":
            slots.missing = [m for m in slots.missing if m != "expérience"]
    if "availability" in found:
        prev = slots.availability
        val = found["availability"]
        if prev and prev != val:
            slots.contradictions.append(f"availability: « {prev} » → « {val} »")
        slots.availability = val
        if "availability_normalized" in found:
            slots.availability_normalized = found["availability_normalized"]
        else:
            norm = normalize_availability(val, job)
            if norm:
                slots.availability_normalized = norm[1]
    if "accepted_hours" in found:
        prev = slots.accepted_hours
        val = found["accepted_hours"]
        if prev and prev != val:
            slots.contradictions.append(f"accepted_hours: « {prev} » → « {val} »")
        slots.accepted_hours = val
        slots.hours_normalized = found.get("hours_normalized", val)
        slots.hours_pending_align = False
    if "salary_expectations" in found:
        slots.salary_expectations = found["salary_expectations"]


def _next_open_stage(slots: InterviewSlots) -> str:
    if slots.experience is None or slots.pending_exp_followup:
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


# --- Stage questions ---

def stage_question(stage: str, job: dict[str, Any], *, variant: str = "default", slots: InterviewSlots | None = None) -> str:
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
            if slots and slots.experience_sector == "restauration":
                return "En restauration, vous faisiez quoi exactement au quotidien ?"
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


def react(stage: str, user_text: str, slots: InterviewSlots, job: dict[str, Any]) -> str:
    """Natural short reaction — never echoes the full candidate sentence."""
    low = user_text.lower()
    if stage == "intro":
        return "Parfait, on y va."
    if stage == "experience":
        if slots.experience_sector == "restauration" or any(c in low for c in _RESTAURANT_CUES):
            if slots.pending_exp_followup:
                return "D'accord. La restauration demande souvent de tenir un rythme soutenu."
            return "Je vois, merci pour ces précisions."
        if slots.has_logistics is False or any(b in low for b in ("débutant", "debutant", "jamais")):
            return "Très bien, ce n'est pas un frein pour ce poste."
        if "amazon" in low or "manutention" in low or "logistique" in low:
            return "D'accord, c'est utile pour ce type de mission."
        return "D'accord."
    if stage == "availability":
        if slots.availability_normalized and "immédiat" in (slots.availability_normalized or ""):
            return "Très bien, une disponibilité immédiate, c'est noté."
        return "D'accord, c'est noté pour la disponibilité."
    if stage == "hours":
        if slots.hours_pending_align:
            return "Je comprends votre préférence."
        if slots.hours_normalized:
            return "Très bien."
        return "D'accord."
    if stage == "salary":
        if any(w in low for w in ("non", "trop bas", "insuffisant")):
            return "Je comprends votre point de vue sur la rémunération."
        return "Très bien."
    if stage == "questions":
        return "Bien sûr."
    return "D'accord."


# --- Intent ---

def detect_intent(text: str, stage: str, slots: InterviewSlots) -> tuple[Intent, str | None]:
    raw = text.strip()
    if not raw:
        return "INCOMPLETE_ANSWER", None
    if _END.search(raw):
        return "END_INTERVIEW", None
    if _CLARIFY.search(raw):
        topic = detect_job_topic(raw)
        if topic and ("salaire" in raw.lower() or "horaire" in raw.lower() or "tâche" in raw.lower()):
            return "QUESTION_ABOUT_JOB", topic
        return "CLARIFICATION_REQUEST", None

    topic = detect_job_topic(raw)
    if topic and looks_like_question(raw):
        return "QUESTION_ABOUT_JOB", topic
    low_full = raw.lower()
    if topic == "salary" and any(w in low_full for w in ("combien", "c'est combien", "quel salaire")):
        return "QUESTION_ABOUT_JOB", topic

    if _OFF.search(raw) and not any(
        k in raw.lower() for k in ("disponible", "horaire", "salaire", "expérience", "experience", "entrepôt", "restaurant")
    ):
        return "OFF_TOPIC", None

    if stage == "intro":
        return "ANSWER", None

    if stage == "experience":
        if slots.pending_exp_followup:
            if len(raw.split()) >= 3 or any(c in raw.lower() for c in _TASK_CUES):
                return "ANSWER", None
            if _vague_only(raw) or is_ready_affirmation(raw):
                return "INCOMPLETE_ANSWER", None
            return "ANSWER", None
        if is_ready_affirmation(raw):
            return "INCOMPLETE_ANSWER", None
        if experience_sufficient(raw, slots) or experience_needs_followup(raw, slots):
            return "ANSWER", None
        info = analyze_experience(raw)
        if info["sector"] or info["is_beginner"] or info["has_logistics"] is not None:
            return "ANSWER", None
        if _vague_only(raw):
            return "INCOMPLETE_ANSWER", None
        if len(raw.split()) >= 2:
            return "ANSWER", None
        return "INCOMPLETE_ANSWER", None

    if stage == "availability":
        if is_ready_affirmation(raw):
            dateish = any(
                c in raw.lower()
                for c in (
                    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "immédiat", "immediat",
                    "semaine", "mois", "maintenant", "maintennat", "202", "demain",
                )
            )
            if not dateish:
                return "INCOMPLETE_ANSWER", None
        if normalize_availability(raw, load_job()):
            return "ANSWER", None
        if _vague_only(raw):
            return "INCOMPLETE_ANSWER", None
        return "INCOMPLETE_ANSWER", None

    if stage == "hours":
        if resolve_hours_choice(raw, load_job(), slots.last_question) or extract_hours_value(raw, load_job(), slots.last_question):
            return "ANSWER", None
        if mentions_custom_hours(raw):
            return "ANSWER", None
        if normalize_availability(raw, load_job()) and any(
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


# --- Compose ---

def compose_reply(
    *,
    intent: Intent,
    topic: str | None,
    stage: str,
    slots: InterviewSlots,
    user_text: str,
    job: dict[str, Any],
) -> tuple[str, str, bool, InterviewSlots]:
    done = False

    if intent == "END_INTERVIEW":
        reply = stage_question("closing", job)
        return reply, "closing", True, slots

    if intent == "CLARIFICATION_REQUEST":
        clarify = stage_question(
            stage if stage in COLLECT_STAGES else "experience",
            job,
            variant="reask",
            slots=slots,
        )
        reply = f"Bien sûr, je reformule. {clarify}"
        slots.last_question = clarify
        slots.last_goal = stage
        return reply, stage if stage != "intro" else "experience", False, slots

    if intent == "OFF_TOPIC":
        q = stage_question(stage if stage in COLLECT_STAGES else "experience", job, slots=slots)
        reply = f"Je reste concentrée sur l'entretien pour ce poste. {q}"
        slots.last_question = q
        return reply, stage if stage != "intro" else "experience", False, slots

    if intent == "QUESTION_ABOUT_JOB":
        topic = topic or detect_job_topic(user_text) or "duties"
        fact = answer_job_topic(topic, job)
        slots.candidate_questions.append(user_text)
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        if topic == "salary":
            q = "Est-ce que ça correspond à ce que vous recherchez ?"
            reply = f"{fact} {q}"
            slots.last_question = q
            open_stage = stage if stage in COLLECT_STAGES and stage != "intro" else _next_open_stage(slots)
            return reply, open_stage, False, slots
        open_stage = stage if stage in COLLECT_STAGES and not slots.filled(stage) else _next_open_stage(slots)
        if stage == "intro":
            open_stage = _next_open_stage(slots)
        q = stage_question(open_stage, job, slots=slots)
        reply = f"{fact} {q}"
        slots.last_question = q
        return reply, open_stage, False, slots

    if intent == "INCOMPLETE_ANSWER":
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        slots.reasks[stage] = slots.reasks.get(stage, 0) + 1
        if slots.reasks[stage] >= MAX_REASKS_PER_STAGE:
            _mark_missing(slots, stage)
            if stage == "experience" and not slots.experience:
                slots.experience = user_text if not is_ready_affirmation(user_text) else "(non précisé)"
                slots.pending_exp_followup = False
            elif stage == "availability" and not slots.availability:
                slots.availability = user_text if not is_ready_affirmation(user_text) else "(non précisé)"
            next_stage = _next_open_stage(slots)
            if next_stage == stage and stage in COLLECT_STAGES:
                idx = STAGES.index(stage)
                next_stage = STAGES[min(idx + 1, len(STAGES) - 1)]
            if next_stage == "closing":
                return stage_question("closing", job), "closing", True, slots
            q = stage_question(next_stage, job, slots=slots)
            reply = f"Très bien, avançons. {q}"
            slots.last_question = q
            return reply, next_stage, False, slots
        q = stage_question(
            stage if stage in COLLECT_STAGES else "experience",
            job,
            variant="reask",
            slots=slots,
        )
        reply = f"Pour être sûre de bien comprendre : {q}"
        slots.last_question = q
        return reply, stage if stage in COLLECT_STAGES else "experience", False, slots

    # ANSWER
    name = extract_candidate_name(user_text)
    if name:
        slots.candidate_name = name

    if stage == "intro":
        next_stage = "experience"
        q = stage_question(next_stage, job, slots=slots)
        reply = f"{react('intro', user_text, slots, job)} {q}"
        slots.last_question = q
        slots.last_goal = next_stage
        return reply, next_stage, False, slots

    if stage == "experience":
        # Follow-up answer about tasks
        if slots.pending_exp_followup:
            slots.experience_tasks = user_text.strip()
            if slots.experience and user_text not in slots.experience:
                slots.experience = f"{slots.experience} — {user_text.strip()}"
            slots.pending_exp_followup = False
            slots.followups["experience"] = slots.followups.get("experience", 0) + 1
            _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
            next_stage = _next_open_stage(slots)
            q = stage_question(next_stage, job, slots=slots)
            reply = f"{react('experience', user_text, slots, job)} Ici le travail est différent, mais il demande aussi de suivre un rythme. {q}"
            slots.last_question = q
            return reply, next_stage, False, slots

        info = analyze_experience(user_text)
        _apply_bundle(slots, {"experience": user_text, **{k: v for k, v in extract_bundled_slots(user_text, slots, job).items() if k != "experience"}}, job)
        if not slots.experience:
            slots.experience = user_text.strip()
        if info["normalized"]:
            slots.experience_normalized = info["normalized"]
        if info["sector"]:
            slots.experience_sector = info["sector"]
        if info["has_logistics"] is not None:
            slots.has_logistics = info["has_logistics"]

        if experience_needs_followup(user_text, slots) or info["needs_followup"]:
            slots.pending_exp_followup = True
            slots.followups["experience"] = slots.followups.get("experience", 0) + 1
            q = stage_question("experience", job, variant="followup", slots=slots)
            reply = f"{react('experience', user_text, slots, job)} {q}"
            slots.last_question = q
            return reply, "experience", False, slots

        slots.pending_exp_followup = False
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job, slots=slots)
        extra = ""
        if any(c in user_text.lower() for c in ("charg", "tri", "colis", "quai")):
            extra = "Ça se rapproche des missions prévues. "
        reply = f"{react('experience', user_text, slots, job)} {extra}{q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "availability":
        av = normalize_availability(user_text, job)
        raw = av[0] if av else user_text.strip()
        norm = av[1] if av else user_text.strip()
        if slots.availability and slots.availability != raw:
            slots.contradictions.append(f"availability: « {slots.availability} » → « {raw} »")
        slots.availability = raw
        slots.availability_normalized = norm
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job, slots=slots)
        reply = f"{react('availability', user_text, slots, job)} {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "hours":
        # Availability correction mid-hours
        av = normalize_availability(user_text, job)
        if (
            av
            and not resolve_hours_choice(user_text, job, slots.last_question)
            and not mentions_custom_hours(user_text)
            and any(w in user_text.lower() for w in ("disponible", "dispo", "commencer", "semaine", "mois", "en fait"))
        ):
            if slots.availability and slots.availability != av[0]:
                slots.contradictions.append(f"availability: « {slots.availability} » → « {av[0]} »")
            slots.availability = av[0]
            slots.availability_normalized = av[1]
            q = stage_question("hours", job, slots=slots)
            reply = f"D'accord, je mets à jour la disponibilité. {q}"
            slots.last_question = q
            return reply, "hours", False, slots

        resolved = resolve_hours_choice(user_text, job, slots.last_question)
        if hours_need_alignment(user_text) and not resolved and slots.followups.get("hours", 0) < MAX_FOLLOWUPS_PER_STAGE:
            slots.followups["hours"] = slots.followups.get("hours", 0) + 1
            slots.hours_pending_align = True
            q = stage_question("hours", job, variant="align", slots=slots)
            reply = f"{react('hours', user_text, slots, job)} {q}"
            slots.last_question = q
            return reply, "hours", False, slots

        if resolved:
            slots.accepted_hours = resolved[1]
            slots.hours_normalized = resolved[1]
        else:
            val = extract_hours_value(user_text, job, slots.last_question) or user_text.strip()
            slots.accepted_hours = val
            slots.hours_normalized = val
        slots.hours_pending_align = False
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job, slots=slots)
        # Avoid repeating hours question if already filled
        if next_stage == "hours":
            next_stage = _next_open_stage(slots)
            q = stage_question(next_stage, job, slots=slots)
        reply = f"{react('hours', user_text, slots, job)} {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "salary":
        low = user_text.lower()
        # Candidate skips remaining formalities ("non merci, pas d'autre question")
        if any(
            p in low
            for p in (
                "pas d'autre question", "pas de question", "aucune question",
                "c'est tout", "cest tout", "rien d'autre",
            )
        ) or re.search(r"(?i)\bnon merci\b.*\bquestion", low):
            if not slots.salary_expectations:
                slots.salary_expectations = "(non précisé — candidat sans autre question)"
            slots._questions_done = True  # type: ignore[attr-defined]
            return stage_question("closing", job), "closing", True, slots
        slots.salary_expectations = extract_salary_value(user_text) or user_text.strip()
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        next_stage = _next_open_stage(slots)
        q = stage_question(next_stage, job, slots=slots)
        reply = f"{react('salary', user_text, slots, job)} {q}"
        slots.last_question = q
        return reply, next_stage, False, slots

    if stage == "questions":
        topic_q = detect_job_topic(user_text)
        if topic_q and looks_like_question(user_text):
            slots.candidate_questions.append(user_text)
            fact = answer_job_topic(topic_q, job)
            reply = f"{fact} Avez-vous une autre question, ou puis-je clôturer l'entretien ?"
            slots.last_question = reply
            return reply, "questions", False, slots
        if any(p in user_text.lower() for p in ("pas de question", "aucune", "non", "c'est bon", "cest bon", "rien", "tout est clair", "non merci")):
            slots._questions_done = True  # type: ignore[attr-defined]
            return stage_question("closing", job), "closing", True, slots
        slots.candidate_questions.append(user_text)
        slots._questions_done = True  # type: ignore[attr-defined]
        return stage_question("closing", job), "closing", True, slots

    if stage == "closing":
        return stage_question("closing", job), "closing", True, slots

    q = stage_question(_next_open_stage(slots), job, slots=slots)
    return q, _next_open_stage(slots), False, slots


# --- Replay / process ---

def replay_state(history: list[dict]) -> tuple[str, InterviewSlots, int]:
    slots = InterviewSlots()
    stage = "intro"
    user_turns = 0
    job = load_job()
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
            _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
            if stage == "intro":
                stage = _next_open_stage(slots)
            continue
        if intent == "OFF_TOPIC":
            continue
        if intent == "INCOMPLETE_ANSWER":
            _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
            slots.reasks[stage] = slots.reasks.get(stage, 0) + 1
            if slots.reasks[stage] >= MAX_REASKS_PER_STAGE:
                _mark_missing(slots, stage)
                if stage == "experience" and not slots.experience:
                    slots.experience = content if not is_ready_affirmation(content) else "(non précisé)"
                    slots.pending_exp_followup = False
                elif stage == "availability" and not slots.availability:
                    slots.availability = content if not is_ready_affirmation(content) else "(non précisé)"
                elif stage == "questions":
                    slots._questions_done = True  # type: ignore[attr-defined]
                idx = STAGES.index(stage) if stage in STAGES else 1
                nxt = STAGES[min(idx + 1, len(STAGES) - 1)]
                stage = nxt if nxt == "closing" else _next_open_stage(slots)
            continue

        # ANSWER path mirrored
        if stage == "intro":
            stage = "experience"
            continue
        if stage == "experience":
            if slots.pending_exp_followup:
                slots.experience_tasks = content
                if slots.experience and content not in slots.experience:
                    slots.experience = f"{slots.experience} — {content}"
                slots.pending_exp_followup = False
                slots.followups["experience"] = slots.followups.get("experience", 0) + 1
                _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
                stage = _next_open_stage(slots)
                continue
            info = analyze_experience(content)
            _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
            if not slots.experience:
                slots.experience = content
            if experience_needs_followup(content, slots) or info["needs_followup"]:
                slots.pending_exp_followup = True
                slots.followups["experience"] = slots.followups.get("experience", 0) + 1
                continue
            slots.pending_exp_followup = False
            stage = _next_open_stage(slots)
            continue
        if stage == "availability":
            av = normalize_availability(content, job)
            raw = av[0] if av else content
            if slots.availability and slots.availability != raw:
                slots.contradictions.append(f"availability: « {slots.availability} » → « {raw} »")
            slots.availability = raw
            slots.availability_normalized = av[1] if av else content
            _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
            stage = _next_open_stage(slots)
            continue
        if stage == "hours":
            resolved = resolve_hours_choice(content, job, slots.last_question)
            if hours_need_alignment(content) and not resolved and slots.followups.get("hours", 0) < MAX_FOLLOWUPS_PER_STAGE:
                slots.followups["hours"] = slots.followups.get("hours", 0) + 1
                slots.hours_pending_align = True
                continue
            if resolved:
                slots.accepted_hours = resolved[1]
                slots.hours_normalized = resolved[1]
            else:
                slots.accepted_hours = extract_hours_value(content, job, slots.last_question) or content
                slots.hours_normalized = slots.accepted_hours
            slots.hours_pending_align = False
            _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
            stage = _next_open_stage(slots)
            continue
        if stage == "salary":
            low = content.lower()
            if any(
                p in low
                for p in (
                    "pas d'autre question", "pas de question", "aucune question",
                    "c'est tout", "cest tout", "rien d'autre",
                )
            ) or re.search(r"(?i)\bnon merci\b.*\bquestion", low):
                if not slots.salary_expectations:
                    slots.salary_expectations = "(non précisé — candidat sans autre question)"
                slots._questions_done = True  # type: ignore[attr-defined]
                stage = "closing"
                continue
            slots.salary_expectations = extract_salary_value(content) or content
            _apply_bundle(slots, extract_bundled_slots(content, slots, job), job)
            stage = _next_open_stage(slots)
            continue
        if stage == "questions":
            slots._questions_done = True  # type: ignore[attr-defined]
            stage = "closing"
            continue
    return stage, slots, user_turns


def process_turn(
    history: list[dict],
    job: dict[str, Any] | None = None,
    *,
    demo: bool = False,
) -> TurnResult:
    job = job or load_job()

    if not history:
        line = stage_question("intro", job)
        slots = InterviewSlots(last_question=line, last_goal="intro")
        return TurnResult(
            reply=line,
            stage="intro",
            done=False,
            slots=slots,
            mode_hint="scripted" if demo else "generate",
            intent="ANSWER",
            progress_turn=0,
            goal="intro",
        )

    if history[-1].get("role") == "user":
        pre_hist = history[:-1]
        user_text = str(history[-1].get("content", "")).strip()
    else:
        pre_hist = history
        user_text = ""

    stage, slots, user_turns = replay_state(pre_hist)
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
            goal="closing",
        )

    if not user_text:
        q = stage_question(stage if stage != "intro" else "experience", job, slots=slots)
        return TurnResult(
            reply=q,
            stage=stage,
            done=stage == "closing",
            slots=slots,
            mode_hint="scripted" if demo else "generate",
            progress_turn=user_turns,
            goal=stage,
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

    if done or new_stage == "closing":
        for st, attr, label in (
            ("experience", "experience", "expérience"),
            ("availability", "availability", "disponibilité"),
            ("hours", "accepted_hours", "horaires acceptés"),
            ("salary", "salary_expectations", "attentes salariales"),
        ):
            val = getattr(slots, attr)
            if (not val or val == "(non précisé)") and label not in slots.missing:
                slots.missing.append(label)

    return TurnResult(
        reply=reply,
        stage=new_stage,
        done=done,
        slots=slots,
        mode_hint="scripted" if demo else "generate",
        intent=intent,
        interrupted=intent == "QUESTION_ABOUT_JOB",
        progress_turn=user_turns + 1,
        goal=new_stage,
    )


def scripted_line(stage: str, job: dict[str, Any], *, reask: bool = False) -> str:
    return stage_question(stage, job, variant="reask" if reask else "default")


def detect_interruption(text: str, current_stage: str) -> str | None:
    intent, topic = detect_intent(text, current_stage, InterviewSlots())
    if intent == "QUESTION_ABOUT_JOB":
        return topic
    return None


def reconstruct_state(history: list[dict]) -> tuple[str, InterviewSlots, int]:
    return replay_state(history)


def looks_off_topic(reply: str) -> bool:
    low = reply.lower()
    banned = ("bonheur", "blague", "rire", "je m'appelle camille et j'ai", "mon cv", "je retiens que")
    if any(b in low for b in banned):
        return True
    if low.startswith(("question :", "réponse :", "reponse :")):
        return True
    # Reject English chain-of-thought / meta leakage from small instruct models
    if any(
        p in low
        for p in (
            "okay, let's", "let's see", "the user", "i need to", "first, i",
            "rephrase", "original message", "without changing",
        )
    ):
        return True
    return False


def naturalize_prompt(stage: str, scripted: str, job: dict[str, Any], history: list) -> list[dict]:
    """LLM polish: rewrite scripted reply naturally using compact memory."""
    _, slots, _ = replay_state(history)
    system = (
        "Tu es Camille, IA de recrutement francophone, professionnelle et naturelle. "
        "Réponds UNIQUEMENT en français. Reformule UNIQUEMENT le message imposé, court et fluide. "
        "Réagis brièvement au fond sans répéter mot à mot la réponse du candidat. "
        "Interdictions: anglais, raisonnement méta, préfixe 'Question :', 'Je retiens que', "
        "inventer salaire/faits, décision d'embauche, balises <think>, reprendre une ancienne question hors sujet. "
        f"Mémoire candidat: {slots.memory_brief()}. "
        f"Fiche de poste: {job_brief(job)}"
    )
    last_user = next((str(h["content"]) for h in reversed(history) if h.get("role") == "user"), "")
    return [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": (
                f"Étape={stage}. Dernière déclaration candidat: « {last_user[:400]} ». "
                f"Écris seulement la réplique française finale, rien d'autre:\n« {scripted} »"
            ),
        },
    ]


def generate_prompt(stage: str, scripted: str, job: dict[str, Any], history: list) -> list[dict]:
    return naturalize_prompt(stage, scripted, job, history)


def build_report(history: list[dict], job: dict[str, Any] | None = None) -> dict[str, Any]:
    job = job or load_job()
    stage, slots, user_turns = replay_state(history)
    for attr, label in (
        ("experience", "expérience"),
        ("availability", "disponibilité"),
        ("accepted_hours", "horaires acceptés"),
        ("salary_expectations", "attentes salariales"),
    ):
        val = getattr(slots, attr)
        if (not val or val == "(non précisé)") and label not in slots.missing:
            slots.missing.append(label)

    # Name only via confident extractor across all user turns
    name = slots.candidate_name
    for msg in history:
        if msg.get("role") == "user":
            found = extract_candidate_name(str(msg.get("content", "")))
            if found:
                name = found
                break

    facts = []
    if slots.experience_normalized or slots.experience:
        facts.append(f"Expérience: {slots.experience_normalized or slots.experience}")
    if slots.availability_normalized or slots.availability:
        facts.append(f"Disponibilité: {slots.availability_normalized or slots.availability}")
    if slots.hours_normalized or slots.accepted_hours:
        facts.append(f"Horaires: {slots.hours_normalized or slots.accepted_hours}")
    if slots.salary_expectations:
        facts.append(f"Salaire: {slots.salary_expectations}")
    if slots.missing:
        facts.append(f"Manques: {', '.join(slots.missing)}")

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
        "experience_normalized": slots.experience_normalized,
        "availability": slots.availability,
        "availability_normalized": slots.availability_normalized,
        "accepted_working_hours": slots.accepted_hours,
        "hours_normalized": slots.hours_normalized,
        "salary_expectations": slots.salary_expectations,
        "questions_asked_by_candidate": list(slots.candidate_questions),
        "missing_information": list(slots.missing),
        "contradictions": list(slots.contradictions),
        "last_stage": stage,
        "user_turns": user_turns,
        "neutral_summary": " ".join(facts) if facts else "Aucune information structurée collectée.",
        "history": history,
        "scoring": None,
        "ranking": None,
        "hiring_recommendation": None,
    }
