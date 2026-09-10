// Apply the Phase 1 schema to a Postgres target. Shared by the local runner
// (scripts/db-migrate.ts) and the token-gated Vercel bootstrap endpoint
// (api/admin/apply-schema) so they apply byte-identical DDL.
//
// Idempotent — safe to re-run. Returns the list of tables it confirmed in the
// `public` schema after applying.
import type { Pool } from "pg";
import { SCHEMA_SQL } from "./schema";

export async function applySchema(pool: Pool): Promise<string[]> {
  await pool.query(SCHEMA_SQL);
  const tables = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  return tables.rows.map((r) => r.table_name);
}
