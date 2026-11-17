import { fail } from "@/lib/api";
import { getReport, getSessionByToken, hydrateFromCookie } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]/report">) {
  await hydrateFromCookie();
  const { token } = await ctx.params;
  const session = await getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  const report = await getReport(session.id);
  if (!report) return fail("Compte rendu pas encore disponible.", 404);
  return Response.json({ report: report.content });
}
