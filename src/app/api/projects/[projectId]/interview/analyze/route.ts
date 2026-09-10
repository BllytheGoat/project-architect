import { NextResponse } from "next/server";
import {
  loadOwnedProject,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/services/project-service";
import { analyzeIdea } from "@/lib/services/interview";

function mapError(e: unknown) {
  if (e instanceof UnauthenticatedError)
    return NextResponse.json({ error: { message: "Sign in to continue.", code: "unauthorized" } }, { status: 401 });
  if (e instanceof ForbiddenError)
    return NextResponse.json({ error: { message: e.message, code: "forbidden" } }, { status: 403 });
  if (e instanceof NotFoundError)
    return NextResponse.json({ error: { message: e.message, code: "not_found" } }, { status: 404 });
  if (e instanceof Error && e.name === "AIProviderError")
    return NextResponse.json({ error: { message: "The AI is unavailable. Your progress is saved — try again.", code: "provider_failure" } }, { status: 502 });
  return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Server error.", code: "internal" } }, { status: 500 });
}

type Ctx = { params: Promise<{ projectId: string }> };

/** POST /api/projects/:id/interview/analyze — run the idea analyzer. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    await loadOwnedProject(projectId);
    const turn = await analyzeIdea(projectId);
    return NextResponse.json({
      analysis: turn.analysis,
      nextQuestion: turn.nextQuestion,
      readiness: turn.readiness,
      canComplete: turn.canComplete,
    });
  } catch (e) {
    return mapError(e);
  }
}
