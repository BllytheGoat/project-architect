// PostgreSQL connection pool. Guarded on globalThis so Next.js HMR / dev
// reloads don't spawn a new pool per module evaluation.
//
// The connection is resolved by ./env so the app works with an explicit
// DATABASE_URL (local dev) *or* Supabase / Vercel-managed Postgres via the
// POSTGRES_URL_NON_POOLING / POSTGRES_URL vars Vercel injects at runtime —
// no repo changes or new secrets required to switch targets. TLS is enabled
// automatically for non-local targets (Supabase's Postgres enforces SSL).
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { connectionConfig, resolveConnectionString, connectionTarget } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const resolved = resolveConnectionString();
if (process.env.NODE_ENV === "development" && resolved.source === "local-default") {
  console.log(`[db] no DATABASE_URL / POSTGRES_* set — using local default ${connectionTarget()}`);
}

export const pool: Pool =
  globalThis.__pgPool ??
  new Pool({
    ...connectionConfig(),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool.query(text, params as never[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
