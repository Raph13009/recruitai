import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { appendTranscript, getSessionByToken } from "@/lib/db/mock";

// Text only. Audio is never sent to or stored by this app.
const bodySchema = z.object({
  turns: z
    .array(z.object({ role: z.enum(["agent", "candidate"]), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(50),
});

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[token]/transcript">) {
  const { token } = await ctx.params;
  const session = getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  if (session.status === "completed") return fail("Entretien déjà terminé.", 409);

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  return Response.json({ ok: true, count: appendTranscript(session, body.data.turns) });
}
