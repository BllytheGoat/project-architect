import { NextResponse } from "next/server";
import { mapPlanError, projectFromCtx, type Ctx } from "@/lib/api-route";
import { proposeChange, applyChange, ConfirmationRequiredError } from "@/lib/services/conversational";

/**
 * POST /api/projects/:id/changes — propose/apply a conversational change (§22).
 * Body: { change: string, apply?: boolean, force?: boolean }.
 *
 * - apply omitted  -> returns the impact report only (no mutation).
 * - apply=true, low impact -> applies and returns the new readiness/version.
 * - apply=true, high impact without force=true -> 409 (confirm required).
 * - force=true -> applies regardless of impact level.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const body = (await req.json().catch(() => ({}))) ?? {};
    const change = typeof body.change === "string" ? body.change.trim() : "";
    if (!change) {
      return NextResponse.json({ error: { message: "A change description is required.", code: "validation" } }, { status: 400 });
    }

    const pending = await proposeChange(projectId, change);
    const wantsApply = Boolean(body.apply);
    const force = Boolean(body.force);

    if (!wantsApply) {
      return NextResponse.json({
        pending: true,
        requiresConfirmation: pending.report.requiresConfirmation,
        report: pending.report,
      });
    }

    if (pending.report.requiresConfirmation && !force) {
      return NextResponse.json(
        {
          error: {
            message: "High-impact change: confirm before applying.",
            code: "confirmation_required",
            report: pending.report,
          },
        },
        { status: 409 },
      );
    }

    const applied = await applyChange(projectId, change, undefined, force);
    return NextResponse.json({
      pending: false,
      applied: true,
      report: applied.report,
      planVersion: applied.planVersion,
      readinessPercent: applied.readiness.percent,
      buildReady: applied.readiness.buildReady,
    });
  } catch (e) {
    return mapPlanError(e);
  }
}

