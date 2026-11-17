import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { cookies } from "next/headers";
import { signingSecret } from "@/lib/auth/secret";
import type { InterviewSession, TranscriptTurn } from "@/lib/db/types";
import { env } from "@/lib/env";

// Raphaël's serverless fix: without a shared database, each Vercel instance has its own memory, so a
// session created on one instance is unknown to the next. The candidate's browser carries a signed
// copy of its own interview in an httpOnly cookie, and any instance can pick it up again.
// Only used by the local demo store when it cannot write to disk; Supabase makes it unnecessary.

/** Compact durable payload so a session survives across serverless instances. */
export interface DurableBag {
  session: InterviewSession;
  transcripts: TranscriptTurn[];
}

const COOKIE = "ra_session";
const MAX_AGE = 60 * 60 * 6; // 6 hours
/** Browsers drop cookies above ~4 KB: keep a margin for the name and attributes. */
const MAX_COOKIE_BYTES = 3800;

const sign = (body: string) => createHmac("sha256", signingSecret()).update(body).digest("base64url");

export function sealBag(bag: DurableBag): string {
  const body = deflateRawSync(Buffer.from(JSON.stringify(bag), "utf8")).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function unsealBag(token: string): DurableBag | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(token.slice(i + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(inflateRawSync(Buffer.from(body, "base64url")).toString("utf8")) as DurableBag;
  } catch {
    return null;
  }
}

/** Seals the bag, dropping the oldest transcript turns until the cookie fits. */
export function sealWithinLimit(bag: DurableBag): string | null {
  const transcripts = [...bag.transcripts];
  for (;;) {
    const sealed = sealBag({ session: bag.session, transcripts });
    if (sealed.length <= MAX_COOKIE_BYTES) return sealed;
    if (!transcripts.length) return null;
    transcripts.splice(0, Math.max(1, Math.ceil(transcripts.length / 4)));
  }
}

/** Reads the sealed candidate session (request-scoped). */
export async function readDurableBag(): Promise<DurableBag | null> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    return raw ? unsealBag(raw) : null;
  } catch {
    return null; // outside a request, or no signing key
  }
}

/** Stores the candidate session in an httpOnly cookie. Only works in Route Handlers and Server Actions. */
export async function writeDurableBag(bag: DurableBag): Promise<void> {
  try {
    const sealed = sealWithinLimit(bag);
    if (!sealed) return;
    (await cookies()).set(COOKIE, sealed, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction(),
      path: "/",
      maxAge: MAX_AGE,
    });
  } catch {
    // Read-only context (page render): the next Route Handler call will write it.
  }
}
