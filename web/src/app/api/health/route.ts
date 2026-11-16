import { connection } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  await connection(); // read per request, never at build time
  return Response.json({
    ok: true,
    service: "recruitai-web",
    mock_db: env.useMockDb(),
    gemini_configured: Boolean(env.geminiApiKey()),
    liveavatar_configured: Boolean(env.liveAvatarApiKey() && env.liveAvatarSecretId()),
    liveavatar_sandbox: env.liveAvatarSandbox(),
    model: env.geminiModel(),
  });
}
