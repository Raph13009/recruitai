import { z } from "zod";
import { fail, handleError, readJson } from "@/lib/api";
import { getSessionContext, markStarted } from "@/lib/db";
import { env } from "@/lib/env";
import { createLiveToken } from "@/lib/gemini/token";
import { plannedExperience } from "@/lib/interview/experience";
import { voiceGender } from "@/lib/interview/voices";
import { createAvatarSessionToken, type AvatarSessionInfo } from "@/lib/liveavatar/client";

// Opens the live call for one interview link. One request returns everything the browser needs:
// a short-lived Gemini Live token (the interviewer's brain and voice) and, when the avatar service
// is configured, a LiveAvatar session token (the interviewer's face). No long-lived key ever leaves
// the server.

/** Reconnections allowed per interview link. Each start can mint credits-consuming sessions. */
const MAX_LIVE_STARTS = 5;

const bodySchema = z.object({ video: z.boolean().optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[token]/live">) {
  const { token } = await ctx.params;
  const found = await getSessionContext(token);
  if (!found) return fail("Lien d'entretien invalide.", 404);
  const { session, brief, agency } = found;
  if (session.status === "completed") return fail("Entretien déjà terminé.", 409);
  if (session.live_starts >= MAX_LIVE_STARTS) {
    return fail("Trop de tentatives de connexion pour cet entretien. Demandez un nouveau lien à l'agence.", 429);
  }

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;

  const interviewer = agency.interviewer;
  const persona = interviewer.persona_name;
  const planned = plannedExperience(interviewer);

  if (planned.engine === "demo") {
    await markStarted(token, "audio", "demo");
    return Response.json({ engine: "demo", persona, masculineVoice: voiceGender(interviewer.voice) === "m" });
  }

  // The face first: in sandbox it is a fixed test avatar, and the voice has to match it.
  let avatar: AvatarSessionInfo | null = null;
  let notice: string | null = null;
  if (planned.video && body.data.video !== false) {
    try {
      avatar = await createAvatarSessionToken({ avatarId: interviewer.avatar_id });
    } catch {
      notice = "L'avatar vidéo n'est pas disponible pour le moment. L'entretien continue en audio.";
    }
  }

  try {
    const voice = avatar?.sandbox ? env.liveAvatarSandboxVoice() : interviewer.voice;
    // A second start means the call was cut: the interviewer resumes from what is already recorded.
    const resumed = session.live_starts > 0 && session.engine === "gemini";
    const live = await createLiveToken({ job: brief, persona, voice, resume: resumed ? session.memory : undefined });
    await markStarted(token, avatar ? "avatar" : "audio", "gemini");
    return Response.json({
      engine: "gemini",
      persona,
      resumed,
      gemini: { token: live.token, model: live.model, config: live.config },
      avatar: avatar && { sessionToken: avatar.sessionToken, sandbox: avatar.sandbox },
      notice,
    });
  } catch (err) {
    return handleError(err);
  }
}
