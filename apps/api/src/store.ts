/** Postgres data access for the API. */
import {
  rowToSupportRequest,
  rowToSupportMessage,
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
  type SupportMessageRow,
  type SupportRequestRow,
} from '@vpat/backend';
import {
  type AccountSummary,
  type AdminClientDetail,
  type AdminClientSummary,
  type AdminOverview,
  type AdminReportSummary,
  type AdminSupportRequestDetail,
  type AdminSupportRequestSummary,
  type AuditEventRecord,
  autoRowsForEdition,
  type AuthMode,
  type CrawlScope,
  type ConformanceLevel,
  type Evidence,
  type Finding,
  type UpdateAdminReportRequest,
  type SupportRequestCategory,
  type SupportRequestDetail,
  type SupportRequestRecord,
  type SupportRequestStatus,
  type SupportMessageRecord,
  type ReportDetail,
  type ReportEdition,
  type ReportStatus,
  type SequencedScanEvent,
  type ScanEvent,
  type SubscriptionPlan,
  type WcagTarget,
} from '@vpat/shared';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

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
    `SELECT id, email, plan, billing_email, contact_email, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status, internal_notes, is_archived, archived_at, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
}

export function getUserByStripeCustomerId(customerId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT id, email, plan, billing_email, contact_email, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status, internal_notes, is_archived, archived_at, created_at
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
    `SELECT COUNT(*)::text AS count FROM reports WHERE created_by = $1 AND status <> 'final' AND is_archived = false`,
    [userId],
  );
  return Number(row?.count ?? '0');
}

export async function createReport(
  userId: string,
  domain: string,
  wcagTarget: WcagTarget,
  edition: ReportEdition,
  scope: CrawlScope,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reports (org_id, created_by, domain, wcag_target, edition, scope, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
    [env.demoOrgId, userId, domain, wcagTarget, edition, scope],
  );
  return row!.id;
}

export async function recordAuditEvent(input: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  orgId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  subject: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_events (org_id, actor_user_id, actor_email, action, target_type, target_id, subject, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.orgId ?? env.demoOrgId,
      input.actorUserId ?? null,
      input.actorEmail ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.subject,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export function getReportRow(id: string, userId: string): Promise<ReportRow | null> {
  return queryOne<ReportRow>(`SELECT * FROM reports WHERE id = $1 AND created_by = $2 AND is_archived = false`, [id, userId]);
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
  return query<ReportRow>(`SELECT * FROM reports WHERE created_by = $1 AND is_archived = false ORDER BY created_at DESC`, [userId]);
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

async function loadAuditEventsByTarget(targetType: string, targetIds: string[]): Promise<AuditEventRecord[]> {
  if (!targetIds.length) return [];
  const rows = await query<{
    id: string;
    action: string;
    target_type: string;
    target_id: string | null;
    actor_user_id: string | null;
    actor_email: string | null;
    subject: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, action, target_type, target_id, actor_user_id, actor_email, subject, metadata, created_at
     FROM audit_events
     WHERE target_type = $1 AND target_id = ANY($2::text[])
     ORDER BY created_at DESC`,
    [targetType, targetIds],
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    subject: row.subject,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  }));
}

async function loadLatestFinalizeAuditEvent(reportId: string): Promise<AuditEventRecord | null> {
  const rows = await loadAuditEventsByTarget('report', [reportId]);
  return rows.find((row) => row.action === 'report.finalized') ?? null;
}

function adminClientSummaryFromRow(row: {
  id: string;
  email: string;
  billing_email: string | null;
  contact_email: string | null;
  plan: SubscriptionPlan;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  report_count: string;
  open_support_requests: string;
  internal_notes: string | null;
  is_archived: boolean;
  archived_at: Date | null;
  created_at: Date;
  last_activity_at: Date | null;
}): AdminClientSummary {
  return {
    id: row.id,
    email: row.email,
    billingEmail: row.billing_email,
    contactEmail: row.contact_email,
    plan: row.plan,
    subscriptionStatus: row.subscription_status,
    hasActiveSubscription: ACTIVE_SUBSCRIPTION_STATUSES.has(row.subscription_status ?? ''),
    reportCount: Number(row.report_count ?? '0'),
    openSupportRequests: Number(row.open_support_requests ?? '0'),
    createdAt: row.created_at.toISOString(),
    lastActivityAt: row.last_activity_at ? row.last_activity_at.toISOString() : null,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    internalNotes: row.internal_notes,
    isArchived: row.is_archived,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
  };
}

