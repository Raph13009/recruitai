import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataFile } from "@/lib/data-dir";
import { ConfigError, env } from "@/lib/env";

const g = globalThis as unknown as { __recruitaiSigningSecret?: string };

/**
 * Key that signs the recruiter session cookie and the candidate session cookie.
 * - SESSION_SECRET when set (always set it in production).
 * - Local development: a random key kept in web/.data, so sign-ins survive restarts.
 * - Hosts without a writable disk: a key derived from the server's own API keys, so a fresh
 *   deployment keeps working until SESSION_SECRET is configured. Never a hard-coded value.
 */
export function signingSecret(): string {
  const configured = env.sessionSecret();
  if (configured) return configured;
  if (g.__recruitaiSigningSecret) return g.__recruitaiSigningSecret;

  if (env.persistMockDb()) {
    const file = dataFile("session-secret");
    try {
      g.__recruitaiSigningSecret = readFileSync(file, "utf8").trim() || undefined;
    } catch {
      /* first run */
    }
    if (!g.__recruitaiSigningSecret) {
      g.__recruitaiSigningSecret = randomBytes(32).toString("base64url");
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, g.__recruitaiSigningSecret, { mode: 0o600 });
      } catch {
        /* read-only disk: the key lasts for this process only */
      }
    }
    return g.__recruitaiSigningSecret;
  }

  const material = env.geminiApiKey() || env.liveAvatarApiKey() || env.supabaseServiceRoleKey();
  if (material) {
    g.__recruitaiSigningSecret = createHmac("sha256", material).update("recruitai-cookie-signing-v1").digest("base64url");
    return g.__recruitaiSigningSecret;
  }
  throw new ConfigError("SESSION_SECRET manquant côté serveur.");
}
