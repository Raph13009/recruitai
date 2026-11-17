import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { appendTranscript, getSessionContext, getTranscript, recordFact } from "@/lib/db";
import { DEMO_STEPS, demoOpening, demoTurn } from "@/lib/interview/demo-engine";
import { progressOf } from "@/lib/interview/progress";
import { rateLimit } from "@/lib/rate-limit";

// One turn of the scripted demo interviewer (used when no voice model is configured).
// The browser only does speech-to-text and text-to-speech: the dialogue, the recorded facts and
// the transcript are all handled here, exactly as for a real interview.

const bodySchema = z.object({
  /** "start" asks for the opening line; otherwise the step the candidate is answering. */
  step: z.enum(["start", ...DEMO_STEPS]),
  text: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[token]/demo">) {
  const { token } = await ctx.params;
  const found = await getSessionContext(token);
  if (!found) return fail("Lien d'entretien invalide.", 404);
  const { session, brief, agency } = found;
  if (session.status === "completed") return fail("Entretien déjà terminé.", 409);
  if (session.engine === "gemini") return fail("Cet entretien utilise la voix en temps réel.", 409);
  if (!rateLimit(`demo:${token}`, 120, 10 * 60_000)) return fail("Trop de messages. Réessayez dans quelques minutes.", 429);

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  const persona = agency.interviewer.persona_name;

  if (body.data.step === "start") {
    const opening = demoOpening(brief, persona);
    // A reload restarts the script: keep a single opening line in the transcript.
    if ((await getTranscript(session.id)).length === 0) {
      await appendTranscript(token, [{ role: "agent", text: opening.say }]);
    }
    return Response.json({ say: opening.say, step: opening.next, done: false, progress: progressOf(session.memory) });
  }

  const text = body.data.text?.trim() ?? "";
  const result = demoTurn({ step: body.data.step, text, job: brief, persona, memory: session.memory });

  let memory = session.memory;
  for (const fact of result.facts) memory = (await recordFact(token, fact)) ?? memory;
  await appendTranscript(token, [
    ...(text ? [{ role: "candidate" as const, text }] : []),
    { role: "agent" as const, text: result.say },
  ]);

  return Response.json({ say: result.say, step: result.next, done: result.done, progress: progressOf(memory) });
}
