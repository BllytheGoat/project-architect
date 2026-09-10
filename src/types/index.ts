// Single source of truth for domain types, re-exported from the Zod schemas
// so the UI and services never re-declare them.
import type {
  ParsedProjectState,
  FeatureInput,
  RequirementInput,
  DecisionInput,
  AssumptionInput,
  RecommendationInput,
  ConflictInput,
  QuestionInput,
  IdeaAnalysis,
  PlannerResponse,
  StateUpdate,
} from "@/lib/validation/schemas";

export type ProjectState = ParsedProjectState;
export type Feature = FeatureInput;
export type Requirement = RequirementInput;
export type Decision = DecisionInput;
export type Assumption = AssumptionInput;
export type Recommendation = RecommendationInput;
export type Conflict = ConflictInput;
export type Question = QuestionInput;
export type PlannerMessage = PlannerResponse;
export type {
  PlannerResponse,
  StateUpdate,
  IdeaAnalysis,
};

export type Priority = "critical" | "high" | "medium" | "low";

export const emptyState = (): ProjectState => ({
  project: {
    name: "",
    description: "",
    problem: "",
    goals: [],
    targetUsers: [],
    successCriteria: [],
    userStories: [],
    facts: {},
  },
  features: [],
  requirements: [],
  decisions: [],
  assumptions: [],
  recommendations: [],
  conflicts: [],
  architecture: {},
  technology: {},
  security: {},
  testing: {},
  deployment: {},
  version: 1,
});

/** Build a fresh state seeded from a rough idea string. */
export const seedState = (idea: string): ProjectState => ({
  ...emptyState(),
  project: { ...emptyState().project, description: idea },
  version: 1,
});
