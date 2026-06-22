/** Typed REST + SSE client for the backend (used only when `hasApi`). */
import type {
  AccountSummary,
  AdminClientDetail,
  AdminReportSummary,
  AdminOverview,
  AdminSupportRequestDetail,
  ListAdminClientsResponse,
  ListAdminReportsResponse,
  ListAdminSupportRequestsResponse,
  CheckoutSessionResponse,
  ConfirmCheckoutResponse,
  CreateCheckoutRequest,
  CreatePortalRequest,
  CreateReportRequest,
  CreateReportResponse,
  CreateSupportMessageRequest,
  CreateSupportMessageResponse,
  CreateSupportRequestRequest,
  CreateSupportRequestResponse,
  ExportFormat,
  ExportResponse,
  Finding,
  ListReportsResponse,
  ListSupportRequestsResponse,
  ReportDetail,
  ReportRecord,
  ScanEvent,
  StartScanRequest,
  StartScanResponse,
  UpdateFindingRequest,
  UpdateReportRequest,
  SupportRequestDetail,
  SupportRequestRecord,
  UpdateAdminClientRequest,
  UpdateAdminReportRequest,
  UpdateSupportRequestRequest,
} from '@vpat/shared';
import { API_URL } from '../config.js';

let accessTokenProvider: (() => Promise<string | null>) | null = null;
let userEmailProvider: (() => string | null) | null = null;

export function setAccessTokenProvider(provider: (() => Promise<string | null>) | null) {
  accessTokenProvider = provider;
}

export function setUserEmailProvider(provider: (() => string | null) | null) {
  userEmailProvider = provider;
}

async function authHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (accessTokenProvider) {
    const token = await accessTokenProvider();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  if (userEmailProvider) {
    const email = userEmailProvider();
    if (email) headers.set('X-User-Email', email);
  }
  return headers;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: await authHeaders(init?.headers),
    ...init,
  });
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${body}`.trim());
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const body = await res.text();
    throw new Error(
      `${init?.method ?? 'GET'} ${path} expected JSON but got ${contentType || 'unknown content-type'} from ${res.url}: ${body.slice(0, 160)}`.trim(),
    );
  }
  return (await res.json()) as T;
}

export const api = {
  getAccount() {
    return req<AccountSummary>('/api/account');
  },
  createCheckout(body: CreateCheckoutRequest) {
    return req<CheckoutSessionResponse>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  confirmCheckout(sessionId: string) {
    return req<ConfirmCheckoutResponse>(`/api/billing/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`);
  },
  createPortal(body: CreatePortalRequest = {}) {
    return req<CheckoutSessionResponse>('/api/billing/portal', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  createReport(body: CreateReportRequest) {
    return req<CreateReportResponse>('/api/reports', { method: 'POST', body: JSON.stringify(body) });
  },
  listReports() {
    return req<ListReportsResponse>('/api/reports');
  },
  listSupportRequests() {
    return req<ListSupportRequestsResponse>('/api/support-requests');
  },
  getAdminOverview() {
    return req<AdminOverview>('/api/admin/overview');
  },
  listAdminClients() {
    return req<ListAdminClientsResponse>('/api/admin/clients');
  },
  getAdminClient(clientId: string) {
    return req<AdminClientDetail>(`/api/admin/clients/${clientId}`);
  },
  updateAdminClient(clientId: string, body: UpdateAdminClientRequest) {
    return req<AdminClientDetail>(`/api/admin/clients/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  listAdminReports() {
    return req<ListAdminReportsResponse>('/api/admin/reports');
  },
  updateAdminReport(reportId: string, body: UpdateAdminReportRequest) {
    return req<AdminReportSummary>(`/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  deleteAdminReport(reportId: string) {
    return req<{ ok: boolean }>(`/api/admin/reports/${reportId}`, {
      method: 'DELETE',
    });
  },
  listAdminSupportRequests() {
    return req<ListAdminSupportRequestsResponse>('/api/admin/support-requests');
  },
  getAdminSupportRequest(requestId: string) {
    return req<AdminSupportRequestDetail>(`/api/admin/support-requests/${requestId}`);
  },
  getSupportRequest(requestId: string) {
    return req<SupportRequestDetail>(`/api/support-requests/${requestId}`);
  },
  createSupportRequest(body: CreateSupportRequestRequest) {
    return req<CreateSupportRequestResponse>('/api/support-requests', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  createSupportMessage(requestId: string, body: CreateSupportMessageRequest) {
    return req<CreateSupportMessageResponse>(`/api/support-requests/${requestId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  createAdminSupportMessage(requestId: string, body: CreateSupportMessageRequest) {
    return req<CreateSupportMessageResponse>(`/api/admin/support-requests/${requestId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  updateAdminSupportRequest(requestId: string, body: UpdateSupportRequestRequest) {
    return req<SupportRequestRecord>(`/api/admin/support-requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  startScan(reportId: string, body: StartScanRequest) {
    return req<StartScanResponse>(`/api/reports/${reportId}/scan`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getReport(reportId: string) {
    return req<ReportDetail>(`/api/reports/${reportId}`);
  },
  updateReport(reportId: string, body: UpdateReportRequest) {
    return req<ReportRecord>(`/api/reports/${reportId}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  updateFinding(findingId: string, body: UpdateFindingRequest) {
    return req<Finding>(`/api/findings/${findingId}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  approveFinding(findingId: string) {
    return req<{ ok: boolean }>(`/api/findings/${findingId}/approve`, { method: 'POST' });
  },
  approveAll(reportId: string) {
    return req<{ ok: boolean }>(`/api/reports/${reportId}/approve-all`, { method: 'POST' });
  },
  exportReport(reportId: string, format: ExportFormat) {
    return req<ExportResponse>(`/api/reports/${reportId}/export`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    });
  },
  /** Subscribe to the scan/draft event stream. Returns an unsubscribe fn. */
  streamScan(scanId: string, onEvent: (e: ScanEvent) => void): () => void {
    const controller = new AbortController();

    void (async () => {
      const res = await fetch(`${API_URL}/api/scans/${scanId}/stream`, {
        headers: await authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`SSE ${res.status}`);
      if (!res.body) throw new Error('SSE response has no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLines = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim());
          if (!dataLines.length) continue;
          try {
            onEvent(JSON.parse(dataLines.join('\n')) as ScanEvent);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    })().catch((err) => {
      if (!controller.signal.aborted) console.error('streamScan failed', err);
    });

    return () => controller.abort();
  },
};
