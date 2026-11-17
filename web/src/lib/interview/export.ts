import type { InterviewSession, Report, TranscriptTurn } from "@/lib/db/types";
import type { InterviewReport } from "@/lib/interview/report";

// Raphaël's JSON export (266f6d7): session, factual report and transcript in one file.
// The candidate's copy leaves out what belongs to the agency (its internal label, internal ids).

/** The candidate's copy of the report: the recruiter's internal label is not part of it. */
export function candidateReport(content: InterviewReport): Partial<InterviewReport> {
  const shared: Partial<InterviewReport> = { ...content };
  delete shared.candidate_label;
  delete shared.session_id;
  return shared;
}

export function buildInterviewExport(input: {
  session: InterviewSession;
  report: Report | null;
  transcript: TranscriptTurn[];
  audience: "candidate" | "recruiter";
  now?: Date;
}) {
  const { session, report, transcript, audience } = input;
  const forAgency = audience === "recruiter";
  return {
    exported_at: (input.now ?? new Date()).toISOString(),
    session: {
      ...(forAgency ? { id: session.id, candidate_label: session.candidate_label } : {}),
      status: session.status,
      mode: session.mode,
      engine: session.engine,
      end_reason: session.end_reason,
      is_synthetic: session.is_synthetic,
      created_at: session.created_at,
      started_at: session.started_at,
      completed_at: session.completed_at,
      memory: session.memory,
    },
    report: report ? (forAgency ? report.content : candidateReport(report.content)) : null,
    transcript: transcript.map((t) => ({ seq: t.seq, role: t.role, text: t.text, created_at: t.created_at })),
  };
}

/** Response that the browser saves as a file. */
export function jsonDownload(data: unknown, filename: string): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const exportFilename = (session: Pick<InterviewSession, "created_at">) =>
  `recruitai-entretien-${session.created_at.slice(0, 10)}.json`;
