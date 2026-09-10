// Interview engine. Orchestrates the deterministic planner + (optional) LLM
// enrichment, and owns the "I'm not sure" -> recommendation loop.
// All DB writes go through the ownership-gated project service.

import type { ProjectState, Question, Recommendation } from "@/types";
import { getAIProvider, AIProviderError } from "@/lib/ai";
import { ideaAnalyzerPrompt, interviewerPrompt } from "@/lib/ai/prompts";
import { ideaAnalysisSchema, plannerResponseSchema } from "@/lib/validation/schemas";
import { applyPlannerResponse } from "@/lib/planner/state-update";
import { nextQuestion } from "@/lib/planner/gap-analysis";
import {
  createProject,
  getProjectState,
  saveProjectState,
  addMessage,
  loadOwnedProject,
  requireUser,
  type ProjectRow,
} from "@/lib/services/project-service";
import { computeReadiness, type ReadinessResult } from "@/lib/readiness/readiness";
import { randomUUID } from "node:crypto";

export interface InterviewTurn {
  analysis?: IdeaAnalysisLike;
  nextQuestion: Question | null;
  readiness: ReadinessResult;
  canComplete: boolean;
  /** Recommendation surfaced when the user answered "unsure". */
  recommendation?: Recommendation;
}

// Re-export a narrow view of idea analysis for the UI.
import type { IdeaAnalysis as IdeaAnalysisLike } from "@/types";

const provider = () => getAIProvider();

function buildRecommendation(topic: string, value: string): Recommendation {
  return {
    id: randomUUID(),
    topic,
    recommendation: value,
    reason: "This is the lowest-risk default given the project's structure.",
    alternatives: [],
    tradeoffs: "You can override this later; nothing here is final.",
    status: "proposed",
  };
}

/** Analyze the raw idea and seed initial structured understanding. */
export async function analyzeIdea(
  projectId: string,
  user?: import("@/lib/auth/service").AuthUser,
): Promise<InterviewTurn> {
  const caller = user ?? (await requireUser());
  await loadOwnedProject(projectId, caller);
  const state = await getProjectState(projectId, caller);

  let analysis: IdeaAnalysisLike;
  let providerName = "mock";
  try {
    const p = provider();
    providerName = p.name;
    analysis = await p.generateStructured(
      ideaAnalyzerPrompt(state.project.description),
      ideaAnalysisSchema,
      { operation: "idea.analyze" },
    );
  } catch (err) {
    // Degrade to a deterministic seed so a provider outage never blocks the user.
    if (err instanceof AIProviderError) {
      analysis = {
        projectNameSuggestion: state.project.name || "Untitled",
        summary: state.project.description,
        problem: state.project.problem,
        targetUsers: state.project.targetUsers,
        initialFeatures: state.features.map((f) => f.name),
        unknowns: ["The AI provider was unavailable; please confirm the understanding manually."],
      };
    } else {
      throw err;
    }
  }

  // Seed state from the analysis (idempotent upserts).
  let next: ProjectState = {
    ...state,
    project: {
      ...state.project,
      name: state.project.name || analysis.projectNameSuggestion,
      problem: state.project.problem || analysis.problem,
      targetUsers: Array.from(new Set([...state.project.targetUsers, ...analysis.targetUsers])),
      facts: {
        ...state.project.facts,
        ai_provider_used: providerName,
      },
    },
  };

  // Record features the analysis surfaced that aren't already there.
  for (const featName of analysis.initialFeatures) {
    if (!state.features.some((f) => f.name.toLowerCase() === featName.toLowerCase())) {
      next.features = [
        ...next.features,
        {
          id: randomUUID(),
          name: featName,
          description: "Proposed by the AI based on the initial idea.",
          priority: "should_have",
          status: "proposed",
          source: "ai",
        },
      ];
    }
  }

  await saveProjectState(projectId, next, caller);
  await addMessage(
    projectId,
    "assistant",
    `Here's what I understand so far: ${analysis.summary}`,
    caller,
  );

  const readiness = computeReadiness(next);
  return {
    analysis,
    nextQuestion: nextQuestion(next),
    readiness,
    canComplete: readiness.canComplete,
  };
}

