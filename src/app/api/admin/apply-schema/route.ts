// Token-gated, idempotent schema bootstrap.
//
// Run this ONCE against a Supabase/managed Postgres that you cannot reach
// from a dev box (Supabase's db host publishes no IPv4 A record, so it is
// only reachable from Vercel's own network). It applies the Phase 1 schema
// to whatever target the resolved connection points at.
//
// SECURITY:
//   - Gated by the shared secret ADMIN_TOKEN (env). If ADMIN_TOKEN is unset
//     the endpoint is DISABLED and returns 503 — it never runs open.
//   - Comparison is timing-safe.
//   - force-dynamic so Vercel never prerenders/prefetches it into a DB write.
//
// Usage (once the deployment is live and ADMIN_TOKEN is set on Vercel):
//   curl -H "x-admin-token: $ADMIN_TOKEN" \
//     https://<app>.vercel.app/api/admin/apply-schema
//
// Idempotent: re-running is a no-op (CREATE ... IF NOT EXISTS).

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { applySchema } from "@/lib/db/migrate";
import { connectionConfig, connectionTarget, resolveConnectionString } from "@/lib/db/env";

export const dynamic = "force-dynamic";

function constTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getToken(req: Request): Promise<string | null> {
  const header = req.headers.get("x-admin-token");
  if (header) return header;
  const url = new URL(req.url);
  return url.searchParams.get("token");
}

export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || adminToken.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Admin migration disabled (ADMIN_TOKEN not set)" },
      { status: 503 },
    );
  }

  const provided = await getToken(req);
  if (!provided || !constTimeEqual(provided, adminToken)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing token" }, { status: 403 });
  }

  const { source } = resolveConnectionString();
  // A short-lived pool dedicated to the migration so we never disturb the
  // app's shared pool mid-request.
  const pool = new Pool({ ...connectionConfig(), max: 4 });
  try {
    const tables = await applySchema(pool);
    return NextResponse.json({
      ok: true,
      target: connectionTarget(),
      source,
      tables,
      message: `Schema applied to ${connectionTarget()} (from ${source}). ${tables.length} tables.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, target: connectionTarget(), source, error: msg },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
}
