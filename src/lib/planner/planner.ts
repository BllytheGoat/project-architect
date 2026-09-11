// Phase 2 planning engine. Pure & deterministic: derives the structured
// planning sections (requirements, user stories, acceptance criteria,
// dependencies, architecture components, database, API, pages, user flows,
// security items, test cases, implementation phases + tasks) directly from
// the existing structured state — not from prompt text. Every generator
// returns StateUpdate ops that run through the normal mutation pipeline, so
// the AI (when present) only *enriches* a section; it is never the source of
// truth (§68). Re-running a generator on the same state is idempotent.

import type {
  ProjectState,
  Feature,
  Requirement,
  UserStory,
  AcceptanceCriterion,
  Dependency,
  ArchitectureComponent,
  DatabaseEntity,
  ApiEndpoint,
  ProjectPage,
  UserFlow,
  SecurityItem,
  TestCase,
  ImplementationPhase,
  ImplementationTask,
  StateUpdate,
} from "@/types";
import { nextRef, ensureFeatureRef, classifyComplexity } from "@/lib/planner/ids";
import { applyUpdates } from "@/lib/planner/state-update";

/**
 * Assign stable FEAT-### refs to features that lack one. This must run before
 * any generator that references feature refs.
 */
export function ensureRefs(state: ProjectState): StateUpdate[] {
  ensureFeatureRef(state);
  return [];
}

// ---------------------------------------------------------------------------
// Requirements (§5): every confirmed feature yields a functional requirement;
// shared security features yield a non-functional one.
// ---------------------------------------------------------------------------
export function generateRequirements(state: ProjectState): StateUpdate[] {
  const reqs: Requirement[] = [];
  const existing = new Set(state.requirements.map((r) => r.id));

  const addFR = (title: string, desc: string, priority: Requirement["priority"], featureId?: string) => {
    // One FR per unique title (case-insensitive) — keep the earliest.
    if (reqs.some((r) => r.title.toLowerCase() === title.toLowerCase())) return;
    const id = nextRef(Array.from(existing), "FR");
    existing.add(id);
    reqs.push({
      id,
      type: "functional",
      title,
      description: desc,
      priority,
      status: "proposed",
      source: "system",
      featureId,
    });
  };

  for (const f of state.features) {
    if (f.status === "rejected" || f.status === "superseded") continue;
    const title = `${f.name}`;
    addFR(
      title,
      f.description || `Supports the "${f.name}" capability for the primary users.`,
      f.priority === "must_have" ? "high" : f.priority === "could_have" || f.priority === "future" ? "low" : "medium",
      f.id,
    );
  }

  // Non-functional: if any confirmed feature touches auth/ownership/security,
  // add a critical NFR for access control.
  const secFeature = state.features.find(
    (f) => f.status === "confirmed" && /auth|account|security|owner|private/i.test(f.name + " " + f.description),
  );
  if (secFeature && !reqs.some((r) => r.type === "non_functional")) {
    const id = nextRef(Array.from(existing), "NFR");
    existing.add(id);
    reqs.push({
      id,
      type: "non_functional",
      title: "Users can only access data they are permitted to",
      description: "Server-side authorization enforced on every read and write of user-owned content.",
      priority: "critical",
      status: "proposed",
      source: "system",
      featureId: secFeature.id,
    });
  }

  // Link feature -> requirements.
  for (const f of state.features) {
    f.requirementIds = state.requirements
      .filter((r) => r.featureId === f.id)
      .map((r) => r.id);
  }

  const ops: StateUpdate[] = [];
  for (const r of reqs) ops.push({ op: "upsert_requirement", requirement: r });
  return ops;
}

