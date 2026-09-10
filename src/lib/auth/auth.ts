// Credential auth: scrypt password hashing + opaque hashed session tokens in
// an httpOnly cookie. Raw tokens are NEVER stored — only their SHA-256 hash.
// All authorization happens in the service layer, not the client.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pa_session";
const SESSION_DAYS = 30;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(derived, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function sessionHash(token: string): string {
  return sha256Hex(token);
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_DAYS * 86_400) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const sessionCookieOptions = () => sessionCookie("");
