# RecruitAI POC — local structured AI interview (V0.4)

A deliberately small **technical proof of concept** for French temporary staffing agencies. Camille conducts a structured ~5-minute interview for a fictional warehouse role. Runs on a Mac with 8 GB RAM. No Node dependencies, no Python packages for the server. **Never use or commit real candidate data.**

## Features (V0.4)
- French **conversational** interview: intent detection + conditional stage progression
- Demo job: **Interim Express** — Agent de quai / manutentionnaire, Lyon (`data/demo_job.json`)
- Local **Ollama Qwen3 0.6B** naturalizes composed replies (acknowledgments, follow-ups)
- Deterministic fallbacks when Qwen digresses or is unavailable
- Handles clarification, job questions, incomplete / multi-slot answers, contradictions
- **Hands-free voice loop** (Web Audio VAD + silence end → whisper → auto-send); pause/resume
- Local speech-to-text via **whisper.cpp** (`ggml-tiny`)
- Text input fallback always available
- Offline scripted demo mode when Ollama is unavailable
- Lightweight animated 2D interviewer (Camille)
- Speech output via browser `speechSynthesis` (offline **not guaranteed**)
- Factual JSON report (experience, availability, hours, salary, questions, missing fields) — **no scoring / ranking / hiring decision**
- In-memory only; binds to `127.0.0.1` by default

## Interview flow
Camille collects the same information but **does not advance blindly** after every message:

1. Intro as AI + brief job explanation
2. Experience (relevant follow-up when useful)
3. Availability
4. Working hours (aligns custom hours to the two official slots)
5. Salary expectations
6. Candidate questions
7. Closing (no hiring decision)

Intents: `ANSWER`, `QUESTION_ABOUT_JOB`, `CLARIFICATION_REQUEST`, `INCOMPLETE_ANSWER`, `OFF_TOPIC`, `END_INTERVIEW`.  
Job facts only from `data/demo_job.json`. No `Question :` / `Réponse :` prefixes.

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
Browser (HTML/CSS/JS, Web Audio VAD, MediaRecorder, speechSynthesis)
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
