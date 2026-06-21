/** Typed REST + SSE client for the backend (used only when `hasApi`). */
import type {
  CreateReportRequest,
  CreateReportResponse,
  ExportFormat,
  ExportResponse,
  Finding,
  ReportDetail,
  ScanEvent,
  StartScanRequest,
  StartScanResponse,
  UpdateFindingRequest,
} from '@vpat/shared';
import { API_URL } from '../config.js';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  createReport(body: CreateReportRequest) {
    return req<CreateReportResponse>('/api/reports', { method: 'POST', body: JSON.stringify(body) });
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
    const es = new EventSource(`${API_URL}/api/scans/${scanId}/stream`);
    es.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data) as ScanEvent);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => es.close();
  },
};
