// Server-only environment getters. Import from route handlers / server components only.
// Never expose these values to the browser and never log them.

function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const env = {
  geminiApiKey: () => read("GEMINI_API_KEY", "google_api_key"),
  liveAvatarApiKey: () => read("LIVEAVATAR_API_KEY", "liveavatar"),
  liveAvatarAvatarId: () => read("LIVEAVATAR_AVATAR_ID"),
  liveAvatarSecretId: () => read("LIVEAVATAR_GEMINI_SECRET_ID"),
  liveAvatarContextId: () => read("LIVEAVATAR_CONTEXT_ID"),
  // Sandbox is the default; only an explicit "false" turns it off.
  liveAvatarSandbox: () => read("LIVEAVATAR_SANDBOX")?.toLowerCase() !== "false",
  geminiModel: () =>
    read("GEMINI_LIVE_MODEL") ?? "gemini-3.1-flash-live-preview",
  geminiVoice: () => read("GEMINI_VOICE") ?? "Aoede",
  // Default true (in-memory). Set USE_MOCK_DB=false + SUPABASE_* to use Postgres.
  useMockDb: () => read("USE_MOCK_DB")?.toLowerCase() !== "false",
  supabaseUrl: () => read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY"),
};

export function requireEnv(value: string | undefined, label: string): string {
  if (!value) throw new ConfigError(`${label} manquant côté serveur.`);
  return value;
}

export class ConfigError extends Error {}
