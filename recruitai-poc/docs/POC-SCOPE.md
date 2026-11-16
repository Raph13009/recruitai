# POC scope and acceptance criteria

## Product hypothesis
A French staffing recruiter can collect role-related declarations through a short structured AI interview, then review a factual report — without automated suitability scoring.

## v0.3 In scope
- One fictional job from `data/demo_job.json`: Interim Express — Agent de quai / manutentionnaire (Lyon)
- Application-controlled interview stages with Qwen3:0.6b naturalization
- Push-to-talk microphone → local whisper.cpp `tiny` transcription
- Editable transcript + text fallback
- Lightweight on-screen speaking character + browser TTS (provisional)
- Max 12 candidate turns (covers re-asks and interruptions)
- Factual JSON report (no scoring)
- Scripted no-LLM demo mode

## Out of scope
- Photorealistic avatar / live video
- Continuous listening / VAD conversation mode
- Paid cloud STT/TTS/LLM APIs
- ATS, database, user accounts
- Candidate scoring, ranking, personality inference, automated rejection
- Inventing job conditions beyond the JSON file
- Production deployment / public exposure

## Acceptance
1. With Ollama running (or demo mode), Camille opens as an AI recruiter, explains the Interim Express job, and follows the 7-stage script.
2. Push-to-talk records audio, `/api/transcribe` returns French text locally, user can edit then send.
3. Text-only interview still works.
4. Demo mode works without Ollama.
5. Asking about salary mid-interview answers from JSON then resumes.
6. Export contains factual fields + transcript; `scoring` / `hiring_recommendation` remain null.
7. Temporary audio files are deleted after transcription.
8. Server defaults to `127.0.0.1`.

## Measured notes (do not invent numbers)
- Target machine: Apple Silicon, 8 GB RAM.
- Ollama `qwen3:0.6b` (~522 MB) is the default; larger models increase RAM pressure on 8 GB machines.

## Offline limitations
- Browser `speechSynthesis` may download or process voices via OS/browser services. Do not claim full offline TTS unless verified with a local engine (Piper/Kokoro).
- Ollama/whisper model downloads require network once; inference is local thereafter.

## Risks
- Tiny LLM can still digress; state-machine + fallbacks reduce this.
- Tiny Whisper can mis-hear names/numbers — human edit step is mandatory.
- Never expose this POC on a public port.
