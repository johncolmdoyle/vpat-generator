import Fastify from 'fastify';
import cors from '@fastify/cors';
import rawBody from 'fastify-raw-body';
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
  CreateCheckoutRequest,
  CreatePortalRequest,
  CreateReportRequest,
  ExportRequest,
  ScanJobMessage,
  StartScanRequest,
  UpdateFindingRequest,
  UpdateReportRequest,
} from '@vpat/shared';
import * as store from './store.js';
import {
  billingEnabled,
  confirmCheckoutSession,
  constructWebhookEvent,
  createCheckoutUrl,
  createPortalUrl,
  isSelfServePlan,
  syncSubscriptionToUser,
  clearSubscriptionForCustomer,
} from './billing.js';
import { buildExport } from './export.js';
import { validateAccessToken } from './auth.js';

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  void app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });
  app.decorateRequest('currentUser', null);

  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/stripe/')) return;
    if (!req.url.startsWith('/api/')) return;
    const claims = await validateAccessToken(req, reply);
    if (!claims) return;
    req.currentUser = {
      auth0Sub: claims.sub,
      email: claims.email,
      userId: await store.findOrCreateUser(claims.sub, claims.email, claims.planHint),
    };
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/api/account', async (req, reply) => {
    const account = await store.getAccountSummary(req.currentUser!.userId);
    if (!account) return reply.code(404).send({ error: 'account not found' });
    return account;
  });

  app.post<{ Body: CreateCheckoutRequest }>(
    '/api/billing/checkout',
    async (req, reply) => {
      if (!billingEnabled()) return reply.code(503).send({ error: 'billing is not configured' });
      const user = await store.getUserRow(req.currentUser!.userId);
      if (!user) return reply.code(404).send({ error: 'account not found' });
      if (!isSelfServePlan(req.body.plan)) return reply.code(400).send({ error: 'unsupported plan' });
      return { url: await createCheckoutUrl(user, req.body.plan) };
    },
  );

  app.get<{ Querystring: { session_id?: string } }>(
    '/api/billing/checkout/confirm',
    async (req, reply) => {
      if (!billingEnabled()) return reply.code(503).send({ error: 'billing is not configured' });
      if (!req.query.session_id) return reply.code(400).send({ error: 'session_id required' });
      return { account: await confirmCheckoutSession(req.currentUser!.userId, req.query.session_id) };
    },
  );

  app.post<{ Body: CreatePortalRequest }>(
    '/api/billing/portal',
    async (req, reply) => {
      if (!billingEnabled()) return reply.code(503).send({ error: 'billing is not configured' });
      const user = await store.getUserRow(req.currentUser!.userId);
      if (!user) return reply.code(404).send({ error: 'account not found' });
      return { url: await createPortalUrl(user, req.body?.returnPath ?? '/') };
    },
  );

  app.post('/stripe/webhook', { config: { rawBody: true } }, async (req, reply) => {
    if (!env.stripe.webhookSecret) return reply.code(503).send({ error: 'stripe webhook not configured' });
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !req.rawBody) {
      return reply.code(400).send({ error: 'missing stripe signature' });
    }

    let event;
    try {
      event = await constructWebhookEvent(String(req.rawBody), signature);
    } catch (err) {
      app.log.warn({ err }, 'invalid stripe webhook');
      return reply.code(400).send({ error: 'invalid stripe webhook' });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (!session.client_reference_id || typeof session.subscription !== 'string') break;
          const subscription = await confirmCheckoutSession(session.client_reference_id, session.id);
          app.log.info({ plan: subscription.plan }, 'stripe checkout confirmed');
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          const user = await store.getUserByStripeCustomerId(String(subscription.customer));
          if (user) await syncSubscriptionToUser(user.id, subscription);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await clearSubscriptionForCustomer(String(subscription.customer), subscription.status);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      app.log.error({ err, eventType: event.type }, 'stripe webhook handling failed');
      return reply.code(500).send({ error: 'webhook handling failed' });
    }

    return { received: true };
  });

  /* ---------- reports ---------- */

  app.post<{ Body: CreateReportRequest }>('/api/reports', async (req, reply) => {
    const { domain, wcagTarget, scope } = req.body;
    if (!domain) return reply.code(400).send({ error: 'domain required' });
    const account = await store.getAccountSummary(req.currentUser!.userId);
    if (!account) return reply.code(404).send({ error: 'account not found' });
    if (account.activeReportLimit !== null && account.activeReports >= account.activeReportLimit) {
      return reply
        .code(403)
        .send({ error: `plan limit reached: ${account.activeReportLimit} active reports on ${account.plan}` });
    }
    const reportId = await store.createReport(req.currentUser!.userId, domain, wcagTarget ?? 'AA', scope ?? 'auto');
    return { reportId };
  });

  app.get('/api/reports', async (req) => {
    const rows = await store.listReportRows(req.currentUser!.userId);
    return { reports: rows.map(rowToReport) };
  });

  app.get<{ Params: { id: string } }>('/api/reports/:id', async (req, reply) => {
    const detail = await store.getReportDetail(req.params.id, req.currentUser!.userId);
    if (!detail) return reply.code(404).send({ error: 'not found' });
    return detail;
  });

  app.post<{ Params: { id: string }; Body: StartScanRequest }>(
    '/api/reports/:id/scan',
    async (req, reply) => {
      const reportRow = await store.getReportRow(req.params.id, req.currentUser!.userId);
      if (!reportRow) return reply.code(404).send({ error: 'report not found' });

      const body = req.body ?? ({ authMode: 'public' } as StartScanRequest);
      const authMode = body.authMode === 'auth' ? 'auth' : 'public';
      const account = await store.getAccountSummary(req.currentUser!.userId);
      if (!account) return reply.code(404).send({ error: 'account not found' });
      if (authMode === 'auth' && !account.canUseAuthenticatedScans) {
        return reply.code(403).send({ error: `authenticated scans require growth or enterprise plan` });
      }
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

  app.patch<{ Params: { id: string }; Body: UpdateReportRequest }>(
    '/api/reports/:id',
    async (req, reply) => {
      const reportRow = await store.getReportRow(req.params.id, req.currentUser!.userId);
      if (!reportRow) return reply.code(404).send({ error: 'report not found' });
      await store.updateReport(req.params.id, req.body ?? {});
      const detail = await store.getReportDetail(req.params.id, req.currentUser!.userId);
      return detail!.report;
    },
  );

  app.post<{ Params: { id: string } }>('/api/reports/:id/approve-all', async (req) => {
    await store.approveAll(req.currentUser!.userId, req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: ExportRequest }>(
    '/api/reports/:id/export',
    async (req, reply) => {
      const detail = await store.getReportDetail(req.params.id, req.currentUser!.userId);
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
    const row = await store.getScanRow(req.params.id, req.currentUser!.userId);
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
        const events = await store.getScanEvents(req.currentUser!.userId, scanId, lastSeq);
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
      const updated = await store.updateFinding(req.currentUser!.userId, req.params.id, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    },
  );

  app.post<{ Params: { id: string } }>('/api/findings/:id/approve', async (req) => {
    await store.approveFinding(req.currentUser!.userId, req.params.id);
    return { ok: true };
  });

  return app;
}

export { env };
