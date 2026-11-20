// Single entry point for data: mock (default), private Postgres (DATABASE_URL), or Supabase Cloud.
import "server-only";
import { supabaseConfigured } from "@/lib/db/client";
import { candidatePayloadOf, dashboardOf } from "@/lib/db/helpers";
import * as mock from "@/lib/db/mock";
import { databaseConfigured } from "@/lib/db/pg";
import * as postgres from "@/lib/db/postgres-store";
import * as remote from "@/lib/db/supabase-store";
import type { CandidateSessionPayload } from "@/lib/db/types";
import { env } from "@/lib/env";

export {
  DEMO_ACCOUNT, DEMO_IDS, defaultInterviewer, durationSeconds, jobBrief, type SessionContext,
} from "@/lib/db/helpers";

type StoreApi = typeof mock;
const remoteStore: StoreApi = remote;
const postgresStore: StoreApi = postgres;

/** True when data lives in private PostgreSQL (Dokploy Option A). */
export const usingPostgres = () => !env.useMockDb() && databaseConfigured();

/** True when data lives in Supabase Cloud (legacy path during migration). */
export const usingSupabase = () => !env.useMockDb() && !usingPostgres() && supabaseConfigured();

const store = (): StoreApi => {
  if (usingPostgres()) return postgresStore;
  if (usingSupabase()) return remoteStore;
  return mock;
};

// Accounts and agencies
export const authenticate: StoreApi["authenticate"] = (...a) => store().authenticate(...a);
export const demoRecruiter: StoreApi["demoRecruiter"] = (...a) => store().demoRecruiter(...a);
export const getRecruiter: StoreApi["getRecruiter"] = (...a) => store().getRecruiter(...a);
export const getAgency: StoreApi["getAgency"] = (...a) => store().getAgency(...a);
export const createAgencyWithRecruiter: StoreApi["createAgencyWithRecruiter"] = (...a) => store().createAgencyWithRecruiter(...a);
export const listAgencyRecruiters: StoreApi["listAgencyRecruiters"] = (...a) => store().listAgencyRecruiters(...a);
export const listAgencyInvites: StoreApi["listAgencyInvites"] = (...a) => store().listAgencyInvites(...a);
export const getAgencyInviteByToken: StoreApi["getAgencyInviteByToken"] = (...a) => store().getAgencyInviteByToken(...a);
export const createAgencyInvite: StoreApi["createAgencyInvite"] = (...a) => store().createAgencyInvite(...a);
export const acceptAgencyInvite: StoreApi["acceptAgencyInvite"] = (...a) => store().acceptAgencyInvite(...a);
export const revokeAgencyInvite: StoreApi["revokeAgencyInvite"] = (...a) => store().revokeAgencyInvite(...a);
export const updateAgencyRecruiterRole: StoreApi["updateAgencyRecruiterRole"] = (...a) => store().updateAgencyRecruiterRole(...a);
export const updateAgency: StoreApi["updateAgency"] = (...a) => store().updateAgency(...a);
export const updateInterviewer: StoreApi["updateInterviewer"] = (...a) => store().updateInterviewer(...a);
export const updateAgencyBranding: StoreApi["updateAgencyBranding"] = (...a) => store().updateAgencyBranding(...a);
export const ensureStarterJobs: StoreApi["ensureStarterJobs"] = (...a) => store().ensureStarterJobs(...a);

// Jobs
export const listJobs: StoreApi["listJobs"] = (...a) => store().listJobs(...a);
export const getJob: StoreApi["getJob"] = (...a) => store().getJob(...a);
export const upsertJob: StoreApi["upsertJob"] = (...a) => store().upsertJob(...a);
export const setJobStatus: StoreApi["setJobStatus"] = (...a) => store().setJobStatus(...a);
export const publicDemoJob: StoreApi["publicDemoJob"] = (...a) => store().publicDemoJob(...a);

// Interviews, recruiter side
export const createSession: StoreApi["createSession"] = (...a) => store().createSession(...a);
export const createPublicDemoSession: StoreApi["createPublicDemoSession"] = (...a) => store().createPublicDemoSession(...a);
export const listSessions: StoreApi["listSessions"] = (...a) => store().listSessions(...a);
export const getSession: StoreApi["getSession"] = (...a) => store().getSession(...a);
export const updateSessionReview: StoreApi["updateSessionReview"] = (...a) => store().updateSessionReview(...a);
export const deleteSession: StoreApi["deleteSession"] = (...a) => store().deleteSession(...a);
export const getTranscript: StoreApi["getTranscript"] = (...a) => store().getTranscript(...a);
export const getReport: StoreApi["getReport"] = (...a) => store().getReport(...a);

export async function getDashboard(agencyId: string) {
  await ensureStarterJobs(agencyId);
  const [jobs, sessions] = await Promise.all([listJobs(agencyId), listSessions(agencyId)]);
  return dashboardOf(jobs, sessions);
}

// Interviews, candidate side
export const getSessionByToken: StoreApi["getSessionByToken"] = (...a) => store().getSessionByToken(...a);
export const getSessionContext: StoreApi["getSessionContext"] = (...a) => store().getSessionContext(...a);
export const markStarted: StoreApi["markStarted"] = (...a) => store().markStarted(...a);
export const recordFact: StoreApi["recordFact"] = (...a) => store().recordFact(...a);
export const appendTranscript: StoreApi["appendTranscript"] = (...a) => store().appendTranscript(...a);
export const completeSession: StoreApi["completeSession"] = (...a) => store().completeSession(...a);

export async function toCandidatePayload(
  token: string,
  experience: Omit<CandidateSessionPayload["experience"], "persona_name">,
): Promise<CandidateSessionPayload | null> {
  const ctx = await getSessionContext(token);
  return ctx ? candidatePayloadOf(ctx, experience) : null;
}

// Private-auth helpers (no-ops / unavailable on mock & supabase paths except via postgres store)
export const createPasswordResetToken = (...a: Parameters<typeof postgres.createPasswordResetToken>) => {
  if (!usingPostgres()) return Promise.resolve(null);
  return postgres.createPasswordResetToken(...a);
};
export const consumePasswordResetToken = (...a: Parameters<typeof postgres.consumePasswordResetToken>) => {
  if (!usingPostgres()) return Promise.resolve(false);
  return postgres.consumePasswordResetToken(...a);
};
