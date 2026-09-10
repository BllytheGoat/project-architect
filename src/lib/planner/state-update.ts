// The state-update pipeline. Pure: takes a ProjectState + a validated
// PlannerResponse and returns a new state. Idempotent in the sense that
// applying the same logical update twice does not duplicate requirements,
// features, decisions, or assumptions.

import type { ProjectState } from "@/types";
import {
  stateUpdateSchema,
  plannerResponseSchema,
  type PlannerResponse,
} from "@/lib/validation/schemas";

// Local helper for IDs. Uses the Web Crypto global available in Node 19+.
const uuidv4 = () => crypto.randomUUID();

/**
 * Deterministic, human-readable IDs for FR/NFR requirements:
 * FR-001, FR-002, ... NFR-001, ...
 */
export function nextRequirementId(state: ProjectState, type: "functional" | "non_functional"): string {
  const prefix = type === "functional" ? "FR" : "NFR";
  const nums = state.requirements
    .filter((r) => r.id.startsWith(prefix + "-"))
    .map((r) => parseInt(r.id.slice(prefix.length + 1), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

export function nextAssumptionId(state: ProjectState): string {
  const nums = state.assumptions
    .map((a) => parseInt(a.id.replace("A-", ""), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `A-${String(next).padStart(3, "0")}`;
}

function sameFeature(a: ProjectState["features"][number], b: ProjectState["features"][number]) {
  return a.name.toLowerCase().trim() === b.name.toLowerCase().trim();
}
function sameRequirement(a: ProjectState["requirements"][number], b: ProjectState["requirements"][number]) {
  return a.title.toLowerCase().trim() === b.title.toLowerCase().trim() && a.type === b.type;
}
function sameDecision(a: ProjectState["decisions"][number], b: ProjectState["decisions"][number]) {
  return a.topic.toLowerCase().trim() === b.topic.toLowerCase().trim();
}
function sameAssumption(a: ProjectState["assumptions"][number], b: ProjectState["assumptions"][number]) {
  return a.statement.toLowerCase().trim() === b.statement.toLowerCase().trim();
}

/**
 * Apply one validated update. Returns a *new* state (input is not mutated).
 * If the update is a no-op (duplicate), the state is returned unchanged.
 */
function applyUpdate(state: ProjectState, update: PlannerResponse["updates"][number]): ProjectState {
  const s = structuredClone(state);

  switch (update.op) {
    case "upsert_feature": {
      const feat = update.feature;
      const existing = s.features.find((f) => sameFeature(f, feat));
      if (existing) {
        let changed = false;
        // Idempotent: don't duplicate. Promote proposed -> confirmed if the
        // new one is confirmed, and fill a missing description.
        if (feat.status === "confirmed" && existing.status === "proposed") {
          existing.status = "confirmed";
          changed = true;
        }
        if (!existing.description && feat.description) {
          existing.description = feat.description;
          changed = true;
        }
        return changed ? s : state; // no-op returns the original reference
      }
      s.features.push(feat);
      return s;
    }
    case "upsert_requirement": {
      const req = update.requirement;
      const existing = s.requirements.find((r) => sameRequirement(r, req));
      if (existing) {
        let changed = false;
        if (req.status === "confirmed" && existing.status === "proposed") {
          existing.status = "confirmed";
          changed = true;
        }
        if (!existing.description && req.description) {
          existing.description = req.description;
          changed = true;
        }
        return changed ? s : state;
      }
      s.requirements.push(req);
      return s;
    }
    case "record_decision": {
      const d = update.decision;
      const existing = s.decisions.find((x) => sameDecision(x, d));
      if (existing) {
        // A "changed" decision overrides the previous one for the same topic.
        if (d.status === "changed") {
          existing.decision = d.decision;
          existing.reason = d.reason;
          existing.status = "accepted";
          existing.alternatives = d.alternatives ?? existing.alternatives;
          existing.source = d.source;
        }
      } else {
        s.decisions.push(d);
      }
      return s;
    }
    case "record_assumption": {
      const a = update.assumption;
      if (s.assumptions.some((x) => sameAssumption(x, a))) {
        return state; // no-op
      }
      s.assumptions.push(a);
      return s;
    }
    case "record_recommendation": {
      const rec = update.recommendation;
      if (s.recommendations.some((r) => r.id === rec.id)) {
        // Replace in place (idempotent by id).
        const idx = s.recommendations.findIndex((r) => r.id === rec.id);
        s.recommendations[idx] = rec;
      } else {
        s.recommendations.push(rec);
      }
      return s;
    }
    case "add_goal":
      if (!s.project.goals.includes(update.goal)) s.project.goals.push(update.goal);
      return s;
    case "add_user":
      if (!s.project.targetUsers.includes(update.user)) s.project.targetUsers.push(update.user);
      return s;
    case "add_success_criterion":
      if (!s.project.successCriteria.includes(update.criterion)) s.project.successCriteria.push(update.criterion);
      return s;
    case "add_user_story":
      if (!s.project.userStories.includes(update.story)) s.project.userStories.push(update.story);
      return s;
    case "set_fact":
      s.project.facts[update.key] = update.value;
      return s;
    case "set_problem":
      s.project.problem = update.value;
      return s;
    case "set_architecture":
      s.architecture = { ...s.architecture, ...update.architecture };
      return s;
    case "set_technology":
      s.technology = { ...s.technology, ...update.technology };
      return s;
    case "set_security":
      s.security = { ...s.security, ...update.security };
      return s;
    case "set_testing":
      s.testing = { ...s.testing, ...update.testing };
      return s;
    case "set_deployment":
      s.deployment = { ...s.deployment, ...update.deployment };
      return s;
    case "resolve_conflict": {
      const c = s.conflicts.find((x) => x.id === update.conflictId);
      if (c) {
        c.status = "resolved";
        c.resolution = update.resolution;
      }
      return s;
    }
  }
}

export interface Conflict {
  id: string;
  earlierTopic: string;
  earlierValue: string;
  laterTopic: string;
  laterValue: string;
}

/**
 * Heuristic conflict detection across a small set of high-signal axes.
 * Deterministic and cheap. Runs after each state update.
 */
export function detectConflicts(state: ProjectState): Conflict[] {
  const found: Conflict[] = [];
  const facts = state.project.facts;

  const anon = /anonymous/i.test(facts.authentication ?? "") ||
    state.project.goals.some((g) => /anonymou/i.test(g));
  const publicProfile = /public (profile|profiles|identit)/i.test(facts.users ?? "") ||
    state.project.userStories.some((u) => /public profile/i.test(u));
  if (anon && publicProfile) {
    found.push({
      id: uuidv4(),
      earlierTopic: "Authentication",
      earlierValue: "Users remain anonymous.",
      laterTopic: "Users",
      laterValue: "Users have public profiles.",
    });
  }

  const privateOnly = /only (owner|authors|registered)/i.test(facts.visibility ?? "");
  const publicNotes = /public(ly)? (share|note|post)/i.test(facts.visibility ?? "");
  if (privateOnly && publicNotes) {
    found.push({
      id: uuidv4(),
      earlierTopic: "Visibility",
      earlierValue: "Only owners can access content.",
      laterTopic: "Visibility",
      laterValue: "Content is publicly shareable.",
    });
  }

  // No duplicates.
  const existing = new Set(state.conflicts.map((c) => `${c.earlierTopic}|${c.earlierValue}|${c.laterValue}`));
  const merged = [...state.conflicts, ...found].filter((c) => !existing.has(`${c.earlierTopic}|${c.earlierValue}|${c.laterValue}`));
  return merged;
}

export interface ApplyResult {
  state: ProjectState;
  /** Number of real changes applied (0 if nothing changed). */
  changed: number;
}

/**
 * Validate + apply a PlannerResponse. Bumps `version` on any real change.
 * Throws if the response does not parse (callers catch and show a graceful
 * error; malformed output never reaches the DB).
 */
export function applyPlannerResponse(raw: unknown, base: ProjectState): ApplyResult {
  const parsed = plannerResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid planner response: ${issues}`);
  }
  const response = parsed.data;
  let state = base;
  let changed = 0;

  for (const u of response.updates) {
    stateUpdateSchema.parse(u); // re-validate defensively
    const next = applyUpdate(state, u);
    if (next !== state) changed += 1;
    state = next;
  }

  // Recommendations from the response (dedup by id).
  for (const rec of response.recommendations) {
    const existing = state.recommendations.find((r) => r.id === rec.id);
    if (!existing) {
      state = structuredClone(state);
      state.recommendations.push(rec);
      changed += 1;
    }
  }

  // Conflicts from the response + heuristic detection.
  const heuristics = detectConflicts(state);
  const seen = new Set(state.conflicts.map((c) => c.id));
  for (const c of [...response.conflicts, ...heuristics]) {
    if (!seen.has(c.id)) {
      state = structuredClone(state);
      state.conflicts.push({ ...c, status: "open" });
      seen.add(c.id);
      changed += 1;
    }
  }

  if (changed > 0) {
    state.version = base.version + 1;
  }
  return { state, changed };
}
