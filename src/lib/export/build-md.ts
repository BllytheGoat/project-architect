// BUILD.md generator (§41). Deterministic, agent-oriented operating
// instructions derived from confirmed state. No LLM writes this document.
// Prepares the plan for a future coding-agent integration (Phase 3) without
// depending on one.

import type { ProjectState } from "@/types";

const operatingRules = [
  "Read all project documentation before implementation.",
  "Do not invent major requirements not listed here.",
  "Do not silently change confirmed decisions.",
  "Follow the implementation phases in order.",
  "Respect dependencies; never skip a prerequisite feature.",
  "Run tests after meaningful changes.",
  "If a critical contradiction is discovered, stop and request clarification.",
  "Do not expose secrets; keep credentials server-side.",
  "Do not weaken any security requirement.",
];

export function renderBuildMd(state: ProjectState): string {
  const p = state.project;
  const out: string[] = [];
  out.push("# BUILD.md — Implementation Instructions");
  out.push("");
  out.push(
    `> Auto-generated from plan v${state.version}. Deterministic; no AI wrote this file.`,
  );

  out.push("");
  out.push("## Project context");
  out.push(
    [
      p.name ? `- **Name:** ${p.name}` : null,
      p.description ? `- **Description:** ${p.description}` : null,
      p.problem ? `- **Problem:** ${p.problem}` : null,
      state.complexity ? `- **Complexity:** ${state.complexity.replace(/_/g, " ")}` : null,
    ]
      .filter(Boolean)
      .join("\n") || "Not specified.",
  );

  out.push("");
  out.push("## Non-negotiable requirements");
  const criticalReqs = state.requirements.filter((r) => r.priority === "critical" && r.status === "confirmed");
  out.push(
    criticalReqs.length
      ? criticalReqs.map((r) => `- \`${r.id}\` ${r.title}`).join("\n")
      : "None confirmed yet — confirm critical requirements before building.",
  );

  out.push("");
  out.push("## Confirmed product behavior");
  const confirmed = state.features.filter((f) => f.status === "confirmed");
  out.push(confirmed.length ? confirmed.map((f) => `- ${f.name} — ${f.description || f.name}`).join("\n") : "No confirmed features.");

  out.push("");
  out.push("## Technology stack");
  const tech = state.technology;
  out.push(
    [
      tech.languages?.length ? `- Languages: ${tech.languages.join(", ")}` : null,
      tech.frameworks?.length ? `- Frameworks: ${tech.frameworks.join(", ")}` : null,
      state.architecture.database ? `- Database: ${state.architecture.database}` : null,
    ]
      .filter(Boolean)
      .join("\n") || "Not specified.",
  );

  out.push("");
  out.push("## Architecture");
  out.push(
    state.architectureComponents.length
      ? state.architectureComponents
          .map((c) => `- **${c.name}** (${c.kind ?? "component"}) — ${c.responsibility}`)
          .join("\n")
      : state.architecture.notes
        ? state.architecture.notes
        : "See ARCHITECTURE.md.",
  );

  out.push("");
  out.push("## Database");
  out.push(
    state.database.length
      ? state.database.map((d) => `- **${d.name}** — ${d.fields.map((f) => f.name).join(", ")}`).join("\n")
      : "See DATABASE.md.",
  );

  out.push("");
  out.push("## API");
  out.push(
    state.api.length
      ? state.api.map((e) => `- \`${e.method} ${e.path}\` — ${e.purpose ?? ""}${e.auth ? ` (${e.auth} auth)` : ""}`).join("\n")
      : "See API.md.",
  );

  out.push("");
  out.push("## UI / pages");
  out.push(
    state.pages.length ? state.pages.map((pg) => `- ${pg.name} (${pg.access ?? "any"}) — ${pg.purpose ?? ""}`).join("\n") : "See UI_SPEC.md.",
  );

  out.push("");
  out.push("## Security");
  out.push(
    state.securityItems.length
      ? state.securityItems
          .filter((i) => i.status === "required" || i.status === "addressed")
          .map((i) => `- ${i.threat} → ${i.mitigation}`)
          .join("\n")
      : "See SECURITY.md.",
  );

  out.push("");
  out.push("## Testing");
  out.push(
    state.testCases.length
      ? state.testCases.map((t) => `- [${t.kind}] ${t.target}`).join("\n")
      : "See TESTING.md.",
  );

  out.push("");
  out.push("## Implementation phases");
  out.push(
    state.implementationPhases.length
      ? state.implementationPhases
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((ph) => `### Phase ${ph.order}: ${ph.name}\n${ph.objective ?? ""}\n${ph.featureRefs.length ? `Features: ${ph.featureRefs.join(", ")}` : ""}`)
          .join("\n\n")
      : "See IMPLEMENTATION_PLAN.md.",
  );

  out.push("");
  out.push("## Acceptance criteria");
  const ac = state.acceptanceCriteria;
  out.push(ac.length ? ac.map((a) => `- \`${a.id}\` ${a.statement}${a.then ? ` (Given ${a.given ?? "?"}, When ${a.when ?? "?"}, Then ${a.then})` : ""}`).join("\n") : "None recorded.");

  out.push("");
  out.push("## Known assumptions");
  out.push(state.assumptions.length ? state.assumptions.map((a) => `- \`${a.id}\` ${a.statement} _(status: ${a.status})_`).join("\n") : "None recorded.");

  out.push("");
  out.push("## Deferred decisions");
  const deferred = state.conflicts.filter((c) => c.status === "resolved" || c.status === "open");
  out.push(deferred.length ? deferred.map((c) => `- ${c.earlierTopic} vs ${c.laterTopic} (${c.status})`).join("\n") : "None recorded.");

  out.push("");
  out.push("## Known risks");
  const risks = [
    ...state.conflicts.filter((c) => c.status === "open").map((c) => `Open conflict: ${c.earlierTopic} ↔ ${c.laterTopic}`),
  ];
  out.push(risks.length ? risks.join("\n") : "No open conflicts recorded.");

  out.push("");
  out.push("## Agent operating rules");
  out.push(operatingRules.map((r) => `- ${r}`).join("\n"));

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
