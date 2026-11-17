import { ConfigError, env, requireEnv } from "@/lib/env";

const API_URL = "https://api.liveavatar.com";
// Sandbox only supports the "Wayne" avatar; the configured avatar (Judy HR) is used outside sandbox.
const SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

export interface LiveAvatarSessionInfo {
  sessionToken: string;
  sessionId: string;
  sandbox: boolean;
  avatarId: string;
}

/**
 * Creates a LITE session token.
 * - Default: wired to the Gemini Live connector (browser mic → Gemini → avatar video).
 * - `clientDriven: true`: no connector — the browser runs Gemini and feeds PCM via `repeatAudio`
 *   (needed for typed replies while the avatar still speaks).
 * Sandbox is forced on whenever the server env says so; the browser can only ask for *more* safety.
 */
export async function createLiteSessionToken(
  opts: { sandbox?: boolean; clientDriven?: boolean } = {},
): Promise<LiveAvatarSessionInfo> {
  const apiKey = requireEnv(env.liveAvatarApiKey(), "LIVEAVATAR_API_KEY");
  const sandbox = env.liveAvatarSandbox() || opts.sandbox === true;
  const avatarId = sandbox ? SANDBOX_AVATAR_ID : requireEnv(env.liveAvatarAvatarId(), "LIVEAVATAR_AVATAR_ID");

  const payload: Record<string, unknown> = {
    mode: "LITE",
    avatar_id: avatarId,
    is_sandbox: sandbox,
  };

  if (!opts.clientDriven) {
    const secretId = env.liveAvatarSecretId();
    if (!secretId) {
      throw new ConfigError(
        "LIVEAVATAR_GEMINI_SECRET_ID manquant : le connecteur Gemini de LiveAvatar a besoin d'un secret enregistré.",
      );
    }
    const contextId = env.liveAvatarContextId();
    payload.gemini_realtime_config = {
      secret_id: secretId,
      ...(contextId ? { context_id: contextId } : {}),
      model: env.geminiModel(),
      voice: env.geminiVoice(),
    };
  }

  const res = await fetch(`${API_URL}/v1/sessions/token`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as {
    data?: { session_id?: string; session_token?: string } | null;
    message?: string;
  } | null;
  if (!res.ok || !json?.data?.session_token || !json.data.session_id) {
    throw new Error(`LiveAvatar a refusé la session (HTTP ${res.status})${json?.message ? ` : ${json.message}` : ""}`);
  }
  return { sessionToken: json.data.session_token, sessionId: json.data.session_id, sandbox, avatarId };
}
