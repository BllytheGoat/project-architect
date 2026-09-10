// PostgreSQL connection pool. Guarded on globalThis so Next.js HMR / dev
// reloads don't spawn a new pool per module evaluation.
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  globalThis.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://architect:architect_dev@127.0.0.1:5432/project_architect",
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
