/** Row ⇄ DTO mappers and the static criteria → finding seed. */
import {
  CRITERIA,
  type ConformanceLevel,
  type Criterion,
  type Evidence,
  type Finding,
  type ReportKind,
  type ReportRecord,
  type ScanRecord,
  type SectionId,
} from '@vpat/shared';

export interface ReportRow {
  id: string;
  domain: string;
  wcag_target: 'A' | 'AA' | 'AAA';
  edition: string;
  scope: 'auto' | 'single' | 'sitemap';
  status: ReportRecord['status'];
  product_name: string | null;
  product_version: string | null;
  contact_email: string | null;
  product_description: string | null;
  evaluation_methods: string | null;
  notes: string | null;
  created_at: Date;
  finalized_at: Date | null;
}

export interface ScanRow {
  id: string;
  report_id: string;
  scope: 'auto' | 'single' | 'sitemap';
  auth_mode: 'public' | 'auth';
  state: ScanRecord['state'];
  pages_count: number;
  issues_count: number;
  evidence_count: number;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface FindingRow {
  id: string;
  criterion_id: string;
  report_kind: ReportKind;
  section: SectionId;
  name: string;
  level: string | null;
  wcag_version: string | null;
  principle: string;
  auto: number;
  obsolete: boolean;
  status: ConformanceLevel;
  remarks: string;
  ai_status: ConformanceLevel;
  ai_remarks: string;
  ai_confidence: number;
  approved: boolean;
  edited: boolean;
}

export interface EvidenceRow {
  type: 'issue' | 'pass';
  text: string;
  page_url: string | null;
}

export function rowToReport(r: ReportRow): ReportRecord {
  return {
    id: r.id,
    domain: r.domain,
    wcagTarget: r.wcag_target,
    edition: 'INT',
    scope: r.scope,
    status: r.status,
    productName: r.product_name,
    productVersion: r.product_version,
    contactEmail: r.contact_email,
    productDescription: r.product_description,
    evaluationMethods: r.evaluation_methods,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
    finalizedAt: r.finalized_at ? r.finalized_at.toISOString() : null,
  };
}

export function rowToScan(r: ScanRow): ScanRecord {
  return {
    id: r.id,
    reportId: r.report_id,
    scope: r.scope,
    authMode: r.auth_mode,
    state: r.state,
    pagesCount: r.pages_count,
    issuesCount: r.issues_count,
    evidenceCount: r.evidence_count,
    startedAt: r.started_at ? r.started_at.toISOString() : null,
    finishedAt: r.finished_at ? r.finished_at.toISOString() : null,
  };
}

export function rowToFinding(r: FindingRow, evidence: Evidence[]): Finding {
  return {
    dbId: r.id,
    id: r.criterion_id,
    name: r.name,
    report: r.report_kind,
    section: r.section,
    level: r.level ?? undefined,
    ver: r.wcag_version ?? undefined,
    principle: r.principle,
    status: r.status,
    remarks: r.remarks,
    confidence: r.ai_confidence,
    auto: r.auto,
    evidence,
    obsolete: r.obsolete,
    approved: r.approved,
    edited: r.edited,
    aiStatus: r.ai_status,
    aiRemarks: r.ai_remarks,
    aiConfidence: r.ai_confidence,
  };
}

export function evidenceRowTo(r: EvidenceRow): Evidence {
  return { type: r.type, text: r.text, where: r.page_url ?? '' };
}

/** The fixed criteria set the worker drafts against (one finding row per criterion). */
export function criteriaSeed(): Criterion[] {
  return CRITERIA;
}
