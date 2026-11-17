-- Agency team: owner/member roles + email invites to join an existing agency.
-- Sharing jobs/sessions already works via agency_id; this adds how a second recruiter joins.

alter table public.recruiters
  add column if not exists role text not null default 'owner'
    check (role in ('owner', 'member'));

-- Existing single-user agencies stay owners (default). New invitees are inserted as member.

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

-- One pending invite per email per agency.
create unique index if not exists agency_invites_pending_email_agency
  on public.agency_invites (agency_id, lower(email))
  where accepted_at is null;

alter table public.agency_invites enable row level security;

-- Service role handles invites in the MVP; authenticated owners may read their agency invites.
create policy agency_invites_select_own on public.agency_invites
  for select to authenticated
  using (agency_id = public.current_agency_id());
