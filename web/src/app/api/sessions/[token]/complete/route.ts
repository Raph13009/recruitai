import { fail } from "@/lib/api";
import { completeSession, getSessionByToken } from "@/lib/db/mock";

export async function POST(_req: Request, ctx: RouteContext<"/api/sessions/[token]/complete">) {
  const { token } = await ctx.params;
  const session = getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  const report = completeSession(session);
  if (!report) return fail("Poste introuvable.", 404);
  return Response.json({ ok: true, status: session.status, reportId: report.id });
}
