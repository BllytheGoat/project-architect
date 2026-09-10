import { NextResponse } from "next/server";
import { loadOwnedProject, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/services/project-service";
import { submitAnswer, type AnswerPayload } from "@/lib/services/interview";
import { apiAnswerPayloadSchema } from "@/lib/validation/schemas";

function mapError(e: unknown) {
  if (e instanceof UnauthenticatedError)
    return NextResponse.json({ error: { message: "Sign in to continue.", code: "unauthorized" } }, { status: 401 });
  if (e instanceof ForbiddenError)
    return NextResponse.json({ error: { message: e.message, code: "forbidden" } }, { status: 403 });
  if (e instanceof NotFoundError)
    return NextResponse.json({ error: { message: e.message, code: "not_found" } }, { status: 404 });
  if (e instanceof Error && e.name === "AIProviderError")
    return NextResponse.json({ error: { message: "The AI is unavailable. Your answer is saved — try again.", code: "provider_failure" } }, { status: 502 });
  return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Server error.", code: "internal" } }, { status: 500 });
}

type Ctx = { params: Promise<{ projectId: string }> };

/** POST /api/projects/:id/interview/answer — submit an answer. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    await loadOwnedProject(projectId);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: { message: "Invalid answer payload.", code: "validation" } }, { status: 400 });
    }
    const parsed = apiAnswerPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ error: { message: issues, code: "validation" } }, { status: 400 });
    }
    const body = parsed.data as AnswerPayload;
    const turn = await submitAnswer(projectId, body);
    return NextResponse.json({
      nextQuestion: turn.nextQuestion,
      readiness: turn.readiness,
      canComplete: turn.canComplete,
      recommendation: turn.recommendation ?? null,
    });
  } catch (e) {
    return mapError(e);
  }
}
