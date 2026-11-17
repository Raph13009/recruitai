// In-memory stand-in for Postgres (same shape as the SQL migration). Data lives in the server process
// only: it resets on restart and is NOT shared across serverless instances. Swap for Supabase later.
import { randomBytes, randomUUID } from "node:crypto";
import type {
  Agency, CandidateSessionPayload, InterviewConfig, InterviewMode, InterviewSession, Job, JobStatus,
  Recruiter, Report, TranscriptRole, TranscriptTurn,
} from "@/lib/db/types";
import { applyFact, emptyMemory, type FactInput } from "@/lib/interview/memory";
import { AI_DISCLOSURE } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { getDemoJobFacts, toJobBrief, type JobBrief, type JobFacts } from "@/lib/job";
import { env } from "@/lib/env";
import { readDurableBag, writeDurableBag } from "@/lib/db/persist";

interface Store {
  agencies: Agency[];
  recruiters: Recruiter[];
  jobs: Job[];
  interview_configs: InterviewConfig[];
  sessions: InterviewSession[];
  transcripts: TranscriptTurn[];
  reports: Report[];
}

const g = globalThis as unknown as { __recruitaiStore?: Store };

const now = () => new Date().toISOString();
const newToken = () => randomBytes(18).toString("base64url");

// Stable IDs so a sealed session cookie still resolves the job after a cold start.
const AGENCY_ID = "00000000-0000-4000-8000-000000000001";
const RECRUITER_ID = "00000000-0000-4000-8000-000000000002";
const JOB_ID = "00000000-0000-4000-8000-000000000003";
const CONFIG_ID = "00000000-0000-4000-8000-000000000004";

function seed(): Store {
  const t = now();
  const agency: Agency = { id: AGENCY_ID, name: "Interim Express", created_at: t };
  const recruiter: Recruiter = {
    id: RECRUITER_ID, agency_id: agency.id, full_name: "Recruteur Démo", email: "recruteur@interim-express.example", created_at: t,
  };
  const facts = getDemoJobFacts();
  const job: Job = {
    id: JOB_ID, agency_id: agency.id, title: facts.job_title, location: facts.location,
    status: "open", facts, created_at: t, updated_at: t,
  };
  const config: InterviewConfig = {
    id: CONFIG_ID, agency_id: agency.id, job_id: job.id, language: "fr",
    voice: env.geminiVoice(), ai_disclosure: AI_DISCLOSURE, created_at: t,
  };
  const store: Store = {
    agencies: [agency], recruiters: [recruiter], jobs: [job], interview_configs: [config],
    sessions: [], transcripts: [], reports: [],
  };
  seedSyntheticCandidate(store, job, config);
  return store;
}

/** Léa Martin is fictional. She exists so the recruiter UI has a report to open. */
function seedSyntheticCandidate(store: Store, job: Job, config: InterviewConfig) {
  const hours = job.facts.working_hours;
  let memory = emptyMemory();
  const facts: FactInput[] = [
    { field: "name", raw: "Je m'appelle Léa Martin" },
    { field: "experience_sector", raw: "J'ai travaillé en restauration, en salle", normalized: "restauration" },
    { field: "availability", raw: "Je suis disponible immédiatement", normalized: "immediate" },
    { field: "shift_preference", raw: "Le premier, celui du matin", normalized: hours[0] },
    { field: "salary_expectation", raw: "Autour de 13 euros de l'heure", normalized: "13" },
  ];
  for (const f of facts) memory = applyFact(memory, f, hours);

  const session: InterviewSession = {
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: config.id,
    token: "demo-lea-martin", candidate_label: "Léa Martin (synthétique)", is_synthetic: true,
    status: "completed", mode: "audio", memory,
    created_at: now(), started_at: now(), completed_at: now(),
  };
  store.sessions.push(session);

  const lines: [TranscriptRole, string][] = [
    ["agent", "Bonjour, je suis Camille, une assistante IA. Si vous êtes prête, on commence ?"],
    ["candidate", "Oui, je suis prête. Je m'appelle Léa Martin."],
    ["agent", "Merci Léa. Quelle expérience avez-vous déjà ?"],
    ["candidate", "J'ai travaillé en restauration, en salle."],
    ["agent", "D'accord. À partir de quand êtes-vous disponible ?"],
    ["candidate", "Je suis disponible immédiatement."],
    ["agent", "Quel créneau vous convient : 6:00–13:00 ou 13:00–20:00 ?"],
    ["candidate", "Le premier, celui du matin."],
    ["agent", "Le salaire de la fiche est de 12,50 € brut de l'heure. Qu'attendez-vous ?"],
    ["candidate", "Autour de 13 euros de l'heure."],
    ["agent", "Merci Léa. Une personne de l'agence lira le compte rendu. Au revoir."],
  ];
  lines.forEach(([role, text], i) =>
    store.transcripts.push({
      id: randomUUID(), session_id: session.id, agency_id: session.agency_id, seq: i + 1, role, text, created_at: now(),
    }),
  );
  store.reports.push({
    id: randomUUID(), session_id: session.id, agency_id: session.agency_id, created_at: now(),
    content: buildReport({
      sessionId: session.id, candidateLabel: session.candidate_label, isSynthetic: true, mode: "audio",
      job: toJobBrief(job.facts), memory, transcriptTurns: lines.length,
    }),
  });
}