function adminSupportSummaryFromRow(row: {
  request_id: string;
  category: SupportRequestCategory;
  status: SupportRequestStatus;
  subject: string;
  created_at: Date;
  user_id: string;
  email: string;
  billing_email: string | null;
  plan: SubscriptionPlan;
  last_message_at: Date | null;
  last_message_preview: string | null;
}): AdminSupportRequestSummary {
  return {
    request: {
      id: row.request_id,
      category: row.category,
      status: row.status,
      subject: row.subject,
      createdAt: row.created_at.toISOString(),
    },
    clientId: row.user_id,
    clientEmail: row.email,
    billingEmail: row.billing_email,
    plan: row.plan,
    lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : row.created_at.toISOString(),
    lastMessagePreview: row.last_message_preview,
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const row = await queryOne<{
    total_clients: string;
    active_subscriptions: string;
    past_due_subscriptions: string;
    active_reports: string;
    open_support_requests: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_clients,
       COUNT(*) FILTER (WHERE subscription_status IN ('active','trialing'))::text AS active_subscriptions,
       COUNT(*) FILTER (WHERE subscription_status IN ('past_due','unpaid'))::text AS past_due_subscriptions,
       (SELECT COUNT(*)::text FROM reports WHERE status <> 'final' AND is_archived = false) AS active_reports,
       (SELECT COUNT(*)::text FROM support_requests WHERE status IN ('open','pending')) AS open_support_requests
     FROM users`,
  );
  return {
    totalClients: Number(row?.total_clients ?? '0'),
    activeSubscriptions: Number(row?.active_subscriptions ?? '0'),
    pastDueSubscriptions: Number(row?.past_due_subscriptions ?? '0'),
    activeReports: Number(row?.active_reports ?? '0'),
    openSupportRequests: Number(row?.open_support_requests ?? '0'),
  };
}

export async function listAdminClients(): Promise<AdminClientSummary[]> {
  const rows = await query<{
    id: string;
    email: string;
    billing_email: string | null;
    contact_email: string | null;
    plan: SubscriptionPlan;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    report_count: string;
    open_support_requests: string;
    internal_notes: string | null;
    is_archived: boolean;
    archived_at: Date | null;
    created_at: Date;
    last_activity_at: Date | null;
  }>(
    `SELECT
       u.id,
       u.email,
       u.billing_email,
       u.contact_email,
       u.plan,
       u.subscription_status,
       u.stripe_customer_id,
       u.stripe_subscription_id,
       COUNT(DISTINCT r.id) FILTER (WHERE r.is_archived = false)::text AS report_count,
       COUNT(DISTINCT sr.id) FILTER (WHERE sr.status IN ('open','pending'))::text AS open_support_requests,
       u.internal_notes,
       u.is_archived,
       u.archived_at,
       u.created_at,
       GREATEST(
         u.created_at,
         MAX(r.created_at),
         MAX(sr.updated_at),
         MAX(e.created_at)
       ) AS last_activity_at
     FROM users u
     LEFT JOIN reports r ON r.created_by = u.id
     LEFT JOIN support_requests sr ON sr.user_id = u.id
     LEFT JOIN exports e ON e.report_id = r.id
     GROUP BY u.id
     ORDER BY last_activity_at DESC NULLS LAST, u.created_at DESC`,
  );
  return rows.map(adminClientSummaryFromRow);
}

export async function getAdminClientDetail(clientId: string): Promise<AdminClientDetail | null> {
  const clientRow = await queryOne<{
    id: string;
    email: string;
    billing_email: string | null;
    contact_email: string | null;
    plan: SubscriptionPlan;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    report_count: string;
    open_support_requests: string;
    internal_notes: string | null;
    is_archived: boolean;
    archived_at: Date | null;
    created_at: Date;
    last_activity_at: Date | null;
  }>(
    `SELECT
       u.id,
       u.email,
       u.billing_email,
       u.contact_email,
       u.plan,
       u.subscription_status,
       u.stripe_customer_id,
       u.stripe_subscription_id,
       COUNT(DISTINCT r.id) FILTER (WHERE r.is_archived = false)::text AS report_count,
       COUNT(DISTINCT sr.id) FILTER (WHERE sr.status IN ('open','pending'))::text AS open_support_requests,
       u.internal_notes,
       u.is_archived,
       u.archived_at,
       u.created_at,
       GREATEST(
         u.created_at,
         MAX(r.created_at),
         MAX(sr.updated_at),
         MAX(e.created_at)
       ) AS last_activity_at
     FROM users u
     LEFT JOIN reports r ON r.created_by = u.id
     LEFT JOIN support_requests sr ON sr.user_id = u.id
     LEFT JOIN exports e ON e.report_id = r.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [clientId],
  );
  if (!clientRow) return null;
  const reportRows = await query<
    ReportRow & {
      client_id: string | null;
      client_email: string | null;
      latest_scan_state: ScanRow['state'] | null;
      latest_scan_started_at: Date | null;
      latest_scan_finished_at: Date | null;
    }
  >(
    `SELECT
       r.*,
       u.id AS client_id,
       u.email AS client_email,
       s.state AS latest_scan_state,
       s.started_at AS latest_scan_started_at,
       s.finished_at AS latest_scan_finished_at
     FROM reports r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN LATERAL (
       SELECT state, started_at, finished_at
       FROM scans
       WHERE report_id = r.id
       ORDER BY started_at DESC NULLS LAST, id DESC
       LIMIT 1
     ) s ON true
     WHERE r.created_by = $1
     ORDER BY r.created_at DESC`,
    [clientId],
  );
  const supportRows = await query<{
    request_id: string;
    category: SupportRequestCategory;
    status: SupportRequestStatus;
    subject: string;
    created_at: Date;
    user_id: string;
    email: string;
    billing_email: string | null;
    plan: SubscriptionPlan;
    last_message_at: Date | null;
    last_message_preview: string | null;
  }>(
    `SELECT
       sr.id AS request_id,
       sr.category,
       sr.status,
       sr.subject,
       sr.created_at,
       u.id AS user_id,
       u.email,
       u.billing_email,
       u.plan,
       MAX(srm.created_at) AS last_message_at,
       (
         SELECT body
         FROM support_request_messages
         WHERE support_request_id = sr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) AS last_message_preview
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     LEFT JOIN support_request_messages srm ON srm.support_request_id = sr.id
     WHERE sr.user_id = $1
     GROUP BY sr.id, u.id
     ORDER BY COALESCE(MAX(srm.created_at), sr.updated_at, sr.created_at) DESC`,
    [clientId],
  );
  const auditEvents = await query<{
    id: string;
    action: string;
    target_type: string;
    target_id: string | null;
    actor_user_id: string | null;
    actor_email: string | null;
    subject: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, action, target_type, target_id, actor_user_id, actor_email, subject, metadata, created_at
     FROM audit_events
     WHERE target_id = $1::text OR actor_user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 50`,
    [clientId],
  );
  return {
    client: adminClientSummaryFromRow(clientRow),
    reports: reportRows.map((row): AdminReportSummary => ({
      report: rowToReport(row),
      clientId: row.client_id,
      clientEmail: row.client_email,
      latestScanState: row.latest_scan_state,
      latestScanStartedAt: row.latest_scan_started_at ? row.latest_scan_started_at.toISOString() : null,
      latestScanFinishedAt: row.latest_scan_finished_at ? row.latest_scan_finished_at.toISOString() : null,
    })),
    supportRequests: supportRows.map(adminSupportSummaryFromRow),
    auditEvents: auditEvents.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      subject: row.subject,
      metadata: row.metadata ?? {},
      createdAt: row.created_at.toISOString(),
    })),
  };
}

export async function listAdminReports(): Promise<AdminReportSummary[]> {
  const rows = await query<
    ReportRow & {
      client_id: string | null;
      client_email: string | null;
      latest_scan_state: ScanRow['state'] | null;
      latest_scan_started_at: Date | null;
      latest_scan_finished_at: Date | null;
    }
  >(
    `SELECT
       r.*,
       u.id AS client_id,
       u.email AS client_email,
       s.state AS latest_scan_state,
       s.started_at AS latest_scan_started_at,
       s.finished_at AS latest_scan_finished_at
     FROM reports r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN LATERAL (
       SELECT state, started_at, finished_at
       FROM scans
       WHERE report_id = r.id
       ORDER BY started_at DESC NULLS LAST, id DESC
       LIMIT 1
     ) s ON true
     ORDER BY r.created_at DESC`,
  );
  return rows.map((row) => ({
    report: rowToReport(row),
    clientId: row.client_id,
    clientEmail: row.client_email,
    latestScanState: row.latest_scan_state,
    latestScanStartedAt: row.latest_scan_started_at ? row.latest_scan_started_at.toISOString() : null,
    latestScanFinishedAt: row.latest_scan_finished_at ? row.latest_scan_finished_at.toISOString() : null,
  }));
}

export async function updateAdminReport(reportId: string, patch: UpdateAdminReportRequest): Promise<AdminReportSummary | null> {
  const sets: string[] = [];
  const params: unknown[] = [reportId];
  if (patch.isArchived !== undefined) {
    params.push(patch.isArchived);
    sets.push(`is_archived = $${params.length}`);
    params.push(patch.isArchived ? new Date().toISOString() : null);
    sets.push(`archived_at = $${params.length}`);
  }
  if (!sets.length) return getAdminReport(reportId);
  await query(`UPDATE reports SET ${sets.join(', ')} WHERE id = $1`, params);
  return getAdminReport(reportId);
}

export async function deleteAdminReport(reportId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(`DELETE FROM reports WHERE id = $1 RETURNING id`, [reportId]);
  return Boolean(row?.id);
}

export async function getAdminReport(reportId: string): Promise<AdminReportSummary | null> {
  const row = await queryOne<
    ReportRow & {
      client_id: string | null;
      client_email: string | null;
      latest_scan_state: ScanRow['state'] | null;
      latest_scan_started_at: Date | null;
      latest_scan_finished_at: Date | null;
    }
  >(
    `SELECT
       r.*,
       u.id AS client_id,
       u.email AS client_email,
       s.state AS latest_scan_state,
       s.started_at AS latest_scan_started_at,
       s.finished_at AS latest_scan_finished_at
     FROM reports r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN LATERAL (
       SELECT state, started_at, finished_at
       FROM scans
       WHERE report_id = r.id
       ORDER BY started_at DESC NULLS LAST, id DESC
       LIMIT 1
     ) s ON true
     WHERE r.id = $1`,
    [reportId],
  );
  if (!row) return null;
  return {
    report: rowToReport(row),
    clientId: row.client_id,
    clientEmail: row.client_email,
    latestScanState: row.latest_scan_state,
    latestScanStartedAt: row.latest_scan_started_at ? row.latest_scan_started_at.toISOString() : null,
    latestScanFinishedAt: row.latest_scan_finished_at ? row.latest_scan_finished_at.toISOString() : null,
  };
}

export async function listAdminSupportRequests(): Promise<AdminSupportRequestSummary[]> {
  const rows = await query<{
    request_id: string;
    category: SupportRequestCategory;
    status: SupportRequestStatus;
    subject: string;
    created_at: Date;
    user_id: string;
    email: string;
    billing_email: string | null;
    plan: SubscriptionPlan;
    last_message_at: Date | null;
    last_message_preview: string | null;
  }>(
    `SELECT
       sr.id AS request_id,
       sr.category,
       sr.status,
       sr.subject,
       sr.created_at,
       u.id AS user_id,
       u.email,
       u.billing_email,
       u.plan,
       MAX(srm.created_at) AS last_message_at,
       (
         SELECT body
         FROM support_request_messages
         WHERE support_request_id = sr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) AS last_message_preview
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     LEFT JOIN support_request_messages srm ON srm.support_request_id = sr.id
     GROUP BY sr.id, u.id
     ORDER BY CASE WHEN sr.status IN ('open','pending') THEN 0 ELSE 1 END,
              COALESCE(MAX(srm.created_at), sr.updated_at, sr.created_at) DESC`,
  );
  return rows.map(adminSupportSummaryFromRow);
}

export async function getAdminSupportRequestDetail(requestId: string): Promise<AdminSupportRequestDetail | null> {
  const row = await queryOne<{
    request_id: string;
    category: SupportRequestCategory;
    status: SupportRequestStatus;
    subject: string;
    created_at: Date;
    user_id: string;
    email: string;
    billing_email: string | null;
    contact_email: string | null;
    plan: SubscriptionPlan;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    internal_notes: string | null;
    is_archived: boolean;
    archived_at: Date | null;
    user_created_at: Date;
    report_count: string;
    open_support_requests: string;
    last_activity_at: Date | null;
  }>(
    `SELECT
       sr.id AS request_id,
       sr.category,
       sr.status,
       sr.subject,
       sr.created_at,
       u.id AS user_id,
       u.email,
       u.billing_email,
       u.contact_email,
       u.plan,
       u.subscription_status,
       u.stripe_customer_id,
       u.stripe_subscription_id,
       u.internal_notes,
       u.is_archived,
       u.archived_at,
       u.created_at AS user_created_at,
       (SELECT COUNT(*)::text FROM reports WHERE created_by = u.id AND is_archived = false) AS report_count,
       (SELECT COUNT(*)::text FROM support_requests WHERE user_id = u.id AND status IN ('open','pending')) AS open_support_requests,
       GREATEST(
         u.created_at,
         (SELECT MAX(created_at) FROM reports WHERE created_by = u.id),
         (SELECT MAX(updated_at) FROM support_requests WHERE user_id = u.id)
       ) AS last_activity_at
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.id = $1`,
    [requestId],
  );
  if (!row) return null;
  const messages = await query<SupportMessageRow>(
    `SELECT id, support_request_id, author_role, body, created_at
     FROM support_request_messages
     WHERE support_request_id = $1
     ORDER BY created_at ASC`,
    [requestId],
  );
  const auditEvents = await loadAuditEventsByTarget('support_request', [requestId]);
  return {
    client: adminClientSummaryFromRow({
      id: row.user_id,
      email: row.email,
      billing_email: row.billing_email,
      contact_email: row.contact_email,
      plan: row.plan,
      subscription_status: row.subscription_status,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      internal_notes: row.internal_notes,
      is_archived: row.is_archived,
      archived_at: row.archived_at,
      report_count: row.report_count,
      open_support_requests: row.open_support_requests,
      created_at: row.user_created_at,
      last_activity_at: row.last_activity_at,
    }),
    request: {
      id: row.request_id,
      category: row.category,
      status: row.status,
      subject: row.subject,
      createdAt: row.created_at.toISOString(),
    },
    messages: messages.map(rowToSupportMessage),
    auditEvents,
  };
}

export async function getReportDetail(id: string, userId: string): Promise<ReportDetail | null> {
  const reportRow = await getReportRow(id, userId);
  if (!reportRow) return null;
  const scanRow = await getLatestScanRow(id);
  const findings = await loadFindings(id);
  const pages = scanRow ? await loadPages(scanRow.id) : [];
  const finalizeEvent = await loadLatestFinalizeAuditEvent(id);
  return {
    report: {
      ...rowToReport(reportRow),
      finalizedByEmail: finalizeEvent?.actorEmail ?? null,
    },
    scan: scanRow ? rowToScan(scanRow) : null,
    findings,
    auto: autoRowsForEdition(reportRow.edition),
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
  format: 'pdf' | 'docx' | 'xlsx' | 'vpat',
  s3Key: string,
  filename: string,
): Promise<void> {
  await query(
    `INSERT INTO exports (report_id, format, s3_key, filename) VALUES ($1, $2, $3, $4)`,
    [reportId, format, s3Key, filename],
  );
}

export async function listSupportRequests(userId: string): Promise<SupportRequestRecord[]> {
  const rows = await query<SupportRequestRow>(
    `SELECT id, category, status, subject, created_at
     FROM support_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId],
  );
  return rows.map(rowToSupportRequest);
}

