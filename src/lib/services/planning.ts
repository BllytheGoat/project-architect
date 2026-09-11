// Planning service. Orchestrates the Phase 2 planning operations, all gated
// by ownership, all deterministic. The AI is optional enrichment only; every
// result is validated before it can touch state.

import { query, withClient } from "@/lib/db/client";
import {
  getProjectState,
  saveProjectState,
  loadOwnedProject,
  requireUser,
  type ProjectRow,
} from "@/lib/services/project-service";
import type { AuthUser } from "@/lib/auth/service";
import type { ProjectState, StateUpdate, Conflict } from "@/types";
import {
  applyPlannerResponse,
  detectConflicts,
} from "@/lib/planner/state-update";
import {
  generateAllPlanningSections,
  sectionGenerators,
  ensureRefs,
} from "@/lib/planner/planner";
import {
  detectAdvancedConflicts,
  hasCriticalOpenConflict,
  type AdvancedConflict,
} from "@/lib/planner/conflicts";
import { computeReadiness2, type Readiness2 } from "@/lib/readiness/readiness2";
import { reviewProject, type PlanQuality } from "@/lib/planner/quality";
import { renderAllDocuments } from "@/lib/export/documents";
import { validateExport, type IntegrityResult } from "@/lib/export/integrity";
import { makeZip } from "@/lib/export/zip";
import { classifyComplexity } from "@/lib/planner/ids";

export interface PlanSummary {
  state: ProjectState;
  readiness: Readiness2;
  quality: PlanQuality;
  criticalOpenConflicts: number;
  buildReady: boolean;
}

export interface GeneratedPlan extends PlanSummary {
  docs: Record<string, string>;
  docOrder: string[];
  zip: Buffer;
  integrity: IntegrityResult;
  planVersion: number;
}

/** Merge a list of validated updates into state, bumping version on change. */
function applyOps(state: ProjectState, ops: StateUpdate[]): ProjectState {
  if (!ops.length) return state;
  const { state: next } = applyPlannerResponse(
    {
      message: "planner",
      action: "record_information",
      updates: ops,
      recommendations: [],
      conflicts: [],
    },
    state,
  );
  // applyPlannerResponse also folds in heuristic conflicts already; return next.
  return next;
}

/** Deterministically append the advanced cross-entity conflicts to state. */
function withAdvancedConflicts(state: ProjectState): ProjectState {
  const advanced = detectAdvancedConflicts(state);
  if (!advanced.length) return state;
  const sig = (c: { earlierTopic: string; earlierValue: string; laterValue: string }) =>
    `${c.earlierTopic}|${c.earlierValue}|${c.laterValue}`;
  const seen = new Set(state.conflicts.map(sig));
  const toAdd = advanced.filter((c) => !seen.has(sig(c)));
  if (!toAdd.length) return state;
  const merged: Conflict[] = [
    ...state.conflicts,
    ...toAdd.map((c: AdvancedConflict): Conflict => ({
      id: c.id,
      earlierTopic: c.earlierTopic,
      earlierValue: c.earlierValue,
      laterTopic: c.laterTopic,
      laterValue: c.laterValue,
      status: "open",
      severity: c.severity,
      suggestedResolution: c.suggestedResolution,
      entities: c.entities,
    })),
  ];
  return { ...state, conflicts: merged };
}

export async function loadStateForPlanning(
  projectId: string,
  user?: AuthUser,
): Promise<{ state: ProjectState; row: ProjectRow; caller: AuthUser }> {
  const caller = user ?? (await requireUser());
  const row = await loadOwnedProject(projectId, caller);
  const state = await getProjectState(projectId, caller);
  return { state, row, caller };
}

/**
 * Run the deterministic planners for a section (or all) and persist. This is
 * the "Ask AI to analyze" path: it stands alone — the mock/no-AI flow always
 * works, and a live model only enriches.
 */
export async function generateSection(
  projectId: string,
  section?: string,
  user?: AuthUser,
): Promise<PlanSummary> {
  const { caller } = await loadStateForPlanning(projectId, user);
  const { state } = await loadStateForPlanning(projectId, caller);

  let ops: StateUpdate[];
  if (section && section in sectionGenerators) {
    ops = [...ensureRefs(state), ...sectionGenerators[section](state)];
  } else {
    ops = [...ensureRefs(state), ...generateAllPlanningSections(state)];
  }

  let next = applyOps(state, ops);
  next = withAdvancedConflicts(next);
  next = structuredClone(next);
  if (!next.complexity) next.complexity = classifyComplexity(next);

  await saveProjectState(projectId, next, caller);
  await recordAudit(projectId, "generate_section", section ?? "all", caller, next.version);

  const readiness = computeReadiness2(next);
  const quality = reviewProject(next);
  return {
    state: next,
    readiness,
    quality,
    criticalOpenConflicts: next.conflicts.filter(
      (c) => c.status === "open" && c.severity === "critical",
    ).length,
    buildReady: readiness.buildReady,
  };
}

export interface PlanVersionRow {
  version: number;
  reason: string;
  state_version: number;
  doc_count: number;
  created_at: string;
}

/**
 * Generate every export document, run integrity checks, build the ZIP, and
 * record a plan version. Used by the Export screen and the ZIP download.
 */
