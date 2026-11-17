// Local demo store, with the shape of supabase/migrations/*.sql. Used when USE_MOCK_DB is not "false".
// - Lives in the server process; in local development it is also saved to web/.data/store.json so
//   accounts, jobs and interviews survive a restart.
// - On serverless hosts (no writable disk) each instance has its own memory. Candidate interviews then
//   follow the candidate in a signed cookie (Raphaël's fix, lib/db/persist.ts) so the demo works
//   across instances; recruiter data does not. Use Supabase (USE_MOCK_DB=false) for real hosting.
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataFile } from "@/lib/data-dir";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { DEMO_ACCOUNT, DEMO_IDS, defaultInterviewer, durationSeconds, jobBrief, type SessionContext } from "@/lib/db/helpers";
import { readDurableBag, writeDurableBag } from "@/lib/db/persist";
import type {
  Agency, EndReason, InterviewConfig, InterviewEngineKind, InterviewMode, InterviewSession,
  InterviewerSettings, Job, JobStatus, Recruiter, Report, TranscriptRole, TranscriptTurn,
} from "@/lib/db/types";
import { env } from "@/lib/env";
import { applyFact, emptyMemory, type CandidateMemory, type FactInput } from "@/lib/interview/memory";
import { AI_DISCLOSURE_TEMPLATE, DEFAULT_PERSONA } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { getDemoJobFacts, toJobBrief, type JobFacts } from "@/lib/job";

/** Credentials stay in this store; the rest of the app only ever sees `Recruiter`. */
type StoredRecruiter = Recruiter & { password_hash: string };

interface Store {
  agencies: Agency[];
  recruiters: StoredRecruiter[];
  jobs: Job[];
  interview_configs: InterviewConfig[];
  sessions: InterviewSession[];
  transcripts: TranscriptTurn[];
  reports: Report[];
}

const storeFile = () => dataFile("store.json");
/** `memoryOnly` is set when the disk cannot be written: the store then lives in memory only. */
const g = globalThis as unknown as { __recruitaiDb?: { store: Store; mtimeMs: number; memoryOnly: boolean } };

const now = () => new Date().toISOString();
const newToken = () => randomBytes(18).toString("base64url");
const clone = <T>(value: T): T => structuredClone(value);
const publicRecruiter = (r: StoredRecruiter): Recruiter => ({
  id: r.id, agency_id: r.agency_id, full_name: r.full_name, email: r.email, created_at: r.created_at,
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function fileMtime(): number {
  try {
    return statSync(storeFile()).mtimeMs;
  } catch {
    return 0;
  }
}

function load(): Store | null {
  try {
    const parsed = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<Store>;
    const tables: (keyof Store)[] = ["agencies", "recruiters", "jobs", "interview_configs", "sessions", "transcripts", "reports"];
    return tables.every((t) => Array.isArray(parsed[t])) ? (parsed as Store) : null;
  } catch {
    return null;
  }
}

function save() {
  const state = g.__recruitaiDb;
  if (!state || state.memoryOnly) return;
  try {
    const file = storeFile();
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state.store));
    renameSync(tmp, file);
    state.mtimeMs = fileMtime();
  } catch {
    // Read-only disk: keep working in memory.
    state.memoryOnly = true;
  }
}

/** The live store. Reloads when the file changed underneath (another dev process) or was deleted (reset). */
function db(): Store {
  const state = g.__recruitaiDb;
  if (state?.memoryOnly) return state.store;
  if (!env.persistMockDb()) return (g.__recruitaiDb = { store: seed(), mtimeMs: 0, memoryOnly: true }).store;

  const mtimeMs = fileMtime();
  if (state && mtimeMs !== 0 && state.mtimeMs === mtimeMs) return state.store;
  if (mtimeMs !== 0) {
    const loaded = load();
    if (loaded) {
      g.__recruitaiDb = { store: loaded, mtimeMs, memoryOnly: false };
      return loaded;
    }
  }
  // First run, deleted file (reset) or unreadable file: start again from the seed.
  g.__recruitaiDb = { store: seed(), mtimeMs: 0, memoryOnly: false };
  save();
  return g.__recruitaiDb.store;
}

