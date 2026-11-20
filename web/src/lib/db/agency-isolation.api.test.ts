/**
 * Cross-agency isolation for store APIs used by Route Handlers / Server Actions.
 * Runs against the mock store by default (no network, no credits).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("agency isolation (API-facing store)", () => {
  beforeAll(() => {
    process.env.USE_MOCK_DB = "true";
    process.env.MOCK_DB_PERSIST = "false";
    process.env.SESSION_SECRET ??= "test-session-secret-with-entropy-xx";
  });

  it("blocks cross-agency reads/writes on jobs, sessions, reports, transcripts, invites", async () => {
    const db = await import("@/lib/db");
    const stamp = Date.now();

    const a = await db.createAgencyWithRecruiter({
      agencyName: "Isolation A",
      fullName: "Owner A",
      email: `owner-a-${stamp}@example.test`,
      password: "password-a-ok",
    });
    const b = await db.createAgencyWithRecruiter({
      agencyName: "Isolation B",
      fullName: "Owner B",
      email: `owner-b-${stamp}@example.test`,
      password: "password-b-ok",
    });
    expect(a && b).toBeTruthy();
    expect(a!.agency_id).not.toBe(b!.agency_id);

    const jobsA = await db.listJobs(a!.agency_id);
    const jobA = jobsA[0];
    expect(jobA).toBeTruthy();

    // Cross-agency job access
    expect(await db.getJob(b!.agency_id, jobA.id)).toBeNull();
    expect(
      await db.upsertJob(b!.agency_id, {
        id: jobA.id,
        facts: { ...jobA.facts, job_title: "Hijack" },
        status: "open",
      }),
    ).toBeNull();
    expect(await db.setJobStatus(b!.agency_id, jobA.id, "closed")).toBeNull();
    const stillA = await db.getJob(a!.agency_id, jobA.id);
    expect(stillA?.title).not.toBe("Hijack");
    expect(stillA?.status).toBe("open");

    // Session created in A
    const session = await db.createSession(a!.agency_id, {
      jobId: jobA.id,
      candidateEmail: `cand-${stamp}@example.test`,
      candidateLabel: "Cand Isolation",
    });
    expect(session).toBeTruthy();

    // Cross-agency session/report/transcript
    expect(await db.getSession(b!.agency_id, session!.id)).toBeNull();
    expect(await db.listSessions(b!.agency_id).then((rows) => rows.some((s) => s.id === session!.id))).toBe(
      false,
    );
    expect(
      await db.updateSessionReview(b!.agency_id, session!.id, {
        recruiter_status: "not_selected",
        is_favorite: true,
      }),
    ).toBeNull();
    expect(await db.deleteSession(b!.agency_id, session!.id)).toBe(false);

    await db.markStarted(session!.token, "audio", "demo");
    await db.appendTranscript(session!.token, [
      { role: "agent", text: "Bonjour" },
      { role: "candidate", text: "Bonjour" },
    ]);
    const report = await db.completeSession(session!.token, "completed", "audio");
    expect(report).toBeTruthy();

    // Reports/transcripts are keyed by session id; recruiter export path must still scope via getSession(agencyId).
    expect(await db.getSession(b!.agency_id, session!.id)).toBeNull();
    expect(await db.getTranscript(session!.id).then((t) => t.length)).toBeGreaterThan(0);
    expect(await db.getReport(session!.id)).toBeTruthy();

    // Team invite cannot target another agency's namespace
    const invite = await db.createAgencyInvite({
      agencyId: a!.agency_id,
      email: `member-${stamp}@example.test`,
      invitedBy: a!.id,
    });
    expect(invite).toBeTruthy();
    expect(await db.revokeAgencyInvite(b!.agency_id, invite!.id)).toBe(false);
    expect(await db.listAgencyInvites(b!.agency_id)).toEqual([]);
    expect((await db.listAgencyInvites(a!.agency_id)).some((i) => i.id === invite!.id)).toBe(true);

    // Branding update scoped
    const branded = await db.updateAgencyBranding(a!.agency_id, {
      logo_url: "/api/branding/a/logo",
      banner_url: null,
      accent_color: "#abcdef",
    });
    expect(branded?.branding.accent_color).toBe("#abcdef");
    const agencyB = await db.getAgency(b!.agency_id);
    expect(agencyB?.branding.accent_color).not.toBe("#abcdef");

    // Creating a session for B with A's job id must fail
    expect(await db.createSession(b!.agency_id, { jobId: jobA.id, candidateLabel: "Nope" })).toBeNull();
  });

  it("candidate token cannot be used to list another agency's recruiter data", async () => {
    const db = await import("@/lib/db");
    const stamp = Date.now();
    const a = await db.createAgencyWithRecruiter({
      agencyName: "Token A",
      fullName: "Owner TA",
      email: `token-a-${stamp}@example.test`,
      password: "password-a-ok",
    });
    const b = await db.createAgencyWithRecruiter({
      agencyName: "Token B",
      fullName: "Owner TB",
      email: `token-b-${stamp}@example.test`,
      password: "password-b-ok",
    });
    const jobA = (await db.listJobs(a!.agency_id))[0];
    const jobB = (await db.listJobs(b!.agency_id))[0];
    const sA = await db.createSession(a!.agency_id, { jobId: jobA.id, candidateLabel: "A" });
    const sB = await db.createSession(b!.agency_id, { jobId: jobB.id, candidateLabel: "B" });

    const byTokenA = await db.getSessionByToken(sA!.token);
    expect(byTokenA?.agency_id).toBe(a!.agency_id);
    expect(byTokenA?.id).not.toBe(sB!.id);

    // Token of A must not resolve session of B
    expect((await db.getSessionByToken(sA!.token))?.id).toBe(sA!.id);
    expect((await db.getSessionByToken(sB!.token))?.agency_id).toBe(b!.agency_id);
  });
});
