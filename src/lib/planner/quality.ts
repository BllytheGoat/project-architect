// Deterministic plan-quality reviewer (§35). Scores a finished plan 0-100 and
// lists strengths / warnings. Pure: no LLM. The score is a fixed weighted
// sum over coverage + consistency dimensions so it is reproducible.

import type { ProjectState } from "@/types";
import { hasCriticalOpenConflict } from "@/lib/planner/conflicts";

export interface PlanQuality {
  /** 0..100 */
  score: number;
  strengths: string[];
  warnings: string[];
  /** True when score >= threshold with no critical warnings. */
  acceptable: boolean;
}

const WEIGHTS = [
  { key: "completeness", label: "Completeness", weight: 0.25 },
  { key: "consistency", label: "Consistency", weight: 0.2 },
  { key: "feasibility", label: "Feasibility", weight: 0.15 },
  { key: "coverage", label: "Requirement coverage", weight: 0.15 },
  { key: "dependencies", label: "Dependency correctness", weight: 0.1 },
  { key: "security", label: "Security coverage", weight: 0.1 },
  { key: "testing", label: "Testing coverage", weight: 0.05 },
  { key: "deployment", label: "Deployment coverage", weight: 0.05 },
] as const;

function has(s: ProjectState, fn: () => boolean): boolean {
  return fn();
}

export function reviewProject(state: ProjectState): PlanQuality {
  const strengths: string[] = [];
  const warnings: string[] = [];
  const dimensionScores: Record<string, number> = {};

  // Completeness: are the major planning sections non-empty?
  const sections = [
    "requirements",
    "features",
    "userStories",
    "architectureComponents",
    "database",
    "api",
    "pages",
    "userFlows",
    "securityItems",
    "testCases",
    "implementationPhases",
  ] as const;
  const filled = sections.filter((s) => (state[s] as unknown[]).length > 0).length;
  dimensionScores.completeness = filled / sections.length;
  if (filled >= 8) strengths.push("Core planning sections are defined.");
  else warnings.push(`${sections.length - filled} planning section(s) are still empty.`);

  // Consistency: no critical open conflicts, no duplicated/conflicting decisions.
  const criticalOpen = hasCriticalOpenConflict(state.conflicts);
  dimensionScores.consistency = criticalOpen ? 0 : 1;
  if (criticalOpen) warnings.push("At least one critical conflict is unresolved.");
  else strengths.push("No unresolved critical conflicts.");

  // Feasibility: implementation phases reference features that exist.
  const featRefs = new Set(state.features.map((f) => f.ref ?? f.id));
  const phases = state.implementationPhases;
  const dangling = phases.flatMap((p) => p.featureRefs).filter((r) => !featRefs.has(r));
  dimensionScores.feasibility = dangling.length === 0 ? 1 : Math.max(0, 1 - dangling.length / 10);
  if (dangling.length) warnings.push(`${dangling.length} implementation phase(s) reference unknown feature(s).`);
  else if (phases.length) strengths.push("Implementation phases map to real features.");

  // Requirement coverage: confirmed requirements carry acceptance criteria.
  const confirmed = state.requirements.filter((r) => r.status === "confirmed");
  const withAC = confirmed.filter((r) => (r.acceptanceCriteriaIds?.length ?? 0) > 0 || state.acceptanceCriteria.length > 0).length;
  dimensionScores.coverage = confirmed.length ? withAC / confirmed.length : 0;
  if (confirmed.length && withAC === confirmed.length) strengths.push("Confirmed requirements have acceptance criteria.");
  else if (confirmed.length) warnings.push(`${confirmed.length - withAC} confirmed requirement(s) lack acceptance criteria.`);

  // Dependency correctness: no dependency points to an unknown node.
  const nodeIds = new Set([
    ...state.features.map((f) => f.ref ?? f.id),
    ...state.features.map((f) => f.id),
    ...state.requirements.map((r) => r.id),
    ...state.database.map((d) => d.name),
  ]);
  const unknownDeps = state.dependencies.filter(
    (d) => !nodeIds.has(d.sourceId) || !nodeIds.has(d.targetId),
  );
  dimensionScores.dependencies =
    state.dependencies.length === 0 ? 1 : unknownDeps.length === 0 ? 1 : 0.4;
  if (unknownDeps.length) warnings.push(`${unknownDeps.length} dependency(ies) reference unknown node(s).`);

  // Security coverage: access-control model or addressed security items.
  const secCovered =
    Boolean(state.security.accessControl?.trim()) ||
    state.securityItems.some((i) => i.status === "addressed");
  dimensionScores.security = secCovered ? 1 : 0;
  if (secCovered) strengths.push("An access-control / security model is present.");
  else warnings.push("No access-control or security model recorded.");

  // Testing coverage: e2e cases for critical workflows.
  const e2e = state.testCases.filter((t) => t.kind === "e2e").length;
  dimensionScores.testing = e2e > 0 ? 1 : 0;
  if (e2e) strengths.push("End-to-end tests are planned for critical workflows.");
  else warnings.push("No end-to-end tests are planned.");

  // Deployment coverage: target + env vars.
  dimensionScores.deployment =
    Boolean(state.deployment.target?.trim()) && (state.deployment.environmentVariables?.length ?? 0) > 0
      ? 1
      : 0.5;
  if (dimensionScores.deployment < 1) warnings.push("Deployment target or environment variables are incomplete.");

  const score = Math.round(
    WEIGHTS.reduce((sum, w) => sum + (dimensionScores[w.key] ?? 0) * w.weight, 0) * 100,
  );
  const acceptable = score >= 70 && !criticalOpen;

  return { score, strengths, warnings, acceptable };
}
