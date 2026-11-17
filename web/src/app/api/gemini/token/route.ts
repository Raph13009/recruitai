import { z } from "zod";
import { fail, handleError, readJson } from "@/lib/api";
import { defaultJob, ensureSession, getJob, jobBrief, markStarted, persistSession } from "@/lib/db";
import { resolveGeminiVoice } from "@/lib/env";
import { createLiveToken } from "@/lib/gemini/token";

const bodySchema = z.object({
  sessionId: z.string().optional(),
  token: z.string().optional(),
  /** When true, use a male voice in LiveAvatar sandbox (Wayne) to avoid gender mismatch. */
  avatar: z.boolean().optional(),
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
    await markStarted(session, body.data.avatar ? "avatar" : "audio");
    await persistSession(session.id);
  }

  try {
    const voice = resolveGeminiVoice({ avatar: body.data.avatar === true });
    const { token, model, voice: usedVoice, config, locked, expiresAt } = await createLiveToken(
      jobBrief(job),
      { voice },
    );
    return Response.json({ token, model, voice: usedVoice, config, locked, expiresAt });
  } catch (err) {
    return handleError(err);
  }
}
