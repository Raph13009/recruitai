import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    resendApiKey: vi.fn(() => undefined),
    resendFrom: vi.fn(() => "RecruitAI <onboarding@resend.dev>"),
  },
}));

import { buildTeamInviteEmail } from "@/lib/email/team-invite";

describe("buildTeamInviteEmail", () => {
  it("includes agency, inviter and the accept URL", () => {
    const mail = buildTeamInviteEmail({
      to: "collegue@agence.fr",
      agencyName: "Interim Lyon",
      inviterName: "Claire Dumont",
      inviteUrl: "https://example.com/invite/abc",
    });
    expect(mail.subject).toContain("Interim Lyon");
    expect(mail.text).toContain("Claire Dumont");
    expect(mail.text).toContain("https://example.com/invite/abc");
    expect(mail.html).toContain("Créer mon compte");
  });
});
