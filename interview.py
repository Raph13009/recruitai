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

MAX_USER_TURNS = 20
MAX_FOLLOWUPS_PER_STAGE = 1
MAX_REASKS_PER_STAGE = 2
MAX_QUESTION_WAIT_TURNS = 3

# Temporary conversational sub-states (orthogonal to main interview stages)
SUB_NONE = ""
SUB_AWAITING_CANDIDATE_QUESTION = "AWAITING_CANDIDATE_QUESTION"
SUB_ANSWERING_CANDIDATE_QUESTION = "ANSWERING_CANDIDATE_QUESTION"
SUB_AWAITING_CLARIFICATION = "AWAITING_CLARIFICATION"
SUB_RESUMING_INTERVIEW = "RESUMING_INTERVIEW"
SUB_AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"

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
    "202", "pas disponible", "indisponible", "1er", "premier",
)

_TASK_CUES = (
    "prépar", "prepar", "emball", "picking", "packing", "charg", "décharg", "decharg",
    "tri", "colis", "quai", "manutention", "inventaire", "réception", "reception",
    "salle", "service", "cuisine", "caisse", "bar", "sols", "chantier", "maçonn", "maconn",
)

_COMPANY_CUES = (
    "chez ", "amazon", "carrefour", "fnac", "entrepôt", "entrepot",
    "hôtel", "hotel", "magasin",
)

_RESTAURANT_CUES = ("restaurant", "restauration", "salle", "service", "cuisine", "barman", "serve")
_BTP_CUES = ("btp", "chantier", "chantiers", "construction", "maçonn", "maconn", "sols", "génie civil", "genie civil")
_MONTHS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10,
    "novembre": 11, "décembre": 12, "decembre": 12,
}


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


def is_raise_question(text: str) -> bool:
    low = text.lower()
    return bool(
        re.search(
            r"(?i)augment|pay[eé]\s+plus|plus\s+si|évolution\s+(de\s+)?salaire|"
            r"augmenter|si\s+je\s+travaille\s+bien",
            low,
        )
    )


def answer_job_topic(topic: str, job: dict[str, Any], *, user_text: str = "") -> str:
    hours = " ou ".join(job["working_hours"])
    if topic == "raise":
        return (
            "Je n'ai pas d'information sur une éventuelle augmentation. "
            "Ce n'est donc pas garanti. Un recruteur pourra vous le préciser."
        )
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
        low = (user_text or "").lower()
        if "paris" in low and job["location"].lower() != "paris":
            return f"La mission se déroule à {job['location']}, pas à Paris."
        return f"La mission se déroule à {job['location']}."
    return (
        "Je ne dispose que des informations de la fiche de poste. "
        "Un recruteur humain pourra préciser le reste."
    )


def detect_job_topic(text: str) -> str | None:
    low = text.lower()
    if is_raise_question(text):
        return "raise"
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
    if re.search(
        r"(?i)(c[' ]est\s+sur|cest\s+sur|sur\s+paris|\bparis\b|localisation|adresse|\bo[uù]\b|\blyon\b|"
        r"marseille|lille|toulouse|nantes|bordeaux)",
        low,
    ) and (looks_like_question(text) or "?" in text or "c'est sur" in low or "cest sur" in low or "paris" in low):
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
            "pouvez", "peux", "pourquoi", "où", "ou est", "comment", "c'est sur", "cest sur",
            "je peux", "est ce que",
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
    experience_sector: str | None = None  # restauration | logistique | btp | autre | debutant
    experience_tasks: str | None = None
    experience_industries: list[str] = field(default_factory=list)
    experience_turn_id: int | None = None
    has_logistics: bool | None = None
    pending_exp_followup: bool = False

    availability: str | None = None
    availability_normalized: str | None = None
    availability_date: str | None = None
    availability_turn_id: int | None = None
    availability_mismatch: bool = False

    accepted_hours: str | None = None
    hours_normalized: str | None = None
    hours_pending_align: bool = False
    hours_turn_id: int | None = None

    salary_expectations: str | None = None
    salary_turn_id: int | None = None
    candidate_name: str | None = None
    candidate_questions: list[str] = field(default_factory=list)
    question_records: list[dict[str, Any]] = field(default_factory=list)
    fact_log: list[dict[str, Any]] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    reasks: dict[str, int] = field(default_factory=dict)
    followups: dict[str, int] = field(default_factory=dict)
    last_question: str = ""
    last_goal: str = ""
    contradictions: list[str] = field(default_factory=list)
    unanswered: list[str] = field(default_factory=list)

    sub_state: str = SUB_NONE
    resume_stage: str = ""
    question_wait_turns: int = 0
    turn_counter: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "experience": self.experience,
            "experience_normalized": self.experience_normalized,
            "experience_sector": self.experience_sector,
            "experience_tasks": self.experience_tasks,
            "experience_industries": list(self.experience_industries),
            "has_logistics": self.has_logistics,
            "availability": self.availability,
            "availability_normalized": self.availability_normalized,
            "availability_date": self.availability_date,
            "availability_mismatch": self.availability_mismatch,
            "accepted_hours": self.accepted_hours,
            "hours_normalized": self.hours_normalized,
            "salary_expectations": self.salary_expectations,
            "candidate_name": self.candidate_name,
            "candidate_questions": list(self.candidate_questions),
            "question_records": list(self.question_records),
            "missing_information": list(self.missing),
            "contradictions": list(self.contradictions),
            "pending_exp_followup": self.pending_exp_followup,
            "sub_state": self.sub_state,
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
    sub_state: str = SUB_NONE


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


