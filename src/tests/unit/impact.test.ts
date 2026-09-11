// Unit tests for the deterministic change-impact analyzer (§21).
import { describe, it, expect } from "vitest";
import { seedState } from "@/types";
import type { ProjectState } from "@/types";
import { analyzeChangeImpact, buildPendingDecision } from "@/lib/planner/impact";

const F1 = "a1000000-0000-4000-8000-000000000001";

function seeded(): ProjectState {
  const s = seedState("Teams share study notes.");
  s.features = [
    {
      id: F1,
      name: "Note sharing",
      description: "d",
      priority: "must_have",
      status: "confirmed",
      source: "user",
      ref: "FEAT-001",
    },
  ];
  return s;
}

describe("analyzeChangeImpact", () => {
  it("classifies an auth-provider change as medium and touches auth areas", () => {
    const r = analyzeChangeImpact("Add Google OAuth sign-in", seeded());
    expect(r.level).toBe("medium");
    const areas = r.areas.map((a) => a.area);
    expect(areas).toContain("login UI");
    expect(areas).toContain("authentication configuration");
    // 5 auth areas -> explicit confirmation required.
    expect(r.requiresConfirmation).toBe(true);
  });

  it("classifies a visibility change as high and confirmation-required", () => {
    const r = analyzeChangeImpact("Make notes publicly shareable", seeded());
    expect(r.level).toBe("high");
    expect(r.requiresConfirmation).toBe(true);
    expect(r.areas.map((a) => a.area)).toContain("permissions / access control");
  });

  it("classifies a deployment change as low and non-confirming", () => {
    const r = analyzeChangeImpact("Deploy to Vercel instead", seeded());
    expect(r.level).toBe("low");
    // Low level and < 5 areas -> no explicit confirmation needed.
    expect(r.requiresConfirmation).toBe(false);
  });

  it("falls back to a generic low-impact report when nothing matches", () => {
    const r = analyzeChangeImpact("adjust the accent color shade", seeded());
    expect(r.level).toBe("low");
    expect(r.requiresConfirmation).toBe(false);
    // Generic areas always mention state + readiness + plan version.
    const areas = r.areas.map((a) => a.area);
    expect(areas).toContain("state");
    expect(areas).toContain("readiness");
  });

  it("lists the stable refs of features the change mentions", () => {
    const r = analyzeChangeImpact("Update the note sharing workflow", seeded());
    expect(r.affectedRefs).toContain("FEAT-001");
  });

  it("is deterministic: identical input yields an identical report", () => {
    const a = analyzeChangeImpact("Make notes publicly shareable", seeded());
    const b = analyzeChangeImpact("Make notes publicly shareable", seeded());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("buildPendingDecision", () => {
  it("produces a decision prompt naming the level and affected refs", () => {
    const r = analyzeChangeImpact("Update the note sharing workflow", seeded());
    const text = buildPendingDecision(r, seeded());
    expect(text).toContain("Impact level:");
    expect(text).toContain("FEAT-001");
  });
});
