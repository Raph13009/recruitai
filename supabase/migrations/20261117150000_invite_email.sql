-- Candidate email invitations: store email + invite timestamp on sessions.
-- Candidate access remains token-based via the Next.js server (service role).

alter table public.sessions
  add column candidate_email text,
  add column invited_at timestamptz;

alter table public.sessions
  add constraint sessions_candidate_email_len check (
    candidate_email is null or char_length(candidate_email) between 3 and 254
  );
