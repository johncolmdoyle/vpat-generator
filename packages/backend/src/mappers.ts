/** Row ⇄ DTO mappers and the static criteria → finding seed. */
import {
  type AccountSummary,
  DEFAULT_EDITION,
  CRITERIA,
  type ConformanceLevel,
  type Criterion,
  type Evidence,
  type Finding,
  type ReportEdition,
  type ReportKind,
  type ReportRecord,
  type ScanRecord,
  type SectionId,
  type SupportMessageRecord,
  type SupportRequestRecord,
  type SubscriptionPlan,
} from '@vpat/shared';

export interface ReportRow {
  id: string;
  domain: string;
  wcag_target: 'A' | 'AA' | 'AAA';
  edition: ReportEdition;
  scope: 'auto' | 'single' | 'sitemap';
  status: ReportRecord['status'];
  is_archived: boolean;
  archived_at: Date | null;
  product_name: string | null;
  product_version: string | null;
  vendor_name: string | null;
  contact_email: string | null;
  product_description: string | null;
  evaluation_methods: string | null;
  assistive_tech: string[] | null;
  test_environments: string[] | null;
  evaluator_name: string | null;
  evaluator_org: string | null;
  evaluation_start: Date | string | null;
  evaluation_end: Date | string | null;
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

export interface UserRow {
  id: string;
  email: string;
  plan: SubscriptionPlan;
  billing_email: string | null;
  contact_email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_status: string | null;
  internal_notes: string | null;
  is_archived: boolean;
  archived_at: Date | null;
  created_at?: Date;
}

export interface SupportRequestRow {
  id: string;
  category: SupportRequestRecord['category'];
  status: SupportRequestRecord['status'];
  subject: string;
  created_at: Date;
}

export interface SupportMessageRow {
  id: string;
  support_request_id: string;
  author_role: SupportMessageRecord['authorRole'];
  body: string;
  created_at: Date;
}

/** Normalize a DATE column (pg may hand back a Date or a 'YYYY-MM-DD' string). */
function dateOnly(v: Date | string | null): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function rowToReport(r: ReportRow): ReportRecord {
  return {
    id: r.id,
    domain: r.domain,
    wcagTarget: r.wcag_target,
    edition: r.edition ?? DEFAULT_EDITION,
    scope: r.scope,
    status: r.status,
    isArchived: r.is_archived,
    archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
    productName: r.product_name,
    productVersion: r.product_version,
    vendorName: r.vendor_name,
    contactEmail: r.contact_email,
    productDescription: r.product_description,
    evaluationMethods: r.evaluation_methods,
    assistiveTech: r.assistive_tech ?? [],
    testEnvironments: r.test_environments ?? [],
    evaluatorName: r.evaluator_name,
    evaluatorOrg: r.evaluator_org,
    evaluationStart: dateOnly(r.evaluation_start),
    evaluationEnd: dateOnly(r.evaluation_end),
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
    finalizedAt: r.finalized_at ? r.finalized_at.toISOString() : null,
    finalizedByEmail: null,
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

export function toAccountSummary(
  user: UserRow,
  activeReports: number,
): AccountSummary {
  const activeReportLimit =
    user.plan === 'starter' ? 2 : user.plan === 'growth' ? 15 : null;
  const hasActiveSubscription =
    Boolean(user.stripe_subscription_id) &&
    ['active', 'trialing'].includes(user.subscription_status ?? '');
  return {
    plan: user.plan,
    activeReports,
    activeReportLimit,
    canUseAuthenticatedScans: user.plan !== 'starter',
    billingEmail: user.billing_email ?? user.email,
    canManageBilling: Boolean(user.stripe_customer_id),
    hasActiveSubscription,
    subscriptionStatus: user.subscription_status,
    permissions: [],
    isAdmin: false,
  };
}

export function rowToSupportRequest(r: SupportRequestRow): SupportRequestRecord {
  return {
    id: r.id,
    category: r.category,
    status: r.status,
    subject: r.subject,
    createdAt: r.created_at.toISOString(),
  };
}

export function rowToSupportMessage(r: SupportMessageRow): SupportMessageRecord {
  return {
    id: r.id,
    authorRole: r.author_role,
    body: r.body,
    createdAt: r.created_at.toISOString(),
  };
}

/** The fixed criteria set the worker drafts against (one finding row per criterion). */
export function criteriaSeed(): Criterion[] {
  return CRITERIA;
}
