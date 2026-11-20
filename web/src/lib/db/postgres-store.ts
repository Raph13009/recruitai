// Durable Postgres store (private Option A). Same surface as mock.ts / supabase-store.ts.
// Auth: scrypt password_hash on recruiters (no Supabase Auth).
import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { agencyAdminId, canSetRecruiterRole, withRole } from "@/lib/auth/permissions";
import { defaultBranding } from "@/lib/branding";
import {
  DEMO_ACCOUNT, DEMO_IDS, defaultInterviewer, durationSeconds, jobBrief, normalizeAgency, normalizeSession,
  type SessionContext,
} from "@/lib/db/helpers";
import { query, withTransaction } from "@/lib/db/pg";
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
const asAgency = (row: unknown) => normalizeAgency(row as Agency);
const asSession = (row: unknown) => normalizeSession(row as InterviewSession);
const asRecruiter = (row: Recruiter): Recruiter => ({ ...row, role: withRole(row.role) });
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const RESET_TTL_MS = 60 * 60_000;

type DbRecruiter = Recruiter & { password_hash: string | null; must_reset_password: boolean };

function publicRecruiter(row: DbRecruiter): Recruiter {
  return asRecruiter({
    id: row.id,
    agency_id: row.agency_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  });
}

async function recruiterByEmail(email: string): Promise<DbRecruiter | null> {
  const { rows } = await query<DbRecruiter>(
    `select * from recruiters where lower(email) = lower($1) limit 1`,
    [email.trim()],
  );
  return rows[0] ?? null;
}

export async function getRecruiter(id: string): Promise<Recruiter | null> {
  const { rows } = await query<DbRecruiter>(`select * from recruiters where id = $1`, [id]);
  return rows[0] ? publicRecruiter(rows[0]) : null;
}

export async function authenticate(email: string, password: string): Promise<Recruiter | null> {
  const row = await recruiterByEmail(email);
  if (!row?.password_hash) return null;
  if (row.must_reset_password) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return publicRecruiter(row);
}

async function ensureDemoAgency(): Promise<void> {
  const { rows } = await query(`select id from agencies where id = $1`, [DEMO_IDS.agency]);
  if (rows[0]) return;
  await query(
    `insert into agencies (id, name, interviewer, branding, created_at)
     values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
    [DEMO_IDS.agency, "Interim Express", JSON.stringify(defaultInterviewer()), JSON.stringify(defaultBranding()), now()],
  );
}

export async function demoRecruiter(): Promise<Recruiter | null> {
  const found = await recruiterByEmail(DEMO_ACCOUNT.email);
  if (found) return publicRecruiter(found);
  await ensureDemoAgency();
  const t = now();
  const { rows } = await query<DbRecruiter>(
    `insert into recruiters (id, agency_id, full_name, email, role, password_hash, must_reset_password, created_at)
     values ($1, $2, $3, $4, 'owner', $5, false, $6)
     on conflict (id) do update set password_hash = excluded.password_hash
     returning *`,
    [DEMO_IDS.recruiter, DEMO_IDS.agency, DEMO_ACCOUNT.name, DEMO_ACCOUNT.email, hashPassword(DEMO_ACCOUNT.password), t],
  );
  await query(`update agencies set created_by = $1 where id = $2 and created_by is null`, [
    DEMO_IDS.recruiter,
    DEMO_IDS.agency,
  ]);
  return rows[0] ? publicRecruiter(rows[0]) : null;
}

export async function getAgency(id: string): Promise<Agency | null> {
  const { rows } = await query(`select * from agencies where id = $1`, [id]);
  return rows[0] ? asAgency(rows[0]) : null;
}

export async function createAgencyWithRecruiter(input: {
  agencyName: string; fullName: string; email: string; password: string;
}): Promise<Recruiter | null> {
  const email = input.email.trim().toLowerCase();
  if (await recruiterByEmail(email)) return null;
  const agencyId = randomUUID();
  const userId = randomUUID();
  const agencyName = input.agencyName.trim();
  const t = now();
  try {
    return await withTransaction(async (client) => {
      await client.query(
        `insert into agencies (id, name, interviewer, branding, created_at)
         values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
        [agencyId, agencyName, JSON.stringify(defaultInterviewer()), JSON.stringify(defaultBranding()), t],
      );
      const { rows } = await client.query<DbRecruiter>(
        `insert into recruiters (id, agency_id, full_name, email, role, password_hash, must_reset_password, created_at)
         values ($1, $2, $3, $4, 'owner', $5, false, $6) returning *`,
        [userId, agencyId, input.fullName.trim(), email, hashPassword(input.password), t],
      );
      await client.query(`update agencies set created_by = $1 where id = $2`, [userId, agencyId]);
      return publicRecruiter(rows[0]);
    }).then(async (recruiter) => {
      await seedStarterJobs(agencyId, agencyName);
      return recruiter;
    });
  } catch (err) {
    await query(`delete from agencies where id = $1`, [agencyId]).catch(() => undefined);
    throw err;
  }
}

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
  const { rows } = await query<DbRecruiter>(
    `select * from recruiters where agency_id = $1 order by full_name`,
    [agencyId],
  );
  return rows.map(publicRecruiter);
}