function db(): Store {
  return (g.__recruitaiStore ??= seed());
}

/**
 * Pull the sealed session cookie into this serverless instance.
 * Without this, POST /api/sessions on one instance + later /api/liveavatar on another → 404.
 */
export async function hydrateFromCookie(): Promise<void> {
  const bag = await readDurableBag();
  if (!bag?.session?.id) return;
  const store = db();
  // Remap to the stable demo job/config if this instance's seed ids differ.
  bag.session.job_id = JOB_ID;
  bag.session.agency_id = AGENCY_ID;
  bag.session.interview_config_id = CONFIG_ID;
  const idx = store.sessions.findIndex((s) => s.id === bag.session.id || s.token === bag.session.token);
  if (idx >= 0) store.sessions[idx] = bag.session;
  else store.sessions.push(bag.session);

  for (const turn of bag.transcripts ?? []) {
    turn.agency_id = AGENCY_ID;
    if (!store.transcripts.some((t) => t.id === turn.id)) store.transcripts.push(turn);
  }
}

/** Write the active session back to the cookie so the next instance can find it. */
export async function persistSession(sessionId: string): Promise<void> {
  const session = getSessionById(sessionId);
  if (!session) return;
  await writeDurableBag({ session, transcripts: getTranscript(sessionId) });
}

export const jobBrief = (job: Job): JobBrief => toJobBrief(job.facts);

// ---------- recruiter side ----------

export const getAgency = () => db().agencies[0];
export const listJobs = () => db().jobs;
export const getJob = (id: string) => db().jobs.find((j) => j.id === id) ?? null;
export const defaultJob = () => db().jobs[0];

export function upsertJob(input: { id?: string; facts: JobFacts; status?: JobStatus }): Job {
  const store = db();
  const t = now();
  const existing = input.id ? getJob(input.id) : null;
  if (existing) {
    existing.facts = input.facts;
    existing.title = input.facts.job_title;
    existing.location = input.facts.location;
    existing.status = input.status ?? existing.status;
    existing.updated_at = t;
    return existing;
  }
  const job: Job = {
    id: randomUUID(), agency_id: getAgency().id, title: input.facts.job_title, location: input.facts.location,
    status: input.status ?? "open", facts: input.facts, created_at: t, updated_at: t,
  };
  store.jobs.push(job);
  store.interview_configs.push({
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, language: "fr",
    voice: env.geminiVoice(), ai_disclosure: AI_DISCLOSURE, created_at: t,
  });
  return job;
}

