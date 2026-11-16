-- RecruitAI V2 initial schema.
-- NOT applied to any remote project yet (the app currently uses an in-memory mock with the same shape).
-- Isolation model: every row carries agency_id; recruiters only see rows of their own agency.
-- Candidates never hit these tables with their own credentials: the Next.js server reads/writes sessions by
-- token with the service role. No policy grants anything to `anon`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.agencies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.recruiters (
  id         uuid primary key references auth.users (id) on delete cascade,
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  full_name  text not null,
  email      text not null,
  created_at timestamptz not null default now()
);
create index recruiters_agency_idx on public.recruiters (agency_id);

create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  title      text not null,
  location   text not null,
  status     text not null default 'open' check (status in ('draft', 'open', 'closed')),
  facts      jsonb not null, -- same shape as data/demo_job.json: the only source the interviewer may answer from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_agency_idx on public.jobs (agency_id);

create table public.interview_configs (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  language      text not null default 'fr' check (language = 'fr'),
  voice         text not null default 'Aoede',
  ai_disclosure text not null,
  created_at    timestamptz not null default now()
);
create index interview_configs_job_idx on public.interview_configs (job_id);

create table public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  job_id              uuid not null references public.jobs (id) on delete cascade,
  interview_config_id uuid not null references public.interview_configs (id),
  token               text not null unique, -- unguessable public link token
  candidate_label     text not null default 'Candidat anonyme', -- internal label, no sensitive data
  is_synthetic        boolean not null default false,
  status              text not null default 'created' check (status in ('created', 'in_progress', 'completed')),
  mode                text check (mode in ('audio', 'avatar')),
  memory              jsonb not null default '{}'::jsonb, -- typed candidate slots (raw + normalized)
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz
);
create index sessions_agency_idx on public.sessions (agency_id, created_at desc);
create index sessions_job_idx on public.sessions (job_id);

create table public.transcripts (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  seq        integer not null,
  role       text not null check (role in ('agent', 'candidate')),
  text       text not null check (char_length(text) <= 2000), -- text only, never audio
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
create index transcripts_agency_idx on public.transcripts (agency_id);

create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  content    jsonb not null, -- factual report; scoring / ranking / hiring_recommendation are always null
  created_at timestamptz not null default now(),
  -- Guardrail: a report can never carry a score, ranking or hiring recommendation.
  constraint reports_no_decision check (
    content -> 'scoring' = 'null'::jsonb
    and content -> 'ranking' = 'null'::jsonb
    and content -> 'hiring_recommendation' = 'null'::jsonb
  )
);
create index reports_agency_idx on public.reports (agency_id);

-- ---------------------------------------------------------------------------
-- Agency isolation (RLS)
-- ---------------------------------------------------------------------------

-- Agency of the signed-in recruiter. security definer so policies on `recruiters` itself do not recurse.
create or replace function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.recruiters where id = auth.uid()
$$;

revoke all on function public.current_agency_id() from public;
grant execute on function public.current_agency_id() to authenticated;

alter table public.agencies          enable row level security;
alter table public.recruiters        enable row level security;
alter table public.jobs              enable row level security;
alter table public.interview_configs enable row level security;
alter table public.sessions          enable row level security;
alter table public.transcripts       enable row level security;
alter table public.reports           enable row level security;

-- agencies: read own agency
create policy agencies_select_own on public.agencies
  for select to authenticated
  using (id = public.current_agency_id());

-- recruiters: read colleagues of the same agency
create policy recruiters_select_same_agency on public.recruiters
  for select to authenticated
  using (agency_id = public.current_agency_id());

-- jobs & interview_configs: full access inside own agency
create policy jobs_all_own_agency on public.jobs
  for all to authenticated
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

create policy interview_configs_all_own_agency on public.interview_configs
  for all to authenticated
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

-- sessions: recruiters create/read/update/delete inside own agency
create policy sessions_all_own_agency on public.sessions
  for all to authenticated
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

-- transcripts & reports: recruiters read (and delete, for retention) inside own agency.
-- Writes come from the server with the service role (candidate flow), which bypasses RLS.
create policy transcripts_select_own_agency on public.transcripts
  for select to authenticated
  using (agency_id = public.current_agency_id());

create policy transcripts_delete_own_agency on public.transcripts
  for delete to authenticated
  using (agency_id = public.current_agency_id());

create policy reports_select_own_agency on public.reports
  for select to authenticated
  using (agency_id = public.current_agency_id());

create policy reports_delete_own_agency on public.reports
  for delete to authenticated
  using (agency_id = public.current_agency_id());