export async function listAgencyInvites(agencyId: string): Promise<AgencyInvite[]> {
  const { rows } = await query<AgencyInvite>(
    `select * from agency_invites where agency_id = $1 and accepted_at is null order by created_at desc`,
    [agencyId],
  );
  return rows;
}

export async function getAgencyInviteByToken(token: string): Promise<(AgencyInvite & { agency_name: string }) | null> {
  const { rows } = await query<AgencyInvite>(`select * from agency_invites where token = $1`, [token]);
  const invite = rows[0];
  if (!invite || invite.accepted_at) return null;
  if (Date.parse(invite.expires_at) < Date.now()) return null;
  const agency = await getAgency(invite.agency_id);
  if (!agency) return null;
  return { ...invite, agency_name: agency.name };
}

export async function createAgencyInvite(input: {
  agencyId: string; email: string; invitedBy: string;
}): Promise<AgencyInvite | null> {
  const email = input.email.trim().toLowerCase();
  if (await recruiterByEmail(email)) return null;
  const { rows: pendingRows } = await query<AgencyInvite>(
    `select * from agency_invites
     where agency_id = $1 and lower(email) = lower($2) and accepted_at is null`,
    [input.agencyId, email],
  );
  const t = now();
  const expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const token = newToken();
  if (pendingRows[0]) {
    const { rows } = await query<AgencyInvite>(
      `update agency_invites set token = $1, invited_by = $2, created_at = $3, expires_at = $4
       where id = $5 returning *`,
      [token, input.invitedBy, t, expires_at, pendingRows[0].id],
    );
    return rows[0] ?? null;
  }
  const { rows } = await query<AgencyInvite>(
    `insert into agency_invites (agency_id, email, role, token, invited_by, created_at, expires_at, accepted_at)
     values ($1, $2, 'member', $3, $4, $5, $6, null) returning *`,
    [input.agencyId, email, token, input.invitedBy, t, expires_at],
  );
  return rows[0] ?? null;
}

export async function acceptAgencyInvite(input: {
  token: string; fullName: string; password: string;
}): Promise<Recruiter | null> {
  const invite = await getAgencyInviteByToken(input.token);
  if (!invite) return null;
  if (await recruiterByEmail(invite.email)) return null;
  const userId = randomUUID();
  const t = now();
  return withTransaction(async (client) => {
    const { rows } = await client.query<DbRecruiter>(
      `insert into recruiters (id, agency_id, full_name, email, role, password_hash, must_reset_password, created_at)
       values ($1, $2, $3, $4, 'member', $5, false, $6) returning *`,
      [userId, invite.agency_id, input.fullName.trim(), invite.email, hashPassword(input.password), t],
    );
    await client.query(
      `update agency_invites set accepted_at = $1 where id = $2 and token = $3`,
      [t, invite.id, input.token],
    );
    return publicRecruiter(rows[0]);
  });
}

