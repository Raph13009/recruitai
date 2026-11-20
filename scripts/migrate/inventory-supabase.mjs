#!/usr/bin/env node
/**
 * Read-only inventory of Supabase Cloud tables used by RecruitAI.
 * Uses PostgREST + Auth Admin HTTP (no realtime / WebSocket).
 * Does NOT print row contents or secrets — only table names and counts.
 *
 *   node --env-file=web/.env.local scripts/migrate/inventory-supabase.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Prefer: "count=exact",
};

async function countTable(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, { method: "HEAD", headers });
  if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
  const range = res.headers.get("content-range"); // e.g. */12
  const n = range?.includes("/") ? Number(range.split("/")[1]) : null;
  return { ok: true, count: Number.isFinite(n) ? n : null };
}

async function countAuthUsers() {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
  const body = await res.json();
  const users = body.users ?? body;
  return {
    ok: true,
    count: Array.isArray(users) ? users.length : null,
    note: "Passwords never exported; migrated users get must_reset_password=true",
  };
}

async function listStorage() {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
  const buckets = await res.json();
  const out = [];
  for (const b of buckets ?? []) {
    const list = await fetch(`${url}/storage/v1/object/list/${b.name}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: "", limit: 1000 }),
    });
    const files = list.ok ? await list.json() : null;
    out.push({
      name: b.name,
      public: b.public,
      file_count: Array.isArray(files) ? files.length : null,
      error: list.ok ? undefined : `${list.status}`,
    });
  }
  return { ok: true, buckets: out };
}

const outDir = resolve(root, "deploy/migration/.secure");
mkdirSync(outDir, { recursive: true });

const inventory = {
  captured_at: new Date().toISOString(),
  tables: {},
  auth_users: null,
  storage: {},
};

for (const table of TABLES) {
  inventory.tables[table] = await countTable(table);
}

inventory.auth_users = await countAuthUsers();
inventory.storage = await listStorage();

writeFileSync(resolve(outDir, "inventory.json"), JSON.stringify(inventory, null, 2));
console.log("Inventory written (counts only):");
for (const [name, info] of Object.entries(inventory.tables)) {
  console.log(`  ${name}: ${info.ok ? info.count : `ERROR ${info.error}`}`);
}
console.log(`  auth.users: ${inventory.auth_users?.count ?? inventory.auth_users?.error}`);
if (inventory.storage?.buckets) {
  for (const b of inventory.storage.buckets) {
    console.log(`  storage/${b.name}: ${b.file_count ?? b.error}`);
  }
}
console.log("Secure file: deploy/migration/.secure/inventory.json");
