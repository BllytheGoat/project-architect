"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, apiPost, ApiClientError } from "@/lib/client/api";
import type { ProjectState } from "@/types";
import type { Readiness2 } from "@/lib/readiness/readiness2";
import type { PlanQuality } from "@/lib/planner/quality";
import type { IntegrityResult } from "@/lib/export/integrity";
import {
  GatePanel,
  QualityCard,
  IntegrityCard,
  VersionList,
  AuditList,
  RefChip,
} from "./plan-widgets";
import { SECTION_RENDERERS, type SectionKey } from "./planning-sections";

// ---- response shapes (mirror the Phase 2 API routes) --------------------
export interface PlanSummaryResponse {
  readinessPercent: number;
  readiness: Readiness2;
  buildReady: boolean;
  quality: PlanQuality;
  criticalOpenConflicts: number;
  state: ProjectState;
}
interface ExportResponse extends PlanSummaryResponse {
  planVersion: number;
  integrity: IntegrityResult;
  docOrder: string[];
  docs: Record<string, string>;
}
interface PlanVersionRow {
  version: number;
  reason: string;
  state_version: number;
  doc_count: number;
  created_at: string;
}
interface AuditRow {
  id: number;
  actor: string;
  action: string;
  summary: string;
  entities: string[];
  version: number;
  created_at: string;
}
interface ImpactReport {
  change: string;
  level: "low" | "medium" | "high";
  areas: { area: string; detail: string }[];
  affectedRefs: string[];
  requiresConfirmation: boolean;
}

const SECTIONS: { key: SectionKey; label: string; generator?: string; desc: string }[] = [
  { key: "requirements", label: "Requirements", generator: "requirements", desc: "Functional & non-functional requirements with acceptance criteria." },
  { key: "features", label: "Features", desc: "What you will build, prioritised and scoped." },
  { key: "user-stories", label: "User stories", generator: "user-stories", desc: "Who benefits, in their words." },
  { key: "decisions", label: "Decisions", desc: "Recorded choices, assumptions, and history." },
  { key: "dependencies", label: "Dependencies", generator: "dependencies", desc: "What blocks what — the build order." },
  { key: "architecture", label: "Architecture", generator: "architecture", desc: "Components, data flow, trust boundaries." },
  { key: "database", label: "Data model", generator: "database", desc: "Entities, fields, keys, ownership." },
  { key: "api", label: "API", generator: "api", desc: "Endpoints, auth, request/response." },
  { key: "pages", label: "Pages & UI", generator: "pages", desc: "Screens, users, actions, states." },
  { key: "flows", label: "User flows", generator: "flows", desc: "Happy paths and failure paths." },
  { key: "security", label: "Security", generator: "security", desc: "Threats, impact, mitigation." },
  { key: "testing", label: "Testing", generator: "testing", desc: "Test kinds for the critical workflows." },
  { key: "implementation", label: "Implementation", generator: "implementation", desc: "Ordered phases and tasks." },
];

