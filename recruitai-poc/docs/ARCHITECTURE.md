# Architecture — RecruitAI V0.5

## Components

| Layer | Tech | Role |
|-------|------|------|
| UI | Static HTML/CSS/JS in `public/` | Hands-free voice loop, Web Audio VAD, TTS, text fallback |
| API | `server.py` (Python stdlib `ThreadingHTTPServer`) | Serves UI + JSON APIs on localhost |
| Engine | `interview.py` + `data/demo_job.json` | Intent, extraction, memory, compose, report |
| LLM | Ollama → `qwen3:1.7b` (fallback `qwen3:0.6b`) | Optional naturalization of composed Camille lines |
| STT | ffmpeg + whisper.cpp `ggml-tiny` | Local French transcription |
| Storage | None on disk for interviews | History in browser memory; audio temps deleted after STT |

## Conversational pipeline (separated concerns)

```
user utterance
  → detect_intent()
  → extract / normalize slots (contextual: hours ordinals, name guards, availability)
  → InterviewSlots memory (raw + normalized)
  → compose_reply()  (react + one next question; stage guides, does not dictate wording)
  → optional Ollama polish (fact-guarded) → Camille reply
```

Progression depends on whether slots are filled and whether a bounded follow-up is useful
(`MAX_FOLLOWUPS_PER_STAGE = 1`, `MAX_REASKS_PER_STAGE = 2`). Infinite loops are prevented.

## Frontend voice state machine

```
IDLE → CAMILLE_SPEAKING → LISTENING → CANDIDATE_SPEAKING
    → TRANSCRIBING → THINKING → CAMILLE_SPEAKING → …
```

Also: `PAUSED`, `ERROR`, `DONE`.

- **LISTENING**: mic open, AnalyserNode RMS; waiting for speech.
- **CANDIDATE_SPEAKING**: MediaRecorder capturing; end when silence ≥ configured 1.0–2.0 s after min speech.
- **CAMILLE_SPEAKING**: VAD loop stopped; mic not used for decisions (echo protection) + short cooldown before LISTENING.
- Auto-submit transcript to `/api/next`. Text form remains a fallback interrupt.

## Interview control (backend)

Stages (app-owned): `intro` → `experience` → `availability` → `hours` → `salary` → `questions` → `closing`.

| Intent | Behavior |
|--------|----------|
| `ANSWER` | React to substance, optional follow-up, advance if slot sufficient |
| `QUESTION_ABOUT_JOB` | Answer from `demo_job.json`, then resume |
| `CLARIFICATION_REQUEST` | Reformulate previous question; do not advance |
| `INCOMPLETE_ANSWER` | Re-ask (max 2); then mark missing and move on |
| `OFF_TOPIC` | Redirect to current question |
| `END_INTERVIEW` | Closing |

Contextual extractors:
- Hours: « le premier », « celui du matin », « les deux », « aucun des deux », …
- Name: only explicit « je m'appelle … » / confident proper noun; denylist includes prêt/pret
- Experience: restaurant vs logistics; follow-up on tasks without inventing transferable skills
- Availability: « maintenant » / typos like « maintennat » → immédiat

Qwen naturalizes the composed reply; malformed / `Question :` / `Je retiens` / fact-breaking output falls back to the scripted compose. Ollama uses `think: false`. Compact `slots.memory_brief()` is sent instead of full history dumps.

## HTTP API

### `GET /api/health`
Model, fallback model, version `0.5`, job summary, whisper/ffmpeg readiness.

### `GET /api/job`
Demo job JSON with resolved start date.

### `POST /api/next`
`{ "history": [...], "demo": false }` → Camille reply + stage/intent/slots/progress.

### `POST /api/transcribe`
Audio multipart → ffmpeg 16 kHz mono WAV → whisper-cli `-l fr` → `{ text, latency_sec }` → temp cleanup.

### `POST /api/report`
Factual JSON only (raw + normalized fields, no scores).

## Security boundaries
- Bind `127.0.0.1` by default.
- Max audio 8 MB; bounded JSON history.
- Path traversal blocked for static files.
- Subprocess argument lists (no shell).
- No server-side persistence of candidate audio/transcripts.
