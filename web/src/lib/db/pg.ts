import "server-only";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "@/lib/env";

let pool: Pool | null = null;

export function databaseConfigured(): boolean {
  return Boolean(env.databaseUrl());
}

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = env.databaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL manquant.");
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Private Docker network / self-signed: allow opt-in via DATABASE_SSL=true
    ssl: env.databaseSsl() ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (err) => {
    console.error("[pg] idle client error", err.message);
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Best-effort close for scripts / tests. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
