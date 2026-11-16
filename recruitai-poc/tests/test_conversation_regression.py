"""Regression: real messy STT-like answers must be understood without looping."""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import interview  # noqa: E402

PASSED = 0
FAILED = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"PASS  {name}")
    else:
        FAILED += 1
        print(f"FAIL  {name} {detail}")


def drive(answers: list[str]):
    job = interview.load_job()
    history: list[dict] = []
    turns = []
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})
    turns.append(t)
    for ans in answers:
        history.append({"role": "user", "content": ans})
        t = interview.process_turn(history, job, demo=True)
        history.append({"role": "assistant", "content": t.reply})
        turns.append(t)
        if t.done:
            break
    return history, turns


def test_spec_conversation():
    history, turns = drive(
        [
            "yes je suis pret",
            "non jamais mais jaimerais bien et je suis curieux, jai travaillé dans la restauration",
            "je travaillais en salle pendant les services",
            "je suis dispo a partir de maintennat",
            "le premier",
            "Oui ça me va",
            "Non aucune question",
        ]
    )
    report = interview.build_report(history)

    check("no name pret", report.get("candidate_name") not in ("pret", "prêt", "Pret", "Prêt"))
    check(
        "restaurant experience",
        report.get("experience") is not None
        and "restauration" in (report.get("experience") or "").lower(),
        str(report.get("experience")),
    )
    check(
        "exp followup asked",
        any(
            "restauration" in t.reply.lower() and ("quoi" in t.reply.lower() or "faisiez" in t.reply.lower() or "quotidien" in t.reply.lower())
            for t in turns
        ),
        " | ".join(t.reply[:60] for t in turns[:5]),
    )
    check(
        "immediate availability",
        report.get("availability_normalized") is not None
        and "immédiat" in (report.get("availability_normalized") or "").lower(),
        str(report.get("availability_normalized")),
    )
    hours = (report.get("hours_normalized") or report.get("accepted_working_hours") or "").replace("–", "-")
    check("le premier => 6h-13h", "6:00" in hours or "6h" in hours.lower(), hours)

    hours_asks = sum(
        1
        for t in turns
        if "créneau" in t.reply.lower() or "6:00" in t.reply or ("horaire" in t.reply.lower() and "?" in t.reply)
    )
    check("hours not asked 3+ times", hours_asks <= 2, f"asks={hours_asks}")
    check("no Je retiens", all("je retiens" not in t.reply.lower() for t in turns))
    check("no Question prefix", all(not t.reply.lower().startswith("question :") for t in turns))


def test_hours_contextual_aliases():
    job = interview.load_job()
    first = job["working_hours"][0]
    for phrase in ("Le premier.", "Celui du matin", "Le premier créneau", "Celui de 6h", "Plutôt le matin", "les deux me vont", "Aucun des deux"):
        got = interview.resolve_hours_choice(phrase, job, f"créneaux : {' ou '.join(job['working_hours'])}")
        check(f"hours alias {phrase!r}", got is not None, str(got))
    check("premier maps first", interview.resolve_hours_choice("le premier", job, "")[1] == first)


def test_name_extraction_guards():
    check("reject pret", interview.extract_candidate_name("yes je suis pret") is None)
    check("reject prêt", interview.extract_candidate_name("Je suis prêt.") is None)
    check("accept explicit", interview.extract_candidate_name("Je m'appelle Raphaël.") == "Raphaël")


def main():
    test_name_extraction_guards()
    test_hours_contextual_aliases()
    test_spec_conversation()
    print(f"\n{PASSED} passed, {FAILED} failed")
    raise SystemExit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
