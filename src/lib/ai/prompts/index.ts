// Versioned prompt modules. Prompts receive structured state, not raw DB
// dumps, and are kept separate from UI components. Each exports a builder
// function so callers can assemble the exact context they need.
import type { ProjectState, PlannerResponse } from "@/types";

export const PROMPT_VERSION = "1.0.0";

/** Compact, stable serialization of the project context sent to the model. */
export function projectContext(state: ProjectState) {
  return {
    project: state.project,
    features: state.features,
    requirements: state.requirements,
    decisions: state.decisions,
    assumptions: state.assumptions,
    openConflicts: state.conflicts.filter((c) => c.status === "open"),
    architecture: state.architecture,
    security: state.security,
    version: state.version,
  };
}

export function ideaAnalyzerPrompt(idea: string): string {
  return [
    "Analyze the user's rough app idea and extract your best initial understanding.",
    "Do NOT invent features the user did not imply. Anything you cannot tell from the idea goes in `unknowns`.",
    "Respond with JSON: { projectNameSuggestion, summary, problem, targetUsers[], initialFeatures[], unknowns[] }",
    `Idea: ${idea}`,
  ].join("\n");
}

export function interviewerPrompt(state: ProjectState): string {
  return [
    "You are the interview engine. Given the current project state, pick the single most important question to ask next, or decide the interview can complete.",
    "",
    "Rules:",
    "- Ask ONE focused question at a time, via a structured question object.",
    "- Prefer questions whose answer materially changes architecture or product behavior.",
    "- Every question needs a `priority` and a short `reason`.",
    "- If the user previously said 'I'm not sure', follow up with a concrete recommendation (Recommendation / Reason / Alternatives / Tradeoffs).",
    "- If all critical unknowns are resolved, return action=complete.",
    "- Do NOT ask about low-impact cosmetics during the main interview.",
    "",
    "Respond with JSON matching the PlannerResponse schema:",
    "{ message, action: ask_question|record_information|recommend|resolve_conflict|complete, question?, updates[], recommendations[], conflicts[] }",
    "",
    `Current state (v${state.version}):`,
    JSON.stringify(projectContext(state), null, 2),
  ].join("\n");
}

export function answerInterpretationPrompt(state: ProjectState, question: unknown, answer: string): string {
  return [
    "Interpret the user's answer to the question and update the project state.",
    "Produce only the structured `updates[]` (and any new conflicts). Do not repeat what was already recorded.",
    "If the answer supports a recommendation, record it as a decision with source=ai_recommendation only when the user explicitly accepted it.",
    "",
    `Question: ${JSON.stringify(question)}`,
    `Answer: ${answer}`,
    `Current state (v${state.version}):`,
    JSON.stringify(projectContext(state), null, 2),
  ].join("\n");
}

export function conflictDetectionPrompt(state: ProjectState): string {
  return [
    "Review the project state for contradictions between recorded decisions, requirements, and facts.",
    "Report only genuine conflicts that would block implementation. Respond with JSON: { conflicts: Conflict[] } (empty array if none).",
    `State:`,
    JSON.stringify(projectContext(state), null, 2),
  ].join("\n");
}

export type { PlannerResponse };
