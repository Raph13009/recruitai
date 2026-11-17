// Durable Postgres store via Supabase (service role), used when USE_MOCK_DB=false.
// Same surface as mock.ts. The server enforces agency scoping on every query (the service role
// bypasses RLS); recruiters are Supabase Auth users, so passwords never touch our tables.
// Needs both migrations in supabase/migrations applied (the MVP one adds the interviewer settings
// and the session columns).
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { supabaseAdmin, supabaseAuthClient } from "@/lib/db/client";
import {
  DEMO_ACCOUNT, DEMO_IDS, defaultInterviewer, durationSeconds, jobBrief, normalizeSession, withInterviewer,
  type SessionContext,
} from "@/lib/db/helpers";
import type {
  Agency, EndReason, InterviewConfig, InterviewEngineKind, InterviewMode, InterviewSession, InterviewerSettings, Job,
  JobStatus, Recruiter, Report, TranscriptRole, TranscriptTurn,
} from "@/lib/db/types";
import { env } from "@/lib/env";
import { applyFact, emptyMemory, type CandidateMemory, type FactInput } from "@/lib/interview/memory";
import { AI_DISCLOSURE_TEMPLATE, DEFAULT_PERSONA } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { getDemoJobFacts, type JobFacts } from "@/lib/job";

const now = () => new Date().toISOString();
const newToken = () => randomBytes(18).toString("base64url");
const sb = () => supabaseAdmin();

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

const asAgency = (row: unknown) => withInterviewer(row as Agency);
const asSession = (row: unknown) => normalizeSession(row as InterviewSession);

// ---------------------------------------------------------------------------
// Accounts and agencies
// ---------------------------------------------------------------------------

export async function getRecruiter(id: string): Promise<Recruiter | null> {
  return check(await sb().from("recruiters").select("*").eq("id", id).maybeSingle()) as Recruiter | null;
}

async function recruiterByEmail(email: string): Promise<Recruiter | null> {
  const rows = check(await sb().from("recruiters").select("*").ilike("email", email.trim()).limit(1)) as Recruiter[];
  return rows[0] ?? null;
}

/** Password check by Supabase Auth, then the recruiter row (absent row = not a recruiter). */
export async function authenticate(email: string, password: string): Promise<Recruiter | null> {
  const { data, error } = await supabaseAuthClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) return null;
  return getRecruiter(data.user.id);
}

async function authUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await sb().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureDemoAgency(): Promise<void> {
  const existing = check(await sb().from("agencies").select("id").eq("id", DEMO_IDS.agency).maybeSingle());
  if (existing) return;
  check(
    await sb().from("agencies").insert({
      id: DEMO_IDS.agency, name: "Interim Express", interviewer: defaultInterviewer(), created_at: now(),
    }),
  );
}

/** The demo agency's account, created in Supabase Auth on first use. */
export async function demoRecruiter(): Promise<Recruiter | null> {
  const found = await recruiterByEmail(DEMO_ACCOUNT.email);
  if (found) return found;
  await ensureDemoAgency();
  let userId = await authUserIdByEmail(DEMO_ACCOUNT.email);
  if (!userId) {
    const { data, error } = await sb().auth.admin.createUser({
      email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password, email_confirm: true,
    });
    if (error || !data.user) throw new Error(error?.message ?? "Compte de démonstration impossible à créer.");
    userId = data.user.id;
  }
  const row: Recruiter = {
    id: userId, agency_id: DEMO_IDS.agency, full_name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email, created_at: now(),
  };
  return check(await sb().from("recruiters").upsert(row).select("*").single()) as Recruiter;
}

export async function getAgency(id: string): Promise<Agency | null> {
  const row = check(await sb().from("agencies").select("*").eq("id", id).maybeSingle());
  return row ? asAgency(row) : null;
}

