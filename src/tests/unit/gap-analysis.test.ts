import { describe, it, expect } from "vitest";
import { analyzeGaps, nextQuestion } from "@/lib/planner/gap-analysis";
import { seedState } from "@/types";
import type { ProjectState } from "@/types";

describe("gap analysis", () => {
  it("flags the core product gaps on a fresh state", () => {
    const s = seedState("an app");
    const gaps = analyzeGaps(s);
    const keys = gaps.map((g) => g.questionKey);
    expect(keys).toContain("problem");
    expect(keys).toContain("goals");
    expect(keys).toContain("target_users");
  });

  it("stops asking once the state is complete", () => {
    const s: ProjectState = {
      ...seedState("an app"),
      project: {
        ...seedState("an app").project,
        problem: "pain",
        goals: ["g"],
        targetUsers: ["students"],
        successCriteria: ["works"],
        facts: { problem: "x", goals: "x", target_users: "x" },
      },
    };
    s.features = [{ id: "f1f1f1f1-0000-4000-8000-000000000001", name: "Core", description: "d", priority: "must_have", status: "confirmed", source: "user" }];
    s.requirements = [{ id: "FR-001", type: "functional", title: "t", description: "d", priority: "critical", status: "confirmed" }];
    s.architecture = { database: "PostgreSQL", auth: "Sessions", backend: "API", frontend: "Next.js" };
    s.security = { accessControl: "Users can only view their own notes.", sensitiveData: "Uploaded files" };
    s.testing = { criticalWorkflows: ["Upload"], acceptanceCriteria: ["Works"] };
    s.deployment = { target: "Vercel", environmentVariables: ["DATABASE_URL"] };
    // The next question should now be null: no critical/high gap remains.
    expect(nextQuestion(s)).toBeNull();
  });

  it("ranks critical questions above medium/low", () => {
    const s = seedState("an app with features");
    s.features = [
      { id: "f1", name: "A", description: "d", priority: "should_have", status: "proposed", source: "user" },
    ];
    s.project.facts = { problem: "p", goals: "g", target_users: "u", what_data: "data", access_control: "ac", critical_workflows: "w" };
    const q = nextQuestion(s);
    // core_features is critical and should surface ahead of low-priority items.
    expect(q?.questionKey).toBe("core_features");
    expect(q?.priority).toBe("critical");
  });
});
