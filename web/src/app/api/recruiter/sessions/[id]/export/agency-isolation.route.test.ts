/**
 * Route-level cross-agency isolation for recruiter export API.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("GET /api/recruiter/sessions/[id]/export isolation", () => {
  beforeAll(() => {
    process.env.USE_MOCK_DB = "true";
    process.env.MOCK_DB_PERSIST = "false";
    process.env.SESSION_SECRET ??= "test-session-secret-with-entropy-xx";
  });

  it("returns 404 when recruiter B exports recruiter A's session id", async () => {
    const db = await import("@/lib/db");
    const stamp = Date.now();
    const a = await db.createAgencyWithRecruiter({
      agencyName: "Export A",
      fullName: "Owner EA",
      email: `export-a-${stamp}@example.test`,
      password: "password-a-ok",
    });
    const b = await db.createAgencyWithRecruiter({
      agencyName: "Export B",
      fullName: "Owner EB",
      email: `export-b-${stamp}@example.test`,
      password: "password-b-ok",
    });
    const jobA = (await db.listJobs(a!.agency_id))[0];
    const session = await db.createSession(a!.agency_id, {
      jobId: jobA.id,
      candidateLabel: "Export Cand",
    });
    expect(session).toBeTruthy();

    vi.resetModules();
    vi.doMock("@/lib/auth/dal", () => ({
      getCurrentRecruiter: async () => ({
        id: b!.id,
        agency_id: b!.agency_id,
        full_name: "Owner EB",
        email: `export-b-${stamp}@example.test`,
        role: "owner",
        agency: { id: b!.agency_id, name: "Export B", branding: {} },
      }),
    }));

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recruiter/sessions/x/export"), {
      params: Promise.resolve({ id: session!.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 without session cookie", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/dal", () => ({
      getCurrentRecruiter: async () => null,
    }));
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recruiter/sessions/x/export"), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }),
    });
    expect(res.status).toBe(401);
  });
});
