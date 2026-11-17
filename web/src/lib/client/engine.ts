import type { InterviewProgress } from "@/lib/interview/progress";

// What the call screen needs from an interview engine, whichever one runs:
// - "gemini": real-time voice model in the browser, optionally with the video avatar;
// - "demo": scripted interviewer with the browser's own speech services (no API key).

export type Role = "agent" | "candidate";

export interface EngineHandlers {
  /** Live caption, updated while someone is speaking. */
  onCaption: (role: Role, text: string) => void;
  /** A finished turn. */
  onTurn: (role: Role, text: string) => void;
  /** Which topics of the interview have been covered so far. */
  onProgress: (progress: InterviewProgress) => void;
  onAgentSpeaking: (speaking: boolean) => void;
  onCandidateSpeaking: (speaking: boolean) => void;
  /** The video avatar appeared or went away (the call continues in audio). */
  onVideo: (active: boolean) => void;
  /** Something the candidate should know, without stopping the call. */
  onNotice: (message: string) => void;
  /** The interviewer closed the interview and finished speaking. */
  onEnded: () => void;
  /** The call cannot continue as is. */
  onError: (message: string) => void;
}

export interface InterviewEngine {
  readonly kind: "gemini" | "demo";
  /** True while the video avatar is the one speaking. */
  readonly video: boolean;
  /**
   * Mutes or unmutes the candidate's mic. Unmuting opens the mic if the call started without one.
   * Resolves false when the mic could not be turned on (blocked or missing).
   */
  setMicMuted(muted: boolean): Promise<boolean>;
  /**
   * Makes sure the candidate can hear the interviewer. Resolves false while the browser blocks
   * sound: call it again from a click, then `begin()`.
   */
  unlock(): Promise<boolean>;
  /** The interviewer says the opening line (once). */
  begin(): void;
  /** A typed answer, for candidates who cannot or prefer not to speak. */
  sendText(text: string): void;
  /** Loudness of the interviewer's voice (0 to 1), for the on-screen presence. */
  agentLevel(): number;
  /** Resolves once everything said so far has been saved. */
  settle(): Promise<void>;
  close(): void;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data;
}
