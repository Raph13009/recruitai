"""Regression: mixed intents, interruptions, questions sub-state, no field overwrite."""
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


def test_btp_paris_raise_sequence():
    history, turns = drive(
        [
            "yes j'ai déjà bossé dans le BTP",
            "j'étais sur les chantiers, je faisais les sols, on était cinq",
            "je suis dispo à partir du 1er décembre, c'est sur Paris ?",
            "oui",
            "le premier créneau me convient",
            "je peux être payé plus si je travaille bien dans le futur ?",
            "ok",
            "oui",
        ]
    )
    report = interview.build_report(history)
    exp = (report.get("experience") or "").lower()
    check("btp preserved", "btp" in exp, exp)
    check("tasks preserved", "sols" in exp or "sols" in (report.get("experience_tasks") or "").lower(), str(report.get("experience_tasks")))
    check("industries BTP", "BTP" in (report.get("experience_industries") or []), str(report.get("experience_industries")))
    check("dec 1 avail", report.get("availability_date") == "2026-12-01", str(report.get("availability_date")))
    paris_turn = next(t for t in turns if "paris" in t.reply.lower() or (t.slots.candidate_questions and "paris" in t.slots.candidate_questions[-1].lower()))
    check("paris answered lyon", "lyon" in paris_turn.reply.lower() and "pas à paris" in paris_turn.reply.lower(), paris_turn.reply)
    check("mismatch addressed", "plus tardive" in paris_turn.reply.lower() or any("plus tardive" in t.reply.lower() for t in turns))
    check("first shift", "6:00" in (report.get("hours_normalized") or "").replace("–", "-"), str(report.get("hours_normalized")))
    raise_turn = next(t for t in turns if "augmentation" in t.reply.lower())
    check("raise uncertainty", "pas d'information" in raise_turn.reply.lower() and "pas garanti" in raise_turn.reply.lower(), raise_turn.reply)
    check("raise no invent increase", "augmenté de" not in raise_turn.reply.lower() and "13" not in raise_turn.reply)
    check("raise does not reask salary digits question", "12,50" not in raise_turn.reply or "correspond" not in raise_turn.reply.lower())
    listen = turns[-1]
    check("oui waits for question", listen.sub_state == interview.SUB_AWAITING_CANDIDATE_QUESTION, listen.sub_state)
    check("oui invite", "écoute" in listen.reply.lower(), listen.reply)
    check("no premature close", listen.done is False)
    check("salary did not overwrite exp", "payé plus" not in exp and "futur" not in exp, exp)


def test_mixed_avail_location_only():
    history, turns = drive(
        [
            "Oui.",
            "Débutant.",
            "Je suis disponible le 1er décembre, c'est sur Paris ?",
        ]
    )
    t = turns[-1]
    check("mixed extracts avail", t.slots.availability_date == "2026-12-01", str(t.slots.availability_date))
    check("mixed answers paris", "lyon" in t.reply.lower() and "paris" in t.reply.lower(), t.reply)
    check("mixed asks continue", "poursuivre" in t.reply.lower(), t.reply)
    check("mixed sub confirmation", t.sub_state == interview.SUB_AWAITING_CONFIRMATION, t.sub_state)


def test_correction_availability():
    history, turns = drive(
        [
            "Oui.",
            "Deux ans manutention, chargement.",
            "Dispo lundi.",
            "En fait non, seulement dans un mois.",
            "Les deux.",
            "Oui.",
            "Non.",
        ]
    )
    last = turns[-1]
    check("correction done", last.done)
    check("correction latest mois", last.slots.availability is not None and "mois" in last.slots.availability.lower(), str(last.slots.availability))


def test_raise_alone():
    history, turns = drive(
        [
            "Oui.",
            "Débutant.",
            "Dispo maintenant.",
            "Le premier.",
            "Est-ce que je peux être augmenté si je travaille bien ?",
        ]
    )
    t = turns[-1]
    check("raise alone answered", "pas d'information" in t.reply.lower(), t.reply)
    check("raise stays salary-ish", t.stage in ("salary", "questions"), t.stage)
    check("raise no 12,50 reask couplet", not ("12,50" in t.reply and "correspond" in t.reply.lower()), t.reply)


def main():
    test_btp_paris_raise_sequence()
    test_mixed_avail_location_only()
    test_correction_availability()
    test_raise_alone()
    print(f"\n{PASSED} passed, {FAILED} failed")
    raise SystemExit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
