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
  ReportEdition,
  SubscriptionPlan,
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
  edition: ReportEdition;
  scope: CrawlScope;
  status: ReportStatus;
  isArchived: boolean;
  archivedAt: string | null;
  productName: string | null;
  productVersion: string | null;
  vendorName: string | null;
  contactEmail: string | null;
  productDescription: string | null;
  evaluationMethods: string | null;
  assistiveTech: string[];
  testEnvironments: string[];
  evaluatorName: string | null;
  evaluatorOrg: string | null;
  evaluationStart: string | null;
  evaluationEnd: string | null;
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

/** Authenticated user's current plan entitlements + usage. */
export interface AccountSummary {
  plan: SubscriptionPlan;
  activeReports: number;
  activeReportLimit: number | null;
  canUseAuthenticatedScans: boolean;
  billingEmail: string | null;
  canManageBilling: boolean;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  permissions: string[];
  isAdmin: boolean;
}

export type SupportRequestCategory = 'billing' | 'report' | 'technical' | 'general';
export type SupportRequestStatus = 'open' | 'pending' | 'resolved' | 'closed';

export interface SupportRequestRecord {
  id: string;
  category: SupportRequestCategory;
  status: SupportRequestStatus;
  subject: string;
  createdAt: string;
}

export interface SupportMessageRecord {
  id: string;
  authorRole: 'customer' | 'support';
  body: string;
  createdAt: string;
}

export interface SupportRequestDetail {
  request: SupportRequestRecord;
  messages: SupportMessageRecord[];
}

export interface AdminOverview {
  totalClients: number;
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  activeReports: number;
  openSupportRequests: number;
}

export interface AdminClientSummary {
  id: string;
  email: string;
  billingEmail: string | null;
  contactEmail: string | null;
  plan: SubscriptionPlan;
  subscriptionStatus: string | null;
  hasActiveSubscription: boolean;
  reportCount: number;
  openSupportRequests: number;
  createdAt: string;
  lastActivityAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  internalNotes: string | null;
  isArchived: boolean;
  archivedAt: string | null;
}

export interface AdminReportSummary {
  report: ReportRecord;
  clientId: string | null;
  clientEmail: string | null;
  latestScanState: ScanState | null;
  latestScanStartedAt: string | null;
  latestScanFinishedAt: string | null;
}

export interface AdminSupportRequestSummary {
  request: SupportRequestRecord;
  clientId: string;
  clientEmail: string;
  billingEmail: string | null;
  plan: SubscriptionPlan;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface AuditEventRecord {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  subject: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminClientDetail {
  client: AdminClientSummary;
  reports: AdminReportSummary[];
  supportRequests: AdminSupportRequestSummary[];
  auditEvents: AuditEventRecord[];
}

export interface AdminSupportRequestDetail {
  client: AdminClientSummary;
  request: SupportRequestRecord;
  messages: SupportMessageRecord[];
  auditEvents: AuditEventRecord[];
}

/* ---------- requests / responses ---------- */

export interface CreateReportRequest {
  domain: string;
  wcagTarget: WcagTarget;
  edition: ReportEdition;
  scope: CrawlScope;
}
export interface CreateReportResponse {
  reportId: string;
}

export interface ListReportsResponse {
  reports: ReportRecord[];
}

export interface CreateSupportRequestRequest {
  category: SupportRequestCategory;
  subject: string;
  message: string;
}

export interface CreateSupportRequestResponse {
  request: SupportRequestRecord;
}

export interface ListSupportRequestsResponse {
  requests: SupportRequestRecord[];
}

export interface CreateSupportMessageRequest {
  body: string;
}

export interface CreateSupportMessageResponse {
  message: SupportMessageRecord;
}

export interface UpdateSupportRequestRequest {
  status: SupportRequestStatus;
}

export interface ListAdminClientsResponse {
  clients: AdminClientSummary[];
}

export interface ListAdminReportsResponse {
  reports: AdminReportSummary[];
}

export interface ListAdminSupportRequestsResponse {
  requests: AdminSupportRequestSummary[];
}

export interface UpdateAdminClientRequest {
  billingEmail?: string | null;
  contactEmail?: string | null;
  internalNotes?: string | null;
  isArchived?: boolean;
}

export interface UpdateAdminReportRequest {
  isArchived?: boolean;
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

/** A page the crawl discovered (for the manual test-page list). */
export interface PageInfo {
  url: string;
  title: string;
  isAuth: boolean;
}

export interface ReportDetail {
  report: ReportRecord;
  scan: ScanRecord | null;
  findings: Finding[];
  auto: AutoRow[];
  pages: PageInfo[];
}

export interface UpdateFindingRequest {
  status?: ConformanceLevel;
  remarks?: string;
}

/** Patch the report's publication metadata + attestation (the Details step). */
export type UpdateReportRequest = Partial<import('./types.js').ReportMeta>;

export type ExportFormat = 'pdf' | 'docx' | 'vpat';
export interface ExportRequest {
  format: ExportFormat;
  variant?: 'draft' | 'approved';
}
export interface ExportResponse {
  url: string;
  filename: string;
}

export interface FinalizeReportResponse {
  report: ReportRecord;
}

export type SelfServePlan = Exclude<SubscriptionPlan, 'enterprise'>;

export interface CreateCheckoutRequest {
  plan: SelfServePlan;
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface ConfirmCheckoutResponse {
  account: AccountSummary;
}

export interface CreatePortalRequest {
  returnPath?: string;
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
  edition: ReportEdition;
  scope: CrawlScope;
  authMode: AuthMode;
  /** Secrets Manager id holding the Step-2 credentials, when authMode = 'auth'. */
  authSecretId?: string;
}