export async function revokeAgencyInvite(agencyId: string, inviteId: string): Promise<boolean> {
  const { rowCount } = await query(
    `delete from agency_invites where id = $1 and agency_id = $2 and accepted_at is null`,
    [inviteId, agencyId],
  );
  return (rowCount ?? 0) > 0;
}

export async function updateAgencyRecruiterRole(input: {
  agencyId: string; actorId: string; targetId: string; role: RecruiterRole;
}): Promise<UpdateRecruiterRoleResult> {
  const agency = await getAgency(input.agencyId);
  if (!agency) return "not_found";
  const members = await listAgencyRecruiters(input.agencyId);
  const actor = members.find((r) => r.id === input.actorId);
  const target = members.find((r) => r.id === input.targetId);
  if (!actor || !target) return "not_found";
  const allowed = canSetRecruiterRole({
    actorId: actor.id, actorRole: actor.role, targetId: target.id, targetRole: target.role,
    newRole: input.role, adminId: agencyAdminId(agency, members),
    ownerCount: members.filter((r) => r.role === "owner").length,
  });
  if (!allowed) return "forbidden";
  await query(`update recruiters set role = $1 where id = $2 and agency_id = $3`, [
    input.role, target.id, input.agencyId,
  ]);
  return "ok";
}

export async function updateAgency(agencyId: string, patch: { name: string }): Promise<Agency | null> {
  const name = patch.name.trim();
  const { rows } = await query(`update agencies set name = $1 where id = $2 returning *`, [name, agencyId]);
  if (!rows[0]) return null;
  for (const job of await listJobs(agencyId)) {
    await query(`update jobs set facts = $1::jsonb where id = $2 and agency_id = $3`, [
      JSON.stringify({ ...job.facts, agency: name }), job.id, agencyId,
    ]);
  }
  return asAgency(rows[0]);
}

export async function updateInterviewer(agencyId: string, settings: InterviewerSettings): Promise<Agency | null> {
  const interviewer = { ...settings, persona_name: settings.persona_name.trim() || DEFAULT_PERSONA };
  const { rows } = await query(
    `update agencies set interviewer = $1::jsonb where id = $2 returning *`,
    [JSON.stringify(interviewer), agencyId],
  );
  return rows[0] ? asAgency(rows[0]) : null;
}

export async function updateAgencyBranding(agencyId: string, branding: AgencyBranding): Promise<Agency | null> {
  const merged = { ...defaultBranding(), ...branding };
  const { rows } = await query(
    `update agencies set branding = $1::jsonb where id = $2 returning *`,
    [JSON.stringify(merged), agencyId],
  );
  return rows[0] ? asAgency(rows[0]) : null;
}

export async function listJobs(agencyId: string): Promise<Job[]> {
  const { rows } = await query<Job>(
    `select * from jobs where agency_id = $1 order by created_at desc`,
    [agencyId],
  );
  return rows;
}

export async function getJob(agencyId: string, id: string): Promise<Job | null> {
  const { rows } = await query<Job>(`select * from jobs where id = $1 and agency_id = $2`, [id, agencyId]);
  return rows[0] ?? null;
}

