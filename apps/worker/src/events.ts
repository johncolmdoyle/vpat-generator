/** Persists ordered scan events (replayed + tailed by the API SSE endpoint) and keeps
 *  the scans table counters in sync. */
import { query, queryOne } from '@vpat/backend';
import type { ScanEvent, ScanState } from '@vpat/shared';

export class Emitter {
  private seq: number;

  private constructor(
    private readonly scanId: string,
    startSeq: number,
  ) {
    this.seq = startSeq;
  }

  static async create(scanId: string): Promise<Emitter> {
    const row = await queryOne<{ max: number | null }>(
      `SELECT MAX(seq) AS max FROM scan_events WHERE scan_id = $1`,
      [scanId],
    );
    return new Emitter(scanId, row?.max ?? 0);
  }

  async emit(event: ScanEvent): Promise<void> {
    this.seq += 1;
    await query(`INSERT INTO scan_events (scan_id, seq, event) VALUES ($1, $2, $3)`, [
      this.scanId,
      this.seq,
      JSON.stringify(event),
    ]);
  }

  async state(state: ScanState): Promise<void> {
    await query(`UPDATE scans SET state = $2 WHERE id = $1`, [this.scanId, state]);
    await this.emit({ kind: 'state', state });
  }

  async counter(pages: number, issues: number, evidence: number): Promise<void> {
    await query(
      `UPDATE scans SET pages_count = $2, issues_count = $3, evidence_count = $4 WHERE id = $1`,
      [this.scanId, pages, issues, evidence],
    );
    await this.emit({ kind: 'counter', pages, issues, evidence });
  }

  async markStarted(): Promise<void> {
    await query(`UPDATE scans SET started_at = now() WHERE id = $1 AND started_at IS NULL`, [this.scanId]);
  }

  async markFinished(state: ScanState): Promise<void> {
    await query(`UPDATE scans SET state = $2, finished_at = now() WHERE id = $1`, [this.scanId, state]);
  }
}
