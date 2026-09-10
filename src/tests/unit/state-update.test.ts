import { describe, it, expect } from "vitest";
import {
  applyPlannerResponse,
  nextRequirementId,
  nextAssumptionId,
} from "@/lib/planner/state-update";
import { seedState } from "@/types";
import type { ProjectState } from "@/types";

const feature = (id: string, name: string, status: "proposed" | "confirmed" = "proposed") => ({
  id,
  name,
  description: "desc",
  priority: "must_have" as const,
  status,
  source: "user" as const,
});

// Valid UUID (the schema enforces the shape).
const F1 = "f1f1f1f1-0000-4000-8000-000000000001";

describe("state-update pipeline", () => {
  it("bumps version on a real change and is idempotent on duplicates", () => {
    const base = seedState("idea");
    const base2: ProjectState = {
      ...base,
      features: [feature(F1, "Note sharing")],
      version: 1,
    };

    const resp = {
      message: "",
      action: "record_information" as const,
      updates: [{ op: "upsert_feature" as const, feature: feature(F1, "Note sharing", "confirmed") }],
      recommendations: [],
      conflicts: [],
    };

    const { state, changed } = applyPlannerResponse(resp, base2);
    expect(changed).toBe(1);
    expect(state.version).toBe(2);
    expect(state.features[0].status).toBe("confirmed");

    // Re-applying the same logical update to the new state must not duplicate.
    const resp2 = {
      ...resp,
      updates: [{ op: "upsert_feature" as const, feature: feature(F1, "Note sharing", "confirmed") }],
    };
    const { state: state2, changed: changed2 } = applyPlannerResponse(resp2, state);
    expect(changed2).toBe(0);
    expect(state2.features.length).toBe(1);
  });

  it("rejects malformed planner responses without touching state", () => {
    const base = seedState("idea");
    expect(() =>
      applyPlannerResponse(
        { message: "x", action: "nonsense", updates: [], recommendations: [], conflicts: [] },
        base,
      ),
    ).toThrow(/Invalid planner response/);
  });

  it("generates stable sequential requirement ids", () => {
    const s = seedState("idea");
    s.requirements = [
      { id: "FR-001", type: "functional", title: "a", description: "", priority: "high", status: "confirmed" },
      { id: "FR-002", type: "functional", title: "b", description: "", priority: "high", status: "confirmed" },
      { id: "NFR-001", type: "non_functional", title: "c", description: "", priority: "high", status: "confirmed" },
    ];
    expect(nextRequirementId(s, "functional")).toBe("FR-003");
    expect(nextRequirementId(s, "non_functional")).toBe("NFR-002");
    expect(nextRequirementId(seedState("idea"), "functional")).toBe("FR-001");
  });

  it("generates sequential assumption ids", () => {
    const s = seedState("idea");
    s.assumptions = [
      { id: "A-001", statement: "x", reason: "r", status: "pending" },
      { id: "A-002", statement: "y", reason: "r", status: "pending" },
    ];
    expect(nextAssumptionId(s)).toBe("A-003");
    expect(nextAssumptionId(seedState("idea"))).toBe("A-001");
  });
});
