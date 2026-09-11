import { NextResponse } from "next/server";
import { mapPlanError, projectFromCtx, type Ctx } from "@/lib/api-route";
import { getAuditLog } from "@/lib/services/planning";

/** GET /api/projects/:id/audit — lightweight audit trail (§50). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const projectId = await projectFromCtx(ctx);
    const events = await getAuditLog(projectId);
    return NextResponse.json({ events });
  } catch (e) {
    return mapPlanError(e);
  }
}