export async function upsertJob(
  agencyId: string,
  input: { id?: string; facts: JobFacts; status?: JobStatus },
): Promise<Job | null> {
  const t = now();
  if (input.id) {
    const existing = await getJob(agencyId, input.id);
    if (!existing) return null;
    const { rows } = await query<Job>(
      `update jobs set facts = $1::jsonb, title = $2, location = $3, status = $4, updated_at = $5
       where id = $6 and agency_id = $7 returning *`,
      [
        JSON.stringify(input.facts), input.facts.job_title, input.facts.location,
        input.status ?? existing.status, t, existing.id, agencyId,
      ],
    );
    return rows[0] ?? null;
  }
  const jobId = randomUUID();
  const { rows } = await query<Job>(
    `insert into jobs (id, agency_id, title, location, status, facts, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7) returning *`,
    [jobId, agencyId, input.facts.job_title, input.facts.location, input.status ?? "open", JSON.stringify(input.facts), t],
  );
  await query(
    `insert into interview_configs (id, agency_id, job_id, language, voice, ai_disclosure, created_at)
     values ($1, $2, $3, 'fr', $4, $5, $6)`,
    [randomUUID(), agencyId, jobId, env.geminiVoice(), AI_DISCLOSURE_TEMPLATE, t],
  );
  return rows[0] ?? null;
}

export async function setJobStatus(agencyId: string, id: string, status: JobStatus): Promise<Job | null> {
  const { rows } = await query<Job>(
    `update jobs set status = $1, updated_at = $2 where id = $3 and agency_id = $4 returning *`,
    [status, now(), id, agencyId],
  );
  return rows[0] ?? null;
}

export async function ensureDemoScenarioJob(scenarioId?: string | null): Promise<Job | null> {
  await ensureDemoAgency();
  const scenario = scenarioId ? requireScenario(scenarioId) : null;
  const ids = scenario ? scenarioResourceIds(scenario.id) : { job: DEMO_IDS.job, config: DEMO_IDS.config };
  const facts: JobFacts = scenario ? scenarioToJobFacts(scenario) : getDemoJobFacts();
  const t = now();
  await query(
    `insert into jobs (id, agency_id, title, location, status, facts, created_at, updated_at)
     values ($1, $2, $3, $4, 'open', $5::jsonb, $6, $6)
     on conflict (id) do update set title = excluded.title, location = excluded.location,
       facts = excluded.facts, status = 'open', updated_at = excluded.updated_at`,
    [ids.job, DEMO_IDS.agency, facts.job_title, facts.location, JSON.stringify(facts), t],
  );
  await query(
    `insert into interview_configs (id, agency_id, job_id, language, voice, ai_disclosure, created_at)
     values ($1, $2, $3, 'fr', $4, $5, $6)
     on conflict (id) do update set voice = excluded.voice, ai_disclosure = excluded.ai_disclosure`,
    [ids.config, DEMO_IDS.agency, ids.job, env.geminiVoice(), AI_DISCLOSURE_TEMPLATE, t],
  );
  return getJob(DEMO_IDS.agency, ids.job);
}

export async function publicDemoJob(): Promise<Job | null> {
  return ensureDemoScenarioJob(null);
}

async function insertSession(
  job: Job,
  input: { label?: string; email?: string | null; invited?: boolean } = {},
): Promise<InterviewSession | null> {
  const { rows: configs } = await query<{ id: string }>(
    `select id from interview_configs where job_id = $1 limit 1`,
    [job.id],
  );
  if (!configs[0]) return null;
  const email = input.email?.trim().toLowerCase() || null;
  const label = input.label?.trim() || email || "Candidat anonyme";
  const t = now();
  const session: InterviewSession = {
    id: randomUUID(), agency_id: job.agency_id, job_id: job.id, interview_config_id: configs[0].id,
    token: newToken(), candidate_label: label, candidate_email: email,
    invited_at: input.invited ? t : null, is_synthetic: false,
    status: "created", mode: null, engine: null, end_reason: null, live_starts: 0, memory: emptyMemory(),
    recruiter_status: "to_review", recruiter_rating: null, is_favorite: false, next_action: null,
    created_at: t, started_at: null, completed_at: null,
  };
  const { rows } = await query(
    `insert into sessions (
      id, agency_id, job_id, interview_config_id, token, candidate_label, candidate_email, invited_at,
      is_synthetic, status, mode, engine, end_reason, live_starts, memory, recruiter_status,
      recruiter_rating, is_favorite, next_action, created_at, started_at, completed_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22
    ) returning *`,
    [
      session.id, session.agency_id, session.job_id, session.interview_config_id, session.token,
      session.candidate_label, session.candidate_email, session.invited_at, session.is_synthetic,
      session.status, session.mode, session.engine, session.end_reason, session.live_starts,
      JSON.stringify(session.memory), session.recruiter_status, session.recruiter_rating,
      session.is_favorite, session.next_action, session.created_at, session.started_at, session.completed_at,
    ],
  );
  return rows[0] ? asSession(rows[0]) : null;
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
  const params: unknown[] = [agencyId];
  let sql = `select * from sessions where agency_id = $1`;
  if (filter.jobId) {
    params.push(filter.jobId);
    sql += ` and job_id = $2`;
  }
  sql += ` order by created_at desc`;
  const { rows } = await query(sql, params);
  return rows.map(asSession);
}

