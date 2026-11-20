#!/usr/bin/env node
/**
 * Import deploy/migration/.secure/export/*.json into private PostgreSQL.
 * Preserves UUIDs. Sets must_reset_password=true for all recruiters (no password export).
 *
 *   DATABASE_URL=postgres://... node scripts/migrate/import-private-pg.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(resolve(root, "web/package.json"));
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const exportDir = resolve(root, "deploy/migration/.secure/export");
if (!existsSync(join(exportDir, "agencies.json"))) {
  console.error("Missing export. Run export-supabase.mjs first.");
  process.exit(1);
}

const read = (name) => JSON.parse(readFileSync(join(exportDir, `${name}.json`), "utf8"));
const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });

function loadJson(name) {
  try {
    return read(name);
  } catch {
    return [];
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Order respects FKs. Clear target only when MIGRATE_WIPE=true (isolated test DB).
    if (process.env.MIGRATE_WIPE === "true") {
      await client.query(`
        truncate table password_reset_tokens, reports, transcripts, sessions,
          agency_invites, interview_configs, jobs, recruiters, agencies cascade
      `);
      console.log("wiped target tables (MIGRATE_WIPE=true)");
    }

    // Insert agencies without created_by first (circular FK with recruiters).
    const agencies = loadJson("agencies");
    for (const a of agencies) {
      await client.query(
        `insert into agencies (id, name, interviewer, branding, created_by, created_at)
         values ($1,$2,$3::jsonb,$4::jsonb,null,$5)
         on conflict (id) do update set
           name = excluded.name, interviewer = excluded.interviewer,
           branding = excluded.branding`,
        [
          a.id,
          a.name,
          JSON.stringify(a.interviewer ?? {}),
          JSON.stringify(a.branding ?? {}),
          a.created_at,
        ],
      );
    }
    console.log(`agencies: ${agencies.length}`);

    const recruiters = loadJson("recruiters");
    for (const r of recruiters) {
      await client.query(
        `insert into recruiters (id, agency_id, full_name, email, role, password_hash, must_reset_password, created_at)
         values ($1,$2,$3,$4,$5,null,true,$6)
         on conflict (id) do update set
           agency_id = excluded.agency_id, full_name = excluded.full_name,
           email = excluded.email, role = excluded.role,
           password_hash = null, must_reset_password = true`,
        [r.id, r.agency_id, r.full_name, r.email, r.role ?? "owner", r.created_at],
      );
    }
    console.log(`recruiters: ${recruiters.length} (must_reset_password=true)`);

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
    console.log(`jobs: ${jobs.length}`);

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
    console.log(`interview_configs: ${configs.length}`);

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
    console.log(`sessions: ${sessions.length}`);

    const transcripts = loadJson("transcripts");
    for (const t of transcripts) {
      await client.query(
        `insert into transcripts (id, session_id, agency_id, seq, role, text, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (session_id, seq) do update set text = excluded.text, role = excluded.role`,
        [t.id, t.session_id, t.agency_id, t.seq, t.role, t.text, t.created_at],
      );
    }
    console.log(`transcripts: ${transcripts.length}`);

    const reports = loadJson("reports");
    for (const r of reports) {
      await client.query(
        `insert into reports (id, session_id, agency_id, content, created_at)
         values ($1,$2,$3,$4::jsonb,$5)
         on conflict (session_id) do update set content = excluded.content`,
        [r.id, r.session_id, r.agency_id, JSON.stringify(r.content), r.created_at],
      );
    }
    console.log(`reports: ${reports.length}`);

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
    console.log(`agency_invites: ${invites.length}`);

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  // Branding files → RECRUITAI_DATA_DIR/branding or default
  const brandingSrc = join(exportDir, "branding");
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
    console.log(`branding copied → ${destRoot}`);
  }

  await pool.end();
  console.log("Import complete.");
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
