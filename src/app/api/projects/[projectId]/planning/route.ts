import { NextResponse } from "next/server";
import { mapPlanError, projectFromCtx, type Ctx } from "@/lib/api-route";
import {
  generateSection,
  summarizePlan,
  applyManualUpdate,
} from "@/lib/services/planning";

type Body = { section?: string };

/**
 * POST /api/projects/:id/planning — run the deterministic planners for a
 * section (or all) and persist. Body: { section?: "requirements" | "database" | ... }.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const body: Body = (await req.json().catch(() => ({}))) ?? {};
    const summary = await generateSection(projectId, body.section);
    return NextResponse.json({
      readinessPercent: summary.readiness.percent,
      readiness: summary.readiness,
      buildReady: summary.buildReady,
      quality: summary.quality,
      criticalOpenConflicts: summary.criticalOpenConflicts,
      state: summary.state,
    });
  } catch (e) {
    return mapPlanError(e);
  }
}

/** GET /api/projects/:id/planning — read-only plan summary (no mutation). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const summary = await summarizePlan(projectId);
    return NextResponse.json({
      readinessPercent: summary.readiness.percent,
      readiness: summary.readiness,
      buildReady: summary.buildReady,
      quality: summary.quality,
      criticalOpenConflicts: summary.criticalOpenConflicts,
      state: summary.state,
    });
  } catch (e) {
    return mapPlanError(e);
  }
}

/**
 * PATCH /api/projects/:id/planning — manual editing (§49). Body: a single
 * validated StateUpdate op. Runs through the same Zod pipeline as AI
 * mutations, recalculates readiness, records an audit event. 400 if invalid.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const body = (await req.json().catch(() => ({}))) ?? {};
    const summary = await applyManualUpdate(projectId, body);
    return NextResponse.json({
      ok: true,
      readinessPercent: summary.readiness.percent,
      buildReady: summary.buildReady,
      quality: summary.quality,
      criticalOpenConflicts: summary.criticalOpenConflicts,
      state: summary.state,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid update:")) {
      return NextResponse.json(
        { error: { message: e.message.replace("Invalid update: ", ""), code: "validation" } },
        { status: 400 },
      );
    }
    return mapPlanError(e);
  }
}
