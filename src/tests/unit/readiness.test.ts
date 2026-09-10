import { describe, it, expect } from "vitest";
import { computeReadiness } from "@/lib/readiness/readiness";
import { seedState, emptyState } from "@/types";
import type { ProjectState } from "@/types";

// A fully-populated state (from the student fixture) should score high and
// be completable; an empty state should score low and not be completable.

function fullState(): ProjectState {
  const s = seedState("Students share notes");
  s.project = {
    ...s.project,
    name: "Student Notes Hub",
    problem: "Students duplicate effort.",
    goals: ["Share notes"],
    targetUsers: ["students"],
    successCriteria: ["A student uploads and another comments"],
    userStories: ["As a student I can upload a note."],
    facts: {},
  };
  s.features = [
    { id: "a1", name: "Note sharing", description: "x", priority: "must_have", status: "confirmed", source: "user" },
  ];
  s.requirements = [
    { id: "FR-001", type: "functional", title: "Upload", description: "x", priority: "critical", status: "confirmed" },
    { id: "NFR-001", type: "non_functional", title: "Private", description: "x", priority: "critical", status: "confirmed" },
  ];
  s.decisions = [
    { id: "b1", topic: "Database", decision: "PostgreSQL", reason: "Relational", source: "user", status: "accepted" },
  ];
  s.assumptions = [
    { id: "A-001", statement: "Only registered users upload.", reason: "owned", status: "approved" },
  ];
  s.architecture = {
    frontend: "Next.js",
    backend: "API routes",
    database: "PostgreSQL",
    auth: "Sessions",
    fileStorage: "Object store",
  };
  s.security = { accessControl: "Own content only", sensitiveData: "Files" };
  s.testing = { criticalWorkflows: ["Upload"], acceptanceCriteria: ["Works"] };
  s.deployment = { target: "Vercel", environmentVariables: ["DATABASE_URL"] };
  s.project.facts = { problem: "yes", goals: "yes", target_users: "yes" };
  return s;
}

describe("readiness", () => {
  it("empty state is low and cannot complete", () => {
    const r = computeReadiness(emptyState());
    expect(r.percent).toBeLessThan(40);
    expect(r.canComplete).toBe(false);
    expect(r.criticalMissing.length).toBeGreaterThan(0);
  });

  it("fully populated state is high and can complete", () => {
    const r = computeReadiness(fullState());
    expect(r.percent).toBeGreaterThanOrEqual(70);
    expect(r.canComplete).toBe(true);
  });

  it("is deterministic: same state -> same score", () => {
    const a = computeReadiness(fullState()).percent;
    const b = computeReadiness(fullState()).percent;
    expect(a).toBe(b);
  });

  it("weights sum to 1", () => {
    const r = computeReadiness(emptyState());
    const sum = r.categories.reduce((acc, c) => acc + c.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });
});
