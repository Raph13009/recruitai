import { handleError, recruiterOr401 } from "@/lib/api";
import { env } from "@/lib/env";
import { listAvatars } from "@/lib/liveavatar/client";

/** Faces available for the interviewer: the agency's custom avatars and the stock library. */
export async function GET() {
  const auth = await recruiterOr401();
  if ("error" in auth) return auth.error;
  if (!env.liveAvatarApiKey()) return Response.json({ configured: false, sandbox: false, avatars: [] });
  try {
    return Response.json({ configured: true, sandbox: env.liveAvatarSandbox(), avatars: await listAvatars() });
  } catch (err) {
    return handleError(err);
  }
}