export async function generateFullPlan(
  projectId: string,
  reason: string,
  user?: AuthUser,
): Promise<GeneratedPlan> {
  const { caller, state: loaded } = await loadStateForPlanning(projectId, user);

  let state = applyOps(loaded, [
    ...ensureRefs(loaded),
    ...generateAllPlanningSections(loaded),
  ]);
  state = withAdvancedConflicts(state);
  state = structuredClone(state);
  if (!state.complexity) state.complexity = classifyComplexity(state);
  await saveProjectState(projectId, state, caller);

  const { files, order } = renderAllDocuments(state);
  const integrity = validateExport(state, files);
  const zip = makeZip(files);

  const readiness = computeReadiness2(state);
  const quality = reviewProject(state);

  const planVersion = await recordPlanVersion(projectId, state, reason, order.length);
  await recordAudit(projectId, "generate_plan", reason, caller, state.version);

  return {
    state,
    readiness,
    quality,
    criticalOpenConflicts: state.conflicts.filter(
      (c) => c.status === "open" && c.severity === "critical",
    ).length,
    buildReady: readiness.buildReady,
    docs: files,
    docOrder: order,
    zip,
    integrity,
    planVersion,
  };
}

export async function getPlanVersions(
  projectId: string,
  user?: AuthUser,
): Promise<PlanVersionRow[]> {
  await loadOwnedProject(projectId, user);
  const res = await query<PlanVersionRow>(
    "SELECT version, reason, state_version, doc_count, created_at FROM plan_versions WHERE project_id = $1 ORDER BY version DESC",
    [projectId],
  );
  return res.rows;
}

async function recordPlanVersion(
  projectId: string,
  state: ProjectState,
  reason: string,
  docCount: number,
): Promise<number> {
  let version = 0;
  await withClient(async (c) => {
    const max = await c.query<{ m: string | null }>(
      "SELECT MAX(version) AS m FROM plan_versions WHERE project_id = $1",
      [projectId],
    );
    version = (parseInt(max.rows[0]?.m ?? "0", 10) || 0) + 1;
    await c.query(
      `INSERT INTO plan_versions (project_id, version, reason, state_version, doc_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, version) DO UPDATE
         SET reason = EXCLUDED.reason,
             state_version = EXCLUDED.state_version,
             doc_count = EXCLUDED.doc_count`,
      [projectId, version, reason, state.version, docCount],
    );
  });
  return version;
}

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  summary: string;
  entities: string[];
  version: number;
  created_at: string;
}

export async function getAuditLog(
  projectId: string,
  user?: AuthUser,
): Promise<AuditRow[]> {
  await loadOwnedProject(projectId, user);
  const res = await query<AuditRow>(
    `SELECT id, actor, action, summary, entities, version, created_at
     FROM audit_events WHERE project_id = $1 ORDER BY id DESC LIMIT 100`,
    [projectId],
  );
  return res.rows;
}

async function recordAudit(
  projectId: string,
  action: string,
  summary: string,
  user: AuthUser | undefined,
  version: number,
  entities: string[] = [],
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events (project_id, actor, action, summary, entities, version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, user ? "user" : "system", action, summary, JSON.stringify(entities), version],
    );
  } catch {
    // Audit is best-effort; never block a state mutation on it.
  }
}

// Re-export so routes have one import site.
export { hasCriticalOpenConflict };
export { detectConflicts as detectHeuristicConflicts };

/**
 * Read-only summary: current state + Readiness 2.0 + quality, no persistence.
 * Used by the planning screen and the Export/Review dashboards.
 */
export async function summarizePlan(
  projectId: string,
  user?: AuthUser,
): Promise<PlanSummary> {
  const { caller, state } = await loadStateForPlanning(projectId, user);
  void caller;
  const readiness = computeReadiness2(state);
  const quality = reviewProject(state);
  return {
    state,
    readiness,
    quality,
    criticalOpenConflicts: state.conflicts.filter(
      (c) => c.status === "open" && c.severity === "critical",
    ).length,
    buildReady: readiness.buildReady,
  };
}

/**
 * Manual editing (§49). Applies a single validated StateUpdate through the
 * same pipeline as AI mutations, re-detects conflicts, recalculates readiness,
 * and records an audit event. The `op` is parsed against stateUpdateSchema so
 * malformed input can never reach state. Throws a validation error otherwise.
 */
export async function applyManualUpdate(
  projectId: string,
  op: unknown,
  user?: AuthUser,
): Promise<PlanSummary> {
  const { stateUpdateSchema } = await import("@/lib/validation/schemas");
  const parsed = stateUpdateSchema.safeParse(op);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid update: ${issues}`);
  }
  const caller = user ?? (await requireUser());
  await loadOwnedProject(projectId, caller);
  const { state } = await loadStateForPlanning(projectId, caller);

  let next = applyOps(state, [parsed.data]);
  next = withAdvancedConflicts(next);
  next = structuredClone(next);
  if (!next.complexity) next.complexity = classifyComplexity(next);
  await saveProjectState(projectId, next, caller);
  await recordAudit(projectId, "manual_edit", parsed.data.op, caller, next.version);

  const readiness = computeReadiness2(next);
  const quality = reviewProject(next);
  return {
    state: next,
    readiness,
    quality,
    criticalOpenConflicts: next.conflicts.filter(
      (c) => c.status === "open" && c.severity === "critical",
    ).length,
    buildReady: readiness.buildReady,
  };
}
