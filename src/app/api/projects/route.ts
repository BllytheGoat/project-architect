import { NextResponse } from "next/server";
import {
  listProjects,
  createProject,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/lib/services/project-service";
import { requireUser } from "@/lib/services/project-service";
import { createProjectPayloadSchema } from "@/lib/validation/schemas";

const map = (e: unknown) => {
  if (e instanceof UnauthenticatedError) return NextResponse.json({ error: { message: "Sign in to continue.", code: "unauthorized" } }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: { message: e.message, code: "forbidden" } }, { status: 403 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: { message: e.message, code: "not_found" } }, { status: 404 });
  return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Server error.", code: "internal" } }, { status: 500 });
};

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await listProjects(user);
    return NextResponse.json({
      projects: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        readinessScore: r.readiness_score,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    return map(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = createProjectPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Describe your idea with at least a few words.", code: "validation" } },
        { status: 400 },
      );
    }
    const row = await createProject(user, parsed.data);
    return NextResponse.json({ id: row.id, name: row.name });
  } catch (e) {
    return map(e);
  }
}
