"""Lightweight stdlib tests for RecruitAI conversational interview (no third-party deps)."""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import interview  # noqa: E402
import server  # noqa: E402

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


def http_json(method: str, url: str, data: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read()
        return resp.status, json.loads(body.decode())


def run_server():
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def drive(answers: list[str]) -> tuple[list[dict], list[interview.TurnResult]]:
    job = interview.load_job()
    history: list[dict] = []
    turns: list[interview.TurnResult] = []
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


def test_job_and_monday():
    job = interview.load_job()
    check("job agency", job["agency"] == "Interim Express")
    check("job salary", "12,50" in job["salary_note"])
    wed = date(2026, 11, 18)
    check("next monday", interview.next_monday(wed) == date(2026, 11, 23))


def test_strip_prefixes():
    check("strip Question:", interview.strip_roleplay_prefixes("Question : Bonjour") == "Bonjour")
    check("strip think", server.strip_think("<think>x</think>Question : Salut") == "Salut")


def test_experienced_candidate():
    history, turns = drive(
        [
            "Oui.",
            "Oui, chez Amazon pendant deux mois.",
            "Je préparais les commandes et je faisais l'emballage.",
            "Je suis disponible dès mercredi.",
            "Le créneau 6:00–13:00.",
            "Oui, ça me va.",
            "Non merci.",
        ]
    )
    last = turns[-1]
    check("exp done", last.done is True)
    check("exp remembers amazon", last.slots.experience is not None and "Amazon" in last.slots.experience)
    check("exp followup asked", any("concrètement" in t.reply.lower() or "tâches" in t.reply.lower() for t in turns))
    # After Amazon, should NOT jump straight to availability without follow-up
    after_amazon = turns[2]  # intro reply, after oui, after amazon
    check("exp stays for followup", after_amazon.stage == "experience", after_amazon.stage)
    check("exp no Question prefix", all(not t.reply.lower().startswith("question :") for t in turns))
    report = interview.build_report(history)
    check("exp report no score", report["scoring"] is None and report["hiring_recommendation"] is None)
    check("exp report availability", report["availability"] is not None and "mercredi" in report["availability"].lower())


def test_beginner_candidate():
    history, turns = drive(
        [
            "Oui je suis prêt.",
            "Non, je n'ai jamais travaillé en logistique, je suis débutant.",
            "Disponible immédiatement.",
            "Les deux créneaux.",
            "Oui.",
            "Aucune question.",
        ]
    )
    last = turns[-1]
    check("beginner done", last.done)
    check("beginner experience", last.slots.experience is not None and "débutant" in last.slots.experience.lower())
    # Beginner should not get experience task follow-up
    check(
        "beginner no task followup",
        not any("concrètement" in t.reply.lower() for t in turns),
    )


def test_unexpected_job_questions():
    history, turns = drive(
        [
            "Oui.",
            "Oui, un an en manutention sur quai, chargement et tri de colis.",
            "Ça dépend, c'est combien le salaire ?",
        ]
    )
    last = turns[-1]
    check("unexpected salary intent", last.intent == "QUESTION_ABOUT_JOB", last.intent)
    check("unexpected salary fact", "12,50" in last.reply)
    check(
        "unexpected resumes interview",
        "recherchez" in last.reply.lower()
        or "correspond" in last.reply.lower()
        or "disponible" in last.reply.lower()
        or "attente" in last.reply.lower(),
        last.reply,
    )
    # Continue after salary digression with availability in same breath style
    history.append({"role": "user", "content": "Oui pour le salaire, mais je ne peux commencer que mercredi."})
    t = interview.process_turn(history, interview.load_job(), demo=True)
    check("mixed salary+avail ack", "mercredi" in t.reply.lower() or t.stage in ("availability", "hours", "salary", "questions"), f"{t.stage} {t.reply}")


def test_clarification_request():
    history, turns = drive(
        [
            "Oui.",
            "Deux ans en logistique, préparation de commandes.",
            "Disponible la semaine prochaine.",
            "10h à 15h avec 2 heures de pause.",
        ]
    )
    # Custom hours → alignment follow-up, NOT advance
    last = turns[-1]
    check("custom hours stay", last.stage == "hours", last.stage)
    check("custom hours align ask", "6:00" in last.reply or "6h" in last.reply.lower() or "créneau" in last.reply.lower(), last.reply)
    check("custom hours acknowledged", "10h" in last.reply or "15h" in last.reply or "comprends" in last.reply.lower() or "préférence" in last.reply.lower(), last.reply)

    history.append({"role": "user", "content": "Comment ça ?"})
    t = interview.process_turn(history, interview.load_job(), demo=True)
    check("clarify intent", t.intent == "CLARIFICATION_REQUEST", t.intent)
    check("clarify stays hours", t.stage == "hours", t.stage)
    check("clarify reformulates", "créneau" in t.reply.lower() or "horaire" in t.reply.lower() or "6:00" in t.reply or "6h" in t.reply.lower(), t.reply)
    check("clarify does not jump to questions", "avez-vous des questions" not in t.reply.lower(), t.reply)


def test_multi_answer_at_once():
    history, turns = drive(
        [
            "Oui.",
            "Débutant, jamais travaillé en entrepôt. Je suis dispo dès lundi et le matin 6h-13h me va, le salaire aussi.",
        ]
    )
    last = turns[-1]
    # Should have pulled multiple slots from one utterance where possible
    check("multi experience", last.slots.experience is not None)
    # May advance past some filled slots
    report = interview.build_report(history + [{"role": "assistant", "content": last.reply}])
    # Drive remaining minimally
    while not last.done and len([h for h in history if h["role"] == "user"]) < 12:
        # If salary/hours/avail already filled, answers can be short confirmations
        history.append({"role": "user", "content": "Oui, c'est bon, pas d'autre question."})
        last = interview.process_turn(history, interview.load_job(), demo=True)
        history.append({"role": "assistant", "content": last.reply})
        if last.done:
            break
    check("multi eventually completes or progress", last.done or last.stage in ("questions", "closing", "salary", "hours"), last.stage)


def test_interrupt_and_resume():
    job = interview.load_job()
    history: list[dict] = []
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})
    history.append({"role": "user", "content": "Oui."})
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})
    history.append({"role": "user", "content": "Quelles sont les tâches exactes ?"})
    t = interview.process_turn(history, job, demo=True)
    check("interrupt duties", t.interrupted and "colis" in t.reply.lower(), t.reply)
    check("interrupt resumes experience", t.stage == "experience", t.stage)
    history.append({"role": "assistant", "content": t.reply})
    history.append({"role": "user", "content": "Oui, j'ai fait du tri de colis pendant 6 mois."})
    t = interview.process_turn(history, job, demo=True)
    check("resume advances after answer", t.stage == "availability", t.stage)


