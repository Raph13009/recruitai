-- Workspace creator = agency admin (can change every teammate's role).
alter table public.agencies
  add column if not exists created_by uuid references public.recruiters (id) on delete set null;

-- Existing agencies: oldest recruiter becomes admin.
update public.agencies a
set created_by = (
  select r.id
  from public.recruiters r
  where r.agency_id = a.id
  order by r.created_at asc
  limit 1
)
where a.created_by is null;
