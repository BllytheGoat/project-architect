import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import {
  loadOwnedProject,
  getProjectState,
  NotFoundError,
} from "@/lib/services/project-service";
import { computeReadiness } from "@/lib/readiness/readiness";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({
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

  const counts = {
    features: state.features.filter((f) => f.status === "confirmed").length,
    requirements: state.requirements.length,
    decisions: state.decisions.length,
    assumptions: state.assumptions.filter((a) => a.status === "pending").length,
  };

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="truncate font-display text-sm font-semibold">{state.project.name || row.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">Readiness {Math.round(readiness.percent)}%</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {state.project.name || row.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          {state.project.description || row.description}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Metric label="Core features" value={String(counts.features)} />
          <Metric label="Requirements" value={String(counts.requirements)} />
          <Metric label="Decisions recorded" value={String(counts.decisions)} />
          <Metric label="Assumptions pending" value={String(counts.assumptions)} />
        </div>

        {readiness.criticalMissing.length > 0 && (
          <div className="mt-8 rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium">Still to clarify</p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {readiness.criticalMissing.slice(0, 5).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/projects/${projectId}/interview`}
            className={buttonVariants({ variant: "default", className: "h-11" })}
          >
            {readiness.canComplete ? "Continue interview" : "Resume interview"}
          </Link>
          <Link
            href={`/projects/${projectId}/planning`}
            className={buttonVariants({ variant: "secondary", className: "h-11" })}
          >
            Open plan workspace
          </Link>
          <Link
            href={`/projects/${projectId}/review`}
            className={buttonVariants({ variant: "outline", className: "h-11" })}
          >
            Review project
          </Link>
          <Link
            href={`/projects/${projectId}/export`}
            className={buttonVariants({ variant: "ghost", className: "h-11" })}
          >
            Export PROJECT.md
          </Link>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
