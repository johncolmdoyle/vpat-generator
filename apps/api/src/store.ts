/** Postgres data access for the API. */
import {
  toAccountSummary,
  env,
  query,
  queryOne,
  rowToReport,
  rowToScan,
  rowToFinding,
  evidenceRowTo,
  type ReportRow,
  type ScanRow,
  type FindingRow,
  type EvidenceRow,
  type UserRow,
} from '@vpat/backend';
import {
  type AccountSummary,
  AUTO,
  type AuthMode,
  type CrawlScope,
  type ConformanceLevel,
  type Evidence,
  type Finding,
  type ReportDetail,
  type ReportStatus,
  type SequencedScanEvent,
  type ScanEvent,
  type SubscriptionPlan,
  type WcagTarget,
} from '@vpat/shared';

function derivePlan(email: string | null, planHint: SubscriptionPlan | null): SubscriptionPlan {
  if (planHint) return planHint;
  const lower = email?.trim().toLowerCase() ?? '';
  if (lower && env.auth0.enterpriseEmails.includes(lower)) return 'enterprise';
  if (lower && env.auth0.growthEmails.includes(lower)) return 'growth';
  return 'starter';
}

export async function findOrCreateUser(
  auth0Sub: string,
  email: string | null,
  planHint: SubscriptionPlan | null,
): Promise<string> {
  const fallbackEmail = `${auth0Sub.replace(/[^a-zA-Z0-9._-]/g, '_')}@auth0.local`;
  const incomingEmail = email?.trim().toLowerCase() ?? fallbackEmail;
  const plan = derivePlan(email, planHint);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (org_id, auth0_subject, email, plan)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (auth0_subject)
     DO UPDATE SET
       email = CASE
         WHEN EXCLUDED.email LIKE '%@auth0.local' AND users.email NOT LIKE '%@auth0.local' THEN users.email
         ELSE EXCLUDED.email
       END,
       billing_email = CASE
         WHEN users.billing_email IS NOT NULL THEN users.billing_email
         WHEN EXCLUDED.email LIKE '%@auth0.local' AND users.email NOT LIKE '%@auth0.local' THEN users.email
         ELSE EXCLUDED.email
       END,
       plan = CASE
         WHEN users.stripe_subscription_id IS NULL THEN EXCLUDED.plan
         ELSE users.plan
       END
     RETURNING id`,
    [env.demoOrgId, auth0Sub, incomingEmail, plan],
  );
  return row!.id;
}

export function getUserRow(userId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT id, email, plan, billing_email, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status
     FROM users WHERE id = $1`,
    [userId],
  );
}

export function getUserByStripeCustomerId(customerId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT id, email, plan, billing_email, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status
     FROM users WHERE stripe_customer_id = $1`,
    [customerId],
  );
}

export async function getAccountSummary(userId: string): Promise<AccountSummary | null> {
  const user = await getUserRow(userId);
  if (!user) return null;
  return toAccountSummary(user, await countActiveReports(userId));
}

export async function countActiveReports(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM reports WHERE created_by = $1 AND status <> 'final'`,
    [userId],
  );
  return Number(row?.count ?? '0');
}

export async function createReport(
  userId: string,
  domain: string,
  wcagTarget: WcagTarget,
  scope: CrawlScope,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reports (org_id, created_by, domain, wcag_target, scope, status)
     VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING id`,
    [env.demoOrgId, userId, domain, wcagTarget, scope],
  );
  return row!.id;
}

export function getReportRow(id: string, userId: string): Promise<ReportRow | null> {
  return queryOne<ReportRow>(`SELECT * FROM reports WHERE id = $1 AND created_by = $2`, [id, userId]);
}

export function getScanRow(id: string, userId: string): Promise<ScanRow | null> {
  return queryOne<ScanRow>(
    `SELECT s.* FROM scans s
     JOIN reports r ON r.id = s.report_id
     WHERE s.id = $1 AND r.created_by = $2`,
    [id, userId],
  );
}

export function getLatestScanRow(reportId: string): Promise<ScanRow | null> {
  return queryOne<ScanRow>(
    `SELECT * FROM scans WHERE report_id = $1 ORDER BY started_at DESC NULLS LAST, id DESC LIMIT 1`,
    [reportId],
  );
}

export async function createScan(reportId: string, scope: CrawlScope, authMode: AuthMode): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO scans (report_id, scope, auth_mode, state) VALUES ($1, $2, $3, 'queued') RETURNING id`,
    [reportId, scope, authMode],
  );
  return row!.id;
}

