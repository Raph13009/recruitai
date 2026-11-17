import { fail } from "@/lib/api";
import { getReport, getSessionByToken, getTranscript } from "@/lib/db";
import { buildInterviewExport, exportFilename, jsonDownload } from "@/lib/interview/export";

/** The candidate's own interview as a JSON file (report and transcript), from the interview link. */
export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]/export">) {
  const { token } = await ctx.params;
  const session = await getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  const [report, transcript] = await Promise.all([getReport(session.id), getTranscript(session.id)]);
  return jsonDownload(buildInterviewExport({ session, report, transcript, audience: "candidate" }), exportFilename(session));
}