export function PlanningWorkspace({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    state: ProjectState;
    readiness: Readiness2;
    quality: PlanQuality;
    criticalOpenConflicts: number;
    buildReady: boolean;
    name: string;
    versions: PlanVersionRow[];
    events: AuditRow[];
  };
}) {
  const [section, setSection] = useState<SectionKey>("requirements");
  const [state, setState] = useState<ProjectState>(initial.state);
  const [readiness, setReadiness] = useState<Readiness2>(initial.readiness);
  const [quality, setQuality] = useState<PlanQuality>(initial.quality);
  const [criticalOpenConflicts, setCriticalOpen] = useState(initial.criticalOpenConflicts);
  const [versions, setVersions] = useState<PlanVersionRow[]>(initial.versions);
  const [events, setEvents] = useState<AuditRow[]>(initial.events);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // conversational change
  const [changeText, setChangeText] = useState("");
  const [pendingReport, setPendingReport] = useState<ImpactReport | null>(null);

  // export
  const [exportResult, setExportResult] = useState<ExportResponse | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const applySummary = useCallback((r: PlanSummaryResponse) => {
    setState(r.state);
    setReadiness(r.readiness);
    setQuality(r.quality);
    setCriticalOpen(r.criticalOpenConflicts);
  }, []);

  async function generateAll() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<PlanSummaryResponse>(`/api/projects/${projectId}/planning`, {});
      applySummary(r);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to generate the plan.");
    } finally {
      setBusy(false);
    }
  }

  async function generateSection() {
    const def = SECTIONS.find((s) => s.key === section);
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<PlanSummaryResponse>(
        `/api/projects/${projectId}/planning`,
        def?.generator ? { section: def.generator } : {},
      );
      applySummary(r);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to generate this section.");
    } finally {
      setBusy(false);
    }
  }

  async function exportPlan() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<ExportResponse>(`/api/projects/${projectId}/export`, { reason: "Export plan" });
      applySummary(r);
      setExportResult(r);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to export the plan.");
    } finally {
      setBusy(false);
    }
  }

  function downloadZip() {
    const a = document.createElement("a");
    a.href = `/api/projects/${projectId}/export`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function refreshVersionsAudit() {
    try {
      const [v, a] = await Promise.all([
        api<{ versions: PlanVersionRow[] }>(`/api/projects/${projectId}/export/versions`),
        api<{ events: AuditRow[] }>(`/api/projects/${projectId}/audit`),
      ]);
      setVersions(v.versions);
      setEvents(a.events);
    } catch {
      /* non-fatal */
    }
  }

  async function proposeChange() {
    if (!changeText.trim()) return;
    setBusy(true);
    setError(null);
    setPendingReport(null);
    try {
      const r = await apiPost<{
        pending: boolean;
        applied?: boolean;
        requiresConfirmation: boolean;
        report: ImpactReport;
        planVersion?: number;
        readinessPercent?: number;
        buildReady?: boolean;
      }>(
        `/api/projects/${projectId}/changes`,
        { change: changeText, apply: true },
      );
      setPendingReport(r.report);
      if (!r.pending && r.applied) {
        // applied: pull the fresh summary + versions
        await Promise.all([refreshVersionsAudit(), apiPost<PlanSummaryResponse>(`/api/projects/${projectId}/planning`, {})]).catch(() => {});
        setChangeText("");
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409) {
        // high impact, needs explicit confirm — fetch the report via propose
        const pr = await apiPost<{ report: ImpactReport }>(`/api/projects/${projectId}/changes`, { change: changeText });
        setPendingReport(pr.report);
      } else {
        setError(e instanceof ApiClientError ? e.message : "Could not process the change.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmChange() {
    if (!pendingReport) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ planVersion?: number; readinessPercent?: number }>(
        `/api/projects/${projectId}/changes`,
        { change: changeText, apply: true, force: true },
      );
      setPendingReport(null);
      setChangeText("");
      await refreshVersionsAudit();
      await generateAll();
      void r;
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not apply the change.");
    } finally {
      setBusy(false);
    }
  }

  const activeDef = SECTIONS.find((s) => s.key === section)!;
  const Renderer = SECTION_RENDERERS[section];
  const hasEntity = (k: SectionKey) =>
    k === "requirements" ? state.requirements.length + state.acceptanceCriteria.length > 0
      : k === "features" ? state.features.length > 0
      : k === "user-stories" ? state.userStories.length > 0
      : k === "decisions" ? state.decisions.length + state.assumptions.length > 0
      : k === "dependencies" ? state.dependencies.length > 0
      : k === "architecture" ? state.architectureComponents.length > 0
      : k === "database" ? state.database.length > 0
      : k === "api" ? state.api.length > 0
      : k === "pages" ? state.pages.length > 0
      : k === "flows" ? state.userFlows.length > 0
      : k === "security" ? state.securityItems.length > 0
      : k === "testing" ? state.testCases.length > 0
      : state.implementationPhases.length + state.implementationTasks.length > 0;

  const cta = activeDef.generator ? (
    <Button onClick={generateSection} disabled={busy} className="h-8">
      Generate this section
    </Button>
  ) : undefined;

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Back
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="truncate font-display text-sm font-semibold">{initial.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Readiness {Math.round(readiness.percent)}%</span>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        {/* mobile: horizontal section strip */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              aria-current={section === s.key ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                section === s.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
          {/* rail (desktop) */}
          <nav aria-label="Plan sections" className="hidden lg:block">
            <ul className="space-y-0.5">
              {SECTIONS.map((s) => {
                const filled = hasEntity(s.key);
                return (
                  <li key={s.key}>
                    <button
                      onClick={() => setSection(s.key)}
                      aria-current={section === s.key ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        section === s.key ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", filled ? "bg-primary" : "bg-border")} />
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* main section */}
          <div className="min-w-0 space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">{activeDef.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{activeDef.desc}</p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Renderer state={state} cta={cta} />

            {/* conversational change */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-medium">Change the plan in plain language</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Describe a change and we show what it affects before applying it. High-impact changes need a confirm.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={changeText}
                    onChange={(e) => setChangeText(e.target.value)}
                    placeholder='e.g. "We no longer want Google login — switch to email magic links"'
                    aria-label="Describe a change to the plan"
                    className="flex-1"
                  />
                  <Button onClick={proposeChange} disabled={busy || !changeText.trim()}>
                    Analyse impact
                  </Button>
                </div>

                {pendingReport && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Impact: {pendingReport.level}</span>
                      {pendingReport.areas.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {pendingReport.areas.map((a) => a.area).join(" · ")}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pendingReport.requiresConfirmation ? (
                        <Button onClick={confirmChange} disabled={busy} variant="destructive" className="h-8">
                          Apply (confirmed)
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Applied automatically.</span>
                      )}
                      <Button onClick={() => setPendingReport(null)} variant="ghost" className="h-8">
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* versions + audit */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="p-5">
                  <button onClick={() => setShowVersions((v) => !v)} className="flex w-full items-center justify-between text-left">
                    <span className="text-sm font-medium">Plan versions</span>
                    <RefChip>{versions.length}</RefChip>
                  </button>
                  {showVersions && <div className="mt-3"><VersionList versions={versions} /></div>}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <button onClick={() => setShowAudit((v) => !v)} className="flex w-full items-center justify-between text-left">
                    <span className="text-sm font-medium">Recent activity</span>
                    <RefChip>{events.length}</RefChip>
                  </button>
                  {showAudit && <div className="mt-3"><AuditList events={events} /></div>}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* gate + quality */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <GatePanel readiness={readiness} quality={quality} criticalOpenConflicts={criticalOpenConflicts} buildReady={readiness.buildReady} />
            <QualityCard quality={quality} />
            <div className="flex flex-col gap-2">
              <Button onClick={generateAll} disabled={busy}>
                Generate full plan
              </Button>
              <Button onClick={exportPlan} disabled={busy} variant="secondary">
                Review &amp; export
              </Button>
              {exportResult && (
                <Button onClick={downloadZip} variant="outline">
                  Download ZIP (v{exportResult.planVersion})
                </Button>
              )}
            </div>
            {exportResult && <IntegrityCard integrity={exportResult.integrity} />}
          </aside>
        </div>

        {/* export documents */}
        {exportResult && (
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Export documents</h2>
              <Link href={`/projects/${projectId}/export`} className={buttonVariants({ variant: "link", className: "h-auto text-sm" })}>
                Open full export screen
              </Link>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {exportResult.docOrder.map((doc) => (
                <div key={doc} className="rounded-lg border border-border bg-card p-3">
                  <p className="font-mono text-xs text-primary">{doc}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{(exportResult.docs[doc] ?? "").length.toLocaleString()} chars</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
