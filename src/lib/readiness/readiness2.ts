// Readiness 2.0 (§36, §37). Extends the deterministic Phase 1 scorer with
// category percentages, a three-tier breakdown (critical / important /
// optional), and hard Build-Ready rules. Stays pure and deterministic — the
// Phase 1 computeReadiness() is untouched, so existing tests/UI keep passing.

import type { ProjectState } from "@/types";
import { computeReadiness, type ReadinessCategory } from "@/lib/readiness/readiness";
import { hasCriticalOpenConflict } from "@/lib/planner/conflicts";

export type ReadinessLevel = "critical" | "important" | "optional";

export interface Readiness2 {
  /** 0..100 blended percent (same as Phase 1). */
  percent: number;
  /** Per-category score 0..100. */
  categories: ReadinessCategory[];
  /** Critical items that block the interview / Build Ready. */
  critical: string[];
  /** Important items that strongly improve the plan. */
  important: string[];
  /** Optional polish. */
  optional: string[];
  /** §37: hard rules; every blocker must be cleared for Build Ready. */
  buildReadyBlockers: string[];
  /** Deterministic Build Ready (§37). */
  buildReady: boolean;
}

const IMPORTANT_CATEGORIES = new Set([
  "ux",
  "security",
  "testing",
  "deployment",
  "decisions",
]);

export function computeReadiness2(state: ProjectState): Readiness2 {
  const base = computeReadiness(state);
  const categories = base.categories;

  const critical: string[] = [];
  const important: string[] = [];
  const optional: string[] = [];

  for (const c of categories) {
    const missing = c.missing;
    if (IMPORTANT_CATEGORIES.has(c.key)) {
      for (const m of missing) important.push(`${m}`);
    } else {
      // Gating categories (project/users/features/requirements/architecture)
      // are treated as critical only when the category is incomplete.
      for (const m of missing) {
        if (c.key === "features" || c.key === "requirements" || c.key === "architecture") {
          critical.push(m);
        } else {
          optional.push(m);
        }
      }
    }
  }
  // Phase 1 already surfaced these as critical missing.
  for (const m of base.criticalMissing) critical.push(m);
  for (const m of base.optionalRemaining) optional.push(m);

  // §37 Build-Ready rules (deterministic, not cosmetic):
  const blockers: string[] = [];
  if (hasCriticalOpenConflict(state.conflicts)) {
    blockers.push("A critical conflict is unresolved.");
  }
  const confirmedCore = state.features.filter(
    (f) => f.status === "confirmed" && f.priority === "must_have",
  );
  if (confirmedCore.length === 0) {
    blockers.push("No core (must-have) feature is confirmed.");
  }
  if (state.project.targetUsers.length === 0) {
    blockers.push("Essential user roles / target users are unclear.");
  }
  const dbOwned = state.database.every((e) => e.ownership && e.ownership !== "UNSPECIFIED");
  if (state.database.length > 0 && !dbOwned) {
    blockers.push("Required data ownership is missing on one or more entities.");
  }
  const securityCovered =
    Boolean(state.security.accessControl?.trim()) ||
    state.securityItems.some((i) => i.status === "addressed" || i.status === "required");
  if (!securityCovered && confirmedCore.length > 0) {
    blockers.push("Critical security decisions are unresolved.");
  }
  const contradictory = state.conflicts.filter(
    (c) =>
      c.status === "open" &&
      /architecture|database|backend|frontend/i.test(
        `${c.earlierTopic} ${c.laterTopic}`,
      ),
  );
  if (contradictory.length > 0) {
    blockers.push("Major architecture decisions contradict each other.");
  }

  const buildReady =
    blockers.length === 0 &&
    base.canComplete &&
    categories.every((c) => !IMPORTANT_CATEGORIES.has(c.key) || c.score >= 0.6);

  return {
    percent: base.percent,
    categories,
    critical: dedupe(critical),
    important: dedupe(important),
    optional: dedupe(optional),
    buildReadyBlockers: blockers,
    buildReady,
  };
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}
