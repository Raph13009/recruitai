-- RecruitAI private PostgreSQL schema (Option A).
-- No dependency on Supabase auth.users / storage / GoTrue.
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/postgres/schema.sql

create extension if not exists pgcrypto;

create table if not exists public.agencies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  interviewer jsonb not null default jsonb_build_object(
    'persona_name', 'Camille',
    'voice', 'Aoede',
    'video_enabled', true,
    'avatar_id', null,
    'avatar_name', null,
    'avatar_preview_url', null
  ),
  branding jsonb not null default jsonb_build_object(
    'logo_url', null,
    'banner_url', null,
    'accent_color', '#0f6b5c'
  ),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint agencies_interviewer_shape check (
    jsonb_typeof(interviewer -> 'persona_name') = 'string'
    and char_length(interviewer ->> 'persona_name') between 1 and 30
    and jsonb_typeof(interviewer -> 'voice') = 'string'
    and jsonb_typeof(interviewer -> 'video_enabled') = 'boolean'
  ),
  constraint agencies_branding_shape check (
    jsonb_typeof(branding -> 'accent_color') = 'string'
    and branding ->> 'accent_color' ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create table if not exists public.recruiters (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  full_name  text not null,
  email      text not null,
  role       text not null default 'owner' check (role in ('owner', 'member')),
  -- scrypt hash (see web/src/lib/auth/password.ts). Null = migrated user must reset password.
  password_hash text,
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists recruiters_email_unique on public.recruiters (lower(email));
create index if not exists recruiters_agency_idx on public.recruiters (agency_id);

alter table public.agencies
  drop constraint if exists agencies_created_by_fkey;
alter table public.agencies
  add constraint agencies_created_by_fkey
  foreign key (created_by) references public.recruiters (id) on delete set null;

create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  title      text not null,
  location   text not null,
  status     text not null default 'open' check (status in ('draft', 'open', 'closed')),
  facts      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_agency_idx on public.jobs (agency_id);

create table if not exists public.interview_configs (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  language      text not null default 'fr' check (language = 'fr'),
  voice         text not null default 'Aoede',
  ai_disclosure text not null,
  created_at    timestamptz not null default now()
);
create index if not exists interview_configs_job_idx on public.interview_configs (job_id);

create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references public.agencies (id) on delete cascade,
  job_id              uuid not null references public.jobs (id) on delete cascade,
  interview_config_id uuid not null references public.interview_configs (id),
  token               text not null unique,
  candidate_label     text not null default 'Candidat anonyme',
  candidate_email     text,
  invited_at          timestamptz,
  is_synthetic        boolean not null default false,
  status              text not null default 'created' check (status in ('created', 'in_progress', 'completed')),
  mode                text check (mode in ('audio', 'avatar')),
  engine              text check (engine in ('gemini', 'demo')),
  end_reason          text check (end_reason in ('completed', 'left')),
  live_starts         integer not null default 0 check (live_starts between 0 and 20),
  memory              jsonb not null default '{}'::jsonb,
  recruiter_status    text not null default 'to_review'
    check (recruiter_status in ('to_review', 'to_recontact', 'to_deepen', 'waiting', 'not_selected')),
  recruiter_rating    smallint check (recruiter_rating is null or recruiter_rating between 1 and 5),
  is_favorite         boolean not null default false,
  next_action         text check (
    next_action is null
    or next_action in ('contact', 'follow_up', 'schedule', 'check_refs', 'other')
  ),
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  constraint sessions_candidate_email_len check (
    candidate_email is null or char_length(candidate_email) between 3 and 254
  ),
  constraint sessions_end_reason_when_completed check (end_reason is null or status = 'completed')
);
create index if not exists sessions_agency_idx on public.sessions (agency_id, created_at desc);
create index if not exists sessions_job_idx on public.sessions (job_id);
create index if not exists sessions_agency_review_idx
  on public.sessions (agency_id, recruiter_status, is_favorite);

create table if not exists public.transcripts (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  seq        integer not null,
  role       text not null check (role in ('agent', 'candidate')),
  text       text not null check (char_length(text) <= 2000),
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
create index if not exists transcripts_agency_idx on public.transcripts (agency_id);

create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  agency_id  uuid not null references public.agencies (id) on delete cascade,
  content    jsonb not null,
  created_at timestamptz not null default now(),
  constraint reports_no_decision check (
    content -> 'scoring' = 'null'::jsonb
    and content -> 'ranking' = 'null'::jsonb
    and content -> 'hiring_recommendation' = 'null'::jsonb
  )
);
create index if not exists reports_agency_idx on public.reports (agency_id);

create table if not exists public.agency_invites (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies (id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('member')),
  token       text not null unique,
  invited_by  uuid not null references public.recruiters (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  accepted_at timestamptz
);
create index if not exists agency_invites_agency_idx on public.agency_invites (agency_id);
create index if not exists agency_invites_email_idx on public.agency_invites (lower(email));
create unique index if not exists agency_invites_pending_email_agency
  on public.agency_invites (agency_id, lower(email))
  where accepted_at is null;

-- Password reset tokens (private auth). Token stored hashed (sha256 hex).
create table if not exists public.password_reset_tokens (
  id           uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists password_reset_tokens_recruiter_idx
  on public.password_reset_tokens (recruiter_id);

-- Schema bookkeeping for migrators / operators.
create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations (id) values ('private_v1')
on conflict (id) do nothing;