/** Creates an agency and its first recruiter (a Supabase Auth user). Returns null when the email is taken. */
export async function createAgencyWithRecruiter(input: {
  agencyName: string; fullName: string; email: string; password: string;
}): Promise<Recruiter | null> {
  const email = input.email.trim().toLowerCase();
  const { data, error } = await sb().auth.admin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) return null;
    throw new Error(error?.message ?? "Création du compte impossible.");
  }
  const userId = data.user.id;
  const agencyId = randomUUID();
  try {
    const t = now();
    check(await sb().from("agencies").insert({ id: agencyId, name: input.agencyName.trim(), interviewer: defaultInterviewer(), created_at: t }));
    return check(
      await sb()
        .from("recruiters")
        .insert({ id: userId, agency_id: agencyId, full_name: input.fullName.trim(), email, created_at: t })
        .select("*")
        .single(),
    ) as Recruiter;
  } catch (err) {
    // Leave nothing half-created behind.
    await sb().from("agencies").delete().eq("id", agencyId);
    await sb().auth.admin.deleteUser(userId);
    throw err;
  }
}

export async function updateAgency(agencyId: string, patch: { name: string }): Promise<Agency | null> {
  const name = patch.name.trim();
  const row = check(await sb().from("agencies").update({ name }).eq("id", agencyId).select("*").maybeSingle());
  if (!row) return null;
  // Job sheets carry the agency name the interviewer says out loud: keep them in step.
  for (const job of await listJobs(agencyId)) {
    check(await sb().from("jobs").update({ facts: { ...job.facts, agency: name } }).eq("id", job.id).eq("agency_id", agencyId));
  }
  return asAgency(row);
}

export async function updateInterviewer(agencyId: string, settings: InterviewerSettings): Promise<Agency | null> {
  const interviewer = { ...settings, persona_name: settings.persona_name.trim() || DEFAULT_PERSONA };
  const row = check(await sb().from("agencies").update({ interviewer }).eq("id", agencyId).select("*").maybeSingle());
  return row ? asAgency(row) : null;
}

// ---------------------------------------------------------------------------
// Jobs (always scoped by agency)
// ---------------------------------------------------------------------------

export async function listJobs(agencyId: string): Promise<Job[]> {
  return check(
    await sb().from("jobs").select("*").eq("agency_id", agencyId).order("created_at", { ascending: false }),
  ) as Job[];
}

export async function getJob(agencyId: string, id: string): Promise<Job | null> {
  return check(await sb().from("jobs").select("*").eq("id", id).eq("agency_id", agencyId).maybeSingle()) as Job | null;
}

export async function upsertJob(agencyId: string, input: { id?: string; facts: JobFacts; status?: JobStatus }): Promise<Job | null> {
  const t = now();
  if (input.id) {
    const existing = await getJob(agencyId, input.id);
    if (!existing) return null;
    return check(
      await sb()
        .from("jobs")
        .update({
          facts: input.facts, title: input.facts.job_title, location: input.facts.location,
          status: input.status ?? existing.status, updated_at: t,
        })
        .eq("id", existing.id)
        .eq("agency_id", agencyId)
        .select("*")
        .single(),
    ) as Job;
  }
  const job = check(
    await sb()
      .from("jobs")
      .insert({
        id: randomUUID(), agency_id: agencyId, title: input.facts.job_title, location: input.facts.location,
        status: input.status ?? "open", facts: input.facts, created_at: t, updated_at: t,
      })
      .select("*")
      .single(),
  ) as Job;
  check(
    await sb().from("interview_configs").insert({
      id: randomUUID(), agency_id: agencyId, job_id: job.id, language: "fr",
      voice: env.geminiVoice(), ai_disclosure: AI_DISCLOSURE_TEMPLATE, created_at: t,
    }),
  );
  return job;
}

export async function setJobStatus(agencyId: string, id: string, status: JobStatus): Promise<Job | null> {
  return check(
    await sb().from("jobs").update({ status, updated_at: now() }).eq("id", id).eq("agency_id", agencyId).select("*").maybeSingle(),
  ) as Job | null;
}

