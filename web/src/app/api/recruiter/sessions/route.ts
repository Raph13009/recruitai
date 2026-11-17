import { recruiterOr401 } from "@/lib/api";
import { listSessions } from "@/lib/db";

export async function GET() {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;
  return Response.json({ sessions: await listSessions(auth.recruiter.agency.id) });
}
