import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    resendApiKey: vi.fn(() => undefined),
    resendFrom: vi.fn(() => "RecruitAI <onboarding@resend.dev>"),
  },
}));

import { buildInviteEmail, sendInviteEmail } from "@/lib/email/invite";
import { env } from "@/lib/env";

describe("buildInviteEmail", () => {
  it("mentions the job, agency, and single attempt", () => {
    const mail = buildInviteEmail({
      to: "candidat@exemple.fr",
      agencyName: "Agence Démo",
      jobTitle: "Préparateur de commandes",
      interviewUrl: "https://example.com/interview/abc",
    });
    expect(mail.subject).toContain("Préparateur de commandes");
    expect(mail.text).toContain("Agence Démo");
    expect(mail.text).toMatch(/seule tentative/i);
    expect(mail.text).toContain("https://example.com/interview/abc");
    expect(mail.html).toContain("Commencer l’entretien");
    expect(mail.html).toContain("https://example.com/interview/abc");
  });

  it("escapes HTML in agency and job title", () => {
    const mail = buildInviteEmail({
      to: "a@b.fr",
      agencyName: `Agence <script>`,
      jobTitle: `Poste "urgent"`,
      interviewUrl: "https://example.com/interview/x",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Agence &lt;script&gt;");
    expect(mail.html).toContain("Poste &quot;urgent&quot;");
  });
});

describe("sendInviteEmail", () => {
  beforeEach(() => {
    vi.mocked(env.resendApiKey).mockReturnValue(undefined);
  });

  it("skips sending when RESEND_API_KEY is missing", async () => {
    const result = await sendInviteEmail({
      to: "candidat@exemple.fr",
      agencyName: "Agence",
      jobTitle: "Poste",
      interviewUrl: "https://example.com/interview/t",
    });
    expect(result).toEqual({ sent: false, reason: "missing_key" });
  });
});