export async function createSupportRequest(
  userId: string,
  category: SupportRequestCategory,
  subject: string,
  message: string,
): Promise<SupportRequestRecord> {
  const row = await queryOne<SupportRequestRow>(
    `INSERT INTO support_requests (user_id, category, subject)
     VALUES ($1, $2, $3)
     RETURNING id, category, status, subject, created_at`,
    [userId, category, subject],
  );
  await query(
    `INSERT INTO support_request_messages (support_request_id, author_role, body)
     VALUES ($1, 'customer', $2)`,
    [row!.id, message],
  );
  await query(`UPDATE support_requests SET updated_at = now() WHERE id = $1`, [row!.id]);
  return rowToSupportRequest(row!);
}

export async function getSupportRequestDetail(userId: string, requestId: string): Promise<SupportRequestDetail | null> {
  const request = await queryOne<SupportRequestRow>(
    `SELECT id, category, status, subject, created_at
     FROM support_requests
     WHERE id = $1 AND user_id = $2`,
    [requestId, userId],
  );
  if (!request) return null;
  const messages = await query<SupportMessageRow>(
    `SELECT id, support_request_id, author_role, body, created_at
     FROM support_request_messages
     WHERE support_request_id = $1
     ORDER BY created_at ASC`,
    [requestId],
  );
  return {
    request: rowToSupportRequest(request),
    messages: messages.map(rowToSupportMessage),
  };
}