def parse_availability_date(text: str, job: dict[str, Any]) -> date | None:
    low = text.lower()
    start = date.fromisoformat(job["start_date"])
    year = start.year
    m = re.search(
        r"(?:à\s+partir\s+du\s+|des?\s+|du\s+|le\s+)?(1er|1|premier|\d{1,2})\s+"
        r"(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)"
        r"(?:\s+(\d{4}))?",
        low,
    )
    if m:
        day_s, month_s, year_s = m.group(1), m.group(2), m.group(3)
        day = 1 if day_s in ("1er", "1", "premier") else int(day_s)
        month = _MONTHS_FR[month_s]
        y = int(year_s) if year_s else year
        try:
            return date(y, month, day)
        except ValueError:
            return None
    return None


def normalize_availability(text: str, job: dict[str, Any]) -> tuple[str, str] | None:
    """Return (raw, normalized) or None."""
    low = text.lower()
    if not any(c in low for c in _TIME_CUES + ("mainten", "tout de suite", "asap")):
        if not re.search(r"dispo|disponible|commencer|partir", low):
            return None
    # Prefer clause before a trailing question for raw storage
    raw = re.split(r"\?\s*", text.strip())[0].strip(" ,") or text.strip()
    parsed = parse_availability_date(text, job)
    if parsed:
        return raw, f"à partir du {format_fr_date(parsed)}"
    if any(w in low for w in ("maintenant", "maintennat", "immédiat", "immediat", "tout de suite", "asap", "de suite")):
        return raw, f"immédiatement (fiche: début {job['start_date_fr']})"
    if "semaine prochaine" in low:
        return raw, "semaine prochaine"
    if "dans un mois" in low or "un mois" in low:
        return raw, "dans un mois"
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
    if is_raise_question(text):
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
        "industries": [],
    }
    # Never treat salary/raise questions as experience
    if is_raise_question(text) and not any(c in low for c in _BTP_CUES + _RESTAURANT_CUES + _COMPANY_CUES + ("logistique", "manutention")):
        return out
    topic = detect_job_topic(text)
    if topic in ("raise", "salary", "location", "hours", "start") and looks_like_question(text):
        if not any(c in low for c in ("travaill", "expérience", "experience", "bossé", "btp", "restaurant", "logistique", "chantier")):
            return out

    has_rest = any(c in low for c in _RESTAURANT_CUES)
    has_btp = any(c in low for c in _BTP_CUES)
    denies_logistics = bool(
        re.search(
            r"(?i)(jamais|pas|aucune?).{0,40}(logistique|manutention|entrep[oô]t)|"
            r"(débutant|debutant)",
            low,
        )
    ) and not has_rest and not has_btp and not any(c in low for c in _TASK_CUES + _COMPANY_CUES)

    if denies_logistics or (
        any(b in low for b in ("débutant", "debutant", "jamais travaill", "pas d'expérience", "pas d'experience", "aucune expérience", "aucune experience"))
        and not has_rest
        and not has_btp
        and not any(c in low for c in _TASK_CUES + _COMPANY_CUES)
    ):
        out["is_beginner"] = True
        out["has_logistics"] = False
        out["sector"] = "debutant"
        out["normalized"] = "débutant / pas d'expérience logistique déclarée"
        out["needs_followup"] = False
        return out

    if "jamais" in low and any(s in low for s in ("logistique", "manutention", "entrepôt", "entrepot")) and not has_rest and not has_btp:
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

    if has_btp:
        out["sector"] = "btp"
        out["industries"] = ["BTP"]
        out["normalized"] = "expérience dans le BTP / chantiers"
        out["has_logistics"] = False if out["has_logistics"] is None else out["has_logistics"]
        if any(c in low for c in ("sols", "chantier", "maçonn", "maconn", "coffrage")):
            out["tasks"] = text.strip()
            out["needs_followup"] = False
        else:
            out["needs_followup"] = True
        return out

    if has_rest:
        out["sector"] = "restauration"
        out["industries"] = ["restauration"]
        if out["has_logistics"] is False:
            out["normalized"] = "expérience en restauration, sans expérience logistique déclarée"
        else:
            out["normalized"] = "expérience en restauration"
        if not any(c in low for c in ("salle", "service", "cuisine", "caisse", "bar", "prépar", "plat")):
            out["needs_followup"] = True
        else:
            out["tasks"] = text.strip()
            out["needs_followup"] = False
    elif has_log and out["has_logistics"] is not False:
        out["sector"] = "logistique"
        out["industries"] = ["logistique"]
        out["normalized"] = "expérience en logistique / manutention"
        if not any(c in low for c in _TASK_CUES):
            out["needs_followup"] = True
        else:
            out["tasks"] = text.strip()
    elif any(c in low for c in _COMPANY_CUES) or (
        ("travaill" in low or "expérience" in low or "experience" in low or "bossé" in low or "bosse" in low)
        and not denies_logistics
    ):
        out["sector"] = "autre"
        out["normalized"] = text.strip()
        if not any(c in low for c in _TASK_CUES):
            out["needs_followup"] = True

    if out["normalized"] is None and text.strip() and out["sector"]:
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
        or any(c in low for c in _COMPANY_CUES + _BTP_CUES)
        or "expérience" in low
        or "experience" in low
        or "travaill" in low
        or "bossé" in low
        or "ans" in low
        or "mois" in low
    )
    has_tasks = any(c in low for c in _TASK_CUES) or "sols" in low or "chantier" in low
    if info["is_beginner"]:
        return False
    return bool(has_yes_exp and not has_tasks and info["sector"] not in (None, "debutant"))


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
    if info.get("sector") and not is_raise_question(text):
        # Strip trailing question / location clause from mixed utterances
        exp_raw = re.split(r",\s*(?:c[' ]est\s+sur|je\s+suis\s+dispo|disponible)", text, flags=re.I)[0]
        exp_raw = re.split(r"\?\s*", exp_raw)[0].strip(" ,")
        # Do not treat pure availability sentences as experience
        if exp_raw and not (
            ("dispo" in exp_raw.lower() or "disponible" in exp_raw.lower())
            and not any(c in exp_raw.lower() for c in _BTP_CUES + _RESTAURANT_CUES + ("logistique", "manutention", "bossé", "travaill", "expérience", "experience"))
        ):
            found["experience"] = exp_raw

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
        for ind in info.get("industries") or []:
            if ind not in slots.experience_industries:
                slots.experience_industries.append(ind)
        if info["has_logistics"] is not None:
            slots.has_logistics = info["has_logistics"]
        if info["tasks"]:
            slots.experience_tasks = info["tasks"]
        if info["needs_followup"] and slots.followups.get("experience", 0) < MAX_FOLLOWUPS_PER_STAGE:
            slots.pending_exp_followup = True
        elif info["tasks"] or info["is_beginner"]:
            slots.pending_exp_followup = False
        slots.fact_log.append({"field": "experience", "raw": val, "normalized": info.get("normalized"), "turn_id": slots.turn_counter})
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
        parsed = parse_availability_date(val, job)
        if parsed:
            slots.availability_date = parsed.isoformat()
            slots.availability_normalized = f"à partir du {format_fr_date(parsed)}"
            slots.availability_mismatch = parsed > date.fromisoformat(job["start_date"])
        slots.fact_log.append({"field": "availability", "raw": val, "normalized": slots.availability_normalized, "turn_id": slots.turn_counter})
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
            if slots and slots.experience_sector == "btp":
                return "Sur les chantiers, vous faisiez quoi exactement comme tâches ?"
            return "Qu'est-ce que vous faisiez concrètement comme tâches ?"
        if variant == "reask":
            return "Avez-vous déjà travaillé en logistique ou en manutention, même brièvement, ou êtes-vous débutant(e) ?"
        return "Avez-vous déjà travaillé en logistique ou en manutention ?"
    if stage == "availability":
        if variant == "reask":
            return f"À partir de quelle date seriez-vous disponible ? Le début prévu sur la fiche est le {job['start_date_fr']}."
        if variant == "mismatch":
            return (
                f"La mission est prévue pour commencer le {job['start_date_fr']}, "
                f"donc votre disponibilité est plus tardive. "
                f"Est-ce que vous souhaitez quand même poursuivre cet échange ?"
            )
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
        if slots.experience_sector == "btp" or any(c in low for c in _BTP_CUES):
            if slots.pending_exp_followup:
                return "D'accord, le BTP demande souvent du travail d'équipe et de la précision."
            return "Merci pour ces précisions sur le chantier."
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

