import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import {
  loadOwnedProject,
  getProjectState,
  NotFoundError,
} from "@/lib/services/project-service";
import { computeReadiness } from "@/lib/readiness/readiness";
import { ReviewPanel } from "@/components/review/review-panel";

export const metadata: Metadata = { title: "Review project" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({
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
  const readiness = computeReadiness(state);

  return (
    <ReviewPanel
      projectId={projectId}
      initial={{
        name: row.name,
        description: row.description,
        state,
        readiness,
      }}
    />
  );
}
