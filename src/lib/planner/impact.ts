// Change-impact analysis (§21). Deterministic: given a described change and the
// current state, compute which planning areas are affected and the impact
// severity. This runs BEFORE any large cascading change is applied, so the
// user sees the consequences and confirms (§21 flow).

import type { ProjectState } from "@/types";

export type ImpactLevel = "low" | "medium" | "high";

export interface ImpactArea {
  area: string;
  detail: string;
}

export interface ImpactReport {
  change: string;
  level: ImpactLevel;
  areas: ImpactArea[];
  /** Stable refs/ids of directly affected entities. */
  affectedRefs: string[];
  /** When the cascade is large enough that the user must explicitly confirm. */
  requiresConfirmation: boolean;
}

// A small taxonomy of change "kinds" detected by keyword. Each maps to the
// planning areas that would change.
interface Kind {
  id: string;
  match: RegExp;
  level: ImpactLevel;
  areas: ImpactArea[];
}

const KINDS: Kind[] = [
  {
    id: "auth",
    match: /google|login|auth|sign ?in|signup|credential|oauth|sso/i,
    level: "medium",
    areas: [
      { area: "login UI", detail: "Sign-in / sign-up screens and provider buttons." },
      { area: "authentication configuration", detail: "Auth provider settings and decisions." },
      { area: "environment variables", detail: "Provider/credential env vars." },
      { area: "authentication tests", detail: "Auth + session test cases." },
      { area: "documentation", detail: "SECURITY.md and BUILD.md auth section." },
    ],
  },
  {
    id: "visibility",
    match: /public|private|visible|anonymous|sharing|access|permission/i,
    level: "high",
    areas: [
      { area: "permissions / access control", detail: "Read/modify rules per entity." },
      { area: "database access rules", detail: "Ownership + accessRules on entities." },
      { area: "UI", detail: "Visibility controls on content pages." },
      { area: "sharing behavior", detail: "Grant/revoke flows." },
      { area: "security", detail: "Threat items and NFRs." },
      { area: "API", detail: "Auth level on note/share endpoints." },
      { area: "testing", detail: "Authorization + 403 test cases." },
    ],
  },
  {
    id: "database",
    match: /database|schema|table|postgres|mongo|storage|field|entity/i,
    level: "high",
    areas: [
      { area: "database", detail: "Entities, fields, relationships." },
      { area: "API", detail: "Endpoints returning that data." },
      { area: "architecture", detail: "Datastore component and data flow." },
      { area: "implementation", detail: "Phases + tasks that touch the data layer." },
    ],
  },
  {
    id: "feature",
    match: /feature|remove|add|drop|include|exclude|support/i,
    level: "medium",
    areas: [
      { area: "features", detail: "Scope, priority, and dependencies." },
      { area: "requirements", detail: "FRs linked to the feature." },
      { area: "user stories", detail: "Stories + acceptance criteria for the feature." },
      { area: "implementation", detail: "Phases and tasks referencing it." },
    ],
  },
  {
    id: "deployment",
    match: /deploy|host|vercel|aws|fly|infra|ci|monitor|backup/i,
    level: "low",
    areas: [
      { area: "deployment", detail: "Target, env vars, external services." },
      { area: "documentation", detail: "DEPLOYMENT.md." },
    ],
  },
  {
    id: "ui",
    match: /page|screen|view|layout|nav|flow|component|ui|ux/i,
    level: "medium",
    areas: [
      { area: "UI / pages", detail: "Page inventory and flows." },
      { area: "implementation", detail: "Frontend tasks." },
    ],
  },
];

const GENERIC: ImpactArea[] = [
  { area: "state", detail: "Relevant structured fields." },
  { area: "readiness", detail: "Readiness 2.0 scores recalculate." },
  { area: "plan version", detail: "A new plan version is created." },
];

/** Classify a free-text change description into areas + severity. */
export function analyzeChangeImpact(change: string, state: ProjectState): ImpactReport {
  const matched = KINDS.filter((k) => k.match.test(change));
  const areas: ImpactArea[] = [];
  const seen = new Set<string>();
  let level: ImpactLevel = "low";

  const LEVEL_RANK: Record<ImpactLevel, number> = { low: 0, medium: 1, high: 2 };
  const bump = (l: ImpactLevel) => {
    if (LEVEL_RANK[l] > LEVEL_RANK[level]) level = l;
  };

  for (const k of matched) {
    bump(k.level);
    for (const a of k.areas) if (!seen.has(a.area)) seen.add(a.area), areas.push(a);
  }
  if (!matched.length) {
    for (const a of GENERIC) areas.push(a);
    level = "low";
  }

  // Directly-affected stable refs: features whose name/area the change mentions.
  const affectedRefs: string[] = [];
  const words = change.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  for (const f of state.features) {
    const name = f.name.toLowerCase();
    if (words.some((w) => name.includes(w))) affectedRefs.push(f.ref ?? f.id);
  }

  // High level OR many areas -> the user must confirm explicitly.
  const requiresConfirmation = LEVEL_RANK[level] === 2 || areas.length >= 5;
  return { change, level, areas, affectedRefs, requiresConfirmation };
}

/**
 * Convert an impact report into concrete StateUpdate ops for the *planning*
 * parts that are cheap to refresh deterministically. Big semantic changes
 * (e.g. dropping a provider) are surfaced as a decision for the user to make,
 * not silently applied (§21: never make large cascading changes silently).
 */
export function buildPendingDecision(
  report: ImpactReport,
  state: ProjectState,
): string {
  const refs = report.affectedRefs.length ? ` (affects: ${report.affectedRefs.join(", ")})` : "";
  return `Change: ${report.change}${refs}. Impact level: ${report.level}. Review the affected areas before applying.`;
}
