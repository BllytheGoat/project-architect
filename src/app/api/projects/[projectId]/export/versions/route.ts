import { NextResponse } from "next/server";
import { mapPlanError, projectFromCtx, type Ctx } from "@/lib/api-route";
import { getPlanVersions } from "@/lib/services/planning";

/** GET /api/projects/:id/export/versions — plan version history (§39). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const versions = await getPlanVersions(projectId);
    return NextResponse.json({ versions });
  } catch (e) {
    return mapPlanError(e);
  }
}
