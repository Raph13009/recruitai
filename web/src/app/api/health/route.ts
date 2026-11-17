import { connection } from "next/server";
import { usingSupabase } from "@/lib/db";
import { supabaseConfigured } from "@/lib/db/client";
import { env } from "@/lib/env";

export async function GET() {
  await connection(); // read per request, never at build time
  const voice = Boolean(env.geminiApiKey());
  const avatar = Boolean(env.liveAvatarApiKey());
  const supabase = usingSupabase();
  return Response.json({
    ok: true,
    service: "recruitai-web",
    /** "supabase" = shared Postgres; "local" = demo store (file in dev, memory + candidate cookie on serverless). */
    storage: supabase ? "supabase" : "local",
    mock_db: !supabase,
    mock_db_persisted: !supabase && env.persistMockDb(),
    supabase_configured: supabaseConfigured(),
    /** "demo" = scripted interviewer with the browser's voice (no key configured). */
    interview_engine: voice ? "gemini" : "demo",
    gemini_configured: voice,
    liveavatar_configured: avatar,
    liveavatar_sandbox: avatar && env.liveAvatarSandbox(),
    model: env.geminiModel(),
  });
}