/** The job behind the public "try it" page: the demo agency's demo job (created if missing). */
export async function publicDemoJob(): Promise<Job | null> {
  const open = check(
    await sb().from("jobs").select("*").eq("agency_id", DEMO_IDS.agency).eq("status", "open").order("created_at"),
  ) as Job[];
  const found = open.find((j) => j.id === DEMO_IDS.job) ?? open[0];
  if (found) return found;
  await ensureDemoAgency();
  const facts = getDemoJobFacts();
  const t = now();
  const { error } = await sb().from("jobs").upsert({
    id: DEMO_IDS.job, agency_id: DEMO_IDS.agency, title: facts.job_title, location: facts.location,
    status: "open", facts, created_at: t, updated_at: t,
  });
  if (error) throw new Error(error.message);
  await sb().from("interview_configs").upsert({
    id: DEMO_IDS.config, agency_id: DEMO_IDS.agency, job_id: DEMO_IDS.job, language: "fr",
    voice: env.geminiVoice(), ai_disclosure: AI_DISCLOSURE_TEMPLATE, created_at: t,
  });
  return getJob(DEMO_IDS.agency, DEMO_IDS.job);
}

// ---------------------------------------------------------------------------
// Interviews, recruiter side (scoped by agency)
// ---------------------------------------------------------------------------

async function insertSession(job: Job, label: string | undefined): Promise<InterviewSession | null> {
  const config = check(
    await sb().from("interview_configs").select("id").eq("job_id", job.id).limit(1).maybeSingle(),
  ) as { id: string } | null;
  if (!config) return null;
  const session: InterviewSession = {
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: config.id,
    token: newToken(), candidate_label: label?.trim() || "Candidat anonyme", is_synthetic: false,
    status: "created", mode: null, engine: null, end_reason: null, live_starts: 0, memory: emptyMemory(),
    created_at: now(), started_at: null, completed_at: null,
  };
  return asSession(check(await sb().from("sessions").insert(session).select("*").single()));
}

export async function createSession(agencyId: string, input: { jobId: string; candidateLabel?: string }): Promise<InterviewSession | null> {
  const job = await getJob(agencyId, input.jobId);
  if (!job || job.status !== "open") return null;
  return insertSession(job, input.candidateLabel);
}

export async function createPublicDemoSession(): Promise<InterviewSession | null> {
  const job = await publicDemoJob();
  return job ? insertSession(job, "Essai public") : null;
}

export async function listSessions(agencyId: string, filter: { jobId?: string } = {}): Promise<InterviewSession[]> {
  let query = sb().from("sessions").select("*").eq("agency_id", agencyId);
  if (filter.jobId) query = query.eq("job_id", filter.jobId);
  return (check(await query.order("created_at", { ascending: false })) as unknown[]).map(asSession);
}

export async function getSession(agencyId: string, id: string): Promise<InterviewSession | null> {
  const row = check(await sb().from("sessions").select("*").eq("id", id).eq("agency_id", agencyId).maybeSingle());
  return row ? asSession(row) : null;
}

/** Deletes an interview; its transcript and report go with it (on delete cascade). */
export async function deleteSession(agencyId: string, id: string): Promise<boolean> {
  const rows = check(await sb().from("sessions").delete().eq("id", id).eq("agency_id", agencyId).select("id")) as unknown[];
  return rows.length > 0;
}

export async function getTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  return check(
    await sb().from("transcripts").select("*").eq("session_id", sessionId).order("seq", { ascending: true }),
  ) as TranscriptTurn[];
}

export async function getReport(sessionId: string): Promise<Report | null> {
  return check(await sb().from("reports").select("*").eq("session_id", sessionId).maybeSingle()) as Report | null;
}

// ---------------------------------------------------------------------------
// Interviews, candidate side (reached by the unguessable link token)
// ---------------------------------------------------------------------------

export async function getSessionByToken(token: string): Promise<InterviewSession | null> {
  const row = check(await sb().from("sessions").select("*").eq("token", token).maybeSingle());
  return row ? asSession(row) : null;
}

