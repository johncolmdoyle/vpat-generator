import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

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
  `);
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
