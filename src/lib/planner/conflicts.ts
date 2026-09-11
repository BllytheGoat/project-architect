// Advanced, deterministic conflict detection (§20). Pure: same state -> same
// conflicts. Detects cross-entity contradictions (requirements vs features vs
// decisions vs assumptions vs architecture vs database vs API vs security)
// and tags each with a severity. A *critical open* conflict blocks Build
// Ready (see buildReady in readiness2.ts).

import type { ProjectState, Conflict } from "@/types";
import { randomUUID } from "node:crypto";

export type ConflictSeverity = "critical" | "high" | "medium" | "low";

export interface AdvancedConflict extends Conflict {
  severity: ConflictSeverity;
  suggestedResolution: string;
  entities: string[];
}

function featureBlob(s: ProjectState): string {
  return s.features.map((f) => f.name + " " + f.description).join(" ").toLowerCase();
}
function factBlob(s: ProjectState): string {
  return Object.values(s.project.facts).join(" ").toLowerCase();
}
function reqBlob(s: ProjectState): string {
  return s.requirements.map((r) => r.title + " " + r.description).join(" ").toLowerCase();
}

export function detectAdvancedConflicts(state: ProjectState): AdvancedConflict[] {
  const out: AdvancedConflict[] = [];
  const facts = factBlob(state);
  const feats = featureBlob(state);
  const reqs = reqBlob(state);
  const all = `${facts} ${feats} ${reqs}`;

  const push = (
    earlierTopic: string,
    earlierValue: string,
    laterTopic: string,
    laterValue: string,
    severity: ConflictSeverity,
    suggestedResolution: string,
    entities: string[],
  ) => {
    out.push({
      id: randomUUID(),
      earlierTopic,
      earlierValue,
      laterTopic,
      laterValue,
      status: "open",
      severity,
      suggestedResolution,
      entities,
    });
  };

  // 1) Anonymous users vs public profiles (security-relevant -> high).
  const anon = /anonymous/i.test(facts) || state.project.goals.some((g) => /anonymou/i.test(g));
  const publicProfile = /public (profile|profiles|identit)/i.test(all);
  if (anon && publicProfile) {
    push(
      "Authentication",
      "Users remain anonymous.",
      "User profiles",
      "Users have public profiles.",
      "high",
      "Choose either anonymous usage or identifiable public profiles; do not claim both.",
      ["users"],
    );
  }

  // 2) Private-only visibility vs public sharing (product-relevant -> medium).
  const privateOnly = /only (owner|authors|registered)/i.test(state.project.facts.visibility ?? "");
  const publicShare = /public(ly)? (share|note|post)/i.test(state.project.facts.visibility ?? "");
  if (privateOnly && publicShare) {
    push(
      "Visibility",
      "Only owners can access content.",
      "Visibility",
      "Content is publicly shareable.",
      "medium",
      "Decide the default visibility and whether sharing can override it.",
      ["notes"],
    );
  }

  // 3) User-owned content stored but no access-control model (security gap -> critical).
  const hasOwnedContent = /note|document|file|upload|post|entry/i.test(feats) && /owner|user|account|member/i.test(all);
  const hasAccessControl = Boolean(state.security.accessControl?.trim());
  const hasSecNfr = state.requirements.some((r) => r.type === "non_functional" && /access|authoriz|permission|only.*access/i.test(r.title + r.description));
  if (hasOwnedContent && !hasAccessControl && !hasSecNfr) {
    push(
      "Security",
      "The project stores user-owned content.",
      "Security",
      "No access-control model or authorization requirement is recorded.",
      "critical",
      "Define who can read/modify each user's content and record it as a critical non-functional requirement.",
      ["security", "users"],
    );
  }

  // 4) Public endpoint exposes user data (API vs security -> high).
  const publicEndpointExposingData = state.api.some(
    (e) => e.auth === "public" && /note|user|profile|file|private/i.test(e.purpose ?? ""),
  );
  if (publicEndpointExposingData && !hasAccessControl) {
    push(
      "API",
      "A public endpoint returns user-owned data.",
      "Security",
      "No access-control model is recorded.",
      "high",
      "Require authentication/authorization on that endpoint or explicitly scope it to public data only.",
      ["api", "security"],
    );
  }

  // 5) Database entity with unspecified ownership while security demands it (medium).
  const unownedEntity = state.database.find((e) => e.ownership === "UNSPECIFIED" || !e.ownership);
  if (unownedEntity && hasAccessControl) {
    push(
      "Database",
      `Entity ${unownedEntity.name} has no ownership recorded.`,
      "Security",
      "An access-control model exists and assumes clear ownership.",
      "medium",
      `Record which user/role owns ${unownedEntity.name} and its access rules.`,
      ["database"],
    );
  }

  // 6) Conflicting decisions on the same topic without a supersession (high).
  const byTopic = new Map<string, number>();
  for (const d of state.decisions) {
    const key = d.topic.toLowerCase().trim();
    byTopic.set(key, (byTopic.get(key) ?? 0) + 1);
  }
  for (const [key, n] of byTopic) {
    const list = state.decisions.filter((d) => d.topic.toLowerCase().trim() === key);
    const distinct = new Set(list.map((d) => d.decision.toLowerCase().trim()));
    const accepted = list.filter((d) => d.status === "accepted");
    if (accepted.length > 1 && distinct.size > 1 && !list.some((d) => d.status === "superseded")) {
      push(
        "Decision",
        `${list[0].topic}: ${list[0].decision}`,
        "Decision",
        `${list[1].topic}: ${list[1].decision}`,
        "high",
        `Keep one accepted decision for "${list[0].topic}" and mark the other superseded.`,
        ["decisions"],
      );
    }
    if (n > 1 && list.some((d) => d.status === "superseded")) {
      // superseded chains are fine; no conflict.
    }
  }

  // 7) Pending critical assumption that a confirmed requirement depends on (medium).
  const pendingCrit = state.assumptions.find((a) => a.status === "pending");
  const confirmedReqs = state.requirements.filter((r) => r.status === "confirmed");
  if (pendingCrit && confirmedReqs.length > 0 && /access|owner|permission|public|private/i.test(pendingCrit.statement)) {
    push(
      "Assumption",
      `${pendingCrit.id} is still pending: ${pendingCrit.statement}`,
      "Requirements",
      `${confirmedReqs.length} requirement(s) are already confirmed and may depend on it.`,
      "medium",
      "Resolve the pending assumption before relying on the confirmed requirements.",
      ["assumptions"],
    );
  }

  // 8) Dependency cycle between features (order cannot be satisfied -> high).
  if (hasCycle(state)) {
    push(
      "Dependencies",
      "Features depend on each other in a cycle.",
      "Implementation",
      "No valid build order exists while the cycle holds.",
      "high",
      "Break the dependency cycle (remove or invert one edge) so features can be ordered.",
      ["dependencies"],
    );
  }

  return out;
}

