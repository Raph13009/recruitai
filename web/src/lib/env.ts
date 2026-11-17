// Server-only environment getters. Import from route handlers / server components only.
// Never expose these values to the browser and never log them.

function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** "true"/"false" flag with a default when unset or unreadable. */
function flag(name: string, fallback: boolean): boolean {
  const value = read(name)?.toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

const isProduction = () => process.env.NODE_ENV === "production";

export const env = {
  isProduction,

  // --- Voice: Gemini Live (brain + voice of the interviewer) ---
  geminiApiKey: () => read("GEMINI_API_KEY", "google_api_key"),
  geminiModel: () => read("GEMINI_LIVE_MODEL") ?? "gemini-3.1-flash-live-preview",
  geminiVoice: () => read("GEMINI_VOICE") ?? "Aoede",

  // --- Face: LiveAvatar (photoreal video, lip-synced on the Gemini audio) ---
  liveAvatarApiKey: () => read("LIVEAVATAR_API_KEY", "liveavatar"),
  liveAvatarAvatarId: () => read("LIVEAVATAR_AVATAR_ID"),
  // Sandbox is the default; only an explicit "false" turns it off.
  liveAvatarSandbox: () => flag("LIVEAVATAR_SANDBOX", true),
  // The sandbox only has the "Wayne" avatar: use a matching voice so face and voice agree.
  /** Voice for the sandbox face (male "Wayne"). GEMINI_VOICE_MALE is Raphaël's name for it. */
  liveAvatarSandboxVoice: () => read("LIVEAVATAR_SANDBOX_VOICE", "GEMINI_VOICE_MALE") ?? "Charon",
  /**
   * Optional hard cap on one avatar session, in seconds (credits are billed per minute).
   * Must not exceed the limit of the LiveAvatar plan, so nothing is sent unless it is set.
   */
  liveAvatarMaxSeconds: () => {
    const n = Number(read("LIVEAVATAR_MAX_SESSION_SECONDS"));
    return Number.isFinite(n) && n >= 60 ? Math.floor(n) : undefined;
  },

  // --- Data ---
  /** Default true. Set USE_MOCK_DB=false with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Postgres. */
  useMockDb: () => flag("USE_MOCK_DB", true),
  supabaseUrl: () => read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY"),
  /** Keep the mock database in web/.data/store.json between restarts (never on serverless hosts). */
  persistMockDb: () => !process.env.VERCEL && flag("MOCK_DB_PERSIST", true),

  // --- Accounts ---
  sessionSecret: () => read("SESSION_SECRET"),
  /** One-click sign-in to the seeded demo agency. Off in production unless asked for. */
  demoLogin: () => flag("ALLOW_DEMO_LOGIN", !isProduction()),
  /** Public "try the interview" page (/demo). It can spend voice/avatar credits: turn off if needed. */
  publicDemo: () => flag("PUBLIC_DEMO", true),
};

export function requireEnv(value: string | undefined, label: string): string {
  if (!value) throw new ConfigError(`${label} manquant côté serveur.`);
  return value;
}

export class ConfigError extends Error {}
