"""Structured interview state machine for RecruitAI (stdlib only)."""
from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

ROOT = pathlib.Path(__file__).parent
JOB_PATH = ROOT / "data" / "demo_job.json"

# Ordered interview stages controlled by the application, not the LLM.
STAGES = [
    "intro",
    "experience",
    "availability",
    "hours",
    "salary",
    "questions",
    "closing",
]

# Allow re-asks and mid-interview interruptions within a ~5 min demo.
MAX_USER_TURNS = 12


def next_monday(today: date | None = None) -> date:
    """Resolve 'lundi prochain': the next Monday strictly after today if today is Monday."""
    today = today or date.today()
    days = (0 - today.weekday()) % 7
    if days == 0:
        days = 7
    return today + timedelta(days=days)


def format_fr_date(d: date) -> str:
    months = (
        "janvier",
        "février",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
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


# --- Scripted lines (fallbacks and demo mode) ---

def scripted_line(stage: str, job: dict[str, Any], *, reask: bool = False) -> str:
    hours = " ou ".join(job["working_hours"])
    if stage == "intro":
        return (
            f"Bonjour, je suis Camille, une assistante de recrutement basée sur une intelligence artificielle "
            f"pour {job['agency']}. Le poste concerne un {job['job_title']} à {job['location']} : "
            f"{job['tasks']}, mission de 2 semaines renouvelable à partir du {job['start_date_fr']}. "
            f"Êtes-vous prêt(e) à commencer cet entretien ?"
        )
    if stage == "experience":
        if reask:
            return (
                "Pour préciser : avez-vous déjà travaillé en logistique ou en manutention, "
                "même brièvement, ou êtes-vous débutant(e) ?"
            )
        return "Avez-vous déjà travaillé en logistique ou en manutention ?"
    if stage == "availability":
        if reask:
            return (
                f"Pouvez-vous indiquer clairement à partir de quand vous êtes disponible ? "
                f"Le début prévu est le {job['start_date_fr']}."
            )
        return (
            f"Le début de mission est prévu le {job['start_date_fr']}. "
            f"À partir de quand seriez-vous disponible ?"
        )
    if stage == "hours":
        if reask:
            return (
                f"Quels créneaux vous conviennent parmi {hours} ? "
                f"Vous pouvez accepter l'un, l'autre, ou les deux."
            )
        return (
            f"Les horaires proposés sont {hours}. "
            f"Quels créneaux vous seraient acceptables ?"
        )
    if stage == "salary":
        if reask:
            return (
                f"La rémunération indiquée est {job['salary_note']}. "
                f"Cela correspond-il à vos attentes ?"
            )
        return (
            f"Le salaire est de {job['salary_note']}. "
            f"Est-ce que cela correspond à vos attentes ?"
        )
    if stage == "questions":
        return "Avez-vous des questions sur le poste, les horaires ou la rémunération ?"
    if stage == "closing":
        return (
            "Merci pour cet échange. Un recruteur humain pourra examiner les informations "
            "que vous avez partagées. Je clôture cet entretien sans décision d'embauche. Au revoir."
        )
    return "Poursuivons l'entretien, s'il vous plaît."


def answer_job_topic(topic: str, job: dict[str, Any]) -> str:
    hours = " ou ".join(job["working_hours"])
    if topic == "salary":
        return (
            f"D'après la fiche de poste, la rémunération est {job['salary_note']}. "
            f"Je n'ai pas d'autre information à ce sujet."
        )
    if topic == "hours":
        return (
            f"Les horaires indiqués sont {hours}. "
            f"Je n'ai pas d'autre plage horaire à communiquer."
        )
    if topic == "duties":
        return (
            f"Les tâches prévues sont : {job['tasks']}. "
            f"Le contrat est une {job['contract'].lower()}, à {job['location']}, "
            f"début le {job['start_date_fr']}. Les débutants sont acceptés."
        )
    if topic == "contract":
        return (
            f"Il s'agit d'une {job['contract'].lower()}, pour {job['agency']}, "
            f"à {job['location']}, début le {job['start_date_fr']}."
        )
    if topic == "start":
        return f"La date de début indiquée est le {job['start_date_fr']}."
    return (
        "Je ne dispose que des informations de la fiche de poste fournie. "
        "Un recruteur humain pourra préciser le reste."
    )


# --- Detection helpers ---

_SALARY_Q = re.compile(
    r"\b(salaire|r[eé]mun[eé]ration|pay[eé]|combien|taux\s*horaire|indemnit)",
    re.I,
)
_HOURS_Q = re.compile(
    r"\b(horaire|heures?|cr[eé]neau|shift|matin|apr[eè]s[-\s]?midi|soir)",
    re.I,
)
_DUTIES_Q = re.compile(
    r"\b(t[aâ]ches?|missions?|quoi\s+faire|manutention|colis|quai|poste)",
    re.I,
)
_CONTRACT_Q = re.compile(r"\b(contrat|mission|dur[eé]e|renouvel)", re.I)
_START_Q = re.compile(r"\b(d[eé]but|commencer|date\s+de\s+prise|lundi)", re.I)
_QUESTION_MARK = re.compile(r"\?")


def detect_interruption(text: str, current_stage: str) -> str | None:
    """If the candidate asks about job facts mid-flow, return the topic."""
    t = text.strip()
    if not t:
        return None
    low = t.lower()
    looks_like_q = bool(_QUESTION_MARK.search(t)) or low.startswith(
        ("est-ce", "c'est combien", "quel", "quelle", "quels", "quelles", "pouvez", "peux")
    )
    # Salary question while not on salary stage
    if current_stage != "salary" and _SALARY_Q.search(t) and (
        looks_like_q or any(w in low for w in ("combien", "c'est combien", "le salaire"))
    ):
        return "salary"
    if current_stage != "hours" and _HOURS_Q.search(t) and looks_like_q:
        return "hours"
    if current_stage not in ("intro", "experience", "duties") and _DUTIES_Q.search(t) and looks_like_q:
        return "duties"
    if _CONTRACT_Q.search(t) and looks_like_q and current_stage not in ("intro",):
        return "contract"
    if current_stage != "availability" and _START_Q.search(t) and looks_like_q:
        return "start"
    return None


def _is_incomplete(text: str) -> bool:
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    if len(words) < 2:
        return True
    low = text.lower().strip()
    vague = (
        "je ne sais pas",
        "je sais pas",
        "peut-être",
        "peut etre",
        "euh",
        "hmm",
        "bof",
        "...",
        "oui",
        "non",
        "ok",
        "d'accord",
        "daccord",
    )
    # "oui"/"non" alone are incomplete for open slots, but OK for salary yes/no — handled per stage
    if low in vague or low in {"oui.", "non.", "ok.", "d'accord."}:
        return True
    return False


def extract_experience(text: str) -> str | None:
    if _is_incomplete(text) and text.lower().strip() not in {
        "non",
        "non.",
        "débutant",
        "debutant",
        "débutante",
        "debutante",
    }:
        # Allow clear beginner short answers
        low = text.lower().strip().rstrip(".")
        if low in {"non", "débutant", "debutant", "débutante", "debutante", "aucune", "aucun"}:
            return text.strip()
        if len(text.split()) < 2:
            return None
    low = text.lower()
    # Any substantive reply counts; store the candidate's words
    if len(text.strip()) >= 2:
        return text.strip()
    return None


def extract_availability(text: str) -> str | None:
    if len(text.strip()) < 2:
        return None
    low = text.lower()
    # Incomplete if purely vague without time cue
    time_cues = (
        "lundi",
        "mardi",
        "mercredi",
        "jeudi",
        "vendredi",
        "samedi",
        "dimanche",
        "semaine",
        "mois",
        "immédiat",
        "immediat",
        "disponible",
        "dispo",
        "après",
        "apres",
        "demain",
        "janvier",
        "février",
        "fevrier",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "aout",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
        "decembre",
        "202",
        "dès",
        "des que",
        "dès que",
        "pas disponible",
        "indisponible",
        "impossible",
    )
    if any(c in low for c in time_cues) or len(text.split()) >= 4:
        return text.strip()
    if _is_incomplete(text):
        return None
    return text.strip()


def extract_hours(text: str) -> str | None:
    if len(text.strip()) < 2:
        return None
    low = text.lower()
    cues = (
        "6",
        "13",
        "20",
        "matin",
        "après-midi",
        "apres-midi",
        "après midi",
        "apres midi",
        "soir",
        "les deux",
        "tous",
        "indifférent",
        "indifferent",
        "accepte",
        "ok",
        "oui",
        "non",
        "premier",
        "deuxième",
        "deuxieme",
        "créneau",
        "creneau",
    )
    if any(c in low for c in cues) or len(text.split()) >= 3:
        return text.strip()
    if _is_incomplete(text):
        return None
    return text.strip()


def extract_salary(text: str) -> str | None:
    if len(text.strip()) < 1:
        return None
    low = text.lower().strip()
    # Yes/no style answers are valid here
    if any(
        w in low
        for w in (
            "oui",
            "non",
            "ok",
            "d'accord",
            "accepte",
            "convient",
            "correspond",
            "trop bas",
            "insuffisant",
            "ça me va",
            "ca me va",
            "attendu",
            "attente",
        )
    ) or len(text.split()) >= 2:
        return text.strip()
    return None


def extract_questions_reply(text: str) -> tuple[str | None, list[str]]:
    """Return (slot value, list of candidate questions about the job)."""
    raw = text.strip()
    if not raw:
        return None, []
    low = raw.lower()
    asked: list[str] = []
    if _QUESTION_MARK.search(raw) or any(
        k in low for k in ("je voudrais savoir", "pouvez-vous", "est-ce que", "quel", "quelle")
    ):
        asked.append(raw)
    no_q = any(
        p in low
        for p in (
            "pas de question",
            "aucune question",
            "non merci",
            "c'est bon",
            "cest bon",
            "rien à ajouter",
            "rien a ajouter",
            "tout est clair",
        )
    )
    if no_q or low in {"non", "non.", "non merci", "non merci."}:
        return raw, asked
    if len(raw.split()) >= 1:
        return raw, asked
    return None, asked


@dataclass
class InterviewSlots:
    experience: str | None = None
    availability: str | None = None
    accepted_hours: str | None = None
    salary_expectations: str | None = None
    candidate_questions: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    reask_counts: dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "experience": self.experience,
            "availability": self.availability,
            "accepted_hours": self.accepted_hours,
            "salary_expectations": self.salary_expectations,
            "candidate_questions": list(self.candidate_questions),
            "missing_information": list(self.missing),
        }


