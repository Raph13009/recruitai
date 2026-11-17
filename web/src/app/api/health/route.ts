import { connection } from "next/server";
import { supabaseConfigured } from "@/lib/db/client";
import { env } from "@/lib/env";

export async function GET() {
  await connection(); // read per request, never at build time
  const mock = env.useMockDb() || !supabaseConfigured();
  return Response.json({
    ok: true,
    service: "recruitai-web",
    mock_db: mock,
    supabase_configured: supabaseConfigured(),
    gemini_configured: Boolean(env.geminiApiKey()),
    liveavatar_configured: Boolean(env.liveAvatarApiKey() && env.liveAvatarSecretId()),
    liveavatar_sandbox: env.liveAvatarSandbox(),
    model: env.geminiModel(),
  });
}
