-- Recruiter review fields on interviews (manual only — never set by AI).
-- Technical session status (created/in_progress/completed) stays separate.

alter table public.sessions
  add column recruiter_status text not null default 'to_review'
    check (recruiter_status in ('to_review', 'to_recontact', 'to_deepen', 'waiting', 'not_selected')),
  add column recruiter_rating smallint
    check (recruiter_rating is null or recruiter_rating between 1 and 5),
  add column is_favorite boolean not null default false,
  add column next_action text
    check (
      next_action is null
      or next_action in ('contact', 'follow_up', 'schedule', 'check_refs', 'other')
    );

create index sessions_agency_review_idx
  on public.sessions (agency_id, recruiter_status, is_favorite);
