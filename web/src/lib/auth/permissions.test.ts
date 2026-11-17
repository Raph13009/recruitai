import { describe, expect, it } from "vitest";
import {
  canInviteCandidates,
  canInviteTeam,
  canManageAgency,
  canManageJobs,
  withRole,
} from "@/lib/auth/permissions";

describe("recruiter permissions", () => {
  it("gives owners full control", () => {
    expect(canManageAgency("owner")).toBe(true);
    expect(canManageJobs("owner")).toBe(true);
    expect(canInviteTeam("owner")).toBe(true);
    expect(canInviteCandidates("owner")).toBe(true);
  });

  it("limits members to candidate invites", () => {
    expect(canManageAgency("member")).toBe(false);
    expect(canManageJobs("member")).toBe(false);
    expect(canInviteTeam("member")).toBe(false);
    expect(canInviteCandidates("member")).toBe(true);
  });

  it("defaults missing roles to owner for legacy rows", () => {
    expect(withRole(undefined)).toBe("owner");
    expect(withRole(null)).toBe("owner");
    expect(withRole("member")).toBe("member");
  });
});
