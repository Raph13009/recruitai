// Pure helpers shared by both stores (local demo store and Supabase). No I/O here.
import type {
  Agency, AgencyBranding, CandidateSessionPayload, InterviewConfig, InterviewSession, InterviewerSettings, Job,
} from "@/lib/db/types";
import { withBranding } from "@/lib/branding";
import { env } from "@/lib/env";
import { DEFAULT_PERSONA, renderDisclosure } from "@/lib/interview/prompt";
import { toJobBrief, type JobBrief } from "@/lib/job";

/**
 * Fixed ids of the demo agency, its job and interview config. The same ids are seeded in the
 * Supabase project, so a demo link resolves on any server instance, with or without a database.
 */
export const DEMO_IDS = {
  agency: "00000000-0000-4000-8000-000000000001",
  recruiter: "00000000-0000-4000-8000-000000000002",
  job: "00000000-0000-4000-8000-000000000003",
  config: "00000000-0000-4000-8000-000000000004",
} as const;

/** One-click demo account (fictional agency, synthetic interviews). */
export const DEMO_ACCOUNT = { email: "demo@interim-express.example", password: "demo-recruitai", name: "Claire Dumont" } as const;

export const jobBrief = (job: Job): JobBrief => toJobBrief(job.facts);

export function defaultInterviewer(): InterviewerSettings {
  return {
    persona_name: DEFAULT_PERSONA,
    voice: env.geminiVoice(),
    video_enabled: true,
    avatar_id: null,
    avatar_name: null,
    avatar_preview_url: null,
  };
}

/** Rows written before the interviewer settings existed get the defaults. */
export function withInterviewer<
  T extends Omit<Agency, "interviewer" | "branding"> & {
    interviewer?: InterviewerSettings | null;
    branding?: AgencyBranding | null;
  },
>(agency: T): Omit<T, "interviewer"> & { interviewer: InterviewerSettings } {
  return { ...agency, interviewer: { ...defaultInterviewer(), ...(agency.interviewer ?? {}) } };
}

/** Agencies read from a store always carry interviewer settings and branding (older rows get defaults). */
export function normalizeAgency(
  agency: Omit<Agency, "interviewer" | "branding" | "created_by"> & {
    interviewer?: InterviewerSettings | null;
    branding?: AgencyBranding | null;
    created_by?: string | null;
  },
): Agency {
  return withBranding(withInterviewer({ ...agency, created_by: agency.created_by ?? null }));
}

/** Sessions written before the MVP columns existed get neutral values. */
export function normalizeSession(row: InterviewSession): InterviewSession {
  return {
    ...row,
    candidate_email: row.candidate_email ?? null,
    invited_at: row.invited_at ?? null,
    engine: row.engine ?? null,
    end_reason: row.end_reason ?? null,
    live_starts: row.live_starts ?? 0,
    recruiter_status: row.recruiter_status ?? "to_review",
    recruiter_rating: row.recruiter_rating ?? null,
    is_favorite: row.is_favorite ?? false,
    next_action: row.next_action ?? null,
  };
}

/** Defaults for new interview rows (recruiter review fields). */
export const SESSION_REVIEW_DEFAULTS = {
  recruiter_status: "to_review" as const,
  recruiter_rating: null,
  is_favorite: false,
  next_action: null,
};

export function durationSeconds(session: Pick<InterviewSession, "started_at" | "completed_at">): number | null {
  if (!session.started_at || !session.completed_at) return null;
  const seconds = Math.round((Date.parse(session.completed_at) - Date.parse(session.started_at)) / 1000);
  return seconds >= 0 ? seconds : null;
}

export function dashboardOf(jobs: Job[], sessions: InterviewSession[]) {
  const completed = sessions.filter((s) => s.status === "completed");
  // Closed by the interviewer, not abandoned by the candidate halfway.
  const finished = completed.filter((s) => s.end_reason !== "left");
  const started = sessions.filter((s) => s.status !== "created");
  const durations = completed.map(durationSeconds).filter((d): d is number => d !== null);
  return {
    jobs: jobs.map((job) => ({
      ...job,
      brief: jobBrief(job),
      sessions: sessions.filter((s) => s.job_id === job.id).length,
      completed: completed.filter((s) => s.job_id === job.id).length,
    })),
    sessions,
    counts: {
      total: sessions.length,
      completed: completed.length,
      in_progress: sessions.filter((s) => s.status === "in_progress").length,
      pending: sessions.filter((s) => s.status === "created").length,
      /** Share of started interviews that reached the end. null when none started. */
      completion_rate: started.length ? finished.length / started.length : null,
      avg_duration_seconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    },
  };
}

export interface SessionContext {
  session: InterviewSession;
  job: Job;
  brief: JobBrief;
  agency: Agency;
  config: InterviewConfig;
}

export function candidatePayloadOf(
  ctx: SessionContext,
  experience: Omit<CandidateSessionPayload["experience"], "persona_name">,
): CandidateSessionPayload {
  const { session, brief, agency, config } = ctx;
  const persona = agency.interviewer.persona_name;
  return {
    token: session.token,
    status: session.status,
    agency: brief.agency,
    job: {
      title: brief.job_title, location: brief.location, contract: brief.contract,
      salary_gross_hourly_eur: brief.salary_gross_hourly_eur, working_hours: brief.working_hours,
      tasks: brief.tasks, start_date_fr: brief.start_date_fr,
    },
    branding: agency.branding,
    ai_disclosure: renderDisclosure(config.ai_disclosure, persona),
    experience: { persona_name: persona, ...experience },
  };
}
