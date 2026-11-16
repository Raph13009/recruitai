# Architecture — RecruitAI V0.3

## Components

| Layer | Tech | Role |
|-------|------|------|
| UI | Static HTML/CSS/JS in `public/` | Interview UX, MediaRecorder push-to-talk, TTS, report download |
| API | `server.py` (Python stdlib `ThreadingHTTPServer`) | Serves UI + JSON APIs on localhost |
| Script | `interview.py` + `data/demo_job.json` | Stage machine, slot extraction, factual answers, report |
| LLM | Ollama → `qwen3:0.6b` | Optional naturalization of scripted Camille lines |
| STT | ffmpeg + whisper.cpp `ggml-tiny` | Local French transcription |
| Storage | None on disk for interviews | History in browser memory; audio temps deleted after STT |

## Interview control

Stages (app-owned): `intro` → `experience` → `availability` → `hours` → `salary` → `questions` → `closing`.

- The state machine picks the next scripted line and tracks filled slots.
- Mid-interview questions about salary / hours / duties / contract / start date are answered **only** from `demo_job.json`, then the interview resumes.
- Incomplete answers are re-asked once; still-empty fields are listed as missing in the report.
- Qwen may rephrase the scripted line; if the reply is empty or off-topic, the predefined question is used.
- Ollama is called with `think: false`; residual `<think>` tags are stripped.

## HTTP API

### `GET /api/health`
Returns model name, version, job summary, and whisper/ffmpeg readiness.

### `GET /api/job`
Returns the demo job JSON with `start_date` / `start_date_fr` resolved at runtime.

### `POST /api/next`
Body: `{ "history": [...], "demo": false }`  
Returns next Camille `reply`, `stage`, `done`, `slots`, `interrupted`, and `progress`.

### `POST /api/transcribe`
`multipart/form-data` field `audio` (or JSON `audio_base64`).  
Pipeline: save temp file → ffmpeg 16 kHz mono PCM WAV → `whisper-cli -l fr` → return `{ text, latency_sec }` → delete temp directory.

### `POST /api/report`
Body: `{ "history": [...] }`  
Returns factual JSON: experience, availability, accepted hours, salary expectations, candidate questions, missing information. No scores.

## Data flow (voice turn)

1. User holds push-to-talk (start/stop buttons).
2. Browser MediaRecorder captures WebM/MP4/Ogg.
3. Frontend posts blob to `/api/transcribe`.
4. Backend converts + transcribes locally.
5. Transcript fills the textarea for human edit.
6. User sends → `/api/next` (state machine ± Ollama) → Camille reply → browser TTS.

## Security boundaries
- Bind address defaults to `127.0.0.1`.
- Max audio upload 8 MB; max JSON history bounded.
- Path traversal blocked for static files.
- Subprocess calls use argument lists (no shell).
- No persistence of candidate audio/transcripts server-side.