def _declines_questions(text: str) -> bool:
    low = text.lower()
    if re.search(
        r"(?i)\bpas\s+de\s+question|\baucune\b|\bnon merci\b|\bc[' ]est\s+tout\b|\bcest\s+tout\b|"
        r"\btout\s+est\s+clair\b|\brien\b",
        low,
    ):
        return True
    return low.strip().rstrip(".!") in {"non", "non merci", "rien", "aucune", "c'est bon", "cest bon"}


def _wants_to_ask(text: str) -> bool:
    low = text.lower().strip().rstrip(".!,;")
    return low in {"oui", "yes", "ouais", "ouai", "j'ai une question", "jai une question", "une question"}


def _short_affirm(text: str) -> bool:
    low = text.lower().strip().rstrip(".!,;")
    return low in {
        "oui", "ok", "okay", "d'accord", "daccord", "yes", "ça me va", "ca me va",
        "volontiers", "bien sûr", "bien sur", "poursuivre", "continuer",
    }


def extract_embedded_questions(text: str) -> list[tuple[str, str]]:
    """Return list of (topic, clause) for questions embedded in a mixed utterance."""
    out: list[tuple[str, str]] = []
    low = text.lower()
    # Whole-utterance raise / salary / location questions
    topic = detect_job_topic(text)
    if topic and (looks_like_question(text) or "?" in text or topic == "raise"):
        # Also catch trailing "c'est sur Paris ?"
        m = re.search(
            r"(c[' ]est\s+sur\s+[^?]+|est-ce\s+que[^?]*|je\s+peux[^?]*|où\s+[^?]*|combien[^?]*)\??",
            text,
            flags=re.I,
        )
        if m and detect_job_topic(m.group(0)):
            t = detect_job_topic(m.group(0)) or topic
            out.append((t, m.group(0).strip()))
        elif topic:
            out.append((topic, text.strip()))
        return out
    if "paris" in low and ("c'est sur" in low or "cest sur" in low or "?" in text):
        out.append(("location", text.strip()))
    return out


