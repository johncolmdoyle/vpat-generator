/** Runs one scan job end-to-end: analyze → draft → persist, emitting progress. */
import { query, destroySecret } from '@vpat/backend';
import { criteriaForEdition, type ScanJobMessage } from '@vpat/shared';
import { Emitter } from './events.js';
import { analyze } from './scan.js';
import { draftCriterion } from './draft.js';
import { persistPages, insertFinding } from './persist.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runJob(job: ScanJobMessage): Promise<void> {
  const emit = await Emitter.create(job.scanId);
  await emit.markStarted();
  await emit.state('running');

  try {
    // ---- scan ----
    const analysis = await analyze(job, emit);
    await persistPages(job.scanId, analysis.pages);
    await emit.emit({
      kind: 'scan-done',
      pages: analysis.pages.length,
      issues: analysis.issues,
      evidence: analysis.evidence,
    });

    // ---- draft ----
    await emit.state('drafting');
    const criteria = criteriaForEdition(job.edition);
    const total = criteria.length;
    let drafted = 0;
    for (const c of criteria) {
      // Real scans must never inherit the baked mock evidence: a criterion the scan
      // didn't flag gets empty data so the draft reflects the actual site, not the demo.
      const fallback = analysis.mock ? { auto: c.auto, evidence: c.evidence } : { auto: 0, evidence: [] };
      const data = analysis.perCriterion.get(c.id) ?? fallback;
      const draft = await draftCriterion(c, data, { mock: analysis.mock });
      await insertFinding(job.reportId, job.scanId, c, draft, data, drafted);
      drafted += 1;
      await emit.emit({ kind: 'draft-chip', findingId: c.id, status: draft.status });
      await emit.emit({
        kind: 'draft-progress',
        drafted,
        total,
        phase: Math.min(4, Math.floor((drafted / total) * 5)),
      });
      if (analysis.mock) await sleep(90);
    }
    await emit.emit({ kind: 'draft-done', total });

    // ---- finalize ----
    await emit.markFinished('done');
    await query(`UPDATE reports SET status = 'review' WHERE id = $1`, [job.reportId]);
    if (job.authSecretId) await destroySecret(job.authSecretId);
  } catch (err) {
    await emit.emit({ kind: 'error', message: String(err) });
    await emit.markFinished('failed');
    throw err;
  }
}
