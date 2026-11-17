import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { getSessionContext, recordFact } from "@/lib/db";
import { factInputSchema } from "@/lib/interview/memory";
import { progressOf } from "@/lib/interview/progress";
import { answerJobQuestion, JOB_TOPICS } from "@/lib/interview/tools";

// Receives the interviewer's tool calls from the browser and returns the tool result.
// Facts are validated here; answers about the job come only from the job sheet.
const bodySchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("record_candidate_fact"), args: factInputSchema }),
  z.object({ name: z.literal("answer_job_question"), args: z.object({ topic: z.enum(JOB_TOPICS) }) }),
  z.object({ name: z.literal("end_interview"), args: z.object({}).optional() }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[token]/memory">) {
  const { token } = await ctx.params;
  const found = await getSessionContext(token);
  if (!found) return fail("Lien d'entretien invalide.", 404);
  if (found.session.status === "completed") return fail("Entretien déjà terminé.", 409);

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;
  const call = body.data;

  switch (call.name) {
    case "record_candidate_fact": {
      const memory = (await recordFact(token, call.args)) ?? found.session.memory;
      return Response.json({ ok: true, result: "Information enregistrée.", progress: progressOf(memory) });
    }
    case "answer_job_question":
      return Response.json({ ok: true, result: answerJobQuestion(call.args.topic, found.brief) });
    case "end_interview":
      return Response.json({ ok: true, result: "Entretien terminé." });
  }
}
