// Unit tests for the deterministic plan-quality reviewer (§35).
import { describe, it, expect } from "vitest";
import { seedState } from "@/types";
import type { ProjectState } from "@/types";
import { generateAllPlanningSections } from "@/lib/planner/planner";
import { applyPlannerResponse } from "@/lib/planner/state-update";
import { reviewProject } from "@/lib/planner/quality";

const F1 = "a1000000-0000-4000-8000-000000000001";

function seeded(): ProjectState {
  const s = seedState("Teams share study notes and quiz each other.");
  s.project.goals = ["Let the main user complete the core workflow."];
  s.project.targetUsers = ["students", "teachers"];
  s.features = [
    { id: F1, name: "Note sharing", description: "d", priority: "must_have", status: "confirmed", source: "user" },
  ];
  s.requirements = [
    { id: "FR-001", type: "functional", title: "Upload a note", description: "d", priority: "critical", status: "confirmed" },
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

describe("reviewProject", () => {
  it("scores a fully-planned project as acceptable (>=70, no critical conflicts)", () => {
    const q = reviewProject(runAll(seeded()));
    expect(q.score).toBeGreaterThanOrEqual(70);
    expect(q.acceptable).toBe(true);
    expect(q.strengths.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same state", () => {
    const s = runAll(seeded());
    expect(JSON.stringify(reviewProject(s))).toBe(JSON.stringify(reviewProject(s)));
  });

  it("drops the score when planning sections are emptied", () => {
    const full = runAll(seeded());
    const empty: ProjectState = { ...full };
    empty.requirements = [];
    empty.database = [];
    empty.api = [];
    empty.securityItems = [];
    empty.testCases = [];
    expect(reviewProject(empty).score).toBeLessThan(reviewProject(full).score);
  });

  it("reports a warning when no end-to-end tests are planned", () => {
    const full = runAll(seeded());
    full.testCases = full.testCases.filter((t) => t.kind !== "e2e");
    const q = reviewProject(full);
    expect(q.warnings.some((w) => /end-to-end/i.test(w))).toBe(true);
  });
});
