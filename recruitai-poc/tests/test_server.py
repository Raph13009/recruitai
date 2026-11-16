"""Lightweight stdlib tests for RecruitAI V0.3 (no third-party deps)."""
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
from datetime import date, timedelta

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


def run_scripted(answers: list[str]) -> tuple[list[dict], interview.TurnResult]:
    """Drive a full demo interview with scripted Camille lines."""
    job = interview.load_job()
    history: list[dict] = []
    last = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": last.reply})
    for ans in answers:
        history.append({"role": "user", "content": ans})
        last = interview.process_turn(history, job, demo=True)
        history.append({"role": "assistant", "content": last.reply})
        if last.done:
            break
    return history, last


def test_job_json():
    job = interview.load_job()
    check("job agency", job.get("agency") == "Interim Express")
    check("job title", "manutentionnaire" in job.get("job_title", "").lower())
    check("job location", job.get("location") == "Lyon")
    check("job salary note", "12,50" in job.get("salary_note", ""))
    check("job hours", job.get("working_hours") == ["6:00–13:00", "13:00–20:00"])
    check("job start date resolved", bool(job.get("start_date")) and bool(job.get("start_date_fr")))
    # next Monday must be a Monday
    d = date.fromisoformat(job["start_date"])
    check("job start is Monday", d.weekday() == 0)
    check("job start in future or today+7 rule", d > date.today() or d == date.today() + timedelta(days=7) or d > date.today())


def test_next_monday():
    # Wednesday → following Monday
    wed = date(2026, 11, 18)
    check("next monday from wed", interview.next_monday(wed) == date(2026, 11, 23))
    # Monday → following Monday (strict next)
    mon = date(2026, 11, 16)
    check("next monday from mon", interview.next_monday(mon) == date(2026, 11, 23))


def test_scenario_with_experience():
    answers = [
        "Oui, je suis prêt.",
        "Oui, j'ai deux ans d'expérience en logistique et manutention sur quai.",
        "Je suis disponible dès lundi prochain.",
        "Les deux créneaux me conviennent, matin et après-midi.",
        "Oui, 12,50 € brut me convient.",
        "Non, pas de question.",
    ]
    history, last = run_scripted(answers)
    check("exp scenario done", last.done is True, str(last))
    check("exp scenario stage closing", last.stage == "closing")
    check("exp scenario experience filled", last.slots.experience is not None and "logistique" in last.slots.experience.lower())
    check("exp scenario hours filled", last.slots.accepted_hours is not None)
    check("exp scenario salary filled", last.slots.salary_expectations is not None)
    report = interview.build_report(history)
    check("exp report no scoring", report.get("scoring") is None and report.get("hiring_recommendation") is None)
    check("exp report job", "manutentionnaire" in report.get("target_job", "").lower())
    check("exp report experience field", report.get("experience") is not None)


def test_scenario_without_experience():
    answers = [
        "Bonjour, d'accord.",
        "Non, je n'ai jamais travaillé en logistique, je suis débutant.",
        "Disponible immédiatement, dès que possible.",
        "Je préfère le créneau 6:00–13:00.",
        "Oui ça correspond à mes attentes.",
        "Aucune question merci.",
    ]
    history, last = run_scripted(answers)
    check("noexp done", last.done is True)
    check(
        "noexp experience stored",
        last.slots.experience is not None and ("débutant" in last.slots.experience.lower() or "jamais" in last.slots.experience.lower()),
    )
    report = interview.build_report(history)
    check("noexp missing not experience", "expérience" not in report.get("missing_information", []))


def test_scenario_salary_midway():
    job = interview.load_job()
    history: list[dict] = []
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})
    history.append({"role": "user", "content": "Oui."})
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})
    check("before interrupt stage experience", t.stage == "experience", t.stage)

    history.append({"role": "user", "content": "C'est combien le salaire ?" })
    t = interview.process_turn(history, job, demo=True)
    check("salary interrupt flagged", t.interrupted is True, str(t))
    check("salary interrupt mentions 12,50", "12,50" in t.reply, t.reply)
    check("salary interrupt resumes experience", t.stage == "experience", t.stage)
    check("salary interrupt still asks experience", "logistique" in t.reply.lower() or "manutention" in t.reply.lower(), t.reply)
    history.append({"role": "assistant", "content": t.reply})

    # Continue coherently after interruption
    history.append({"role": "user", "content": "Oui, un an en manutention."})
    t = interview.process_turn(history, job, demo=True)
    check("after interrupt advances", t.stage == "availability", t.stage)
    history.append({"role": "assistant", "content": t.reply})
    for ans in [
        "Je suis disponible la semaine prochaine.",
        "Les deux horaires sont ok.",
        "Oui pour le salaire.",
        "Non merci.",
    ]:
        history.append({"role": "user", "content": ans})
        t = interview.process_turn(history, job, demo=True)
        history.append({"role": "assistant", "content": t.reply})
        if t.done:
            break
    check("salary midway finishes", t.done is True, t.stage)


def test_scenario_unavailable_monday():
    answers = [
        "Oui.",
        "Oui, j'ai déjà fait de la manutention.",
        "Je ne suis pas disponible lundi prochain, seulement dans trois semaines.",
        "Le créneau 13:00–20:00 uniquement.",
        "Le salaire me va.",
        "Pas de question.",
    ]
    history, last = run_scripted(answers)
    check("unavail done", last.done is True)
    check(
        "unavail availability kept",
        last.slots.availability is not None
        and ("trois semaines" in last.slots.availability.lower() or "pas disponible" in last.slots.availability.lower()),
        str(last.slots.availability),
    )
    report = interview.build_report(history)
    check("unavail no hiring decision", report.get("hiring_recommendation") is None)


