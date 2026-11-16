import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { InterviewSession, TranscriptTurn } from "@/lib/db/types";
import { env } from "@/lib/env";

/** Compact durable payload so a session survives across Vercel serverless instances. */
export interface DurableBag {
  session: InterviewSession;
  transcripts: TranscriptTurn[];
}

const COOKIE = "ra_session";
const MAX_AGE = 60 * 60 * 6; // 6 hours

function secret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    env.geminiApiKey() ||
    env.liveAvatarApiKey() ||
    "recruitai-dev-only"
  );
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function sealBag(bag: DurableBag): string {
  const body = Buffer.from(JSON.stringify(bag), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function unsealBag(token: string): DurableBag | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DurableBag;
  } catch {
    return null;
  }
}

/** Read the sealed session cookie (request-scoped). */
export async function readDurableBag(): Promise<DurableBag | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(COOKIE)?.value;
    if (!raw) return null;
    return unsealBag(raw);
  } catch {
    // cookies() can throw outside a request context
    return null;
  }
}

/** Persist the current session bag in an httpOnly cookie. */
export async function writeDurableBag(bag: DurableBag): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(COOKIE, sealBag(bag), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
  } catch {
    // ignore outside request context
  }
}
