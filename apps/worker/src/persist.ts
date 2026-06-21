/** Writes pages, findings and evidence produced by a scan job. */
import { query, queryOne } from '@vpat/backend';
import type { Criterion } from '@vpat/shared';
import type { AnalysisResult, CriterionData } from './scan.js';
import type { Draft } from './draft.js';

export async function persistPages(scanId: string, pages: AnalysisResult['pages']): Promise<void> {
  for (const p of pages) {
    await query(
      `INSERT INTO pages (scan_id, url, title, is_auth) VALUES ($1, $2, $3, $4)`,
      [scanId, p.url, p.title, p.auth],
    );
  }
}

export async function insertFinding(
  reportId: string,
  scanId: string,
  c: Criterion,
  draft: Draft,
  data: CriterionData,
  ordinal: number,
): Promise<void> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO findings
       (report_id, report_kind, section, criterion_id, name, level, wcag_version, principle,
        auto, obsolete, status, remarks, ai_status, ai_remarks, ai_confidence, ordinal)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      reportId,
      c.report,
      c.section,
      c.id,
      c.name,
      c.level ?? null,
      c.ver ?? null,
      c.principle,
      data.auto,
      c.obsolete ?? false,
      draft.status,
      draft.remarks,
      draft.status,
      draft.remarks,
      draft.confidence,
      ordinal,
    ],
  );
  const findingId = row!.id;

  let i = 0;
  for (const ev of data.evidence) {
    await query(
      `INSERT INTO evidence (finding_id, scan_id, type, text, page_url, ordinal)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [findingId, scanId, ev.type, ev.text, ev.where || null, i++],
    );
  }
}