export async function getSessionContext(token: string): Promise<SessionContext | null> {
  const session = await getSessionByToken(token);
  if (!session) return null;
  const [job, agency, config] = await Promise.all([
    getJob(session.agency_id, session.job_id),
    getAgency(session.agency_id),
    sb().from("interview_configs").select("*").eq("id", session.interview_config_id).maybeSingle().then(check),
  ]);
  if (!job || !agency || !config) return null;
  return { session, job, brief: jobBrief(job), agency, config: config as InterviewConfig };
}

async function patchSession(id: string, patch: Partial<InterviewSession>): Promise<InterviewSession> {
  return asSession(check(await sb().from("sessions").update(patch).eq("id", id).select("*").single()));
}

/** Marks the call as started and counts the start. Returns the number of starts so far. */
export async function markStarted(token: string, mode: InterviewMode, engine: InterviewEngineKind): Promise<number> {
  const session = await getSessionByToken(token);
  if (!session || session.status === "completed") return session?.live_starts ?? 0;
  const updated = await patchSession(session.id, {
    status: "in_progress", mode, engine, started_at: session.started_at ?? now(), live_starts: session.live_starts + 1,
  });
  return updated.live_starts;
}

export async function recordFact(token: string, input: FactInput): Promise<CandidateMemory | null> {
  const session = await getSessionByToken(token);
  if (!session) return null;
  const job = await getJob(session.agency_id, session.job_id);
  const memory = applyFact(session.memory, input, job?.facts.working_hours ?? []);
  await patchSession(session.id, { memory });
  return memory;
}

export async function appendTranscript(token: string, turns: { role: TranscriptRole; text: string }[]): Promise<number> {
  const session = await getSessionByToken(token);
  if (!session) return 0;
  // (session_id, seq) is unique: if another request took the same numbers, count again and retry.
  for (let attempt = 0; ; attempt++) {
    const { count, error } = await sb().from("transcripts").select("id", { count: "exact", head: true }).eq("session_id", session.id);
    if (error) throw new Error(error.message);
    let seq = count ?? 0;
    const rows: TranscriptTurn[] = turns.map((turn) => ({
      id: randomUUID(), session_id: session.id, agency_id: session.agency_id, seq: ++seq,
      role: turn.role, text: turn.text, created_at: now(),
    }));
    if (!rows.length) return seq;
    const inserted = await sb().from("transcripts").insert(rows);
    if (!inserted.error) return seq;
    if (inserted.error.code !== "23505" || attempt >= 2) throw new Error(inserted.error.message);
  }
}

/** Closes the interview and builds the factual report. Idempotent: a second call returns the same report. */
export async function completeSession(token: string, reason: EndReason, usedMode?: InterviewMode): Promise<Report | null> {
  const session = await getSessionByToken(token);
  if (!session) return null;
  const existing = await getReport(session.id);
  if (existing) return existing;
  const job = await getJob(session.agency_id, session.job_id);
  if (!job) return null;

  const closed = await patchSession(session.id, {
    status: "completed", completed_at: now(), end_reason: reason,
    // The browser reports what actually ran (the video may have fallen back to audio).
    ...(usedMode && session.mode ? { mode: usedMode } : {}),
  });
  const { count } = await sb().from("transcripts").select("id", { count: "exact", head: true }).eq("session_id", session.id);
  const report: Report = {
    id: randomUUID(), session_id: closed.id, agency_id: closed.agency_id, created_at: now(),
    content: buildReport({
      sessionId: closed.id, candidateLabel: closed.candidate_label, isSynthetic: closed.is_synthetic,
      mode: closed.mode, engine: closed.engine, endReason: reason, durationSeconds: durationSeconds(closed),
      job: jobBrief(job), memory: closed.memory, transcriptTurns: count ?? 0,
    }),
  };
  const { data, error } = await sb().from("reports").insert(report).select("*").single();
  if (error) {
    // Two tabs closing at once: the other one won, return its report.
    const again = await getReport(session.id);
    if (again) return again;
    throw new Error(error.message);
  }
  return data as Report;
}
