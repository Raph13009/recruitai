// Row types matching supabase/migrations/20260316000000_recruitai_init.sql.
import type { JobFacts } from "@/lib/job";
import type { CandidateMemory } from "@/lib/interview/memory";
import type { InterviewReport } from "@/lib/interview/report";

export type Uuid = string;
export type Timestamp = string; // ISO 8601

export interface Agency {
  id: Uuid;
  name: string;
  created_at: Timestamp;
}

export interface Recruiter {
  id: Uuid; // = auth.users.id in Postgres
  agency_id: Uuid;
  full_name: string;
  email: string;
  created_at: Timestamp;
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

export interface InterviewSession {
  id: Uuid;
  agency_id: Uuid;
  job_id: Uuid;
  interview_config_id: Uuid;
  token: string; // unguessable public link token
  candidate_label: string; // free label chosen by the recruiter; no sensitive data
  is_synthetic: boolean;
  status: SessionStatus;
  mode: InterviewMode | null;
  memory: CandidateMemory; // jsonb
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
  id: Uuid;
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
}
