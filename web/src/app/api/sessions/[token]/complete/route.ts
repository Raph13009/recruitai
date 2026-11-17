import { fail } from "@/lib/api";
import { completeSession, getSessionByToken, hydrateFromCookie, persistSession } from "@/lib/db";

export async function POST(_req: Request, ctx: RouteContext<"/api/sessions/[token]/complete">) {
  await hydrateFromCookie();
  const { token } = await ctx.params;
  const session = await getSessionByToken(token);
  if (!session) return fail("Invalid interview link.", 404);
  const report = await completeSession(session);
  if (!report) return fail("Job not found.", 404);
  await persistSession(session.id);
  return Response.json({
    ok: true,
    status: "completed",
    reportId: report.id,
    report: report.content,
  });
}