// ---------------------------------------------------------------------------
// User stories (§10) + acceptance criteria (§11).
// ---------------------------------------------------------------------------
export function generateUserStories(state: ProjectState): StateUpdate[] {
  const existing = new Set(state.userStories.map((s) => s.id));
  const acExisting = new Set(state.acceptanceCriteria.map((a) => a.id));
  const ops: StateUpdate[] = [];

  for (const f of state.features.filter((x) => x.status === "confirmed" || x.status === "proposed")) {
    // Idempotent: one story per feature. Skip if this feature already has one
    // persisted, so refreshing a plan never doubles the section (§44).
    if (state.userStories.some((s) => s.featureId === f.id)) continue;
    const role =
      state.project.targetUsers[0] ??
      (state.project.targetUsers.length ? "the primary user" : "the user");
    const usId = nextRef(Array.from(existing), "US");
    existing.add(usId);

    const story: UserStory = {
      id: usId,
      role: role.charAt(0).toUpperCase() + role.slice(1),
      action: f.description || `use ${f.name}`,
      benefit: state.project.goals[0] ?? `so that the core workflow works end to end`,
      featureId: f.id,
      priority: f.priority === "must_have" ? "high" : f.priority === "could_have" || f.priority === "future" ? "low" : "medium",
      requirementIds: state.requirements.filter((r) => r.featureId === f.id).map((r) => r.id),
      acceptanceCriteriaIds: [],
      status: "inferred",
    };
    ops.push({ op: "upsert_user_story", story });

    // Testable acceptance criteria (Given/When/Then preferred). Dedup against
    // persisted ACs by their statement so a re-run doesn't mint a second set (§44).
    if (!state.acceptanceCriteria.some((a) => a.statement === `${story.role} can ${story.action}`)) {
      const acId = nextRef(Array.from(acExisting), "AC");
      acExisting.add(acId);
      const ac: AcceptanceCriterion = {
        id: acId,
        statement: `${story.role} can ${story.action}`,
        given: "the user is authenticated",
        when: `they ${story.action}`,
        then: "the outcome succeeds without errors and the data is persisted",
        status: "inferred",
      };
      story.acceptanceCriteriaIds = [acId];
      ops.push({ op: "upsert_acceptance_criterion", criterion: ac });
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Dependencies (§9): structural, influence implementation ordering.
// ---------------------------------------------------------------------------
export function generateDependencies(state: ProjectState): StateUpdate[] {
  const ref = new Map(state.features.map((f) => [f.id, f.ref ?? f.id]));
  const byName = new Map(
    state.features.map((f) => [f.name.toLowerCase().trim(), f]),
  );
  const deps: Dependency[] = [];
  const seen = new Set(state.dependencies.map((d) => `${d.sourceId}->${d.targetId}`));

  const findFeature = (re: RegExp) =>
    Array.from(byName.values()).find((f) => re.test(f.name.toLowerCase()));

  // Authentication precedes anything that owns content.
  const accounts = findFeature(/account|auth|user|profile|login|sign/i);
  const notes = findFeature(/note|upload|share|document|file|post/i);
  const discussion = findFeature(/discuss|comment|chat|reply/i);

  const add = (src?: Feature, tgt?: Feature, reason?: string, type?: Dependency["type"]) => {
    if (!src || !tgt || src.id === tgt.id) return;
    const key = `${ref.get(src.id)}->${ref.get(tgt.id)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(state.dependencies.map((d) => d.id)), "DEP");
    deps.push({
      id,
      sourceId: ref.get(src.id) ?? src.id,
      sourceKind: "feature",
      targetId: ref.get(tgt.id) ?? tgt.id,
      targetKind: "feature",
      type: type ?? "requires",
      reason: reason ?? `${src.name} must exist before ${tgt.name}.`,
      status: "open",
    });
  };

  if (accounts && notes) add(accounts, notes, "Note ownership requires user identity.", "requires");
  if (notes && discussion) add(notes, discussion, "Discussion attaches to a shared note.", "order_after");
  if (accounts && discussion) add(accounts, discussion, "Comments are attributed to an identity.", "requires");

  // Data-dependent: any feature that stores content depends on accounts.
  for (const f of state.features) {
    if (f.id === accounts?.id) continue;
    if (/upload|share|note|document|file|post|store/i.test(f.name + " " + f.description)) {
      add(f, accounts, `${f.name} stores user-owned content, which requires an identity.`, "data_dependent");
    }
  }

  const ops: StateUpdate[] = [];
  for (const d of deps) ops.push({ op: "upsert_dependency", dependency: d });
  return ops;
}

// ---------------------------------------------------------------------------
// Architecture components (§23).
// ---------------------------------------------------------------------------
export function generateArchitectureComponents(state: ProjectState): StateUpdate[] {
  const a = state.architecture;
  const comps: ArchitectureComponent[] = [];
  const existing = new Set(state.architectureComponents.map((c) => c.id));
  const seen = new Set(state.architectureComponents.map((c) => c.name.toLowerCase()));
  const add = (name: string, kind: ArchitectureComponent["kind"], responsibility: string) => {
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "COMP");
    existing.add(id);
    comps.push({ id, name, kind, responsibility });
  };
  add(a.frontend ?? "Client", "client", "Presents the interface and routes user actions.");
  add(a.backend ?? "Application server", "server", "Owns business logic, API, and persistence.");
  add(a.database ?? "Data store", "datastore", "Stores relational data with integrity constraints.");
  if (a.auth) add("Authentication", "service", "Issues and validates user sessions.");
  if (a.fileStorage) add("Object storage", "third_party", "Stores uploaded files outside the app server.");
  // Link components to their data flow.
  if (comps.length >= 2) {
    for (let i = 0; i < comps.length - 1; i++) comps[i].connectsTo = [comps[i + 1].id];
  }
  return comps.map((c) => ({ op: "upsert_architecture_component" as const, component: c }));
}

// ---------------------------------------------------------------------------
// Database planner (§25): infer entities from data facts + features.
// ---------------------------------------------------------------------------
export function generateDatabase(state: ProjectState): StateUpdate[] {
  const blobs = [
    state.project.description,
    ...state.project.goals,
    ...Object.values(state.project.facts),
    ...state.features.map((f) => f.name + " " + f.description),
    state.architecture.database ?? "",
  ].join(" ");
  const lower = blobs.toLowerCase();

  const entities: DatabaseEntity[] = [];
  const existing = new Set(state.database.map((e) => e.id));
  const seen = new Set(state.database.map((e) => e.name.toLowerCase()));
  const add = (
    name: string,
    desc: string,
    fields: { name: string; type: string }[],
    pk: string[],
    rels: string[],
    ownership: string,
    access: string,
  ) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "DB");
    existing.add(id);
    entities.push({
      id,
      name,
      description: desc,
      fields,
      primaryKey: pk,
      foreignKeys: [],
      indexes: [],
      constraints: [],
      relationships: rels,
      ownership,
      accessRules: access,
    });
  };

  const hasUsers = /user|student|account|member|role|owner/i.test(lower);
  if (hasUsers)
    add(
      "users",
      "Registered identities.",
      [
        { name: "id", type: "uuid pk" },
        { name: "email", type: "text unique" },
        { name: "display_name", type: "text" },
        { name: "created_at", type: "timestamptz" },
      ],
      ["id"],
      ["1 ── *  to their content"],
      "Self (owner)",
      "Read only own; admins may read others.",
    );

  const noteName = /note|document|file|post|entry/i.test(lower) ? "notes" : null;
  if (noteName)
    add(
      noteName,
      "Core content owned by users.",
      [
        { name: "id", type: "uuid pk" },
        { name: "owner_id", type: "uuid fk->users" },
        { name: "title", type: "text" },
        { name: "body", type: "text" },
        { name: "file_url", type: "text" },
        { name: "created_at", type: "timestamptz" },
      ],
      ["id"],
      [hasUsers ? `* ── 1  users (owner)` : ""],
      "Owner user",
      "Owner full control; sharing grants read (or comment).",
    );

  const shareName = /share|permission|access|visibility/i.test(lower) ? "shares" : null;
  if (shareName && noteName)
    add(
      shareName,
      "Grants access to a note for another user.",
      [
        { name: "id", type: "uuid pk" },
        { name: "note_id", type: "uuid fk->notes" },
        { name: "grantee_id", type: "uuid fk->users" },
        { name: "role", type: "text ('read'|'comment'|'edit')" },
      ],
      ["id"],
      [
        `* ── 1  ${noteName}`,
        `* ── 1  users (grantee)`,
      ],
      "Note owner",
      "Only note owner can grant/revoke.",
    );

  const commentName = /comment|discuss|reply|thread/i.test(lower) ? "comments" : null;
  if (commentName)
    add(
      commentName,
      "Discussion on shared content.",
      [
        { name: "id", type: "uuid pk" },
        { name: noteName ? `${noteName}_id` : "content_id", type: "uuid fk" },
        { name: "author_id", type: "uuid fk->users" },
        { name: "body", type: "text" },
        { name: "created_at", type: "timestamptz" },
      ],
      ["id"],
      [commentName === "comments" ? `* ── 1  ${noteName}` : ""],
      "Author",
      "Author can delete own; owner can delete any.",
    );

  // Flag obvious gaps (§25): entities without ownership or access rules.
  for (const e of entities) {
    if (!e.ownership) e.ownership = "UNSPECIFIED";
    if (!e.accessRules) e.accessRules = "UNSPECIFIED";
  }

  return entities.map((e) => ({ op: "upsert_database_entity" as const, entity: e }));
}

// ---------------------------------------------------------------------------
// API planner (§26).
// ---------------------------------------------------------------------------
export function generateApi(state: ProjectState): StateUpdate[] {
  const eps: ApiEndpoint[] = [];
  const existing = new Set(state.api.map((e) => e.id));
  const seen = new Set(state.api.map((e) => `${e.method} ${e.path}`));
  const add = (
    method: ApiEndpoint["method"],
    path: string,
    purpose: string,
    auth: ApiEndpoint["auth"],
    req = "",
    resp = "",
    errors = "",
  ) => {
    const key = `${method} ${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "API");
    existing.add(id);
    eps.push({
      id,
      method,
      path,
      purpose,
      auth,
      permissions: [],
      requirementIds: [],
      request: req,
      response: resp,
      errors,
    });
  };

  const hasAuth = /account|auth|user|login|sign/i.test(
    state.features.map((f) => f.name).join(" "),
  );
  if (hasAuth) {
    add("POST", "/api/auth/signup", "Create an account", "public", "email, password, name", "session cookie", "409 email taken");
    add("POST", "/api/auth/login", "Authenticate", "public", "email, password", "session cookie", "401 invalid credentials");
    add("POST", "/api/auth/logout", "Invalidate session", "user", "", "204", "");
  }

  const noteName = /note|document|file|post|entry/i.test(
    state.features.map((f) => f.name).join(" "),
  );
  if (noteName) {
    add("GET", "/api/notes", "List accessible notes", "user", "query: ?cursor", "Note[]", "401 unauthenticated");
    add("POST", "/api/notes", "Create a note", "user", "title, body, file?", "Note", "400 invalid, 413 file too large");
    add("GET", "/api/notes/:id", "Fetch one note", "user", "", "Note", "403 not permitted, 404");
    add("DELETE", "/api/notes/:id", "Delete a note (owner)", "user", "", "204", "403 not owner");
  }

  if (/share|permission|access|visibility/i.test(state.features.map((f) => f.name).join(" "))) {
    add("POST", "/api/notes/:id/shares", "Grant access to a user", "user", "granteeId, role", "Share", "403 not owner");
    add("DELETE", "/api/notes/:id/shares/:granteeId", "Revoke access", "user", "", "204", "403 not owner");
  }

  return eps.map((e) => ({ op: "upsert_api_endpoint" as const, endpoint: e }));
}

// ---------------------------------------------------------------------------
// UI / page planner (§27).
// ---------------------------------------------------------------------------
export function generatePages(state: ProjectState): StateUpdate[] {
  const pages: ProjectPage[] = [];
  const existing = new Set(state.pages.map((p) => p.id));
  const seen = new Set(state.pages.map((p) => p.name.toLowerCase()));
  const add = (
    name: string,
    path: string,
    access: ProjectPage["access"],
    purpose: string,
    users: string[],
    actions: string[],
    requiredData: string[],
  ) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "PAGE");
    existing.add(id);
    pages.push({
      id,
      name,
      path,
      access,
      purpose,
      users,
      components: [],
      actions,
      requiredData,
      states: [],
      permissions: [],
    });
  };

  add("Landing", "/", "public", "Explain the value proposition; drive signup", ["anyone"], ["Create account", "Sign in"], ["project marketing copy"]);
  add("Sign in", "/login", "public", "Authenticate returning users", ["registered users"], ["Sign in"], ["credentials"]);
  add("Sign up", "/signup", "public", "Onboard a new user", ["new users"], ["Create account"], ["email", "password"]);
  add("Dashboard", "/dashboard", "authenticated", "Show the user's content and next actions", ["registered users"], ["Create", "Open", "Delete"], ["user's items"]);

  const noteName = /note|document|file|post|entry/i.test(
    state.project.description + state.features.map((f) => f.name).join(" "),
  );
  if (noteName) {
    add("Content list", "/content", "authenticated", "Browse the user's items", ["registered users"], ["Create", "Filter", "Share"], ["items"]);
    add("Item details", "/content/:id", "authenticated", "View + manage one item", ["registered users", "shared viewers"], ["View", "Edit", "Share", "Comment", "Delete"], ["item", "permissions"]);
  }

  return pages.map((p) => ({ op: "upsert_page" as const, page: p }));
}

// ---------------------------------------------------------------------------
// User flows (§28).
// ---------------------------------------------------------------------------
export function generateUserFlows(state: ProjectState): StateUpdate[] {
  const flows: UserFlow[] = [];
  const existing = new Set(state.userFlows.map((f) => f.id));
  const seen = new Set(state.userFlows.map((f) => f.name.toLowerCase()));
  const add = (name: string, happyPath: string[], failure: { trigger: string; recovery: string }[]) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "FLOW");
    existing.add(id);
    flows.push({ id, name, happyPath, steps: happyPath, failurePaths: failure });
  };

  add(
    "Create account and first sign in",
    ["Landing", "Sign up", "Enter details", "Verify email", "Land on dashboard"],
    [
      { trigger: "Email already registered", recovery: "Offer sign-in link and reset flow." },
      { trigger: "Weak password", recovery: "Show inline validation; block submit." },
    ],
  );

  const content = /note|document|file|post|entry|upload/i.test(
    state.project.description + state.features.map((f) => f.name).join(" "),
  );
  if (content) {
    add(
      "Create and share a content item",
      ["Dashboard", "Create", "Enter details", "Attach file", "Submit", "Item details", "Share", "Recipient notified"],
      [
        { trigger: "File too large", recovery: "Return 413 with size limit shown." },
        { trigger: "No permission on share target", recovery: "Explain who can be shared with." },
        { trigger: "Network failure during upload", recovery: "Resume/queue the upload." },
      ],
    );
    add(
      "Recipient accesses shared content",
      ["Receive link", "Open", "Sign in", "View content"],
      [
        { trigger: "Share revoked", recovery: "Show 'no longer available' state." },
        { trigger: "Unauthorized user", recovery: "403 and suggest requesting access." },
      ],
    );
  }

  return flows.map((f) => ({ op: "upsert_user_flow" as const, flow: f }));
}

