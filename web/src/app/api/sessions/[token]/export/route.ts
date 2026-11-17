import { fail } from "@/lib/api";
import {
  getReport,
  getSessionByToken,
  getTranscript,
  hydrateFromCookie,
} from "@/lib/db";

/** Full interview JSON for download (report + transcript + session meta). */
export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[token]/export">) {
  await hydrateFromCookie();
  const { token } = await ctx.params;
  const session = await getSessionByToken(token);
  if (!session) return fail("Lien d'entretien invalide.", 404);

  const [report, transcript] = await Promise.all([
    getReport(session.id),
    getTranscript(session.id),
  ]);

  return Response.json({
    exported_at: new Date().toISOString(),
    session: {
      id: session.id,
      token: session.token,
      status: session.status,
      mode: session.mode,
      candidate_label: session.candidate_label,
      is_synthetic: session.is_synthetic,
      created_at: session.created_at,
      started_at: session.started_at,
      completed_at: session.completed_at,
      memory: session.memory,
    },
    report: report?.content ?? null,
    transcript: transcript.map((t) => ({
      seq: t.seq,
      role: t.role,
      text: t.text,
      created_at: t.created_at,
    })),
  });
}
