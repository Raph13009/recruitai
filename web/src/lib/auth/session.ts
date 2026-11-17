import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { signingSecret } from "@/lib/auth/secret";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession } from "@/lib/auth/session-token";
import { env } from "@/lib/env";

/** Recruiter id from a valid session cookie, or null. */
export async function readSessionRecruiterId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // Checking the expiry reads the clock: only ever for a real request, never in a prerender.
  await connection();
  return verifySession(token, signingSecret())?.rid ?? null;
}

/** Only callable from a Server Action or a Route Handler (it sets a cookie). */
export async function startSession(recruiterId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  (await cookies()).set(SESSION_COOKIE, signSession({ rid: recruiterId, exp }, signingSecret()), {
    httpOnly: true,
    secure: env.isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Only callable from a Server Action or a Route Handler. */
export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
