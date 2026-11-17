import type { RecruiterRole } from "@/lib/db/types";

/** Owner: full agency control. Member: invite candidates / open interview links only. */
export function canManageAgency(role: RecruiterRole): boolean {
  return role === "owner";
}

export function canManageJobs(role: RecruiterRole): boolean {
  return role === "owner";
}

export function canInviteTeam(role: RecruiterRole): boolean {
  return role === "owner";
}

export function canInviteCandidates(_role: RecruiterRole): boolean {
  return true;
}

export function withRole(role: RecruiterRole | null | undefined): RecruiterRole {
  return role === "member" ? "member" : "owner";
}
