// Unit tests for the Phase 2 deterministic planners + dependency ordering.
import { describe, it, expect } from "vitest";
import { seedState } from "@/types";
import type { ProjectState, Feature, Decision } from "@/types";
import {
  generateAllPlanningSections,
  topologicalOrderFeatures,
} from "@/lib/planner/planner";
import { applyPlannerResponse } from "@/lib/planner/state-update";

// A seeded state with confirmed must-have features + requirements so the
// planners have something to expand from. Feature ids must be valid UUIDs:
// the planner writes requirement.featureId / story.featureId as the feature's
// id, and those fields are UUID-validated.
const F1 = "a1000000-0000-4000-8000-000000000001";
const F2 = "a1000000-0000-4000-8000-000000000002";

function seeded(): ProjectState {
  const s = seedState("Teams share study notes and quiz each other.");
  s.project.goals = ["Let the main user complete the core workflow."];
  s.project.targetUsers = ["students", "teachers"];
  s.features = [
    { id: F1, name: "Note sharing", description: "d", priority: "must_have", status: "confirmed", source: "user" },
    { id: F2, name: "Quizzes", description: "d", priority: "must_have", status: "confirmed", source: "user" },
  ];
  s.requirements = [
    { id: "FR-001", type: "functional", title: "Upload a note", description: "d", priority: "critical", status: "confirmed" },
    { id: "NFR-001", type: "non_functional", title: "Private by default", description: "d", priority: "critical", status: "confirmed" },
  ];
  s.architecture = { database: "PostgreSQL", backend: "Next.js API", frontend: "Next.js", auth: "Sessions" };
  s.security = { accessControl: "Users can only view their own notes." };
  s.testing = { criticalWorkflows: ["Upload a note"] };
  s.deployment = { target: "Vercel", environmentVariables: ["DATABASE_URL"] };
  s.version = 3;
  return s;
}

function runAll(s: ProjectState): ProjectState {
  return applyPlannerResponse(
    {
      message: "planner",
      action: "record_information",
      updates: generateAllPlanningSections(s),
      recommendations: [],
      conflicts: [],
    },
    s,
  ).state;
}

describe("deterministic planners", () => {
  it("expands an empty plan into every major section", () => {
    const out = runAll(seeded());
    expect(out.requirements.length).toBeGreaterThan(0);
    expect(out.userStories.length).toBeGreaterThan(0);
    expect(out.architectureComponents.length).toBeGreaterThan(0);
    expect(out.database.length).toBeGreaterThan(0);
    expect(out.api.length).toBeGreaterThan(0);
    expect(out.pages.length).toBeGreaterThan(0);
    expect(out.userFlows.length).toBeGreaterThan(0);
    expect(out.securityItems.length).toBeGreaterThan(0);
    expect(out.testCases.length).toBeGreaterThan(0);
    expect(out.implementationPhases.length).toBeGreaterThan(0);
    expect(out.complexity).toBeTruthy();
  });

  it("is deterministic: same input -> same refs and structure", () => {
    const a = runAll(seeded());
    const b = runAll(seeded());
    const sig = (s: ProjectState) =>
      JSON.stringify({
        userStories: s.userStories.map((x) => x.id),
        database: s.database.map((x) => x.id),
        api: s.api.map((x) => `${x.method} ${x.path}`),
        pages: s.pages.map((x) => x.id),
        phases: s.implementationPhases.map((x) => x.order),
      });
    expect(sig(a)).toBe(sig(b));
  });

  it("is idempotent: running it twice changes nothing new", () => {
    const once = runAll(seeded());
    const twice = runAll(once);
    const count = (s: ProjectState) =>
      [
        s.requirements.length,
        s.userStories.length,
        s.database.length,
        s.api.length,
        s.pages.length,
        s.implementationPhases.length,
      ].join(",");
    expect(count(twice)).toBe(count(once));
    // Version must not keep climbing on a no-op regeneration.
    expect(twice.version).toBe(once.version);
  });
});

