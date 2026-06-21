import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  env,
  s3Put,
  s3PresignGet,
  sqsSend,
  storeSecret,
  rowToReport,
  rowToScan,
} from '@vpat/backend';
import type {
  CreateReportRequest,
  ExportRequest,
  ScanJobMessage,
  StartScanRequest,
  UpdateFindingRequest,
} from '@vpat/shared';
import * as store from './store.js';
import { buildExport } from './export.js';

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

  /* ---------- reports ---------- */

  app.post<{ Body: CreateReportRequest }>('/api/reports', async (req, reply) => {
    const { domain, wcagTarget, scope } = req.body;
    if (!domain) return reply.code(400).send({ error: 'domain required' });
    const reportId = await store.createReport(domain, wcagTarget ?? 'AA', scope ?? 'auto');
    return { reportId };
  });

  app.get('/api/reports', async () => {
    const rows = await store.listReportRows();
    return { reports: rows.map(rowToReport) };
  });

  app.get<{ Params: { id: string } }>('/api/reports/:id', async (req, reply) => {
    const detail = await store.getReportDetail(req.params.id);
    if (!detail) return reply.code(404).send({ error: 'not found' });
    return detail;
  });

  app.post<{ Params: { id: string }; Body: StartScanRequest }>(
    '/api/reports/:id/scan',
    async (req, reply) => {
      const reportRow = await store.getReportRow(req.params.id);
      if (!reportRow) return reply.code(404).send({ error: 'report not found' });

      const body = req.body ?? ({ authMode: 'public' } as StartScanRequest);
      const authMode = body.authMode === 'auth' ? 'auth' : 'public';
      const scanId = await store.createScan(reportRow.id, reportRow.scope, authMode);

      // Step-2 credentials are radioactive: straight to Secrets Manager, never the DB.
      let authSecretId: string | undefined;
      if (authMode === 'auth' && body.user && body.pass) {
        authSecretId = await storeSecret(`vpat/scan-creds/${scanId}`, {
          user: body.user,
          pass: body.pass,
          loginUrl: body.loginUrl ?? '/login',
        });
      }

      await store.setReportStatus(reportRow.id, 'scanning');

      const job: ScanJobMessage = {
        scanId,
        reportId: reportRow.id,
        domain: reportRow.domain,
        scope: reportRow.scope,
        authMode,
        authSecretId,
      };
      await sqsSend(job);

      return { scanId };
    },
  );

  app.post<{ Params: { id: string } }>('/api/reports/:id/approve-all', async (req) => {
    await store.approveAll(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: ExportRequest }>(
    '/api/reports/:id/export',
    async (req, reply) => {
      const detail = await store.getReportDetail(req.params.id);
      if (!detail) return reply.code(404).send({ error: 'report not found' });
      const format = req.body?.format ?? 'pdf';

      const artifact = await buildExport(format, detail);
      const key = `exports/${req.params.id}/${artifact.filename}`;
      await s3Put(key, artifact.buffer, artifact.contentType);
      await store.recordExport(req.params.id, format, key, artifact.filename);
      await store.setReportStatus(req.params.id, 'final');
      const url = await s3PresignGet(key);
      return { url, filename: artifact.filename };
    },
  );

  /* ---------- scans ---------- */

  app.get<{ Params: { id: string } }>('/api/scans/:id', async (req, reply) => {
    const row = await store.getScanRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    return rowToScan(row);
  });

  // SSE: replay persisted events then tail. EventSource reconnects with Last-Event-ID.
  app.get<{ Params: { id: string } }>('/api/scans/:id/stream', (req, reply) => {
    const scanId = req.params.id;
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    raw.write('retry: 1000\n\n');

    let lastSeq = Number(req.headers['last-event-id'] ?? 0) || 0;
    let closed = false;
    raw.on('close', () => {
      closed = true;
    });

    const tick = async () => {
      if (closed) return;
      try {
        const events = await store.getScanEvents(scanId, lastSeq);
        for (const e of events) {
          lastSeq = e.seq;
          raw.write(`id: ${e.seq}\n`);
          raw.write(`data: ${JSON.stringify(e.event)}\n\n`);
        }
      } catch (err) {
        app.log.error(err);
      }
      if (!closed) setTimeout(tick, 400);
    };
    void tick();
  });

  /* ---------- findings ---------- */

  app.patch<{ Params: { id: string }; Body: UpdateFindingRequest }>(
    '/api/findings/:id',
    async (req, reply) => {
      const updated = await store.updateFinding(req.params.id, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    },
  );

  app.post<{ Params: { id: string } }>('/api/findings/:id/approve', async (req) => {
    await store.approveFinding(req.params.id);
    return { ok: true };
  });

  return app;
}

export { env };
