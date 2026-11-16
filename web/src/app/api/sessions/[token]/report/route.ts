import { fail } from "@/lib/api";
import { getReport, getSessionByToken } from "@/lib/db/mock";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]/report">) {
  const { token } = await ctx.params;
  const session = getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  const report = getReport(session.id);
  if (!report) return fail("Compte rendu pas encore disponible.", 404);
  return Response.json({ report: report.content });
}
