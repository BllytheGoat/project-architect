import { describe, it, expect } from "vitest";
import { renderProjectMarkdown } from "@/lib/export/markdown";
import { seedState } from "@/types";
import type { ProjectState } from "@/types";
import { projectStateSchema } from "@/lib/validation/schemas";
import fs from "node:fs";
import path from "node:path";

// Load a fixture through the Zod schema so a malformed fixture fails loudly.
function loadFixture(name: string): ProjectState {
  const p = path.join(__dirname, "..", "fixtures", name);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return projectStateSchema.parse(raw);
}

describe("markdown exporter", () => {
  it("renders a complete spec for the student fixture", () => {
    const state = loadFixture("student-notes-app.json");
    const { markdown } = renderProjectMarkdown(state);
    expect(markdown).toContain("# Project Specification");
    expect(markdown).toContain("Student Notes Hub");
    expect(markdown).toContain("FR-001");
    expect(markdown).toContain("PostgreSQL");
    // Contains the agent-oriented implementation guidance (spec §26).
    expect(markdown).toMatch(/Implementation|Guidance|implementation/i);
  });

  it("says 'Not specified.' for empty sections instead of inventing", () => {
    const s = seedState("a vague idea");
    const { markdown } = renderProjectMarkdown(s);
    expect(markdown).toContain("Not specified.");
    // Empty goals -> the Goals section is present but honest.
    expect(markdown).toContain("Goals");
  });

  it("is deterministic: same state -> identical markdown", () => {
    const state = loadFixture("student-notes-app.json");
    const a = renderProjectMarkdown(state).markdown;
    const b = renderProjectMarkdown(state).markdown;
    expect(a).toBe(b);
  });

  it("never invents features that are not in state", () => {
    const s = seedState("a simple todo list");
    const { markdown } = renderProjectMarkdown(s);
    // No crypto / video / payments content leaks in.
    expect(markdown).not.toMatch(/cryptocurrency|live video|AI tutoring/i);
  });
});
