import { fail } from "@/lib/api";
import { getSessionContext, toCandidatePayload } from "@/lib/db";
import { plannedExperience } from "@/lib/interview/experience";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]">) {
  const { token } = await ctx.params;
  const found = await getSessionContext(token);
  const payload = found && (await toCandidatePayload(token, plannedExperience(found.agency.interviewer)));
  if (!payload) return fail("Lien d'entretien invalide.", 404);
  return Response.json(payload);
}
