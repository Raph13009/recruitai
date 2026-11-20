import type { CandidateMemory } from "@/lib/interview/memory";
import { formatFrDate, isIsoDate } from "@/lib/job";

/** Recruiter workflow status — independent of technical interview status. */
export const RECRUITER_STATUSES = [
  "to_review",
  "to_recontact",
  "to_deepen",
  "waiting",
  "not_selected",
] as const;

export type RecruiterSessionStatus = (typeof RECRUITER_STATUSES)[number];

export const RECRUITER_STATUS_LABELS: Record<RecruiterSessionStatus, string> = {
  to_review: "À examiner",
  to_recontact: "À recontacter",
  to_deepen: "À approfondir",
  waiting: "En attente",
  not_selected: "Non retenu",
};

export const NEXT_ACTIONS = ["contact", "follow_up", "schedule", "check_refs", "other"] as const;

export type SessionNextAction = (typeof NEXT_ACTIONS)[number];

export const NEXT_ACTION_LABELS: Record<SessionNextAction, string> = {
  contact: "Contacter",
  follow_up: "Relancer",
  schedule: "Planifier un entretien",
  check_refs: "Vérifier les références",
  other: "Autre suivi",
};

export function isRecruiterStatus(value: string): value is RecruiterSessionStatus {
  return (RECRUITER_STATUSES as readonly string[]).includes(value);
}

export function isNextAction(value: string): value is SessionNextAction {
  return (NEXT_ACTIONS as readonly string[]).includes(value);
}

/** Human-readable availability from interview memory, or "Non renseignée". */
export function availabilityLabel(memory: CandidateMemory | null | undefined): string {
  const fact = memory?.availability;
  if (!fact?.raw && !fact?.normalized) return "Non renseignée";
  const value = fact.normalized ?? fact.raw;
  if (value === "immediate") return "Immédiate";
  if (isIsoDate(value)) return `À partir du ${formatFrDate(value)}`;
  return fact.raw || value;
}
