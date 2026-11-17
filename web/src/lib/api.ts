import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getCurrentRecruiter } from "@/lib/auth/dal";
import type { CurrentRecruiter } from "@/lib/db/types";
import { ConfigError } from "@/lib/env";

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Parses an optional JSON body. An empty body is read as `{}`. */
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

/** For recruiter Route Handlers: the signed-in recruiter, or a 401 response. */
export async function recruiterOr401(): Promise<{ recruiter: CurrentRecruiter } | { error: NextResponse }> {
  const recruiter = await getCurrentRecruiter();
  return recruiter ? { recruiter } : { error: fail("Connexion requise.", 401) };
}
