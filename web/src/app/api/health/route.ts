import { connection } from "next/server";
import { usingPostgres, usingSupabase } from "@/lib/db";
import { supabaseConfigured } from "@/lib/db/client";
import { databaseConfigured } from "@/lib/db/pg";
import { env } from "@/lib/env";

export async function GET() {
  await connection(); // read per request, never at build time
  const voice = Boolean(env.geminiApiKey());
  const avatar = Boolean(env.liveAvatarApiKey());
  const postgres = usingPostgres();
  const supabase = usingSupabase();
  const storage = postgres ? "postgres" : supabase ? "supabase" : "local";
  return Response.json({
    ok: true,
    service: "recruitai-web",
    /** postgres = private Dokploy PG; supabase = legacy Cloud; local = demo store. */
    storage,
    mock_db: !postgres && !supabase,
    mock_db_persisted: !postgres && !supabase && env.persistMockDb(),
    database_configured: databaseConfigured(),
    supabase_configured: supabaseConfigured(),
    /** "demo" = scripted interviewer with the browser's voice (no key configured). */
    interview_engine: voice ? "gemini" : "demo",
    gemini_configured: voice,
    liveavatar_configured: avatar,
    liveavatar_sandbox: avatar && env.liveAvatarSandbox(),
    model: env.geminiModel(),
  });
}
