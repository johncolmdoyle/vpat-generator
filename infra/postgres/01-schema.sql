-- VPAT Generator schema (BACKEND.md §3). Mounted into the postgres container's
-- /docker-entrypoint-initdb.d, so it runs once on first boot.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- A single demo org/user so the app works without an auth provider in compose.
CREATE TABLE organizations (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL
);

CREATE TABLE users (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  auth0_subject TEXT UNIQUE,
  plan    TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','enterprise')),
  email   TEXT NOT NULL,
  billing_email TEXT,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  subscription_status TEXT
);

CREATE TABLE reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  domain              TEXT NOT NULL,
  product_name        TEXT,
  product_version     TEXT,
  wcag_target         TEXT NOT NULL DEFAULT 'AA' CHECK (wcag_target IN ('A','AA','AAA')),
  edition             TEXT NOT NULL DEFAULT 'INT',
  scope               TEXT NOT NULL DEFAULT 'auto' CHECK (scope IN ('auto','single','sitemap')),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scanning','review','final')),
  vendor_name         TEXT,
  contact_email       TEXT,
  product_description TEXT,
  evaluation_methods  TEXT,
  assistive_tech      JSONB NOT NULL DEFAULT '[]',
  test_environments   JSONB NOT NULL DEFAULT '[]',
  evaluator_name      TEXT,
  evaluator_org       TEXT,
  evaluation_start    DATE,
  evaluation_end      DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at        TIMESTAMPTZ
);

CREATE TABLE scans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL CHECK (scope IN ('auto','single','sitemap')),
  auth_mode      TEXT NOT NULL CHECK (auth_mode IN ('public','auth')),
  state          TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','drafting','done','failed')),
  pages_count    INTEGER NOT NULL DEFAULT 0,
  issues_count   INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ
);

CREATE TABLE pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  title       TEXT,
  is_auth     BOOLEAN NOT NULL DEFAULT false,
  status_code INTEGER
);

-- One row per success criterion / FPC / FPS, per report.
CREATE TABLE findings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  report_kind   TEXT NOT NULL CHECK (report_kind IN ('wcag','508','en')),
  section       TEXT NOT NULL,
  criterion_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  level         TEXT,
  wcag_version  TEXT,
  principle     TEXT NOT NULL,
  auto          INTEGER NOT NULL DEFAULT 0,
  obsolete      BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL,
  remarks       TEXT NOT NULL DEFAULT '',
  ai_status     TEXT NOT NULL,
  ai_remarks    TEXT NOT NULL DEFAULT '',
  ai_confidence REAL NOT NULL DEFAULT 0,
  approved      BOOLEAN NOT NULL DEFAULT false,
  edited        BOOLEAN NOT NULL DEFAULT false,
  ordinal       INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX findings_report_idx ON findings(report_id, ordinal);

CREATE TABLE evidence (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id     UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  scan_id        UUID REFERENCES scans(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN ('issue','pass')),
  text           TEXT NOT NULL,
  page_url       TEXT,
  selector       TEXT,
  screenshot_key TEXT,
  dom_excerpt    TEXT,
  axe_rule_id    TEXT,
  ordinal        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX evidence_finding_idx ON evidence(finding_id, ordinal);

-- Ordered progress events for a scan; the API SSE endpoint replays + tails these.
CREATE TABLE scan_events (
  scan_id    UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  event      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scan_id, seq)
);

CREATE TABLE exports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  format     TEXT NOT NULL CHECK (format IN ('pdf','docx','vpat')),
  s3_key     TEXT NOT NULL,
  filename   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the demo tenant.
INSERT INTO organizations (id, name)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Org');
INSERT INTO users (id, org_id, email)
  VALUES ('00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000001',
          'demo@vpat.local');
