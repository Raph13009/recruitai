// Durable Postgres store via Supabase (service role), used when USE_MOCK_DB=false.
// Same surface as mock.ts. The server enforces agency scoping on every query (the service role
// bypasses RLS); recruiters are Supabase Auth users, so passwords never touch our tables.
// Needs both migrations in supabase/migrations applied (the MVP one adds the interviewer settings
// and the session columns).
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { defaultBranding } from "@/lib/branding";
import { supabaseAdmin, supabaseAuthClient } from "@/lib/db/client";
import { agencyAdminId, canSetRecruiterRole, withRole } from "@/lib/auth/permissions";
import {
  DEMO_ACCOUNT, DEMO_IDS, defaultInterviewer, durationSeconds, jobBrief, normalizeAgency, normalizeSession,
  type SessionContext,
} from "@/lib/db/helpers";
import type {
  Agency, AgencyBranding, AgencyInvite, EndReason, InterviewConfig, InterviewEngineKind, InterviewMode,
  InterviewSession, InterviewerSettings, Job, JobStatus, Recruiter, RecruiterRole, Report, TranscriptRole,
  TranscriptTurn, UpdateRecruiterRoleResult,
} from "@/lib/db/types";
import { env } from "@/lib/env";
import { applyFact, emptyMemory, type CandidateMemory, type FactInput } from "@/lib/interview/memory";
import { AI_DISCLOSURE_TEMPLATE, DEFAULT_PERSONA } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { getDemoJobFacts, type JobFacts } from "@/lib/job";
import { requireScenario, scenarioResourceIds, scenarioToJobFacts, starterJobFacts } from "@/lib/scenarios";

const now = () => new Date().toISOString();
const newToken = () => randomBytes(18).toString("base64url");
const sb = () => supabaseAdmin();

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

const asAgency = (row: unknown) => normalizeAgency(row as Agency);
const asSession = (row: unknown) => normalizeSession(row as InterviewSession);
const asRecruiter = (row: Recruiter): Recruiter => ({ ...row, role: withRole(row.role) });
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

// ---------------------------------------------------------------------------
// Accounts and agencies
// ---------------------------------------------------------------------------

export async function getRecruiter(id: string): Promise<Recruiter | null> {
  const row = check(await sb().from("recruiters").select("*").eq("id", id).maybeSingle()) as Recruiter | null;
  return row ? asRecruiter(row) : null;
}

async function recruiterByEmail(email: string): Promise<Recruiter | null> {
  const rows = check(await sb().from("recruiters").select("*").ilike("email", email.trim()).limit(1)) as Recruiter[];
  return rows[0] ? asRecruiter(rows[0]) : null;
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
    id: userId,
    agency_id: DEMO_IDS.agency,
    full_name: DEMO_ACCOUNT.name,
    email: DEMO_ACCOUNT.email,
    role: "owner",
    created_at: now(),
  };
  return asRecruiter(check(await sb().from("recruiters").upsert(row).select("*").single()) as Recruiter);
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
  const agencyName = input.agencyName.trim();
  try {
    const t = now();
    check(await sb().from("agencies").insert({ id: agencyId, name: agencyName, interviewer: defaultInterviewer(), created_at: t }));
    const recruiter = asRecruiter(
      check(
        await sb()
          .from("recruiters")
          .insert({
            id: userId,
            agency_id: agencyId,
            full_name: input.fullName.trim(),
            email,
            role: "owner",
            created_at: t,
          })
          .select("*")
          .single(),
      ) as Recruiter,
    );
    check(await sb().from("agencies").update({ created_by: userId }).eq("id", agencyId));
    await seedStarterJobs(agencyId, agencyName);
    return recruiter;
  } catch (err) {
    // Leave nothing half-created behind.
    await sb().from("agencies").delete().eq("id", agencyId);
    await sb().auth.admin.deleteUser(userId);
    throw err;
  }
}

/** Fills an empty agency with the five demo scenario posts. No-op when jobs already exist. */
export async function ensureStarterJobs(agencyId: string): Promise<void> {
  if ((await listJobs(agencyId)).length > 0) return;
  const agency = await getAgency(agencyId);
  if (!agency) return;
  await seedStarterJobs(agency.id, agency.name);
}

async function seedStarterJobs(agencyId: string, agencyName: string): Promise<void> {
  for (const facts of starterJobFacts(agencyName)) {
    await upsertJob(agencyId, { facts, status: "open" });
  }
}

export async function listAgencyRecruiters(agencyId: string): Promise<Recruiter[]> {
  const rows = check(
    await sb().from("recruiters").select("*").eq("agency_id", agencyId).order("full_name"),
  ) as Recruiter[];
  return rows.map(asRecruiter);
}

