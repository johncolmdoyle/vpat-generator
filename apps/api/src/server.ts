import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
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
  AdminReportSummary,
  AdminClientDetail,
  AdminOverview,
  AdminSupportRequestDetail,
  CreateSupportMessageRequest,
  CreateSupportMessageResponse,
  UpdateAdminClientRequest,
  UpdateAdminReportRequest,
  UpdateSupportRequestRequest,
  CreateCheckoutRequest,
  CreatePortalRequest,
  CreateReportRequest,
  CreateSupportRequestRequest,
  ExportRequest,
  ListAdminClientsResponse,
  ListAdminReportsResponse,
  ListAdminSupportRequestsResponse,
  ListSupportRequestsResponse,
  SupportRequestRecord,
  SupportRequestDetail,
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

const ADMIN_PERMISSIONS = ['read:admin', 'read:clients', 'read:reports', 'read:support', 'read:audit', 'write:support'];
const SUPPORT_WRITE_PERMISSIONS = ['write:support', 'read:admin'];

function hasAnyPermission(permissions: string[], allowed: string[]) {
  return permissions.includes('admin:all') || allowed.some((permission) => permissions.includes(permission));
}

function applyAdminEntitlements(account: import('@vpat/shared').AccountSummary, permissions: string[]) {
  const isAdmin = hasAnyPermission(permissions, ADMIN_PERMISSIONS);
  if (!isAdmin) {
    return {
      ...account,
      permissions,
      isAdmin: false,
    };
  }
  return {
    ...account,
    plan: 'enterprise' as const,
    activeReportLimit: null,
    canUseAuthenticatedScans: true,
    canManageBilling: false,
    hasActiveSubscription: true,
    subscriptionStatus: 'admin_override',
    permissions,
    isAdmin: true,
  };
}

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
      permissions: claims.permissions,
    };
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/api/account', async (req, reply) => {
    const account = await store.getAccountSummary(req.currentUser!.userId);
    if (!account) return reply.code(404).send({ error: 'account not found' });
    return applyAdminEntitlements(account, req.currentUser!.permissions);
  });

  async function requireActiveSubscription(userId: string, reply: FastifyReply, permissions: string[] = []) {
    const account = await store.getAccountSummary(userId);
    if (!account) {
      await reply.code(404).send({ error: 'account not found' });
      return null;
    }
    const effectiveAccount = applyAdminEntitlements(account, permissions);
    if (effectiveAccount.isAdmin) return effectiveAccount;
    if (!account.hasActiveSubscription) {
      const message =
        account.subscriptionStatus === 'past_due' || account.subscriptionStatus === 'unpaid'
          ? 'billing issue: update your payment method in billing before creating or editing reports'
          : 'active subscription required before creating or editing reports';
      await reply.code(403).send({ error: message });
      return null;
    }
    return effectiveAccount;
  }

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply, allowed = ADMIN_PERMISSIONS) {
    if (!hasAnyPermission(req.currentUser!.permissions, allowed)) {
      await reply.code(403).send({ error: 'admin permission required' });
      return false;
    }
    return true;
  }

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
      const account = await confirmCheckoutSession(req.currentUser!.userId, req.query.session_id);
      return {
        account: applyAdminEntitlements(account, req.currentUser!.permissions),
      };
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
    const { domain, wcagTarget, edition, scope } = req.body;
    if (!domain) return reply.code(400).send({ error: 'domain required' });
    const account = await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions);
    if (!account) return;
    if (account.activeReportLimit !== null && account.activeReports >= account.activeReportLimit) {
      return reply
        .code(403)
        .send({ error: `plan limit reached: ${account.activeReportLimit} active reports on ${account.plan}` });
    }
    const reportId = await store.createReport(req.currentUser!.userId, domain, wcagTarget ?? 'AA', edition ?? 'INT', scope ?? 'auto');
    await store.recordAuditEvent({
      actorUserId: req.currentUser!.userId,
      actorEmail: req.currentUser!.email,
      action: 'report.created',
      targetType: 'report',
      targetId: reportId,
      subject: `Created report for ${domain}`,
      metadata: { domain, wcagTarget: wcagTarget ?? 'AA', edition: edition ?? 'INT', scope: scope ?? 'auto' },
    });
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
      const account = await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions);
      if (!account) return;
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
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'scan.started',
        targetType: 'report',
        targetId: reportRow.id,
        subject: `Started ${authMode} scan for ${reportRow.domain}`,
        metadata: { scanId, authMode, scope: reportRow.scope },
      });

      const job: ScanJobMessage = {
        scanId,
        reportId: reportRow.id,
        domain: reportRow.domain,
        edition: reportRow.edition,
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
      if (!(await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions))) return;
      await store.updateReport(req.params.id, req.body ?? {});
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'report.updated',
        targetType: 'report',
        targetId: req.params.id,
        subject: 'Updated report metadata',
        metadata: req.body ?? {},
      });
      const detail = await store.getReportDetail(req.params.id, req.currentUser!.userId);
      return detail!.report;
    },
  );

  app.post<{ Params: { id: string } }>('/api/reports/:id/approve-all', async (req, reply) => {
    if (!(await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions))) return;
    await store.approveAll(req.currentUser!.userId, req.params.id);
    await store.recordAuditEvent({
      actorUserId: req.currentUser!.userId,
      actorEmail: req.currentUser!.email,
      action: 'report.approved_all',
      targetType: 'report',
      targetId: req.params.id,
      subject: 'Approved all report findings',
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: ExportRequest }>(
    '/api/reports/:id/export',
    async (req, reply) => {
      const detail = await store.getReportDetail(req.params.id, req.currentUser!.userId);
      if (!detail) return reply.code(404).send({ error: 'report not found' });
      if (!(await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions))) return;
      const format = req.body?.format ?? 'pdf';

      const artifact = await buildExport(format, detail);
      const key = `exports/${req.params.id}/${artifact.filename}`;
      await s3Put(key, artifact.buffer, artifact.contentType);
      await store.recordExport(req.params.id, format, key, artifact.filename);
      await store.setReportStatus(req.params.id, 'final');
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'report.exported',
        targetType: 'report',
        targetId: req.params.id,
        subject: `Exported report as ${format}`,
        metadata: { format, filename: artifact.filename },
      });
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
      if (!(await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions))) return;
      const updated = await store.updateFinding(req.currentUser!.userId, req.params.id, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: 'not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'finding.updated',
        targetType: 'finding',
        targetId: req.params.id,
        subject: `Updated finding ${updated.id}`,
        metadata: (req.body ?? {}) as Record<string, unknown>,
      });
      return updated;
    },
  );

  app.post<{ Params: { id: string } }>('/api/findings/:id/approve', async (req, reply) => {
    if (!(await requireActiveSubscription(req.currentUser!.userId, reply, req.currentUser!.permissions))) return;
    await store.approveFinding(req.currentUser!.userId, req.params.id);
    await store.recordAuditEvent({
      actorUserId: req.currentUser!.userId,
      actorEmail: req.currentUser!.email,
      action: 'finding.approved',
      targetType: 'finding',
      targetId: req.params.id,
      subject: `Approved finding ${req.params.id}`,
    });
    return { ok: true };
  });

  app.get('/api/support-requests', async (req): Promise<ListSupportRequestsResponse> => {
    return { requests: await store.listSupportRequests(req.currentUser!.userId) };
  });

  app.get<{ Params: { id: string } }>('/api/support-requests/:id', async (req, reply): Promise<SupportRequestDetail | void> => {
    const detail = await store.getSupportRequestDetail(req.currentUser!.userId, req.params.id);
    if (!detail) return reply.code(404).send({ error: 'support request not found' });
    return detail;
  });

  app.post<{ Body: CreateSupportRequestRequest }>(
    '/api/support-requests',
    async (req, reply) => {
      const category = req.body?.category;
      const subject = req.body?.subject?.trim() ?? '';
      const message = req.body?.message?.trim() ?? '';
      if (!category || !['billing', 'report', 'technical', 'general'].includes(category)) {
        return reply.code(400).send({ error: 'valid support category required' });
      }
      if (!subject) return reply.code(400).send({ error: 'subject required' });
      if (!message) return reply.code(400).send({ error: 'message required' });
      const request = await store.createSupportRequest(req.currentUser!.userId, category, subject, message);
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'support.created',
        targetType: 'support_request',
        targetId: request.id,
        subject: `Created ${category} support request`,
        metadata: { category, subject },
      });
      return { request };
    },
  );

  app.post<{ Params: { id: string }; Body: CreateSupportMessageRequest }>(
    '/api/support-requests/:id/messages',
    async (req, reply): Promise<CreateSupportMessageResponse | void> => {
      const body = req.body?.body?.trim() ?? '';
      if (!body) return reply.code(400).send({ error: 'message body required' });
      const message = await store.addSupportRequestMessage(req.currentUser!.userId, req.params.id, body);
      if (!message) return reply.code(404).send({ error: 'support request not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'support.customer_replied',
        targetType: 'support_request',
        targetId: req.params.id,
        subject: 'Customer added a support reply',
      });
      return { message };
    },
  );

  app.get('/api/admin/overview', async (req, reply): Promise<AdminOverview | void> => {
    if (!(await requireAdmin(req, reply))) return;
    return store.getAdminOverview();
  });

  app.get('/api/admin/clients', async (req, reply): Promise<ListAdminClientsResponse | void> => {
    if (!(await requireAdmin(req, reply))) return;
    return { clients: await store.listAdminClients() };
  });

  app.get<{ Params: { id: string } }>('/api/admin/clients/:id', async (req, reply): Promise<AdminClientDetail | void> => {
    if (!(await requireAdmin(req, reply))) return;
    const detail = await store.getAdminClientDetail(req.params.id);
    if (!detail) return reply.code(404).send({ error: 'client not found' });
    return detail;
  });

  app.patch<{ Params: { id: string }; Body: UpdateAdminClientRequest }>(
    '/api/admin/clients/:id',
    async (req, reply): Promise<AdminClientDetail | void> => {
      if (!(await requireAdmin(req, reply))) return;
      const body = req.body ?? {};
      const updated = await store.updateAdminClient(req.params.id, {
        billingEmail: body.billingEmail === undefined ? undefined : body.billingEmail?.trim() || null,
        contactEmail: body.contactEmail === undefined ? undefined : body.contactEmail?.trim() || null,
        internalNotes: body.internalNotes === undefined ? undefined : body.internalNotes?.trim() || null,
        isArchived: body.isArchived,
      });
      if (!updated) return reply.code(404).send({ error: 'client not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'client.updated',
        targetType: 'user',
        targetId: req.params.id,
        subject: body.isArchived !== undefined ? (body.isArchived ? 'Archived client' : 'Unarchived client') : 'Updated client record',
        metadata: body as Record<string, unknown>,
      });
      return updated;
    },
  );

  app.get('/api/admin/reports', async (req, reply): Promise<ListAdminReportsResponse | void> => {
    if (!(await requireAdmin(req, reply))) return;
    return { reports: await store.listAdminReports() };
  });

  app.patch<{ Params: { id: string }; Body: UpdateAdminReportRequest }>(
    '/api/admin/reports/:id',
    async (req, reply): Promise<AdminReportSummary | void> => {
      if (!(await requireAdmin(req, reply))) return;
      const updated = await store.updateAdminReport(req.params.id, { isArchived: req.body?.isArchived });
      if (!updated) return reply.code(404).send({ error: 'report not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'report.admin_updated',
        targetType: 'report',
        targetId: req.params.id,
        subject: req.body?.isArchived ? 'Archived report' : 'Restored report',
        metadata: (req.body ?? {}) as Record<string, unknown>,
      });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/reports/:id',
    async (req, reply): Promise<{ ok: boolean } | void> => {
      if (!(await requireAdmin(req, reply))) return;
      const deleted = await store.deleteAdminReport(req.params.id);
      if (!deleted) return reply.code(404).send({ error: 'report not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'report.admin_deleted',
        targetType: 'report',
        targetId: req.params.id,
        subject: 'Deleted report',
      });
      return { ok: true };
    },
  );

  app.get('/api/admin/support-requests', async (req, reply): Promise<ListAdminSupportRequestsResponse | void> => {
    if (!(await requireAdmin(req, reply))) return;
    return { requests: await store.listAdminSupportRequests() };
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/support-requests/:id',
    async (req, reply): Promise<AdminSupportRequestDetail | void> => {
      if (!(await requireAdmin(req, reply))) return;
      const detail = await store.getAdminSupportRequestDetail(req.params.id);
      if (!detail) return reply.code(404).send({ error: 'support request not found' });
      return detail;
    },
  );

  app.post<{ Params: { id: string }; Body: CreateSupportMessageRequest }>(
    '/api/admin/support-requests/:id/messages',
    async (req, reply): Promise<CreateSupportMessageResponse | void> => {
      if (!(await requireAdmin(req, reply, SUPPORT_WRITE_PERMISSIONS))) return;
      const body = req.body?.body?.trim() ?? '';
      if (!body) return reply.code(400).send({ error: 'message body required' });
      const message = await store.addAdminSupportRequestMessage(req.params.id, body);
      if (!message) return reply.code(404).send({ error: 'support request not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'support.admin_replied',
        targetType: 'support_request',
        targetId: req.params.id,
        subject: 'Admin replied to support request',
      });
      return { message };
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateSupportRequestRequest }>(
    '/api/admin/support-requests/:id',
    async (req, reply): Promise<SupportRequestRecord | void> => {
      if (!(await requireAdmin(req, reply, SUPPORT_WRITE_PERMISSIONS))) return;
      const status = req.body?.status;
      if (!status || !['open', 'pending', 'resolved', 'closed'].includes(status)) {
        return reply.code(400).send({ error: 'valid support status required' });
      }
      const updated = await store.updateSupportRequestStatus(req.params.id, status);
      if (!updated) return reply.code(404).send({ error: 'support request not found' });
      await store.recordAuditEvent({
        actorUserId: req.currentUser!.userId,
        actorEmail: req.currentUser!.email,
        action: 'support.status_changed',
        targetType: 'support_request',
        targetId: req.params.id,
        subject: `Changed support status to ${status}`,
        metadata: { status },
      });
      return updated;
    },
  );

  return app;
}

export { env };
