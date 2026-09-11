// Zod schemas for every structured object that crosses a trust boundary:
// AI structured output, API input, and database payloads.
// A parsed ProjectState is always a ProjectState — never `any`.

import { z } from "zod";

const priority = z.enum(["critical", "high", "medium", "low"]);
const featurePriority = z.enum([
  "must_have",
  "should_have",
  "could_have",
  "future",
  "nice_to_have", // Phase 1 legacy value; kept so existing states still parse.
]);
const featureStatus = z.enum(["proposed", "confirmed", "rejected", "superseded"]);
const featureSource = z.enum([
  "user",
  "ai_recommendation",
  "ai_inference",
  "imported",
  "system",
  "ai", // Phase 1 legacy value; kept for backward compatibility.
]);
// Where a feature is scoped (§7, §8): MVP vs later.
const scope = z.enum(["mvp", "post_mvp", "future"]);
const requirementType = z.enum(["functional", "non_functional"]);
const requirementStatus = z.enum([
  "proposed",
  "confirmed",
  "rejected",
  "superseded",
]);
// Requirement provenance (§6) — never present an AI inference as user-requested.
const requirementSource = z.enum([
  "user",
  "ai_recommendation",
  "ai_inference",
  "imported",
  "system",
]);
const decisionStatus = z.enum(["accepted", "changed", "superseded"]);
const decisionSource = z.enum([
  "user",
  "ai_recommendation",
  "ai_inference",
  "system",
]);
const assumptionStatus = z.enum(["pending", "approved", "rejected"]);
// Information provenance for hallucination protection (§46).
const infoStatus = z.enum([
  "confirmed",
  "recommended",
  "inferred",
  "assumed",
  "unknown",
  "deferred",
]);
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
  // Phase 2 (optional so Phase 1 states still parse):
  scope: scope.optional(),
  /** Stable human-facing label, e.g. FEAT-001. Ids may change on rename. */
  ref: z.string().max(16).optional(),
  requirementIds: z.array(z.string().max(16)).max(200).optional(),
  storyIds: z.array(z.string().max(16)).max(200).optional(),
  acceptanceCriteriaIds: z.array(z.string().max(16)).max(200).optional(),
  dependsOn: z.array(z.string().max(40)).max(100).optional(), // feature refs/ids
});
export type FeatureInput = z.infer<typeof featureSchema>;

