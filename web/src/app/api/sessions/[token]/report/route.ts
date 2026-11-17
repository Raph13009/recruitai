import { fail } from "@/lib/api";
import { getReport, getSessionByToken } from "@/lib/db";
import { candidateReport } from "@/lib/interview/export";

// The candidate's own copy of the factual report, reachable with the interview link.
// The recruiter's internal label is not part of it.
export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]/report">) {
  const { token } = await ctx.params;
  const session = await getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  const report = await getReport(session.id);
  if (!report) return fail("Compte rendu pas encore disponible.", 404);
  return Response.json({ report: candidateReport(report.content) });
}
