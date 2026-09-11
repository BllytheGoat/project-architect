"use client";

// Read-only display components for each planning section (§5, §7, §11, §23, §24,
// §30, §31, §33, §34). Pure: each takes ProjectState and renders the entities.
// Empty states use EmptyState with a hint that the section can be generated.
// No wide desktop tables — entities are cards/rows so they hold on phones (§58).

import type { ProjectState } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState, FieldRow, RefChip, StatusBadge, SectionHeader } from "./plan-widgets";

type P = { state: ProjectState; cta?: React.ReactNode };

// ---- Requirements ---------------------------------------------------------
export function RequirementsSection({ state, cta }: P) {
  const reqs = state.requirements;
  const ac = state.acceptanceCriteria;
  if (!reqs.length && !ac.length)
    return <EmptyState title="No requirements yet" body="Your project may not need structured requirements yet, or they haven't been captured. Generate them from the features and interview answers." action={cta} />;
  const acById = new Map(ac.map((a) => [a.id, a]));
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground">
          {reqs.filter((r) => r.type === "functional").length} functional · {reqs.filter((r) => r.type === "non_functional").length} non-functional
        </p>
        <div className="mt-3 space-y-2">
          {reqs.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3.5">
                <div className="flex items-center gap-2">
                  <RefChip tone="accent">{r.id}</RefChip>
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <StatusBadge status={r.source ?? "user"} />
                    <StatusBadge status={r.status} />
                  </span>
                </div>
                {r.description && <p className="mt-1.5 text-sm text-muted-foreground">{r.description}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <FieldRow label="Type">{r.type}</FieldRow>
                  <FieldRow label="Priority">{r.priority}</FieldRow>
                </dl>
                {(r.acceptanceCriteriaIds?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(r.acceptanceCriteriaIds ?? []).map((id) => {
                      const a = acById.get(id);
                      return (
                        <li key={id} className="text-sm text-muted-foreground">
                          <RefChip>{id}</RefChip> {a ? a.statement : ""}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {ac.length > 0 && (
        <div>
          <Separator className="mb-4" />
          <h3 className="text-sm font-medium">Acceptance criteria</h3>
          <ul className="mt-3 space-y-1.5">
            {ac.map((a) => (
              <li key={a.id} className="text-sm">
                <RefChip>{a.id}</RefChip> <span className="ml-1">{a.statement}</span>
                {(a.given || a.when || a.then) && (
                  <span className="block pl-12 text-xs text-muted-foreground">
                    {[a.given && `Given ${a.given}`, a.when && `When ${a.when}`, a.then && `Then ${a.then}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Features -------------------------------------------------------------
export function FeaturesSection({ state, cta }: P) {
  const feat = state.features;
  if (!feat.length)
    return <EmptyState title="No features yet" body="Features are the units you'll build. Capture core features from the interview, or generate them." action={cta} />;
  const prio: Record<string, string> = { must_have: "Must have", should_have: "Should have", could_have: "Could have", nice_to_have: "Nice to have", future: "Future" };
  return (
    <div className="space-y-2">
      {feat.map((f) => (
        <Card key={f.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              {f.ref && <RefChip tone="accent">{f.ref}</RefChip>}
              <span className="truncate text-sm font-medium">{f.name}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <RefChip>{prio[f.priority] ?? f.priority}</RefChip>
                <StatusBadge status={f.status} />
              </span>
            </div>
            {f.description && <p className="mt-1.5 text-sm text-muted-foreground">{f.description}</p>}
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {f.scope && <FieldRow label="Scope">{f.scope}</FieldRow>}
              {(f.dependsOn?.length ?? 0) > 0 && <FieldRow label="Depends on">{f.dependsOn!.join(", ")}</FieldRow>}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- User stories ---------------------------------------------------------
export function StoriesSection({ state, cta }: P) {
  if (!state.userStories.length)
    return <EmptyState title="No user stories yet" body="Stories describe who benefits and how. Generate them from the features and target users." action={cta} />;
  return (
    <div className="space-y-2">
      {state.userStories.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              <RefChip tone="accent">{s.id}</RefChip>
              {s.status && <StatusBadge status={s.status} />}
              {s.priority && <RefChip>{s.priority}</RefChip>}
            </div>
            <p className="mt-1.5 text-sm">
              As a <strong>{s.role}</strong>, I want to <strong>{s.action}</strong> so that <strong>{s.benefit}</strong>.
            </p>
            {(s.requirementIds?.length ?? 0) > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">Linked: {s.requirementIds!.join(", ")}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Decisions + Assumptions --------------------------------------------
export function DecisionsSection({ state, cta }: P) {
  if (!state.decisions.length && !state.assumptions.length)
    return <EmptyState title="No decisions or assumptions yet" body="Key choices and the bets they rest on. Record them so the build is reasoned, not guessed." action={cta} />;
  return (
    <div className="space-y-5">
      {state.decisions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Decisions</h3>
          <div className="mt-3 space-y-2">
            {state.decisions.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-3.5">
                  <div className="flex items-center gap-2">
                    {d.ref && <RefChip tone="accent">{d.ref}</RefChip>}
                    <span className="text-sm font-medium">{d.topic}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <StatusBadge status={d.source} />
                      <StatusBadge status={d.status} />
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm">{d.decision}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Why: {d.reason}</p>
                  {d.tradeoffs && <p className="mt-1 text-xs text-muted-foreground">Tradeoffs: {d.tradeoffs}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      {state.assumptions.length > 0 && (
        <div>
          <Separator className="mb-4" />
          <h3 className="text-sm font-medium">Assumptions</h3>
          <ul className="mt-3 space-y-1.5">
            {state.assumptions.map((a) => (
              <li key={a.id} className="text-sm">
                <RefChip>{a.id}</RefChip> {a.statement}
                <span className="ml-2"><StatusBadge status={a.status} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Dependencies ---------------------------------------------------------
export function DependenciesSection({ state, cta }: P) {
  if (!state.dependencies.length)
    return <EmptyState title="No dependencies mapped yet" body="Map which features, requirements, and entities depend on each other so the build order is sound." action={cta} />;
  return (
    <div className="space-y-2">
      {state.dependencies.map((d) => (
        <div key={d.id} className="flex items-start gap-2 text-sm">
          <RefChip>{d.id}</RefChip>
          <div className="min-w-0 flex-1">
            <span>
              <strong>{d.sourceId}</strong> → <strong>{d.targetId}</strong>
              {d.type && <RefChip className="ml-2">{d.type.replace(/_/g, " ")}</RefChip>}
            </span>
            <p className="text-xs text-muted-foreground">{d.reason}</p>
          </div>
          <StatusBadge status={d.status} />
        </div>
      ))}
    </div>
  );
}

// ---- Architecture ---------------------------------------------------------
export function ArchitectureSection({ state, cta }: P) {
  if (!state.architectureComponents.length)
    return <EmptyState title="No architecture components yet" body="Describe the moving parts, what each owns, how data flows, and where trust boundaries are." action={cta} />;
  const base = state.architecture;
  return (
    <div className="space-y-5">
      {(base.frontend || base.backend || base.database || base.auth) && (
        <Card>
          <CardContent className="p-4">
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {base.frontend && <FieldRow label="Frontend">{base.frontend}</FieldRow>}
              {base.backend && <FieldRow label="Backend">{base.backend}</FieldRow>}
              {base.database && <FieldRow label="Storage">{base.database}</FieldRow>}
              {base.auth && <FieldRow label="Auth">{base.auth}</FieldRow>}
            </dl>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {state.architectureComponents.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-3.5">
              <div className="flex items-center gap-2">
                <RefChip tone="accent">{c.id}</RefChip>
                <span className="text-sm font-medium">{c.name}</span>
                {c.kind && <RefChip>{c.kind.replace(/_/g, " ")}</RefChip>}
              </div>
              <p className="mt-1.5 text-sm">{c.responsibility}</p>
              {c.dataFlow && <p className="mt-1 text-xs text-muted-foreground">Data flow: {c.dataFlow}</p>}
              {c.trustBoundary && <p className="mt-1 text-xs text-muted-foreground">Trust boundary: {c.trustBoundary}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---- Database -------------------------------------------------------------
export function DatabaseSection({ state, cta }: P) {
  if (!state.database.length)
    return <EmptyState title="No data model yet" body="The tables or collections the app persists. Capture entities, fields, keys, and ownership." action={cta} />;
  return (
    <div className="space-y-2">
      {state.database.map((e) => (
        <Card key={e.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              <RefChip tone="accent">{e.id}</RefChip>
              <span className="text-sm font-medium">{e.name}</span>
              {e.ownership && <span className="ml-auto text-xs text-muted-foreground">owned by {e.ownership}</span>}
            </div>
            {e.fields.length > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {e.fields.map((f, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-mono text-primary">{f.name}</span> <span className="text-muted-foreground">{f.type}</span>
                  </li>
                ))}
              </ul>
            )}
            {e.relationships.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Relationships: {e.relationships.join(" · ")}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- API ------------------------------------------------------------------
export function ApiSection({ state, cta }: P) {
  if (!state.api.length)
    return <EmptyState title="No API requirements yet" body="Your project may not need a custom API, or the design may not be determined yet. Generate endpoints from the features and data model." action={cta} />;
  const methodTone: Record<string, "accent" | "muted" | "destructive"> = { DELETE: "destructive", POST: "accent", PUT: "muted", PATCH: "muted", GET: "muted", HEAD: "muted" };
  return (
    <div className="space-y-2">
      {state.api.map((a) => (
        <Card key={a.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              <RefChip tone={methodTone[a.method]}>{a.method}</RefChip>
              <span className="min-w-0 truncate font-mono text-sm">{a.path}</span>
              {a.auth && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{a.auth}</span>}
            </div>
            {a.purpose && <p className="mt-1.5 text-sm text-muted-foreground">{a.purpose}</p>}
            {(a.request || a.response) && (
              <dl className="mt-2 space-y-1 text-xs">
                {a.request && <div><span className="text-muted-foreground">Request: </span>{a.request}</div>}
                {a.response && <div><span className="text-muted-foreground">Response: </span>{a.response}</div>}
              </dl>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Pages / UI -----------------------------------------------------------
export function PagesSection({ state, cta }: P) {
  if (!state.pages.length)
    return <EmptyState title="No pages mapped yet" body="List the screens the user can reach, who uses each, and the data it needs." action={cta} />;
  return (
    <div className="space-y-2">
      {state.pages.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.name}</span>
              {p.path && <span className="font-mono text-xs text-muted-foreground">{p.path}</span>}
              {p.access && <span className="ml-auto"><StatusBadge status={p.access} /></span>}
            </div>
            {p.purpose && <p className="mt-1.5 text-sm text-muted-foreground">{p.purpose}</p>}
            {p.actions.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">Actions: {p.actions.join(" · ")}</p>
            )}
            {p.requiredData.length > 0 && (
              <p className="text-xs text-muted-foreground">Needs: {p.requiredData.join(" · ")}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- User flows -----------------------------------------------------------
export function FlowsSection({ state, cta }: P) {
  if (!state.userFlows.length)
    return <EmptyState title="No user flows yet" body="Map the happy path and the failure paths for each key workflow." action={cta} />;
  return (
    <div className="space-y-2">
      {state.userFlows.map((f) => (
        <Card key={f.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              <RefChip tone="accent">{f.id}</RefChip>
              <span className="text-sm font-medium">{f.name}</span>
            </div>
            {(f.happyPath.length > 0 || f.steps.length > 0) && (
              <ol className="mt-2 space-y-1 text-sm">
                {(f.happyPath.length ? f.happyPath : f.steps).map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
            {f.failurePaths.length > 0 && (
              <div className="mt-2 space-y-1">
                {f.failurePaths.map((fp, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="text-destructive">{fp.trigger}</span> → {fp.recovery}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Security -------------------------------------------------------------
export function SecuritySection({ state, cta }: P) {
  if (!state.securityItems.length)
    return <EmptyState title="No security items yet" body="List the threats, their impact, and the mitigation for each." action={cta} />;
  return (
    <div className="space-y-2">
      {state.securityItems.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2">
              <RefChip tone="accent">{s.id}</RefChip>
              <span className="text-sm font-medium">{s.threat}</span>
              <span className="ml-auto"><StatusBadge status={s.status} /></span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Impact: {s.impact}</p>
            {s.mitigation && <p className="mt-1 text-sm">{s.mitigation}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Testing ----------------------------------------------------------------
export function TestingSection({ state, cta }: P) {
  if (!state.testCases.length)
    return <EmptyState title="No test plan yet" body="Choose the kinds of tests (unit, integration, e2e, security) that cover the critical workflows." action={cta} />;
  const kinds = Array.from(new Set(state.testCases.map((t) => t.kind)));
  return (
    <div className="space-y-4">
      {kinds.map((k) => (
        <div key={k}>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{k}</h3>
          <ul className="mt-2 space-y-1.5">
            {state.testCases.filter((t) => t.kind === k).map((t) => (
              <li key={t.id} className="text-sm">
                <RefChip>{t.id}</RefChip> <span className="ml-1">{t.target}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---- Implementation --------------------------------------------------------
export function ImplementationSection({ state, cta }: P) {
  if (!state.implementationPhases.length && !state.implementationTasks.length)
    return <EmptyState title="No implementation plan yet" body="Turn the dependencies into ordered phases and the tasks inside each." action={cta} />;
  const tasks = state.implementationTasks;
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return (
    <div className="space-y-4">
      {state.implementationPhases.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <RefChip tone="accent">{p.order}</RefChip>
              <span className="font-display text-sm font-semibold">{p.name}</span>
            </div>
            {p.objective && <p className="mt-1.5 text-sm text-muted-foreground">{p.objective}</p>}
            {p.featureRefs.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Features: {p.featureRefs.join(", ")}</p>}
            {p.taskIds.length > 0 && (
              <ul className="mt-2 space-y-1">
                {p.taskIds.map((id) => {
                  const t = taskById.get(id);
                  return (
                    <li key={id} className="text-sm">
                      <RefChip>{id}</RefChip> {t ? t.title : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- section registry ------------------------------------------------------
export const SECTION_RENDERERS = {
  requirements: RequirementsSection,
  features: FeaturesSection,
  "user-stories": StoriesSection,
  dependencies: DependenciesSection,
  architecture: ArchitectureSection,
  database: DatabaseSection,
  api: ApiSection,
  pages: PagesSection,
  flows: FlowsSection,
  security: SecuritySection,
  testing: TestingSection,
  implementation: ImplementationSection,
  decisions: DecisionsSection,
} as const;

export type SectionKey = keyof typeof SECTION_RENDERERS;
