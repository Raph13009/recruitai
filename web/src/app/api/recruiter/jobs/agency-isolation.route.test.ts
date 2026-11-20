/**
 * Route-level cross-agency isolation for recruiter jobs API.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("POST /api/recruiter/jobs isolation", () => {
  beforeAll(() => {
    process.env.USE_MOCK_DB = "true";
    process.env.MOCK_DB_PERSIST = "false";
    process.env.SESSION_SECRET ??= "test-session-secret-with-entropy-xx";
  });

  it("cannot overwrite another agency's job by id", async () => {
    const db = await import("@/lib/db");
    const stamp = Date.now();
    const a = await db.createAgencyWithRecruiter({
      agencyName: "Jobs A",
      fullName: "Owner JA",
      email: `jobs-a-${stamp}@example.test`,
      password: "password-a-ok",
    });
    const b = await db.createAgencyWithRecruiter({
      agencyName: "Jobs B",
      fullName: "Owner JB",
      email: `jobs-b-${stamp}@example.test`,
      password: "password-b-ok",
    });
    const jobA = (await db.listJobs(a!.agency_id))[0];

    vi.resetModules();
    vi.doMock("@/lib/auth/dal", () => ({
      getCurrentRecruiter: async () => ({
        id: b!.id,
        agency_id: b!.agency_id,
        full_name: "Owner JB",
        email: `jobs-b-${stamp}@example.test`,
        role: "owner" as const,
        agency: {
          id: b!.agency_id,
          name: "Jobs B",
          branding: { logo_url: null, banner_url: null, accent_color: null },
          interviewer_name: null,
          interviewer_voice: null,
          interviewer_avatar_id: null,
        },
      }),
    }));

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/recruiter/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: jobA.id,
          status: "open",
          facts: { ...jobA.facts, job_title: "Hijacked" },
        }),
      }),
    );
    // upsertJob scoped to agency B with A's id → null → 404
    expect(res.status).toBe(404);
    const still = await db.getJob(a!.agency_id, jobA.id);
    expect(still?.title).not.toBe("Hijacked");
  });
});
