"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ProjectState } from "@/types";
import type { ReadinessResult, ReadinessCategory } from "@/lib/readiness/readiness";

type Initial = {
  name: string;
  description: string;
  state: ProjectState;
  readiness: ReadinessResult;
};

export function ReviewPanel({ projectId, initial }: { projectId: string; initial: Initial }) {
  const { state, readiness } = initial;

  // Map category keys to the short labels used in the review checklist.
  const checklist: { key: string; label: string; category?: ReadinessCategory }[] = [
    { key: "project", label: "Core idea" },
    { key: "users", label: "Users" },
    { key: "features", label: "Features" },
    { key: "requirements", label: "Requirements" },
    { key: "ux", label: "Workflows" },
    { key: "architecture", label: "Architecture" },
    { key: "security", label: "Security" },
  ];
  for (const item of checklist) {
    item.category = readiness.categories.find((c) => c.key === item.key);
  }

  const pendingAssumptions = state.assumptions.filter((a) => a.status === "pending");
  const openConflicts = state.conflicts.filter((c) => c.status === "open");

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="truncate font-display text-sm font-semibold">{state.project.name || initial.name}</span>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
        {/* header: readiness + CTA */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Project review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Check the essentials, then export your specification.
            </p>
          </div>
          <ReadinessRing percent={readiness.percent} />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="space-y-6">
            {/* checklist */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2.5">
                    {checklist.map((item) => {
                      const ok = item.category?.satisfied ?? false;
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <CheckDot ok={ok} />
                          <span className={ok ? "text-foreground" : "text-muted-foreground"}>
                            {item.label}
                          </span>
                          {!ok && item.category && item.category.missing.length > 0 && (
                            <span className="ml-auto truncate text-xs text-muted-foreground">
                              {item.category.missing[0]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="my-5" />

                {/* assumptions */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Assumptions</span>
                    {pendingAssumptions.length > 0 ? (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        {pendingAssumptions.length} pending
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">none pending</span>
                    )}
                  </div>
                  {pendingAssumptions.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {pendingAssumptions.slice(0, 5).map((a) => (
                        <li key={a.id} className="rounded-lg bg-muted p-3 text-sm">
                          <span className="font-mono text-xs text-primary">{a.id}</span>
                          <p className="mt-1 leading-6">{a.statement}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {openConflicts.length > 0 && (
                  <>
                    <Separator className="my-5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Conflicts to resolve</span>
                        <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                          {openConflicts.length}
                        </Badge>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {openConflicts.slice(0, 4).map((c) => (
                          <li key={c.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                            <p className="text-muted-foreground">{c.earlierTopic} vs {c.laterTopic}</p>
                            <p className="mt-1">{c.laterValue}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* key facts recap */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-medium">What we know</h3>
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Recap label="Problem" value={state.project.problem} />
                  <Recap label="Goal" value={state.project.goals[0]} />
                  <Recap label="For" value={state.project.targetUsers.join(", ")} />
                  <Recap
                    label="Core features"
                    value={state.features
                      .filter((f) => f.status === "confirmed")
                      .map((f) => f.name)
                      .join(", ")}
                  />
                  <Recap label="Storage" value={state.architecture.database} />
                  <Recap label="Auth" value={state.architecture.auth} />
                </dl>
              </CardContent>
            </Card>

            {/* CTA */}
            <div className="flex flex-wrap gap-3">
              <Link href={`/projects/${projectId}/planning`} className={buttonVariants({ variant: "default", className: "h-11" })}>
                Open plan workspace
              </Link>
              <Link href={`/projects/${projectId}/export`} className={buttonVariants({ variant: "secondary", className: "h-11" })}>
                Generate PROJECT.md
              </Link>
              <Link href={`/projects/${projectId}/interview`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
                Back to interview
              </Link>
            </div>
          </div>

          {/* sidebar: category detail */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-medium">By section</h3>
                <div className="mt-3 space-y-2.5">
                  {readiness.categories.map((c) => (
                    <div key={c.key}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span className="tabular-nums text-muted-foreground">{Math.round(c.score * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(c.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function CheckDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full " +
        (ok ? "bg-primary/15 text-primary" : "border border-border text-transparent")
      }
    >
      {ok ? "✓" : "·"}
    </span>
  );
}

function Recap({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm" title={value}>
        {value || "Not specified"}
      </dd>
    </div>
  );
}

function ReadinessRing({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-bold tabular-nums">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}
