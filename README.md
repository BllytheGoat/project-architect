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
    api/                  Route handlers (auth, projects, interview, plan)
    (auth, dashboard, new, projects/[id]…)
  lib/
    ai/                   AIProvider interface + OpenAI-compatible + mock + factory
    auth/                 scrypt password hashing, opaque session tokens
    db/                   pg pool + schema.sql + migration runner
    planner/              gap-analysis (deterministic questions) + state-update
    readiness/            deterministic readiness scoring
    export/               deterministic PROJECT.md generator
    services/             ownership-gated project service + interview orchestration
    validation/           Zod schemas (all trust boundaries)
    client/               typed client API helper
  components/             UI (auth, dashboard, interview, review, export)
  types/                  re-exported Zod-inferred types + seedState
scripts/                 db-migrate.ts, smoke.mjs
src/tests/
  unit/                   pure logic (readiness, state-update, markdown, gap-analysis)
  integration/            DB-backed e2e (mock AI)
  fixtures/               4 validated ProjectState fixtures
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

- **Unit** (no DB): readiness determinism + weights, state-update idempotency & stable FR/NFR/A-IDs, markdown honesty ("Not specified."), gap-analysis priority ranking.
- **Integration / e2e** (live Postgres + mock AI): the full acceptance path — create project → interview loop → readiness climbs → export a coherent, byte-deterministic `PROJECT.md` → cleanup.

Fixtures in `src/tests/fixtures/` are parsed through the Zod schema, so a malformed fixture fails loudly at load.

---

## Deploying to Vercel

1. Push the repo to GitHub (see below).
2. In Vercel, "Add New → Project" and import the repo.
3. Framework preset: **Next.js** (auto-detected).
4. Add environment variables:
   - `DATABASE_URL` — a managed Postgres (Neon, Supabase, Vercel Postgres, RDS).
   - `AI_API_KEY` — optional; leave blank to run on the deterministic mock.
   - `AI_PROVIDER=auto`, `AI_BASE_URL`, `AI_MODEL` as desired.
5. Before the first deploy, run the schema against that database:
   `npm run db:migrate` with the new `DATABASE_URL` set (one-off).

Vercel runs `npm run build` (Turbopack) — verified passing. `pg` is externalized in `next.config.ts`.

> **Note:** The local dev database is not reachable from Vercel. For a public deployment you must point `DATABASE_URL` at a hosted Postgres and apply the schema there.

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
