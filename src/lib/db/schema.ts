// Single source of truth for the Phase 1 schema, shared by:
//   - the local migration runner (scripts/db-migrate.ts)
//   - the token-gated bootstrap endpoint (api/admin/apply-schema), which runs
//     on Vercel where Supabase's Postgres is reachable.
// Keeping the SQL in one module means the two can never diverge.
//
// Idempotent: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF
// EXISTS — safe to re-run any number of times.

export const SCHEMA_SQL = `
-- Phase 1 schema. Idempotent: safe to re-run.
-- Auth: credentials (users + sessions). Supabase can replace this later
-- without changing the domain layer, since ownership is enforced server-side.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,               -- random opaque token
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,                  -- we never store the raw token
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'Untitled project',
  description      TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | completed
  readiness_score  INTEGER NOT NULL DEFAULT 0,            -- 0..100, denormalized
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);

CREATE TABLE IF NOT EXISTS project_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,               -- user | assistant
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_messages_project_idx ON project_messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS project_questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  type         TEXT NOT NULL,             -- single_choice|multi_choice|free_text|yes_no|number
  question     TEXT NOT NULL,
  options      JSONB,
  priority     TEXT NOT NULL DEFAULT 'medium',
  category     TEXT NOT NULL DEFAULT 'product',
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|answered|skipped
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_questions_project_idx ON project_questions(project_id);

CREATE TABLE IF NOT EXISTS project_answers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES project_questions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  answer     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_answers_project_idx ON project_answers(project_id);

-- Canonical evolving project state. JSONB for the Phase 1 implementation.
CREATE TABLE IF NOT EXISTS project_state (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  state_json JSONB NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL DEFAULT 1,
  markdown   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_plans_project_idx ON project_plans(project_id, version);

-- Phase 2: structured plan-version metadata. Unlike project_plans (which stores
-- the rendered markdown), this records *why* a version was cut and the source
-- state version it was derived from (spec §39). A full visual diff is optional;
-- the metadata is deterministic and queryable.
CREATE TABLE IF NOT EXISTS plan_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  reason        TEXT NOT NULL DEFAULT '',
  state_version INTEGER NOT NULL DEFAULT 1,
  doc_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS plan_versions_project_idx ON plan_versions(project_id, version DESC);

-- Phase 2: lightweight audit trail of important state changes (spec §50).
-- Append-only; one row per notable mutation, ordered by time.
CREATE TABLE IF NOT EXISTS audit_events (
  id         BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor      TEXT NOT NULL DEFAULT 'system',      -- user | ai | system
  action     TEXT NOT NULL,                       -- e.g. 'change_auth_model'
  summary    TEXT NOT NULL DEFAULT '',
  entities   JSONB NOT NULL DEFAULT '[]',         -- affected stable IDs (FEAT-001, ...)
  version    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_project_idx ON audit_events(project_id, created_at DESC);

-- keep projects.updated_at current on any change
CREATE OR REPLACE FUNCTION set_projects_updated_at() RETURNS trigger AS \$\$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_projects_updated_at();
`;