def test_contradictory_information():
    history, turns = drive(
        [
            "Oui.",
            "Non je suis débutant.",
            "Je suis disponible lundi prochain.",
            "En fait non, seulement dans un mois.",
            "Les deux horaires.",
            "Oui.",
            "Non.",
        ]
    )
    last = turns[-1]
    check("contradiction done", last.done)
    check(
        "contradiction keeps latest avail",
        last.slots.availability is not None and "mois" in last.slots.availability.lower(),
        str(last.slots.availability),
    )
    report = interview.build_report(history)
    check(
        "contradiction noted or latest kept",
        bool(report.get("contradictions")) or "mois" in (report.get("availability") or "").lower(),
        str(report.get("contradictions")),
    )


def test_incomplete_answers():
    history, turns = drive(
        [
            "Oui.",
            "euh",
            "bof",
            "Disponible demain matin.",
            "6h-13h",
            "Oui",
            "Non",
        ]
    )
    last = turns[-1]
    check("incomplete finishes", last.done, last.stage)
    report = interview.build_report(history)
    check("incomplete marks missing exp", "expérience" in report.get("missing_information", []), str(report.get("missing_information")))


def test_no_invention():
    job = interview.load_job()
    ans = interview.answer_job_topic("salary", job)
    check("no invent salary", "12,50" in ans and "prime" not in ans.lower())
    # Full flow must not invent benefits
    _, turns = drive(["Oui.", "Débutant.", "Dispo lundi.", "Les deux.", "Oui.", "Non."])
    blob = " ".join(t.reply.lower() for t in turns)
    check("no invent benefits", "mutuelle" not in blob and "13 €" not in blob and "13€" not in blob)


def test_example_conversation_quality():
    """Mirror the target dialogue quality from the spec."""
    history, turns = drive(
        [
            "Oui.",
            "Oui, chez Amazon pendant deux mois.",
            "Je préparais les commandes et je faisais l'emballage.",
            "Ça dépend, c'est combien le salaire ?",
            "Oui, mais je ne peux commencer que mercredi.",
            "Le matin, 6h–13h.",
            "Non merci, pas d'autre question.",
        ]
    )
    replies = [t.reply for t in turns]
    check("quality followup tasks", any("concrètement" in r.lower() or "tâches" in r.lower() for r in replies))
    check("quality salary from json", any("12,50" in r for r in replies))
    check("quality remembers amazon", any(t.slots.experience and "Amazon" in t.slots.experience for t in turns))
    check("quality remembers / advances", turns[-1].done, turns[-1].stage)
    stages = [t.stage for t in turns]
    if "availability" in stages:
        idx = stages.index("availability")
        later = " ".join(t.reply.lower() for t in turns[idx:])
        check("quality no repeat experience q", "avez-vous déjà travaillé" not in later, later[:120])