export async function addSupportRequestMessage(
  userId: string,
  requestId: string,
  body: string,
): Promise<SupportMessageRecord | null> {
  const request = await queryOne<{ id: string }>(
    `SELECT id FROM support_requests WHERE id = $1 AND user_id = $2`,
    [requestId, userId],
  );
  if (!request) return null;
  const message = await queryOne<SupportMessageRow>(
    `INSERT INTO support_request_messages (support_request_id, author_role, body)
     VALUES ($1, 'customer', $2)
     RETURNING id, support_request_id, author_role, body, created_at`,
    [requestId, body],
  );
  await query(`UPDATE support_requests SET status = 'open', updated_at = now() WHERE id = $1`, [requestId]);
  return rowToSupportMessage(message!);
}

export async function addAdminSupportRequestMessage(
  requestId: string,
  body: string,
): Promise<SupportMessageRecord | null> {
  const request = await queryOne<{ id: string }>(`SELECT id FROM support_requests WHERE id = $1`, [requestId]);
  if (!request) return null;
  const message = await queryOne<SupportMessageRow>(
    `INSERT INTO support_request_messages (support_request_id, author_role, body)
     VALUES ($1, 'support', $2)
     RETURNING id, support_request_id, author_role, body, created_at`,
    [requestId, body],
  );
  await query(`UPDATE support_requests SET status = 'pending', updated_at = now() WHERE id = $1`, [requestId]);
  return rowToSupportMessage(message!);
}

