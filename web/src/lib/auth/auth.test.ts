import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decodeSession, signSession, verifySession } from "@/lib/auth/session-token";

const SECRET = "test-secret-with-enough-entropy";
const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);
const valid = { rid: "recruiter-1", exp: NOW / 1000 + 3600 };

describe("session token", () => {
  it("round-trips a signed session", () => {
    const token = signSession(valid, SECRET);
    expect(verifySession(token, SECRET, NOW)).toEqual(valid);
  });

  it("rejects a wrong secret, a tampered payload and an expired session", () => {
    const token = signSession(valid, SECRET);
    expect(verifySession(token, "another-secret", NOW)).toBeNull();

    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...valid, rid: "someone-else" })).toString("base64url");
    expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();

    expect(verifySession(token, SECRET, NOW + 2 * 3600 * 1000)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBeNull();
    expect(verifySession("abc", SECRET, NOW)).toBeNull();
    expect(verifySession("a.b.c", SECRET, NOW)).toBeNull();
    expect(decodeSession("%%%.x", NOW)).toBeNull();
  });

  it("decodes without verifying, for optimistic checks only", () => {
    const token = signSession(valid, SECRET);
    expect(decodeSession(token, NOW)).toEqual(valid);
    expect(decodeSession(token, NOW + 2 * 3600 * 1000)).toBeNull();
  });
});

describe("password", () => {
  it("verifies the right password only", () => {
    const stored = hashPassword("correct horse");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
    expect(verifyPassword("correct horse", "plain")).toBe(false);
  });

  it("salts every hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});
