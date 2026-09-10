// Zod schemas for every structured object that crosses a trust boundary:
// AI structured output, API input, and database payloads.
// A parsed ProjectState is always a ProjectState — never `any`.

import { z } from "zod";

const priority = z.enum(["critical", "high", "medium", "low"]);
const featurePriority = z.enum(["must_have", "should_have", "nice_to_have"]);
const featureStatus = z.enum(["proposed", "confirmed"]);
const featureSource = z.enum(["user", "ai"]);
const requirementType = z.enum(["functional", "non_functional"]);
const requirementStatus = z.enum(["proposed", "confirmed"]);
const decisionStatus = z.enum(["accepted", "changed"]);
const decisionSource = z.enum(["user", "ai_recommendation"]);
const assumptionStatus = z.enum(["pending", "approved", "rejected"]);
const questionType = z.enum([
  "single_choice",
  "multi_choice",
  "free_text",
  "yes_no",
  "number",
]);
const questionStatus = z.enum(["pending", "answered", "skipped"]);
const questionCategory = z.enum([
  "product",
  "users",
  "features",
  "ux",
  "data",
  "technical",
  "security",
  "testing",
  "deployment",
]);
const recommendationStatus = z.enum([
  "proposed",
  "accepted",
  "changed",
  "discussed",
]);
const conflictStatus = z.enum(["open", "resolved"]);
const uuid = z.string().uuid();

export const featureSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(200),
  description: z.string().min(0).max(2000),
  priority: featurePriority,
  status: featureStatus,
  source: featureSource,
});
export type FeatureInput = z.infer<typeof featureSchema>;

export const requirementSchema = z.object({
  id: z.string().min(4).max(16).regex(/^(FR|NFR)-\d{3,}$/),
  type: requirementType,
  title: z.string().min(1).max(300),
  description: z.string().min(0).max(4000),
  priority: priority,
  status: requirementStatus,
});
export type RequirementInput = z.infer<typeof requirementSchema>;

export const decisionSchema = z.object({
  id: uuid,
  topic: z.string().min(1).max(300),
  decision: z.string().min(1).max(2000),
  reason: z.string().min(1).max(4000),
  alternatives: z.array(z.string().max(500)).max(20).optional(),
  source: decisionSource,
  status: decisionStatus,
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const assumptionSchema = z.object({
  id: z.string().regex(/^A-\d{3,}$/),
  statement: z.string().min(1).max(2000),
  reason: z.string().min(1).max(4000),
  status: assumptionStatus,
});
export type AssumptionInput = z.infer<typeof assumptionSchema>;

export const recommendationSchema = z.object({
  id: uuid,
  topic: z.string().min(1).max(300),
  recommendation: z.string().min(1).max(500),
  reason: z.string().min(1).max(4000),
  alternatives: z.array(z.string().max(300)).max(10).default([]),
  tradeoffs: z.string().min(0).max(4000),
  status: recommendationStatus,
  decisionId: uuid.optional(),
});
export type RecommendationInput = z.infer<typeof recommendationSchema>;

export const conflictSchema = z.object({
  id: uuid,
  earlierTopic: z.string().min(1).max(300),
  earlierValue: z.string().min(1).max(2000),
  laterTopic: z.string().min(1).max(300),
  laterValue: z.string().min(1).max(2000),
  status: conflictStatus,
  resolution: z.string().max(2000).optional(),
});
export type ConflictInput = z.infer<typeof conflictSchema>;

export const questionOptionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(300),
  explanation: z.string().max(4000).optional(),
});

export const questionSchema = z.object({
  id: uuid.optional(),
  questionKey: z.string().min(1).max(120),
  type: questionType,
  question: z.string().min(1).max(2000),
  options: z.array(questionOptionSchema).max(20).optional(),
  priority: priority,
  reason: z.string().max(4000).optional(),
  category: questionCategory,
  status: questionStatus.default("pending"),
  recommendationId: uuid.optional(),
});
export type QuestionInput = z.infer<typeof questionSchema>;

export const architectureSchema = z.object({
  frontend: z.string().max(500).optional(),
  backend: z.string().max(500).optional(),
  database: z.string().max(500).optional(),
  auth: z.string().max(500).optional(),
  fileStorage: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
});

export const technologySchema = z.object({
  languages: z.array(z.string().max(100)).max(20).optional(),
  frameworks: z.array(z.string().max(100)).max(20).optional(),
  integrations: z.array(z.string().max(100)).max(20).optional(),
  notes: z.string().max(4000).optional(),
});

export const securitySchema = z.object({
  authModel: z.string().max(500).optional(),
  accessControl: z.string().max(2000).optional(),
  sensitiveData: z.string().max(2000).optional(),
  abuseConsiderations: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});

export const testingSchema = z.object({
  criticalWorkflows: z.array(z.string().max(500)).max(40).optional(),
  acceptanceCriteria: z.array(z.string().max(800)).max(80).optional(),
  notes: z.string().max(4000).optional(),
});

export const deploymentSchema = z.object({
  target: z.string().max(300).optional(),
  environmentVariables: z.array(z.string().max(200)).max(60).optional(),
  externalServices: z.array(z.string().max(100)).max(40).optional(),
  notes: z.string().max(4000).optional(),
});

