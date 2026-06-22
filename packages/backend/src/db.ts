import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const parsedDatabaseUrl = new URL(env.databaseUrl);
const sslMode = parsedDatabaseUrl.searchParams.get('sslmode');
const sslFlag = parsedDatabaseUrl.searchParams.get('ssl');
const needsSsl = sslMode === 'require' || sslFlag === 'true';

if (needsSsl) {
  parsedDatabaseUrl.searchParams.delete('sslmode');
  parsedDatabaseUrl.searchParams.delete('ssl');
}

export const pool = new Pool({
  connectionString: parsedDatabaseUrl.toString(),
  max: 10,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

/** Tagged query helper returning typed rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Idempotent column additions for the report metadata + attestation fields. The base
 * schema runs only on a fresh volume (docker-entrypoint-initdb.d), so this brings
 * already-provisioned databases up to date. Safe to run on every API boot.
 */
export async function migrate(): Promise<void> {
  await pool.query(`
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS vendor_name       TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS assistive_tech    JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS test_environments JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS evaluator_name    TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS evaluator_org     TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS evaluation_start  DATE;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS evaluation_end    DATE;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS auth0_subject     TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS plan              TEXT NOT NULL DEFAULT 'starter';
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS billing_email         TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS stripe_price_id        TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS subscription_status    TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ NOT NULL DEFAULT now();
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('billing','report','technical','general')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
      subject TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE support_requests DROP COLUMN IF EXISTS message`);
  await pool.query(`ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_request_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      support_request_id UUID NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
      author_role TEXT NOT NULL CHECK (author_role IN ('customer','support')),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      subject TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_auth0_subject_idx ON users(auth0_subject)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_idx ON users(stripe_customer_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_subscription_idx ON users(stripe_subscription_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS support_requests_user_created_idx ON support_requests(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS support_request_messages_request_created_idx ON support_request_messages(support_request_id, created_at ASC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_events_org_created_idx ON audit_events(org_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_events_target_created_idx ON audit_events(target_type, target_id, created_at DESC)`);
}

/** Block until Postgres accepts connections (compose ordering safety net). */
export async function waitForDb(attempts = 30, delayMs = 1000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
