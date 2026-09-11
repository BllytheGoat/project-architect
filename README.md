# Project Architect

Turn a rough app idea into a **structured, deterministic project specification** through a guided interview.

You describe what you want; the app asks a focused sequence of questions, records your decisions, tracks readiness, and — when you're done — exports a clean `PROJECT.md` that a developer (or another agent) can implement without guessing.

> No LLM writes the document. The Markdown is rendered **deterministically** from your recorded answers only — so the output is stable, reviewable, and never invents content that wasn't in your state.

---

## How it works

```
   rough idea
        │
        ▼
  create project  ──►  idea analysis (structured)
        │
        ▼
  guided interview ── one question at a time
        │                "I'm not sure" → concrete recommendation
        ▼
  living project state  ── features, requirements, decisions,
  (versioned JSONB)         assumptions, architecture, security…
        │
        ▼
  readiness score  ── deterministic weights; shows *why* it's not ready
        │
        ▼
  export PROJECT.md  ── deterministic; copy or download
```

**Provider-agnostic AI layer.** The app talks to an `AIProvider` interface, not a specific model. Two implementations ship:

- `OpenAICompatibleProvider` — any OpenAI-compatible endpoint (defaults to Agnes at `apihub.agnes-ai.com`).
- `MockProvider` — fully deterministic, no network. Used by tests and as an automatic fallback when no API key is configured or the provider errors.

Every LLM output is validated with Zod before it can touch state, so a malformed or hallucinated response can never corrupt a project.

---

## Phase 2 — planning workspace

Phase 2 turns the interviewed idea into a full, cross-referenced plan and adds the tooling to keep it consistent. Everything new is **deterministic and tested**; the LLM only proposes or enriches, it never overrides your confirmed decisions or invents content that isn't in your state.

The **planning workspace** (`/projects/[id]/planning`) generates and displays structured sections, each a stable set of entities:

- **Requirements, user stories + acceptance criteria** — expanded from your features.
- **Dependencies** — an explicit graph, topologically ordered so build order is sound.
- **Architecture components, database entities, API endpoints, UI pages + user flows** — inferred from your goals/facts, flagged where ownership or access rules are missing.
- **Security items, test cases, implementation phases + tasks** — with phases that map to real features.

Supporting systems (all pure, no LLM):

