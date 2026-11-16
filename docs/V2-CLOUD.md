# RecruitAI V2 — cloud app (`web/`)

Next.js 16 (App Router, Cache Components) app that moves the local POC to the browser. The Python POC at the repo root is untouched.

## Flow

```
Recruteur  ──POST /api/sessions──▶  lien /interview/<token>
Candidat   ──▶ intro + mention IA ──▶ micro ──▶ Audio seul | Avatar
```

**Audio seul (défaut)**
1. `POST /api/gemini/token` → ephemeral Live API token (`authTokens`, model, AUDIO modality, system prompt and tools locked in the token when the API accepts it).
2. The browser connects to Gemini Live with `@google/genai`: mic PCM 16 kHz in, PCM 24 kHz out (`src/lib/client/audio.ts`, `gemini-live.ts`).
3. Tool calls (`record_candidate_fact`, `answer_job_question`, `end_interview`) are POSTed to `/api/sessions/[token]/memory`. Facts are validated and stored raw + normalized; job answers come only from the job sheet.
4. Finished turns (text only) go to `/api/sessions/[token]/transcript`. `/complete` builds the factual report.

**Avatar (LiveAvatar sandbox)**
1. `POST /api/liveavatar/session` → LITE session token with the Gemini connector (`gemini_realtime_config`: `secret_id`, `context_id`, model, voice).
2. The browser starts `LiveAvatarSession` from `@heygen/liveavatar-web-sdk` and attaches the video element.
3. If anything fails, the UI falls back to audio-only with a visible message.
4. Limits: tool calls run inside LiveAvatar, so no structured memory is recorded in this mode (transcript only). Sandbox only supports the Wayne avatar and sessions end after about 1 minute.

## Guardrails

- No score, ranking or hiring recommendation anywhere: report fields are `null` by construction (and by a SQL `check`).
- No audio stored. Text transcript only.
- The interviewer answers only from `web/src/data/demo_job.json` (copy of `data/demo_job.json`). Start date = next Monday (Europe/Paris), same rule as the Python POC.
- The AI discloses itself in the intro screen and in the opening line.

## Secrets

Server-only env vars (see `web/.env.example`): `GEMINI_API_KEY`, `LIVEAVATAR_API_KEY`, `LIVEAVATAR_GEMINI_SECRET_ID`, … Never `NEXT_PUBLIC_*`. The browser only receives short-lived Gemini tokens and LiveAvatar session tokens. `LIVEAVATAR_SANDBOX` defaults to on and cannot be turned off from the browser.

## Data layer

`web/src/lib/db/mock.ts` is an in-memory store with the schema of `supabase/migrations/20260316000000_recruitai_init.sql` (agencies, recruiters, jobs, interview_configs, sessions, transcripts, reports). It is seeded with Interim Express, the demo job and a synthetic candidate, Léa Martin.

Known limits of the mock:
- Resets on restart and is per server instance (not reliable on multi-instance serverless hosting).
- `/api/recruiter/*` and `/api/gemini/token` have no auth or rate limit yet.

Switching to Supabase: apply the migration, replace the functions exported by `mock.ts` with Supabase queries (service role on the server for candidate-token routes, user session + RLS for recruiter routes), add recruiter auth, and rate-limit the token routes.

## Run

```bash
cd web
cp .env.example .env.local   # fill in keys
npm install
npm run dev                  # http://localhost:3000
npm run build
```

Routes: `/` · `/demo` (new candidate session) · `/interview/[token]` · `/recruiter` · `/recruiter/sessions/[id]`.

Smoke Gemini Live (no browser, no avatar credits):

```bash
cd web && node --env-file=.env.local scripts/smoke-gemini-live.mjs
```

## Cloud status (as of migration)

| Service | Status |
| --- | --- |
| Vercel | Project `recruitai-poc` created under personal team `raphs-projects-c7cb3888`. Env vars synced. **No deployment** until approval. A second project with the same name also exists under the Cursor/Oenoboost integration team (SSO-protected); CLI cannot manage that team. |
| Supabase | Preferred org `lajtkwmjmfwnkccncpqt` not visible to the Cursor integration. Available org Oenoboost is free-tier with **2/2 project slots used** — creation blocked without pausing/deleting an existing project (not done). App uses mock DB + SQL migration ready to apply. |
| LiveAvatar | Gemini API key registered as a LiveAvatar secret; Camille context created. Sandbox sessions use Wayne; production avatar id defaults to Judy HR. |
| Gemini | Ephemeral tokens + Live audio verified locally (`gotAudio`, French reply mentioning Lyon). |