export async function listAgencyInvites(agencyId: string): Promise<AgencyInvite[]> {
  return check(
    await sb()
      .from("agency_invites")
      .select("*")
      .eq("agency_id", agencyId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ) as AgencyInvite[];
}

export async function getAgencyInviteByToken(token: string): Promise<(AgencyInvite & { agency_name: string }) | null> {
  const invite = check(
    await sb().from("agency_invites").select("*").eq("token", token).maybeSingle(),
  ) as AgencyInvite | null;
  if (!invite || invite.accepted_at) return null;
  if (Date.parse(invite.expires_at) < Date.now()) return null;
  const agency = await getAgency(invite.agency_id);
  if (!agency) return null;
  return { ...invite, agency_name: agency.name };
}

export async function createAgencyInvite(input: {
  agencyId: string;
  email: string;
  invitedBy: string;
}): Promise<AgencyInvite | null> {
  const email = input.email.trim().toLowerCase();
  // One email = one recruiter account globally (Auth uniqueness).
  if (await recruiterByEmail(email)) return null;

  const pending = check(
    await sb()
      .from("agency_invites")
      .select("*")
      .eq("agency_id", input.agencyId)
      .ilike("email", email)
      .is("accepted_at", null)
      .maybeSingle(),
  ) as AgencyInvite | null;

  const t = now();
  const expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const token = newToken();

  if (pending) {
    return check(
      await sb()
        .from("agency_invites")
        .update({ token, invited_by: input.invitedBy, created_at: t, expires_at })
        .eq("id", pending.id)
        .select("*")
        .single(),
    ) as AgencyInvite;
  }

  return check(
    await sb()
      .from("agency_invites")
      .insert({
        agency_id: input.agencyId,
        email,
        role: "member",
        token,
        invited_by: input.invitedBy,
        created_at: t,
        expires_at,
        accepted_at: null,
      })
      .select("*")
      .single(),
  ) as AgencyInvite;
}

export async function acceptAgencyInvite(input: {
  token: string;
  fullName: string;
  password: string;
}): Promise<Recruiter | null> {
  const invite = await getAgencyInviteByToken(input.token);
  if (!invite) return null;
  if (await recruiterByEmail(invite.email)) return null;

  const { data, error } = await sb().auth.admin.createUser({
    email: invite.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) return null;
    throw new Error(error?.message ?? "Création du compte impossible.");
  }

  const userId = data.user.id;
  const t = now();
  try {
    const recruiter = asRecruiter(
      check(
        await sb()
          .from("recruiters")
          .insert({
            id: userId,
            agency_id: invite.agency_id,
            full_name: input.fullName.trim(),
            email: invite.email,
            role: "member",
            created_at: t,
          })
          .select("*")
          .single(),
      ) as Recruiter,
    );
    check(
      await sb()
        .from("agency_invites")
        .update({ accepted_at: t })
        .eq("id", invite.id)
        .eq("token", input.token)
        .select("id")
        .single(),
    );
    return recruiter;
  } catch (err) {
    await sb().auth.admin.deleteUser(userId);
    throw err;
  }
}

export async function revokeAgencyInvite(agencyId: string, inviteId: string): Promise<boolean> {
  const rows = check(
    await sb()
      .from("agency_invites")
      .delete()
      .eq("id", inviteId)
      .eq("agency_id", agencyId)
      .is("accepted_at", null)
      .select("id"),
  ) as { id: string }[];
  return rows.length > 0;
}

export async function updateAgencyRecruiterRole(input: {
  agencyId: string;
  actorId: string;
  targetId: string;
  role: RecruiterRole;
}): Promise<UpdateRecruiterRoleResult> {
  const agency = await getAgency(input.agencyId);
  if (!agency) return "not_found";
  const members = await listAgencyRecruiters(input.agencyId);
  const actor = members.find((r) => r.id === input.actorId);
  const target = members.find((r) => r.id === input.targetId);
  if (!actor || !target) return "not_found";

  const allowed = canSetRecruiterRole({
    actorId: actor.id,
    actorRole: actor.role,
    targetId: target.id,
    targetRole: target.role,
    newRole: input.role,
    adminId: agencyAdminId(agency, members),
    ownerCount: members.filter((r) => r.role === "owner").length,
  });
  if (!allowed) return "forbidden";

  check(
    await sb()
      .from("recruiters")
      .update({ role: input.role })
      .eq("id", target.id)
      .eq("agency_id", input.agencyId)
      .select("id")
      .single(),
  );
  return "ok";
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

export async function updateAgencyBranding(agencyId: string, branding: AgencyBranding): Promise<Agency | null> {
  const merged = { ...defaultBranding(), ...branding };
  const row = check(await sb().from("agencies").update({ branding: merged }).eq("id", agencyId).select("*").maybeSingle());
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

/** Upserts a demo-agency job from a scenario pack entry (or the legacy demo job). */
export async function ensureDemoScenarioJob(scenarioId?: string | null): Promise<Job | null> {
  await ensureDemoAgency();
  const scenario = scenarioId ? requireScenario(scenarioId) : null;
  const ids = scenario ? scenarioResourceIds(scenario.id) : { job: DEMO_IDS.job, config: DEMO_IDS.config };
  const facts: JobFacts = scenario ? scenarioToJobFacts(scenario) : getDemoJobFacts();
  const t = now();
  const { error } = await sb().from("jobs").upsert({
    id: ids.job,
    agency_id: DEMO_IDS.agency,
    title: facts.job_title,
    location: facts.location,
    status: "open",
    facts,
    created_at: t,
    updated_at: t,
  });
  if (error) throw new Error(error.message);
  await sb().from("interview_configs").upsert({
    id: ids.config,
    agency_id: DEMO_IDS.agency,
    job_id: ids.job,
    language: "fr",
    voice: env.geminiVoice(),
    ai_disclosure: AI_DISCLOSURE_TEMPLATE,
    created_at: t,
  });
  return getJob(DEMO_IDS.agency, ids.job);
}

/** The job behind the public "try it" page: the demo agency's demo job (created if missing). */
export async function publicDemoJob(): Promise<Job | null> {
  return ensureDemoScenarioJob(null);
}

// ---------------------------------------------------------------------------
// Interviews, recruiter side (scoped by agency)
// ---------------------------------------------------------------------------

async function insertSession(
  job: Job,
  input: { label?: string; email?: string | null; invited?: boolean } = {},
): Promise<InterviewSession | null> {
  const config = check(
    await sb().from("interview_configs").select("id").eq("job_id", job.id).limit(1).maybeSingle(),
  ) as { id: string } | null;
  if (!config) return null;
  const email = input.email?.trim().toLowerCase() || null;
  const label = input.label?.trim() || email || "Candidat anonyme";
  const t = now();
  const session: InterviewSession = {
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: config.id,
    token: newToken(), candidate_label: label, candidate_email: email,
    invited_at: input.invited ? t : null, is_synthetic: false,
    status: "created", mode: null, engine: null, end_reason: null, live_starts: 0, memory: emptyMemory(),
    recruiter_status: "to_review", recruiter_rating: null, is_favorite: false, next_action: null,
    created_at: t, started_at: null, completed_at: null,
  };
  return asSession(check(await sb().from("sessions").insert(session).select("*").single()));
}

export async function createSession(
  agencyId: string,
  input: { jobId: string; candidateEmail?: string; candidateLabel?: string },
): Promise<InterviewSession | null> {
  const job = await getJob(agencyId, input.jobId);
  if (!job || job.status !== "open") return null;
  return insertSession(job, {
    label: input.candidateLabel,
    email: input.candidateEmail,
    invited: Boolean(input.candidateEmail),
  });
}

export async function createPublicDemoSession(scenarioId?: string | null): Promise<InterviewSession | null> {
  const job = await ensureDemoScenarioJob(scenarioId);
  return job
    ? insertSession(job, { label: scenarioId ? `Essai · ${requireScenario(scenarioId).name}` : "Essai public" })
    : null;
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

export type SessionReviewPatch = {
  recruiter_status?: InterviewSession["recruiter_status"];
  recruiter_rating?: number | null;
  is_favorite?: boolean;
  next_action?: InterviewSession["next_action"];
};

/** Updates recruiter review fields for an interview in this agency. */
export async function updateSessionReview(
  agencyId: string,
  id: string,
  patch: SessionReviewPatch,
): Promise<InterviewSession | null> {
  const existing = await getSession(agencyId, id);
  if (!existing) return null;
  const update: Record<string, unknown> = {};
  if (patch.recruiter_status !== undefined) update.recruiter_status = patch.recruiter_status;
  if (patch.recruiter_rating !== undefined) update.recruiter_rating = patch.recruiter_rating;
  if (patch.is_favorite !== undefined) update.is_favorite = patch.is_favorite;
  if (patch.next_action !== undefined) update.next_action = patch.next_action;
  if (!Object.keys(update).length) return existing;
  return asSession(
    check(await sb().from("sessions").update(update).eq("id", id).eq("agency_id", agencyId).select("*").single()),
  );
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
