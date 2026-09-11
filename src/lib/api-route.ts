// Shared error mapper for Phase 2 route handlers. Reuses Phase 1's ownership
// errors and adds the conversational-editing confirmation error. Every Phase 2
// route goes through loadOwnedProject / requireUser first, so a client-supplied
// project id is never trusted (§53).

import { NextResponse } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/services/project-service";
import { ConfirmationRequiredError } from "@/lib/services/conversational";

export type Ctx = { params: Promise<{ projectId: string }> };

export async function projectFromCtx(ctx: Ctx): Promise<string> {
  const { projectId } = await ctx.params;
  return projectId;
}

export function mapPlanError(e: unknown) {
  if (e instanceof UnauthenticatedError)
    return NextResponse.json({ error: { message: "Sign in to continue.", code: "unauthorized" } }, { status: 401 });
  if (e instanceof ForbiddenError)
    return NextResponse.json({ error: { message: e.message, code: "forbidden" } }, { status: 403 });
  if (e instanceof NotFoundError)
    return NextResponse.json({ error: { message: "Project not found.", code: "not_found" } }, { status: 404 });
  if (e instanceof ConfirmationRequiredError)
    return NextResponse.json(
      {
        error: {
          message: "High-impact change: confirm before applying.",
          code: "confirmation_required",
          report: e.report,
        },
      },
      { status: 409 },
    );
  return NextResponse.json(
    { error: { message: e instanceof Error ? e.message : "Server error.", code: "internal" } },
    { status: 500 },
  );
}
