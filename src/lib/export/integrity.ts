// Export-integrity validation (§42). Runs before a plan is marked exportable
// or downloaded. Deterministic and pure. On failure, returns the concrete
// reasons so the user knows exactly what to fix — not just "invalid".

import type { ProjectState } from "@/types";
import { hasCriticalOpenConflict } from "@/lib/planner/conflicts";

export interface IntegrityResult {
  ok: boolean;
  /** Human-readable problems. Empty when ok. */
  problems: string[];
  /** Counts for the UI summary. */
  counts: { docs: number; requirements: number; conflictsOpen: number };
}

const REQUIRED_DOCS = ["PROJECT.md", "BUILD.md"];

export function validateExport(state: ProjectState, docs: Record<string, string>): IntegrityResult {
  const problems: string[] = [];

  // 1) Required documents present and non-empty.
  for (const doc of REQUIRED_DOCS) {
    if (!docs[doc]?.trim()) problems.push(`Required document ${doc} is missing or empty.`);
  }

  // 2) Unique stable IDs per section.
  const checkUnique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) dupes.add(id);
      seen.add(id);
    }
    if (dupes.size) problems.push(`Duplicate ${label} ids: ${[...dupes].join(", ")}`);
  };
  checkUnique("feature", state.features.map((f) => f.id));
  checkUnique("requirement", state.requirements.map((r) => r.id));
  checkUnique("user-story", state.userStories.map((s) => s.id));
  checkUnique("acceptance-criterion", state.acceptanceCriteria.map((a) => a.id));
  checkUnique("decision", state.decisions.map((d) => d.id));
  checkUnique("assumption", state.assumptions.map((a) => a.id));
  checkUnique("database-entity", state.database.map((d) => d.id));
  checkUnique("api-endpoint", state.api.map((a) => a.id));
  checkUnique("page", state.pages.map((p) => p.id));
  checkUnique("security-item", state.securityItems.map((s) => s.id));

  // 3) Valid references / no broken relationships.
  const featRefs = new Set(state.features.map((f) => f.ref ?? f.id));
  const featIds = new Set(state.features.map((f) => f.id));
  const reqIds = new Set(state.requirements.map((r) => r.id));
  const acIds = new Set(state.acceptanceCriteria.map((a) => a.id));

  const broken = (label: string, refs: (string | undefined)[], valid: Set<string>) => {
    for (const r of refs) {
      if (r && !valid.has(r)) problems.push(`${label} references unknown ${r}.`);
    }
  };

  for (const f of state.features) {
    broken("Feature", f.requirementIds ?? [], reqIds);
    broken("Feature", f.storyIds ?? [], new Set(state.userStories.map((s) => s.id)));
    broken("Feature", f.acceptanceCriteriaIds ?? [], acIds);
  }
  for (const r of state.requirements) {
    if (r.featureId && !featIds.has(r.featureId)) problems.push(`Requirement ${r.id} references unknown feature.`);
    broken("Requirement", r.acceptanceCriteriaIds ?? [], acIds);
  }
  for (const s of state.userStories) {
    if (s.featureId && !featIds.has(s.featureId)) problems.push(`User story ${s.id} references unknown feature.`);
    broken("User story", s.acceptanceCriteriaIds ?? [], acIds);
  }
  for (const p of state.implementationPhases) {
    broken("Implementation phase", p.featureRefs, featRefs);
    broken("Implementation phase", p.requirementRefs, reqIds);
  }
  for (const t of state.implementationTasks) {
    if (t.featureRef && !featRefs.has(t.featureRef)) problems.push(`Task ${t.id} references unknown feature ${t.featureRef}.`);
    if (t.requirementRef && !reqIds.has(t.requirementRef)) problems.push(`Task ${t.id} references unknown requirement ${t.requirementRef}.`);
  }

  // 4) No unresolved *critical* conflict (hard gate, §37/§42).
  if (hasCriticalOpenConflict(state.conflicts)) {
    problems.push("A critical conflict is still open; resolve it before exporting a build-ready plan.");
  }

  const counts = {
    docs: Object.keys(docs).length,
    requirements: state.requirements.length,
    conflictsOpen: state.conflicts.filter((c) => c.status === "open").length,
  };

  return { ok: problems.length === 0, problems, counts };
}
