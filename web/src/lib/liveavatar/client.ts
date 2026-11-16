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
 * Creates a LITE session token wired to the Gemini Live connector.
 * The browser SDK (LiveAvatarSession.start) performs the actual session start with this token.
 * Sandbox is forced on whenever the server env says so; the browser can only ask for *more* safety.
 */
export async function createLiteSessionToken(opts: { sandbox?: boolean } = {}): Promise<LiveAvatarSessionInfo> {
  const apiKey = requireEnv(env.liveAvatarApiKey(), "LIVEAVATAR_API_KEY");
  const secretId = env.liveAvatarSecretId();
  if (!secretId) {
    throw new ConfigError(
      "LIVEAVATAR_GEMINI_SECRET_ID manquant : le connecteur Gemini de LiveAvatar a besoin d'un secret enregistré.",
    );
  }
  const sandbox = env.liveAvatarSandbox() || opts.sandbox === true;
  const avatarId = sandbox ? SANDBOX_AVATAR_ID : requireEnv(env.liveAvatarAvatarId(), "LIVEAVATAR_AVATAR_ID");
  const contextId = env.liveAvatarContextId();

  const res = await fetch(`${API_URL}/v1/sessions/token`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "LITE",
      avatar_id: avatarId,
      is_sandbox: sandbox,
      gemini_realtime_config: {
        secret_id: secretId,
        ...(contextId ? { context_id: contextId } : {}),
        model: env.geminiModel(),
        voice: env.geminiVoice(),
      },
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as {
    data?: { session_id?: string; session_token?: string } | null;
    message?: string;
  } | null;
  if (!res.ok || !body?.data?.session_token || !body.data.session_id) {
    throw new Error(`LiveAvatar a refusé la session (HTTP ${res.status})${body?.message ? ` : ${body.message}` : ""}`);
  }
  return { sessionToken: body.data.session_token, sessionId: body.data.session_id, sandbox, avatarId };
}
