import { z } from "zod";
import { fail, readJson } from "@/lib/api";
import { completeSession, getSessionByToken } from "@/lib/db";
import { candidateReport } from "@/lib/interview/export";

const bodySchema = z.object({
  /** "completed" = the interviewer closed the interview. "left" = the candidate hung up first. */
  reason: z.enum(["completed", "left"]).optional(),
  /** What actually ran in the browser (the video may have fallen back to audio). */
  mode: z.enum(["audio", "avatar"]).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[token]/complete">) {
  const { token } = await ctx.params;
  const session = await getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);

  const body = await readJson(req, bodySchema);
  if ("error" in body) return body.error;

  const report = await completeSession(token, body.data.reason ?? "left", body.data.mode);
  if (!report) return fail("Poste introuvable.", 404);
  // The report comes back with the answer, as in Raphaël's version (candidate's copy).
  return Response.json({ ok: true, status: "completed", reportId: report.id, report: candidateReport(report.content) });
}
