#!/usr/bin/env node
/**
 * One-shot private migration on the Docker network:
 * 1) Apply schema.sql to DATABASE_URL (private PG)
 * 2) Export from Supabase Cloud (read-only HTTPS)
 * 3) Import into private PG (IDs preserved, must_reset_password=true)
 * 4) Verify counts + FK integrity
 *
 * Never prints row payloads or secrets.
 *
 *   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/migrate/run-private-migration.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, readdirSync, statSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(resolve(root, "web/package.json"));
const { Pool } = require("pg");

const TABLES = [
  "agencies",
  "recruiters",
  "jobs",
  "interview_configs",
  "sessions",
  "transcripts",
  "reports",
  "agency_invites",
];

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schemaPath = process.env.SCHEMA_PATH || resolve(root, "deploy/postgres/schema.sql");
const workDir = process.env.MIGRATE_WORKDIR || resolve(root, "deploy/migration/.secure/runtime");
const wipe = process.env.MIGRATE_WIPE === "true";

if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required (read-only export)");
  process.exit(1);
}
if (!existsSync(schemaPath)) {
  console.error(`Schema not found: ${schemaPath}`);
  process.exit(1);
}

const authHeaders = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
};

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

function log(step, msg) {
  console.log(`[migrate] ${step}: ${msg}`);
}

async function applySchema() {
  log("schema", `applying ${schemaPath}`);
  // Prefer psql when available (handles dollar-quoting / multi-statements).
  const psql = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", schemaPath],
    { encoding: "utf8" },
  );
  if (psql.status === 0) {
    log("schema", "applied via psql");
    return;
  }
  log("schema", `psql unavailable or failed (${psql.stderr?.slice(0, 200) || psql.error?.message}); falling back to node`);
  const sql = readFileSync(schemaPath, "utf8");
  // Split on semicolons at end of lines — good enough for our schema.sql
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));
  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt.endsWith(";") ? stmt : `${stmt};`);
    }
  } finally {
    client.release();
  }
  log("schema", `applied ${statements.length} statements via node`);
}

async function fetchAll(table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=*&order=created_at.asc&offset=${from}&limit=${pageSize}`,
      { headers: { ...authHeaders, Prefer: "count=exact" } },
    );
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function exportCloud() {
  mkdirSync(join(workDir, "branding"), { recursive: true });
  const summary = { captured_at: new Date().toISOString(), tables: {}, auth_users: 0, branding_files: 0 };
  for (const table of TABLES) {
    const rows = await fetchAll(table);
    writeFileSync(join(workDir, `${table}.json`), JSON.stringify(rows));
    summary.tables[table] = rows.length;
    log("export", `${table}=${rows.length}`);
  }
  const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: authHeaders,
  });
  if (!usersRes.ok) throw new Error(`auth users: ${usersRes.status}`);
  const body = await usersRes.json();
  const users = body.users ?? body;
  const authUsers = (Array.isArray(users) ? users : []).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
  }));
  writeFileSync(join(workDir, "auth_users.json"), JSON.stringify(authUsers));
  summary.auth_users = authUsers.length;
  log("export", `auth_users=${authUsers.length}`);

  const bucket = "agency-branding";
  const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000 }),
  });
  if (listRes.ok) {
    const top = await listRes.json();
    for (const entry of top ?? []) {
      if (!entry?.name) continue;
      const filesRes = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: entry.name, limit: 100 }),
      });
      if (!filesRes.ok) continue;
      const files = await filesRes.json();
      for (const f of files ?? []) {
        if (!f?.name || f.name.endsWith("/")) continue;
        const path = `${entry.name}/${f.name}`.replace(/^\//, "");
        const dl = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${path}`, {
          headers: authHeaders,
        });
        if (!dl.ok || !dl.body) continue;
        const dest = join(workDir, "branding", entry.name);
        mkdirSync(dest, { recursive: true });
        await pipeline(Readable.fromWeb(dl.body), createWriteStream(join(dest, f.name)));
        summary.branding_files += 1;
      }
    }
  }
  log("export", `branding_files=${summary.branding_files}`);
  writeFileSync(join(workDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

function loadJson(name) {
  const p = join(workDir, `${name}.json`);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8"));
}

async function importPrivate() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (wipe) {
      await client.query(`
        truncate table password_reset_tokens, reports, transcripts, sessions,
          agency_invites, interview_configs, jobs, recruiters, agencies cascade
      `);
      log("import", "wiped target tables (MIGRATE_WIPE=true)");
    }

    const agencies = loadJson("agencies");
    for (const a of agencies) {
      await client.query(
        `insert into agencies (id, name, interviewer, branding, created_by, created_at)
         values ($1,$2,$3::jsonb,$4::jsonb,null,$5)
         on conflict (id) do update set
           name = excluded.name, interviewer = excluded.interviewer, branding = excluded.branding`,
        [a.id, a.name, JSON.stringify(a.interviewer ?? {}), JSON.stringify(a.branding ?? {}), a.created_at],
      );
    }
    log("import", `agencies=${agencies.length}`);

    const recruiters = loadJson("recruiters");
    for (const r of recruiters) {
      await client.query(
        `insert into recruiters (id, agency_id, full_name, email, role, password_hash, must_reset_password, created_at)
         values ($1,$2,$3,$4,$5,null,true,$6)
         on conflict (id) do update set
           agency_id = excluded.agency_id, full_name = excluded.full_name, email = excluded.email,
           role = excluded.role, password_hash = null, must_reset_password = true`,
        [r.id, r.agency_id, r.full_name, r.email, r.role ?? "owner", r.created_at],
      );
    }
    log("import", `recruiters=${recruiters.length} (must_reset_password=true)`);

    for (const a of agencies) {
      if (a.created_by) {
        await client.query(`update agencies set created_by = $1 where id = $2`, [a.created_by, a.id]);
      }
    }

    const jobs = loadJson("jobs");
    for (const j of jobs) {
      await client.query(
        `insert into jobs (id, agency_id, title, location, status, facts, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         on conflict (id) do update set
           title = excluded.title, location = excluded.location, status = excluded.status,
           facts = excluded.facts, updated_at = excluded.updated_at`,
        [j.id, j.agency_id, j.title, j.location, j.status, JSON.stringify(j.facts), j.created_at, j.updated_at],
      );
    }
    log("import", `jobs=${jobs.length}`);

    const configs = loadJson("interview_configs");
    for (const c of configs) {
      await client.query(
        `insert into interview_configs (id, agency_id, job_id, language, voice, ai_disclosure, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (id) do update set
           language = excluded.language, voice = excluded.voice, ai_disclosure = excluded.ai_disclosure`,
        [c.id, c.agency_id, c.job_id, c.language ?? "fr", c.voice, c.ai_disclosure, c.created_at],
      );
    }
    log("import", `interview_configs=${configs.length}`);

    const sessions = loadJson("sessions");
    for (const s of sessions) {
      await client.query(
        `insert into sessions (
           id, agency_id, job_id, interview_config_id, token, candidate_label, candidate_email,
           invited_at, is_synthetic, status, mode, engine, end_reason, live_starts, memory,
           recruiter_status, recruiter_rating, is_favorite, next_action,
           created_at, started_at, completed_at
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22
         )
         on conflict (id) do update set
           status = excluded.status, memory = excluded.memory,
           recruiter_status = excluded.recruiter_status, recruiter_rating = excluded.recruiter_rating,
           is_favorite = excluded.is_favorite, next_action = excluded.next_action`,
        [
          s.id, s.agency_id, s.job_id, s.interview_config_id, s.token, s.candidate_label,
          s.candidate_email ?? null, s.invited_at ?? null, Boolean(s.is_synthetic), s.status,
          s.mode ?? null, s.engine ?? null, s.end_reason ?? null, s.live_starts ?? 0,
          JSON.stringify(s.memory ?? {}), s.recruiter_status ?? "to_review",
          s.recruiter_rating ?? null, Boolean(s.is_favorite), s.next_action ?? null,
          s.created_at, s.started_at ?? null, s.completed_at ?? null,
        ],
      );
    }
    log("import", `sessions=${sessions.length}`);

    const transcripts = loadJson("transcripts");
    for (const t of transcripts) {
      await client.query(
        `insert into transcripts (id, session_id, agency_id, seq, role, text, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (session_id, seq) do update set text = excluded.text, role = excluded.role`,
        [t.id, t.session_id, t.agency_id, t.seq, t.role, t.text, t.created_at],
      );
    }
    log("import", `transcripts=${transcripts.length}`);

    const reports = loadJson("reports");
    for (const r of reports) {
      await client.query(
        `insert into reports (id, session_id, agency_id, content, created_at)
         values ($1,$2,$3,$4::jsonb,$5)
         on conflict (session_id) do update set content = excluded.content`,
        [r.id, r.session_id, r.agency_id, JSON.stringify(r.content), r.created_at],
      );
    }
    log("import", `reports=${reports.length}`);

    const invites = loadJson("agency_invites");
    for (const i of invites) {
      await client.query(
        `insert into agency_invites (id, agency_id, email, role, token, invited_by, created_at, expires_at, accepted_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (id) do update set accepted_at = excluded.accepted_at, expires_at = excluded.expires_at`,
        [
          i.id, i.agency_id, i.email, i.role ?? "member", i.token, i.invited_by,
          i.created_at, i.expires_at, i.accepted_at ?? null,
        ],
      );
    }
    log("import", `agency_invites=${invites.length}`);

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  const brandingSrc = join(workDir, "branding");
  if (existsSync(brandingSrc)) {
    const destRoot = process.env.RECRUITAI_DATA_DIR
      ? join(process.env.RECRUITAI_DATA_DIR, "branding")
      : resolve(root, "web/.data/branding");
    mkdirSync(destRoot, { recursive: true });
    for (const agencyId of readdirSync(brandingSrc)) {
      const src = join(brandingSrc, agencyId);
      if (!statSync(src).isDirectory()) continue;
      cpSync(src, join(destRoot, agencyId), { recursive: true });
    }
    log("import", `branding → ${destRoot}`);
  }
}

async function verify(summary, { allowExtra = false } = {}) {
  let ok = true;
  for (const table of TABLES) {
    const { rows } = await pool.query(`select count(*)::int as n from ${table}`);
    const expected = summary.tables[table];
    const actual = rows[0].n;
    const match = allowExtra ? actual >= expected : expected === actual;
    if (!match) ok = false;
    log(
      "verify",
      `${match ? "OK" : "MISMATCH"} ${table}: export=${expected} pg=${actual}${allowExtra ? " (min)" : ""}`,
    );
  }
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
    log("verify", `${n === 0 ? "OK" : "FAIL"} ${label}: ${n}`);
  }
  const { rows: resetRows } = await pool.query(
    `select count(*)::int as n from recruiters where must_reset_password = true or password_hash is null`,
  );
  log("verify", `recruiters needing password reset: ${resetRows[0].n}`);

  const brandingRoot = process.env.RECRUITAI_DATA_DIR
    ? join(process.env.RECRUITAI_DATA_DIR, "branding")
    : resolve(root, "web/.data/branding");
  let brandingFiles = 0;
  if (existsSync(brandingRoot)) {
    for (const agencyId of readdirSync(brandingRoot)) {
      const dir = join(brandingRoot, agencyId);
      if (!statSync(dir).isDirectory()) continue;
      brandingFiles += readdirSync(dir).length;
    }
  }
  log("verify", `branding files on disk: ${brandingFiles} (export=${summary.branding_files})`);
  if (summary.branding_files > 0 && brandingFiles === 0) ok = false;

  return ok;
}

async function alreadyMigrated() {
  try {
    const { rows } = await pool.query(
      `select
         (select count(*)::int from agencies) as agencies,
         (select count(*)::int from recruiters) as recruiters,
         (select count(*)::int from sessions) as sessions`,
    );
    const r = rows[0];
    return r.agencies > 0 && r.recruiters > 0 && r.sessions > 0;
  } catch {
    return false;
  }
}

async function main() {
  const force = process.env.FORCE_MIGRATE === "true";
  await applySchema();
  if (!force && (await alreadyMigrated()) && wipe) {
    log("skip", "data already present — set FORCE_MIGRATE=true to re-import (refusing wipe)");
    // Allow extra local test rows created after the import.
    const summary = await exportCloud();
    const ok = await verify(summary, { allowExtra: true });
    await pool.end();
    if (!ok) {
      console.error("[migrate] FAILED verification against existing data");
      process.exit(2);
    }
    log("done", "existing migration verified (no wipe)");
    return;
  }
  log("start", wipe ? "wipe+migrate" : "migrate");
  const summary = await exportCloud();
  await importPrivate();
  const ok = await verify(summary);
  // Drop transient export from container filesystem when asked (default in Docker).
  if (process.env.MIGRATE_CLEAN_WORKDIR === "true" && existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
    log("cleanup", "workdir removed");
  }
  await pool.end();
  if (!ok) {
    console.error("[migrate] FAILED verification");
    process.exit(2);
  }
  log("done", "migration verified");
}

main().catch(async (err) => {
  console.error("[migrate] ERROR:", err.message);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
