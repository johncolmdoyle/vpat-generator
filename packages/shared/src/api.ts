/**
 * Wire contract shared by api ⇄ worker ⇄ web.
 *
 * The REST surface mirrors BACKEND.md §4. Progress is delivered as an ordered
 * stream of {@link ScanEvent}s, persisted by the worker and replayed + tailed by
 * the API's SSE endpoint (so a client that connects late still sees full history).
 */
import type {
  AuthMode,
  AutoRow,
  ConformanceLevel,
  CrawlScope,
  Finding,
  WcagTarget,
} from './types.js';

/** Lifecycle of a report. */
export type ReportStatus = 'draft' | 'scanning' | 'review' | 'final';

/** Lifecycle of a scan job. */
export type ScanState = 'queued' | 'running' | 'drafting' | 'done' | 'failed';

/** Persisted report header (the DB row, sans secrets). */
export interface ReportRecord {
  id: string;
  domain: string;
  wcagTarget: WcagTarget;
  edition: 'INT';
  scope: CrawlScope;
  status: ReportStatus;
  productName: string | null;
  productVersion: string | null;
  contactEmail: string | null;
  productDescription: string | null;
  evaluationMethods: string | null;
  notes: string | null;
  createdAt: string;
  finalizedAt: string | null;
}

export interface ScanRecord {
  id: string;
  reportId: string;
  scope: CrawlScope;
  authMode: AuthMode;
  state: ScanState;
  pagesCount: number;
  issuesCount: number;
  evidenceCount: number;
  startedAt: string | null;
  finishedAt: string | null;
}

/* ---------- requests / responses ---------- */

export interface CreateReportRequest {
  domain: string;
  wcagTarget: WcagTarget;
  scope: CrawlScope;
}
export interface CreateReportResponse {
  reportId: string;
}

/** Step-2 credentials are write-only: stored in Secrets Manager, never returned. */
export interface StartScanRequest {
  authMode: AuthMode;
  user?: string;
  pass?: string;
  loginUrl?: string;
}
export interface StartScanResponse {
  scanId: string;
}

export interface ReportDetail {
  report: ReportRecord;
  scan: ScanRecord | null;
  findings: Finding[];
  auto: AutoRow[];
}

export interface UpdateFindingRequest {
  status?: ConformanceLevel;
  remarks?: string;
}

export type ExportFormat = 'pdf' | 'docx' | 'vpat';
export interface ExportRequest {
  format: ExportFormat;
}
export interface ExportResponse {
  url: string;
  filename: string;
}

/* ---------- progress stream ---------- */

/** Pipeline + drafting progress, ordered by `seq` per scan. */
export type ScanEvent =
  | { kind: 'state'; state: ScanState }
  | { kind: 'phase'; phase: number; label: string }
  | { kind: 'log'; level: 'phase' | 'ok' | 'warn'; text: string; meta?: string }
  | { kind: 'counter'; pages: number; issues: number; evidence: number }
  | { kind: 'scan-done'; pages: number; issues: number; evidence: number }
  | { kind: 'draft-progress'; drafted: number; total: number; phase: number }
  | { kind: 'draft-chip'; findingId: string; status: ConformanceLevel }
  | { kind: 'draft-done'; total: number }
  | { kind: 'error'; message: string };

/** One persisted, sequenced event as delivered by SSE (`id:` = seq). */
export interface SequencedScanEvent {
  seq: number;
  event: ScanEvent;
}

/** Message placed on the SQS scan queue by the API, consumed by the worker. */
export interface ScanJobMessage {
  scanId: string;
  reportId: string;
  domain: string;
  scope: CrawlScope;
  authMode: AuthMode;
  /** Secrets Manager id holding the Step-2 credentials, when authMode = 'auth'. */
  authSecretId?: string;
}
