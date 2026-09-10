// Deterministic PROJECT.md generation. Pure: ProjectState -> Markdown.
// No LLM is used to write the document structure or fill sections; only
// content that actually exists in state is rendered. Missing sections say
// "Not specified." rather than inventing content.

import type { ProjectState } from "@/types";

const notSpecified = "Not specified.";

function list(items: string[] | undefined, fallback = notSpecified): string {
  if (!items || items.length === 0) return fallback;
  return items.map((i) => `- ${i}`).join("\n");
}

function block(text: string | undefined, fallback = notSpecified): string {
  return text && text.trim().length > 0 ? text.trim() : fallback;
}

function section(title: string, body: string, included: string[]): string {
  included.push(title);
  return `## ${title}\n\n${body.trim()}\n`;
}

export interface ExportResult {
  markdown: string;
  sectionsIncluded: string[];
}

export function renderProjectMarkdown(state: ProjectState): ExportResult {
  const p = state.project;
  const out: string[] = [];
  const included: string[] = [];

  out.push(`# Project Specification`);
  out.push(`\n${block(p.name ? p.name : p.description.slice(0, 80) || "Untitled project")}`);

  out.push(section("1. Project Overview", block(p.description), included));
  out.push(section("2. Problem Statement", block(p.problem), included));
  out.push(section("3. Goals", list(p.goals), included));
  out.push(section("4. Target Users", list(p.targetUsers), included));
  out.push(section("5. User Stories", list(p.userStories), included));

  if (state.features.length) {
    const lines = state.features.map((f) => {
      const status = f.status === "confirmed" ? "" : " _(proposed)_ ";
      return `- **${f.name}** \`${f.priority}\`${status} — ${f.description || "No description."} _(source: ${f.source})_`;
    });
    out.push(section("6. Features", lines.join("\n"), included));
  } else {
    out.push(section("6. Features", notSpecified, included));
  }

  const fr = state.requirements.filter((r) => r.type === "functional");
  const nfr = state.requirements.filter((r) => r.type === "non_functional");
  const reqBlock = (items: ProjectState["requirements"]) =>
    items.length
      ? items.map((r) => `- \`${r.id}\` **${r.title}** (${r.priority}${r.status === "proposed" ? ", proposed" : ""}) — ${r.description}`).join("\n")
      : notSpecified;
  out.push(section("7. Functional Requirements", reqBlock(fr), included));
  out.push(section("8. Non-Functional Requirements", reqBlock(nfr), included));

  const roles =
    state.security.accessControl ||
    state.decisions
      .filter((d) => /role|permission|access|account/i.test(d.topic + d.decision))
      .map((d) => d.decision)
      .join("; ");
  out.push(section("9. User Roles and Permissions", block(roles), included));

  out.push(
    section(
      "10. User Flows",
      p.userStories.length ? p.userStories.map((s) => `- ${s}`).join("\n") : notSpecified,
      included,
    ),
  );

  const uxFacts = Object.entries(p.facts)
    .filter(([k, v]) => /page|nav|workflow|design|responsive|layout|ux|ui/i.test(k + " " + v))
    .map(([k, v]) => `- ${k}: ${v}`);
  out.push(section("11. UI/UX Requirements", uxFacts.length ? uxFacts.join("\n") : notSpecified, included));

  const dataFacts = Object.entries(p.facts)
    .filter(([k, v]) => /data|database|storage|file|record|relation|entity|schema/i.test(k + " " + v))
    .map(([k, v]) => `- ${k}: ${v}`);
  const arch = state.architecture;
  const dataModel = [
    arch.database ? `- Database: ${arch.database}` : null,
    arch.fileStorage ? `- File storage: ${arch.fileStorage}` : null,
    ...dataFacts,
  ]
    .filter(Boolean)
    .join("\n");
  out.push(section("12. Data Model", dataModel || notSpecified, included));

  const apiFacts = Object.entries(p.facts)
    .filter(([k, v]) => /api|endpoint|rest|graphql|webhook|integration/i.test(k + " " + v))
    .map(([k, v]) => `- ${k}: ${v}`);
  out.push(section("13. API Requirements", apiFacts.length ? apiFacts.join("\n") : notSpecified, included));

  const archLines = [
    arch.frontend ? `- Frontend: ${arch.frontend}` : null,
    arch.backend ? `- Backend: ${arch.backend}` : null,
    arch.database ? `- Database: ${arch.database}` : null,
    arch.auth ? `- Authentication: ${arch.auth}` : null,
    arch.notes ? `- Notes: ${arch.notes}` : null,
  ].filter(Boolean);
  out.push(section("14. Architecture", archLines.length ? archLines.join("\n") : notSpecified, included));

  const tech = state.technology;
  const techLines = [
    tech.languages?.length ? `- Languages: ${tech.languages.join(", ")}` : null,
    tech.frameworks?.length ? `- Frameworks: ${tech.frameworks.join(", ")}` : null,
    tech.integrations?.length ? `- Integrations: ${tech.integrations.join(", ")}` : null,
  ].filter(Boolean);
  out.push(
    section("15. Technology Decisions", techLines.length ? techLines.join("\n") : notSpecified, included),
  );

  out.push(
    section("16. Authentication", block(arch.auth || state.security.authModel), included),
  );

  const sec = state.security;
  const secLines = [
    sec.accessControl ? `- Access control: ${sec.accessControl}` : null,
    sec.sensitiveData ? `- Sensitive data: ${sec.sensitiveData}` : null,
    sec.abuseConsiderations ? `- Abuse considerations: ${sec.abuseConsiderations}` : null,
  ].filter(Boolean);
  out.push(section("17. Security", secLines.length ? secLines.join("\n") : notSpecified, included));

  out.push(
    section(
      "18. Error Handling",
      "Handle provider, database, and network failures with human-readable errors; never lose a user's submitted answer. Save state before every AI call so a failed call can be retried safely.",
      included,
    ),
  );

  const t = state.testing;
  out.push(
    section(
      "19. Testing Requirements",
      [
        t.criticalWorkflows?.length ? `Critical workflows:\n${list(t.criticalWorkflows)}` : null,
        t.acceptanceCriteria?.length ? `Acceptance criteria:\n${list(t.acceptanceCriteria)}` : null,
      ]
        .filter(Boolean)
        .join("\n\n") || notSpecified,
      included,
    ),
  );

  const d = state.deployment;
  out.push(
    section(
      "20. Deployment",
      [
        d.target ? `- Target: ${d.target}` : null,
        d.externalServices?.length ? `- External services: ${d.externalServices.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n") || notSpecified,
      included,
    ),
  );

  out.push(
    section("21. Environment Variables", d.environmentVariables?.length ? list(d.environmentVariables) : "Not specified.", included),
  );

  out.push(
    section(
      "22. Assumptions",
      state.assumptions.length
        ? state.assumptions.map((a) => `- \`${a.id}\` ${a.statement}${a.status === "pending" ? " _(pending confirmation)_ " : ""} — ${a.reason}`).join("\n")
        : "None recorded.",
      included,
    ),
  );

  out.push(
    section(
      "23. Decisions",
      state.decisions.length
        ? state.decisions
            .map((dec) => `- **${dec.topic}** — ${dec.decision} _(reason: ${dec.reason}; source: ${dec.source}${dec.status === "changed" ? "; changed_ " : ")"})_`)
            .join("\n")
        : "None recorded.",
      included,
    ),
  );

  const mustHave = state.features.filter((f) => f.priority === "must_have" && f.status === "confirmed");
  const shouldHave = state.features.filter((f) => f.priority === "should_have");
  const niceHave = state.features.filter((f) => f.priority === "nice_to_have");
  const phases = [
    mustHave.length ? `Phase 1 (MVP): ${mustHave.map((f) => f.name).join(", ")}` : null,
    shouldHave.length ? `Phase 2: ${shouldHave.map((f) => f.name).join(", ")}` : null,
    niceHave.length ? `Phase 3: ${niceHave.map((f) => f.name).join(", ")}` : null,
  ].filter(Boolean);
  out.push(
    section("24. Implementation Phases", phases.length ? phases.join("\n") : "No prioritized features recorded yet.", included),
  );

  const acc =
    state.testing.acceptanceCriteria?.length
      ? state.testing.acceptanceCriteria
      : mustHave.length
        ? mustHave.map((f) => `${f.name} works end-to-end for a core user.`)
        : [];
  out.push(
    section("25. Acceptance Criteria", list(acc, "Define acceptance criteria before starting implementation."), included),
  );

  out.push(
    section(
      "Implementation Guidance",
      [
        "Implement the requirements and decisions in this document in the order given.",
        "Do not invent major product behavior that conflicts with the requirements above.",
        "Where a requirement is ambiguous, prefer the explicit decisions in section 23.",
        "If a critical contradiction is discovered during implementation, stop and request clarification.",
      ].join("\n"),
      included,
    ),
  );

  const markdown = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return { markdown, sectionsIncluded: included };
}
