import { env, requireEnv } from "@/lib/env";

// LiveAvatar (HeyGen) gives the interviewer a photoreal face. We use LITE mode without a connector:
// LiveAvatar only renders the video; the browser streams the Gemini Live audio to it and the avatar
// lip-syncs on that audio. The conversation (prompt, tools, structured memory) stays ours.
// Docs: https://docs.liveavatar.com/docs/lite-mode/overview

const API_URL = "https://api.liveavatar.com";
// The sandbox only supports the "Wayne" avatar and ends sessions after about one minute.
export const SANDBOX_AVATAR = { id: "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a", name: "Wayne" } as const;

export interface AvatarSessionInfo {
  sessionToken: string;
  sessionId: string;
  sandbox: boolean;
  avatarId: string;
}

export interface AvatarOption {
  id: string;
  name: string;
  preview_url: string | null;
  /** "public" = LiveAvatar stock library, "custom" = created in the agency's own LiveAvatar space. */
  source: "public" | "custom";
}

interface ApiEnvelope<T> {
  code?: number;
  data?: T | null;
  message?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = requireEnv(env.liveAvatarApiKey(), "LIVEAVATAR_API_KEY");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body?.data) {
    throw new Error(`LiveAvatar a refusé la requête (HTTP ${res.status})${body?.message ? ` : ${body.message}` : ""}`);
  }
  return body.data;
}

/**
 * Session token for the browser SDK. Sandbox is forced on whenever the server env says so.
 * `avatarId` is the agency's choice; it falls back to LIVEAVATAR_AVATAR_ID.
 */
export async function createAvatarSessionToken(opts: { avatarId?: string | null } = {}): Promise<AvatarSessionInfo> {
  const sandbox = env.liveAvatarSandbox();
  const avatarId = sandbox
    ? SANDBOX_AVATAR.id
    : requireEnv(opts.avatarId || env.liveAvatarAvatarId(), "LIVEAVATAR_AVATAR_ID (ou un avatar choisi dans l'espace recruteur)");
  const maxSeconds = env.liveAvatarMaxSeconds();

  const data = await call<{ session_id?: string; session_token?: string }>("/v1/sessions/token", {
    method: "POST",
    body: JSON.stringify({
      mode: "LITE",
      avatar_id: avatarId,
      is_sandbox: sandbox,
      video_settings: { quality: "high", encoding: "H264" },
      ...(maxSeconds ? { max_session_duration: maxSeconds } : {}),
    }),
  });
  if (!data.session_token || !data.session_id) throw new Error("LiveAvatar n'a pas renvoyé de session.");
  return { sessionToken: data.session_token, sessionId: data.session_id, sandbox, avatarId };
}

interface AvatarRow {
  id: string;
  name: string;
  preview_url?: string | null;
  status?: string;
  is_expired?: boolean;
}

async function listPage(path: string, source: AvatarOption["source"]): Promise<AvatarOption[]> {
  const data = await call<{ results?: AvatarRow[] }>(`${path}?page_size=100`);
  return (data.results ?? [])
    .filter((a) => !a.is_expired && (!a.status || a.status === "ACTIVE"))
    .map((a) => ({ id: a.id, name: a.name, preview_url: a.preview_url ?? null, source }));
}

/** Faces the agency can pick: its own custom avatars first, then the stock library. */
export async function listAvatars(): Promise<AvatarOption[]> {
  const [custom, stock] = await Promise.all([
    listPage("/v1/avatars", "custom").catch(() => []),
    listPage("/v1/avatars/public", "public"),
  ]);
  const seen = new Set<string>();
  return [...custom, ...stock].filter((a) => !seen.has(a.id) && seen.add(a.id));
}
