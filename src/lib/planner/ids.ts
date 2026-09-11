// Stable, human-readable identifiers for Phase 2 planning entities (§55).
// Refs are deterministic (index-based) so the same state always yields the
// same refs — descriptions may change, ids stay stable.

import type { ProjectState, Feature } from "@/types";

/** Next 3-digit sequence for a `PREFIX-###` ref given existing ids. */
export function nextRef(existing: string[], prefix: string): string {
  const nums = existing
    .map((id) => {
      const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

/** Stable ref for a feature (§7). Assigns FEAT-### by index on first pass. */
export function ensureFeatureRef(state: ProjectState): void {
  const used = state.features.map((f) => f.ref).filter(Boolean) as string[];
  for (const f of state.features) {
    if (f.ref) continue;
    f.ref = nextRef(used, "FEAT");
    used.push(f.ref);
  }
}

export function featureRefMap(features: Feature[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of features) m.set(f.id, f.ref ?? f.id);
  return m;
}

/** Resolve a stable ref/uuid to a feature id, if any. */
export function resolveFeatureId(state: ProjectState, refOrId: string): string | null {
  const f =
    state.features.find((x) => x.ref === refOrId || x.id === refOrId) ??
    undefined;
  return f ? f.id : null;
}

/** Deterministic complexity heuristic from feature/requirement/decision count (§47). */
export function classifyComplexity(state: ProjectState): "simple" | "moderate" | "complex" | "very_complex" {
  const feat = state.features.filter((f) => f.status === "confirmed").length;
  const req = state.requirements.length;
  const dec = state.decisions.length;
  const size = feat * 3 + req + dec * 2;
  if (size <= 5) return "simple";
  if (size <= 15) return "moderate";
  if (size <= 40) return "complex";
  return "very_complex";
}
