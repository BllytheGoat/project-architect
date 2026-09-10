// Deterministic gap analysis. Pure and testable: given a ProjectState,
// produce the prioritized list of structured questions the interview engine
// should ask. This is the fallback (and test) path; the LLM layer can enrich
// it, but correctness never depends on the model.

import type { ProjectState, Question } from "@/types";
import { randomUUID } from "node:crypto";

export type Gap = Omit<Question, "id" | "status">;

/**
 * Produce candidate questions from state, highest priority first.
 * A gap appears when a state axis is still empty / unresolved.
 */
export function analyzeGaps(state: ProjectState): Gap[] {
  const gaps: Gap[] = [];
  const p = state.project;

  // Product definition
  if (!p.problem) {
    gaps.push({
      questionKey: "problem",
      type: "free_text",
      question: "What specific problem is this project solving for your users?",
      priority: "high",
      reason: "A clear problem statement drives every later decision.",
      category: "product",
    });
  }
  if (p.goals.length === 0) {
    gaps.push({
      questionKey: "goals",
      type: "free_text",
      question: "What does success look like? What should the finished app do best?",
      priority: "high",
      reason: "Goals let us prioritize features and cut scope.",
      category: "product",
    });
  }
  if (p.targetUsers.length === 0) {
    gaps.push({
      questionKey: "target_users",
      type: "free_text",
      question: "Who is this app for? Describe the main user(s).",
      priority: "high",
      reason: "Target users shape features, roles, and language.",
      category: "users",
    });
  }

  // Users / roles
  const hasRoles =
    state.decisions.some((d) => /role|permission|access/i.test(d.topic + d.decision)) ||
    p.facts.roles?.length > 0;
  if (state.features.some((f) => /account|user|profile|login|auth/i.test(f.name + f.description)) && !hasRoles) {
    gaps.push({
      questionKey: "user_roles",
      type: "multi_choice",
      question: "Which user roles does the app need?",
      options: [
        { id: "member", label: "Regular member" },
        { id: "admin", label: "Administrator" },
        { id: "guest", label: "Guest (no account)" },
        { id: "creator", label: "Content creator" },
      ],
      priority: "high",
      reason: "Roles determine permissions and data ownership.",
      category: "users",
    });
  }

  // Features
  const confirmedMust = state.features.filter((f) => f.priority === "must_have" && f.status === "confirmed");
  if (confirmedMust.length === 0) {
    gaps.push({
      questionKey: "core_features",
      type: "multi_choice",
      question: "Which features are must-have for the first version?",
      options: state.features.length
        ? state.features.map((f) => ({ id: f.id, label: f.name }))
        : undefined,
      priority: "critical",
      reason: "Core features define the MVP scope.",
      category: "features",
    });
  }
  const hasPriority = state.features.some((f) => f.priority !== "must_have");
  if (state.features.length > 1 && !hasPriority) {
    gaps.push({
      questionKey: "feature_priority",
      type: "single_choice",
      question: "If you could only ship one feature first, which is it?",
      options: state.features.slice(0, 8).map((f) => ({ id: f.id, label: f.name })),
      priority: "high",
      reason: "Choosing the first feature sets the build order.",
      category: "features",
    });
  }

  // Data
  const dataFacts = Object.values(p.facts).some((v) => /data|database|storage|file|record|relation/i.test(v));
  if (state.architecture.database === undefined && state.features.length > 0 && !dataFacts) {
    gaps.push({
      questionKey: "what_data",
      type: "free_text",
      question: "What pieces of information does the app need to store long-term?",
      priority: "high",
      reason: "Stored data drives the database schema.",
      category: "data",
    });
  }

  // Architecture decisions
  if (state.architecture.database === undefined) {
    gaps.push({
      questionKey: "database",
      type: "yes_no",
      question: "Is a relational database (like PostgreSQL) a good fit here, or do you prefer document storage?",
      priority: "medium",
      reason: "Database choice is a major architecture decision.",
      category: "technical",
    });
  }

  // Security
  if (state.security.accessControl === undefined && state.features.length > 0) {
    gaps.push({
      questionKey: "access_control",
      type: "free_text",
      question: "Who can see or change what data? For example, can users only access their own content?",
      priority: "high",
      reason: "Access control prevents data leaks and abuse.",
      category: "security",
    });
  }

  // Testing
  if (state.testing.criticalWorkflows?.length === 0) {
    gaps.push({
      questionKey: "critical_workflows",
      type: "multi_choice",
      question: "Which workflows must definitely be tested before release?",
      priority: "medium",
      reason: "Testing the critical paths protects quality.",
      category: "testing",
    });
  }

  // Deployment
  if (state.deployment.target === undefined) {
    gaps.push({
      questionKey: "deployment_target",
      type: "single_choice",
      question: "Where should this app run in production?",
      options: [
        { id: "vercel", label: "Vercel" },
        { id: "fly", label: "Fly.io / own VPS" },
        { id: "aws", label: "AWS" },
        { id: "later", label: "Decide later" },
      ],
      priority: "low",
      reason: "Deployment target affects env vars and CI.",
      category: "deployment",
    });
  }

  return gaps;
}

/** Return the single next question, or null when nothing critical/high remains. */
export function nextQuestion(state: ProjectState): Question | null {
  const answeredKeys = new Set(
    Object.keys(state.project.facts).filter((k) => state.project.facts[k]),
  );
  const answeredByRequirements = new Set(state.requirements.map((r) => r.id));

  // Skip questions already answered via a fact of the same key.
  const candidates = analyzeGaps(state).filter((g) => !answeredKeys.has(g.questionKey));

  const rank = (p: Question["priority"]) =>
    p === "critical" ? 0 : p === "high" ? 1 : p === "medium" ? 2 : 3;
  candidates.sort((a, b) => rank(a.priority) - rank(b.priority));

  const chosen = candidates.find((c) => c.priority === "critical" || c.priority === "high");
  if (!chosen) return null;

  return {
    ...chosen,
    id: randomUUID(),
    status: "pending",
  };
}

/** True when no critical/high question remains and state is coherent. */
export function interviewCanComplete(state: ProjectState): boolean {
  const q = nextQuestion(state);
  return q === null;
}
