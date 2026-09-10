import { NextResponse } from "next/server";
import { loadOwnedProject, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/services/project-service";
import { generatePlan, latestPlan } from "@/lib/services/export";

function mapError(e: unknown) {
  if (e instanceof UnauthenticatedError)
    return NextResponse.json({ error: { message: "Sign in to continue.", code: "unauthorized" } }, { status: 401 });
  if (e instanceof ForbiddenError)
    return NextResponse.json({ error: { message: e.message, code: "forbidden" } }, { status: 403 });
  if (e instanceof NotFoundError)
    return NextResponse.json({ error: { message: e.message, code: "not_found" } }, { status: 404 });
  return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Server error.", code: "internal" } }, { status: 500 });
}

type Ctx = { params: Promise<{ projectId: string }> };

/** POST /api/projects/:id/plan — generate a new PROJECT.md. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    await loadOwnedProject(projectId);
    const payload = await generatePlan(projectId);
    return NextResponse.json(payload);
  } catch (e) {
    return mapError(e);
  }
}

/** GET /api/projects/:id/plan — return the latest generated markdown (or null). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    const markdown = await latestPlan(projectId);
    if (markdown === null) {
      return NextResponse.json({ markdown: null, message: "No plan generated yet." }, { status: 404 });
    }
    return NextResponse.json({ markdown });
  } catch (e) {
    return mapError(e);
  }
}