def test_spec_messy_stt_conversation():
    """Exact regression conversation from the V0.5 brief (messy STT-like inputs)."""
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
    check("spec no name pret", report.get("candidate_name") not in ("pret", "prêt", "Pret", "Prêt"))
    check(
        "spec restaurant",
        report.get("experience") is not None and "restauration" in (report.get("experience") or "").lower(),
        str(report.get("experience")),
    )
    check(
        "spec exp followup",
        any("restauration" in t.reply.lower() and ("quoi" in t.reply.lower() or "faisiez" in t.reply.lower()) for t in turns),
    )
    check(
        "spec immediate avail",
        report.get("availability_normalized") is not None
        and "immédiat" in (report.get("availability_normalized") or "").lower(),
        str(report.get("availability_normalized")),
    )
    hours = (report.get("hours_normalized") or report.get("accepted_working_hours") or "").replace("–", "-")
    check("spec le premier hours", "6:00" in hours or "6h" in hours.lower(), hours)
    hours_asks = sum(1 for t in turns if "créneau" in t.reply.lower() or "6:00" in t.reply)
    check("spec hours not thrice", hours_asks <= 2, f"asks={hours_asks}")
    check("spec no Je retiens", all("je retiens" not in t.reply.lower() for t in turns))


def test_contextual_hours_aliases():
    job = interview.load_job()
    first = job["working_hours"][0]
    for phrase in (
        "Le premier.",
        "Celui du matin",
        "Le premier créneau",
        "Celui de 6h",
        "Plutôt le matin",
        "les deux me vont",
        "Aucun des deux",
    ):
        got = interview.resolve_hours_choice(phrase, job, f"créneaux : {' ou '.join(job['working_hours'])}")
        check(f"hours ctx {phrase!r}", got is not None, str(got))
    check("hours ctx premier value", interview.resolve_hours_choice("le premier", job, "")[1] == first)


def test_name_extraction_guards():
    check("name reject pret", interview.extract_candidate_name("yes je suis pret") is None)
    check("name reject prêt", interview.extract_candidate_name("Je suis prêt.") is None)
    check("name accept", interview.extract_candidate_name("Je m'appelle Raphaël.") == "Raphaël")


def test_health(port: int):
    status, data = http_json("GET", f"http://127.0.0.1:{port}/api/health")
    check("health ok", status == 200 and data.get("ok") is True)
    check("health job", data.get("job", {}).get("agency") == "Interim Express")
    check("health version 0.5", data.get("version") == "0.5", str(data.get("version")))
    check("health has model", bool(data.get("model")), str(data.get("model")))
    check("health has fallback", bool(data.get("fallback_model")), str(data.get("fallback_model")))


