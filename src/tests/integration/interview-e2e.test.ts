// End-to-end happy path against a real PostgreSQL database with the mock AI
// provider (no network). Proves the acceptance scenario in spec §52:
//   create project -> interview loop -> state reaches high readiness -> export
//   a coherent PROJECT.md.
//
// Gated on a reachable DB: if DATABASE_URL is unset we skip (not fail), so the
// unit suite still runs in a bare CI without a database.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { setMockProvider, getAIProvider } from "@/lib/ai";
import { signUp } from "@/lib/auth/service";
import { createProject, deleteProject, getProjectState } from "@/lib/services/project-service";
import { analyzeIdea, continueInterview, submitAnswer, type AnswerPayload } from "@/lib/services/interview";
import { renderProjectMarkdown } from "@/lib/export/markdown";
import { computeReadiness } from "@/lib/readiness/readiness";
import { query } from "@/lib/db/client";
import type { ProjectState, Question } from "@/types";

const EMAIL = `architect-${Date.now()}@pa.test`;
const PASSWORD = "correct-horse-99";

/** Build a valid AnswerPayload for a deterministic question. */
function answerFor(q: Question): AnswerPayload {
  const key = q.questionKey;
  const pick = (ids: string[]) => ({ questionKey: key, selected: ids });
  const realOpts = (q.options ?? []).filter((o) => o.id !== "unsure");

  switch (key) {
    case "problem":
      return { questionKey: key, freeText: "Teams lose shared work in scattered tools." };
    case "goals":
      return { questionKey: key, freeText: "Let the main user complete the core workflow." };
    case "target_users":
      return { questionKey: key, freeText: "Small teams of power users." };
    case "user_roles":
      return pick(realOpts.length > 0 ? [realOpts[0].id] : ["unsure"]);
    case "core_features":
      return pick(realOpts.map((o) => o.id)); // confirm all real features
    case "feature_priority":
      return pick(realOpts.length > 0 ? [realOpts[0].id] : ["unsure"]);
    case "what_data":
      return { questionKey: key, freeText: "Users and the core records they own." };
    case "database":
      return pick(["yes"]);
    case "access_control":
      return { questionKey: key, freeText: "Users can only access their own data." };
    case "critical_workflows":
      return pick(realOpts.map((o) => o.id));
    case "deployment_target":
      return pick(["vercel"]);
    default:
      return { questionKey: key, freeText: "As discussed." };
  }
}

let lastUser: string | null = null;

describe("interview happy path (DB-backed, mock AI)", () => {
  beforeAll(() => {
    setMockProvider();
    expect(getAIProvider().name).toBe("mock");
  });

  afterEach(async () => {
    // FK cascades clean up everything else; remove the user last.
    if (lastUser) {
      await query("DELETE FROM users WHERE id = $1", [lastUser]);
      lastUser = null;
    }
  });

  it("runs create -> interview -> complete -> export", async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set — skipping DB-backed e2e test.");
      return;
    }

    const { user } = await signUp({ email: EMAIL, password: PASSWORD, name: "Architect Test" });
    lastUser = user.id;

    let projectId = "";
    try {
      // 1) Create the project from a rough idea.
      const row = await createProject(user, {
        name: "E2E Study App",
        idea: "An app where teams share study notes and quiz each other on them.",
      });
      projectId = row.id;
      expect(row.id).toBeTruthy();

      // 2) Analyze the idea (seeds understanding deterministically).
      const first = await analyzeIdea(projectId, user);
      expect(first.analysis).toBeTruthy();

      // 3) Drive the interview loop until the next question is null.
      let state: ProjectState = await getProjectState(projectId, user);
      let guard = 0;
      while (guard++ < 25) {
        const turn = await continueInterview(projectId, user);
        if (turn.nextQuestion === null) break;
        await submitAnswer(projectId, answerFor(turn.nextQuestion), user);
        state = await getProjectState(projectId, user);
      }

      // The loop advanced the version past the seeded state.
      expect(state.version).toBeGreaterThanOrEqual(2);

      // 4) Readiness is meaningfully above a blank state (a fresh state scores
      //    ~21%; the driven one should be well above 50).
      const readiness = computeReadiness(state);
      expect(readiness.percent).toBeGreaterThan(50);

      // 5) Export produces a coherent, deterministic document.
      const { markdown } = renderProjectMarkdown(state);
      expect(markdown).toContain("# Project Specification");
      expect(markdown).toContain("E2E Study App");
      expect(markdown).toContain("## 1. Project Overview");
      expect(renderProjectMarkdown(state).markdown).toBe(markdown);

      // Ownership: the state is retrievable by the owner.
      expect((await getProjectState(projectId, user)).project.name).toBe("E2E Study App");
    } finally {
      if (projectId) await deleteProject(projectId, user);
    }
  }, 30_000);
});