def detect_intent(text: str, stage: str, slots: InterviewSlots) -> tuple[Intent, str | None]:
    raw = text.strip()
    if not raw:
        return "INCOMPLETE_ANSWER", None
    if _END.search(raw):
        return "END_INTERVIEW", None

    # Sub-states take priority
    if slots.sub_state == SUB_AWAITING_CANDIDATE_QUESTION:
        if _declines_questions(raw):
            return "ANSWER", None
        return "QUESTION_ABOUT_JOB", detect_job_topic(raw) or "unknown"
    if slots.sub_state == SUB_AWAITING_CONFIRMATION:
        if any(w in raw.lower() for w in ("non", "arrêter", "arreter", "stop")) and not _short_affirm(raw):
            return "END_INTERVIEW", None
        return "ANSWER", None

    if _CLARIFY.search(raw):
        topic = detect_job_topic(raw)
        if topic and ("salaire" in raw.lower() or "horaire" in raw.lower() or "tâche" in raw.lower()):
            return "QUESTION_ABOUT_JOB", topic
        return "CLARIFICATION_REQUEST", None

    embedded = extract_embedded_questions(raw)
    if embedded:
        return "QUESTION_ABOUT_JOB", embedded[0][0]

    topic = detect_job_topic(raw)
    if topic and looks_like_question(raw):
        return "QUESTION_ABOUT_JOB", topic
    low_full = raw.lower()
    if topic == "salary" and any(w in low_full for w in ("combien", "c'est combien", "quel salaire")):
        return "QUESTION_ABOUT_JOB", topic
    if topic == "raise":
        return "QUESTION_ABOUT_JOB", "raise"

    if _OFF.search(raw) and not any(
        k in raw.lower() for k in ("disponible", "horaire", "salaire", "expérience", "experience", "entrepôt", "restaurant", "paris", "btp")
    ):
        return "OFF_TOPIC", None

    if stage == "questions" and _wants_to_ask(raw):
        return "ANSWER", None

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
    slots.turn_counter += 1

    # --- Sub-state: waiting for confirmation after availability mismatch ---
    if slots.sub_state == SUB_AWAITING_CONFIRMATION:
        if intent == "END_INTERVIEW" or (
            any(w in user_text.lower() for w in ("non", "arrêter", "arreter", "stop"))
            and not _short_affirm(user_text)
        ):
            slots.sub_state = SUB_NONE
            return stage_question("closing", job), "closing", True, slots
        if _short_affirm(user_text) or any(w in user_text.lower() for w in ("poursuivre", "continuer", "quand même", "quand meme")):
            slots.sub_state = SUB_NONE
            # Keep availability date; mismatch acknowledged so we don't re-ask forever
            slots.availability_mismatch = False
            next_stage = _next_open_stage(slots)
            q = stage_question(next_stage, job, slots=slots)
            reply = f"Très bien, on continue. {q}"
            slots.last_question = q
            return reply, next_stage, False, slots
        q = stage_question("availability", job, variant="mismatch", slots=slots)
        reply = f"Pour être claire : {q}"
        slots.last_question = q
        return reply, "availability", False, slots

    # --- Sub-state: waiting for the actual candidate question after "oui" ---
    if slots.sub_state == SUB_AWAITING_CANDIDATE_QUESTION:
        if _declines_questions(user_text):
            slots.sub_state = SUB_NONE
            slots._questions_done = True  # type: ignore[attr-defined]
            return stage_question("closing", job), "closing", True, slots
        topic_q = detect_job_topic(user_text) or topic or "unknown"
        if topic_q == "unknown" and not looks_like_question(user_text):
            slots.question_wait_turns += 1
            if slots.question_wait_turns >= MAX_QUESTION_WAIT_TURNS:
                slots.sub_state = SUB_NONE
                slots._questions_done = True  # type: ignore[attr-defined]
                return (
                    "Je n'ai pas reçu de question précise. " + stage_question("closing", job)
                ), "closing", True, slots
            reply = "Je vous écoute : quelle est votre question ?"
            slots.last_question = reply
            return reply, "questions", False, slots
        fact = answer_job_topic(topic_q if topic_q != "unknown" else "duties", job, user_text=user_text)
        if topic_q == "unknown":
            fact = (
                "Je n'ai pas cette information dans la fiche de poste. "
                "Un recruteur pourra vous répondre plus précisément."
            )
        slots.candidate_questions.append(user_text)
        slots.question_records.append(
            {"raw": user_text, "topic": topic_q, "turn_id": slots.turn_counter, "answered": True, "answer": fact}
        )
        reply = f"{fact} Avez-vous une autre question, ou puis-je clôturer l'entretien ?"
        slots.last_question = reply
        slots.question_wait_turns = 0
        # Stay ready for another question
        slots.sub_state = SUB_AWAITING_CANDIDATE_QUESTION
        return reply, "questions", False, slots

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
        # Extract facts AND answer questions (mixed-intent)
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        embedded = extract_embedded_questions(user_text)
        if not embedded:
            embedded = [(topic or detect_job_topic(user_text) or "duties", user_text)]
        answers: list[str] = []
        for t, clause in embedded:
            fact = answer_job_topic(t, job, user_text=clause)
            answers.append(fact)
            slots.candidate_questions.append(clause)
            slots.question_records.append(
                {"raw": clause, "topic": t, "turn_id": slots.turn_counter, "answered": True, "answer": fact}
            )

        topics = {t for t, _ in embedded}

        # Raise/salary question: answer with uncertainty, do NOT re-ask the salary question
        # (checked before mismatch so a later raise cannot reopen a resolved delay)
        if "raise" in topics or ("salary" in topics and is_raise_question(user_text)):
            reply = (
                f"{' '.join(answers)} "
                f"Dites-moi si le taux annoncé vous convient, ou si vous avez une autre question."
            )
            slots.last_question = reply
            return reply, "salary" if stage in ("salary", "hours", "questions", "availability") else stage, False, slots

        # Availability mismatch after mixed avail+location (only once, while unresolved)
        if slots.availability_mismatch and slots.availability_date and slots.sub_state != SUB_AWAITING_CONFIRMATION:
            d = date.fromisoformat(slots.availability_date)
            mismatch = (
                f"Elle est prévue pour commencer le {job['start_date_fr']}, "
                f"donc votre disponibilité au {format_fr_date(d)} est plus tardive. "
                f"Est-ce que vous souhaitez quand même poursuivre cet échange ?"
            )
            reply = f"{' '.join(answers)} {mismatch}"
            slots.sub_state = SUB_AWAITING_CONFIRMATION
            slots.last_question = mismatch
            return reply, "availability", False, slots

        open_stage = _next_open_stage(slots) if (slots.filled(stage) or stage == "intro" or extract_bundled_slots(user_text, slots, job)) else stage
        if stage == "intro":
            open_stage = _next_open_stage(slots)
        # If current stage still open and no facts filled it, stay
        if stage in COLLECT_STAGES and not slots.filled(stage) and stage != "intro":
            # But if we extracted availability while on availability, advance
            if stage == "availability" and slots.availability:
                open_stage = _next_open_stage(slots)
            elif stage == "experience" and slots.experience and not slots.pending_exp_followup:
                open_stage = _next_open_stage(slots)
            elif not any(k in extract_bundled_slots(user_text, slots, job) for k in ("availability", "accepted_hours", "experience", "salary_expectations")):
                open_stage = stage

        q = stage_question(open_stage, job, slots=slots)
        reply = f"{' '.join(answers)} {q}"
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
        # Capture bundled facts from the ready utterance (e.g. BTP experience)
        _apply_bundle(slots, extract_bundled_slots(user_text, slots, job), job)
        if slots.experience and (slots.pending_exp_followup or experience_needs_followup(slots.experience, slots)):
            slots.pending_exp_followup = True
            slots.followups["experience"] = max(slots.followups.get("experience", 0), 1)
            q = stage_question("experience", job, variant="followup", slots=slots)
            reply = f"{react('intro', user_text, slots, job)} {q}"
            slots.last_question = q
            return reply, "experience", False, slots
        if slots.experience and not slots.pending_exp_followup:
            next_stage = _next_open_stage(slots)
            q = stage_question(next_stage, job, slots=slots)
            reply = f"{react('intro', user_text, slots, job)} {q}"
            slots.last_question = q
            return reply, next_stage, False, slots
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
        parsed = parse_availability_date(user_text, job)
        if parsed:
            slots.availability_date = parsed.isoformat()
            slots.availability_normalized = f"à partir du {format_fr_date(parsed)}"
            slots.availability_mismatch = parsed > date.fromisoformat(job["start_date"])
        if slots.availability_mismatch and slots.availability_date:
            d = date.fromisoformat(slots.availability_date)
            reply = (
                f"{react('availability', user_text, slots, job)} "
                f"La mission se déroule à {job['location']}. "
                f"Elle est prévue pour commencer le {job['start_date_fr']}, "
                f"donc votre disponibilité au {format_fr_date(d)} est plus tardive. "
                f"Est-ce que vous souhaitez quand même poursuivre cet échange ?"
            )
            slots.sub_state = SUB_AWAITING_CONFIRMATION
            slots.last_question = reply
            return reply, "availability", False, slots
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
        if is_raise_question(user_text):
            fact = answer_job_topic("raise", job, user_text=user_text)
            slots.candidate_questions.append(user_text)
            slots.question_records.append(
                {"raw": user_text, "topic": "raise", "turn_id": slots.turn_counter, "answered": True, "answer": fact}
            )
            reply = (
                f"{fact} "
                f"Dites-moi si le taux annoncé vous convient, ou si vous avez une autre question."
            )
            slots.last_question = reply
            return reply, "salary", False, slots
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
        if _wants_to_ask(user_text):
            slots.sub_state = SUB_AWAITING_CANDIDATE_QUESTION
            slots.question_wait_turns = 0
            reply = "Bien sûr, je vous écoute."
            slots.last_question = reply
            return reply, "questions", False, slots
        topic_q = detect_job_topic(user_text)
        if topic_q and looks_like_question(user_text):
            slots.candidate_questions.append(user_text)
            fact = answer_job_topic(topic_q, job, user_text=user_text)
            slots.question_records.append(
                {"raw": user_text, "topic": topic_q, "turn_id": slots.turn_counter, "answered": True, "answer": fact}
            )
            reply = f"{fact} Avez-vous une autre question, ou puis-je clôturer l'entretien ?"
            slots.last_question = reply
            slots.sub_state = SUB_AWAITING_CANDIDATE_QUESTION
            slots.question_wait_turns = 0
            return reply, "questions", False, slots
        if _declines_questions(user_text) or any(
            p in user_text.lower() for p in ("pas de question", "aucune", "non", "c'est bon", "cest bon", "rien", "tout est clair", "non merci")
        ):
            slots.sub_state = SUB_NONE
            slots._questions_done = True  # type: ignore[attr-defined]
            return stage_question("closing", job), "closing", True, slots
        # Free-form treated as a question — answer if possible, else ask them to clarify; do NOT close
        topic_q = detect_job_topic(user_text) or "unknown"
        fact = answer_job_topic(topic_q if topic_q != "unknown" else "duties", job, user_text=user_text)
        if topic_q == "unknown":
            fact = (
                "Je n'ai pas cette information dans la fiche de poste. "
                "Un recruteur pourra vous répondre plus précisément."
            )
        slots.candidate_questions.append(user_text)
        reply = f"{fact} Avez-vous une autre question, ou puis-je clôturer l'entretien ?"
        slots.last_question = reply
        slots.sub_state = SUB_AWAITING_CANDIDATE_QUESTION
        return reply, "questions", False, slots

    if stage == "closing":
        return stage_question("closing", job), "closing", True, slots

    q = stage_question(_next_open_stage(slots), job, slots=slots)
    return q, _next_open_stage(slots), False, slots


