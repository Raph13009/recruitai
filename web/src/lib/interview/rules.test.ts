// Behaviors merged from Raphaël's latest commits (fc894ab, 266f6d7, df0c22f).
import { describe, expect, it } from "vitest";
import type { InterviewSession, Report, TranscriptTurn } from "@/lib/db/types";
import { buildInterviewExport } from "@/lib/interview/export";
import { applyFact, emptyMemory } from "@/lib/interview/memory";
import { buildSystemInstruction } from "@/lib/interview/prompt";
import { buildReport } from "@/lib/interview/report";
import { getDemoJobFacts, toJobBrief } from "@/lib/job";

const job = toJobBrief(getDemoJobFacts(), "2026-11-17");
const T0 = "2026-11-17T09:00:00.000Z";

describe("interviewer rules", () => {
  const prompt = buildSystemInstruction(job, "Camille", "Aoede");

  it("rejects inappropriate or absurd answers and never records them", () => {
    expect(prompt).toContain("LIMITES DURES");
    expect(prompt).toContain("Ce n'est pas approprié pour cet entretien.");
    expect(prompt).toContain("N'enregistre jamais d'insultes, d'absurde ou d'illégal.");
  });

  it("follows up on vague answers and reframes off-topic ones from the job sheet", () => {
    expect(prompt).toContain("ÉCOUTE ACTIVE");
    expect(prompt).toContain(job.tasks.toLowerCase());
  });

  it("no longer tells the interviewer to stop when cut off (she always finishes)", () => {
    expect(prompt).not.toContain("te coupe");
  });
});

describe("shift preference", () => {
  it("keeps French values when the model answers in English", () => {
    const both = applyFact(emptyMemory(), { field: "shift_preference", raw: "les deux", normalized: "both" }, job.working_hours);
    expect(both.shift_preference?.normalized).toBe("les deux");
    const none = applyFact(emptyMemory(), { field: "shift_preference", raw: "aucun", normalized: "None" }, job.working_hours);
    expect(none.shift_preference?.normalized).toBe("aucun");
  });
});

describe("JSON export", () => {
  const session: InterviewSession = {
    id: "s1", agency_id: "a1", job_id: "j1", interview_config_id: "c1", token: "secret-link",
    candidate_label: "Karim – à rappeler lundi", candidate_email: null, invited_at: null, is_synthetic: false,
    status: "completed", mode: "audio",
    engine: "gemini", end_reason: "completed", live_starts: 1, memory: emptyMemory(),
    created_at: T0, started_at: T0, completed_at: T0,
  };
  const report: Report = {
    id: "r1", session_id: "s1", agency_id: "a1", created_at: T0,
    content: buildReport({
      sessionId: "s1", candidateLabel: session.candidate_label, isSynthetic: false, mode: "audio", engine: "gemini",
      endReason: "completed", durationSeconds: 300, job, memory: emptyMemory(), transcriptTurns: 1, now: new Date(T0),
    }),
  };
  const transcript: TranscriptTurn[] = [
    { id: "t1", session_id: "s1", agency_id: "a1", seq: 1, role: "agent", text: "Bonjour", created_at: T0 },
  ];

  it("gives the candidate their conversation without the agency's internal label", () => {
    const data = buildInterviewExport({ session, report, transcript, audience: "candidate" });
    const text = JSON.stringify(data);
    expect(text).not.toContain("à rappeler");
    expect(text).not.toContain("secret-link");
    expect(data.transcript).toEqual([{ seq: 1, role: "agent", text: "Bonjour", created_at: T0 }]);
    expect(data.report).not.toHaveProperty("candidate_label");
  });

  it("gives the agency everything, with no score", () => {
    const data = buildInterviewExport({ session, report, transcript, audience: "recruiter" });
    expect(data.session).toMatchObject({ id: "s1", candidate_label: session.candidate_label });
    expect(data.report).toMatchObject({ candidate_label: session.candidate_label, scoring: null });
  });
});
