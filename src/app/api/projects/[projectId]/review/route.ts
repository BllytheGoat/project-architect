import { NextResponse } from "next/server";
import { mapPlanError, projectFromCtx, type Ctx } from "@/lib/api-route";
import { summarizePlan } from "@/lib/services/planning";

/**
 * POST /api/projects/:id/review — run the deterministic plan-quality review
 * (§35). Read-only: it scores the current plan but does not persist.
 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const summary = await summarizePlan(projectId);
    return NextResponse.json({
      quality: summary.quality,
      readinessPercent: summary.readiness.percent,
      buildReady: summary.buildReady,
      criticalOpenConflicts: summary.criticalOpenConflicts,
      readiness: summary.readiness,
    });
  } catch (e) {
    return mapPlanError(e);
  }
}

/** GET /api/projects/:id/review — same, via GET for the UI screen. */
export async function GET(_req: Request, ctx: Ctx) {
  return POST(_req, ctx);
}
