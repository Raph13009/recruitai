import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidatePayloadOf, dashboardOf, normalizeSession, withInterviewer } from "@/lib/db/helpers";
import { sealBag, sealWithinLimit, unsealBag, type DurableBag } from "@/lib/db/persist";
import type { Agency, InterviewConfig, InterviewSession, Job, TranscriptTurn } from "@/lib/db/types";
import { emptyMemory } from "@/lib/interview/memory";
import { AI_DISCLOSURE_TEMPLATE } from "@/lib/interview/prompt";
import { getDemoJobFacts, toJobBrief } from "@/lib/job";

vi.mock("server-only", () => ({}));

const T0 = "2026-11-17T09:00:00.000Z";

function session(patch: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1", agency_id: "a1", job_id: "j1", interview_config_id: "c1", token: "tok-1",
    candidate_label: "Candidat test", is_synthetic: true, status: "created", mode: null, engine: null,
    end_reason: null, live_starts: 0, memory: emptyMemory(), created_at: T0, started_at: null, completed_at: null,
    ...patch,
  };
}

function job(): Job {
  const facts = getDemoJobFacts();
  return {
    id: "j1", agency_id: "a1", title: facts.job_title, location: facts.location, status: "open", facts,
    created_at: T0, updated_at: T0,
  };
}

const turns = (n: number): TranscriptTurn[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, session_id: "s1", agency_id: "a1", seq: i + 1, role: i % 2 ? "candidate" : "agent",
    // Random text, so compression cannot shrink it to nothing.
    text: `Tour ${i} : ${randomBytes(60).toString("base64")}`, created_at: T0,
  }));

describe("candidate cookie (serverless fallback)", () => {
  const previous = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-one";
  });
  afterEach(() => {
    process.env.SESSION_SECRET = previous;
  });

  it("round-trips a sealed interview", () => {
    const bag: DurableBag = { session: session({ status: "in_progress" }), transcripts: turns(3) };
    expect(unsealBag(sealBag(bag))).toEqual(bag);
  });

  it("rejects a tampered or foreign cookie", () => {
    const sealed = sealBag({ session: session(), transcripts: [] });
    const [body, mac] = sealed.split(".");
    expect(unsealBag(`${body}x.${mac}`)).toBeNull();
    expect(unsealBag("not-a-cookie")).toBeNull();
    process.env.SESSION_SECRET = "test-secret-two";
    expect(unsealBag(sealed)).toBeNull();
  });

  it("drops the oldest turns to stay under the browser cookie limit", () => {
    const long = turns(120);
    const sealed = sealWithinLimit({ session: session(), transcripts: long });
    expect(sealed).not.toBeNull();
    expect(sealed!.length).toBeLessThanOrEqual(3800);
    const kept = unsealBag(sealed!)!;
    expect(kept.session.id).toBe("s1");
    expect(kept.transcripts.length).toBeLessThan(long.length);
    expect(kept.transcripts.at(-1)).toEqual(long.at(-1)); // the latest turns are the ones kept
  });
});

describe("shared store helpers", () => {
  it("computes the dashboard counts", () => {
    const sessions = [
      session({ id: "s1", status: "completed", started_at: T0, completed_at: "2026-11-17T09:05:00.000Z" }),
      session({ id: "s2", status: "completed", started_at: T0, completed_at: "2026-11-17T09:03:00.000Z" }),
      session({ id: "s3", status: "in_progress", started_at: T0 }),
      session({ id: "s4" }),
    ];
    const { counts, jobs } = dashboardOf([job()], sessions);
    expect(counts).toMatchObject({ total: 4, completed: 2, in_progress: 1, pending: 1, avg_duration_seconds: 240 });
    expect(counts.completion_rate).toBeCloseTo(2 / 3);
    expect(jobs[0]).toMatchObject({ sessions: 4, completed: 2 });
    expect(dashboardOf([], []).counts.completion_rate).toBeNull();
    // A candidate who hung up halfway is closed, but did not complete the interview.
    const left = session({ id: "s5", status: "completed", end_reason: "left", started_at: T0, completed_at: T0 });
    expect(dashboardOf([job()], [...sessions, left]).counts).toMatchObject({ completed: 3, completion_rate: 2 / 4 });
  });

  it("fills columns that older rows do not have", () => {
    const old = { ...session(), engine: undefined, end_reason: undefined, live_starts: undefined } as unknown as InterviewSession;
    expect(normalizeSession(old)).toMatchObject({ engine: null, end_reason: null, live_starts: 0 });
    const agency = withInterviewer({ id: "a1", name: "Agence", created_at: T0, interviewer: null });
    expect(agency.interviewer.persona_name).toBeTruthy();
    expect(agency.interviewer.video_enabled).toBe(true);
  });

  it("builds the candidate payload with the agency's interviewer name", () => {
    const j = job();
    const agency: Agency = withInterviewer({ id: "a1", name: "Agence", created_at: T0 });
    agency.interviewer.persona_name = "Inès";
    const config: InterviewConfig = {
      id: "c1", agency_id: "a1", job_id: "j1", language: "fr", voice: "Aoede", ai_disclosure: AI_DISCLOSURE_TEMPLATE, created_at: T0,
    };
    const payload = candidatePayloadOf(
      { session: session(), job: j, brief: toJobBrief(j.facts), agency, config },
      { engine: "demo", video: false, sandbox: false },
    );
    expect(payload.experience.persona_name).toBe("Inès");
    expect(payload.ai_disclosure).toContain("Inès");
    expect(payload).not.toHaveProperty("id"); // the candidate never sees internal ids
  });
});
