import { NextResponse } from "next/server";
import { logIn } from "@/lib/auth/service";
import { sessionCookie } from "@/lib/auth/auth";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON.", code: "validation" } }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: { message: "Email and password are required.", code: "validation" } },
      { status: 400 },
    );
  }
  try {
    const { user, token } = await logIn({ email: body.email, password: body.password });
    const res = NextResponse.json({ user });
    res.cookies.set(sessionCookie(token));
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Sign in failed.", code: "invalid_credentials" } },
      { status: 401 },
    );
  }
}
