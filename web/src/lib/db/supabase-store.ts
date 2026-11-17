// Durable Postgres store via Supabase (service role). Same surface as mock.ts, all async.
import { randomBytes, randomUUID } from "node:crypto";
import type {
  Agency,
  CandidateSessionPayload,
  InterviewConfig,
  InterviewMode,
  InterviewSession,
  Job,
  JobStatus,
  Report,
  TranscriptRole,
  TranscriptTurn,
} from "@/lib/db/types";
import { supabaseAdmin } from "@/lib/db/client";
import { applyFact, emptyMemory, type FactInput } from "@/lib/interview/memory";
import { AI_DISCLOSURE } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { getDemoJobFacts, toJobBrief, type JobBrief, type JobFacts } from "@/lib/job";
import { env } from "@/lib/env";

const AGENCY_ID = "00000000-0000-4000-8000-000000000001";
const JOB_ID = "00000000-0000-4000-8000-000000000003";
const CONFIG_ID = "00000000-0000-4000-8000-000000000004";

const now = () => new Date().toISOString();
const newToken = () => randomBytes(18).toString("base64url");
const sb = () => supabaseAdmin();

export const jobBrief = (job: Job): JobBrief => toJobBrief(job.facts);

export async function hydrateFromCookie(): Promise<void> {
  // No-op: sessions live in Postgres.
}

export async function persistSession(_sessionId: string): Promise<void> {
  // No-op: writes go straight to Postgres.
}

export async function getAgency(): Promise<Agency> {
  const { data, error } = await sb().from("agencies").select("*").eq("id", AGENCY_ID).single();
  if (error || !data) throw new Error(error?.message ?? "Agency introuvable");
  return data as Agency;
}

export async function listJobs(): Promise<Job[]> {
  const { data, error } = await sb().from("jobs").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Job[];
}

