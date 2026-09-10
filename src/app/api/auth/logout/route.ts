import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logOut } from "@/lib/auth/service";
import { SESSION_COOKIE } from "@/lib/auth/auth";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await logOut(token);
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
