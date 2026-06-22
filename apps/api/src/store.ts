/** Postgres data access for the API. */
import {
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
} from '@vpat/backend';
import {
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
  type WcagTarget,
} from '@vpat/shared';

export async function createReport(domain: string, wcagTarget: WcagTarget, scope: CrawlScope): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reports (org_id, created_by, domain, wcag_target, scope, status)
     VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING id`,
    [env.demoOrgId, env.demoUserId, domain, wcagTarget, scope],
  );
  return row!.id;
}

export function getReportRow(id: string): Promise<ReportRow | null> {
  return queryOne<ReportRow>(`SELECT * FROM reports WHERE id = $1`, [id]);
}

export function getScanRow(id: string): Promise<ScanRow | null> {
  return queryOne<ScanRow>(`SELECT * FROM scans WHERE id = $1`, [id]);
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

export function listReportRows(): Promise<ReportRow[]> {
  return query<ReportRow>(
    `SELECT * FROM reports WHERE org_id = $1 ORDER BY created_at DESC`,
    [env.demoOrgId],
  );
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

export async function getReportDetail(id: string): Promise<ReportDetail | null> {
  const reportRow = await getReportRow(id);
  if (!reportRow) return null;
  const scanRow = await getLatestScanRow(id);
  const findings = await loadFindings(id);
  return {
    report: rowToReport(reportRow),
    scan: scanRow ? rowToScan(scanRow) : null,
    findings,
    auto: AUTO,
  };
}

export async function updateFinding(
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
    `UPDATE findings SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  );
  if (!row) return null;
  const evRows = await query<EvidenceRow>(
    `SELECT type, text, page_url FROM evidence WHERE finding_id = $1 ORDER BY ordinal`,
    [findingId],
  );
  return rowToFinding(row, evRows.map(evidenceRowTo));
}

export async function approveFinding(findingId: string): Promise<void> {
  await query(`UPDATE findings SET approved = true, updated_at = now() WHERE id = $1`, [findingId]);
}

export async function approveAll(reportId: string): Promise<void> {
  await query(`UPDATE findings SET approved = true, updated_at = now() WHERE report_id = $1`, [reportId]);
}

export async function getScanEvents(scanId: string, afterSeq: number): Promise<SequencedScanEvent[]> {
  const rows = await query<{ seq: number; event: ScanEvent }>(
    `SELECT seq, event FROM scan_events WHERE scan_id = $1 AND seq > $2 ORDER BY seq`,
    [scanId, afterSeq],
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