# --- Replay / process ---

def replay_state(history: list[dict]) -> tuple[str, InterviewSlots, int]:
    """Replay via compose_reply so sub-states and mixed intents stay consistent."""
    slots = InterviewSlots()
    stage = "intro"
    user_turns = 0
    job = load_job()
    for msg in history:
        role = msg.get("role")
        content = str(msg.get("content", "")).strip()
        if role == "assistant":
            slots.last_question = content
            low = content.lower()
            if "je vous écoute" in low:
                slots.sub_state = SUB_AWAITING_CANDIDATE_QUESTION
            elif "poursuivre cet échange" in low or "quand même poursuivre" in low:
                slots.sub_state = SUB_AWAITING_CONFIRMATION
            continue
        if role != "user":
            continue
        user_turns += 1
        intent, topic = detect_intent(content, stage, slots)
        _reply, new_stage, done, slots = compose_reply(
            intent=intent,
            topic=topic,
            stage=stage,
            slots=slots,
            user_text=content,
            job=job,
        )
        stage = "closing" if done else new_stage
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
        interrupted=intent == "QUESTION_ABOUT_JOB" or bool(extract_embedded_questions(user_text)),
        progress_turn=user_turns + 1,
        goal=new_stage,
        sub_state=slots.sub_state,
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
        "experience_industries": list(slots.experience_industries),
        "experience_tasks": slots.experience_tasks,
        "availability": slots.availability,
        "availability_normalized": slots.availability_normalized,
        "availability_date": slots.availability_date,
        "availability_mismatch": slots.availability_mismatch,
        "accepted_working_hours": slots.accepted_hours,
        "hours_normalized": slots.hours_normalized,
        "salary_expectations": slots.salary_expectations,
        "questions_asked_by_candidate": list(slots.candidate_questions),
        "question_records": list(slots.question_records),
        "fact_log": list(slots.fact_log),
        "missing_information": list(slots.missing),
        "contradictions": list(slots.contradictions),
        "last_stage": stage,
        "sub_state": slots.sub_state,
        "user_turns": user_turns,
        "neutral_summary": " ".join(facts) if facts else "Aucune information structurée collectée.",
        "history": history,
        "scoring": None,
        "ranking": None,
        "hiring_recommendation": None,
    }