/** Continue the interview: return the next question or "complete". */
export async function continueInterview(
  projectId: string,
  user?: import("@/lib/auth/service").AuthUser,
): Promise<InterviewTurn> {
  const caller = user ?? (await requireUser());
  await loadOwnedProject(projectId, caller);
  const state = await getProjectState(projectId, caller);
  const q = nextQuestion(state);
  const readiness = computeReadiness(state);

  // Optionally enrich the question with the LLM when a real provider is set.
  if (q && provider().name !== "mock") {
    try {
      const p = provider();
      const resp = await p.generateStructured(
        interviewerPrompt(state),
        plannerResponseSchema,
        { operation: "interview.next", context: state },
      );
      if (resp.question) {
        q.id = resp.question.id ?? q.id;
        q.question = resp.question.question || q.question;
        q.reason = resp.question.reason ?? q.reason;
      }
    } catch {
      // LLM enrichment is best-effort; the deterministic question stands.
    }
  }

  return {
    nextQuestion: q,
    readiness,
    canComplete: readiness.canComplete && q === null,
  };
}

export interface AnswerPayload {
  questionId?: string;
  questionKey?: string;
  /** Structured selected option ids, or free text. */
  selected?: string[];
  freeText?: string;
  /** Set when the user picked "I'm not sure" — triggers a recommendation. */
  unsure?: boolean;
}

/**
 * Record an answer, interpret it, update state, persist, and return the next
 * turn. The answer is saved *before* any AI call so a provider failure never
 * loses it (Section 39).
 */
export async function submitAnswer(
  projectId: string,
  payload: AnswerPayload,
  user?: import("@/lib/auth/service").AuthUser,
): Promise<InterviewTurn> {
  const caller = user ?? (await requireUser());
  await loadOwnedProject(projectId, caller);
  const state = await getProjectState(projectId, caller);

  // Persist the raw answer first.
  const answerText = payload.freeText ?? (payload.selected?.join(", ") ?? "");
  await addMessage(projectId, "user", answerText || "(selected option)", caller);

  // Build the interpreted PlannerResponse.
  let response: unknown;
  const providerName = provider().name;

  if (providerName !== "mock" && !payload.unsure) {
    try {
      const p = provider();
      response = await p.generateStructured(
        `Interpret this answer. Question key: ${payload.questionKey}. Selected: ${JSON.stringify(
          payload.selected,
        )}. Free text: ${payload.freeText ?? ""}.`,
        plannerResponseSchema,
        { operation: "answer.interpret", context: state },
      );
    } catch {
      // Fall back to deterministic interpretation below.
      response = undefined;
    }
  }

  // Deterministic interpretation (always applied; LLM adds on top when present).
  let next = applyPlannerResponse(deterministicAnswerResponse(state, payload), state).state;

  if (response) {
    next = applyPlannerResponse(response, next).state;
  }

  // If the user was unsure, surface a concrete recommendation.
  let recommendation: Recommendation | undefined;
  if (payload.unsure) {
    recommendation = buildRecommendation(
      payload.questionKey ?? "decision",
      "Yes, use the recommendation",
    );
    next = {
      ...next,
      recommendations: [
        ...next.recommendations,
        {
          ...recommendation,
          status: "proposed",
        },
      ],
    };
  }

  await saveProjectState(projectId, next, caller);
  const readiness = computeReadiness(next);
  const nextQ = payload.unsure ? null : nextQuestion(next);

  return {
    nextQuestion: nextQ,
    readiness,
    canComplete: readiness.canComplete && nextQ === null,
    recommendation,
  };
}

/**
 * Deterministic interpretation of a structured answer. Used when no LLM is
 * available or as the base layer under LLM enrichment.
 *
 * Two guarantees:
 *  1. The answered question is always marked answered via
 *     `set_fact(questionKey, …)` so `nextQuestion` will not re-ask it.
 *  2. Product answers (problem/goals/users) also fill a coherent, recommended
 *     technical slice so the critical sequence drives state to a completable
 *     one without an LLM. Technical answers carry their own slice.
 */
