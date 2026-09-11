// Conversational editing (§22). After a plan exists, the user can say
// "Actually, I don't want Google login anymore." The AI identifies the affected
// decision, proposes an impact analysis, and the user confirms before large
// cascades are applied. Manual editing stays available (routes in §56).
//
// The flow (§21): identify change -> impact analysis -> show affected entities
// -> user confirms -> apply -> recalc readiness -> new plan version.

import {
  getProjectState,
  saveProjectState,
  loadOwnedProject,
  requireUser,
} from "@/lib/services/project-service";
import type { AuthUser } from "@/lib/auth/service";
import type { ProjectState, Conflict } from "@/types";
import { analyzeChangeImpact, type ImpactReport } from "@/lib/planner/impact";
import { withClient, query } from "@/lib/db/client";
import { computeReadiness2, type Readiness2 } from "@/lib/readiness/readiness2";
import { hasCriticalOpenConflict } from "@/lib/planner/conflicts";
import { addMessage } from "@/lib/services/project-service";

export interface PendingChange {
  projectId: string;
  report: ImpactReport;
  requiresConfirmation: boolean;
  note: string;
}

/** Analyze a proposed change and return the impact report (no state mutation). */
export async function proposeChange(
  projectId: string,
  change: string,
  user?: AuthUser,
): Promise<PendingChange> {
  const caller = user ?? (await requireUser());
  await loadOwnedProject(projectId, caller);
  const state = await getProjectState(projectId, caller);
  const report = analyzeChangeImpact(change, state);
  return {
    projectId,
    report,
    requiresConfirmation: report.requiresConfirmation,
    note: `Proposed change: ${change}`,
  };
}

export interface AppliedChange {
  state: ProjectState;
  readiness: Readiness2;
  planVersion: number;
  report: ImpactReport;
}

/**
 * Apply a confirmed change: refresh affected planning sections, record a
 * decision capturing the change + impact, recalc readiness, and cut a new plan
 * version. `force` lets the UI bypass confirmation for low-impact changes.
 */
export async function applyChange(
  projectId: string,
  change: string,
  user?: AuthUser,
  force = false,
): Promise<AppliedChange> {
  const caller = user ?? (await requireUser());
  await loadOwnedProject(projectId, caller);
  const state = await getProjectState(projectId, caller);
  const report = analyzeChangeImpact(change, state);

  if (report.requiresConfirmation && !force) {
    throw new ConfirmationRequiredError(report);
  }

  let next = structuredClone(state);
  next.version = state.version + 1;

  // Record the change as a decision (source = user) so history is preserved.
  const { applyPlannerResponse } = await import("@/lib/planner/state-update");
  const decisionId = crypto.randomUUID();
  const { state: afterDecision } = applyPlannerResponse(
    {
      message: "conversational change",
      action: "record_information",
      updates: [
        {
          op: "record_decision",
          decision: {
            id: decisionId,
            topic: "Change request",
            decision: change,
            reason: `Impact level: ${report.level}. Affected: ${report.areas.map((a) => a.area).join(", ") || "general state"}.`,
            source: "user",
            status: "accepted",
            impact: report.areas.map((a) => `${a.area}: ${a.detail}`),
          },
        },
      ],
      recommendations: [],
      conflicts: [],
    },
    next,
  );
  next = afterDecision;

  // If the change touches a visibility/auth/security area, flag it as a conflict
  // candidate deterministically (never silently).
  if (/public|private|anonymous|google|login/i.test(change)) {
    const newConflict: Conflict = {
      id: crypto.randomUUID(),
      earlierTopic: "Change request",
      earlierValue: change,
      laterTopic: "Existing plan",
      laterValue: "The current plan reflects the prior behavior.",
      status: "open",
      severity: report.level === "high" ? "high" : "medium",
      suggestedResolution:
        "Confirm the intended behavior and refresh the affected sections.",
    };
    next.conflicts = [...next.conflicts, newConflict];
    next.version = state.version + 2;
  }

  await saveProjectState(projectId, next, caller);
  await addMessage(projectId, "user", change, caller);
  await addMessage(
    projectId,
    "assistant",
    `Applied change (impact ${report.level}). Affected areas: ${report.areas.map((a) => a.area).join(", ") || "general state"}. Readiness and plan re-evaluated.`,
    caller,
  );
  await recordAuditRow(projectId, "apply_change", change, caller.id, next.version);

  const readiness = computeReadiness2(next);
  const planVersion = await cutPlanVersion(projectId, next.version, `conversational change: ${change}`);

  return { state: next, readiness, planVersion, report };
}

export class ConfirmationRequiredError extends Error {
  constructor(public readonly report: ImpactReport) {
    super("This change is high-impact and requires explicit confirmation.");
    this.name = "ConfirmationRequiredError";
  }
}

async function recordAuditRow(
  projectId: string,
  action: string,
  summary: string,
  actorId: string,
  version: number,
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events (project_id, actor, action, summary, entities, version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, "user", action, summary, "[]", version],
    );
  } catch {
    // best-effort
  }
}

async function cutPlanVersion(
  projectId: string,
  stateVersion: number,
  reason: string,
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
      [projectId, version, reason, stateVersion, 0],
    );
  });
  return version;
}

export { hasCriticalOpenConflict };
