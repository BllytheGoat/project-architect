import { NextResponse } from "next/server";
import { signUp } from "@/lib/auth/service";
import { sessionCookie } from "@/lib/auth/auth";

export async function POST(request: Request) {
  let body: { email?: string; password?: string; name?: string };
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
    const { user, token } = await signUp({ email: body.email, password: body.password, name: body.name });
    const res = NextResponse.json({ user });
    res.cookies.set(sessionCookie(token));
    return res;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const status = code === "already_exists" ? 409 : 400;
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Sign up failed.", code: code ?? "internal" } },
      { status },
    );
  }
}
