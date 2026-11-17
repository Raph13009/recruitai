import "server-only";
import type { CandidateSessionPayload, InterviewerSettings } from "@/lib/db/types";
import { env } from "@/lib/env";

/**
 * What the call will look like for the candidate, given the server configuration:
 * - no voice model key: scripted demo with the browser's voice;
 * - voice model only: real-time voice, no video;
 * - voice model + avatar service: real-time voice and a photoreal video avatar.
 */
export function plannedExperience(
  interviewer: InterviewerSettings,
): Omit<CandidateSessionPayload["experience"], "persona_name"> {
  if (!env.geminiApiKey()) return { engine: "demo", video: false, sandbox: false };
  const sandbox = env.liveAvatarSandbox();
  const hasAvatar = sandbox || Boolean(interviewer.avatar_id || env.liveAvatarAvatarId());
  const video = interviewer.video_enabled && Boolean(env.liveAvatarApiKey()) && hasAvatar;
  return { engine: "gemini", video, sandbox: video && sandbox };
}