def test_scenario_incomplete_answers():
    job = interview.load_job()
    history: list[dict] = []
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})
    history.append({"role": "user", "content": "Ok."})
    t = interview.process_turn(history, job, demo=True)
    history.append({"role": "assistant", "content": t.reply})

    # Incomplete experience → reask
    history.append({"role": "user", "content": "euh"})
    t = interview.process_turn(history, job, demo=True)
    check("incomplete reask experience", t.stage == "experience" and ("préciser" in t.reply.lower() or "logistique" in t.reply.lower()), t.reply)
    history.append({"role": "assistant", "content": t.reply})

    # Second incomplete → mark missing and move on
    history.append({"role": "user", "content": "bof"})
    t = interview.process_turn(history, job, demo=True)
    check("incomplete advances after 2", t.stage == "availability", t.stage)
    check("incomplete marks missing", "expérience" in t.slots.missing, str(t.slots.missing))
    history.append({"role": "assistant", "content": t.reply})

    for ans in [
        "Disponible dès maintenant.",
        "Les deux.",
        "Oui.",
        "Non.",
    ]:
        history.append({"role": "user", "content": ans})
        t = interview.process_turn(history, job, demo=True)
        history.append({"role": "assistant", "content": t.reply})
        if t.done:
            break
    check("incomplete scenario finishes", t.done is True)
    report = interview.build_report(history)
    check("incomplete report lists missing", "expérience" in report.get("missing_information", []))


def test_never_invents_extra_job_facts():
    job = interview.load_job()
    ans = interview.answer_job_topic("salary", job)
    check("salary answer uses json", "12,50" in ans)
    check("salary answer no invention", "13" not in ans and "prime" not in ans.lower())
    duties = interview.answer_job_topic("duties", job)
    check("duties from json", "colis" in duties.lower())


def test_health(port: int):
    status, data = http_json("GET", f"http://127.0.0.1:{port}/api/health")
    check("health ok", status == 200 and data.get("ok") is True)
    check("health version", data.get("version") == "0.3")
    check("health job", data.get("job", {}).get("agency") == "Interim Express")
    check("health whisper keys", "whisper" in data)


def test_next_demo(port: int):
    payload = json.dumps({"history": [], "demo": True}).encode()
    status, data = http_json(
        "POST",
        f"http://127.0.0.1:{port}/api/next",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    check("demo next", status == 200 and "reply" in data and data.get("mode") == "scripted")
    check("demo intro stage", data.get("stage") == "intro")
    check("demo mentions Interim Express or Camille", "Camille" in data["reply"] or "Interim" in data["reply"], data["reply"][:120])


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


def test_report(port: int):
    history, last = run_scripted(
        [
            "Oui.",
            "Deux ans en logistique.",
            "Disponible lundi dans trois semaines.",
            "6:00–13:00.",
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
    check("report no scoring", data.get("scoring") is None and data.get("hiring_recommendation") is None)
    check("report job", "manutentionnaire" in data.get("target_job", "").lower())
    check("report has availability", data.get("availability") is not None)


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
            [
                "say",
                "-v",
                "Thomas",
                "-o",
                str(aiff),
                "Bonjour, j'ai trois ans d'expérience en manutention.",
            ],
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
        t0 = time.perf_counter()
        status, data = http_json(
            "POST",
            f"http://127.0.0.1:{port}/api/transcribe",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        elapsed = time.perf_counter() - t0
        text = (data.get("text") or "").lower()
        check("transcribe status", status == 200, str(data))
        check(
            "transcribe french content",
            ("expérience" in text or "experience" in text or "manutention" in text or "bonjour" in text),
            text,
        )
        print(f"INFO  transcription latency_sec≈{data.get('latency_sec')} wall={elapsed:.2f}s text={data.get('text')!r}")
        check("transcribe returns latency", isinstance(data.get("latency_sec"), (int, float)))
    finally:
        for p in tmp.iterdir():
            p.unlink(missing_ok=True)
        tmp.rmdir()


def test_strip_think():
    out = server.strip_think("<think>secret</think>Bonjour candidat")
    check("strip think", out == "Bonjour candidat")


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
        reply = (data.get("reply") or "").lower()
        check("ollama next", status == 200 and data.get("mode") in ("ollama", "scripted"))
        check(
            "ollama recruiter-ish",
            any(
                k in reply
                for k in (
                    "camille",
                    "ia",
                    "intelligence",
                    "interim",
                    "manutention",
                    "quai",
                    "bonjour",
                    "lyon",
                    "entretien",
                    "prêt",
                    "pret",
                )
            ),
            reply[:200],
        )
        check("ollama no think tags", "<think>" not in reply)
        print(f"INFO  ollama reply={data.get('reply')!r}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        if exc.code == 503:
            print(f"SKIP  ollama unavailable ({body[:120]})")
        else:
            check("ollama next", False, body[:200])


def main():
    test_strip_think()
    test_job_json()
    test_next_monday()
    test_scenario_with_experience()
    test_scenario_without_experience()
    test_scenario_salary_midway()
    test_scenario_unavailable_monday()
    test_scenario_incomplete_answers()
    test_never_invents_extra_job_facts()
    httpd, port = run_server()
    time.sleep(0.2)
    try:
        test_health(port)
        test_next_demo(port)
        test_next_invalid(port)
        test_report(port)
        test_transcribe_empty(port)
        test_transcribe_french(port)
        test_ollama_optional(port)
    finally:
        httpd.shutdown()
    print(f"\n{PASSED} passed, {FAILED} failed")
    raise SystemExit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