// ---------------------------------------------------------------------------
// Seed: one demo agency, one open job, three synthetic interviews.
// ---------------------------------------------------------------------------

/** Stable ids (same as the Supabase seed) so a demo interview resolves on every server instance. */
function seed(): Store {
  const t = now();
  const agency: Agency = { id: DEMO_IDS.agency, name: "Interim Express", interviewer: defaultInterviewer(), created_at: t };
  const recruiter: StoredRecruiter = {
    id: DEMO_IDS.recruiter, agency_id: agency.id, full_name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email,
    password_hash: hashPassword(DEMO_ACCOUNT.password), created_at: t,
  };
  const facts = getDemoJobFacts();
  const job: Job = {
    id: DEMO_IDS.job, agency_id: agency.id, title: facts.job_title, location: facts.location,
    status: "open", facts, created_at: t, updated_at: t,
  };
  const config: InterviewConfig = { ...newConfig(job), id: DEMO_IDS.config };
  const store: Store = {
    agencies: [agency], recruiters: [recruiter], jobs: [job], interview_configs: [config],
    sessions: [], transcripts: [], reports: [],
  };
  seedSyntheticCandidates(store, job, config);
  return store;
}

function newConfig(job: Job): InterviewConfig {
  return {
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, language: "fr",
    voice: env.geminiVoice(), ai_disclosure: AI_DISCLOSURE_TEMPLATE, created_at: now(),
  };
}

