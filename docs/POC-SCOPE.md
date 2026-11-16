# POC scope and acceptance criteria

## Product hypothesis
A French staffing recruiter can collect role-related declarations through a short structured AI interview, then review a factual report — without automated suitability scoring.

## v0.6 In scope
- One fictional job from `data/demo_job.json`: Interim Express — Agent de quai / manutentionnaire (Lyon)
- Conversational engine: intent → extraction → memory → response (stage guides, does not dictate every sentence)
- Contextual answers (ordinal hours, restaurant follow-ups, immediate availability, guarded names)
- Qwen3 **1.7B** naturalization by default with **0.6B** fallback (`OLLAMA_MODEL` / `OLLAMA_FALLBACK_MODEL`)
- **Hands-free voice loop**: after Camille speaks → auto-listen → VAD speech start → silence end (~1–1.5 s) → whisper.cpp → auto-send to Ollama → Camille speaks again
- Explicit UI state machine: `IDLE → CAMILLE_SPEAKING → LISTENING → CANDIDATE_SPEAKING → TRANSCRIBING → THINKING → CAMILLE_SPEAKING`
- Pause/resume conversation; mic status indicator; adjustable end-of-utterance silence
- Text input fallback (always available)
- Lightweight 2D Camille + browser TTS (provisional)
- Max 16 candidate turns
- Factual JSON report with raw + normalized slots (no scoring)
- Scripted no-LLM demo mode
- Regression tests for messy STT-like French answers

## Out of scope
- Photorealistic avatar / live video
- Paid cloud STT/TTS/LLM APIs
- ATS, database, user accounts
- Candidate scoring, ranking, personality inference, automated rejection
- Inventing job conditions beyond the JSON file
- Production deployment / public exposure

## Acceptance
1. After Camille finishes TTS, listening starts automatically (no push-to-talk click).
2. Candidate speech is detected via Web Audio VAD; silence ends the utterance.
3. Audio goes to local `/api/transcribe` (whisper.cpp); transcript is auto-sent to `/api/next`.
4. Camille's TTS does not keep the mic in a recording/listen-active decision loop (echo guard + cooldown).
5. Text-only interview still works; pause/resume recovers without full reset.
6. Empty / failed transcription returns to listening with a French error.
7. Export remains factual; no scoring / hiring recommendation.
8. Server defaults to `127.0.0.1`.
9. « je suis prêt » is never extracted as a candidate name; « le premier » maps to `6:00–13:00`.
10. Camille does not mechanically repeat answered questions or prefix with `Question :` / `Je retiens que…`.

## Measured notes (do not invent numbers)
- Target machine: Apple Silicon, 8 GB RAM.
- Default model: `qwen3:1.7b` (~1.4 GB); fallback `qwen3:0.6b` (~522 MB). See `docs/BENCHMARK.md` for measured latency/RSS/quality on this machine.
- Whisper `tiny` STT latency was previously measured in local tests; re-measure after UX changes if quoting numbers.

## Offline limitations
- Browser `speechSynthesis` may download or process voices via OS/browser services. Do not claim full offline TTS unless verified with a local engine (Piper/Kokoro).
- Browser VAD uses local Web Audio only; quality depends on mic/noise/echo cancellation.

## Next technical experiments
- Local French TTS (Piper/Kokoro) with verified voice licenses
- Stronger VAD / adaptive noise floor
- VRM/Three.js avatar + lip sync (separate license check)
