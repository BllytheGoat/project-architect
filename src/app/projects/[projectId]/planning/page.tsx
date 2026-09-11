import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import {
  loadOwnedProject,
  NotFoundError,
} from "@/lib/services/project-service";
import {
  summarizePlan,
  getPlanVersions,
  getAuditLog,
} from "@/lib/services/planning";
import { PlanningWorkspace } from "@/components/planning/workspace";

export const metadata: Metadata = { title: "Plan workspace" };
export const dynamic = "force-dynamic";

export default async function PlanningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let row;
  try {
    row = await loadOwnedProject(projectId, user);
  } catch (e) {
    if (e instanceof NotFoundError) redirect("/dashboard");
    throw e;
  }

  // Summarize (read-only) plus version/audit history for the initial render.
  const summary = await summarizePlan(projectId, user);
  const [versions, events] = await Promise.all([
    getPlanVersions(projectId, user),
    getAuditLog(projectId, user),
  ]);

  return (
    <PlanningWorkspace
      projectId={projectId}
      initial={{
        state: summary.state,
        readiness: summary.readiness,
        quality: summary.quality,
        criticalOpenConflicts: summary.criticalOpenConflicts,
        buildReady: summary.buildReady,
        name: row.name,
        versions,
        events,
      }}
    />
  );
}