// ---------------------------------------------------------------------------
// Security planner + threat modeling (§29/§30).
// ---------------------------------------------------------------------------
export function generateSecurity(state: ProjectState): StateUpdate[] {
  const items: SecurityItem[] = [];
  const existing = new Set(state.securityItems.map((i) => i.id));
  const seen = new Set(state.securityItems.map((i) => i.threat.toLowerCase()));
  const add = (threat: string, impact: string, mitigation: string, status: SecurityItem["status"] = "required") => {
    const key = threat.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "SEC");
    existing.add(id);
    items.push({ id, threat, impact, mitigation, status });
  };

  add("Unauthorized user reads another user's private content", "High — data leak", "Enforce ownership/permission on every read; deny by default.");
  add("Forged or stolen session", "High — impersonation", "Short-lived sessions, hashed tokens at rest, rotate on login.");
  add("Malicious file upload", "High — RCE / storage abuse", "Validate MIME + size, store outside webroot, scan before serving.");
  add("SQL injection", "High — data exfiltration", "Parameterized queries / ORM only; no string-built SQL.");
  add("Secret leakage to the client", "Medium — credential exposure", "Keep keys server-side; expose no secrets in responses.");

  // Reflect access-control model from state when present.
  if (state.security.accessControl) {
    add(
      "Broken access control",
      "High",
      `Access-control model: ${state.security.accessControl}`,
      "addressed",
    );
  }

  return items.map((i) => ({ op: "upsert_security_item" as const, item: i }));
}