export async function getJob(id: string): Promise<Job | null> {
  const { data, error } = await sb().from("jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Job) ?? null;
}

export async function defaultJob(): Promise<Job> {
  const job = await getJob(JOB_ID);
  if (!job) throw new Error("Job démo introuvable");
  return job;
}

export async function upsertJob(input: {
  id?: string;
  facts: JobFacts;
  status?: JobStatus;
}): Promise<Job> {
  const t = now();
  if (input.id) {
    const existing = await getJob(input.id);
    if (existing) {
      const { data, error } = await sb()
        .from("jobs")
        .update({
          facts: input.facts,
          title: input.facts.job_title,
          location: input.facts.location,
          status: input.status ?? existing.status,
          updated_at: t,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as Job;
    }
  }
  const agency = await getAgency();
  const jobId = randomUUID();
  const { data: job, error } = await sb()
    .from("jobs")
    .insert({
      id: jobId,
      agency_id: agency.id,
      title: input.facts.job_title,
      location: input.facts.location,
      status: input.status ?? "open",
      facts: input.facts,
      created_at: t,
      updated_at: t,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { error: cfgErr } = await sb().from("interview_configs").insert({
    id: randomUUID(),
    agency_id: agency.id,
    job_id: jobId,
    language: "fr",
    voice: env.geminiVoice(),
    ai_disclosure: AI_DISCLOSURE,
    created_at: t,
  });
  if (cfgErr) throw new Error(cfgErr.message);
  return job as Job;
}

export async function listSessions(): Promise<InterviewSession[]> {
  const { data, error } = await sb()
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InterviewSession[];
}

export async function getSessionById(id: string): Promise<InterviewSession | null> {
  const { data, error } = await sb().from("sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InterviewSession) ?? null;
}

export async function getSessionByToken(token: string): Promise<InterviewSession | null> {
  const { data, error } = await sb().from("sessions").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InterviewSession) ?? null;
}

export async function getTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  const { data, error } = await sb()
    .from("transcripts")
    .select("*")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TranscriptTurn[];
}

export async function getReport(sessionId: string): Promise<Report | null> {
  const { data, error } = await sb()
    .from("reports")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Report) ?? null;
}

export async function createSession(input: {
  jobId?: string;
  candidateLabel?: string;
  token?: string;
  id?: string;
}): Promise<InterviewSession | null> {
  const job = input.jobId ? await getJob(input.jobId) : await defaultJob();
  if (!job) return null;
  const { data: config, error: cfgErr } = await sb()
    .from("interview_configs")
    .select("*")
    .eq("job_id", job.id)
    .limit(1)
    .maybeSingle();
  if (cfgErr || !config) return null;

  // Idempotent recreate across cold starts: reuse existing row if token/id match.
  if (input.token) {
    const existing = await getSessionByToken(input.token);
    if (existing) return existing;
  }
  if (input.id) {
    const existing = await getSessionById(input.id);
    if (existing) return existing;
  }

  const session: InterviewSession = {
    id: input.id || randomUUID(),
    agency_id: job.agency_id,
    job_id: job.id,
    interview_config_id: (config as InterviewConfig).id,
    token: input.token || newToken(),
    candidate_label: input.candidateLabel?.trim() || "Candidat anonyme",
    is_synthetic: false,
    status: "created",
    mode: null,
    memory: emptyMemory(),
    created_at: now(),
    started_at: null,
    completed_at: null,
  };

  const { data, error } = await sb().from("sessions").insert(session).select("*").single();
  if (error) {
    // Race: another instance inserted the same token.
    if (input.token) {
      const again = await getSessionByToken(input.token);
      if (again) return again;
    }
    throw new Error(error.message);
  }
  return data as InterviewSession;
}

export async function ensureSession(input: {
  sessionId?: string;
  token?: string;
  candidateLabel?: string;
}): Promise<InterviewSession | null> {
  let session =
    (input.sessionId ? await getSessionById(input.sessionId) : null) ??
    (input.token ? await getSessionByToken(input.token) : null);
  if (session) return session;
  if (!input.sessionId && !input.token) return null;
  return createSession({
    id: input.sessionId,
    token: input.token,
    candidateLabel: input.candidateLabel,
  });
}

export async function getDashboard() {
  const [agency, jobs, sessions] = await Promise.all([getAgency(), listJobs(), listSessions()]);
  return {
    agency,
    jobs: jobs.map((j) => ({ ...j, brief: jobBrief(j) })),
    sessions,
    counts: {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      in_progress: sessions.filter((s) => s.status === "in_progress").length,
    },
  };
}

export async function toCandidatePayload(
  session: InterviewSession,
): Promise<CandidateSessionPayload | null> {
  const job = await getJob(session.job_id);
  const { data: config } = await sb()
    .from("interview_configs")
    .select("*")
    .eq("id", session.interview_config_id)
    .maybeSingle();
  if (!job || !config) return null;
  const brief = jobBrief(job);
  return {
    id: session.id,
    token: session.token,
    status: session.status,
    agency: brief.agency,
    job: {
      title: brief.job_title,
      location: brief.location,
      contract: brief.contract,
      salary_gross_hourly_eur: brief.salary_gross_hourly_eur,
      working_hours: brief.working_hours,
      tasks: brief.tasks,
      start_date_fr: brief.start_date_fr,
    },
    ai_disclosure: (config as InterviewConfig).ai_disclosure,
  };
}

export async function markStarted(session: InterviewSession, mode: InterviewMode): Promise<InterviewSession> {
  if (session.status === "completed") return session;
  const patch = {
    status: "in_progress" as const,
    mode,
    started_at: session.started_at ?? now(),
  };
  const { data, error } = await sb()
    .from("sessions")
    .update(patch)
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as InterviewSession;
}

export async function recordFact(session: InterviewSession, input: FactInput) {
  const job = await getJob(session.job_id);
  const memory = applyFact(session.memory, input, job?.facts.working_hours ?? []);
  const { data, error } = await sb()
    .from("sessions")
    .update({ memory })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  Object.assign(session, data);
  return memory;
}

export async function appendTranscript(
  session: InterviewSession,
  turns: { role: TranscriptRole; text: string }[],
) {
  const existing = await getTranscript(session.id);
  let seq = existing.length;
  const rows: TranscriptTurn[] = turns.map((turn) => ({
    id: randomUUID(),
    session_id: session.id,
    agency_id: session.agency_id,
    seq: ++seq,
    role: turn.role,
    text: turn.text,
    created_at: now(),
  }));
  if (rows.length) {
    const { error } = await sb().from("transcripts").insert(rows);
    if (error) throw new Error(error.message);
  }
  return seq;
}

export async function completeSession(session: InterviewSession): Promise<Report | null> {
  const job = await getJob(session.job_id);
  if (!job) return null;
  const existing = await getReport(session.id);
  if (existing) return existing;

  const transcriptTurns = (await getTranscript(session.id)).length;
  const report: Report = {
    id: randomUUID(),
    session_id: session.id,
    agency_id: session.agency_id,
    created_at: now(),
    content: buildReport({
      sessionId: session.id,
      candidateLabel: session.candidate_label,
      isSynthetic: session.is_synthetic,
      mode: session.mode,
      job: jobBrief(job),
      memory: session.memory,
      transcriptTurns,
    }),
  };

  const { error: sErr } = await sb()
    .from("sessions")
    .update({ status: "completed", completed_at: now() })
    .eq("id", session.id);
  if (sErr) throw new Error(sErr.message);

  const { data, error } = await sb().from("reports").insert(report).select("*").single();
  if (error) throw new Error(error.message);
  return data as Report;
}

// Keep seed ids available for tests / debugging.
export const DEMO_IDS = { AGENCY_ID, JOB_ID, CONFIG_ID, getDemoJobFacts };