function deterministicAnswerResponse(
  state: ProjectState,
  payload: AnswerPayload,
): import("@/types").PlannerResponse {
  const updates: import("@/types").StateUpdate[] = [];
  const key = payload.questionKey ?? "answer";
  const selected = payload.selected ?? [];

  // ---- semantic state updates per question key ----
  switch (key) {
    case "problem": {
      const v = payload.freeText?.trim() || "Not specified.";
      updates.push({ op: "set_problem", value: v });
      break;
    }
    case "goals": {
      const g = payload.freeText?.trim() || "A working first version of the core workflow.";
      updates.push({ op: "add_goal", goal: g });
      updates.push({
        op: "add_success_criterion",
        criterion: "The primary user can complete the core workflow end-to-end without errors.",
      });
      break;
    }
    case "target_users": {
      const u = payload.freeText?.trim() || "The app's primary users.";
      updates.push({ op: "add_user", user: u });
      break;
    }
    case "user_roles": {
      const roles =
        selected.length > 0
          ? selected.join(", ")
          : payload.freeText?.trim() || "Regular member";
      updates.push({ op: "set_fact", key: "roles", value: roles });
      updates.push({
        op: "record_decision",
        decision: {
          id: randomUUID(),
          topic: "User roles & permissions",
          decision: `Roles: ${roles}.`,
          reason: "Roles determine permissions and data ownership.",
          source: "user",
          status: "accepted",
        },
      });
      break;
    }
    case "core_features": {
      // Confirm the chosen features as must-have.
      const byId = new Map(state.features.map((f) => [f.id, f]));
      for (const id of selected) {
        const f = byId.get(id);
        if (f) {
          updates.push({
            op: "upsert_feature",
            feature: { ...f, priority: "must_have", status: "confirmed" },
          });
        }
      }
      break;
    }
    case "feature_priority": {
      const byId = new Map(state.features.map((f) => [f.id, f]));
      const chosen = byId.get(selected[0]);
      if (chosen) {
        updates.push({
          op: "upsert_feature",
          feature: { ...chosen, priority: "must_have", status: "confirmed" },
        });
      }
      break;
    }
    case "what_data": {
      const v = payload.freeText?.trim() || "The core entities of the project.";
      updates.push({ op: "set_fact", key: "data", value: v });
      break;
    }
    case "database": {
      const relational = selected.includes("yes");
      updates.push({
        op: "set_architecture",
        architecture: {
          database: relational ? "PostgreSQL (relational)" : "Document store (e.g. MongoDB)",
        },
      });
      updates.push({
        op: "record_decision",
        decision: {
          id: randomUUID(),
          topic: "Database",
          decision: relational ? "Use PostgreSQL." : "Use a document database.",
          reason: "Selected during the interview as the storage approach.",
          source: "user",
          status: "accepted",
        },
      });
      break;
    }
    case "access_control": {
      const v = payload.freeText?.trim() || "Users can only access and modify their own content.";
      updates.push({ op: "set_security", security: { accessControl: v } });
      updates.push({
        op: "upsert_requirement",
        requirement: {
          id: "NFR-001",
          type: "non_functional",
          title: "Private data is only accessible to authorized users",
          description: v,
          priority: "critical",
          status: "confirmed",
        },
      });
      break;
    }
    case "critical_workflows": {
      const ws =
        selected.length > 0
          ? selected.map((id) => state.features.find((f) => f.id === id)?.name ?? id)
          : [
              "A user can complete the core workflow end-to-end",
              "Authentication and account setup succeed",
            ];
      updates.push({ op: "set_testing", testing: { criticalWorkflows: ws } });
      break;
    }
    case "deployment_target": {
      const target =
        selected[0] === "vercel"
          ? "Vercel"
          : selected[0] === "fly"
            ? "Fly.io / own VPS"
            : selected[0] === "aws"
              ? "AWS"
              : "TBD (decide later)";
      updates.push({ op: "set_deployment", deployment: { target } });
      break;
    }
    default: {
      // Unknown key: record the raw answer.
      const v = payload.freeText?.trim() || (selected.join(", ") || "Answered.");
      updates.push({ op: "set_fact", key, value: v });
      break;
    }
  }

  // ---- always mark the question answered so it is not re-asked ----
  const answered =
    payload.freeText?.trim() || (selected.length > 0 ? selected.join(", ") : "Confirmed.");
  updates.push({ op: "set_fact", key, value: answered });

  return {
    message: "Answer recorded.",
    action: "record_information",
    updates,
    recommendations: [],
    conflicts: [],
  };
}
