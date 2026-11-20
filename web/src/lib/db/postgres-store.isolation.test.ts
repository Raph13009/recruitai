/**
 * Agency isolation + core flows against the active store (mock by default).
 * Set DATABASE_URL + USE_MOCK_DB=false to exercise private Postgres.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password security (scrypt)", () => {
  it("never stores plaintext and verifies with timing-safe compare", () => {
    const stored = hashPassword("Tr0p-Secur3!");
    expect(stored).not.toContain("Tr0p-Secur3!");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Tr0p-Secur3!", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("hashes reset tokens before persistence shape", () => {
    const raw = randomBytes(32).toString("base64url");
    const hashed = createHash("sha256").update(raw).digest("hex");
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toBe(raw);
  });
});

describe("store flows (mock)", () => {
  beforeAll(() => {
    process.env.USE_MOCK_DB = "true";
    process.env.MOCK_DB_PERSIST = "false";
    process.env.SESSION_SECRET ??= "test-session-secret-with-entropy";
  });

  afterAll(async () => {
    // no-op
  });

  it("isolates two agencies and covers job/session/report/branding paths", async () => {
    const db = await import("@/lib/db");

    const ownerA = await db.createAgencyWithRecruiter({
      agencyName: "Agence Alpha",
      fullName: "Alice Owner",
      email: `alice-${Date.now()}@example.test`,
      password: "password-a1",
    });
    const ownerB = await db.createAgencyWithRecruiter({
      agencyName: "Agence Beta",
      fullName: "Bob Owner",
      email: `bob-${Date.now()}@example.test`,
      password: "password-b1",
    });
    expect(ownerA).toBeTruthy();
    expect(ownerB).toBeTruthy();
    expect(ownerA!.agency_id).not.toBe(ownerB!.agency_id);

    const authA = await db.authenticate(ownerA!.email, "password-a1");
    expect(authA?.id).toBe(ownerA!.id);
    expect(await db.authenticate(ownerA!.email, "wrong")).toBeNull();

    const jobsA = await db.listJobs(ownerA!.agency_id);
    expect(jobsA.length).toBeGreaterThan(0);
    const job = jobsA[0];
    const updated = await db.upsertJob(ownerA!.agency_id, {
      id: job.id,
      facts: { ...job.facts, job_title: "Poste isolé Alpha" },
      status: "open",
    });
    expect(updated?.title).toBe("Poste isolé Alpha");

    // Cross-agency read must fail
    expect(await db.getJob(ownerB!.agency_id, job.id)).toBeNull();

    const session = await db.createSession(ownerA!.agency_id, {
      jobId: job.id,
      candidateEmail: "cand@example.test",
      candidateLabel: "Cand Test",
    });
    expect(session).toBeTruthy();
    expect(await db.getSession(ownerB!.agency_id, session!.id)).toBeNull();

    await db.markStarted(session!.token, "audio", "demo");
    await db.appendTranscript(session!.token, [
      { role: "agent", text: "Bonjour" },
      { role: "candidate", text: "Bonjour, je m'appelle Cand." },
    ]);
    const report = await db.completeSession(session!.token, "completed", "audio");
    expect(report).toBeTruthy();
    const turns = await db.getTranscript(session!.id);
    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(await db.getReport(session!.id)).toBeTruthy();

    await db.updateSessionReview(ownerA!.agency_id, session!.id, {
      recruiter_status: "to_recontact",
      recruiter_rating: 4,
      is_favorite: true,
      next_action: "contact",
    });
    const reviewed = await db.getSession(ownerA!.agency_id, session!.id);
    expect(reviewed?.recruiter_status).toBe("to_recontact");
    expect(reviewed?.is_favorite).toBe(true);

    const branded = await db.updateAgencyBranding(ownerA!.agency_id, {
      logo_url: "/api/branding/x/logo",
      banner_url: null,
      accent_color: "#123456",
    });
    expect(branded?.branding.accent_color).toBe("#123456");

    const invite = await db.createAgencyInvite({
      agencyId: ownerA!.agency_id,
      email: `member-${Date.now()}@example.test`,
      invitedBy: ownerA!.id,
    });
    expect(invite).toBeTruthy();
    const member = await db.acceptAgencyInvite({
      token: invite!.token,
      fullName: "Member One",
      password: "password-m1",
    });
    expect(member?.role).toBe("member");
    expect(member?.agency_id).toBe(ownerA!.agency_id);

    const listB = await db.listSessions(ownerB!.agency_id);
    expect(listB.every((s) => s.agency_id === ownerB!.agency_id)).toBe(true);
    expect(listB.some((s) => s.id === session!.id)).toBe(false);
  });
});
