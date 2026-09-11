// Unit tests for advanced, deterministic conflict detection (§20) + the
// critical-open gate that blocks Build-Ready.
import { describe, it, expect } from "vitest";
import { seedState } from "@/types";
import type { ProjectState, Conflict } from "@/types";
import {
  detectAdvancedConflicts,
  hasCriticalOpenConflict,
  type AdvancedConflict,
} from "@/lib/planner/conflicts";

const F1 = "a1000000-0000-4000-8000-000000000001";
const F2 = "a1000000-0000-4000-8000-000000000002";

const conflict = (id: string, severity: Conflict["severity"], status: Conflict["status"]): Conflict => ({
  id,
  earlierTopic: "t",
  earlierValue: "a",
  laterTopic: "u",
  laterValue: "b",
  status,
  severity,
});

describe("detectAdvancedConflicts", () => {
  it("flags a user-owned-content project missing an access-control model as critical", () => {
    const s = seedState("x");
    s.features = [
      {
        id: F1,
        name: "Upload notes for users",
        description: "d",
        priority: "must_have",
        status: "confirmed",
        source: "user",
      },
    ];
    // No security.accessControl, no matching NFR -> the gap must fire.
    const critical = detectAdvancedConflicts(s).filter((c) => c.severity === "critical");
    expect(critical.length).toBeGreaterThan(0);
    expect(hasCriticalOpenConflict(detectAdvancedConflicts(s))).toBe(true);
  });

  it("does NOT flag the security gap once an access-control model is recorded", () => {
    const s = seedState("x");
    s.features = [
      {
        id: F1,
        name: "Upload notes for users",
        description: "d",
        priority: "must_have",
        status: "confirmed",
        source: "user",
      },
    ];
    s.security = { accessControl: "Owners can only view their own notes." };
    const critical = detectAdvancedConflicts(s).filter((c) => c.severity === "critical");
    expect(critical).toHaveLength(0);
  });

  it("flags a feature dependency cycle as a high-severity conflict", () => {
    const s = seedState("x");
    s.features = [
      { id: F1, name: "A", description: "", priority: "must_have", status: "confirmed", source: "user" },
      { id: F2, name: "B", description: "", priority: "must_have", status: "confirmed", source: "user" },
    ];
    s.dependencies = [
      { id: "DEP-001", sourceId: F1, targetId: F2, reason: "A needs B", status: "open" },
      { id: "DEP-002", sourceId: F2, targetId: F1, reason: "B needs A", status: "open" },
    ];
    const cycle = detectAdvancedConflicts(s).find(
      (c) => c.severity === "high" && /cycle/i.test(c.laterTopic + c.laterValue),
    );
    expect(cycle).toBeTruthy();
  });

  it("flags two accepted, conflicting decisions on the same topic as high", () => {
    const s = seedState("x");
    s.decisions = [
      {
        id: "d-1",
        topic: "Storage",
        decision: "Use Postgres",
        reason: "r",
        source: "user",
        status: "accepted",
      },
      {
        id: "d-2",
        topic: "Storage",
        decision: "Use Mongo",
        reason: "r",
        source: "user",
        status: "accepted",
      },
    ];
    const conflict = detectAdvancedConflicts(s).find(
      (c) => c.severity === "high" && c.earlierTopic === "Decision",
    );
    expect(conflict).toBeTruthy();
  });

  it("is deterministic: two runs yield the same severity+topic multiset", () => {
    const s = seedState("x");
    s.features = [
      {
        id: F1,
        name: "Upload notes for users",
        description: "d",
        priority: "must_have",
        status: "confirmed",
        source: "user",
      },
    ];
    const sig = (xs: AdvancedConflict[]) =>
      xs
        .map((c) => `${c.severity}|${c.earlierTopic}|${c.laterTopic}`)
        .sort()
        .join(",");
    expect(sig(detectAdvancedConflicts(s))).toBe(sig(detectAdvancedConflicts(s)));
  });
});

describe("hasCriticalOpenConflict", () => {
  it("is true only for an OPEN critical conflict", () => {
    expect(hasCriticalOpenConflict([conflict("c1", "critical", "open")])).toBe(true);
    expect(hasCriticalOpenConflict([conflict("c1", "critical", "resolved")])).toBe(false);
    expect(hasCriticalOpenConflict([conflict("c1", "high", "open")])).toBe(false);
    expect(hasCriticalOpenConflict([])).toBe(false);
  });
});
