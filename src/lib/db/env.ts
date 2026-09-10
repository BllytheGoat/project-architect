// Resolve the Postgres connection for the app, in priority order:
//
//   1. DATABASE_URL          — explicit (local dev default, or whatever you set)
//   2. POSTGRES_URL_NON_POOLING — Supabase / Vercel-managed Postgres, direct
//      (port 5432). Correct target for a `pg` Pool that manages its own
//      connections: it is NOT routed through PgBouncer's transaction pooler.
//   3. POSTGRES_URL          — Vercel's pooled URL (port 6543). Only sensible
//      for clients that hold one long-lived connection (Prisma). Kept as a
//      last-resort fallback so an app that only has the pooled var still runs.
//
// The Supabase service password is never stored in the repo or in this file —
// it arrives at runtime via the env vars Vercel injects (pulled in the
// dashboard / `vercel env pull`).
//
// Used by both the runtime pool (client.ts) and the one-off migration runner
// so the two can never disagree about which database they talk to.
import type { PoolConfig } from "pg";

const LOCAL_DEFAULT =
  "postgres://architect:***@127.0.0.1:5432/project_architect";

export type ConnectionSource =
  | "DATABASE_URL"
  | "POSTGRES_URL_NON_POOLING"
  | "POSTGRES_URL"
  | "local-default";

export interface ResolvedConnection {
  url: string;
  /** Which source supplied the value — handy for logging / error messages. */
  source: ConnectionSource;
}

/**
 * Resolve the connection string + which env key supplied it. Never returns
 * undefined: if nothing is configured it falls back to the local default so
 * the app still boots in a bare environment (the DB-backed calls will fail
 * with a clear ECONNREFUSED rather than crashing at import time).
 *
 * Precedence:
 *   - On Vercel (process.env.VERCEL set): the managed Supabase/Vercel Postgres
 *     wins, because a stray local `DATABASE_URL` can leak into a CLI local
 *     deploy and would otherwise shadow it. Order:
 *       POSTGRES_URL_NON_POOLING → POSTGRES_URL → DATABASE_URL → local-default
 *   - Everywhere else (local dev): an explicit DATABASE_URL wins:
 *       DATABASE_URL → POSTGRES_URL_NON_POOLING → POSTGRES_URL → local-default
 */
export function resolveConnectionString(): ResolvedConnection {
  const onVercel = !!process.env.VERCEL;
  const db = process.env.DATABASE_URL;
  const nonPooling = process.env.POSTGRES_URL_NON_POOLING;
  const pooled = process.env.POSTGRES_URL;

  const inOrder = (val: string | undefined, source: ConnectionSource) =>
    val && val.trim().length > 0 ? { url: val, source } : null;

  if (onVercel) {
    return (
      inOrder(nonPooling, "POSTGRES_URL_NON_POOLING") ??
      inOrder(pooled, "POSTGRES_URL") ??
      inOrder(db, "DATABASE_URL") ??
      { url: LOCAL_DEFAULT, source: "local-default" }
    );
  }
  return (
    inOrder(db, "DATABASE_URL") ??
    inOrder(nonPooling, "POSTGRES_URL_NON_POOLING") ??
    inOrder(pooled, "POSTGRES_URL") ??
    { url: LOCAL_DEFAULT, source: "local-default" }
  );
}

/** True when the resolved target is a local address that won't use SSL. */
function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).host.replace(/:\d+$/, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Full `pg` Pool config. Adds TLS for any non-local target (Supabase's Postgres
 * enforces SSL) while leaving local dev connections plain. Safe to call at
 * module load — reads only env vars.
 */
export function connectionConfig(): PoolConfig {
  const { url } = resolveConnectionString();
  return {
    connectionString: url,
    ...(isLocalHost(url) ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

/**
 * Human-readable target for log lines — host + database only, never the
 * embedded credentials. Safe to print.
 */
export function connectionTarget(): string {
  try {
    const u = new URL(resolveConnectionString().url);
    return `${u.host}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable connection string)";
  }
}
