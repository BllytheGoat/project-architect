// Apply the Phase 1 schema to the resolved Postgres target. Idempotent.
// Usage: npx tsx scripts/db-migrate.ts   (or: npm run db:migrate)
//
// Resolves DATABASE_URL first, then Supabase/Vercel-managed Postgres via
// POSTGRES_URL_NON_POOLING / POSTGRES_URL — same priority as the runtime
// pool, so `npm run db:migrate` and the app never point at different DBs.
// The DDL itself comes from the shared applySchema() so the local runner and
// the Vercel bootstrap endpoint can't drift.
import { Pool } from "pg";
import { connectionConfig, resolveConnectionString, connectionTarget } from "../src/lib/db/env";
import { applySchema } from "../src/lib/db/migrate";

async function main() {
  const { source } = resolveConnectionString();
  if (source === "local-default") {
    console.error(
      "No DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL found — refusing to migrate the local default.\n" +
        "Set DATABASE_URL, or point POSTGRES_URL_NON_POOLING at the Supabase connection\n" +
        "(vercel env pull --environment production reveals those vars; note the password is [SENSITIVE] and only reachable from Vercel,\n" +
        "in which case use POST /api/admin/apply-schema instead).",
    );
    process.exitCode = 2;
    return;
  }
  console.log(`[db:migrate] target ${connectionTarget()} (from ${source})`);
  const pool = new Pool({ ...connectionConfig(), max: 4 });
  try {
    const tables = await applySchema(pool);
    console.log("Schema applied. Tables:");
    for (const t of tables) console.log("  - " + t);
  } catch (err) {
    console.error("Migration failed:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
