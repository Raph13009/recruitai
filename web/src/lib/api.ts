import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ConfigError } from "@/lib/env";

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Parses an optional JSON body. Returns null data when the body is missing/empty. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  const text = await req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return { error: fail("JSON invalide.") };
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: fail("Requête invalide.") };
  return { data: parsed.data };
}

/** Maps thrown errors to a JSON response without leaking internals. */
export function handleError(err: unknown) {
  if (err instanceof ConfigError) return fail(err.message, 503);
  const message = err instanceof Error ? err.message : "Erreur serveur.";
  return fail(message.slice(0, 200), 502);
}