/** Fictional candidates, so the recruiter space has reports to open. Always flagged as synthetic. */
function seedSyntheticCandidates(store: Store, job: Job, config: InterviewConfig) {
  const hours = job.facts.working_hours;
  const brief = toJobBrief(job.facts);
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  const people: {
    token: string; label: string; startedAgo: number; minutes: number;
    facts: FactInput[]; lines: [TranscriptRole, string][];
  }[] = [
    {
      token: "demo-lea-martin", label: "Léa Martin (synthétique)", startedAgo: 190, minutes: 5,
      facts: [
        { field: "name", raw: "Je m'appelle Léa Martin", normalized: "Léa" },
        { field: "experience_sector", raw: "J'ai travaillé en restauration, en salle", normalized: "restauration" },
        { field: "availability", raw: "Je suis disponible immédiatement", normalized: "immediate" },
        { field: "shift_preference", raw: "Le premier, celui du matin", normalized: hours[0] },
        { field: "salary_expectation", raw: "Autour de 13 euros de l'heure", normalized: "13" },
      ],
      lines: [
        ["agent", "Bonjour, je suis Camille, une IA. Je mène ce premier entretien pour l'agence Interim Express. Si c'est bon pour vous, on commence ?"],
        ["candidate", "Oui, c'est bon. Je m'appelle Léa Martin."],
        ["agent", "Merci Léa. Quelle expérience avez-vous déjà ?"],
        ["candidate", "J'ai travaillé en restauration, en salle."],
        ["agent", "D'accord. À partir de quand êtes-vous disponible ?"],
        ["candidate", "Je suis disponible immédiatement."],
        ["agent", `Quel créneau vous convient : ${hours.join(" ou ")} ?`],
        ["candidate", "Le premier, celui du matin."],
        ["agent", "Le salaire de la fiche est de 12,50 € brut de l'heure. Qu'attendez-vous ?"],
        ["candidate", "Autour de 13 euros de l'heure."],
        ["agent", "Merci Léa. Une personne de l'agence lira le compte rendu. Au revoir."],
      ],
    },
    {
      token: "demo-karim-benali", label: "Karim B. (synthétique)", startedAgo: 75, minutes: 6,
      facts: [
        { field: "name", raw: "Moi c'est Karim", normalized: "Karim" },
        { field: "experience_sector", raw: "Deux ans en entrepôt, préparation de commandes", normalized: "logistique" },
        { field: "experience_tasks", raw: "Préparation de commandes et chargement de camions" },
        { field: "availability", raw: "Pas avant le mois prochain", normalized: addDaysIso(brief.start_date, 21) },
        { field: "shift_preference", raw: "Les deux me vont", normalized: hours.length > 1 ? "les deux" : hours[0] },
        { field: "salary_expectation", raw: "Le salaire de la fiche me convient", normalized: String(job.facts.salary_gross_hourly_eur) },
        { field: "candidate_question", raw: "Est-ce que la mission peut être prolongée ?" },
      ],
      lines: [
        ["agent", "Bonjour, je suis Camille, une IA. Si c'est bon pour vous, on commence ?"],
        ["candidate", "Oui. Moi c'est Karim."],
        ["agent", "Merci Karim. Quelle expérience avez-vous déjà ?"],
        ["candidate", "Deux ans en entrepôt, préparation de commandes et chargement de camions."],
        ["agent", "D'accord. À partir de quand êtes-vous disponible ?"],
        ["candidate", "Pas avant le mois prochain."],
        ["agent", `C'est noté. La mission commence le ${brief.start_date_fr}. Quel créneau vous convient ?`],
        ["candidate", "Les deux me vont."],
        ["agent", "Le salaire de la fiche est de 12,50 € brut de l'heure. Qu'attendez-vous ?"],
        ["candidate", "Le salaire de la fiche me convient. Est-ce que la mission peut être prolongée ?"],
        ["agent", `${job.facts.contract}. Merci Karim, une personne de l'agence lira le compte rendu. Au revoir.`],
      ],
    },
  ];

  for (const person of people) {
    let memory = emptyMemory();
    for (const fact of person.facts) memory = applyFact(memory, fact, hours);
    const started = minutesAgo(person.startedAgo);
    const completed = minutesAgo(person.startedAgo - person.minutes);
    const session: InterviewSession = {
      id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: config.id,
      token: person.token, candidate_label: person.label, is_synthetic: true,
      status: "completed", mode: "avatar", engine: "gemini", end_reason: "completed", live_starts: 1, memory,
      created_at: minutesAgo(person.startedAgo + 30), started_at: started, completed_at: completed,
    };
    store.sessions.push(session);
    person.lines.forEach(([role, text], i) =>
      store.transcripts.push({
        id: randomUUID(), session_id: session.id, agency_id: session.agency_id, seq: i + 1, role, text, created_at: started,
      }),
    );
    store.reports.push({
      id: randomUUID(), session_id: session.id, agency_id: session.agency_id, created_at: completed,
      content: buildReport({
        sessionId: session.id, candidateLabel: session.candidate_label, isSynthetic: true, mode: session.mode,
        engine: session.engine, endReason: session.end_reason, durationSeconds: person.minutes * 60,
        job: brief, memory, transcriptTurns: person.lines.length, now: new Date(completed),
      }),
    });
  }

  // One invitation that has not been used yet.
  store.sessions.push({
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: config.id,
    token: newToken(), candidate_label: "Candidat C-104 (synthétique)", is_synthetic: true,
    status: "created", mode: null, engine: null, end_reason: null, live_starts: 0, memory: emptyMemory(),
    created_at: minutesAgo(20), started_at: null, completed_at: null,
  });
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Accounts and agencies
// ---------------------------------------------------------------------------

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The recruiter with these credentials, or null. */
export async function authenticate(email: string, password: string): Promise<Recruiter | null> {
  const recruiter = db().recruiters.find((r) => sameEmail(r.email, email));
  return recruiter && verifyPassword(password, recruiter.password_hash) ? publicRecruiter(recruiter) : null;
}

/** The demo agency's account, for one-click access. */
export async function demoRecruiter(): Promise<Recruiter | null> {
  const recruiter = db().recruiters.find((r) => sameEmail(r.email, DEMO_ACCOUNT.email));
  return recruiter ? publicRecruiter(recruiter) : null;
}

export async function getRecruiter(id: string): Promise<Recruiter | null> {
  const recruiter = db().recruiters.find((r) => r.id === id);
  return recruiter ? publicRecruiter(recruiter) : null;
}

export async function getAgency(id: string): Promise<Agency | null> {
  return clone(db().agencies.find((a) => a.id === id) ?? null);
}

/** Creates an agency and its first recruiter. Returns null when the email is already taken. */
export async function createAgencyWithRecruiter(input: {
  agencyName: string; fullName: string; email: string; password: string;
}): Promise<Recruiter | null> {
  const store = db();
  if (store.recruiters.some((r) => sameEmail(r.email, input.email))) return null;
  const t = now();
  const agency: Agency = { id: randomUUID(), name: input.agencyName.trim(), interviewer: defaultInterviewer(), created_at: t };
  const recruiter: StoredRecruiter = {
    id: randomUUID(), agency_id: agency.id, full_name: input.fullName.trim(), email: input.email.trim().toLowerCase(),
    password_hash: hashPassword(input.password), created_at: t,
  };
  store.agencies.push(agency);
  store.recruiters.push(recruiter);
  save();
  return publicRecruiter(recruiter);
}

export async function updateAgency(agencyId: string, patch: { name: string }): Promise<Agency | null> {
  const agency = db().agencies.find((a) => a.id === agencyId);
  if (!agency) return null;
  agency.name = patch.name.trim();
  // Job sheets carry the agency name the interviewer says out loud: keep them in step.
  for (const job of db().jobs) if (job.agency_id === agencyId) job.facts = { ...job.facts, agency: agency.name };
  save();
  return clone(agency);
}

export async function updateInterviewer(agencyId: string, settings: InterviewerSettings): Promise<Agency | null> {
  const agency = db().agencies.find((a) => a.id === agencyId);
  if (!agency) return null;
  agency.interviewer = { ...settings, persona_name: settings.persona_name.trim() || DEFAULT_PERSONA };
  save();
  return clone(agency);
}

// ---------------------------------------------------------------------------
// Jobs (always scoped by agency)
// ---------------------------------------------------------------------------

export async function listJobs(agencyId: string): Promise<Job[]> {
  return clone(db().jobs.filter((j) => j.agency_id === agencyId).sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function getJob(agencyId: string, id: string): Promise<Job | null> {
  return clone(db().jobs.find((j) => j.id === id && j.agency_id === agencyId) ?? null);
}

export async function upsertJob(agencyId: string, input: { id?: string; facts: JobFacts; status?: JobStatus }): Promise<Job | null> {
  const store = db();
  const t = now();
  if (input.id) {
    const existing = store.jobs.find((j) => j.id === input.id && j.agency_id === agencyId);
    if (!existing) return null;
    existing.facts = input.facts;
    existing.title = input.facts.job_title;
    existing.location = input.facts.location;
    existing.status = input.status ?? existing.status;
    existing.updated_at = t;
    save();
    return clone(existing);
  }
  const job: Job = {
    id: randomUUID(), agency_id: agencyId, title: input.facts.job_title, location: input.facts.location,
    status: input.status ?? "open", facts: input.facts, created_at: t, updated_at: t,
  };
  store.jobs.push(job);
  store.interview_configs.push(newConfig(job));
  save();
  return clone(job);
}

export async function setJobStatus(agencyId: string, id: string, status: JobStatus): Promise<Job | null> {
  const job = db().jobs.find((j) => j.id === id && j.agency_id === agencyId);
  if (!job) return null;
  job.status = status;
  job.updated_at = now();
  save();
  return clone(job);
}

/** The job behind the public "try it" page: the demo agency's first open job. */
export async function publicDemoJob(): Promise<Job | null> {
  const store = db();
  // Stores saved before the stable ids: the demo agency is the demo account's.
  const agencyId = store.agencies.some((a) => a.id === DEMO_IDS.agency)
    ? DEMO_IDS.agency
    : store.recruiters.find((r) => sameEmail(r.email, DEMO_ACCOUNT.email))?.agency_id;
  const open = store.jobs.filter((j) => j.agency_id === agencyId && j.status === "open");
  return clone(open.find((j) => j.id === DEMO_IDS.job) ?? open[0] ?? null);
}

// ---------------------------------------------------------------------------
// Interviews, recruiter side (scoped by agency)
// ---------------------------------------------------------------------------

function insertSession(job: Job, label: string | undefined): InterviewSession | null {
  const store = db();
  const config = store.interview_configs.find((c) => c.job_id === job.id);
  if (!config) return null;
  const session: InterviewSession = {
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: config.id,
    token: newToken(), candidate_label: label?.trim() || "Candidat anonyme", is_synthetic: false,
    status: "created", mode: null, engine: null, end_reason: null, live_starts: 0, memory: emptyMemory(),
    created_at: now(), started_at: null, completed_at: null,
  };
  store.sessions.push(session);
  save();
  return clone(session);
}

/** New interview link for a job of this agency. Only open jobs accept new interviews. */
export async function createSession(agencyId: string, input: { jobId: string; candidateLabel?: string }): Promise<InterviewSession | null> {
  const job = db().jobs.find((j) => j.id === input.jobId && j.agency_id === agencyId);
  if (!job || job.status !== "open") return null;
  return insertSession(job, input.candidateLabel);
}

/** Called from the public demo's Server Action: the visitor's browser keeps a copy (serverless hosts). */
export async function createPublicDemoSession(): Promise<InterviewSession | null> {
  const demo = await publicDemoJob();
  const job = demo && db().jobs.find((j) => j.id === demo.id);
  const session = job ? insertSession(job, "Essai public") : null;
  if (session) await rememberForCandidate(session.token);
  return session;
}

export async function listSessions(agencyId: string, filter: { jobId?: string } = {}): Promise<InterviewSession[]> {
  return clone(
    db().sessions
      .filter((s) => s.agency_id === agencyId && (!filter.jobId || s.job_id === filter.jobId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
}

export async function getSession(agencyId: string, id: string): Promise<InterviewSession | null> {
  return clone(db().sessions.find((s) => s.id === id && s.agency_id === agencyId) ?? null);
}

/** Deletes an interview with its transcript and report (the candidate's data is gone for good). */
export async function deleteSession(agencyId: string, id: string): Promise<boolean> {
  const store = db();
  const index = store.sessions.findIndex((s) => s.id === id && s.agency_id === agencyId);
  if (index < 0) return false;
  store.sessions.splice(index, 1);
  store.transcripts = store.transcripts.filter((t) => t.session_id !== id);
  store.reports = store.reports.filter((r) => r.session_id !== id);
  save();
  return true;
}

export async function getTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  return clone(db().transcripts.filter((t) => t.session_id === sessionId).sort((a, b) => a.seq - b.seq));
}

export async function getReport(sessionId: string): Promise<Report | null> {
  return clone(db().reports.find((r) => r.session_id === sessionId) ?? null);
}

// ---------------------------------------------------------------------------
// Interviews, candidate side (reached by the unguessable link token)
// ---------------------------------------------------------------------------

/** True when this instance cannot keep data between requests (serverless): the candidate cookie takes over. */
const memoryOnly = () => {
  db();
  return g.__recruitaiDb?.memoryOnly === true;
};

/** Puts the candidate's own copy of the interview back into this instance's memory, when it was lost. */
async function recallFromCandidate(token: string): Promise<InterviewSession | null> {
  if (!memoryOnly()) return null;
  const bag = await readDurableBag();
  if (!bag || bag.session.token !== token) return null;
  const store = db();
  const job = store.jobs.find((j) => j.id === bag.session.job_id && j.agency_id === bag.session.agency_id);
  if (!job || !store.interview_configs.some((c) => c.id === bag.session.interview_config_id)) return null;
  const index = store.sessions.findIndex((s) => s.id === bag.session.id);
  if (index >= 0) store.sessions[index] = bag.session;
  else store.sessions.push(bag.session);
  for (const turn of bag.transcripts) {
    if (turn.session_id === bag.session.id && !store.transcripts.some((t) => t.id === turn.id)) store.transcripts.push(turn);
  }
  return bag.session;
}

/** Hands the candidate an up-to-date signed copy of the interview (serverless hosts only). */
async function rememberForCandidate(token: string): Promise<void> {
  if (!memoryOnly()) return;
  const store = db();
  const session = store.sessions.find((s) => s.token === token);
  if (!session) return;
  const transcripts = store.transcripts.filter((t) => t.session_id === session.id).sort((a, b) => a.seq - b.seq);
  await writeDurableBag({ session: clone(session), transcripts: clone(transcripts) });
}

/**
 * The live row for a candidate link. On serverless hosts the candidate's cookie holds the latest
 * copy (another instance may have moved the interview on since this one last saw it), so it wins.
 */
async function liveSession(token: string): Promise<InterviewSession | null> {
  if (memoryOnly()) await recallFromCandidate(token);
  return db().sessions.find((s) => s.token === token) ?? null;
}

export async function getSessionByToken(token: string): Promise<InterviewSession | null> {
  const session = await liveSession(token);
  return session ? clone(session) : null;
}

/** Everything the candidate flow needs about a session, read in one go. */
export async function getSessionContext(token: string): Promise<SessionContext | null> {
  const store = db();
  const session = await liveSession(token);
  const job = session && store.jobs.find((j) => j.id === session.job_id);
  const agency = session && store.agencies.find((a) => a.id === session.agency_id);
  const config = session && store.interview_configs.find((c) => c.id === session.interview_config_id);
  if (!session || !job || !agency || !config) return null;
  return clone({ session, job, brief: jobBrief(job), agency, config });
}

/** Marks the call as started and counts the start. Returns the number of starts so far. */
export async function markStarted(token: string, mode: InterviewMode, engine: InterviewEngineKind): Promise<number> {
  const session = await liveSession(token);
  if (!session || session.status === "completed") return session?.live_starts ?? 0;
  session.status = "in_progress";
  session.mode = mode;
  session.engine = engine;
  session.started_at ??= now();
  session.live_starts += 1;
  save();
  await rememberForCandidate(token);
  return session.live_starts;
}

export async function recordFact(token: string, input: FactInput): Promise<CandidateMemory | null> {
  const store = db();
  const session = await liveSession(token);
  if (!session) return null;
  const job = store.jobs.find((j) => j.id === session.job_id);
  session.memory = applyFact(session.memory, input, job?.facts.working_hours ?? []);
  save();
  await rememberForCandidate(token);
  return clone(session.memory);
}

export async function appendTranscript(token: string, turns: { role: TranscriptRole; text: string }[]): Promise<number> {
  const store = db();
  const session = await liveSession(token);
  if (!session) return 0;
  let seq = store.transcripts.filter((t) => t.session_id === session.id).length;
  for (const turn of turns) {
    store.transcripts.push({
      id: randomUUID(), session_id: session.id, agency_id: session.agency_id, seq: ++seq,
      role: turn.role, text: turn.text, created_at: now(),
    });
  }
  save();
  await rememberForCandidate(token);
  return seq;
}

/** Closes the interview and builds the factual report. Idempotent: a second call returns the same report. */
export async function completeSession(token: string, reason: EndReason, usedMode?: InterviewMode): Promise<Report | null> {
  const store = db();
  const session = await liveSession(token);
  const job = session && store.jobs.find((j) => j.id === session.job_id);
  if (!session || !job) return null;
  const existing = store.reports.find((r) => r.session_id === session.id);
  if (existing) return clone(existing);

  // The browser reports what actually ran (the video may have fallen back to audio).
  if (usedMode && session.mode) session.mode = usedMode;
  session.status = "completed";
  session.completed_at = now();
  session.end_reason = reason;
  const report: Report = {
    id: randomUUID(), session_id: session.id, agency_id: session.agency_id, created_at: now(),
    content: buildReport({
      sessionId: session.id, candidateLabel: session.candidate_label, isSynthetic: session.is_synthetic,
      mode: session.mode, engine: session.engine, endReason: reason, durationSeconds: durationSeconds(session),
      job: jobBrief(job), memory: session.memory,
      transcriptTurns: store.transcripts.filter((t) => t.session_id === session.id).length,
    }),
  };
  store.reports.push(report);
  save();
  await rememberForCandidate(token);
  return clone(report);
}