export const projectCoreSchema = z.object({
  name: z.string().min(0).max(200),
  description: z.string().min(0).max(6000),
  problem: z.string().min(0).max(4000),
  goals: z.array(z.string().max(500)).max(60).default([]),
  targetUsers: z.array(z.string().max(200)).max(30).default([]),
  successCriteria: z.array(z.string().max(800)).max(60).default([]),
  userStories: z.array(z.string().max(800)).max(200).default([]),
  facts: z.record(z.string(), z.string().max(4000)).default({}),
});

export const projectStateSchema = z.object({
  project: projectCoreSchema,
  features: z.array(featureSchema).default([]),
  requirements: z.array(requirementSchema).default([]),
  decisions: z.array(decisionSchema).default([]),
  assumptions: z.array(assumptionSchema).default([]),
  recommendations: z.array(recommendationSchema).default([]),
  conflicts: z.array(conflictSchema).default([]),
  architecture: architectureSchema.default({}),
  technology: technologySchema.default({}),
  security: securitySchema.default({}),
  testing: testingSchema.default({}),
  deployment: deploymentSchema.default({}),
  version: z.number().int().min(1).default(1),
});
export type ParsedProjectState = z.infer<typeof projectStateSchema>;

/**
 * Schema for the AI "planner" structured response. This is what the
 * interview engine consumes. Validated before it may touch state.
 */
export const plannerActionSchema = z.enum([
  "ask_question",
  "record_information",
  "recommend",
  "resolve_conflict",
  "complete",
]);

export const ideaAnalysisSchema = z.object({
  projectNameSuggestion: z.string().min(1).max(200),
  summary: z.string().min(1).max(4000),
  problem: z.string().max(4000),
  targetUsers: z.array(z.string().max(200)).max(30).default([]),
  initialFeatures: z.array(z.string().max(300)).max(40).default([]),
  unknowns: z.array(z.string().max(500)).max(60).default([]),
});
export type IdeaAnalysis = z.infer<typeof ideaAnalysisSchema>;

/** A validated state update the planner proposes to apply. */
export const stateUpdateSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("upsert_feature"),
    feature: featureSchema,
  }),
  z.object({
    op: z.literal("upsert_requirement"),
    requirement: requirementSchema,
  }),
  z.object({
    op: z.literal("record_decision"),
    decision: decisionSchema,
  }),
  z.object({
    op: z.literal("record_assumption"),
    assumption: assumptionSchema,
  }),
  z.object({
    op: z.literal("record_recommendation"),
    recommendation: recommendationSchema,
  }),
  z.object({
    op: z.literal("add_goal"),
    goal: z.string().min(1).max(500),
  }),
  z.object({
    op: z.literal("add_user"),
    user: z.string().min(1).max(200),
  }),
  z.object({
    op: z.literal("add_success_criterion"),
    criterion: z.string().min(1).max(800),
  }),
  z.object({
    op: z.literal("add_user_story"),
    story: z.string().min(1).max(800),
  }),
  z.object({
    op: z.literal("set_fact"),
    key: z.string().min(1).max(80),
    value: z.string().min(1).max(4000),
  }),
  z.object({
    op: z.literal("set_problem"),
    value: z.string().min(1).max(4000),
  }),
  z.object({
    op: z.literal("set_architecture"),
    architecture: architectureSchema,
  }),
  z.object({
    op: z.literal("set_technology"),
    technology: technologySchema,
  }),
  z.object({
    op: z.literal("set_security"),
    security: securitySchema,
  }),
  z.object({
    op: z.literal("set_testing"),
    testing: testingSchema,
  }),
  z.object({
    op: z.literal("set_deployment"),
    deployment: deploymentSchema,
  }),
  z.object({
    op: z.literal("resolve_conflict"),
    conflictId: uuid,
    resolution: z.string().min(1).max(2000),
  }),
]);
export type StateUpdate = z.infer<typeof stateUpdateSchema>;

export const plannerResponseSchema = z.object({
  message: z.string().min(0).max(6000),
  action: plannerActionSchema,
  question: questionSchema.optional(),
  updates: z.array(stateUpdateSchema).default([]),
  recommendations: z.array(recommendationSchema).default([]),
  conflicts: z.array(conflictSchema).default([]),
});
export type PlannerResponse = z.infer<typeof plannerResponseSchema>;

/** API-layer: submit an answer to a pending question. */
export const answerPayloadSchema = z.object({
  questionId: uuid,
  /** single_choice/yes_no -> one option id; multi_choice -> several; free/number -> raw text */
  selected: z.array(z.string()).max(50).optional(),
  freeText: z.string().max(8000).optional(),
  numeric: z.number().optional(),
});

/**
 * API-layer: submit an answer to a pending interview question. Matches the
 * service's AnswerPayload — the interview keys off `questionKey` (stable,
 * deterministic) rather than a per-question UUID, and `unsure` triggers the
 * recommendation loop.
 */
export const apiAnswerPayloadSchema = z.object({
  questionKey: z.string().min(1).max(120),
  /** single_choice/yes_no -> one option id; multi_choice -> several. */
  selected: z.array(z.string().max(80)).max(50).optional(),
  /** free_text / number answers. */
  freeText: z.string().max(8000).optional(),
  numeric: z.number().optional(),
  /** Set when the user picked "I'm not sure" -> surface a recommendation. */
  unsure: z.boolean().optional(),
});
export type ApiAnswerPayload = z.infer<typeof apiAnswerPayloadSchema>;

/** API-layer: create a new project from a rough idea. */
export const createProjectPayloadSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  idea: z.string().min(8).max(6000),
});

export const renameProjectPayloadSchema = z.object({
  name: z.string().min(1).max(200),
});