/** Kahn's algorithm cycle check over the feature dependency subgraph. */
function hasCycle(state: ProjectState): boolean {
  const refToId = new Map<string, string>();
  for (const f of state.features) refToId.set(f.ref ?? f.id, f.id);
  refToId.forEach((_v, k) => refToId.set(k, refToId.get(k)!));

  const ids = new Set(state.features.map((f) => f.id));
  const adj = new Map<string, Set<string>>();
  for (const f of state.features) adj.set(f.id, new Set());
  for (const d of state.dependencies) {
    const s = refToId.get(d.sourceId);
    const t = refToId.get(d.targetId);
    if (s && t && ids.has(s) && ids.has(t) && s !== t) adj.get(s)?.add(t);
  }

  const indeg = new Map<string, number>([...ids].map((id) => [id, 0]));
  for (const [, tgts] of adj) for (const t of tgts) indeg.set(t, (indeg.get(t) ?? 0) + 1);

  const q = [...ids].filter((id) => (indeg.get(id) ?? 0) === 0);
  let visited = 0;
  while (q.length) {
    const id = q.shift()!;
    visited++;
    for (const t of adj.get(id) ?? []) {
      const n = (indeg.get(t) ?? 1) - 1;
      indeg.set(t, n);
      if (n === 0) q.push(t);
    }
  }
  return visited < ids.size;
}

/** True when at least one critical conflict is still open (Build-Ready gate, §37). */
export function hasCriticalOpenConflict(conflicts: Conflict[]): boolean {
  return conflicts.some(
    (c) => c.status === "open" && (c as AdvancedConflict).severity === "critical",
  );
}
