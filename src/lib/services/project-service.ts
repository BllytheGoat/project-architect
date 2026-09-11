// Project service. Every operation is gated by the authenticated user; a
// project id from the client is NEVER trusted without this check.
import { query, withClient } from "@/lib/db/client";
import { getCurrentUser, type AuthUser } from "@/lib/auth/service";
import type { ProjectState } from "@/types";
import { seedState } from "@/types";
import { projectStateSchema } from "@/lib/validation/schemas";
import { computeReadiness } from "@/lib/readiness/readiness";

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have access to this project.");
    this.name = "ForbiddenError";
  }
}
export class NotFoundError extends Error {
  constructor() {
    super("Project not found.");
    this.name = "NotFoundError";
  }
}
export class UnauthenticatedError extends Error {
  constructor() {
    super("You must be signed in.");
    this.name = "UnauthenticatedError";
  }
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  readiness_score: number;
  created_at: string;
  updated_at: string;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Load a project row and assert ownership. Throws Forbidden/NotFound. */
export async function loadOwnedProject(projectId: string, user?: AuthUser): Promise<ProjectRow> {
  const caller = user ?? (await getCurrentUser());
  if (!caller) throw new UnauthenticatedError();
  const res = await query<ProjectRow>(
    "SELECT * FROM projects WHERE id = $1 AND user_id = $2",
    [projectId, caller.id],
  );
  if (res.rows.length === 0) {
    // Distinguish "not yours" vs "doesn't exist" for clearer messaging.
    const any = await query<{ id: string }>("SELECT id FROM projects WHERE id = $1", [projectId]);
    if (any.rows.length === 0) throw new NotFoundError();
    throw new ForbiddenError();
  }
  return res.rows[0];
}

export async function createProject(
  user: AuthUser,
  input: { name?: string; idea: string },
): Promise<ProjectRow> {
  const provided = input.name?.trim() || "";
  // The dashboard row keeps a display fallback; the *state* name stays empty
  // when the user didn't supply one so the idea analyzer can adopt a better
  // suggestion (see analyzeIdea: `name: state.project.name || suggestion`).
  const rowName = provided || "Untitled project";
  const res = await query<ProjectRow>(
    "INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING *",
    [user.id, rowName, input.idea.trim()],
  );
  const row = res.rows[0];
  // Seed the canonical state from the raw idea, carrying the provided name so
  // the state title is consistent with the project row from the start.
  const state: ProjectState = projectStateSchema.parse(seedState(input.idea.trim()));
  if (provided) state.project.name = provided;
  await query(
    "INSERT INTO project_state (project_id, state_json, version) VALUES ($1, $2, 1)",
    [row.id, JSON.stringify(state)],
  );
  await query(
    "INSERT INTO project_messages (project_id, role, content) VALUES ($1, 'user', $2)",
    [row.id, input.idea.trim()],
  );
  return row;
}

export async function listProjects(user: AuthUser): Promise<ProjectRow[]> {
  const res = await query<ProjectRow>(
    "SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC",
    [user.id],
  );
  return res.rows;
}

export async function getProjectState(projectId: string, user?: AuthUser): Promise<ProjectState> {
  await loadOwnedProject(projectId, user);
  const res = await query<{ state_json: ProjectState }>(
    "SELECT state_json FROM project_state WHERE project_id = $1",
    [projectId],
  );
  if (res.rows.length === 0) {
    throw new NotFoundError();
  }
  return projectStateSchema.parse(res.rows[0].state_json);
}

export async function saveProjectState(
  projectId: string,
  state: ProjectState,
  user?: AuthUser,
): Promise<ProjectState> {
  await loadOwnedProject(projectId, user);
  const next = projectStateSchema.parse(state);
  const readiness = computeReadiness(next);
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO project_state (project_id, state_json, version, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (project_id) DO UPDATE
         SET state_json = EXCLUDED.state_json,
             version    = EXCLUDED.version,
             updated_at = now()`,
      [projectId, JSON.stringify(next), next.version],
    );
    await c.query("UPDATE projects SET readiness_score = $2 WHERE id = $1", [
      projectId,
      readiness.percent,
    ]);
  });
  return next;
}

export async function renameProject(
  projectId: string,
  name: string,
  user?: AuthUser,
): Promise<void> {
  await loadOwnedProject(projectId, user);
  await query("UPDATE projects SET name = $2 WHERE id = $1", [projectId, name.trim()]);
}

export async function deleteProject(projectId: string, user?: AuthUser): Promise<void> {
  await loadOwnedProject(projectId, user);
  await query("DELETE FROM projects WHERE id = $1", [projectId]);
}

export interface ProjectMessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export async function getMessages(projectId: string, user?: AuthUser): Promise<ProjectMessageRow[]> {
  await loadOwnedProject(projectId, user);
  const res = await query<ProjectMessageRow>(
    "SELECT role, content, created_at FROM project_messages WHERE project_id = $1 ORDER BY created_at ASC",
    [projectId],
  );
  return res.rows;
}

export async function addMessage(
  projectId: string,
  role: "user" | "assistant",
  content: string,
  user?: AuthUser,
): Promise<void> {
  await loadOwnedProject(projectId, user);
  await query(
    "INSERT INTO project_messages (project_id, role, content) VALUES ($1, $2, $3)",
    [projectId, role, content],
  );
}
