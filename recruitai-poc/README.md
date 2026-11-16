# RecruitAI POC — local structured AI interview (V0.3)

A deliberately small **technical proof of concept** for French temporary staffing agencies. Camille conducts a structured ~5-minute interview for a fictional warehouse role. Runs on a Mac with 8 GB RAM. No Node dependencies, no Python packages for the server. **Never use or commit real candidate data.**

## Features (V0.3)
- French interview led by an **application state machine** (not free-form chat)
- Demo job: **Interim Express** — Agent de quai / manutentionnaire, Lyon (`data/demo_job.json`)
- Local **Ollama Qwen3 0.6B** used only to naturalize scripted lines
- Scripted fallbacks when Qwen digresses or is unavailable
- **Push-to-talk** microphone capture in the browser
- Local speech-to-text via **whisper.cpp** (`ggml-tiny`)
- Text input fallback and editable transcription
- Offline scripted demo mode when Ollama is unavailable
- Lightweight animated 2D interviewer (Camille)
- Speech output via browser `speechSynthesis` (offline **not guaranteed**)
- Factual JSON report (experience, availability, hours, salary, questions, missing fields) — **no scoring / ranking / hiring decision**
- In-memory only; binds to `127.0.0.1` by default

## Interview flow
1. Camille introduces herself as an AI and briefly explains the job
2. Logistics / manual-handling experience
3. Availability (start date resolved at runtime as next Monday)
4. Working hours (`6:00–13:00` or `13:00–20:00`)
5. Salary (€12.50 gross/hour — facts only from the JSON file)
6. Candidate questions
7. Closing (thanks, no hiring decision)

Camille asks **one question at a time**, answers mid-interview questions about salary/hours/duties from the JSON file, then resumes the script.

## Quick start (macOS Apple Silicon)

1. Install [Ollama](https://ollama.com/download) (official macOS app — **not Homebrew** for this machine).
2. Pull the model: `ollama pull qwen3:0.6b` (~523 MB).
3. Ensure **FFmpeg** is available (`ffmpeg -version`).
4. Install / build whisper.cpp once:
   ```bash
   chmod +x scripts/setup_whisper.sh
   ./scripts/setup_whisper.sh
   ```
5. Start the server from this folder:
   ```bash
   python3 server.py
   ```
6. Open **http://127.0.0.1:8765**.

Optional: check **Mode démo sans Ollama** to exercise the UI without a model.

## Architecture

```
Browser (HTML/CSS/JS, MediaRecorder, speechSynthesis)
    → Python stdlib HTTP (127.0.0.1:8765)
        → interview.py state machine + data/demo_job.json
        → Ollama localhost (Qwen3 naturalization only)
        → ffmpeg → whisper.cpp tiny (local STT)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SETUP.md](docs/SETUP.md).

## Tests

```bash
python3 tests/test_server.py
```

Covers: job JSON, experienced / beginner candidates, salary interruption, unavailable next Monday, incomplete answers, HTTP APIs, optional Ollama + whisper.

## Security and compliance
- Experimental only. Use synthetic answers. Job data is fictional.
- No auth, HTTPS, audit log, consent workflow, or production hardening.
- Never expose the server to the internet or use with real candidates.
- Browser TTS may use system/cloud voices depending on OS/browser — document this before claiming full offline voice I/O.
- Public repos must never include recordings, applicant data, secrets, or private resumes.

## Scope
See [docs/POC-SCOPE.md](docs/POC-SCOPE.md).

## License
MIT for the code in this repository. External models/tools (Ollama, Qwen, whisper.cpp, browser voices) have separate licenses.
