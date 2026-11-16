# Architecture — RecruitAI V0.6

## Components

| Layer | Tech | Role |
|-------|------|------|
| UI | Static HTML/CSS/JS in `public/` | Hands-free voice loop, Web Audio VAD, TTS, text fallback |
| API | `server.py` (Python stdlib `ThreadingHTTPServer`) | Serves UI + JSON APIs on localhost |
| Engine | `interview.py` + `data/demo_job.json` | Multi-intent analysis, typed memory, sub-states, compose |
| LLM | Ollama → `qwen3:1.7b` (fallback `qwen3:0.6b`) | Optional naturalization of composed Camille lines |
| STT | ffmpeg + whisper.cpp `ggml-tiny` | Local French transcription |
| Storage | None on disk for interviews | History in browser memory; audio temps deleted after STT |

## Conversational pipeline

```
user utterance
  → detect_intent (+ extract_embedded_questions for mixed turns)
  → extract/normalize typed facts (never cross-overwrite fields)
  → apply to InterviewSlots (raw + normalized + turn ids)
  → conversational sub-state handling
  → compose_reply (answer questions first, then resume)
  → optional Ollama polish (fact-guarded)
```

### Main stages
`intro → experience → availability → hours → salary → questions → closing`

### Conversational sub-states (temporary)
- `AWAITING_CANDIDATE_QUESTION` — after « Avez-vous des questions ? » → « Oui » → « Bien sûr, je vous écoute. »
- `ANSWERING_CANDIDATE_QUESTION`
- `AWAITING_CLARIFICATION`
- `RESUMING_INTERVIEW`
- `AWAITING_CONFIRMATION` — e.g. availability later than job start

Sub-states are orthogonal to stages. Closing requires an explicit no-further-questions (or end signal / wait timeout).

### Mixed intents
One utterance may contain facts **and** a question, e.g.:
« Je suis dispo à partir du 1er décembre, c'est sur Paris ? »
→ extract 2026-12-01 **and** answer location (Lyon, not Paris), then surface the start-date mismatch.

### Memory
Typed fields with source turn ids: industries/tasks, availability date, shifts, salary, question records. Raise questions never overwrite experience.

## Frontend voice state machine

```
IDLE → CAMILLE_SPEAKING → LISTENING → CANDIDATE_SPEAKING
    → TRANSCRIBING → THINKING → CAMILLE_SPEAKING → …
```

Also: `PAUSED`, `ERROR`, `DONE`. Voice UX unchanged from V0.4/V0.5.

## HTTP API
- `GET /api/health` — version `0.6`, model, fallback, whisper readiness
- `GET /api/job`
- `POST /api/next` — reply + stage/intent/sub_state/slots
- `POST /api/transcribe`
- `POST /api/report` — factual JSON (raw + normalized, no scores)

## Security boundaries
- Bind `127.0.0.1` by default.
- Max audio 8 MB; bounded JSON history.
- No server-side persistence of candidate audio/transcripts.
