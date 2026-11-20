#!/usr/bin/env node
/**
 * Compare export summary counts with private Postgres (no row dumps).
 *
 *   DATABASE_URL=... node scripts/migrate/verify-migration.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(resolve(root, "web/package.json"));
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const summaryPath = resolve(root, "deploy/migration/.secure/export/summary.json");
if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
if (!existsSync(summaryPath)) {
  console.error("Missing export summary. Run export-supabase.mjs first.");
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const TABLES = Object.keys(summary.tables);
let ok = true;

for (const table of TABLES) {
  const { rows } = await pool.query(`select count(*)::int as n from ${table}`);
  const expected = summary.tables[table];
  const actual = rows[0].n;
  const match = expected === actual;
  if (!match) ok = false;
  console.log(`${match ? "OK" : "MISMATCH"} ${table}: export=${expected} pg=${actual}`);
}

// FK sanity: orphan sessions / transcripts
const checks = [
  ["sessions without agency", `select count(*)::int as n from sessions s left join agencies a on a.id = s.agency_id where a.id is null`],
  ["sessions without job", `select count(*)::int as n from sessions s left join jobs j on j.id = s.job_id where j.id is null`],
  ["transcripts without session", `select count(*)::int as n from transcripts t left join sessions s on s.id = t.session_id where s.id is null`],
  ["reports without session", `select count(*)::int as n from reports r left join sessions s on s.id = r.session_id where s.id is null`],
  ["recruiters without agency", `select count(*)::int as n from recruiters r left join agencies a on a.id = r.agency_id where a.id is null`],
];

for (const [label, sql] of checks) {
  const { rows } = await pool.query(sql);
  const n = rows[0].n;
  if (n !== 0) ok = false;
  console.log(`${n === 0 ? "OK" : "FAIL"} ${label}: ${n}`);
}

const { rows: resetRows } = await pool.query(
  `select count(*)::int as n from recruiters where must_reset_password = true or password_hash is null`,
);
console.log(`INFO recruiters needing password reset: ${resetRows[0].n}`);

await pool.end();
process.exit(ok ? 0 : 2);
