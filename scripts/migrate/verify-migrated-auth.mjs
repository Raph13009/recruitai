#!/usr/bin/env node
/**
 * End-to-end password reset + login check for migrated recruiters.
 * Never prints passwords, tokens, or full emails.
 *
 * Env:
 *   DATABASE_URL (required)
 *   DATABASE_SSL=false
 *   PUBLIC_APP_URL (for reset links when SEND_RESET_EMAIL=true)
 *   RESEND_API_KEY / RESEND_FROM (optional, when SEND_RESET_EMAIL=true)
 *   SEND_RESET_EMAIL=true to email a fresh reset link after verification
 *   AUTH_VERIFY_LIMIT=3 (default)
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(resolve(root, "web/package.json"));
const { Pool } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const LIMIT = Number(process.env.AUTH_VERIFY_LIMIT || 3);
const SEND = process.env.SEND_RESET_EMAIL === "true";
const SSL = process.env.DATABASE_SSL === "true";
const APP = (process.env.PUBLIC_APP_URL || "https://recruitai-test.boostaiconsulting.com").replace(/\/$/, "");

const pool = new Pool({ connectionString: url, ssl: SSL ? { rejectUnauthorized: false } : false });

function maskEmail(email) {
  const [u, d] = String(email).split("@");
  if (!d) return "***";
  const head = u.slice(0, 2);
  return `${head}***@${d}`;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

async function sendResetEmail(to, resetUrl) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "missing_key" };
  const from = process.env.RESEND_FROM || "RecruitAI <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Réinitialisation de votre mot de passe RecruitAI",
      text: `Bonjour,\n\nLien (1 h) :\n${resetUrl}\n\n— RecruitAI`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { sent: false, reason: "send_failed", status: res.status, detail: body.slice(0, 120) };
  }
  return { sent: true };
}

async function main() {
  const { rows } = await pool.query(
    `select id, email, must_reset_password, password_hash is null as no_hash
     from recruiters
     where must_reset_password = true or password_hash is null
     order by created_at asc
     limit $1`,
    [LIMIT],
  );

  console.log(JSON.stringify({ phase: "targets", count: rows.length, masked: rows.map((r) => maskEmail(r.email)) }));

  const results = [];
  for (const row of rows) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const raw = randomBytes(32).toString("base64url");
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await client.query(
        `insert into password_reset_tokens (recruiter_id, token_hash, expires_at) values ($1, $2, $3)`,
        [row.id, hashToken(raw), expires],
      );

      const tempPassword = `Tmp-${randomBytes(18).toString("base64url")}`;
      const tok = await client.query(
        `select id from password_reset_tokens where token_hash = $1 and used_at is null and expires_at > now()`,
        [hashToken(raw)],
      );
      if (!tok.rows[0]) throw new Error("token_not_found");

      await client.query(`update recruiters set password_hash = $1, must_reset_password = false where id = $2`, [
        hashPassword(tempPassword),
        row.id,
      ]);
      await client.query(`update password_reset_tokens set used_at = now() where id = $1`, [tok.rows[0].id]);

      const check = await client.query(`select password_hash, must_reset_password from recruiters where id = $1`, [
        row.id,
      ]);
      const loginOk =
        verifyPassword(tempPassword, check.rows[0].password_hash) && check.rows[0].must_reset_password === false;

      // Leave account requiring a user-chosen password again (migration contract).
      await client.query(`update recruiters set must_reset_password = true, password_hash = null where id = $1`, [
        row.id,
      ]);

      let emailResult = { sent: false, reason: "skipped" };
      if (SEND) {
        const raw2 = randomBytes(32).toString("base64url");
        await client.query(
          `insert into password_reset_tokens (recruiter_id, token_hash, expires_at) values ($1, $2, $3)`,
          [row.id, hashToken(raw2), new Date(Date.now() + 60 * 60 * 1000).toISOString()],
        );
        await client.query("commit");
        emailResult = await sendResetEmail(row.email, `${APP}/reset-password?token=${encodeURIComponent(raw2)}`);
      } else {
        await client.query("commit");
      }

      results.push({
        email: maskEmail(row.email),
        reset_consume_ok: true,
        login_ok: loginOk,
        left_must_reset: true,
        mail: emailResult,
      });
    } catch (err) {
      await client.query("rollback").catch(() => {});
      results.push({
        email: maskEmail(row.email),
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      client.release();
    }
  }

  const ok = results.length > 0 && results.every((r) => r.login_ok && r.reset_consume_ok);
  console.log(JSON.stringify({ phase: "done", ok, results }, null, 2));
  await pool.end();
  process.exit(ok ? 0 : 2);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exit(1);
});