- **Conflict detection** — cross-entity contradictions, severity-tagged; a *critical open* conflict blocks Build-Ready.
- **Readiness 2.0** — per-category percentages, a critical/important/optional tier breakdown, and hard **Build-Ready** rules.
- **Change-impact analysis** — before a large change is applied, shows which planning areas it touches and whether your confirmation is required.
- **Plan-quality review** — a deterministic 0–100 score with strengths/warnings.
- **Multi-document export** — 11 cross-referencing docs (`PROJECT.md`, `BUILD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `UI_SPEC.md`, `SECURITY.md`, `TESTING.md`, `IMPLEMENTATION_PLAN.md`, `DECISIONS.md`, `ASSUMPTIONS.md`), plus a **deterministic ZIP** download and an **integrity validator** that refuses to export a plan with a broken reference or an open critical conflict.
- **Plan versioning + audit trail** — relational `plan_versions` / `audit_events` tables record *why* a version was cut and what changed.

> **No-invented-content guarantee:** every document is rendered from state. Empty sections read "Not yet specified." — the exporter never fabricates requirements, tables, or flows to fill space.

---

## Stack

- **Next.js 16** (App Router) + **TypeScript** (strict, no `any` in domain types)
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives)
- **PostgreSQL 17** via `pg` (credentials auth — Supabase-swappable)
- **Zod** at every trust boundary (API input, AI output, DB payloads)
- **Vitest** for unit + integration + e2e tests

Design: blueprint-blue accent on a cool drafting-paper ground, Space Grotesk + Inter + Geist Mono, numbered markers only where content is genuinely a sequence, reduced-motion respected.

---

## Getting started (local)

### Prerequisites

- Node 20+
- PostgreSQL (any recent version; tested on 17)

### 1. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://architect:architect@127.0.0.1:5432/project_architect` |
| `AI_PROVIDER` | `mock` (default, offline) or `auto` (live model) | `mock` |
| `AI_BASE_URL` | OpenAI-compatible endpoint | `https://apihub.agnes-ai.com/v1` |
| `AI_API_KEY` | API key (empty → auto-degrades to mock) | — |
| `AI_MODEL` | Model name | `agnes-3.0-flash` |
| `SESSION_SECRET` | Reserved for future token signing | dev placeholder |

### 2. Create the database + apply the schema

```bash
# create the role + database (once)
sudo -u postgres psql -c "CREATE ROLE architect LOGIN PASSWORD 'architect';"
sudo -u postgres psql -c "CREATE DATABASE project_architect OWNER architect;"

# apply the idempotent schema
npm run db:migrate
```

### 3. Run

```bash
# install with dev deps (this box sets NODE_ENV=production globally,
# which makes plain `npm install` skip devDependencies — see note below)
env NODE_ENV=development npm install --include-dev

npm run dev
```

Open http://localhost:3000.

> **Dev-deps gotcha:** `npm install` respects `NODE_ENV`. With `NODE_ENV=production` in the environment, devDependencies are skipped and `tsc`/`vitest`/`tsx` will be missing. Use the `env NODE_ENV=development npm install --include-dev` command above for any development work.

### 4. Use a live model (optional)

Set `AI_PROVIDER=auto` and a real `AI_API_KEY` in `.env`, then restart. If the provider is unreachable, each call degrades gracefully to the deterministic mock — the app never blocks on the model.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (what Vercel runs) |
| `npm start` | Run the production build |
| `npm test` | Run the full test suite (unit + integration + e2e) |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply `src/lib/db/schema.sql` to `DATABASE_URL` (idempotent) |
| `node scripts/smoke.mjs` | Hit the running server over HTTP (needs `SMOKE_BASE_URL`) |

The DB-backed tests **skip cleanly** if `DATABASE_URL` is unset, so `npm test` stays green in a bare CI with no database.

---

## Project layout

```
src/
  app/                    Next.js App Router
    api/                  Route handlers (auth, projects, interview, planning,
                          plan, changes, audit, export + export/versions)
    (auth, dashboard, new, projects/[id], planning, review, export… )
  lib/
    ai/                   AIProvider interface + OpenAI-compatible + mock + factory
    auth/                 scrypt password hashing, opaque session tokens
    db/                   pg pool + schema.sql + migration runner (Supabase-aware)
    planner/              gap-analysis, state-update, stable IDs, deterministic
                          planners (all sections), conflicts, quality, impact
    readiness/            Phase 1 deterministic scorer + Readiness 2.0 (Build-Ready)
    export/               PROJECT.md + BUILD.md + multi-doc, ZIP, integrity check
    services/             ownership-gated project service + interview orchestration
    validation/           Zod schemas (all trust boundaries)
    client/               typed client API helper
  components/             UI (auth, dashboard, interview, planning, review, export)
  types/                  re-exported Zod-inferred types + seedState
scripts/                 db-migrate.ts, smoke.mjs
src/tests/
  unit/                   pure logic: readiness, readiness2, state-update, markdown,
                          gap-analysis, planner, conflicts, quality, impact, export
  integration/            DB-backed e2e (mock AI)
  fixtures/               validated ProjectState fixtures
```

---

## Auth & security

- **Credentials auth** with `scrypt` password hashing (unique 16-byte salt per user).
- **Opaque session tokens** (32 random bytes) in an `httpOnly` cookie. Only the SHA-256 hash is stored at rest; the raw token is never persisted.
- `secure` cookie in production, `SameSite=Lax`, 30-day TTL.
- **Ownership is enforced server-side on every project route** — a client-supplied project id is never trusted; each request re-verifies the caller owns the project (`401`/`403`/`404` mapped correctly).
- **Zod validation at every boundary**: API request bodies, AI structured output, and DB payloads are all parsed before use. A malformed response throws and is logged — it never reaches the database.
- **Answers are persisted before any AI call**, so a provider failure never loses user input.

### Swapping to Supabase

The auth and storage layers are isolated behind services (`auth/service.ts`, `project-service.ts`). Replacing PostgreSQL credentials with Supabase Auth + Postgres only touches those files; the domain layer, AI layer, and UI are unchanged.

---

## Testing

```bash
# everything
env NODE_ENV=development AI_PROVIDER=mock \
  DATABASE_URL="postgres://architect:architect@127.0.0.1:5432/project_architect" \
  npm test
```

- **Unit** (no DB): readiness determinism + weights, Readiness 2.0 Build-Ready rules, state-update idempotency & stable FR/NFR/A-IDs, markdown honesty ("Not specified."), gap-analysis priority ranking, deterministic planners (expand + idempotent + topological ordering), advanced conflict detection, plan-quality scoring, change-impact classification, and the multi-doc/ZIP exporter (no-invented-content + CRC-correct archive validated against Python's `zipfile`).
- **Integration / e2e** (live Postgres + mock AI): the full acceptance path — create project → interview loop → readiness climbs → export a coherent, byte-deterministic `PROJECT.md` → cleanup.

Fixtures in `src/tests/fixtures/` are parsed through the Zod schema, so a malformed fixture fails loudly at load.

---

## Deploying to Vercel

1. Push the repo to GitHub (see below).
2. In Vercel, "Add New → Project" and import the repo.
3. Framework preset: **Next.js** (auto-detected).
4. Add environment variables:
   - A managed Postgres. With **Supabase**, set the injected `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL` / `POSTGRES_HOST` etc. The resolver in `src/lib/db/env.ts` is Vercel-aware: on Vercel it prefers `POSTGRES_*` over any leaked `DATABASE_URL`; locally it prefers `DATABASE_URL`.
   - `AI_API_KEY` — optional; leave blank to run on the deterministic mock.
   - `AI_PROVIDER=auto`, `AI_BASE_URL`, `AI_MODEL` as desired.
   - `ADMIN_TOKEN` — a long random secret that gates the one-off schema bootstrap endpoint (see below).
5. **Apply the schema to that database once.** The dev box has no IPv6 egress to Supabase, so you can't run `npm run db:migrate` against it from here. Instead, after the first deploy, hit the token-gated bootstrap route, which runs the same single-source `SCHEMA_SQL`:

   ```bash
   curl -X POST \
     -H "x-admin-token: $ADMIN_TOKEN" \
     https://<your-app>.vercel.app/api/admin/apply-schema
   ```

   The response lists every table created. This is idempotent and safe to re-run.

Vercel runs `npm run build` — verified passing. `pg` is externalized in `next.config.ts`.

> **Note:** The local dev database is not reachable from Vercel. Point `DATABASE_URL` (or the Supabase `POSTGRES_*` vars) at a hosted Postgres and bootstrap the schema there before serving traffic.

---

## Pushing to GitHub

```bash
git init        # if not already a repo
git add -A
git commit -m "Project Architect — Phase 1"
git remote add origin git@github.com:<you>/project-architect.git
git push -u origin main
```

`.env*` is gitignored; only `.env.example` is committed, so no secrets leave the machine.

```
