import { fail } from "@/lib/api";
import { getSessionByToken, hydrateFromCookie, toCandidatePayload } from "@/lib/db/mock";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]">) {
  await hydrateFromCookie();
  const { token } = await ctx.params;
  const session = getSessionByToken(token);
  const payload = session && toCandidatePayload(session);
  if (!payload) return fail("Lien d'entretien invalide.", 404);
  return Response.json(payload);
}