describe("topological feature ordering", () => {
  it("orders features by dependency and breaks cycles deterministically", () => {
    const s = seeded();
    const feats: Feature[] = [
      { id: "a", name: "A", description: "", priority: "must_have", status: "confirmed", source: "user" },
      { id: "b", name: "B", description: "", priority: "must_have", status: "confirmed", source: "user" },
      { id: "c", name: "C", description: "", priority: "must_have", status: "confirmed", source: "user" },
    ];
    // Dependency edge source->target means "source must exist before target".
    // To build a, then b, then c: a before b (b needs a) and b before c (c needs b).
    s.dependencies = [
      { id: "DEP-001", sourceId: "a", targetId: "b", reason: "b needs a", status: "open" },
      { id: "DEP-002", sourceId: "b", targetId: "c", reason: "c needs b", status: "open" },
    ];
    const ordered = topologicalOrderFeatures(s, feats).map((f) => f.id);
    const ia = ordered.indexOf("a"), ib = ordered.indexOf("b"), ic = ordered.indexOf("c");
    expect(ia).toBeLessThan(ib);
    expect(ib).toBeLessThan(ic);
  });

  it("does not drop features that sit in a cycle", () => {
    const s = seedState("x");
    const feats: Feature[] = [
      { id: "x", name: "X", description: "", priority: "must_have", status: "confirmed", source: "user" },
      { id: "y", name: "Y", description: "", priority: "must_have", status: "confirmed", source: "user" },
    ];
    // x <-> y forms a cycle; both must still appear.
    s.dependencies = [
      { id: "DEP-001", sourceId: "x", targetId: "y", reason: "x needs y", status: "open" },
      { id: "DEP-002", sourceId: "y", targetId: "x", reason: "y needs x", status: "open" },
    ];
    const ids = topologicalOrderFeatures(s, feats).map((f) => f.id);
    expect(ids).toContain("x");
    expect(ids).toContain("y");
  });
});

describe("record_decision supersede (Phase 2 §5/§18)", () => {
  const D1 = "b1000000-0000-4000-8000-000000000001";
  const D2 = "b1000000-0000-4000-8000-000000000002";

  function decision(id: string, topic: string, text: string, status: Decision["status"]): Decision {
    return {
      id,
      topic,
      decision: text,
      reason: "reason",
      source: "user",
      status,
    };
  }

  it("a 'changed' decision supersedes the prior one instead of clobbering it", () => {
    const base: ProjectState = {
      ...seedState("x"),
      decisions: [decision(D1, "Database", "Use MongoDB", "accepted")],
    };
    const out = applyPlannerResponse(
      {
        message: "m",
        action: "record_information",
        updates: [{ op: "record_decision", decision: decision(D2, "Database", "Use PostgreSQL", "changed") }],
        recommendations: [],
        conflicts: [],
      },
      base,
    ).state;

    const byId = new Map(out.decisions.map((d) => [d.id, d]));
    // Both the historical and the current decision survive.
    expect(out.decisions).toHaveLength(2);
    const old = byId.get(D1)!;
    const fresh = byId.get(D2)!;
    // Prior decision is preserved (not overwritten) and marked superseded.
    expect(old.decision).toBe("Use MongoDB");
    expect(old.status).toBe("superseded");
    expect(old.supersededBy).toBe(D2);
    // New decision is recorded as the current accepted one.
    expect(fresh.decision).toBe("Use PostgreSQL");
    expect(fresh.status).toBe("accepted");
  });

  it("is idempotent: re-applying the same changed decision does not mutate further", () => {
    const base: ProjectState = {
      ...seedState("x"),
      decisions: [decision(D1, "Database", "Use MongoDB", "accepted")],
    };
    const resp = {
      message: "m",
      action: "record_information",
      updates: [{ op: "record_decision", decision: decision(D2, "Database", "Use PostgreSQL", "changed") }],
      recommendations: [],
      conflicts: [],
    };
    const once = applyPlannerResponse(resp, base).state;
    const twice = applyPlannerResponse(resp, once).state;
    expect(once.version).toBe(base.version + 1);
    // Second application is a no-op: no new decision, version not bumped again.
    expect(twice.decisions).toHaveLength(2);
    expect(twice.version).toBe(once.version);
  });

  it("does not supersede when the decision is a fresh 'accepted' on a new topic", () => {
    const base: ProjectState = {
      ...seedState("x"),
      decisions: [decision(D1, "Database", "Use MongoDB", "accepted")],
    };
    const out = applyPlannerResponse(
      {
        message: "m",
        action: "record_information",
        updates: [{ op: "record_decision", decision: decision(D2, "Cache", "Use Redis", "accepted") }],
        recommendations: [],
        conflicts: [],
      },
      base,
    ).state;
    // Different topic: both remain accepted; no supersede link.
    expect(out.decisions).toHaveLength(2);
    expect(out.decisions.find((d) => d.id === D1)!.status).toBe("accepted");
    expect(out.decisions.find((d) => d.id === D2)!.status).toBe("accepted");
  });
});