@dataclass
class TurnResult:
    reply: str
    stage: str
    done: bool
    slots: InterviewSlots
    mode_hint: str  # "scripted" | "naturalize"
    interrupted: bool = False
    progress_turn: int = 0
    progress_max: int = MAX_USER_TURNS


def reconstruct_state(history: list[dict]) -> tuple[str, InterviewSlots, int]:
    """
    Walk history to recover current stage and filled slots.
    Stage advances only when a user answer successfully fills (or exhausts reasks for) that stage.
    """
    slots = InterviewSlots()
    stage_idx = 0
    user_turns = 0
    pending_reask = False

    # After intro is delivered (first assistant msg), we wait for user then move on.
    i = 0
    while i < len(history):
        msg = history[i]
        role = msg.get("role")
        content = str(msg.get("content", "")).strip()
        if role == "user":
            user_turns += 1
            current = STAGES[min(stage_idx, len(STAGES) - 1)]
            topic = detect_interruption(content, current)
            if topic:
                # Factual side-question: do not fill the current slot.
                # Engaging during intro still leaves the intro stage.
                if current == "intro":
                    stage_idx = 1
                    pending_reask = False
                i += 1
                continue

            if current == "intro":
                stage_idx = 1
                pending_reask = False
            elif current == "experience":
                val = extract_experience(content)
                if val:
                    slots.experience = val
                    stage_idx = 2
                    pending_reask = False
                else:
                    slots.reask_counts["experience"] = slots.reask_counts.get("experience", 0) + 1
                    if slots.reask_counts["experience"] >= 2:
                        slots.missing.append("expérience")
                        stage_idx = 2
                        pending_reask = False
                    else:
                        pending_reask = True
            elif current == "availability":
                val = extract_availability(content)
                if val:
                    slots.availability = val
                    stage_idx = 3
                    pending_reask = False
                else:
                    slots.reask_counts["availability"] = slots.reask_counts.get("availability", 0) + 1
                    if slots.reask_counts["availability"] >= 2:
                        slots.missing.append("disponibilité")
                        stage_idx = 3
                        pending_reask = False
                    else:
                        pending_reask = True
            elif current == "hours":
                val = extract_hours(content)
                if val:
                    slots.accepted_hours = val
                    stage_idx = 4
                    pending_reask = False
                else:
                    slots.reask_counts["hours"] = slots.reask_counts.get("hours", 0) + 1
                    if slots.reask_counts["hours"] >= 2:
                        slots.missing.append("horaires acceptés")
                        stage_idx = 4
                        pending_reask = False
                    else:
                        pending_reask = True
            elif current == "salary":
                val = extract_salary(content)
                if val:
                    slots.salary_expectations = val
                    stage_idx = 5
                    pending_reask = False
                else:
                    slots.reask_counts["salary"] = slots.reask_counts.get("salary", 0) + 1
                    if slots.reask_counts["salary"] >= 2:
                        slots.missing.append("attentes salariales")
                        stage_idx = 5
                        pending_reask = False
                    else:
                        pending_reask = True
            elif current == "questions":
                val, asked = extract_questions_reply(content)
                if asked:
                    slots.candidate_questions.extend(asked)
                if val:
                    stage_idx = 6  # closing
                    pending_reask = False
                else:
                    slots.reask_counts["questions"] = slots.reask_counts.get("questions", 0) + 1
                    if slots.reask_counts["questions"] >= 2:
                        stage_idx = 6
                        pending_reask = False
                    else:
                        pending_reask = True
            elif current == "closing":
                pass
        i += 1

    stage = STAGES[min(stage_idx, len(STAGES) - 1)]
    # If we need to re-ask, stay on same stage (already handled by not advancing).
    # pending_reask is implicit via reask_counts vs filled slots.
    _ = pending_reask
    return stage, slots, user_turns


