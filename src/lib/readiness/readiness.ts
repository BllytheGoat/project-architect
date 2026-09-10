// Deterministic readiness scoring. Pure: same state -> same score, always.
// No AI involved. Weights are fixed so a user can see *why* a project is
// not ready, not just *that* it is not ready.

import type { ProjectState } from "@/types";

export interface ReadinessCategory {
  key: string;
  label: string;
  weight: number; // 0..1, sums to 1
  score: number; // 0..1
  satisfied: boolean;
  missing: string[]; // human-readable gaps, used in the UI
}

export interface ReadinessResult {
  /** 0..100 */
  percent: number;
  /** 0..1 */
  ratio: number;
  categories: ReadinessCategory[];
  criticalMissing: string[];
  optionalRemaining: string[];
  /** true when no *critical* unknown remains — interview may complete. */
  canComplete: boolean;
}

const WEIGHTS = {
  project: 0.15,
  users: 0.1,
  features: 0.2,
  requirements: 0.15,
  ux: 0.1,
  architecture: 0.1,
  security: 0.05,
  testing: 0.05,
  deployment: 0.05,
  decisions: 0.05,
} as const;

const assertWeights = () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`Readiness weights must sum to 1, got ${sum}`);
  }
};

// A category scores partially based on how much of its "expected" content is
// present and confirmed. Each item returns a fraction in [0,1] and a list of
// the concrete things still missing.

function scoreProject(s: ProjectState): { frac: number; missing: string[] } {
  const p = s.project;
  const checks = [
    p.name.length > 0,
    p.description.length >= 20,
    p.problem.length > 0,
    p.goals.length > 0,
    p.successCriteria.length > 0,
  ];
  const met = checks.filter(Boolean).length;
  const missing: string[] = [];
  if (!p.name) missing.push("a project name");
  if (p.description.length < 20) missing.push("a clear description of the idea");
  if (!p.problem) missing.push("the problem the project solves");
  if (p.goals.length === 0) missing.push("explicit goals");
  if (p.successCriteria.length === 0) missing.push("success criteria");
  return { frac: met / checks.length, missing };
}

function scoreUsers(s: ProjectState): { frac: number; missing: string[] } {
  const missing: string[] = [];
  let frac = 0;
  if (s.project.targetUsers.length > 0) frac += 0.6;
  else missing.push("who the target users are");
  // Roles/permissions: either a decision or a fact about users.
  const hasRoles =
    s.decisions.some((d) => /role|permission|access|account/i.test(d.topic + d.decision)) ||
    Object.values(s.project.facts).some((v) => /role|permission|access control/i.test(v));
  if (hasRoles) frac += 0.4;
  else missing.push("how different user types/roles relate to the product");
  return { frac, missing };
}

function scoreFeatures(s: ProjectState): { frac: number; missing: string[] } {
  const confirmed = s.features.filter((f) => f.status === "confirmed");
  const proposed = s.features.length - confirmed.length;
  const missing: string[] = [];
  let frac = 0;
  if (confirmed.length === 0) {
    missing.push("at least one confirmed core feature");
  } else {
    frac = 0.6;
    if (confirmed.filter((f) => f.priority === "must_have").length === 0) {
      missing.push("which features are must-have vs optional");
    }
    if (proposed > 0) missing.push(`${proposed} feature(s) still need to be confirmed`);
  }
  if (s.project.userStories.length === 0 && confirmed.length > 0) frac = Math.min(1, frac + 0.1);
  return { frac, missing };
}

function scoreRequirements(s: ProjectState): { frac: number; missing: string[] } {
  const total = s.requirements.length;
  const confirmed = s.requirements.filter((r) => r.status === "confirmed").length;
  const missing: string[] = [];
  let frac = 0;
  if (total === 0) {
    missing.push("recorded functional / non-functional requirements");
  } else {
    frac = (confirmed / total) * 0.8;
    if (s.requirements.every((r) => r.type === "functional")) {
      missing.push("non-functional requirements (performance, security, scale)");
    }
    if (confirmed < total) missing.push(`${total - confirmed} requirement(s) not yet confirmed`);
  }
  return { frac, missing };
}

function scoreUx(s: ProjectState): { frac: number; missing: string[] } {
  const keys = ["pages", "navigation", "workflow", "design", "responsive", "layout", "ux"];
  const hit = Object.entries(s.project.facts).some(([k, v]) => {
    const blob = (k + " " + v).toLowerCase();
    return keys.some((key) => blob.includes(key));
  });
  const hasStory = s.project.userStories.length > 0;
  const missing: string[] = [];
  let frac = 0;
  if (hasStory) frac += 0.5;
  else missing.push("the key user workflows / pages");
  if (hit) frac += 0.5;
  else missing.push("UX / page / navigation preferences");
  return { frac, missing };
}

