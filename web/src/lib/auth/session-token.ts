import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, stateless recruiter session: base64url(JSON payload) + "." + HMAC-SHA256.
// Pure functions (no cookies, no env) so they can be unit-tested.

export const SESSION_COOKIE = "recruitai_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  /** Recruiter id. */
  rid: string;
  /** Expiry, in seconds since the epoch. */
  exp: number;
}

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Reads the payload without checking the signature. Only for optimistic checks (proxy). */
export function decodeSession(token: string | undefined, nowMs: number = Date.now()): SessionPayload | null {
  const body = token?.split(".")[0];
  if (!body) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.rid !== "string" || typeof payload.exp !== "number") return null;
    return payload.exp * 1000 > nowMs ? { rid: payload.rid, exp: payload.exp } : null;
  } catch {
    return null;
  }
}

/** Returns the payload only when the signature is valid and the session has not expired. */
export function verifySession(token: string | undefined, secret: string, nowMs: number = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return decodeSession(token, nowMs);
}
