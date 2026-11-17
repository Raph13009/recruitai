import { z } from "zod";
import { fail, handleError, readJson } from "@/lib/api";
import { ensureSession, markStarted, persistSession } from "@/lib/db";
import { env } from "@/lib/env";
import { createLiteSessionToken } from "@/lib/liveavatar/client";

const bodySchema = z.object({
  sessionId: z.string(),
  token: z.string().optional(),
  sandbox: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!env.liveAvatarApiKey()) return fail("LIVEAVATAR_API_KEY manquant côté serveur.", 503);
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;

  const session = await ensureSession({
    sessionId: body.data.sessionId,
    token: body.data.token,
  });
  if (!session) return fail("Session introuvable.", 404);
  if (session.status === "completed") return fail("Entretien déjà terminé.", 409);

  try {
    const info = await createLiteSessionToken({ sandbox: body.data.sandbox });
    await markStarted(session, "avatar");
    await persistSession(session.id);
    return Response.json(info);
  } catch (err) {
    return handleError(err);
  }
}
