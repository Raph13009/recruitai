import { env } from "@/lib/env";
import { supabaseConfigured } from "@/lib/db/client";
import * as mock from "@/lib/db/mock";
import * as remote from "@/lib/db/supabase-store";
import type {
  Agency,
  CandidateSessionPayload,
  InterviewMode,
  InterviewSession,
  Job,
  JobStatus,
  Report,
  TranscriptRole,
  TranscriptTurn,
} from "@/lib/db/types";
import type { FactInput } from "@/lib/interview/memory";
import type { CandidateMemory } from "@/lib/interview/memory";
import type { JobBrief, JobFacts } from "@/lib/job";

function useRemote(): boolean {
  return !env.useMockDb() && supabaseConfigured();
}

export const jobBrief = remote.jobBrief;

export async function hydrateFromCookie(): Promise<void> {
  if (useRemote()) return remote.hydrateFromCookie();
  return mock.hydrateFromCookie();
}

export async function persistSession(sessionId: string): Promise<void> {
  if (useRemote()) return remote.persistSession(sessionId);
  return mock.persistSession(sessionId);
}

export async function getAgency(): Promise<Agency> {
  if (useRemote()) return remote.getAgency();
  return mock.getAgency();
}

export async function listJobs(): Promise<Job[]> {
  if (useRemote()) return remote.listJobs();
  return mock.listJobs();
}

export async function getJob(id: string): Promise<Job | null> {
  if (useRemote()) return remote.getJob(id);
  return mock.getJob(id);
}

export async function defaultJob(): Promise<Job> {
  if (useRemote()) return remote.defaultJob();
  return mock.defaultJob();
}

export async function upsertJob(input: {
  id?: string;
  facts: JobFacts;
  status?: JobStatus;
}): Promise<Job> {
  if (useRemote()) return remote.upsertJob(input);
  return mock.upsertJob(input);
}

export async function listSessions(): Promise<InterviewSession[]> {
  if (useRemote()) return remote.listSessions();
  return mock.listSessions();
}

export async function getSessionById(id: string): Promise<InterviewSession | null> {
  if (useRemote()) return remote.getSessionById(id);
  return mock.getSessionById(id);
}

export async function getSessionByToken(token: string): Promise<InterviewSession | null> {
  if (useRemote()) return remote.getSessionByToken(token);
  return mock.getSessionByToken(token);
}

export async function getTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  if (useRemote()) return remote.getTranscript(sessionId);
  return mock.getTranscript(sessionId);
}

export async function getReport(sessionId: string): Promise<Report | null> {
  if (useRemote()) return remote.getReport(sessionId);
  return mock.getReport(sessionId);
}

export async function createSession(input: {
  jobId?: string;
  candidateLabel?: string;
  token?: string;
  id?: string;
}): Promise<InterviewSession | null> {
  if (useRemote()) return remote.createSession(input);
  return mock.createSession(input);
}

export async function ensureSession(input: {
  sessionId?: string;
  token?: string;
  candidateLabel?: string;
}): Promise<InterviewSession | null> {
  if (useRemote()) return remote.ensureSession(input);
  return mock.ensureSession(input);
}

export async function getDashboard(): Promise<{
  agency: Agency;
  jobs: Array<Job & { brief: JobBrief }>;
  sessions: InterviewSession[];
  counts: { total: number; completed: number; in_progress: number };
}> {
  if (useRemote()) return remote.getDashboard();
  return mock.getDashboard();
}

export async function toCandidatePayload(
  session: InterviewSession,
): Promise<CandidateSessionPayload | null> {
  if (useRemote()) return remote.toCandidatePayload(session);
  return mock.toCandidatePayload(session);
}

export async function markStarted(
  session: InterviewSession,
  mode: InterviewMode,
): Promise<InterviewSession> {
  if (useRemote()) return remote.markStarted(session, mode);
  mock.markStarted(session, mode);
  return session;
}

export async function recordFact(
  session: InterviewSession,
  input: FactInput,
): Promise<CandidateMemory> {
  if (useRemote()) return remote.recordFact(session, input);
  return mock.recordFact(session, input);
}

export async function appendTranscript(
  session: InterviewSession,
  turns: { role: TranscriptRole; text: string }[],
): Promise<number> {
  if (useRemote()) return remote.appendTranscript(session, turns);
  return mock.appendTranscript(session, turns);
}

export async function completeSession(session: InterviewSession): Promise<Report | null> {
  if (useRemote()) return remote.completeSession(session);
  return mock.completeSession(session);
}

export type { CandidateSessionPayload } from "@/lib/db/types";
