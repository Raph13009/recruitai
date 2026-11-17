# RecruitAI V2: cloud app and MVP SaaS (`web/`)

Next.js 16 (App Router, Cache Components) app. The Python POC at the repo root is untouched.

The MVP is a multi-tenant SaaS: an agency signs up, describes its jobs, sends one interview link per candidate, and reads factual reports. The candidate takes a first interview **by video call**, with an AI interviewer that has a photoreal face and a real-time voice that can be interrupted.

## Product surface

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | Marketing site |
| `/demo` | everyone | Starts a candidate interview on the fictional demo job (POST, rate-limited) |
| `/interview/[token]` | candidate | Waiting room (mic and camera check, AI disclosure), video call, goodbye |
| `/signup`, `/login` | recruiter | Account creation (new agency + first recruiter), sign-in, demo account |
| `/recruiter` | recruiter | Dashboard: KPIs, latest interviews, open jobs, interviewer status |
| `/recruiter/jobs[/new, /[id], /[id]/edit]` | recruiter | Job sheets (the interviewer's only source), open/close, invite a candidate |
| `/recruiter/sessions[/[id]]` | recruiter | Interviews by status; factual report, transcript, print, close, delete |
| `/recruiter/settings` | recruiter | Interviewer persona (name, voice, video, face), agency name, connected services |
| `/confidentialite` | everyone | What is kept, what is not, who processes the conversation |

## The video call: face + voice

```
                 ┌──────────── browser (candidate) ────────────┐
 mic ── PCM 16 kHz ──▶ Gemini Live (ephemeral token) ──┐       │
                 │      prompt + tools locked in token │       │
                 │      tool calls ──▶ /api/sessions/[token]/memory (facts, job answers)
                 │                                     ▼       │
                 │      PCM 24 kHz ──▶ PcmBatcher ──▶ LiveAvatar WebSocket (agent.speak)
                 │                                     │       │
 <video> ◀── WebRTC (lip-synced face + its audio) ◀───┘       │
                 └──────────────────────────────────────────────┘
```

- **Voice and brain: Gemini Live.** The browser connects with a short-lived token minted by `POST /api/sessions/[token]/live`. Model, prompt, voice, tools and turn detection are locked inside the token when the API accepts it. No barge-in (Raphaël's `2622617`, kept on purpose): room noise and the echo of the interviewer's own voice used to cut her off mid-sentence. The token sets `NO_INTERRUPTION`, low start-of-speech sensitivity, 300 ms of speech before it counts and 1.2 s of silence before the turn passes; the browser holds the mic while she speaks and sends typed answers once she has finished (`lib/client/gemini-live.ts`). When the browser blocks sound after joining, a "Faire parler Camille" button starts the opening line (Raphaël's `77d7318`); otherwise the join click is enough.
- **Face: LiveAvatar in LITE mode, custom agent.** We do not use LiveAvatar's Gemini connector, so our prompt, tools and structured memory keep working in video. The browser is the "agent": it streams the model's audio to the session WebSocket (`agent.speak`, ~1 s frames, a short first frame for low latency, `agent.speak_end`, `agent.interrupt`, `agent.start_listening` while the candidate talks) and the avatar plays it back lip-synced over WebRTC (`lib/client/avatar.ts`, `lib/client/pcm-batcher.ts`). Protocol: https://docs.liveavatar.com/docs/lite-mode/events
- **Fallbacks.** No avatar key, sandbox time limit or avatar error: the call continues in audio with an animated presence. Voice cut: "Reprendre l'entretien" reconnects and the interviewer resumes from the facts already recorded (`buildResumeNote`), without repeating the opening. Max 5 starts per link (credit cap).
- **Demo mode (no keys).** `lib/interview/demo-engine.ts` is a rule-based interviewer that follows the same outline, records the same typed facts and answers only from the job sheet. The browser gives it a voice (Web Speech synthesis) and ears (Web Speech recognition, or typed answers).
- **Faces.** The agency picks a face in Réglages from LiveAvatar's stock library or its own custom avatars (a digital twin of a real recruiter is created on LiveAvatar from a 2-minute video plus a consent recording). The AI still introduces itself as an AI. The sandbox only offers the test face "Wayne" (~1 minute sessions); the voice then switches to `LIVEAVATAR_SANDBOX_VOICE` so face and voice match.

## Accounts and data

- **Sessions.** Signed, stateless cookie (`HMAC-SHA256`, 7 days, `httpOnly`, `sameSite=lax`). `src/proxy.ts` only does an optimistic check; every page, Server Action and Route Handler verifies the session in `lib/auth/dal.ts`, next to the data. Every query is scoped by `agency_id`.
- **Data facade.** Everything imports `@/lib/db` (`lib/db/index.ts`), which picks the store per request: the local demo store by default, Supabase when `USE_MOCK_DB=false` and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set. Both stores expose the same async, agency-scoped functions (checked at compile time); shared logic lives in `lib/db/helpers.ts`.
- **Supabase store** (`lib/db/supabase-store.ts`, from Raphaël's `7ff1c9b`, extended). Service-role client, server only; every query filters by `agency_id`. Recruiters are Supabase Auth users (`auth.admin.createUser` on sign-up, `signInWithPassword` on sign-in with a throwaway client), so no password hash in our tables. The demo account is created on first use. Needs both migrations applied.
- **Local demo store** (`lib/db/mock.ts`). Same shape as `supabase/migrations/*.sql`, saved to `web/.data/store.json` in local development. Seeded with the fictional agency Interim Express (stable ids, the same as the Supabase seed), its demo account, one job and synthetic interviews. On serverless hosts it lives in memory per instance: Raphaël's signed cookie (`lib/db/persist.ts`, `ra_session`, compressed, capped under 4 KB) then carries the candidate's own interview so the next instance can pick it up. Recruiter data does not survive there: use Supabase.
- **Rate limits** (in-memory, per instance): sign-in, sign-up, public demo, demo turns.

## Guardrails

- No score, ranking or hiring recommendation anywhere: report fields are `null` by construction (and by a SQL `check`).
- No audio or video stored. Text transcript only. The candidate's camera only feeds a local preview.
- The interviewer answers only from the job sheet; otherwise "le recruteur vous répondra".
- The AI discloses itself on the waiting-room screen, in its first sentence, and with an "IA" badge during the whole call.
- Never asks about age, origin, health, family situation or papers.

## Run

```bash
cd web
cp .env.example .env.local   # optional: keys for real-time voice and video
npm install
npm run dev                  # http://localhost:3000
npm test && npm run lint && npm run build
```

Smoke test of Gemini Live alone (no browser, no avatar credits):

```bash
cd web && node --env-file=.env.local scripts/smoke-gemini-live.mjs
```

## Towards production (not done in the MVP)

1. **Supabase.** The store is wired (see above). To switch: apply `20261117000000_mvp_saas.sql` on the project (it adds the interviewer settings and the session columns the MVP writes), then set `USE_MOCK_DB=false`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Later: recruiter routes on the user's own session + RLS instead of the service role.
2. **Shared rate limits** (Redis or edge) instead of in-memory buckets.
3. **LiveAvatar plan** with credits, `LIVEAVATAR_SANDBOX=false`, a default `LIVEAVATAR_AVATAR_ID`, optional `LIVEAVATAR_MAX_SESSION_SECONDS`.
4. **Legal**: privacy policy, processing register, retention period and automatic deletion of old interviews, consent wording reviewed by counsel.
5. **Hosting**: set `SESSION_SECRET`, `ALLOW_DEMO_LOGIN=false`, decide on `PUBLIC_DEMO`.

## Cloud status (as of the first migration)

| Service | Status |
| --- | --- |
| Vercel | Project `recruitai-poc` created under personal team `raphs-projects-c7cb3888`. Env vars synced. **No deployment** until approval. |
| Supabase | Project in Raphaël's "Raph Perso" org (commit `7ff1c9b`), seeded with the demo agency/job/config ids. The MVP migration `20261117000000_mvp_saas.sql` is **not applied yet**: apply it before `USE_MOCK_DB=false`. |
| LiveAvatar | Account exists (sandbox used so far). The MVP uses LITE mode without the Gemini connector: the old `LIVEAVATAR_GEMINI_SECRET_ID` / `LIVEAVATAR_CONTEXT_ID` are no longer needed. |
| Gemini | Ephemeral tokens + Live audio verified locally before the MVP (`gotAudio`, French reply mentioning Lyon). |
