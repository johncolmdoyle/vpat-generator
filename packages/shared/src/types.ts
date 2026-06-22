/**
 * Domain types for the VPAT 2.5Rev International Edition ACR.
 *
 * One ACR bundles three reports — WCAG 2.x, Revised Section 508, EN 301 549 — and a
 * single WCAG response is cross-referenced into the EN/508 rows it satisfies. These
 * types are the source of truth the future api/worker packages should import.
 *
 * Mirrors the prototype's `vpat-data.js` and the data model in BACKEND.md §3.
 */

/** Conformance level recorded against a single criterion. */
export type ConformanceLevel =
  | 'Supports'
  | 'Partially Supports'
  | 'Does Not Support'
  | 'Not Applicable'
  | 'Not Evaluated'; // Used only for WCAG Level AAA.

/** Which of the three sub-reports a row belongs to. */
export type ReportKind = 'wcag' | '508' | 'en';

/** Section within a report (sidebar grouping). */
export type SectionId = 'A' | 'AA' | 'AAA' | 'fpc' | 'fps' | 'ref508' | 'refen';

/** WCAG conformance target the user evaluates against. */
export type WcagTarget = 'A' | 'AA' | 'AAA';

/** Crawl scope chosen in Step 1. */
export type CrawlScope = 'auto' | 'single' | 'sitemap';

/** Whether the scan authenticates into gated pages. */
export type AuthMode = 'public' | 'auth';

/** A single piece of supporting evidence for a finding. */
export interface Evidence {
  type: 'issue' | 'pass';
  text: string;
  /** Where the evidence was found (page path(s) or "global"). */
  where: string;
}

/**
 * One approvable row: a WCAG success criterion, a Section 508 Functional Performance
 * Criterion, or an EN 301 549 Functional Performance Statement.
 */
export interface Criterion {
  id: string;
  name: string;
  report: ReportKind;
  section: SectionId;
  /** WCAG conformance level (A/AA/AAA). Absent for FPC/FPS rows. */
  level?: string;
  /** WCAG version that introduced the criterion. Absent for FPC/FPS rows. */
  ver?: string;
  principle: string;
  status: ConformanceLevel;
  /** Plain-language explanation (AI draft, then user-editable). */
  remarks: string;
  /** Model self-rated confidence, 0–1. */
  confidence: number;
  /** Count of automated (axe-core) checks aggregated to this criterion. */
  auto: number;
  evidence: Evidence[];
  /** True for the obsolete 4.1.1 Parsing row (auto-resolved). */
  obsolete?: boolean;
}

/**
 * A criterion plus the per-session review state. `ai*` fields preserve the original
 * draft for the compliance audit trail (BACKEND.md §3).
 */
export interface Finding extends Criterion {
  approved: boolean;
  edited: boolean;
  aiStatus: ConformanceLevel;
  aiRemarks: string;
  aiConfidence: number;
  /** Server-side row id (UUID). Present only in API-backed mode; undefined for the
   *  local mock flow. Used to address PATCH/approve endpoints. */
  dbId?: string;
}

/**
 * An auto-resolved / cross-referenced row shown for completeness in the sidebar
 * (e.g. "Clause 9 — Web → See WCAG 2.x section"). Not separately approvable.
 */
export interface AutoRow {
  report: ReportKind;
  section: SectionId;
  id: string;
  name: string;
  status: ConformanceLevel;
  /** Why this row resolves the way it does. */
  ref: string;
}

/** Conformance term definition (glossary). */
export interface Term {
  term: string;
  def: string;
}

/** An applicable standard / guideline covered by the INT edition. */
export interface Standard {
  id: string;
  group: string;
  levels: string[] | null;
}

/** A discovered page in the crawl. */
export interface Page {
  url: string;
  title: string;
  auth: boolean;
}

/** A phase of the scan pipeline (Step 3). */
export interface ScanPhase {
  key: string;
  label: string;
  detail: string;
}

/** Tab + section structure for one of the three sub-reports. */
export interface ReportDef {
  id: ReportKind;
  name: string;
  tag: string;
  note: string;
  sections: { id: SectionId; name: string }[];
}

/** Cross-reference: the EN/508 provisions a single WCAG response also documents. */
export interface CrossReference {
  en: string[];
  s508: string[];
}

/** Wizard form state collected across Steps 1–2. */
export interface WizardForm {
  domain?: string;
  level?: WcagTarget;
  scope?: CrawlScope;
  authMode?: AuthMode;
  user?: string;
  pass?: string;
  loginUrl?: string;
}

/**
 * Editable publication metadata + evaluator attestation captured on the Details step.
 * These populate the official VPAT 2.5Rev ACR header and the attestation block.
 *
 * The report is always issued as a DRAFT: the named evaluator is recorded, but the
 * responsible party must review and approve before publishing. The attestation fields
 * are how a real ACR records what manual / assistive-technology testing was performed.
 */
export interface ReportMeta {
  /** Name of Product / Version. */
  productName: string;
  productVersion: string;
  /** Author/vendor company that owns the product. */
  vendorName: string;
  /** Contact for accessibility questions about this report. */
  contactEmail: string;
  productDescription: string;
  /** Free-text "Evaluation Methods Used" (prefilled with the methodology). */
  evaluationMethods: string;
  /** Assistive technologies used for manual testing (e.g. "NVDA 2024.1", "VoiceOver"). */
  assistiveTech: string[];
  /** Test environments (e.g. "Chrome 124 on Windows 11", "Safari 17 on macOS 14"). */
  testEnvironments: string[];
  /** Person who performed/owns the evaluation. */
  evaluatorName: string;
  evaluatorOrg: string;
  /** Evaluation period, ISO date strings (yyyy-mm-dd). */
  evaluationStart: string;
  evaluationEnd: string;
  notes: string;
}

/** A blank metadata object with the product domain prefilled into sensible defaults. */
export function emptyReportMeta(domain = ''): ReportMeta {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return {
    productName: host,
    productVersion: '',
    vendorName: '',
    contactEmail: host ? `accessibility@${host}` : '',
    productDescription: '',
    evaluationMethods: '',
    assistiveTech: [],
    testEnvironments: [],
    evaluatorName: '',
    evaluatorOrg: '',
    evaluationStart: '',
    evaluationEnd: '',
    notes: '',
  };
}
