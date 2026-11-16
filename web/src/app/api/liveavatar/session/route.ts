import { z } from "zod";
import { fail, handleError, readJson } from "@/lib/api";
import { getSessionById, markStarted } from "@/lib/db/mock";
import { env } from "@/lib/env";
import { createLiteSessionToken } from "@/lib/liveavatar/client";

const bodySchema = z.object({ sessionId: z.string(), sandbox: z.boolean().optional() });

export async function POST(req: Request) {
  if (!env.liveAvatarApiKey()) return fail("LIVEAVATAR_API_KEY manquant côté serveur.", 503);
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;

  const session = getSessionById(body.data.sessionId);
  if (!session) return fail("Session introuvable.", 404);
  if (session.status === "completed") return fail("Entretien déjà terminé.", 409);

  try {
    const info = await createLiteSessionToken({ sandbox: body.data.sandbox });
    markStarted(session, "avatar");
    return Response.json(info);
  } catch (err) {
    return handleError(err);
  }
}