export const requirementSchema = z.object({
  id: z.string().min(4).max(16).regex(/^(FR|NFR)-\d{3,}$/),
  type: requirementType,
  title: z.string().min(1).max(300),
  description: z.string().min(0).max(4000),
  priority: priority,
  status: requirementStatus,
  // Phase 2 (optional):
  source: requirementSource.optional(),
  featureId: uuid.optional(),
  dependsOn: z.array(z.string().max(40)).max(200).optional(),
  acceptanceCriteriaIds: z.array(z.string().max(16)).max(200).optional(),
  supersededBy: z.string().max(16).optional(),
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
  // Phase 2 (optional):
  ref: z.string().max(16).optional(), // ADR-001
  impact: z.array(z.string().max(4000)).max(40).optional(),
  tradeoffs: z.string().max(4000).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  supersededBy: uuid.optional(),
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const assumptionSchema = z.object({
  id: z.string().regex(/^A-\d{3,}$/),
  statement: z.string().min(1).max(2000),
  reason: z.string().min(1).max(4000),
  status: assumptionStatus,
});
export type AssumptionInput = z.infer<typeof assumptionSchema>;

// ---- Phase 2 planning entities (all optional on state for backward compat) ----

export const acceptanceCriterionSchema = z.object({
  id: z.string().regex(/^AC-\d{3,}$/),
  statement: z.string().min(1).max(2000),
  /** Given/When/Then form is preferred but not required (§11). */
  given: z.string().max(800).optional(),
  when: z.string().max(800).optional(),
  then: z.string().max(800).optional(),
  status: infoStatus.optional(),
});
export type AcceptanceCriterionInput = z.infer<typeof acceptanceCriterionSchema>;

export const userStorySchema = z.object({
  id: z.string().regex(/^US-\d{3,}$/),
  role: z.string().min(1).max(200),
  action: z.string().min(1).max(400),
  benefit: z.string().min(1).max(400),
  featureId: uuid.optional(),
  requirementIds: z.array(z.string().max(16)).max(200).optional(),
  priority: priority.optional(),
  acceptanceCriteriaIds: z.array(z.string().max(16)).max(200).optional(),
  status: infoStatus.optional(),
});
export type UserStoryInput = z.infer<typeof userStorySchema>;

// Structured dependencies (§9). A node is anything with a stable ref/ID.
export const dependencyNodeKind = z.enum([
  "feature",
  "requirement",
  "user_story",
  "decision",
  "entity",
  "page",
]);
export const dependencyType = z.enum([
  "requires",
  "data_dependent",
  "order_after",
  "shares_component",
]);
export const dependencySchema = z.object({
  id: z.string().regex(/^DEP-\d{3,}$/),
  sourceId: z.string().min(4).max(40),
  sourceKind: dependencyNodeKind.optional(),
  targetId: z.string().min(4).max(40),
  targetKind: dependencyNodeKind.optional(),
  type: dependencyType.optional(),
  reason: z.string().min(1).max(2000),
  status: z.enum(["open", "met", "violated"]).default("open"),
});
export type DependencyInput = z.infer<typeof dependencySchema>;

export const architectureComponentSchema = z.object({
  id: z.string().regex(/^COMP-\d{3,}$/),
  name: z.string().min(1).max(200),
  responsibility: z.string().min(1).max(2000),
  kind: z
    .enum(["client", "server", "datastore", "service", "third_party"])
    .optional(),
  dataFlow: z.string().max(2000).optional(),
  trustBoundary: z.string().max(1000).optional(),
  connectsTo: z.array(z.string().max(40)).max(100).optional(),
});
export type ArchitectureComponentInput = z.infer<typeof architectureComponentSchema>;

export const databaseEntitySchema = z.object({
  id: z.string().regex(/^DB-\d{3,}$/),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  fields: z
    .array(z.object({ name: z.string().min(1).max(80), type: z.string().max(120) }))
    .max(100)
    .default([]),
  primaryKey: z.array(z.string().max(80)).max(10).default([]),
  foreignKeys: z.array(z.string().max(200)).max(50).default([]),
  indexes: z.array(z.string().max(200)).max(50).default([]),
  constraints: z.array(z.string().max(300)).max(50).default([]),
  relationships: z.array(z.string().max(200)).max(50).default([]),
  ownership: z.string().max(400).optional(),
  accessRules: z.string().max(2000).optional(),
});
export type DatabaseEntityInput = z.infer<typeof databaseEntitySchema>;

export const apiEndpointSchema = z.object({
  id: z.string().regex(/^API-\d{3,}$/),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
  path: z.string().min(1).max(300),
  purpose: z.string().max(600).optional(),
  auth: z.enum(["public", "user", "role", "none"]).optional(),
  permissions: z.array(z.string().max(200)).max(50).default([]),
  request: z.string().max(2000).optional(),
  response: z.string().max(2000).optional(),
  errors: z.string().max(1000).optional(),
  requirementIds: z.array(z.string().max(16)).max(200).default([]),
});
export type ApiEndpointInput = z.infer<typeof apiEndpointSchema>;

export const pageSchema = z.object({
  id: z.string().regex(/^PAGE-\d{3,}$/),
  name: z.string().min(1).max(200),
  path: z.string().min(1).max(300).optional(),
  access: z.enum(["public", "authenticated", "role"]).optional(),
  purpose: z.string().max(1000).optional(),
  users: z.array(z.string().max(200)).max(50).default([]),
  components: z.array(z.string().max(200)).max(100).default([]),
  actions: z.array(z.string().max(400)).max(100).default([]),
  requiredData: z.array(z.string().max(200)).max(100).default([]),
  states: z.array(z.string().max(400)).max(100).default([]),
  permissions: z.array(z.string().max(400)).max(50).default([]),
});
export type PageInput = z.infer<typeof pageSchema>;

export const userFlowSchema = z.object({
  id: z.string().regex(/^FLOW-\d{3,}$/),
  name: z.string().min(1).max(200),
  steps: z.array(z.string().max(400)).max(100).default([]),
  happyPath: z.array(z.string().max(400)).max(100).default([]),
  failurePaths: z
    .array(z.object({ trigger: z.string().max(300), recovery: z.string().max(500) }))
    .max(50)
    .default([]),
});
export type UserFlowInput = z.infer<typeof userFlowSchema>;

export const securityItemSchema = z.object({
  id: z.string().regex(/^SEC-\d{3,}$/),
  threat: z.string().min(1).max(500),
  impact: z.string().min(1).max(500),
  mitigation: z.string().max(2000),
  status: z.enum(["required", "addressed", "accepted_risk", "open"]).default("open"),
});
export type SecurityItemInput = z.infer<typeof securityItemSchema>;

export const testItemSchema = z.object({
  id: z.string().regex(/^TEST-\d{3,}$/),
  kind: z.enum([
    "unit",
    "integration",
    "e2e",
    "security",
    "accessibility",
    "performance",
  ]),
  target: z.string().min(1).max(500),
  description: z.string().max(1500).optional(),
});
export type TestItemInput = z.infer<typeof testItemSchema>;

export const implementationTaskSchema = z.object({
  id: z.string().regex(/^TASK-\d{3,}$/),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  featureRef: z.string().max(40).optional(),
  requirementRef: z.string().max(16).optional(),
});
export type ImplementationTaskInput = z.infer<typeof implementationTaskSchema>;

export const implementationPhaseSchema = z.object({
  id: z.string().regex(/^PHASE-\d{3,}$/),
  order: z.number().int().min(1),
  name: z.string().min(1).max(200),
  objective: z.string().max(1000).optional(),
  featureRefs: z.array(z.string().max(40)).max(200).default([]),
  requirementRefs: z.array(z.string().max(16)).max(200).default([]),
  taskIds: z.array(z.string().max(16)).max(500).default([]),
  acceptanceCriteria: z.array(z.string().max(400)).max(200).default([]),
});
export type ImplementationPhaseInput = z.infer<typeof implementationPhaseSchema>;

// Clean aliases used across services / UI (names without the "Input" suffix).
export type UserStory = UserStoryInput;
export type AcceptanceCriterion = AcceptanceCriterionInput;
export type Dependency = DependencyInput;
export type ArchitectureComponent = ArchitectureComponentInput;
export type DatabaseEntity = DatabaseEntityInput;
export type ApiEndpoint = ApiEndpointInput;
export type ProjectPage = PageInput;
export type UserFlow = UserFlowInput;
export type SecurityItem = SecurityItemInput;
export type TestCase = TestItemInput;
export type ImplementationTask = ImplementationTaskInput;
export type ImplementationPhase = ImplementationPhaseInput;

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
  // Phase 2 (§20): severity drives the Build-Ready gate; a critical *open*
  // conflict must block Build Ready.
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  suggestedResolution: z.string().max(2000).optional(),
  // Which entities this conflict touches (for traceability / impact).
  entities: z.array(z.string().max(40)).max(50).optional(),
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
  // Phase 2 planning sections. All optional + defaulted so every Phase 1
  // state still parses unchanged (backward compatibility, spec §3).
  userStories: z.array(userStorySchema).default([]),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).default([]),
  dependencies: z.array(dependencySchema).default([]),
  architectureComponents: z.array(architectureComponentSchema).default([]),
  database: z.array(databaseEntitySchema).default([]),
  api: z.array(apiEndpointSchema).default([]),
  pages: z.array(pageSchema).default([]),
  userFlows: z.array(userFlowSchema).default([]),
  securityItems: z.array(securityItemSchema).default([]),
  testCases: z.array(testItemSchema).default([]),
  implementationPhases: z.array(implementationPhaseSchema).default([]),
  implementationTasks: z.array(implementationTaskSchema).default([]),
  // Phase 2 metadata (optional):
  complexity: z
    .enum(["simple", "moderate", "complex", "very_complex"])
    .optional(),
  presentation: z.enum(["beginner", "advanced"]).optional(),
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
  // ---- Phase 2 planning mutations. Each validates against its entity schema
  // so a malformed AI response can never reach the state (spec §44, §45). ----
  z.object({ op: z.literal("upsert_user_story"), story: userStorySchema }),
  z.object({
    op: z.literal("upsert_acceptance_criterion"),
    criterion: acceptanceCriterionSchema,
  }),
  z.object({ op: z.literal("upsert_dependency"), dependency: dependencySchema }),
  z.object({
    op: z.literal("upsert_architecture_component"),
    component: architectureComponentSchema,
  }),
  z.object({ op: z.literal("upsert_database_entity"), entity: databaseEntitySchema }),
  z.object({ op: z.literal("upsert_api_endpoint"), endpoint: apiEndpointSchema }),
  z.object({ op: z.literal("upsert_page"), page: pageSchema }),
  z.object({ op: z.literal("upsert_user_flow"), flow: userFlowSchema }),
  z.object({ op: z.literal("upsert_security_item"), item: securityItemSchema }),
  z.object({ op: z.literal("upsert_test_case"), item: testItemSchema }),
  z.object({
    op: z.literal("upsert_implementation_task"),
    task: implementationTaskSchema,
  }),
  z.object({
    op: z.literal("upsert_implementation_phase"),
    phase: implementationPhaseSchema,
  }),
  // Whole-section replacement (planner regeneration). Items are validated
  // against their entity schemas — never raw/unknown JSON.
  z.object({ op: z.literal("set_user_stories"), value: z.array(userStorySchema).max(500) }),
  z.object({
    op: z.literal("set_acceptance_criteria"),
    value: z.array(acceptanceCriterionSchema).max(500),
  }),
  z.object({
    op: z.literal("set_dependencies"),
    value: z.array(dependencySchema).max(500),
  }),
  z.object({
    op: z.literal("set_architecture_components"),
    value: z.array(architectureComponentSchema).max(200),
  }),
  z.object({ op: z.literal("set_database"), value: z.array(databaseEntitySchema).max(200) }),
  z.object({ op: z.literal("set_api"), value: z.array(apiEndpointSchema).max(300) }),
  z.object({ op: z.literal("set_pages"), value: z.array(pageSchema).max(300) }),
  z.object({ op: z.literal("set_user_flows"), value: z.array(userFlowSchema).max(300) }),
  z.object({ op: z.literal("set_security_items"), value: z.array(securityItemSchema).max(300) }),
  z.object({ op: z.literal("set_test_cases"), value: z.array(testItemSchema).max(500) }),
  z.object({
    op: z.literal("set_implementation_phases"),
    value: z.array(implementationPhaseSchema).max(100),
  }),
  z.object({
    op: z.literal("set_implementation_tasks"),
    value: z.array(implementationTaskSchema).max(1000),
  }),
  // Status / scope / metadata setters.
  z.object({ op: z.literal("set_feature_scope"), featureId: uuid, scope }),
  z.object({
    op: z.literal("set_requirement_status"),
    requirementId: z.string().min(4).max(16),
    status: requirementStatus,
  }),
  z.object({
    op: z.literal("set_decision_status"),
    decisionId: uuid,
    status: decisionStatus,
  }),
  z.object({
    op: z.literal("set_assumption_status"),
    assumptionId: z.string().regex(/^A-\d{3,}$/),
    status: assumptionStatus,
  }),
  z.object({
    op: z.literal("set_complexity"),
    value: z.enum(["simple", "moderate", "complex", "very_complex"]),
  }),
  z.object({ op: z.literal("set_presentation"), value: z.enum(["beginner", "advanced"]) }),
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
