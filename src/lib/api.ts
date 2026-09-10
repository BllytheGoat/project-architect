// Helpers for route handlers: auth guard + consistent JSON error shapes.
import { NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "@/lib/auth/service";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "provider_failure"
  | "internal";

export function apiError(message: string, code: ApiErrorCode, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw Object.assign(new Error("Not authenticated"), { code: "unauthorized" });
  }
  return user;
}

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again.") {
  if (e && typeof e === "object" && "message" in e && "code" in e) {
    return e as { message: string; code: string };
  }
  return { message: fallback, code: "internal" };
}

export const CODE_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  provider_failure: 502,
  internal: 500,
};
