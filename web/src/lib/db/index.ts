// Single entry point for data (Raphaël's facade): the local demo store by default, Supabase when
// USE_MOCK_DB=false and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set. Import from "@/lib/db" only.
import "server-only";
import { supabaseConfigured } from "@/lib/db/client";
import { candidatePayloadOf, dashboardOf } from "@/lib/db/helpers";
import * as mock from "@/lib/db/mock";
import * as remote from "@/lib/db/supabase-store";
import type { CandidateSessionPayload } from "@/lib/db/types";
import { env } from "@/lib/env";

export {
  DEMO_ACCOUNT, DEMO_IDS, defaultInterviewer, durationSeconds, jobBrief, type SessionContext,
} from "@/lib/db/helpers";

type StoreApi = typeof mock;
// Compile-time check: the Supabase store offers exactly the same functions as the demo store.
const remoteStore: StoreApi = remote;

/** True when data lives in Supabase (shared by every server instance). */
export const usingSupabase = () => !env.useMockDb() && supabaseConfigured();
const store = (): StoreApi => (usingSupabase() ? remoteStore : mock);

// Accounts and agencies
export const authenticate: StoreApi["authenticate"] = (...a) => store().authenticate(...a);
export const demoRecruiter: StoreApi["demoRecruiter"] = (...a) => store().demoRecruiter(...a);
export const getRecruiter: StoreApi["getRecruiter"] = (...a) => store().getRecruiter(...a);
export const getAgency: StoreApi["getAgency"] = (...a) => store().getAgency(...a);
export const createAgencyWithRecruiter: StoreApi["createAgencyWithRecruiter"] = (...a) => store().createAgencyWithRecruiter(...a);
export const updateAgency: StoreApi["updateAgency"] = (...a) => store().updateAgency(...a);
export const updateInterviewer: StoreApi["updateInterviewer"] = (...a) => store().updateInterviewer(...a);

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
export const deleteSession: StoreApi["deleteSession"] = (...a) => store().deleteSession(...a);
export const getTranscript: StoreApi["getTranscript"] = (...a) => store().getTranscript(...a);
export const getReport: StoreApi["getReport"] = (...a) => store().getReport(...a);

export async function getDashboard(agencyId: string) {
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