export async function getSession(agencyId: string, id: string): Promise<InterviewSession | null> {
  const { rows } = await query(`select * from sessions where id = $1 and agency_id = $2`, [id, agencyId]);
  return rows[0] ? asSession(rows[0]) : null;
}

export type SessionReviewPatch = {
  recruiter_status?: InterviewSession["recruiter_status"];
  recruiter_rating?: number | null;
  is_favorite?: boolean;
  next_action?: InterviewSession["next_action"];
};

export async function updateSessionReview(
  agencyId: string,
  id: string,
  patch: SessionReviewPatch,
): Promise<InterviewSession | null> {
  const existing = await getSession(agencyId, id);
  if (!existing) return null;
  const next = {
    recruiter_status: patch.recruiter_status ?? existing.recruiter_status,
    recruiter_rating: patch.recruiter_rating !== undefined ? patch.recruiter_rating : existing.recruiter_rating,
    is_favorite: patch.is_favorite ?? existing.is_favorite,
    next_action: patch.next_action !== undefined ? patch.next_action : existing.next_action,
  };
  const { rows } = await query(
    `update sessions set recruiter_status = $1, recruiter_rating = $2, is_favorite = $3, next_action = $4
     where id = $5 and agency_id = $6 returning *`,
    [next.recruiter_status, next.recruiter_rating, next.is_favorite, next.next_action, id, agencyId],
  );
  return rows[0] ? asSession(rows[0]) : null;
}

export async function deleteSession(agencyId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(`delete from sessions where id = $1 and agency_id = $2`, [id, agencyId]);
  return (rowCount ?? 0) > 0;
}

export async function getTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  const { rows } = await query<TranscriptTurn>(
    `select * from transcripts where session_id = $1 order by seq asc`,
    [sessionId],
  );
  return rows;
}

export async function getReport(sessionId: string): Promise<Report | null> {
  const { rows } = await query<Report>(`select * from reports where session_id = $1`, [sessionId]);
  return rows[0] ?? null;
}

export async function getSessionByToken(token: string): Promise<InterviewSession | null> {
  const { rows } = await query(`select * from sessions where token = $1`, [token]);
  return rows[0] ? asSession(rows[0]) : null;
}

export async function getSessionContext(token: string): Promise<SessionContext | null> {
  const session = await getSessionByToken(token);
  if (!session) return null;
  const [job, agency, configRes] = await Promise.all([
    getJob(session.agency_id, session.job_id),
    getAgency(session.agency_id),
    query(`select * from interview_configs where id = $1`, [session.interview_config_id]),
  ]);
  const config = configRes.rows[0] as InterviewConfig | undefined;
  if (!job || !agency || !config) return null;
  return { session, job, brief: jobBrief(job), agency, config };
}

