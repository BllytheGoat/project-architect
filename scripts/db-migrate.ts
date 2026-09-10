// Apply the Phase 1 schema to the configured DATABASE_URL. Idempotent.
// Usage: npx tsx scripts/db-migrate.ts   (or: npm run db:migrate)
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgres://architect:architect@127.0.0.1:5432/project_architect";
  const sql = readFileSync(
    path.join(process.cwd(), "src", "lib", "db", "schema.sql"),
    "utf8",
  );
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(sql);
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
    );
    console.log("Schema applied. Tables:");
    for (const t of tables.rows) console.log("  - " + t.table_name);
  } catch (err) {
    console.error("Migration failed:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