// ---------------------------------------------------------------------------
// Testing planner (§31).
// ---------------------------------------------------------------------------
export function generateTestCases(state: ProjectState): StateUpdate[] {
  const cases: TestCase[] = [];
  const existing = new Set(state.testCases.map((t) => t.id));
  const seen = new Set(state.testCases.map((t) => t.target.toLowerCase()));
  const add = (kind: TestCase["kind"], target: string, description = "") => {
    const key = target.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = nextRef(Array.from(existing), "TEST");
    existing.add(id);
    cases.push({ id, kind, target, description });
  };

  add("unit", "Readiness scoring", "Pure function: same state -> same score.");
  add("unit", "State mutation pipeline", "Idempotent upserts; malformed AI JSON rejected.");
  for (const w of state.testing.criticalWorkflows ?? []) add("e2e", w);
  add("integration", "Auth + owned data", "Signup -> create -> read back, gated by ownership.");
  add("security", "Access control", "A user cannot read another user's content (403).");

  // Critical workflows from user stories when present.
  for (const us of state.userStories.slice(0, 6)) {
    add("e2e", `${us.role}: ${us.action}`);
  }

  return cases.map((t) => ({ op: "upsert_test_case" as const, item: t }));
}

// ---------------------------------------------------------------------------
// Implementation phases + tasks (§33/§34) via dependency ordering.
// ---------------------------------------------------------------------------
export function generateImplementationPlan(state: ProjectState): StateUpdate[] {
  const ref = new Map(state.features.map((f) => [f.id, f.ref ?? f.id]));
  const confirmed = state.features.filter((f) => f.status === "confirmed" || f.priority === "must_have");
  const ordered = topologicalOrderFeatures(state, confirmed);
  const chunks = ordered.length ? chunked(ordered, Math.max(1, Math.ceil(ordered.length / 4))) : [];

  const phases: ImplementationPhase[] = [];
  const tasks: ImplementationTask[] = [];
  const existingPhase = new Set(state.implementationPhases.map((p) => p.id));
  const existingTask = new Set(state.implementationTasks.map((t) => t.id));
  const phaseNames = new Set(state.implementationPhases.map((p) => p.name));
  const taskTitles = new Set(state.implementationTasks.map((t) => t.title));

  const addTask = (title: string, desc: string, featureRef?: string, requirementRef?: string) => {
    // Idempotent: a phase may already carry a task for this title (§44).
    if (taskTitles.has(title)) {
      const id = nextRef(Array.from(existingTask), "TASK");
      return id;
    }
    const id = nextRef(Array.from(existingTask), "TASK");
    existingTask.add(id);
    taskTitles.add(title);
    tasks.push({ id, title, description: desc, featureRef, requirementRef });
    return id;
  };

  const pushPhase = (phase: ImplementationPhase) => {
    if (phaseNames.has(phase.name)) return;
    phaseNames.add(phase.name);
    existingPhase.add(phase.id);
    phases.push(phase);
  };

  pushPhase({
    id: nextRef(Array.from(existingPhase), "PHASE"),
    order: 1,
    name: "Foundation & setup",
    objective: "Project scaffold, database foundation, and authentication.",
    featureRefs: [],
    requirementRefs: [],
    taskIds: [
      addTask("Initialize project", "Scaffold repo, tooling, and CI."),
      addTask("Configure database", "Schema, connection, migrations."),
      addTask("Implement authentication", "Signup, sign-in, sessions."),
    ],
    acceptanceCriteria: ["Authentication works end-to-end"],
  });

  chunks.forEach((chunk, i) => {
    const phase: ImplementationPhase = {
      id: nextRef(Array.from(existingPhase), "PHASE"),
      order: i + 2,
      name: chunk[0]?.ref ?? `Phase ${i + 2}`,
      objective: `Ship: ${chunk.map((f) => f.name).join(", ")}`,
      featureRefs: chunk.map((f) => f.ref ?? f.id),
      requirementRefs: state.requirements.filter((r) => chunk.some((f) => f.id === r.featureId)).map((r) => r.id),
      taskIds: chunk.map((f) => addTask(`Implement ${f.name}`, f.description || f.name, f.ref ?? f.id)),
      acceptanceCriteria: chunk.map((f) => `${f.name} works end-to-end`),
    };
    pushPhase(phase);
  });

  pushPhase({
    id: nextRef(Array.from(existingPhase), "PHASE"),
    order: state.implementationPhases.length + 1,
    name: "Quality & release",
    objective: "Testing, security hardening, and deployment.",
    featureRefs: [],
    requirementRefs: [],
    taskIds: [
      addTask("Testing pass", "Run unit + e2e for critical workflows."),
      addTask("Security review", "Resolve required security items."),
      addTask("Deployment", "Production config, env vars, release."),
    ],
    acceptanceCriteria: ["All critical tests green", "No open required security items"],
  });

  const ops: StateUpdate[] = [];
  for (const p of phases) ops.push({ op: "upsert_implementation_phase", phase: p });
  for (const t of tasks) ops.push({ op: "upsert_implementation_task", task: t });
  return ops;
}