export function listSessions(): InterviewSession[] {
  return [...db().sessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const getSessionById = (id: string) => db().sessions.find((s) => s.id === id) ?? null;
export const getSessionByToken = (token: string) => db().sessions.find((s) => s.token === token) ?? null;
export const getTranscript = (sessionId: string) =>
  db().transcripts.filter((t) => t.session_id === sessionId).sort((a, b) => a.seq - b.seq);
export const getReport = (sessionId: string) => db().reports.find((r) => r.session_id === sessionId) ?? null;

export function createSession(input: {
  jobId?: string;
  candidateLabel?: string;
  /** Reuse a known public interview token (needed when a serverless instance lost the in-memory row). */
  token?: string;
  id?: string;
}): InterviewSession | null {
  const store = db();
  const job = input.jobId ? getJob(input.jobId) : defaultJob();
  const config = job && store.interview_configs.find((c) => c.job_id === job.id);
  if (!job || !config) return null;
  const session: InterviewSession = {
    id: input.id || randomUUID(),
    agency_id: job.agency_id,
    job_id: job.id,
    interview_config_id: config.id,
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
  store.sessions.push(session);
  return session;
}

/**
 * Resolve a session across serverless instances: memory → cookie → recreate from client ids.
 * This keeps Gemini / LiveAvatar working even without Supabase.
 */
export async function ensureSession(input: {
  sessionId?: string;
  token?: string;
  candidateLabel?: string;
}): Promise<InterviewSession | null> {
  await hydrateFromCookie();
  let session =
    (input.sessionId ? getSessionById(input.sessionId) : null) ??
    (input.token ? getSessionByToken(input.token) : null);
  if (session) return session;
  if (!input.sessionId && !input.token) return null;
  session = createSession({
    id: input.sessionId,
    token: input.token,
    candidateLabel: input.candidateLabel,
  });
  if (session) await persistSession(session.id);
  return session;
}

export function getDashboard() {
  const sessions = listSessions();
  return {
    agency: getAgency(),
    jobs: listJobs().map((j) => ({ ...j, brief: jobBrief(j) })),
    sessions,
    counts: {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      in_progress: sessions.filter((s) => s.status === "in_progress").length,
    },
  };
}

// ---------- candidate side ----------

export function toCandidatePayload(session: InterviewSession): CandidateSessionPayload | null {
  const job = getJob(session.job_id);
  const config = db().interview_configs.find((c) => c.id === session.interview_config_id);
  if (!job || !config) return null;
  const brief = jobBrief(job);
  return {
    id: session.id, token: session.token, status: session.status, agency: brief.agency,
    job: {
      title: brief.job_title, location: brief.location, contract: brief.contract,
      salary_gross_hourly_eur: brief.salary_gross_hourly_eur, working_hours: brief.working_hours,
      tasks: brief.tasks, start_date_fr: brief.start_date_fr,
    },
    ai_disclosure: config.ai_disclosure,
  };
}

export function markStarted(session: InterviewSession, mode: InterviewMode) {
  if (session.status === "completed") return;
  session.status = "in_progress";
  session.mode = mode;
  session.started_at ??= now();
}

export function recordFact(session: InterviewSession, input: FactInput) {
  const job = getJob(session.job_id);
  session.memory = applyFact(session.memory, input, job?.facts.working_hours ?? []);
  return session.memory;
}

export function appendTranscript(session: InterviewSession, turns: { role: TranscriptRole; text: string }[]) {
  const store = db();
  let seq = getTranscript(session.id).length;
  for (const turn of turns) {
    store.transcripts.push({
      id: randomUUID(), session_id: session.id, agency_id: session.agency_id, seq: ++seq,
      role: turn.role, text: turn.text, created_at: now(),
    });
  }
  return seq;
}

export function completeSession(session: InterviewSession): Report | null {
  const store = db();
  const job = getJob(session.job_id);
  if (!job) return null;
  const existing = getReport(session.id);
  if (existing) return existing;
  session.status = "completed";
  session.completed_at = now();
  const report: Report = {
    id: randomUUID(), session_id: session.id, agency_id: session.agency_id, created_at: now(),
    content: buildReport({
      sessionId: session.id, candidateLabel: session.candidate_label, isSynthetic: session.is_synthetic,
      mode: session.mode, job: jobBrief(job), memory: session.memory,
      transcriptTurns: getTranscript(session.id).length,
    }),
  };
  store.reports.push(report);
  return report;
}
