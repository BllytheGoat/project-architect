import { NextResponse } from "next/server";
import { mapPlanError, projectFromCtx, type Ctx } from "@/lib/api-route";
import { generateFullPlan, getPlanVersions } from "@/lib/services/planning";

/**
 * POST /api/projects/:id/export — generate all documents + ZIP + integrity.
 * Body: { reason?: string }.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const body = (await req.json().catch(() => ({}))) ?? {};
    const reason = typeof body.reason === "string" ? body.reason : "Export plan";
    const plan = await generateFullPlan(projectId, reason);
    return NextResponse.json({
      planVersion: plan.planVersion,
      readinessPercent: plan.readiness.percent,
      readiness: plan.readiness,
      buildReady: plan.buildReady,
      quality: plan.quality,
      integrity: plan.integrity,
      docOrder: plan.docOrder,
      docs: plan.docs,
      state: plan.state,
    });
  } catch (e) {
    return mapPlanError(e);
  }
}

/** GET /api/projects/:id/export — the raw ZIP download. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const plan = await generateFullPlan(projectId, "ZIP export");
    const filename = `project-${projectId.slice(0, 8)}-v${plan.planVersion}.zip`;
    const body = new Uint8Array(plan.zip.buffer, plan.zip.byteOffset, plan.zip.byteLength);
    const res = new NextResponse(body as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(plan.zip.length),
      },
    });
    return res;
  } catch (e) {
    return mapPlanError(e);
  }
}
