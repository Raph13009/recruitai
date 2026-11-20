import { describe, expect, it } from "vitest";
import {
  agencyAdminId,
  canChangeTeamRoles,
  canInviteCandidates,
  canInviteTeam,
  canManageAgency,
  canManageJobs,
  canSetRecruiterRole,
  withRole,
} from "@/lib/auth/permissions";

describe("recruiter permissions", () => {
  it("gives owners full control", () => {
    expect(canManageAgency("owner")).toBe(true);
    expect(canManageJobs("owner")).toBe(true);
    expect(canInviteTeam("owner")).toBe(true);
    expect(canChangeTeamRoles("owner")).toBe(true);
    expect(canInviteCandidates("owner")).toBe(true);
  });

  it("limits members to candidate invites", () => {
    expect(canManageAgency("member")).toBe(false);
    expect(canManageJobs("member")).toBe(false);
    expect(canInviteTeam("member")).toBe(false);
    expect(canChangeTeamRoles("member")).toBe(false);
    expect(canInviteCandidates("member")).toBe(true);
  });

  it("defaults missing roles to owner for legacy rows", () => {
    expect(withRole(undefined)).toBe("owner");
    expect(withRole(null)).toBe("owner");
    expect(withRole("member")).toBe("member");
  });

  it("resolves workspace admin from created_by or oldest teammate", () => {
    expect(agencyAdminId({ created_by: "admin" }, [{ id: "a", created_at: "2026-01-02" }])).toBe("admin");
    expect(
      agencyAdminId({ created_by: null }, [
        { id: "newer", created_at: "2026-01-02" },
        { id: "older", created_at: "2026-01-01" },
      ]),
    ).toBe("older");
  });

  it("lets any owner promote a member, and only admin demote owners", () => {
    const base = {
      actorId: "owner-2",
      actorRole: "owner" as const,
      targetId: "member-1",
      targetRole: "member" as const,
      newRole: "owner" as const,
      adminId: "admin",
      ownerCount: 2,
    };
    expect(canSetRecruiterRole(base)).toBe(true);
    expect(canSetRecruiterRole({ ...base, actorId: "member-x", actorRole: "member" })).toBe(false);
    expect(canSetRecruiterRole({ ...base, actorId: "member-1" })).toBe(false);
    expect(
      canSetRecruiterRole({
        ...base,
        targetId: "owner-3",
        targetRole: "owner",
        newRole: "member",
      }),
    ).toBe(false);
    expect(
      canSetRecruiterRole({
        ...base,
        actorId: "admin",
        targetId: "owner-3",
        targetRole: "owner",
        newRole: "member",
      }),
    ).toBe(true);
    expect(
      canSetRecruiterRole({
        ...base,
        actorId: "admin",
        targetId: "only-owner",
        targetRole: "owner",
        newRole: "member",
        ownerCount: 1,
      }),
    ).toBe(false);
  });
});
