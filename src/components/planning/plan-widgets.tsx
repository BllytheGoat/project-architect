"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/types";
import type { Readiness2 } from "@/lib/readiness/readiness2";
import type { PlanQuality } from "@/lib/planner/quality";
import type { IntegrityResult } from "@/lib/export/integrity";

// ---- shared atoms --------------------------------------------------------

/** Stable ref (FR-001, COMP-002, ...) in mono — data, not decoration. */
export function RefChip({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "destructive";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
        tone === "accent" && "bg-accent text-accent-foreground",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, "accent" | "muted" | "destructive"> = {
    confirmed: "accent",
    addressed: "accent",
    met: "accent",
    accepted: "accent",
    proposed: "muted",
    pending: "muted",
    open: "muted",
    active: "accent",
    required: "muted",
    accepted_risk: "muted",
    rejected: "destructive",
    violated: "destructive",
    superseded: "destructive",
  };
  return <RefChip tone={tone[status] ?? "muted"}>{status.replace(/_/g, " ")}</RefChip>;
}

export function SeverityDot({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    critical: "bg-destructive",
    high: "bg-[#e07b39]",
    medium: "bg-[#e0a539]",
    low: "bg-muted-foreground/40",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", cls[severity] ?? "bg-muted-foreground/40")} />
      {severity}
    </span>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm leading-6">{children}</dd>
    </div>
  );
}

// ---- section scaffolding -------------------------------------------------

export function SectionHeader({
  title,
  count,
  note,
  action,
}: {
  title: string;
  count?: number | null;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {typeof count === "number" && (
            <Badge variant="secondary" className="font-mono text-[11px]">
              {count}
            </Badge>
          )}
        </div>
        {note && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{note}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-6">
      <p className="font-display text-sm font-semibold">{title}</p>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---- the gate (the one bold element) ------------------------------------

export function GatePanel({
  readiness,
  quality,
  criticalOpenConflicts,
  buildReady,
}: {
  readiness: Readiness2;
  quality: PlanQuality;
  criticalOpenConflicts: number;
  buildReady: boolean;
}) {
  return (
    <Card className="bg-card">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <ReadinessRing percent={readiness.percent} ready={buildReady} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-display text-sm font-semibold">
                {buildReady ? "Build ready" : "Not build ready yet"}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {quality.score}/100 plan quality
            </p>
            {criticalOpenConflicts > 0 ? (
              <p className="mt-1 text-xs text-destructive">{criticalOpenConflicts} critical conflict{criticalOpenConflicts === 1 ? "" : "s"} open</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No critical conflicts open</p>
            )}
          </div>
        </div>

        {readiness.buildReadyBlockers.length > 0 && (
          <>
            <Separator className="my-4" />
            <div>
              <p className="text-xs text-muted-foreground">Blocking build readiness</p>
              <ul className="mt-2 space-y-1.5">
                {readiness.buildReadyBlockers.map((b) => (
                  <li key={b} className="flex gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Separator className="my-4" />
        <div>
          <p className="text-xs text-muted-foreground">By section</p>
          <div className="mt-2 space-y-2">
            {readiness.categories.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(c.score * 100)}%</span>
                </div>
                <Progress value={Math.round(c.score * 100)} className="mt-1 h-1.5 w-full rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function QualityCard({ quality }: { quality: PlanQuality }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Plan review</h3>
          <span className={cn("font-display text-lg font-bold tabular-nums", quality.acceptable ? "text-foreground" : "text-muted-foreground")}>
            {quality.score}
            <span className="text-xs font-normal text-muted-foreground">/100</span>
          </span>
        </div>
        {quality.strengths.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {quality.strengths.slice(0, 4).map((s) => (
              <li key={s} className="flex gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
        {quality.warnings.length > 0 && (
          <>
            <Separator className="my-3" />
            <ul className="space-y-1.5">
              {quality.warnings.slice(0, 4).map((w) => (
                <li key={w} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-destructive">!</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function IntegrityCard({ integrity }: { integrity: IntegrityResult }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Export integrity</h3>
          <StatusBadge status={integrity.ok ? "met" : "open"} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {integrity.counts.docs} documents · {integrity.counts.requirements} requirements · {integrity.counts.conflictsOpen} open conflicts
        </p>
        {!integrity.ok && (
          <ul className="mt-3 space-y-1.5">
            {integrity.problems.slice(0, 6).map((p) => (
              <li key={p} className="flex gap-2 text-sm text-destructive">
                <span>!</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---- version / audit lists ----------------------------------------------

export function VersionList({
  versions,
}: {
  versions: { version: number; reason: string; state_version: number; doc_count: number; created_at: string }[];
}) {
  if (!versions.length)
    return <EmptyState title="No plan versions yet" body="Generate a full plan to cut the first version. Versions track the reason and document count for a full audit trail." />;
  return (
    <div className="divide-y divide-border">
      {versions.map((v) => (
        <div key={v.version} className="flex items-center gap-3 py-3">
          <RefChip tone="accent">v{v.version}</RefChip>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{v.reason}</p>
            <p className="text-xs text-muted-foreground">
              {v.doc_count} docs · state v{v.state_version} · {new Date(v.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuditList({
  events,
}: {
  events: { id: number; actor: string; action: string; summary: string; version: number; created_at: string }[];
}) {
  if (!events.length)
    return <EmptyState title="No audit events yet" body="State changes are recorded here as you generate, edit, or export the plan." />;
  return (
    <div className="divide-y divide-border">
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-3 py-3">
          <div className="w-16 shrink-0 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <RefChip>{e.action}</RefChip> <span className="ml-1">{e.summary}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {e.actor} · v{e.version}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- helpers -------------------------------------------------------------

export function ReadinessRing({ percent, ready }: { percent: number; ready: boolean }) {
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
          className={ready ? "stroke-primary" : "stroke-primary/60"}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-xl font-bold tabular-nums">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

/** Counts a state's major sections, for the overview + gate context. */
export function sectionCounts(state: ProjectState) {
  return {
    requirements: state.requirements.length,
    features: state.features.length,
    stories: state.userStories.length,
    dependencies: state.dependencies.length,
    architecture: state.architectureComponents.length,
    database: state.database.length,
    api: state.api.length,
    pages: state.pages.length,
    flows: state.userFlows.length,
    security: state.securityItems.length,
    testing: state.testCases.length,
    implementation: state.implementationPhases.length,
    decisions: state.decisions.length,
    assumptions: state.assumptions.length,
  };
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
}

export { Link, buttonVariants, Separator };
