import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { loadOwnedProject, NotFoundError } from "@/lib/services/project-service";
import { InterviewWorkspace } from "@/components/interview/interview-workspace";
import Link from "next/link";

export const metadata: Metadata = { title: "Project interview" };
export const dynamic = "force-dynamic";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const row = await loadOwnedProject(projectId, user);
    return <InterviewWorkspace projectId={projectId} initial={{ name: row.name, description: row.description }} />;
  } catch (e) {
    if (e instanceof NotFoundError) redirect("/dashboard");
    throw e;
  }
}