def looks_off_topic(reply: str) -> bool:
    low = reply.lower()
    banned = ("bonheur", "blague", "rire", "je m'appelle camille et j'ai", "mon cv")
    if any(b in low for b in banned):
        return True
    if low.startswith("j'ai ") and "?" not in reply:
        return True
    return False


def naturalize_prompt(stage: str, scripted: str, job: dict[str, Any], history: list) -> list[dict]:
    """Build Ollama messages: Qwen only polishes the controlled line."""
    system = (
        "Tu es Camille, assistante IA de recrutement pour une agence d'intérim française. "
        "Tu reformules UNIQUEMENT le message imposé ci-dessous en français naturel et professionnel. "
        "Conserve tous les faits (agence, poste, lieu, dates, horaires, salaire, tâches). "
        "1 à 4 phrases maximum. Au plus UNE question à la fin. "
        "N'invente aucune information. Pas de décision d'embauche. Pas de balises <think>. "
        "Tu n'es pas le candidat."
    )
    recent = [h for h in history if h.get("role") in ("user", "assistant")][-4:]
    msgs: list[dict] = [{"role": "system", "content": system}]
    for h in recent:
        msgs.append({"role": h["role"], "content": str(h["content"])[:600]})
    msgs.append(
        {
            "role": "user",
            "content": (
                f"Étape={stage}. "
                f"Reformule en gardant TOUS les faits de ce message (ne raccourcis pas jusqu'à perdre le sens) :\n"
                f"« {scripted} »"
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
    """
    Application-controlled interview step.
    Returns the next Camille reply; Qwen is optional polish (caller invokes LLM).
    """
    job = job or load_job()
    stage, slots, user_turns = reconstruct_state(history)

    if user_turns >= MAX_USER_TURNS and stage != "closing":
        stage = "closing"

    # Fresh interview: deliver intro
    if not history:
        line = scripted_line("intro", job)
        return TurnResult(
            reply=line,
            stage="intro",
            done=False,
            slots=slots,
            mode_hint="scripted" if demo else "naturalize",
            progress_turn=0,
        )

    last_user = None
    for h in reversed(history):
        if h.get("role") == "user":
            last_user = str(h.get("content", "")).strip()
            break

    # Mid-flow factual question → answer from JSON, then resume current stage question
    if last_user:
        # Determine stage *before* consuming this user message for interruption check.
        # reconstruct_state already advanced if the answer filled a slot. For interruptions,
        # reconstruct_state does not advance — stage is still the open one.
        # But if interrupt was detected during reconstruct, we didn't advance — good.
        # We need to know if THIS last message was an interruption.
        # Recompute stage as if last user message weren't processed for slot fill when it's an interrupt.
        pre_stage, pre_slots, _ = reconstruct_state(history[:-1] if history[-1].get("role") == "user" else history)
        topic = detect_interruption(last_user, pre_stage) if last_user else None
        if topic:
            answer = answer_job_topic(topic, job)
            # Resume: ask the scripted question for the still-open stage
            resume_stage = pre_stage if pre_stage != "intro" else "experience"
            # If still on intro and they asked something, answer then continue to experience after
            if pre_stage == "intro":
                resume_q = scripted_line("experience", job)
                resume_stage = "experience"
            else:
                reask = bool(pre_slots.reask_counts.get(resume_stage))
                resume_q = scripted_line(resume_stage, job, reask=reask)
            reply = f"{answer} {resume_q}"
            return TurnResult(
                reply=reply,
                stage=resume_stage,
                done=False,
                slots=pre_slots,
                mode_hint="scripted" if demo else "naturalize",
                interrupted=True,
                progress_turn=user_turns,
            )

    # Force closing if we've reached it
    if stage == "closing":
        line = scripted_line("closing", job)
        # Finalize missing fields
        if not slots.experience and "expérience" not in slots.missing:
            slots.missing.append("expérience")
        if not slots.availability and "disponibilité" not in slots.missing:
            slots.missing.append("disponibilité")
        if not slots.accepted_hours and "horaires acceptés" not in slots.missing:
            slots.missing.append("horaires acceptés")
        if not slots.salary_expectations and "attentes salariales" not in slots.missing:
            slots.missing.append("attentes salariales")
        return TurnResult(
            reply=line,
            stage="closing",
            done=True,
            slots=slots,
            mode_hint="scripted" if demo else "naturalize",
            progress_turn=user_turns,
        )

    reask = False
    if stage == "experience" and slots.experience is None and slots.reask_counts.get("experience"):
        reask = True
    if stage == "availability" and slots.availability is None and slots.reask_counts.get("availability"):
        reask = True
    if stage == "hours" and slots.accepted_hours is None and slots.reask_counts.get("hours"):
        reask = True
    if stage == "salary" and slots.salary_expectations is None and slots.reask_counts.get("salary"):
        reask = True

    line = scripted_line(stage, job, reask=reask)
    return TurnResult(
        reply=line,
        stage=stage,
        done=False,
        slots=slots,
        mode_hint="scripted" if demo else "naturalize",
        progress_turn=user_turns,
    )


def build_report(history: list[dict], job: dict[str, Any] | None = None) -> dict[str, Any]:
    job = job or load_job()
    stage, slots, user_turns = reconstruct_state(history)
    # Ensure missing reflects end state
    if not slots.experience and "expérience" not in slots.missing:
        slots.missing.append("expérience")
    if not slots.availability and "disponibilité" not in slots.missing:
        slots.missing.append("disponibilité")
    if not slots.accepted_hours and "horaires acceptés" not in slots.missing:
        slots.missing.append("horaires acceptés")
    if not slots.salary_expectations and "attentes salariales" not in slots.missing:
        slots.missing.append("attentes salariales")

    user_msgs = [str(h.get("content", "")).strip() for h in history if h.get("role") == "user"]
    name = None
    name_m = re.search(
        r"(?:je m'appelle|je suis|mon nom est)\s+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][\wÀ-ÿ'-]+)",
        "\n".join(user_msgs),
        flags=re.I,
    )
    if name_m:
        # Avoid capturing "Je suis disponible" etc.
        candidate = name_m.group(1)
        if candidate.lower() not in {
            "disponible",
            "débutant",
            "debutant",
            "débutante",
            "prêt",
            "prete",
            "prête",
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
        "last_stage": stage,
        "user_turns": user_turns,
        "neutral_summary": " ".join(facts),
        "history": history,
        "scoring": None,
        "ranking": None,
        "hiring_recommendation": None,
    }
