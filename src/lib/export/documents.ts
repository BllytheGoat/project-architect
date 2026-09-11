// Multi-document export (§40). Every document is generated deterministically
// from structured state and cross-references the others. PROJECT.md and
// BUILD.md reuse existing renderers; the rest are new. Nothing here invents
// content — empty sections say "Not yet specified."

import type { ProjectState } from "@/types";
import { renderProjectMarkdown } from "@/lib/export/markdown";
import { renderBuildMd } from "@/lib/export/build-md";

const notSpecified = "Not yet specified.";
const nl = (xs: string[]) => xs.join("\n");

function header(title: string, note?: string): string[] {
  const out = [`# ${title}`, ""];
  if (note) out.push(`> ${note}`, "");
  return out;
}

function bulleted(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : notSpecified;
}

function architectureDoc(state: ProjectState): string {
  const a = state.architecture;
  const lines: string[] = [...header("ARCHITECTURE", "Components, data flow, and trust boundaries. See BUILD.md for operating rules.")];

  lines.push("## Overview");
  lines.push(
    [
      a.frontend ? `- Frontend: ${a.frontend}` : null,
      a.backend ? `- Backend: ${a.backend}` : null,
      a.database ? `- Database: ${a.database}` : null,
      a.auth ? `- Authentication: ${a.auth}` : null,
      a.fileStorage ? `- File storage: ${a.fileStorage}` : null,
    ]
      .filter(Boolean)
      .join("\n") || notSpecified,
  );

  lines.push("", "## Components");
  lines.push(
    state.architectureComponents.length
      ? state.architectureComponents
          .map((c) => `- **${c.id} ${c.name}** (${c.kind ?? "component"}) — ${c.responsibility}${c.trustBoundary ? `\n  - Trust boundary: ${c.trustBoundary}` : ""}`)
          .join("\n")
      : notSpecified,
  );

  lines.push("", "## Data flow");
  lines.push(
    state.architectureComponents.length
      ? (
          state.architectureComponents
            .filter((c) => c.dataFlow)
            .map((c) => `- ${c.name}: ${c.dataFlow}`)
            .join("\n") || notSpecified
        )
      : notSpecified,
  );

  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function databaseDoc(state: ProjectState): string {
  const lines: string[] = [...header("DATABASE", "Planned entities, fields, and access rules. Planning only — no migrations generated. See SECURITY.md for access-control.")];
  lines.push("## Entities");
  if (!state.database.length) {
    lines.push(notSpecified);
  } else {
    for (const e of state.database) {
      lines.push(`### ${e.id} ${e.name}`);
      if (e.description) lines.push(e.description, "");
      lines.push("Fields:", ...e.fields.map((f) => `- ${f.name}: ${f.type}`));
      if (e.primaryKey.length) lines.push(`Primary key: ${e.primaryKey.join(", ")}`);
      if (e.foreignKeys.length) lines.push(`Foreign keys: ${e.foreignKeys.join("; ")}`);
      if (e.relationships.length) lines.push("Relationships:", ...e.relationships.map((r) => `- ${r}`));
      if (e.ownership) lines.push(`Ownership: ${e.ownership}`);
      if (e.accessRules) lines.push(`Access rules: ${e.accessRules}`);
      lines.push("");
    }
  }
  // Flags (§25): missing ownership / access.
  const flags = state.database.filter((e) => !e.ownership || e.ownership === "UNSPECIFIED" || !e.accessRules || e.accessRules === "UNSPECIFIED");
  if (flags.length) {
    lines.push("## Warnings");
    lines.push(...flags.map((e) => `- ${e.name}: missing ownership or access rules.`));
  }
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function apiDoc(state: ProjectState): string {
  const lines: string[] = [...header("API", "Planned endpoints and their contracts. Not implemented in Phase 2. Related requirements are referenced by ID.")];
  lines.push("## Endpoints");
  if (!state.api.length) lines.push(notSpecified);
  else
    for (const e of state.api) {
      lines.push(`### ${e.id} ${e.method} ${e.path}`);
      if (e.purpose) lines.push(e.purpose, "");
      lines.push(
        [
          `Authentication: ${e.auth ?? "not set"}`,
          e.permissions.length ? `Permissions: ${e.permissions.join(", ")}` : null,
          e.request ? `Request: ${e.request}` : null,
          e.response ? `Response: ${e.response}` : null,
          e.errors ? `Errors: ${e.errors}` : null,
          e.requirementIds.length ? `Related: ${e.requirementIds.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      lines.push("");
    }
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function uiSpecDoc(state: ProjectState): string {
  const lines: string[] = [...header("UI_SPEC", "Page inventory and user flows. See IMPLEMENTATION_PLAN.md for build order.")];
  lines.push("## Pages");
  const publicPages = state.pages.filter((p) => p.access === "public");
  const authPages = state.pages.filter((p) => p.access !== "public");
  const renderPages = (group: ProjectState["pages"], label: string) => {
    if (!group.length) return;
    lines.push(`### ${label}`);
    for (const p of group) {
      lines.push(`- **${p.name}**${p.path ? ` \`${p.path}\`` : ""} — ${p.purpose ?? ""}`);
      if (p.actions.length) lines.push(`  - Actions: ${p.actions.join(", ")}`);
      if (p.requiredData.length) lines.push(`  - Data: ${p.requiredData.join(", ")}`);
      if (p.permissions.length) lines.push(`  - Permissions: ${p.permissions.join(", ")}`);
    }
  };
  renderPages(publicPages, "Public");
  renderPages(authPages, "Authenticated");
  if (!state.pages.length) lines.push(notSpecified);

  lines.push("", "## User flows");
  if (!state.userFlows.length) lines.push(notSpecified);
  else
    for (const f of state.userFlows) {
      lines.push(`### ${f.name}`);
      lines.push("Happy path: " + f.happyPath.join(" → "));
      if (f.failurePaths.length) {
        lines.push("Failure handling:");
        for (const fp of f.failurePaths) lines.push(`- ${fp.trigger} → ${fp.recovery}`);
      }
      lines.push("");
    }
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function securityDoc(state: ProjectState): string {
  const lines: string[] = [...header("SECURITY", "Practical threat review. Not claiming the project is secure — see open items. See DATABASE.md access rules.")];
  lines.push("## Model");
  lines.push(
    [
      state.security.authModel ? `- Authentication: ${state.security.authModel}` : null,
      state.security.accessControl ? `- Access control: ${state.security.accessControl}` : null,
      state.security.sensitiveData ? `- Sensitive data: ${state.security.sensitiveData}` : null,
    ]
      .filter(Boolean)
      .join("\n") || notSpecified,
  );
  lines.push("", "## Threats");
  lines.push(
    state.securityItems.length
      ? state.securityItems
          .map((i) => `- **${i.id}** ${i.threat} _(impact: ${i.impact}; status: ${i.status})_ → ${i.mitigation || "No mitigation recorded."}`)
          .join("\n")
      : notSpecified,
  );
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function testingDoc(state: ProjectState): string {
  const lines: string[] = [...header("TESTING", "Strategy and critical workflows. See REVIEW.md for coverage gaps.")];
  lines.push("## Critical workflows");
  lines.push(bulleted(state.testing.criticalWorkflows ?? state.testCases.filter((t) => t.kind === "e2e").map((t) => t.target)));
  lines.push("", "## Test cases");
  lines.push(
    state.testCases.length
      ? state.testCases.map((t) => `- [${t.kind}] \`${t.id}\` ${t.target}${t.description ? ` — ${t.description}` : ""}`).join("\n")
      : notSpecified,
  );
  lines.push("", "## Acceptance criteria");
  lines.push(
    state.acceptanceCriteria.length
      ? state.acceptanceCriteria.map((a) => `- \`${a.id}\` ${a.statement}`).join("\n")
      : bulleted(state.testing.acceptanceCriteria ?? []),
  );
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function deploymentDoc(state: ProjectState): string {
  const d = state.deployment;
  const lines: string[] = [...header("DEPLOYMENT", "Hosting, config, and release. Project-specific — not a generic template.")];
  lines.push("## Plan");
  lines.push(
    [
      d.target ? `- Target: ${d.target}` : "- Target: not specified",
      d.environmentVariables?.length ? `- Env vars: ${d.environmentVariables.join(", ")}` : "- Env vars: not specified",
      d.externalServices?.length ? `- External services: ${d.externalServices.join(", ")}` : null,
      d.notes ? `- Notes: ${d.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function implementationDoc(state: ProjectState): string {
  const lines: string[] = [...header("IMPLEMENTATION_PLAN", "Ordered phases and tasks from the dependency graph. See BUILD.md for rules.")];
  lines.push("## Phases");
  if (!state.implementationPhases.length) lines.push(notSpecified);
  else
    for (const ph of [...state.implementationPhases].sort((a, b) => a.order - b.order)) {
      lines.push(`### ${ph.order}. ${ph.name}`);
      if (ph.objective) lines.push(ph.objective, "");
      if (ph.featureRefs.length) lines.push(`Features: ${ph.featureRefs.join(", ")}`);
      if (ph.requirementRefs.length) lines.push(`Requirements: ${ph.requirementRefs.join(", ")}`);
      if (ph.acceptanceCriteria.length) lines.push("Acceptance: " + ph.acceptanceCriteria.join("; "));
      lines.push("");
    }
  lines.push("## Tasks");
  lines.push(
    state.implementationTasks.length
      ? state.implementationTasks.map((t) => `- \`${t.id}\` ${t.title}${t.featureRef ? ` (${t.featureRef})` : ""}`).join("\n")
      : notSpecified,
  );
  lines.push("", "## Dependencies");
  lines.push(
    state.dependencies.length
      ? state.dependencies.map((d) => `- ${d.sourceId} → ${d.targetId} (${d.type ?? "requires"}): ${d.reason}`).join("\n")
      : notSpecified,
  );
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function decisionsDoc(state: ProjectState): string {
  const lines: string[] = [...header("DECISIONS", "Recorded decisions (ADR-style) with history. See ASSUMPTIONS.md.")];
  lines.push("## Decisions");
  if (!state.decisions.length) {
    lines.push(notSpecified);
    return nl(lines).replace(/\n{3,}/g, "\n\n");
  }
  for (const d of state.decisions) {
    const ref = d.ref ? `${d.ref} ` : "";
    lines.push(`### ${ref}${d.topic} _(status: ${d.status})_`);
    lines.push(`- **Decision:** ${d.decision}`);
    lines.push(`- **Context/Reason:** ${d.reason}`);
    if (d.alternatives?.length) lines.push(`- **Alternatives:** ${d.alternatives.join("; ")}`);
    if (d.tradeoffs) lines.push(`- **Tradeoffs:** ${d.tradeoffs}`);
    if (d.impact?.length) lines.push(`- **Impact:** ${d.impact.join("; ")}`);
    lines.push("");
  }
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

function assumptionsDoc(state: ProjectState): string {
  const lines: string[] = [...header("ASSUMPTIONS", "Visible assumptions; pending ones must be confirmed. See DECISIONS.md.")];
  lines.push("## Assumptions");
  lines.push(
    state.assumptions.length
      ? state.assumptions.map((a) => `- \`${a.id}\` ${a.statement} _(status: ${a.status})_ — ${a.reason}`).join("\n")
      : notSpecified,
  );
  const pending = state.assumptions.filter((a) => a.status === "pending");
  if (pending.length) {
    lines.push("", "## Pending confirmation");
    lines.push(...pending.map((a) => `- \`${a.id}\` ${a.statement}`));
  }
  return nl(lines).replace(/\n{3,}/g, "\n\n");
}

/** The full set of cross-referencing export documents (§40). */
export interface ExportDocuments {
  files: Record<string, string>;
  order: string[];
}

export function renderAllDocuments(state: ProjectState): ExportDocuments {
  const files: Record<string, string> = {
    "PROJECT.md": renderProjectMarkdown(state).markdown,
    "BUILD.md": renderBuildMd(state),
    "ARCHITECTURE.md": architectureDoc(state),
    "DATABASE.md": databaseDoc(state),
    "API.md": apiDoc(state),
    "UI_SPEC.md": uiSpecDoc(state),
    "SECURITY.md": securityDoc(state),
    "TESTING.md": testingDoc(state),
    "IMPLEMENTATION_PLAN.md": implementationDoc(state),
    "DECISIONS.md": decisionsDoc(state),
    "ASSUMPTIONS.md": assumptionsDoc(state),
  };
  return { files, order: Object.keys(files) };
}
