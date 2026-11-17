-- RecruitAI MVP: agency accounts, configurable AI interviewer, interview engine and end reason.
-- Matches the in-memory store of web/src/lib/db/mock.ts (same columns, same rules).
-- NOT applied to any remote project yet.

-- ---------------------------------------------------------------------------
-- Who the candidates meet: persona name, voice, video avatar.
-- ---------------------------------------------------------------------------
alter table public.agencies
  add column interviewer jsonb not null default jsonb_build_object(
    'persona_name', 'Camille',
    'voice', 'Aoede',
    'video_enabled', true,
    'avatar_id', null,
    'avatar_name', null,
    'avatar_preview_url', null
  );

alter table public.agencies
  add constraint agencies_interviewer_shape check (
    jsonb_typeof(interviewer -> 'persona_name') = 'string'
    and char_length(interviewer ->> 'persona_name') between 1 and 30
    and jsonb_typeof(interviewer -> 'voice') = 'string'
    and jsonb_typeof(interviewer -> 'video_enabled') = 'boolean'
  );

-- ---------------------------------------------------------------------------
-- Sessions: which engine ran the call, how it ended, how many times it was (re)started.
-- live_starts caps reconnections per link (each start can spend voice and avatar credits).
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column engine      text check (engine in ('gemini', 'demo')),
  add column end_reason  text check (end_reason in ('completed', 'left')),
  add column live_starts integer not null default 0 check (live_starts between 0 and 20);

alter table public.sessions
  add constraint sessions_end_reason_when_completed check (end_reason is null or status = 'completed');

-- ---------------------------------------------------------------------------
-- Recruiters may rename their agency and change its interviewer.
-- Sign-up (new agency + first recruiter) runs on the server with the service role.
-- ---------------------------------------------------------------------------
create policy agencies_update_own on public.agencies
  for update to authenticated
  using (id = public.current_agency_id())
  with check (id = public.current_agency_id());

-- Recruiters may update their own profile row (name).
create policy recruiters_update_self on public.recruiters
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and agency_id = public.current_agency_id());
