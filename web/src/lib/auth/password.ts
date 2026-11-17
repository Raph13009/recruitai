import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hashing for the mock store (scrypt, per-password salt).
// With Supabase Auth this file goes away: credentials live in auth.users.

const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
