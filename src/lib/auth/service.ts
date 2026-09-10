// Auth service: sign up, log in, log out, current user. Talks to Postgres.
// Cookie-agnostic by design: signUp/logIn RETURN the raw session token and the
// route handler sets the httpOnly cookie. getCurrentUser/logOut accept the
// token from the request. This keeps the service testable (no next/headers).
import { cookies } from "next/headers";
import { query } from "@/lib/db/client";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  sessionHash,
  SESSION_COOKIE,
} from "./auth";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResult {
  user: AuthUser;
  /** Raw opaque session token. Route sets it in the httpOnly cookie. */
  token: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_credentials" | "already_exists" | "not_authenticated" = "invalid_credentials",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const SESSION_TTL_MS = 30 * 86_400_000;

export async function signUp(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("Enter a valid email address.", "invalid_credentials");
  }
  if (input.password.length < 8) {
    throw new AuthError("Password must be at least 8 characters.", "invalid_credentials");
  }
  const passwordHash = await hashPassword(input.password);

  const existing = await query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    throw new AuthError("An account with this email already exists.", "already_exists");
  }

  const res = await query<{ id: string; name: string }>(
    "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, name",
    [email, passwordHash, (input.name ?? "").trim()],
  );
  const user: AuthUser = { id: res.rows[0].id, email, name: res.rows[0].name };
  const token = newSessionToken();
  await createSession(user.id, token);
  return { user, token };
}

export async function logIn(input: { email: string; password: string }): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const res = await query<{ id: string; email: string; name: string; password_hash: string }>(
    "SELECT id, email, name, password_hash FROM users WHERE email = $1",
    [email],
  );
  const row = res.rows[0];
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    throw new AuthError("Email or password is incorrect.", "invalid_credentials");
  }
  const token = newSessionToken();
  await createSession(row.id, token);
  return { user: { id: row.id, email: row.email, name: row.name }, token };
}

async function createSession(userId: string, token: string) {
  await query(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [token, userId, sessionHash(token), new Date(Date.now() + SESSION_TTL_MS).toISOString()],
  );
}

export async function logOut(token: string | undefined | null) {
  if (token) {
    await query("DELETE FROM sessions WHERE id = $1", [token]);
  }
  // Return the cookie name so the route can clear it.
  return SESSION_COOKIE;
}

/** Current authenticated user from the request cookie, or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return userForToken(token);
}

/**
 * Read the current user from a raw session token (route handlers), or fall
 * back to the request cookie when no token is passed.
 */
export async function userForToken(token: string | undefined | null): Promise<AuthUser | null> {
  const effective = token ?? ((await cookies()).get(SESSION_COOKIE)?.value);
  if (!effective) return null;
  const sess = await query<{ user_id: string; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE id = $1",
    [effective],
  );
  const row = sess.rows[0];
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  const user = await query<{ id: string; email: string; name: string }>(
    "SELECT id, email, name FROM users WHERE id = $1",
    [row.user_id],
  );
  const u = user.rows[0];
  return u ? { id: u.id, email: u.email, name: u.name } : null;
}
