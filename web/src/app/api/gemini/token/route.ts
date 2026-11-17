import { z } from "zod";
import { fail, handleError, readJson } from "@/lib/api";
import { defaultJob, ensureSession, getJob, jobBrief, markStarted, persistSession } from "@/lib/db";
import { createLiveToken } from "@/lib/gemini/token";

const bodySchema = z.object({
  sessionId: z.string().optional(),
  token: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;

  // Never hard-fail the live call just because the in-memory mock DB was cold on this instance.
  const session = await ensureSession({
    sessionId: body.data.sessionId,
    token: body.data.token,
  });

  let job = await defaultJob();
  if (session) {
    if (session.status === "completed") return fail("Entretien déjà terminé.", 409);
    job = (await getJob(session.job_id)) ?? job;
    await markStarted(session, "audio");
    await persistSession(session.id);
  }

  try {
    const { token, model, voice, config, locked, expiresAt } = await createLiveToken(jobBrief(job));
    return Response.json({ token, model, voice, config, locked, expiresAt });
  } catch (err) {
    return handleError(err);
  }
}