/** Patch publication metadata + attestation. Maps camelCase keys → columns. */
export async function updateReport(
  id: string,
  patch: Partial<import('@vpat/shared').ReportMeta>,
): Promise<void> {
  const cols: Record<string, string> = {
    productName: 'product_name',
    productVersion: 'product_version',
    vendorName: 'vendor_name',
    contactEmail: 'contact_email',
    productDescription: 'product_description',
    evaluationMethods: 'evaluation_methods',
    assistiveTech: 'assistive_tech',
    testEnvironments: 'test_environments',
    evaluatorName: 'evaluator_name',
    evaluatorOrg: 'evaluator_org',
    evaluationStart: 'evaluation_start',
    evaluationEnd: 'evaluation_end',
    notes: 'notes',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, col] of Object.entries(cols)) {
    const val = (patch as Record<string, unknown>)[key];
    if (val === undefined) continue;
    if (col === 'assistive_tech' || col === 'test_environments') {
      params.push(JSON.stringify(val));
      sets.push(`${col} = $${params.length}::jsonb`);
    } else if (col === 'evaluation_start' || col === 'evaluation_end') {
      // empty string ⇒ NULL date
      params.push(val === '' ? null : val);
      sets.push(`${col} = $${params.length}`);
    } else {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length === 0) return;
  await query(`UPDATE reports SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function setReportStatus(id: string, status: ReportStatus): Promise<void> {
  const finalized = status === 'final' ? ', finalized_at = now()' : '';
  await query(`UPDATE reports SET status = $2${finalized} WHERE id = $1`, [id, status]);
}

export async function setStripeCustomer(userId: string, customerId: string, billingEmail: string | null): Promise<void> {
  await query(
    `UPDATE users
     SET stripe_customer_id = $2,
         billing_email = COALESCE($3, billing_email, email)
     WHERE id = $1`,
    [userId, customerId, billingEmail],
  );
}

export async function applyStripeSubscription(
  userId: string,
  patch: {
    plan: SubscriptionPlan;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    subscriptionStatus: string | null;
    billingEmail: string | null;
  },
): Promise<void> {
  await query(
    `UPDATE users
     SET plan = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         stripe_subscription_id = $4,
         stripe_price_id = $5,
         subscription_status = $6,
         billing_email = COALESCE($7, billing_email, email)
     WHERE id = $1`,
    [
      userId,
      patch.plan,
      patch.stripeCustomerId,
      patch.stripeSubscriptionId,
      patch.stripePriceId,
      patch.subscriptionStatus,
      patch.billingEmail,
    ],
  );
}

export function listReportRows(userId: string): Promise<ReportRow[]> {
  return query<ReportRow>(`SELECT * FROM reports WHERE created_by = $1 ORDER BY created_at DESC`, [userId]);
}

async function loadFindings(reportId: string): Promise<Finding[]> {
  const rows = await query<FindingRow>(
    `SELECT * FROM findings WHERE report_id = $1 ORDER BY ordinal`,
    [reportId],
  );
  if (rows.length === 0) return [];
  const evRows = await query<EvidenceRow & { finding_id: string }>(
    `SELECT e.finding_id, e.type, e.text, e.page_url
     FROM evidence e JOIN findings f ON f.id = e.finding_id
     WHERE f.report_id = $1 ORDER BY e.ordinal`,
    [reportId],
  );
  const byFinding = new Map<string, Evidence[]>();
  for (const r of evRows) {
    const list = byFinding.get(r.finding_id) ?? [];
    list.push(evidenceRowTo(r));
    byFinding.set(r.finding_id, list);
  }
  return rows.map((r) => rowToFinding(r, byFinding.get(r.id) ?? []));
}

async function loadPages(scanId: string): Promise<{ url: string; title: string; isAuth: boolean }[]> {
  const rows = await query<{ url: string; title: string | null; is_auth: boolean }>(
    `SELECT url, title, is_auth FROM pages WHERE scan_id = $1 ORDER BY id`,
    [scanId],
  );
  return rows.map((r) => ({ url: r.url, title: r.title ?? r.url, isAuth: r.is_auth }));
}

export async function getReportDetail(id: string, userId: string): Promise<ReportDetail | null> {
  const reportRow = await getReportRow(id, userId);
  if (!reportRow) return null;
  const scanRow = await getLatestScanRow(id);
  const findings = await loadFindings(id);
  const pages = scanRow ? await loadPages(scanRow.id) : [];
  return {
    report: rowToReport(reportRow),
    scan: scanRow ? rowToScan(scanRow) : null,
    findings,
    auto: AUTO,
    pages,
  };
}

export async function updateFinding(
  userId: string,
  findingId: string,
  patch: { status?: ConformanceLevel; remarks?: string },
): Promise<Finding | null> {
  const sets: string[] = ['edited = true', 'updated_at = now()'];
  const params: unknown[] = [findingId];
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.remarks !== undefined) {
    params.push(patch.remarks);
    sets.push(`remarks = $${params.length}`);
  }
  const row = await queryOne<FindingRow>(
    `UPDATE findings f
     SET ${sets.join(', ')}
     FROM reports r
     WHERE f.id = $1 AND r.id = f.report_id AND r.created_by = $${params.length + 1}
     RETURNING f.*`,
    [...params, userId],
  );
  if (!row) return null;
  const evRows = await query<EvidenceRow>(
    `SELECT type, text, page_url FROM evidence WHERE finding_id = $1 ORDER BY ordinal`,
    [findingId],
  );
  return rowToFinding(row, evRows.map(evidenceRowTo));
}

export async function approveFinding(userId: string, findingId: string): Promise<void> {
  await query(
    `UPDATE findings f
     SET approved = true, updated_at = now()
     FROM reports r
     WHERE f.id = $1 AND r.id = f.report_id AND r.created_by = $2`,
    [findingId, userId],
  );
}

export async function approveAll(userId: string, reportId: string): Promise<void> {
  await query(
    `UPDATE findings f
     SET approved = true, updated_at = now()
     FROM reports r
     WHERE r.id = $1 AND r.id = f.report_id AND r.created_by = $2`,
    [reportId, userId],
  );
}

export async function getScanEvents(
  userId: string,
  scanId: string,
  afterSeq: number,
): Promise<SequencedScanEvent[]> {
  const rows = await query<{ seq: number; event: ScanEvent }>(
    `SELECT e.seq, e.event
     FROM scan_events e
     JOIN scans s ON s.id = e.scan_id
     JOIN reports r ON r.id = s.report_id
     WHERE e.scan_id = $1 AND e.seq > $2 AND r.created_by = $3
     ORDER BY e.seq`,
    [scanId, afterSeq, userId],
  );
  return rows.map((r) => ({ seq: r.seq, event: r.event }));
}

export async function recordExport(
  reportId: string,
  format: 'pdf' | 'docx' | 'vpat',
  s3Key: string,
  filename: string,
): Promise<void> {
  await query(
    `INSERT INTO exports (report_id, format, s3_key, filename) VALUES ($1, $2, $3, $4)`,
    [reportId, format, s3Key, filename],
  );
}
