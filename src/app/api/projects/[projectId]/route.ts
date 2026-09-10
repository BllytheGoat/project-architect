import { NextResponse } from "next/server";
import {
  getProjectState,
  renameProject,
  deleteProject,
  loadOwnedProject,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/services/project-service";
import { computeReadiness } from "@/lib/readiness/readiness";
import { renameProjectPayloadSchema } from "@/lib/validation/schemas";

function map(e: unknown) {
  if (e instanceof UnauthenticatedError)
    return NextResponse.json({ error: { message: "Sign in to continue.", code: "unauthorized" } }, { status: 401 });
  if (e instanceof ForbiddenError)
    return NextResponse.json({ error: { message: e.message, code: "forbidden" } }, { status: 403 });
  if (e instanceof NotFoundError)
    return NextResponse.json({ error: { message: e.message, code: "not_found" } }, { status: 404 });
  return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Server error.", code: "internal" } }, { status: 500 });
}

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    const row = await loadOwnedProject(projectId);
    const state = await getProjectState(projectId);
    const readiness = computeReadiness(state);
    return NextResponse.json({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      readinessPercent: readiness.percent,
      state,
    });
  } catch (e) {
    return map(e);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    const body = await request.json();
    const parsed = renameProjectPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { message: "Project name is required.", code: "validation" } }, { status: 400 });
    }
    await renameProject(projectId, parsed.data.name);
    return NextResponse.json({ ok: true, name: parsed.data.name });
  } catch (e) {
    return map(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { projectId } = await ctx.params;
    await deleteProject(projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return map(e);
  }
}
