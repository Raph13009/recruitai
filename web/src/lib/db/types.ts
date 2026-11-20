// Row types matching supabase/migrations/*.sql (shared by the local demo store and the Supabase store).
import type { JobFacts } from "@/lib/job";
import type { CandidateMemory } from "@/lib/interview/memory";
import type { InterviewReport } from "@/lib/interview/report";
import type { RecruiterSessionStatus, SessionNextAction } from "@/lib/db/session-review";

export type { RecruiterSessionStatus, SessionNextAction };

export type Uuid = string;
export type Timestamp = string; // ISO 8601

/** Who the candidate meets in the video call. One persona per agency in the MVP. */
export interface AgencyBranding {
  logo_url: string | null;
  banner_url: string | null;
  /** #RRGGBB */
  accent_color: string;
}

export interface InterviewerSettings {
  /** First name the AI introduces itself with. */
  persona_name: string;
  /** Gemini Live voice name. */
  voice: string;
  /** Show the photoreal video avatar when the avatar service is configured. */
  video_enabled: boolean;
  /** LiveAvatar avatar id. null = the server default (LIVEAVATAR_AVATAR_ID). */
  avatar_id: string | null;
  avatar_name: string | null;
  avatar_preview_url: string | null;
}

export interface Agency {
  id: Uuid;
  name: string;
  interviewer: InterviewerSettings; // jsonb
  branding: AgencyBranding;
  /** Workspace creator — admin who can change every teammate's role. */
  created_by: Uuid | null;
  created_at: Timestamp;
}

/** Owner runs the agency; member only sends interview links. */
export type RecruiterRole = "owner" | "member";

export type UpdateRecruiterRoleResult = "ok" | "forbidden" | "not_found";

export interface Recruiter {
  id: Uuid; // = auth.users.id in Postgres (Supabase Auth holds the password)
  agency_id: Uuid;
  full_name: string;
  email: string;
  role: RecruiterRole;
  created_at: Timestamp;
}

/** Pending or accepted invitation to join an agency as a recruiter. */
export interface AgencyInvite {
  id: Uuid;
  agency_id: Uuid;
  email: string;
  role: "member";
  token: string;
  invited_by: Uuid;
  created_at: Timestamp;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
}

export type JobStatus = "draft" | "open" | "closed";

export interface Job {
  id: Uuid;
  agency_id: Uuid;
  title: string;
  location: string;
  status: JobStatus;
  facts: JobFacts; // jsonb
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface InterviewConfig {
  id: Uuid;
  agency_id: Uuid;
  job_id: Uuid;
  language: "fr";
  voice: string;
  ai_disclosure: string;
  created_at: Timestamp;
}

export type SessionStatus = "created" | "in_progress" | "completed";
export type InterviewMode = "audio" | "avatar";
/** "gemini" = real-time voice model. "demo" = scripted engine with the browser's voice (no API key). */
export type InterviewEngineKind = "gemini" | "demo";
/** "completed" = the interviewer closed the interview. "left" = the candidate hung up before the end. */
export type EndReason = "completed" | "left";

export interface InterviewSession {
  id: Uuid;
  agency_id: Uuid;
  job_id: Uuid;
  interview_config_id: Uuid;
  token: string; // unguessable public link token
  candidate_label: string; // free label chosen by the recruiter; no sensitive data
  /** Email used for the invitation (null for synthetic / legacy / public demo). */
  candidate_email: string | null;
  /** When the invitation email was created (null for synthetic / legacy). */
  invited_at: Timestamp | null;
  is_synthetic: boolean;
  status: SessionStatus;
  mode: InterviewMode | null;
  engine: InterviewEngineKind | null;
  end_reason: EndReason | null;
  /** How many times the candidate started (or restarted) the live call. Caps credit usage. */
  live_starts: number;
  memory: CandidateMemory; // jsonb
  /** Manual recruiter workflow status — never set by the AI. */
  recruiter_status: RecruiterSessionStatus;
  /** Manual 1–5 rating assigned by a recruiter. null = not rated. Never set by the AI. */
  recruiter_rating: number | null;
  is_favorite: boolean;
  /** Manual next step chosen by a recruiter. */
  next_action: SessionNextAction | null;
  created_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
}

export type TranscriptRole = "agent" | "candidate";

export interface TranscriptTurn {
  id: Uuid;
  session_id: Uuid;
  agency_id: Uuid;
  seq: number;
  role: TranscriptRole;
  text: string; // text only, never audio
  created_at: Timestamp;
}

export interface Report {
  id: Uuid;
  session_id: Uuid;
  agency_id: Uuid;
  content: InterviewReport; // jsonb
  created_at: Timestamp;
}

/** What the public candidate page is allowed to see. */
export interface CandidateSessionPayload {
  token: string;
  status: SessionStatus;
  agency: string;
  job: {
    title: string;
    location: string;
    contract: string;
    salary_gross_hourly_eur: number;
    working_hours: string[];
    tasks: string;
    start_date_fr: string;
  };
  ai_disclosure: string;
  experience: {
    persona_name: string;
    /** Which engine the call will use, decided by the server configuration. */
    engine: InterviewEngineKind;
    /** A video avatar will be attempted (it falls back to audio if the service is unavailable). */
    video: boolean;
    /** The avatar service runs in sandbox: a test face, sessions of about one minute. */
    sandbox: boolean;
  };
  branding: AgencyBranding;
}

/** The signed-in recruiter, as exposed to pages and client components (no secrets). */
export interface CurrentRecruiter {
  id: Uuid;
  full_name: string;
  email: string;
  role: RecruiterRole;
  agency: { id: Uuid; name: string; branding: AgencyBranding };
}
