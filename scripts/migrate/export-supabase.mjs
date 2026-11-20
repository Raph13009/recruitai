#!/usr/bin/env node
/**
 * Export Supabase Cloud → deploy/migration/.secure/export/ (JSON + branding files).
 * Cloud is read-only. Uses REST (no realtime). Never prints row payloads.
 *
 *   node --env-file=web/.env.local scripts/migrate/export-supabase.mjs
 */
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const authHeaders = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const outDir = resolve(root, "deploy/migration/.secure/export");
mkdirSync(join(outDir, "branding"), { recursive: true });
const summary = { captured_at: new Date().toISOString(), tables: {}, auth_users: 0, branding_files: 0 };

async function fetchAll(table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/${table}?select=*&order=created_at.asc&offset=${from}&limit=${pageSize}`,
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

for (const table of TABLES) {
  const rows = await fetchAll(table);
  writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows));
  summary.tables[table] = rows.length;
  console.log(`exported ${table}: ${rows.length}`);
}

const usersRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: authHeaders });
if (!usersRes.ok) throw new Error(`auth users: ${usersRes.status}`);
const usersBody = await usersRes.json();
const users = usersBody.users ?? usersBody;
const authUsers = (Array.isArray(users) ? users : []).map((u) => ({
  id: u.id,
  email: u.email,
  created_at: u.created_at,
}));
writeFileSync(join(outDir, "auth_users.json"), JSON.stringify(authUsers));
summary.auth_users = authUsers.length;
console.log(`exported auth_users metadata: ${authUsers.length} (no passwords)`);

const bucket = "agency-branding";
const listRes = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
  method: "POST",
  headers: { ...authHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix: "", limit: 1000 }),
});
if (listRes.ok) {
  const top = await listRes.json();
  for (const entry of top ?? []) {
    if (!entry.name || entry.id) continue; // folders often have id null
    const filesRes = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: entry.name, limit: 100 }),
    });
    if (!filesRes.ok) continue;
    const files = await filesRes.json();
    for (const f of files ?? []) {
      if (!f.name || f.name.endsWith("/")) continue;
      const path = `${entry.name}/${f.name}`.replace(/^\//, "");
      const dl = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path}`, {
        headers: authHeaders,
      });
      if (!dl.ok || !dl.body) continue;
      const dest = join(outDir, "branding", entry.name);
      mkdirSync(dest, { recursive: true });
      await pipeline(Readable.fromWeb(dl.body), createWriteStream(join(dest, f.name)));
      summary.branding_files += 1;
    }
  }
  console.log(`exported branding files: ${summary.branding_files}`);
} else {
  console.log(`branding list skipped: ${listRes.status}`);
}

writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log("Export complete → deploy/migration/.secure/export/");
