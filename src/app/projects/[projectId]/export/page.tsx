import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { loadOwnedProject, getProjectState, NotFoundError } from "@/lib/services/project-service";
import { renderProjectMarkdown } from "@/lib/export/markdown";
import { ExportPanel } from "@/components/export/export-panel";

export const metadata: Metadata = { title: "Export" };
export const dynamic = "force-dynamic";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let row;
  let state;
  try {
    row = await loadOwnedProject(projectId, user);
    state = await getProjectState(projectId, user);
  } catch (e) {
    if (e instanceof NotFoundError) redirect("/dashboard");
    throw e;
  }
  const { markdown } = renderProjectMarkdown(state);

  return (
    <ExportPanel
      projectId={projectId}
      initial={{
        name: row.name,
        markdown,
        version: state.version,
      }}
    />
  );
}