function scoreArchitecture(s: ProjectState): { frac: number; missing: string[] } {
  const a = s.architecture;
  const items = [a.frontend, a.backend, a.database, a.auth];
  const met = items.filter((v) => v && v.length > 0).length;
  const missing: string[] = [];
  if (!a.database) missing.push("a database / storage approach");
  if (!a.auth) missing.push("an authentication approach");
  if (!a.backend) missing.push("a backend / API approach");
  if (!a.frontend) missing.push("a frontend approach");
  return { frac: met / items.length, missing };
}

function scoreSecurity(s: ProjectState): { frac: number; missing: string[] } {
  const sec = s.security;
  const items = [sec.authModel, sec.accessControl, sec.sensitiveData];
  const met = items.filter((v) => v && v.length > 0).length;
  const missing: string[] = [];
  if (met < items.length) {
    if (!sec.accessControl) missing.push("an access-control model");
    if (!sec.sensitiveData) missing.push("which data is sensitive and how it is protected");
  }
  return { frac: met / items.length, missing };
}

function scoreTesting(s: ProjectState): { frac: number; missing: string[] } {
  const t = s.testing;
  const items: (string | undefined)[] = [
    t.criticalWorkflows?.length ? "w" : undefined,
    t.acceptanceCriteria?.length ? "a" : undefined,
  ];
  const met = items.filter(Boolean).length;
  const missing: string[] = [];
  if (!t.criticalWorkflows?.length) missing.push("which workflows must be tested");
  if (!t.acceptanceCriteria?.length) missing.push("acceptance criteria");
  return { frac: met / 2, missing };
}

function scoreDeployment(s: ProjectState): { frac: number; missing: string[] } {
  const d = s.deployment;
  const items = [d.target, d.environmentVariables?.length ? "e" : undefined];
  const met = items.filter(Boolean).length;
  const missing: string[] = [];
  if (!d.target) missing.push("a deployment target");
  if (!d.environmentVariables?.length) missing.push("the environment variables the app needs");
  return { frac: met / 2, missing };
}

function scoreDecisions(s: ProjectState): { frac: number; missing: string[] } {
  const total = s.decisions.length + s.assumptions.length;
  const resolved =
    s.decisions.filter((d) => d.status === "accepted").length +
    s.assumptions.filter((a) => a.status !== "pending").length;
  const missing: string[] = [];
  let frac = 0;
  if (total === 0) {
    missing.push("key architectural decisions recorded");
  } else {
    const pendingAssumptions = s.assumptions.filter((a) => a.status === "pending").length;
    frac = total ? resolved / total : 0;
    if (pendingAssumptions > 0) missing.push(`${pendingAssumptions} assumption(s) still pending`);
  }
  return { frac, missing };
}

const CATEGORY_BUILDERS: {
  key: keyof typeof WEIGHTS;
  label: string;
  fn: (s: ProjectState) => { frac: number; missing: string[] };
}[] = [
  { key: "project", label: "Project definition", fn: scoreProject },
  { key: "users", label: "Users", fn: scoreUsers },
  { key: "features", label: "Core features", fn: scoreFeatures },
  { key: "requirements", label: "Requirements", fn: scoreRequirements },
  { key: "ux", label: "UX / workflows", fn: scoreUx },
  { key: "architecture", label: "Architecture", fn: scoreArchitecture },
  { key: "security", label: "Security", fn: scoreSecurity },
  { key: "testing", label: "Testing", fn: scoreTesting },
  { key: "deployment", label: "Deployment", fn: scoreDeployment },
  { key: "decisions", label: "Decisions & assumptions", fn: scoreDecisions },
];

// Categories that gate "interview can complete".
const GATING = new Set(["features", "requirements", "architecture"]);

export function computeReadiness(state: ProjectState): ReadinessResult {
  assertWeights();
  const categories: ReadinessCategory[] = CATEGORY_BUILDERS.map((b) => {
    const { frac, missing } = b.fn(state);
    const clamped = Math.max(0, Math.min(1, frac));
    return {
      key: b.key,
      label: b.label,
      weight: WEIGHTS[b.key],
      score: clamped,
      satisfied: clamped >= 0.999,
      missing,
    };
  });

  const ratio = categories.reduce((sum, c) => sum + c.score * c.weight, 0);
  const percent = Math.round(ratio * 100);

  const criticalMissing = categories
    .filter((c) => c.key === "features" || c.key === "requirements" || c.key === "architecture")
    .flatMap((c) => c.missing.map((m) => `[${c.label}] ${m}`));

  const optionalRemaining = categories
    .filter((c) => !GATING.has(c.key))
    .flatMap((c) => c.missing.map((m) => m));

  const gatingSatisfied = categories
    .filter((c) => GATING.has(c.key))
    .every((c) => c.score >= 0.6);

  return {
    percent,
    ratio,
    categories,
    criticalMissing,
    optionalRemaining,
    canComplete: gatingSatisfied && criticalMissing.length === 0,
  };
}
