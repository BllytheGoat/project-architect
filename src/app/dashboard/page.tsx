import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/service";
import { listProjects, type ProjectRow } from "@/lib/services/project-service";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProjectCard } from "@/components/dashboard/project-card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await listProjects(user);

  return (
    <div className="min-h-full bg-background">
      {/* app bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="relative inline-block h-5 w-5">
              <span className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-primary" />
              <span className="absolute top-1/2 left-0 h-px w-5 -translate-y-1/2 bg-primary" />
              <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">Project Architect</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Your projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick one up, or start a new idea.
            </p>
          </div>
          <Link href="/new" className="shrink-0">
            <Button>
              New project
            </Button>
          </Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {rows.map((r) => (
              <ProjectCard key={r.id} project={toCard(r)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function toCard(r: ProjectRow) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    readiness: r.readiness_score,
    updated: new Date(r.updated_at).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  };
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <p className="font-display text-lg font-semibold">No projects yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Start with one rough idea — even a single sentence is enough to get the
        interview going.
      </p>
      <Link href="/new" className="mt-5 inline-block">
        <Button variant="secondary">Describe your first idea</Button>
      </Link>
    </div>
  );
}
