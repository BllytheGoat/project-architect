// Export service: render PROJECT.md deterministically from state, store a
// versioned copy, and provide download/copy payloads. No LLM in the loop.
import { withClient, query } from "@/lib/db/client";
import { getProjectState, loadOwnedProject, requireUser } from "@/lib/services/project-service";
import { renderProjectMarkdown } from "@/lib/export/markdown";
import { computeReadiness } from "@/lib/readiness/readiness";

export interface ExportPayload {
  markdown: string;
  version: number;
  readinessPercent: number;
}

export async function generatePlan(projectId: string): Promise<ExportPayload> {
  const user = await requireUser();
  await loadOwnedProject(projectId, user);
  const state = await getProjectState(projectId, user);

  const { markdown } = renderProjectMarkdown(state);
  const readiness = computeReadiness(state);

  // Version it: newest plan version = max existing + 1.
  await withClient(async (c) => {
    const max = await c.query<{ max_v: string | null }>(
      "SELECT MAX(version) AS max_v FROM project_plans WHERE project_id = $1",
      [projectId],
    );
    const nextVersion = (parseInt(max.rows[0]?.max_v ?? "0", 10) || 0) + 1;
    await c.query(
      "INSERT INTO project_plans (project_id, version, markdown) VALUES ($1, $2, $3)",
      [projectId, nextVersion, markdown],
    );
  });

  return {
    markdown,
    version: state.version,
    readinessPercent: readiness.percent,
  };
}

export async function latestPlan(projectId: string): Promise<string | null> {
  await loadOwnedProject(projectId);
  const res = await query<{ markdown: string }>(
    "SELECT markdown FROM project_plans WHERE project_id = $1 ORDER BY version DESC LIMIT 1",
    [projectId],
  );
  return res.rows[0]?.markdown ?? null;
}