def test_next_demo(port: int):
    payload = json.dumps({"history": [], "demo": True}).encode()
    status, data = http_json(
        "POST",
        f"http://127.0.0.1:{port}/api/next",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    check("demo next", status == 200 and data.get("mode") == "scripted")
    check("demo no Question prefix", not data["reply"].lower().startswith("question :"), data["reply"][:80])


def test_next_invalid(port: int):
    payload = json.dumps({"history": "bad"}).encode()
    try:
        http_json(
            "POST",
            f"http://127.0.0.1:{port}/api/next",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        check("invalid history rejected", False)
    except urllib.error.HTTPError as exc:
        check("invalid history rejected", exc.code == 400)


def test_report_http(port: int):
    history, _ = drive(
        [
            "Oui.",
            "Deux ans manutention, chargement.",
            "Dispo mercredi.",
            "13:00–20:00.",
            "Oui.",
            "Non.",
        ]
    )
    payload = json.dumps({"history": history}).encode()
    status, data = http_json(
        "POST",
        f"http://127.0.0.1:{port}/api/report",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    check("report status", status == 200)
    check("report no scoring", data.get("scoring") is None)
    check("report job", "manutentionnaire" in data.get("target_job", "").lower())


def test_transcribe_empty(port: int):
    boundary = "----recruitai"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="audio"; filename="empty.webm"\r\n'
        "Content-Type: audio/webm\r\n\r\n"
        "xx\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/transcribe",
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        urllib.request.urlopen(req, timeout=30)
        check("empty audio rejected", False)
    except urllib.error.HTTPError as exc:
        check("empty audio rejected", exc.code in (400, 503))


def test_transcribe_french(port: int):
    w = server.whisper_ready()
    if not (w["bin"] and w["model"] and w["ffmpeg"]):
        print("SKIP  french transcription (whisper/ffmpeg missing)")
        return
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="recruitai-test-"))
    try:
        aiff = tmp / "fr.aiff"
        wav = tmp / "fr.wav"
        subprocess.run(
            ["say", "-v", "Thomas", "-o", str(aiff), "Bonjour, j'ai de l'expérience en manutention."],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(aiff), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)],
            check=True,
            capture_output=True,
        )
        audio = wav.read_bytes()
        boundary = "----recruitai"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="audio"; filename="fr.wav"\r\n'
            "Content-Type: audio/wav\r\n\r\n"
        ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()
        status, data = http_json(
            "POST",
            f"http://127.0.0.1:{port}/api/transcribe",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        text = (data.get("text") or "").lower()
        check("transcribe status", status == 200)
        check("transcribe french", any(k in text for k in ("bonjour", "expérience", "experience", "manutention")))
    finally:
        for p in tmp.iterdir():
            p.unlink(missing_ok=True)
        tmp.rmdir()


def test_ollama_optional(port: int):
    if os.getenv("SKIP_OLLAMA") == "1":
        print("SKIP  ollama live")
        return
    try:
        payload = json.dumps({"history": [], "demo": False}).encode()
        status, data = http_json(
            "POST",
            f"http://127.0.0.1:{port}/api/next",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        reply = data.get("reply") or ""
        check("ollama next", status == 200)
        check("ollama no Question prefix", not reply.lower().startswith("question :"), reply[:100])
        check("ollama no think", "<think>" not in reply)
        print(f"INFO  ollama reply={reply!r}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        if exc.code == 503:
            print(f"SKIP  ollama unavailable ({body[:120]})")
        else:
            check("ollama next", False, body[:200])


def test_handsfree_frontend_contract():
    html = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "public" / "app.js").read_text(encoding="utf-8")
    for needle in ("pause-voice", "handsfree", "mic-status", "silence-ms", "vad-meter", "phase-badge"):
        check(f"html has {needle}", needle in html)
    for needle in (
        "CAMILLE_SPEAKING",
        "LISTENING",
        "CANDIDATE_SPEAKING",
        "TRANSCRIBING",
        "THINKING",
        "startListening",
        "afterCamilleSpoke",
        "silenceMs",
        "createAnalyser",
        "/api/transcribe",
    ):
        check(f"js has {needle}", needle in js)
    check("js removed push-to-talk labels", "Commencer à parler" not in js)


def test_ready_phrase_does_not_fill_experience():
    job = interview.load_job()
    history = []
    r = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": r.reply})
    history.append({"role": "user", "content": "Je suis prêt."})
    r = interview.process_turn(history, job, demo=True)
    check("ready advances past intro", r.stage == "experience", r.stage)
    check("ready not stored as experience", r.slots.experience is None)
    history.append({"role": "assistant", "content": r.reply})
    history.append({"role": "user", "content": "Je suis prêt."})
    r = interview.process_turn(history, job, demo=True)
    check("second ready incomplete or reask", "logistique" in r.reply.lower() or "manutention" in r.reply.lower(), r.reply[:80])
    check("second ready still no fake experience", r.slots.experience in (None, "(non précisé)"))


def test_naturalize_rejects_stale_intro():
    from server import _naturalize_keeps_facts

    job = interview.load_job()
    scripted = interview.stage_question("experience", job)
    stale = "Bonjour, êtes-vous prêt(e) à commencer cet entretien ?"
    check("stale intro rejected on experience", not _naturalize_keeps_facts("experience", scripted, stale, job))
    good = "Parfait. Avez-vous déjà travaillé en logistique ou en manutention ?"
    check("good experience naturalize accepted", _naturalize_keeps_facts("experience", scripted, good, job))


def main():
    test_job_and_monday()
    test_strip_prefixes()
    test_experienced_candidate()
    test_beginner_candidate()
    test_unexpected_job_questions()
    test_clarification_request()
    test_multi_answer_at_once()
    test_interrupt_and_resume()
    test_contradictory_information()
    test_incomplete_answers()
    test_no_invention()
    test_example_conversation_quality()
    test_spec_messy_stt_conversation()
    test_contextual_hours_aliases()
    test_name_extraction_guards()
    test_handsfree_frontend_contract()
    test_ready_phrase_does_not_fill_experience()
    test_naturalize_rejects_stale_intro()
    httpd, port = run_server()
    time.sleep(0.2)
    try:
        test_health(port)
        test_next_demo(port)
        test_next_invalid(port)
        test_report_http(port)
        test_transcribe_empty(port)
        test_transcribe_french(port)
        test_ollama_optional(port)
    finally:
        httpd.shutdown()
    print(f"\n{PASSED} passed, {FAILED} failed")
    raise SystemExit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
