# Architecture — RecruitAI V0.4

## Components

| Layer | Tech | Role |
|-------|------|------|
| UI | Static HTML/CSS/JS in `public/` | Hands-free voice loop, Web Audio VAD, TTS, text fallback |
| API | `server.py` (Python stdlib `ThreadingHTTPServer`) | Serves UI + JSON APIs on localhost |
| Script | `interview.py` + `data/demo_job.json` | Stage machine, slot extraction, factual answers, report |
| LLM | Ollama → `qwen3:0.6b` | Optional naturalization of scripted Camille lines |
| STT | ffmpeg + whisper.cpp `ggml-tiny` | Local French transcription |
| Storage | None on disk for interviews | History in browser memory; audio temps deleted after STT |

## Frontend voice state machine

```
IDLE → CAMILLE_SPEAKING → LISTENING → CANDIDATE_SPEAKING
    → TRANSCRIBING → THINKING → CAMILLE_SPEAKING → …
```

Also: `PAUSED`, `ERROR`, `DONE`.

- **LISTENING**: mic open, AnalyserNode RMS; MediaRecorder not yet writing utterance (or waiting for speech).
- **CANDIDATE_SPEAKING**: MediaRecorder capturing; end when silence ≥ configured 1.0–2.0 s after min speech.
- **CAMILLE_SPEAKING**: VAD loop stopped; mic not used for decisions (echo protection) + short cooldown before LISTENING.
- Auto-submit transcript to `/api/next` (no manual confirm). Text form remains a fallback interrupt.

## Interview control (backend)

Stages (app-owned): `intro` → `experience` → `availability` → `hours` → `salary` → `questions` → `closing`.

Progression is **conditional** on intent + whether the current slot is actually filled:

| Intent | Behavior |
|--------|----------|
| `ANSWER` | Acknowledge, optional follow-up (max 1/stage), advance if sufficient |
| `QUESTION_ABOUT_JOB` | Answer from `demo_job.json`, then resume |
| `CLARIFICATION_REQUEST` | Reformulate previous question; do not advance |
| `INCOMPLETE_ANSWER` | Re-ask (max 2); then mark missing and move on |
| `OFF_TOPIC` | Redirect to current question |
| `END_INTERVIEW` | Closing |

Qwen naturalizes the composed reply; malformed / `Question :` output falls back. Ollama uses `think: false`.

## HTTP API

### `GET /api/health`
Model, version, job summary, whisper/ffmpeg readiness.

### `GET /api/job`
Demo job JSON with resolved start date.

### `POST /api/next`
`{ "history": [...], "demo": false }` → Camille reply + stage/progress.

### `POST /api/transcribe`
Audio multipart → ffmpeg 16 kHz mono WAV → whisper-cli `-l fr` → `{ text, latency_sec }` → temp cleanup.

### `POST /api/report`
Factual JSON only (no scores).

## Security boundaries
- Bind `127.0.0.1` by default.
- Max audio 8 MB; bounded JSON history.
- Path traversal blocked for static files.
- Subprocess argument lists (no shell).
- No server-side persistence of candidate audio/transcripts.