export async function updateSupportRequestStatus(
  requestId: string,
  status: SupportRequestStatus,
): Promise<SupportRequestRecord | null> {
  const row = await queryOne<SupportRequestRow>(
    `UPDATE support_requests
     SET status = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING id, category, status, subject, created_at`,
    [requestId, status],
  );
  return row ? rowToSupportRequest(row) : null;
}

export async function updateAdminClient(
  clientId: string,
  patch: {
    billingEmail?: string | null;
    contactEmail?: string | null;
    internalNotes?: string | null;
    isArchived?: boolean;
  },
): Promise<AdminClientDetail | null> {
  const sets: string[] = [];
  const params: unknown[] = [clientId];
  if (patch.billingEmail !== undefined) {
    params.push(patch.billingEmail);
    sets.push(`billing_email = $${params.length}`);
  }
  if (patch.contactEmail !== undefined) {
    params.push(patch.contactEmail);
    sets.push(`contact_email = $${params.length}`);
  }
  if (patch.internalNotes !== undefined) {
    params.push(patch.internalNotes);
    sets.push(`internal_notes = $${params.length}`);
  }
  if (patch.isArchived !== undefined) {
    params.push(patch.isArchived);
    sets.push(`is_archived = $${params.length}`);
    params.push(patch.isArchived ? new Date().toISOString() : null);
    sets.push(`archived_at = $${params.length}`);
  }
  if (sets.length === 0) return getAdminClientDetail(clientId);
  const row = await queryOne<{ id: string }>(
    `UPDATE users
     SET ${sets.join(', ')}
     WHERE id = $1
     RETURNING id`,
    params,
  );
  if (!row) return null;
  return getAdminClientDetail(clientId);
}
