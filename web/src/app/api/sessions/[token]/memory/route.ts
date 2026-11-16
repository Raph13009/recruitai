import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { getJob, getSessionByToken, jobBrief, recordFact } from "@/lib/db/mock";
import { factInputSchema } from "@/lib/interview/memory";
import { answerJobQuestion, JOB_TOPICS } from "@/lib/interview/tools";

// Receives Gemini tool calls from the browser and returns the tool result.
const bodySchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("record_candidate_fact"), args: factInputSchema }),
  z.object({ name: z.literal("answer_job_question"), args: z.object({ topic: z.enum(JOB_TOPICS) }) }),
  z.object({ name: z.literal("end_interview"), args: z.object({}).optional() }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[token]/memory">) {
  const { token } = await ctx.params;
  const session = getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);
  if (session.status === "completed") return fail("Entretien déjà terminé.", 409);

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  const call = body.data;

  switch (call.name) {
    case "record_candidate_fact":
      recordFact(session, call.args);
      return Response.json({ ok: true, result: "Information enregistrée." });
    case "answer_job_question": {
      const job = getJob(session.job_id);
      if (!job) return fail("Poste introuvable.", 404);
      return Response.json({ ok: true, result: answerJobQuestion(call.args.topic, jobBrief(job)) });
    }
    case "end_interview":
      return Response.json({ ok: true, result: "Entretien terminé." });
  }
}
