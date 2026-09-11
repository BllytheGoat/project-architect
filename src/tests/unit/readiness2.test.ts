// Unit tests for Readiness 2.0 (§36/§37): tier breakdown + Build-Ready gates.
import { describe, it, expect } from "vitest";
import { seedState } from "@/types";
import type { ProjectState, Conflict } from "@/types";
import { computeReadiness2 } from "@/lib/readiness/readiness2";

const F1 = "a1000000-0000-4000-8000-000000000001";

function base(): ProjectState {
  const s = seedState("Teams share study notes and quiz each other.");
  s.project.goals = ["Let students share and quiz on notes."];
  s.project.successCriteria = ["A student can share a note and be quizzed on it."];
  s.project.targetUsers = ["students"];
  s.features = [
    { id: F1, name: "Note sharing", description: "d", priority: "must_have", status: "confirmed", source: "user" },
  ];
  s.requirements = [
    { id: "FR-001", type: "functional", title: "Upload a note", description: "d", priority: "critical", status: "confirmed" },
    { id: "NFR-001", type: "non_functional", title: "Private by default", description: "d", priority: "critical", status: "confirmed" },
  ];
  s.architecture = { database: "PostgreSQL", backend: "Next.js API", frontend: "Next.js", auth: "Sessions" };
  s.security = {
    authModel: "Session-based accounts.",
    accessControl: "Users can only view their own notes.",
    sensitiveData: "Note bodies are user-owned content.",
  };
  s.testing = { criticalWorkflows: ["Upload a note"], acceptanceCriteria: ["Note persists"] };
  s.deployment = { target: "Vercel", environmentVariables: ["DATABASE_URL"] };
  // Make the "decisions" and "ux" categories complete so Build-Ready is reachable.
  s.decisions = [
    {
      id: "d-1",
      topic: "Storage",
      decision: "Use PostgreSQL",
      reason: "Relational notes + sharing model.",
      source: "user",
      status: "accepted",
    },
  ];
  s.project.userStories = ["A student uploads a note and shares it with a teammate."];
  s.project.facts = { pages: "Home, list of notes, and a note detail page." };
  s.version = 4;
  return s;
}

const openConflict = (severity: Conflict["severity"]): Conflict => ({
  id: "c-1",
  earlierTopic: "Security",
  earlierValue: "stores content",
  laterTopic: "Security",
  laterValue: "no access-control model",
  status: "open",
  severity,
});

describe("computeReadiness2", () => {
  it("reaches build-ready on a complete, consistent project", () => {
    const r = computeReadiness2(base());
    expect(r.buildReady).toBe(true);
    expect(r.buildReadyBlockers).toHaveLength(0);
  });

  it("blocks build-ready on an open critical conflict and names the blocker", () => {
    const s = base();
    s.conflicts = [openConflict("critical")];
    const r = computeReadiness2(s);
    expect(r.buildReady).toBe(false);
    expect(r.buildReadyBlockers.some((b) => /critical conflict/i.test(b))).toBe(true);
  });

  it("does NOT block on an open non-critical conflict alone", () => {
    const s = base();
    s.conflicts = [openConflict("low")];
    const r = computeReadiness2(s);
    // A low conflict doesn't match the critical gate, and the project is otherwise complete.
    expect(r.buildReady).toBe(true);
  });

  it("blocks when no must-have feature is confirmed", () => {
    const s = base();
    s.features = [
      { id: F1, name: "Note sharing", description: "d", priority: "nice_to_have", status: "confirmed", source: "user" },
    ];
    const r = computeReadiness2(s);
    expect(r.buildReadyBlockers.some((b) => /must-have|core/i.test(b))).toBe(true);
  });

  it("blocks when database entities lack ownership", () => {
    const s = base();
    s.database = [
      {
        id: "DB-001",
        name: "notes",
        fields: [{ name: "id", type: "uuid pk" }],
        primaryKey: ["id"],
        foreignKeys: [],
        indexes: [],
        constraints: [],
        relationships: [],
        ownership: "UNSPECIFIED",
      },
    ];
    const r = computeReadiness2(s);
    expect(r.buildReady).toBe(false);
    expect(r.buildReadyBlockers.some((b) => /ownership/i.test(b))).toBe(true);
  });

  it("exposes the three tiers (critical / important / optional), each deduped", () => {
    const r = computeReadiness2(base());
    expect(Array.isArray(r.critical)).toBe(true);
    expect(Array.isArray(r.important)).toBe(true);
    expect(Array.isArray(r.optional)).toBe(true);
    // dedupe() guarantees no repeats *within* a tier. (The same item may
    // legitimately surface in more than one tier, so we don't assert global
    // uniqueness across tiers.)
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(r.critical)).toBe(true);
    expect(unique(r.important)).toBe(true);
    expect(unique(r.optional)).toBe(true);
  });

  it("is deterministic", () => {
    const a = computeReadiness2(base());
    const b = computeReadiness2(base());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
