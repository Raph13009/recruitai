import { fail, recruiterOr401 } from "@/lib/api";
import { getReport, getSession, getTranscript } from "@/lib/db";
import { buildInterviewExport, exportFilename, jsonDownload } from "@/lib/interview/export";

/** One interview of the agency as a JSON file: session, factual report and full transcript. */
export async function GET(_req: Request, ctx: RouteContext<"/api/recruiter/sessions/[id]/export">) {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const session = await getSession(auth.recruiter.agency.id, id);
  if (!session) return fail("Entretien introuvable.", 404);
  const [report, transcript] = await Promise.all([getReport(session.id), getTranscript(session.id)]);
  return jsonDownload(buildInterviewExport({ session, report, transcript, audience: "recruiter" }), exportFilename(session));
}
