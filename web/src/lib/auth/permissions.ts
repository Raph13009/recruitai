import type { Agency, Recruiter, RecruiterRole } from "@/lib/db/types";

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

export function canChangeTeamRoles(role: RecruiterRole): boolean {
  return role === "owner";
}

export function withRole(role: RecruiterRole | null | undefined): RecruiterRole {
  return role === "member" ? "member" : "owner";
}

/** Workspace creator, or earliest teammate when `created_by` is missing (legacy rows). */
export function agencyAdminId(agency: Pick<Agency, "created_by">, members: Pick<Recruiter, "id" | "created_at">[]): string | null {
  if (agency.created_by) return agency.created_by;
  const oldest = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return oldest?.id ?? null;
}

/**
 * Owners may promote/demote members.
 * Only the workspace admin may change another owner's role.
 * Nobody changes their own role; the last owner cannot be demoted.
 */
export function canSetRecruiterRole(input: {
  actorId: string;
  actorRole: RecruiterRole;
  targetId: string;
  targetRole: RecruiterRole;
  newRole: RecruiterRole;
  adminId: string | null;
  ownerCount: number;
}): boolean {
  if (input.actorRole !== "owner") return false;
  if (input.actorId === input.targetId) return false;
  if (input.targetRole === input.newRole) return true;

  const isAdmin = Boolean(input.adminId && input.actorId === input.adminId);

  if (input.targetRole === "member") return true;

  // Target is owner → admin only, and keep at least one owner.
  if (!isAdmin) return false;
  if (input.newRole === "member" && input.ownerCount <= 1) return false;
  return true;
}
