import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

const credentials = () => ({ url: env.supabaseUrl(), key: env.supabaseServiceRoleKey() });

/** Server-only service-role client. Never import from client components. */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const { url, key } = credentials();
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.");
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

/**
 * A short-lived client for password sign-in. Signing in sets a user session on the client, so it
 * must never be the shared service-role client (later queries would run as that user).
 */
export function supabaseAuthClient(): SupabaseClient {
  const { url, key } = credentials();
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function supabaseConfigured(): boolean {
  const { url, key } = credentials();
  return Boolean(url && key);
}