/** Deterministic topological order of features by their dependency graph. */
export function topologicalOrderFeatures(
  state: ProjectState,
  input: Feature[],
): Feature[] {
  const ids = new Set(input.map((f) => f.id));
  const adj = new Map<string, Set<string>>(); // src -> [tgt]
  for (const f of input) adj.set(f.id, new Set());
  for (const d of state.dependencies) {
    if (d.sourceId && d.targetId && ids.has(d.sourceId) && ids.has(d.targetId)) {
      adj.get(d.sourceId)?.add(d.targetId);
    }
  }
  const indeg = new Map<string, number>(input.map((f) => [f.id, 0]));
  for (const [src, tgts] of adj) for (const t of tgts) indeg.set(t, (indeg.get(t) ?? 0) + 1);

  const q = input.filter((f) => (indeg.get(f.id) ?? 0) === 0).map((f) => f.id);
  const order: Feature[] = [];
  const byId = new Map(input.map((f) => [f.id, f]));
  while (q.length) {
    const id = q.shift()!;
    order.push(byId.get(id)!);
    for (const t of adj.get(id) ?? []) {
      const n = (indeg.get(t) ?? 1) - 1;
      indeg.set(t, n);
      if (n === 0) q.push(t);
    }
  }
  // Cycles: append remaining in stable index order (deterministic fallback).
  const remaining = input.filter((f) => !order.some((o) => o.id === f.id));
  return [...order, ...remaining];
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
/**
 * One-shot: generate every empty planning section from the current state.
 * Existing items are preserved (every generator is idempotent).
 *
 * Generators are threaded: each section's ops are applied to a *working* copy
 * of state before the next section runs, so downstream generators (test cases,
 * implementation plan) see entities produced earlier in the same batch. This
 * makes a full re-plan deterministic and convergent — running it on an empty
 * state and on an already-planned state yields the same final set (§44).
 */
export function generateAllPlanningSections(state: ProjectState): StateUpdate[] {
  const orderedSections: { gen: (s: ProjectState) => StateUpdate[] }[] = [
    { gen: generateRequirements },
    { gen: generateUserStories },
    { gen: generateDependencies },
    { gen: generateArchitectureComponents },
    { gen: generateDatabase },
    { gen: generateApi },
    { gen: generatePages },
    { gen: generateUserFlows },
    { gen: generateSecurity },
    { gen: generateTestCases },
    { gen: generateImplementationPlan },
  ];

  let working = state;
  const all: StateUpdate[] = [];
  for (const { gen } of orderedSections) {
    const ops = gen(working);
    all.push(...ops);
    working = applyUpdates(working, ops); // thread forward (no version bump)
  }
  // Set complexity deterministically (§47) so planning depth is traceable.
  all.push({ op: "set_complexity", value: classifyComplexity(working) });
  return all;
}

/** Deterministic per-section generators (map of section key -> updater). */
export const sectionGenerators: Record<string, (s: ProjectState) => StateUpdate[]> = {
  requirements: generateRequirements,
  "user-stories": generateUserStories,
  dependencies: generateDependencies,
  architecture: generateArchitectureComponents,
  database: generateDatabase,
  api: generateApi,
  pages: generatePages,
  flows: generateUserFlows,
  security: generateSecurity,
  testing: generateTestCases,
  implementation: generateImplementationPlan,
};
