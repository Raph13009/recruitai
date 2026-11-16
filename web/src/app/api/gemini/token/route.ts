import { z } from "zod";
import { fail, handleError, readJson } from "@/lib/api";
import { defaultJob, getJob, getSessionById, hydrateFromCookie, jobBrief, markStarted, persistSession } from "@/lib/db/mock";
import { createLiveToken } from "@/lib/gemini/token";

const bodySchema = z.object({ sessionId: z.string().optional() });

export async function POST(req: Request) {
  await hydrateFromCookie();
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;

  let job = defaultJob();
  if (body.data.sessionId) {
    const session = getSessionById(body.data.sessionId);
    if (!session) return fail("Session introuvable.", 404);
    if (session.status === "completed") return fail("Entretien déjà terminé.", 409);
    job = getJob(session.job_id) ?? job;
    markStarted(session, "audio");
    await persistSession(session.id);
  }

  try {
    const { token, model, voice, config, locked, expiresAt } = await createLiveToken(jobBrief(job));
    return Response.json({ token, model, voice, config, locked, expiresAt });
  } catch (err) {
    return handleError(err);
  }
}