async function patchSession(id: string, patch: Partial<InterviewSession>): Promise<InterviewSession> {
  const keys = Object.keys(patch) as (keyof InterviewSession)[];
  if (!keys.length) {
    const { rows } = await query(`select * from sessions where id = $1`, [id]);
    return asSession(rows[0]);
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const key of keys) {
    sets.push(`${key} = $${i++}${key === "memory" ? "::jsonb" : ""}`);
    const value = patch[key];
    params.push(key === "memory" ? JSON.stringify(value) : value);
  }
  params.push(id);
  const { rows } = await query(
    `update sessions set ${sets.join(", ")} where id = $${i} returning *`,
    params,
  );
  return asSession(rows[0]);
}

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
  for (let attempt = 0; ; attempt++) {
    const { rows: countRows } = await query<{ n: string }>(
      `select count(*)::text as n from transcripts where session_id = $1`,
      [session.id],
    );
    let seq = Number(countRows[0]?.n ?? 0);
    const rows: TranscriptTurn[] = turns.map((turn) => ({
      id: randomUUID(), session_id: session.id, agency_id: session.agency_id, seq: ++seq,
      role: turn.role, text: turn.text, created_at: now(),
    }));
    if (!rows.length) return seq;
    try {
      for (const row of rows) {
        await query(
          `insert into transcripts (id, session_id, agency_id, seq, role, text, created_at)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [row.id, row.session_id, row.agency_id, row.seq, row.role, row.text, row.created_at],
        );
      }
      return seq;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "23505" || attempt >= 2) throw err;
    }
  }
}

export async function completeSession(token: string, reason: EndReason, usedMode?: InterviewMode): Promise<Report | null> {
  const session = await getSessionByToken(token);
  if (!session) return null;
  const existing = await getReport(session.id);
  if (existing) return existing;
  const job = await getJob(session.agency_id, session.job_id);
  if (!job) return null;
  const closed = await patchSession(session.id, {
    status: "completed", completed_at: now(), end_reason: reason,
    ...(usedMode && session.mode ? { mode: usedMode } : {}),
  });
  const { rows: countRows } = await query<{ n: string }>(
    `select count(*)::text as n from transcripts where session_id = $1`,
    [session.id],
  );
  const report: Report = {
    id: randomUUID(), session_id: closed.id, agency_id: closed.agency_id, created_at: now(),
    content: buildReport({
      sessionId: closed.id, candidateLabel: closed.candidate_label, isSynthetic: closed.is_synthetic,
      mode: closed.mode, engine: closed.engine, endReason: reason, durationSeconds: durationSeconds(closed),
      job: jobBrief(job), memory: closed.memory, transcriptTurns: Number(countRows[0]?.n ?? 0),
    }),
  };
  try {
    const { rows } = await query(
      `insert into reports (id, session_id, agency_id, content, created_at)
       values ($1,$2,$3,$4::jsonb,$5) returning *`,
      [report.id, report.session_id, report.agency_id, JSON.stringify(report.content), report.created_at],
    );
    return rows[0] as Report;
  } catch (err) {
    const again = await getReport(session.id);
    if (again) return again;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Password reset (private auth)
// ---------------------------------------------------------------------------

function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Creates a one-time reset token. Returns the raw token to email (never store raw). */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const recruiter = await recruiterByEmail(email);
  if (!recruiter) return null;
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await query(
    `insert into password_reset_tokens (recruiter_id, token_hash, expires_at) values ($1, $2, $3)`,
    [recruiter.id, hashResetToken(raw), expires],
  );
  return raw;
}

export async function consumePasswordResetToken(rawToken: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashResetToken(rawToken);
  const { rows } = await query<{ id: string; recruiter_id: string }>(
    `select id, recruiter_id from password_reset_tokens
     where token_hash = $1 and used_at is null and expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return false;
  await withTransaction(async (client) => {
    await client.query(
      `update recruiters set password_hash = $1, must_reset_password = false where id = $2`,
      [hashPassword(newPassword), row.recruiter_id],
    );
    await client.query(`update password_reset_tokens set used_at = now() where id = $1`, [row.id]);
  });
  return true;
}

/** Mark migrated Auth users that have no local hash yet. */
export async function markMustResetPassword(recruiterId: string): Promise<void> {
  await query(`update recruiters set must_reset_password = true, password_hash = null where id = $1`, [recruiterId]);
}
