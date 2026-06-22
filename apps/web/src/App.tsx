/* App — wizard orchestrator: top bar, stepper, state machine.
   Runs the local mock flow by default; when `hasApi`, drives the real backend. */
import { useAuth0 } from '@auth0/auth0-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type AccountSummary,
  type AdminClientDetail,
  type AdminClientSummary,
  type AdminOverview,
  type AdminReportSummary,
  type AdminSupportRequestDetail,
  type AdminSupportRequestSummary,
  DEFAULT_EDITION,
  EDITION_META,
  PAGES,
  criteriaForEdition,
  emptyReportMeta,
  toFinding,
  type AuthMode,
  type CrawlScope,
  type Finding,
  type PageInfo,
  type ReportDetail,
  type ReportEdition,
  type ReportMeta,
  type ReportRecord,
  type SelfServePlan,
  type SupportRequestCategory,
  type SupportRequestDetail,
  type SupportRequestRecord,
  type SupportRequestStatus,
  type WcagTarget,
  type WizardForm,
} from '@vpat/shared';
import { Icons } from './ui/icons.js';
import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_DOMAIN, hasApi, hasAuth, hasPartialAuthConfig } from './config.js';
import { api, setAccessTokenProvider, setUserEmailProvider } from './api/client.js';
import { DomainScreen } from './screens/DomainScreen.js';
import { CredentialsScreen } from './screens/CredentialsScreen.js';
import { ExaminingScreen } from './screens/ExaminingScreen.js';
import { GeneratingScreen } from './screens/GeneratingScreen.js';
import { ReviewScreen } from './screens/ReviewScreen.js';
import { DetailsScreen } from './screens/DetailsScreen.js';
import { DownloadScreen } from './screens/DownloadScreen.js';

const STEPS = [
  { key: 'domain', label: 'Target' },
  { key: 'creds', label: 'Access' },
  { key: 'examine', label: 'Examine' },
  { key: 'generate', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'details', label: 'Details' },
  { key: 'report', label: 'Report' },
] as const;

const BRAND_NAME = 'AccessOps';
const BRAND_SUB = 'VPAT Builder';
const LINKEDIN_URL = 'https://www.linkedin.com/company/access-ops/';
const MARKETING_PAGES = [
  { id: 'home', label: 'Overview' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
  { id: 'about', label: 'For Startups' },
  { id: 'terms', label: 'Terms' },
] as const;
type MarketingPage = (typeof MARKETING_PAGES)[number]['id'];
type PricingTier = {
  name: string;
  price: string;
  cadence: string;
  summary: string;
  features: readonly string[];
  featured?: boolean;
};

const LANDING_PILLARS = [
  {
    icon: Icons.scan,
    title: 'Scan the real product',
    body: 'Crawl public or authenticated flows, capture evidence, and organize findings for the VPAT 2.5Rev edition your buyer or procurement process requires.',
  },
  {
    icon: Icons.sparkle,
    title: 'Draft faster with AI',
    body: 'Turn automated and manual evidence into editable draft conformance language, while preserving the human approval gate required for a serious accessibility report.',
  },
  {
    icon: Icons.doc,
    title: 'Export procurement-ready reports',
    body: 'Assemble a DRAFT ACR with product metadata, conformance tables, cross-references, and evaluator attestation for review before publication.',
  },
] as const;

const LANDING_STEPS = [
  'Point VPAT Builder at the website or product experience you want to evaluate.',
  'Run automated checks, capture supporting evidence, and draft criterion-by-criterion remarks.',
  'Review every finding, add evaluator details, and export a draft VPAT-based Accessibility Conformance Report.',
] as const;

const IMPORTANCE_POINTS = [
  'VPATs help buyers, procurement teams, and public-sector institutions understand accessibility support before purchase or renewal.',
  'A weak or inconsistent report can slow enterprise deals, create legal risk, and leave teams guessing about real accessibility gaps.',
  'VPAT Builder reduces the time spent assembling the document while keeping the expert reviewer in control of every final statement.',
] as const;

const PRICING_TIERS: readonly PricingTier[] = [
  {
    name: 'Starter',
    price: '$99',
    cadence: '/year',
    summary: 'For founders and small teams who need a lightweight, low-risk way to produce an initial draft report.',
    features: ['2 active reports', 'Public-site scans', 'Draft DOCX / PDF export', 'Email support'],
  },
  {
    name: 'Growth',
    price: '$499',
    cadence: '/year',
    summary: 'For startups selling into procurement and security reviews on a regular basis.',
    features: ['15 active reports', 'Authenticated scans', 'Team review workflow', 'Priority support'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    summary: 'For larger organizations that need scale, policy controls, and repeatable accessibility operations.',
    features: ['Unlimited workspaces', 'Custom onboarding', 'Security review support', 'Contracted SLA'],
  },
] as const;

const PENDING_CHECKOUT_STORAGE_KEY = 'accessops.pendingCheckoutPlan';
const SUPPORT_EMAIL = 'support@vpatbuilder.com';

const SUPPORT_TRACKS = [
  {
    icon: Icons.shield,
    title: 'Account and billing',
    body: 'Fix subscription issues, update the billing contact, and reopen checkout or customer portal flows without leaving the workspace.',
  },
  {
    icon: Icons.doc,
    title: 'Report workflow',
    body: 'Get help with scans, draft review, evaluator details, and exporting VPAT-based accessibility reports.',
  },
  {
    icon: Icons.sparkle,
    title: 'Product guidance',
    body: 'Understand what the platform can automate, where human review is still required, and how to prepare for buyer requests.',
  },
] as const;

const SUPPORT_FAQS = [
  {
    q: 'Why can’t I create a report yet?',
    a: 'The workspace requires an active subscription before a team can create or edit VPAT reports. If billing is still incomplete, use the billing actions in this support center first.',
  },
  {
    q: 'What should I include when I contact support?',
    a: 'Send your account email, the report domain you were working on, and the exact error message or screenshot if you have one. That helps us trace the issue much faster.',
  },
  {
    q: 'Can support help with VPAT content decisions?',
    a: 'Support can help you navigate the workflow and product behavior. Final conformance claims and evaluator attestation should still be reviewed by your accessibility lead or assessor.',
  },
] as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleString();
}

function subscriptionIssueMessage(account: AccountSummary | null | undefined): string | null {
  if (!account) return null;
  if (account.hasActiveSubscription) return null;
  if (account.subscriptionStatus === 'past_due' || account.subscriptionStatus === 'unpaid') {
    return 'Your subscription has a billing issue. Update your payment method before creating or editing VPAT reports.';
  }
  return `Your account does not have an active subscription yet. Complete billing setup before creating or editing VPAT reports.`;
}

function supportEmailHref(userLabel: string, account: AccountSummary | null, issue: string | null) {
  const subject = issue ? 'AccessOps account issue' : 'AccessOps support request';
  const lines = [
    'Hi AccessOps support,',
    '',
    'I need help with:',
    issue ?? 'Describe the issue here.',
    '',
    `Account: ${userLabel}`,
    `Plan: ${account?.plan ?? 'unknown'}`,
    '',
    'Relevant details:',
  ];
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

const FAQS = [
  {
    q: 'What does VPAT Builder actually produce?',
    a: 'It helps your team create a draft Accessibility Conformance Report based on VPAT 2.5Rev, with support for the WCAG, Revised Section 508, EN 301 549, and International editions.',
  },
  {
    q: 'Does this replace manual accessibility testing?',
    a: 'No. It accelerates evidence gathering and first-draft writing, but the final report still depends on expert review, manual testing, and evaluator attestation.',
  },
  {
    q: 'Why would a startup need this early?',
    a: 'If you sell into enterprise, education, healthcare, government, or procurement-heavy markets, accessibility documentation often becomes important long before you have a large compliance team.',
  },
  {
    q: 'Can we use it for authenticated product flows?',
    a: 'Yes. The workflow supports secured scans so teams can evaluate real customer journeys instead of only public marketing pages.',
  },
] as const;

const TERMS_SECTIONS = [
  {
    title: 'Use of the service',
    body: [
      'AccessOps provides software and related services to help teams draft accessibility documentation, organize review workflows, and manage report artifacts. You agree to use the service only for lawful business purposes and only in a way that does not interfere with the security, availability, or integrity of the platform.',
      'You are responsible for the content you submit, the systems you authorize us to scan, and the accuracy of any information your team approves for inclusion in a report. Draft outputs are decision-support materials and remain subject to your review before publication or external distribution.',
    ],
  },
  {
    title: 'Accounts and workspace access',
    body: [
      'You are responsible for maintaining the confidentiality of your account credentials and for activity that occurs under your workspace, except to the extent caused by our own unauthorized actions. You agree to notify us promptly if you believe your account or a connected system has been compromised.',
      'We may suspend or restrict access when reasonably necessary to protect the platform, comply with law, or respond to suspected abuse, fraud, or security issues.',
    ],
  },
  {
    title: 'Customer content and drafts',
    body: [
      'You retain your rights in the data, documents, evidence, screenshots, and other materials you submit to the service. You grant AccessOps the limited rights needed to host, process, transmit, back up, and display that content solely for providing and improving the service for your workspace.',
      'Because accessibility reports often require human judgment, you remain responsible for final reviewer approval, factual accuracy, and any publication or customer-facing statements derived from the platform.',
    ],
  },
  {
    title: 'Public reference and logo usage',
    body: [
      'Unless your order form, a separate written agreement, or a written notice from you says otherwise, you grant AccessOps permission to identify your company as a customer in a factual manner for marketing purposes, including use of your company name and logo on our website, customer lists, presentations, and similar promotional materials.',
      'We will not imply endorsement beyond your status as a customer, and we will stop new logo or name usage within a commercially reasonable period after receiving a written opt-out request from an authorized representative.',
    ],
  },
  {
    title: 'Fees, renewals, and cancellation',
    body: [
      'Paid subscriptions are billed in advance on the cadence presented at checkout and automatically renew unless cancelled before the renewal date. You authorize us and our payment processor to charge the applicable subscription fees, taxes, and any other amounts clearly disclosed during purchase or plan changes.',
      'Except where required by law or expressly stated otherwise, fees are non-refundable for the then-current billing period. You may cancel future renewals through the billing management experience or by contacting support.',
    ],
  },
  {
    title: 'Warranty disclaimer and liability limits',
    body: [
      'The service is provided on an “as is” and “as available” basis to the maximum extent permitted by law. We disclaim implied warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.',
      'To the maximum extent permitted by law, AccessOps will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill, or data. Our aggregate liability for claims arising out of or relating to the service will not exceed the amounts paid by you to AccessOps for the service during the twelve months before the event giving rise to the claim.',
    ],
  },
  {
    title: 'Changes and contact',
    body: [
      'We may update these Terms from time to time. If we make a material change, we will post the updated version on the site and update the effective date. Continued use of the service after the effective date of the updated Terms constitutes acceptance of the revised Terms.',
      'If you have questions about these Terms, contact support through the product support center so we can route the request to the right team.',
    ],
  },
] as const;

const STARTUP_POINTS = [
  {
    title: 'Shorten sales friction',
    body: 'When buyers ask for accessibility documentation, your team can respond with a structured draft instead of starting from a blank template under deadline pressure.',
  },
  {
    title: 'Improve product clarity',
    body: 'The review flow forces teams to tie claims to evidence, which often surfaces gaps in design systems, QA practices, and release readiness.',
  },
  {
    title: 'Build repeatable operations',
    body: 'Instead of treating every questionnaire or VPAT request like a one-off fire drill, startups can turn accessibility reporting into a repeatable operating practice.',
  },
] as const;

function initFindings(): Finding[] {
  return initFindingsForEdition(DEFAULT_EDITION);
}

function initFindingsForEdition(edition: ReportEdition): Finding[] {
  return criteriaForEdition(edition).map(toFinding);
}

export type DomainCommit = { domain: string; level: WcagTarget; edition: ReportEdition; scope: CrawlScope };
export type CredsCommit = { authMode: AuthMode; user: string; pass: string; loginUrl: string };

export function App() {
  if (hasAuth && (!hasApi || AUTH0_AUDIENCE)) return <AuthenticatedApp />;
  if (hasPartialAuthConfig) return <AuthConfigError />;
  return <WizardApp />;
}

function readPendingCheckoutPlan(): SelfServePlan | null {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
  return value === 'starter' || value === 'growth' ? value : null;
}

function writePendingCheckoutPlan(plan: SelfServePlan | null) {
  if (typeof window === 'undefined') return;
  if (plan) window.sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, plan);
  else window.sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
}

function AuthenticatedApp() {
  const { error, getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect, logout, user } = useAuth0();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [pendingCheckoutPlan, setPendingCheckoutPlan] = useState<SelfServePlan | null>(() => readPendingCheckoutPlan());
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [supportRequests, setSupportRequests] = useState<SupportRequestRecord[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [activeSupportRequest, setActiveSupportRequest] = useState<SupportRequestDetail | null>(null);
  const [supportThreadLoading, setSupportThreadLoading] = useState(false);
  const [supportThreadSubmitting, setSupportThreadSubmitting] = useState(false);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminClients, setAdminClients] = useState<AdminClientSummary[]>([]);
  const [adminReports, setAdminReports] = useState<AdminReportSummary[]>([]);
  const [adminSupportRequests, setAdminSupportRequests] = useState<AdminSupportRequestSummary[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [activeAdminClient, setActiveAdminClient] = useState<AdminClientDetail | null>(null);
  const [activeAdminSupportRequest, setActiveAdminSupportRequest] = useState<AdminSupportRequestDetail | null>(null);
  const [adminClientLoading, setAdminClientLoading] = useState(false);
  const [adminSupportLoading, setAdminSupportLoading] = useState(false);
  const [adminSupportSubmitting, setAdminSupportSubmitting] = useState(false);
  const [adminClientSaving, setAdminClientSaving] = useState(false);
  const [adminReportBusyId, setAdminReportBusyId] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [activeDetail, setActiveDetail] = useState<ReportDetail | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'wizard'>('dashboard');
  const checkoutLaunchStarted = useRef(false);

  const setPendingCheckout = (plan: SelfServePlan | null) => {
    setPendingCheckoutPlan(plan);
    writePendingCheckoutPlan(plan);
    if (!plan) checkoutLaunchStarted.current = false;
  };

  const signup = (plan: SelfServePlan = 'starter') => {
    setPendingCheckout(plan);
    void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } });
  };
  const signupStarter = () => signup('starter');
  const login = () => loginWithRedirect();
  const signout = () => {
    setPendingCheckout(null);
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const refreshAccount = () =>
    api
      .getAccount()
      .then(setAccount)
      .catch((e) => console.error('getAccount failed', e));

  const refreshReports = () => {
    setReportsLoading(true);
    setReportsError(null);
    return api
      .listReports()
      .then((res) => setReports(res.reports))
      .catch((e) => {
        console.error('listReports failed', e);
        setReportsError(e instanceof Error ? e.message : 'Could not load reports');
      })
      .finally(() => setReportsLoading(false));
  };

  const refreshSupportRequests = () => {
    setSupportLoading(true);
    setSupportError(null);
    return api
      .listSupportRequests()
      .then((res) => setSupportRequests(res.requests))
      .catch((e) => {
        console.error('listSupportRequests failed', e);
        setSupportError(e instanceof Error ? e.message : 'Could not load support requests');
      })
      .finally(() => setSupportLoading(false));
  };

  const refreshAdminData = () => {
    if (!account?.isAdmin) return Promise.resolve();
    setAdminLoading(true);
    setAdminError(null);
    return Promise.all([api.getAdminOverview(), api.listAdminClients(), api.listAdminReports(), api.listAdminSupportRequests()])
      .then(([overview, clientsRes, reportsRes, supportRes]) => {
        setAdminOverview(overview);
        setAdminClients(clientsRes.clients);
        setAdminReports(reportsRes.reports);
        setAdminSupportRequests(supportRes.requests);
      })
      .catch((e) => {
        console.error('admin data load failed', e);
        setAdminError(e instanceof Error ? e.message : 'Could not load admin console');
      })
      .finally(() => setAdminLoading(false));
  };

  const openSupportRequest = async (requestId: string) => {
    setSupportThreadLoading(true);
    setSupportError(null);
    try {
      const detail = await api.getSupportRequest(requestId);
      setActiveSupportRequest(detail);
    } catch (e) {
      console.error('getSupportRequest failed', e);
      setSupportError(e instanceof Error ? e.message : 'Could not load support request');
    } finally {
      setSupportThreadLoading(false);
    }
  };

  const openAdminClient = async (clientId: string) => {
    setAdminClientLoading(true);
    setAdminError(null);
    try {
      const detail = await api.getAdminClient(clientId);
      setActiveAdminClient(detail);
    } catch (e) {
      console.error('getAdminClient failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not load client detail');
    } finally {
      setAdminClientLoading(false);
    }
  };

  const updateAdminClient = async (
    clientId: string,
    patch: { billingEmail?: string | null; contactEmail?: string | null; internalNotes?: string | null; isArchived?: boolean },
  ) => {
    setAdminClientSaving(true);
    setAdminError(null);
    try {
      const detail = await api.updateAdminClient(clientId, patch);
      setActiveAdminClient(detail);
      setAdminClients((current) => current.map((client) => (client.id === clientId ? detail.client : client)));
      setAdminSupportRequests((current) =>
        current.map((request) =>
          request.clientId === clientId
            ? {
                ...request,
                clientEmail: detail.client.email,
                billingEmail: detail.client.billingEmail,
              }
            : request,
        ),
      );
      await refreshAdminData();
    } catch (e) {
      console.error('updateAdminClient failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not update client');
      throw e;
    } finally {
      setAdminClientSaving(false);
    }
  };

  const openAdminSupportRequest = async (requestId: string) => {
    setAdminSupportLoading(true);
    setAdminError(null);
    try {
      const detail = await api.getAdminSupportRequest(requestId);
      setActiveAdminSupportRequest(detail);
    } catch (e) {
      console.error('getAdminSupportRequest failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not load support ticket');
    } finally {
      setAdminSupportLoading(false);
    }
  };

  const updateAdminReport = async (reportId: string, patch: { isArchived?: boolean }) => {
    setAdminReportBusyId(reportId);
    setAdminError(null);
    try {
      const updated = await api.updateAdminReport(reportId, patch);
      setAdminReports((current) => current.map((item) => (item.report.id === reportId ? updated : item)));
      setActiveAdminClient((current) =>
        current
          ? {
              ...current,
              reports: current.reports.map((item) => (item.report.id === reportId ? updated : item)),
            }
          : current,
      );
      await refreshAdminData();
    } catch (e) {
      console.error('updateAdminReport failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not update report');
      throw e;
    } finally {
      setAdminReportBusyId(null);
    }
  };

  const deleteAdminReport = async (reportId: string) => {
    setAdminReportBusyId(reportId);
    setAdminError(null);
    try {
      await api.deleteAdminReport(reportId);
      setAdminReports((current) => current.filter((item) => item.report.id !== reportId));
      setActiveAdminClient((current) =>
        current
          ? {
              ...current,
              reports: current.reports.filter((item) => item.report.id !== reportId),
            }
          : current,
      );
      await refreshAdminData();
    } catch (e) {
      console.error('deleteAdminReport failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not delete report');
      throw e;
    } finally {
      setAdminReportBusyId(null);
    }
  };

  const redirectToUrl = (url: string) => {
    window.location.assign(url);
  };

  const startCheckout = async (plan: SelfServePlan) => {
    setBillingBusy(true);
    try {
      const { url } = await api.createCheckout({ plan });
      redirectToUrl(url);
    } catch (e) {
      console.error('createCheckout failed', e);
      setBillingNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not open Stripe checkout.' });
      setBillingBusy(false);
    }
  };

  const openPortal = async () => {
    setBillingBusy(true);
    try {
      const { url } = await api.createPortal({ returnPath: '/' });
      redirectToUrl(url);
    } catch (e) {
      console.error('createPortal failed', e);
      setBillingNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not open billing portal.' });
      setBillingBusy(false);
    }
  };

  const openUpgradeFlow = async () => {
    if (account?.canManageBilling) {
      await openPortal();
      return;
    }
    await startCheckout('growth');
  };

  useEffect(() => {
    if (!hasApi) return;
    setAccessTokenProvider(() =>
      getAccessTokenSilently({
        authorizationParams: {
          audience: AUTH0_AUDIENCE,
        },
      }),
    );
    return () => setAccessTokenProvider(null);
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!hasApi) return;
    setUserEmailProvider(() => user?.email ?? null);
    return () => setUserEmailProvider(null);
  }, [user]);

  useEffect(() => {
    if (!hasApi || !isAuthenticated) return;
    void refreshAccount();
    void refreshReports();
    void refreshSupportRequests();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!hasApi || !isAuthenticated || !account?.isAdmin) return;
    void refreshAdminData();
  }, [account?.isAdmin, isAuthenticated]);

  useEffect(() => {
    if (!hasApi || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    const sessionId = params.get('session_id');
    if (state === 'cancel') {
      setPendingCheckout(null);
      setBillingNotice({ tone: 'warn', text: 'Billing setup was canceled before completion.' });
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    if (state !== 'success' || !sessionId) return;

    setBillingBusy(true);
    api
      .confirmCheckout(sessionId)
      .then((res) => {
        setPendingCheckout(null);
        setAccount(res.account);
        setBillingNotice({ tone: 'ok', text: 'Billing is active. You can create and edit reports now.' });
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        url.searchParams.delete('session_id');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      })
      .catch((e) => {
        console.error('confirmCheckout failed', e);
        setBillingNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not confirm billing setup.' });
      })
      .finally(() => setBillingBusy(false));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!hasApi || !isAuthenticated || !account || !pendingCheckoutPlan || billingBusy) return;
    if (checkoutLaunchStarted.current) return;
    if (account.canManageBilling) {
      setPendingCheckout(null);
      return;
    }

    checkoutLaunchStarted.current = true;
    setBillingBusy(true);
    api
      .createCheckout({ plan: pendingCheckoutPlan })
      .then(({ url }) => {
        setPendingCheckout(null);
        redirectToUrl(url);
      })
      .catch((e) => {
        console.error('auto createCheckout failed', e);
        setBillingNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not start billing setup.' });
        checkoutLaunchStarted.current = false;
      })
      .finally(() => setBillingBusy(false));
  }, [account, billingBusy, isAuthenticated, pendingCheckoutPlan]);

  const submitSupportRequest = async (category: SupportRequestCategory, subject: string, message: string) => {
    setSupportSubmitting(true);
    setSupportError(null);
    try {
      const res = await api.createSupportRequest({ category, subject, message });
      setSupportRequests((current) => [res.request, ...current].slice(0, 10));
      const detail = await api.getSupportRequest(res.request.id);
      setActiveSupportRequest(detail);
    } catch (e) {
      console.error('createSupportRequest failed', e);
      setSupportError(e instanceof Error ? e.message : 'Could not submit support request');
      throw e;
    } finally {
      setSupportSubmitting(false);
    }
  };

  const submitSupportMessage = async (requestId: string, body: string) => {
    setSupportThreadSubmitting(true);
    setSupportError(null);
    try {
      const res = await api.createSupportMessage(requestId, { body });
      setActiveSupportRequest((current) =>
        current && current.request.id === requestId
          ? { ...current, messages: [...current.messages, res.message] }
          : current,
      );
    } catch (e) {
      console.error('createSupportMessage failed', e);
      setSupportError(e instanceof Error ? e.message : 'Could not add support message');
      throw e;
    } finally {
      setSupportThreadSubmitting(false);
    }
  };

  const submitAdminSupportMessage = async (requestId: string, body: string) => {
    setAdminSupportSubmitting(true);
    setAdminError(null);
    try {
      const res = await api.createAdminSupportMessage(requestId, { body });
      setActiveAdminSupportRequest((current) =>
        current && current.request.id === requestId
          ? { ...current, messages: [...current.messages, res.message] }
          : current,
      );
      await refreshAdminData();
    } catch (e) {
      console.error('createAdminSupportMessage failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not send admin support reply');
      throw e;
    } finally {
      setAdminSupportSubmitting(false);
    }
  };

  const updateAdminSupportStatus = async (requestId: string, status: SupportRequestStatus) => {
    setAdminSupportSubmitting(true);
    setAdminError(null);
    try {
      const updated = await api.updateAdminSupportRequest(requestId, { status });
      setActiveAdminSupportRequest((current) =>
        current && current.request.id === requestId ? { ...current, request: updated } : current,
      );
      setAdminSupportRequests((current) =>
        current.map((item) => (item.request.id === requestId ? { ...item, request: updated } : item)),
      );
      await refreshAdminData();
    } catch (e) {
      console.error('updateAdminSupportStatus failed', e);
      setAdminError(e instanceof Error ? e.message : 'Could not update support status');
      throw e;
    } finally {
      setAdminSupportSubmitting(false);
    }
  };

  const openReport = async (reportId: string) => {
    try {
      const detail = await api.getReport(reportId);
      setActiveDetail(detail);
      setActiveView('wizard');
    } catch (e) {
      console.error('openReport failed', e);
      setReportsError(e instanceof Error ? e.message : 'Could not open report');
    }
  };

  if (isLoading) {
    return (
      <AuthScreenFrame>
        <div className="card" style={{ maxWidth: 520, width: '100%' }}>
          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <span style={{ color: 'var(--accent)' }}>
              <Icons.lock size={18} />
            </span>
            <span style={{ fontWeight: 600 }}>Connecting to your secure workspace</span>
          </div>
          <p className="lead" style={{ fontSize: 15, marginBottom: 0 }}>
            Checking your session before we open the VPAT drafting workflow.
          </p>
        </div>
      </AuthScreenFrame>
    );
  }

  if (!isAuthenticated) {
    return (
      <MarketingShell
        pageActions={({ page: activePage, goTo }) => (
          <>
            <nav className="marketing-nav hide-mob" aria-label="Public site">
              {MARKETING_PAGES.map((page) => (
                <button
                  key={page.id}
                  className={`marketing-nav-link${page.id === activePage ? ' active' : ''}`}
                  aria-current={page.id === activePage ? 'page' : undefined}
                  onClick={() => goTo(page.id)}
                >
                  {page.label}
                </button>
              ))}
            </nav>
          </>
        )}
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <a className="btn btn-ghost btn-sm" href={LINKEDIN_URL} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <button className="btn btn-ghost btn-sm" onClick={login}>
              Log in
            </button>
            <button className="btn btn-primary btn-sm" onClick={signupStarter}>
              Sign up
            </button>
          </div>
        }
      >
        <MarketingSite error={error?.message ?? null} onLogin={login} onSignup={signupStarter} />
      </MarketingShell>
    );
  }

  if (hasApi && !account) {
    return (
      <AuthScreenFrame>
        <div className="card" style={{ maxWidth: 520, width: '100%' }}>
          <div className="row" style={{ gap: 10, marginBottom: 10 }}>
            <span style={{ color: 'var(--accent)' }}>
              <Icons.shield size={18} />
            </span>
            <span style={{ fontWeight: 600 }}>Loading your workspace</span>
          </div>
          <p className="lead" style={{ fontSize: 15, marginBottom: 0 }}>
            Fetching your current plan, report limits, and workspace access.
          </p>
        </div>
      </AuthScreenFrame>
    );
  }

  return activeView === 'dashboard' ? (
    <ReportsDashboard
      account={account}
      reports={reports}
      reportsLoading={reportsLoading}
      reportsError={reportsError}
      billingBusy={billingBusy}
      billingNotice={billingNotice}
      userLabel={user?.email ?? user?.name ?? 'Signed in'}
      onCreateReport={() => {
        if (subscriptionIssueMessage(account)) return;
        setActiveDetail(null);
        setActiveView('wizard');
      }}
      onOpenReport={(reportId) => void openReport(reportId)}
      onRefresh={() => void refreshReports()}
      onUpgradeGrowth={() => void openUpgradeFlow()}
      onManageBilling={() => void openPortal()}
      supportRequests={supportRequests}
      supportLoading={supportLoading}
      supportError={supportError}
      supportSubmitting={supportSubmitting}
      activeSupportRequest={activeSupportRequest}
      supportThreadLoading={supportThreadLoading}
      supportThreadSubmitting={supportThreadSubmitting}
      onOpenSupportRequest={(requestId) => void openSupportRequest(requestId)}
      onCloseSupportRequest={() => setActiveSupportRequest(null)}
      onSubmitSupportRequest={(category, subject, message) => void submitSupportRequest(category, subject, message)}
      onSubmitSupportMessage={(requestId, body) => void submitSupportMessage(requestId, body)}
      adminOverview={adminOverview}
      adminClients={adminClients}
      adminReports={adminReports}
      adminSupportRequests={adminSupportRequests}
      adminLoading={adminLoading}
      adminError={adminError}
      activeAdminClient={activeAdminClient}
      activeAdminSupportRequest={activeAdminSupportRequest}
      adminClientLoading={adminClientLoading}
      adminSupportLoading={adminSupportLoading}
      adminSupportSubmitting={adminSupportSubmitting}
      adminClientSaving={adminClientSaving}
      onRefreshAdmin={() => void refreshAdminData()}
      onOpenAdminClient={(clientId) => void openAdminClient(clientId)}
      onCloseAdminClient={() => setActiveAdminClient(null)}
      onUpdateAdminClient={(clientId, patch) => void updateAdminClient(clientId, patch)}
      onOpenAdminSupportRequest={(requestId) => void openAdminSupportRequest(requestId)}
      onCloseAdminSupportRequest={() => setActiveAdminSupportRequest(null)}
      onSubmitAdminSupportMessage={(requestId, body) => void submitAdminSupportMessage(requestId, body)}
      onUpdateAdminSupportStatus={(requestId, status) => void updateAdminSupportStatus(requestId, status)}
      onUpdateAdminReport={(reportId, patch) => void updateAdminReport(reportId, patch)}
      onDeleteAdminReport={(reportId) => void deleteAdminReport(reportId)}
      adminReportBusyId={adminReportBusyId}
      onSignout={signout}
    />
  ) : (
    <WizardApp
      key={activeDetail?.report.id ?? 'new-report'}
      account={account}
      initialDetail={activeDetail}
      onAccountChange={(next) => {
        setAccount(next);
        void refreshReports();
      }}
      onUpgradeGrowth={() => void openUpgradeFlow()}
      onBackToReports={() => {
        setActiveDetail(null);
        setActiveView('dashboard');
        void refreshReports();
      }}
      accountControls={
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setActiveDetail(null);
            setActiveView('dashboard');
            void refreshReports();
          }}>
            Reports
          </button>
          {account && (
            <span className="tag">
              {account.plan} · {account.activeReports}
              {account.activeReportLimit !== null ? `/${account.activeReportLimit}` : ''} active
            </span>
          )}
          {account?.plan === 'starter' && (
            <button className="btn btn-primary btn-sm" onClick={() => void openUpgradeFlow()} disabled={billingBusy}>
              {billingBusy ? 'Opening billing…' : 'Upgrade'}
            </button>
          )}
          {account?.canManageBilling && (
            <button className="btn btn-ghost btn-sm" onClick={() => void openPortal()} disabled={billingBusy}>
              {billingBusy ? 'Opening billing…' : 'Manage billing'}
            </button>
          )}
          <span className="tag" aria-label={`Signed in as ${user?.email ?? user?.name ?? 'current user'}`}>
            {user?.email ?? user?.name ?? 'Signed in'}
          </span>
          <button className="btn btn-quiet btn-sm" onClick={signout}>
            Log out
          </button>
        </div>
      }
    />
  );
}

function AuthConfigError() {
  return (
    <AuthScreenFrame>
      <div className="card" style={{ maxWidth: 640, width: '100%' }}>
        <div className="eyebrow">Secure Sign-In Setup</div>
        <h1 className="title">Finish the sign-in environment variables</h1>
        <p className="lead">
          Set both <code>VITE_AUTH0_DOMAIN</code> and <code>VITE_AUTH0_CLIENT_ID</code> to enable login on this Vite
          app. When the Fastify API is enabled, also set <code>VITE_AUTH0_AUDIENCE</code> so the SPA requests a bearer
          token for the API.
        </p>
        <div className="panel" style={{ marginTop: 22, padding: '16px 18px' }}>
          <div className="micro muted" style={{ marginBottom: 10 }}>
            Expected local values
          </div>
          <div className="col" style={{ gap: 6, fontSize: 13.5 }}>
            <code>VITE_AUTH0_DOMAIN={AUTH0_DOMAIN || 'dev-5iepn3tlte3m2e34.us.auth0.com'}</code>
            <code>VITE_AUTH0_CLIENT_ID={AUTH0_CLIENT_ID || 'KBAAGVPWkdn78NWp4s1UqNtCWGz2tOML'}</code>
            <code>VITE_AUTH0_AUDIENCE={AUTH0_AUDIENCE || 'https://api.vpatbuilder.com'}</code>
            <code>http://localhost:5173</code>
          </div>
        </div>
      </div>
    </AuthScreenFrame>
  );
}

function ReportsDashboard({
  account,
  reports,
  reportsLoading,
  reportsError,
  billingBusy,
  billingNotice,
  userLabel,
  onCreateReport,
  onOpenReport,
  onRefresh,
  onUpgradeGrowth,
  onManageBilling,
  supportRequests,
  supportLoading,
  supportError,
  supportSubmitting,
  activeSupportRequest,
  supportThreadLoading,
  supportThreadSubmitting,
  onOpenSupportRequest,
  onCloseSupportRequest,
  onSubmitSupportRequest,
  onSubmitSupportMessage,
  adminOverview,
  adminClients,
  adminReports,
  adminSupportRequests,
  adminLoading,
  adminError,
  activeAdminClient,
  activeAdminSupportRequest,
  adminClientLoading,
  adminSupportLoading,
  adminSupportSubmitting,
  adminClientSaving,
  onRefreshAdmin,
  onOpenAdminClient,
  onCloseAdminClient,
  onUpdateAdminClient,
  onOpenAdminSupportRequest,
  onCloseAdminSupportRequest,
  onSubmitAdminSupportMessage,
  onUpdateAdminSupportStatus,
  onUpdateAdminReport,
  onDeleteAdminReport,
  adminReportBusyId,
  onSignout,
}: {
  account: AccountSummary | null;
  reports: ReportRecord[];
  reportsLoading: boolean;
  reportsError: string | null;
  billingBusy: boolean;
  billingNotice: { tone: 'ok' | 'warn' | 'bad'; text: string } | null;
  userLabel: string;
  onCreateReport: () => void;
  onOpenReport: (reportId: string) => void;
  onRefresh: () => void;
  onUpgradeGrowth: () => void;
  onManageBilling: () => void;
  supportRequests: SupportRequestRecord[];
  supportLoading: boolean;
  supportError: string | null;
  supportSubmitting: boolean;
  activeSupportRequest: SupportRequestDetail | null;
  supportThreadLoading: boolean;
  supportThreadSubmitting: boolean;
  onOpenSupportRequest: (requestId: string) => void;
  onCloseSupportRequest: () => void;
  onSubmitSupportRequest: (category: SupportRequestCategory, subject: string, message: string) => void;
  onSubmitSupportMessage: (requestId: string, body: string) => void;
  adminOverview: AdminOverview | null;
  adminClients: AdminClientSummary[];
  adminReports: AdminReportSummary[];
  adminSupportRequests: AdminSupportRequestSummary[];
  adminLoading: boolean;
  adminError: string | null;
  activeAdminClient: AdminClientDetail | null;
  activeAdminSupportRequest: AdminSupportRequestDetail | null;
  adminClientLoading: boolean;
  adminSupportLoading: boolean;
  adminSupportSubmitting: boolean;
  adminClientSaving: boolean;
  onRefreshAdmin: () => void;
  onOpenAdminClient: (clientId: string) => void;
  onCloseAdminClient: () => void;
  onUpdateAdminClient: (
    clientId: string,
    patch: { billingEmail?: string | null; contactEmail?: string | null; internalNotes?: string | null; isArchived?: boolean },
  ) => void;
  onOpenAdminSupportRequest: (requestId: string) => void;
  onCloseAdminSupportRequest: () => void;
  onSubmitAdminSupportMessage: (requestId: string, body: string) => void;
  onUpdateAdminSupportStatus: (requestId: string, status: SupportRequestStatus) => void;
  onUpdateAdminReport: (reportId: string, patch: { isArchived?: boolean }) => void;
  onDeleteAdminReport: (reportId: string) => void;
  adminReportBusyId: string | null;
  onSignout: () => void;
}) {
  const accountIssue = subscriptionIssueMessage(account);
  const supportHref = supportEmailHref(userLabel, account, accountIssue);
  const [supportCategory, setSupportCategory] = useState<SupportRequestCategory>('billing');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState(accountIssue ?? '');
  const [supportReply, setSupportReply] = useState('');

  useEffect(() => {
    if (accountIssue) setSupportMessage((current) => current || accountIssue);
  }, [accountIssue]);

  const submitSupport = () => {
    const subject = supportSubject.trim();
    const message = supportMessage.trim();
    if (!subject || !message) return;
    onSubmitSupportRequest(supportCategory, subject, message);
    setSupportSubject('');
    setSupportMessage(accountIssue ?? '');
  };

  const submitSupportReply = () => {
    if (!activeSupportRequest || !supportReply.trim()) return;
    onSubmitSupportMessage(activeSupportRequest.request.id, supportReply.trim());
    setSupportReply('');
  };
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <Brand />
        <span className="spacer" />
        {account && (
          <span className="tag">
            {account.plan} · {account.activeReports}
            {account.activeReportLimit !== null ? `/${account.activeReportLimit}` : ''} active
          </span>
        )}
        {accountIssue ? (
          <button className="btn btn-danger btn-sm" onClick={onManageBilling} disabled={billingBusy}>
            {billingBusy ? 'Opening billing…' : 'Manage billing'}
          </button>
        ) : account?.plan === 'starter' ? (
          <button className="btn btn-primary btn-sm" onClick={onUpgradeGrowth} disabled={billingBusy}>
            {billingBusy ? 'Opening billing…' : 'Upgrade'}
          </button>
        ) : null}
        {account?.canManageBilling && !accountIssue && (
          <button className="btn btn-ghost btn-sm" onClick={onManageBilling} disabled={billingBusy}>
            {billingBusy ? 'Opening billing…' : 'Manage billing'}
          </button>
        )}
        <a className="btn btn-ghost btn-sm" href="#support-center">
          Support center
        </a>
        {account?.isAdmin && (
          <a className="btn btn-ghost btn-sm" href="#admin-console">
            Admin console
          </a>
        )}
        <span className="tag" aria-label={`Signed in as ${userLabel}`}>
          {userLabel}
        </span>
        <button className="btn btn-quiet btn-sm" onClick={onSignout}>
          Log out
        </button>
      </header>
      <main className="main" id="main">
        <section className="landing-section" style={{ paddingTop: 8 }}>
          <div className="landing-section-head" style={{ marginBottom: 18 }}>
            <div className="eyebrow">Workspace</div>
            <h1 className="landing-section-title">Your VPAT reports</h1>
            <p className="lead">Open an existing report to keep working, or start a new draft.</p>
          </div>
          <div className="row wrap" style={{ gap: 10, marginBottom: 18 }}>
            <button
              className={`btn ${accountIssue ? 'btn-danger' : 'btn-primary'}`}
              onClick={accountIssue ? onManageBilling : onCreateReport}
              disabled={billingBusy}
            >
              {accountIssue ? (billingBusy ? 'Opening billing…' : 'Manage billing') : 'New report'}
            </button>
            <button className="btn btn-ghost" onClick={onRefresh} disabled={reportsLoading}>
              {reportsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {accountIssue && (
            <div role="alert" className="landing-alert" style={{ marginBottom: 16 }}>
              <span style={{ color: 'var(--bad)', marginTop: 1 }}>
                <Icons.alert size={16} />
              </span>
              <span>{accountIssue}</span>
            </div>
          )}
          {billingNotice && (
            <div
              role="status"
              className="landing-alert"
              style={{
                marginBottom: 16,
                color: billingNotice.tone === 'ok' ? 'var(--ok)' : billingNotice.tone === 'warn' ? 'var(--warn)' : 'var(--bad)',
                borderColor:
                  billingNotice.tone === 'ok'
                    ? 'color-mix(in oklab, var(--ok) 24%, var(--border))'
                    : billingNotice.tone === 'warn'
                      ? 'color-mix(in oklab, var(--warn) 24%, var(--border))'
                      : 'color-mix(in oklab, var(--bad) 24%, var(--border))',
                background:
                  billingNotice.tone === 'ok'
                    ? 'var(--ok-bg)'
                    : billingNotice.tone === 'warn'
                      ? 'var(--warn-bg)'
                      : 'var(--bad-bg)',
              }}
            >
              <span style={{ marginTop: 1 }}>
                {(billingNotice.tone === 'ok' ? Icons.checkCircle : Icons.alert)({ size: 16 })}
              </span>
              <span>{billingNotice.text}</span>
            </div>
          )}
          {reportsError && (
            <div role="alert" className="landing-alert" style={{ marginBottom: 16 }}>
              <span style={{ color: 'var(--bad)', marginTop: 1 }}>
                <Icons.alert size={16} />
              </span>
              <span>{reportsError}</span>
            </div>
          )}
          {reports.length === 0 ? (
            <div className="card">
              <div className="eyebrow">No Reports Yet</div>
              <h2 className="landing-section-title" style={{ marginTop: 12 }}>
                Start your first accessibility report.
              </h2>
              <p className="lead" style={{ marginTop: 10 }}>
                Create a new report to begin the scan, draft, review, and export workflow.
              </p>
            </div>
          ) : (
            <div className="landing-cards">
              {reports.map((report) => (
                <article key={report.id} className="card landing-feature-card">
                  <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div className="eyebrow">{report.status}</div>
                      <h3 className="landing-card-title" style={{ marginTop: 8 }}>
                        {report.productName || report.domain}
                      </h3>
                      <p className="landing-card-copy" style={{ marginBottom: 6 }}>{report.domain}</p>
                    </div>
                    <div className="col" style={{ gap: 6, alignItems: 'flex-end' }}>
                      <span className="tag">{EDITION_META[report.edition].shortLabel}</span>
                      <span className="tag">{report.wcagTarget}</span>
                    </div>
                  </div>
                  <div className="col" style={{ gap: 8, marginTop: 10, fontSize: 13.5 }}>
                    <span className="faint">Scope: {report.scope}</span>
                    <span className="faint">Created: {new Date(report.createdAt).toLocaleDateString()}</span>
                    {report.finalizedAt && <span className="faint">Exported: {new Date(report.finalizedAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="row wrap" style={{ gap: 10, marginTop: 18 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => onOpenReport(report.id)}>
                      Open
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {account?.isAdmin && (
          <AdminConsole
            overview={adminOverview}
            clients={adminClients}
            reports={adminReports}
            supportRequests={adminSupportRequests}
            loading={adminLoading}
            error={adminError}
            activeClient={activeAdminClient}
            activeSupportRequest={activeAdminSupportRequest}
            clientLoading={adminClientLoading}
            supportLoading={adminSupportLoading}
            supportSubmitting={adminSupportSubmitting}
            adminClientSaving={adminClientSaving}
            onRefresh={onRefreshAdmin}
            onOpenClient={onOpenAdminClient}
            onCloseClient={onCloseAdminClient}
            onUpdateAdminClient={onUpdateAdminClient}
            onOpenSupportRequest={onOpenAdminSupportRequest}
            onCloseSupportRequest={onCloseAdminSupportRequest}
            onSubmitSupportMessage={onSubmitAdminSupportMessage}
            onUpdateSupportStatus={onUpdateAdminSupportStatus}
            onUpdateAdminReport={onUpdateAdminReport}
            onDeleteAdminReport={onDeleteAdminReport}
            adminReportBusyId={adminReportBusyId}
          />
        )}

        <section className="landing-section" id="support-center" aria-labelledby="support-center-title">
          <div className="landing-section-head" style={{ marginBottom: 18 }}>
            <div className="eyebrow">Support Center</div>
            <h2 className="landing-section-title" id="support-center-title">Get help with billing, reports, and workspace setup.</h2>
            <p className="lead">Use the billing tools below, review the quick answers, or contact support directly with your account context prefilled.</p>
          </div>

          <div className="support-grid">
            <div className="card support-hero-card">
              <div className="row between wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
                <div className="col" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span className="badge b-ok">Workspace support</span>
                  <h3 className="landing-card-title" style={{ marginTop: 0 }}>Fast path for account issues</h3>
                  <p className="landing-card-copy">
                    {accountIssue ?? 'Your account is in good standing. You can still use this area for billing questions, workflow help, and support contact details.'}
                  </p>
                </div>
                <span className="tag">{account?.billingEmail ?? userLabel}</span>
              </div>
              <div className="row wrap" style={{ gap: 10, marginTop: 18 }}>
                {account?.canManageBilling ? (
                  <button className={`btn ${accountIssue ? 'btn-danger' : 'btn-primary'}`} onClick={onManageBilling} disabled={billingBusy}>
                    {billingBusy ? 'Opening billing…' : 'Manage billing'}
                  </button>
                ) : (
                  <button className={`btn ${accountIssue ? 'btn-danger' : 'btn-primary'}`} onClick={onUpgradeGrowth} disabled={billingBusy}>
                    {billingBusy ? 'Opening billing…' : 'Complete billing setup'}
                  </button>
                )}
                <a className="btn btn-ghost" href={supportHref}>
                  Email support
                </a>
              </div>
            </div>

            <div className="support-card-grid">
              {SUPPORT_TRACKS.map((item) => (
                <article key={item.title} className="card support-mini-card">
                  <span className="landing-icon">{item.icon({ size: 18 })}</span>
                  <h3 className="landing-card-title">{item.title}</h3>
                  <p className="landing-card-copy">{item.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={`support-grid ${activeSupportRequest ? 'support-grid-thread' : 'support-grid-secondary'}`} style={{ marginTop: 14 }}>
            {activeSupportRequest ? (
              <div className="card support-thread-card">
                <div className="row between wrap" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div className="eyebrow">Ticket View</div>
                    <h3 className="landing-card-title" style={{ marginTop: 8 }}>{activeSupportRequest.request.subject}</h3>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {activeSupportRequest.request.category} · {new Date(activeSupportRequest.request.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="tag">{activeSupportRequest.request.status}</span>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={onCloseSupportRequest}>
                      Back to support
                    </button>
                  </div>
                </div>
                <div className="support-thread">
                  {supportThreadLoading ? (
                    <div className="support-thread-empty">Loading the full support conversation…</div>
                  ) : (
                    activeSupportRequest.messages.map((message) => (
                      <article key={message.id} className={`support-message support-message-${message.authorRole}`}>
                        <div className="row between wrap" style={{ gap: 8 }}>
                          <strong>{message.authorRole === 'support' ? 'Customer support' : 'You'}</strong>
                          <span className="faint" style={{ fontSize: 12.5 }}>{new Date(message.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="landing-card-copy" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                      </article>
                    ))
                  )}
                </div>
                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor="support-reply">Add more details</label>
                  <textarea
                    id="support-reply"
                    className="textarea"
                    value={supportReply}
                    onChange={(e) => setSupportReply(e.target.value)}
                    placeholder="Add additional details, screenshots notes, or follow-up context."
                  />
                </div>
                <div className="row wrap" style={{ gap: 10, marginTop: 14 }}>
                  <button
                    className={`btn ${supportThreadSubmitting ? 'btn-danger' : 'btn-primary'}`}
                    type="button"
                    disabled={supportThreadSubmitting || !supportReply.trim()}
                    onClick={submitSupportReply}
                  >
                    {supportThreadSubmitting ? 'Posting update…' : 'Add details'}
                  </button>
                </div>
                {supportThreadSubmitting && (
                  <div className="support-submit-state" role="status" aria-live="polite" style={{ marginTop: 14 }}>
                    <span className="landing-icon">{Icons.clock({ size: 16 })}</span>
                    <span>
                      <strong>Posting your update</strong>
                      <span className="faint">The new details will appear in this ticket thread as soon as they are saved.</span>
                    </span>
                  </div>
                )}
                {supportError && (
                  <div role="alert" className="landing-alert" style={{ marginTop: 14 }}>
                    <span style={{ color: 'var(--bad)', marginTop: 1 }}>
                      <Icons.alert size={16} />
                    </span>
                    <span>{supportError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="card">
                <div className="eyebrow">Quick Actions</div>
                <div className="col" style={{ gap: 12, marginTop: 16 }}>
                  <a className="support-link-row" href={supportHref}>
                    <span className="landing-icon">{Icons.arrowR({ size: 16 })}</span>
                    <span>
                      <strong>Email {SUPPORT_EMAIL}</strong>
                      <span className="faint">Share account, billing, or report issues with prefilled context.</span>
                    </span>
                  </a>
                  <button className="support-link-row" onClick={onRefresh} disabled={reportsLoading} type="button">
                    <span className="landing-icon">{Icons.clock({ size: 16 })}</span>
                    <span>
                      <strong>{reportsLoading ? 'Refreshing workspace…' : 'Refresh workspace data'}</strong>
                      <span className="faint">Reload account limits, report state, and billing-connected UI.</span>
                    </span>
                  </button>
                  <a className="support-link-row" href="/#faq">
                    <span className="landing-icon">{Icons.doc({ size: 16 })}</span>
                    <span>
                      <strong>Review public FAQ</strong>
                      <span className="faint">Open the broader product FAQ for onboarding and workflow context.</span>
                    </span>
                  </a>
                </div>
              </div>
            )}

            {!activeSupportRequest ? (
              <>
                <div className="card">
                  <div className="eyebrow">Support Requests</div>
                  <div className="col" style={{ gap: 10, marginTop: 16 }}>
                    <div className="field">
                      <label htmlFor="support-category">Category</label>
                      <select
                        id="support-category"
                        className="input"
                        value={supportCategory}
                        onChange={(e) => setSupportCategory(e.target.value as SupportRequestCategory)}
                      >
                        <option value="billing">Billing</option>
                        <option value="report">Report workflow</option>
                        <option value="technical">Technical issue</option>
                        <option value="general">General question</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="support-subject">Subject</label>
                      <input
                        id="support-subject"
                        className="input"
                        value={supportSubject}
                        onChange={(e) => setSupportSubject(e.target.value)}
                        placeholder="Short summary of the issue"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="support-message">Message</label>
                      <textarea
                        id="support-message"
                        className="textarea"
                        value={supportMessage}
                        onChange={(e) => setSupportMessage(e.target.value)}
                        placeholder="Describe what happened and what you need help with."
                      />
                    </div>
                    <div className="row wrap" style={{ gap: 10 }}>
                      <button
                        className={`btn ${supportSubmitting ? 'btn-danger' : 'btn-primary'}`}
                        type="button"
                        disabled={supportSubmitting || !supportSubject.trim() || !supportMessage.trim()}
                        onClick={submitSupport}
                      >
                        {supportSubmitting ? 'Submitting request…' : 'Submit request'}
                      </button>
                      <a className="btn btn-ghost" href={supportHref}>
                        Email instead
                      </a>
                    </div>
                    {supportSubmitting && (
                      <div className="support-submit-state" role="status" aria-live="polite">
                        <span className="landing-icon">{Icons.clock({ size: 16 })}</span>
                        <span>
                          <strong>Submitting your request</strong>
                          <span className="faint">We’re saving it to your workspace and opening the ticket thread.</span>
                        </span>
                      </div>
                    )}
                    {supportError && (
                      <div role="alert" className="landing-alert">
                        <span style={{ color: 'var(--bad)', marginTop: 1 }}>
                          <Icons.alert size={16} />
                        </span>
                        <span>{supportError}</span>
                      </div>
                    )}
                    {supportLoading ? (
                      <p className="landing-card-copy">Loading recent requests…</p>
                    ) : supportRequests.length === 0 ? (
                      <p className="landing-card-copy">No support requests yet. Submit one here and it will stay attached to your workspace.</p>
                    ) : (
                      <div className="col" style={{ gap: 10 }}>
                        {supportRequests.map((request) => (
                          <button key={request.id} className="support-ticket-row" type="button" onClick={() => onOpenSupportRequest(request.id)}>
                            <div className="row between wrap" style={{ gap: 10 }}>
                              <strong>{request.subject}</strong>
                              <span className="tag">{request.status}</span>
                            </div>
                            <div className="faint" style={{ marginTop: 10, fontSize: 12.5, textAlign: 'left' }}>
                              {request.category} · {new Date(request.createdAt).toLocaleString()}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="eyebrow">Common Questions</div>
                  <div className="col" style={{ gap: 10, marginTop: 16 }}>
                    {SUPPORT_FAQS.map((item, index) => (
                      <details key={item.q} className="support-faq" open={Boolean(accountIssue) && index === 0}>
                        <summary className="landing-faq-summary">{item.q}</summary>
                        <p className="landing-card-copy" style={{ marginTop: 10 }}>{item.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>

      </main>
    </div>
  );
}

function AdminConsole({
  overview,
  clients,
  reports,
  supportRequests,
  loading,
  error,
  activeClient,
  activeSupportRequest,
  clientLoading,
  supportLoading,
  supportSubmitting,
  adminClientSaving,
  onRefresh,
  onOpenClient,
  onCloseClient,
  onUpdateAdminClient,
  onOpenSupportRequest,
  onCloseSupportRequest,
  onSubmitSupportMessage,
  onUpdateSupportStatus,
  onUpdateAdminReport,
  onDeleteAdminReport,
  adminReportBusyId,
}: {
  overview: AdminOverview | null;
  clients: AdminClientSummary[];
  reports: AdminReportSummary[];
  supportRequests: AdminSupportRequestSummary[];
  loading: boolean;
  error: string | null;
  activeClient: AdminClientDetail | null;
  activeSupportRequest: AdminSupportRequestDetail | null;
  clientLoading: boolean;
  supportLoading: boolean;
  supportSubmitting: boolean;
  adminClientSaving: boolean;
  onRefresh: () => void;
  onOpenClient: (clientId: string) => void;
  onCloseClient: () => void;
  onUpdateAdminClient: (
    clientId: string,
    patch: { billingEmail?: string | null; contactEmail?: string | null; internalNotes?: string | null; isArchived?: boolean },
  ) => void;
  onOpenSupportRequest: (requestId: string) => void;
  onCloseSupportRequest: () => void;
  onSubmitSupportMessage: (requestId: string, body: string) => void;
  onUpdateSupportStatus: (requestId: string, status: SupportRequestStatus) => void;
  onUpdateAdminReport: (reportId: string, patch: { isArchived?: boolean }) => void;
  onDeleteAdminReport: (reportId: string) => void;
  adminReportBusyId: string | null;
}) {
  const [adminReply, setAdminReply] = useState('');
  const [clientBillingEmail, setClientBillingEmail] = useState('');
  const [clientContactEmail, setClientContactEmail] = useState('');
  const [clientInternalNotes, setClientInternalNotes] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showArchivedClients, setShowArchivedClients] = useState(false);

  useEffect(() => {
    setClientBillingEmail(activeClient?.client.billingEmail ?? '');
    setClientContactEmail(activeClient?.client.contactEmail ?? '');
    setClientInternalNotes(activeClient?.client.internalNotes ?? '');
  }, [activeClient]);

  const submitReply = () => {
    if (!activeSupportRequest || !adminReply.trim()) return;
    onSubmitSupportMessage(activeSupportRequest.request.id, adminReply.trim());
    setAdminReply('');
  };

  const saveClient = () => {
    if (!activeClient) return;
    onUpdateAdminClient(activeClient.client.id, {
      billingEmail: clientBillingEmail.trim() || null,
      contactEmail: clientContactEmail.trim() || null,
      internalNotes: clientInternalNotes.trim() || null,
    });
  };

  const archiveReportLabel = (item: AdminReportSummary) => (item.report.isArchived ? 'Restore report' : 'Archive report');
  const archiveReportTone = (item: AdminReportSummary) => (item.report.isArchived ? 'btn-ghost' : 'btn-danger');
  const filteredClients = clients.filter((client) => {
    if (!showArchivedClients && client.isArchived) return false;
    if (!clientSearch.trim()) return true;
    const needle = clientSearch.trim().toLowerCase();
    return (
      client.email.toLowerCase().includes(needle) ||
      (client.billingEmail ?? '').toLowerCase().includes(needle) ||
      (client.contactEmail ?? '').toLowerCase().includes(needle) ||
      client.plan.toLowerCase().includes(needle) ||
      (client.subscriptionStatus ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <section className="landing-section" id="admin-console" aria-labelledby="admin-console-title">
      <div className="landing-section-head" style={{ marginBottom: 18 }}>
        <div className="eyebrow">Admin Console</div>
        <h2 className="landing-section-title" id="admin-console-title">Run support, client visibility, and report operations from one place.</h2>
        <p className="lead">This area is shown from Auth0 permissions and includes client billing state, report inventory, ticket workflows, and a lightweight audit trail.</p>
      </div>

      <div className="row wrap" style={{ gap: 10, marginBottom: 18 }}>
        <button className="btn btn-primary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing admin data…' : 'Refresh admin data'}
        </button>
      </div>

      {error && (
        <div role="alert" className="landing-alert" style={{ marginBottom: 16 }}>
          <span style={{ color: 'var(--bad)', marginTop: 1 }}>
            <Icons.alert size={16} />
          </span>
          <span>{error}</span>
        </div>
      )}

      <div className="admin-overview-grid">
        <article className="card admin-overview-card">
          <div className="eyebrow">Clients</div>
          <div className="admin-metric">{overview?.totalClients ?? 0}</div>
          <p className="landing-card-copy">Known customer accounts in the system.</p>
        </article>
        <article className="card admin-overview-card">
          <div className="eyebrow">Active Subs</div>
          <div className="admin-metric">{overview?.activeSubscriptions ?? 0}</div>
          <p className="landing-card-copy">Customers currently in `active` or `trialing` subscription state.</p>
        </article>
        <article className="card admin-overview-card">
          <div className="eyebrow">Past Due</div>
          <div className="admin-metric">{overview?.pastDueSubscriptions ?? 0}</div>
          <p className="landing-card-copy">Accounts needing billing follow-up.</p>
        </article>
        <article className="card admin-overview-card">
          <div className="eyebrow">Active Reports</div>
          <div className="admin-metric">{overview?.activeReports ?? 0}</div>
          <p className="landing-card-copy">Reports still in progress or under review.</p>
        </article>
        <article className="card admin-overview-card">
          <div className="eyebrow">Open Tickets</div>
          <div className="admin-metric">{overview?.openSupportRequests ?? 0}</div>
          <p className="landing-card-copy">Support requests waiting on customer service or follow-up.</p>
        </article>
      </div>

      <div className="admin-grid">
        <div className="card">
          <div className="eyebrow">Clients</div>
          <div className="col" style={{ gap: 10, marginTop: 16 }}>
            <div className="field">
              <label htmlFor="admin-client-search">Search clients</label>
              <input
                id="admin-client-search"
                className="input"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search by email, billing email, plan, or subscription"
              />
            </div>
            <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={showArchivedClients}
                onChange={(e) => setShowArchivedClients(e.target.checked)}
              />
              <span>Show archived clients</span>
            </label>
          </div>
          <div className="col" style={{ gap: 10, marginTop: 16 }}>
            {filteredClients.length === 0 ? (
              <p className="landing-card-copy">No clients match the current filters.</p>
            ) : (
              filteredClients.map((client) => (
              <button key={client.id} className="admin-list-row" type="button" onClick={() => onOpenClient(client.id)}>
                <div className="row between wrap" style={{ gap: 10 }}>
                  <strong>{client.email}</strong>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {client.isArchived && <span className="tag">archived</span>}
                    <span className="tag">{client.plan}</span>
                  </div>
                </div>
                <div className="faint" style={{ marginTop: 8, fontSize: 12.5, textAlign: 'left' }}>
                  {client.hasActiveSubscription ? 'Active subscription' : client.subscriptionStatus ?? 'No subscription'} · {client.reportCount} reports · {client.openSupportRequests} open tickets
                </div>
              </button>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="eyebrow">Reports</div>
          <div className="col" style={{ gap: 10, marginTop: 16 }}>
            {reports.map((item) => (
              <div key={item.report.id} className="admin-subrow">
                <div className="row between wrap" style={{ gap: 10 }}>
                  <strong>{item.report.productName || item.report.domain}</strong>
                  <div className="row wrap" style={{ gap: 8 }}>
                    {item.report.isArchived && <span className="tag">archived</span>}
                    <span className="tag">{item.report.status}</span>
                  </div>
                </div>
                <span className="faint">
                  {item.clientEmail ?? 'Unassigned'} · {item.report.domain} · scan {item.latestScanState ?? 'not started'}
                </span>
                <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                  <button
                    className={`btn ${archiveReportTone(item)} btn-sm`}
                    type="button"
                    disabled={adminReportBusyId === item.report.id}
                    onClick={() => onUpdateAdminReport(item.report.id, { isArchived: !item.report.isArchived })}
                  >
                    {adminReportBusyId === item.report.id ? 'Saving…' : archiveReportLabel(item)}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    disabled={adminReportBusyId === item.report.id}
                    onClick={() => {
                      if (!window.confirm(`Delete report "${item.report.productName || item.report.domain}" permanently? This removes scans, findings, and exports.`)) return;
                      onDeleteAdminReport(item.report.id);
                    }}
                  >
                    {adminReportBusyId === item.report.id ? 'Deleting…' : 'Delete report'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="eyebrow">Support Queue</div>
          <div className="col" style={{ gap: 10, marginTop: 16 }}>
            {supportRequests.map((item) => (
              <button key={item.request.id} className="admin-list-row" type="button" onClick={() => onOpenSupportRequest(item.request.id)}>
                <div className="row between wrap" style={{ gap: 10 }}>
                  <strong>{item.request.subject}</strong>
                  <span className="tag">{item.request.status}</span>
                </div>
                <div className="faint" style={{ marginTop: 8, fontSize: 12.5, textAlign: 'left' }}>
                  {item.clientEmail} · {item.plan} · {formatDateTime(item.lastMessageAt ?? item.request.createdAt)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-grid">
        <div className="card">
          <div className="eyebrow">Client Detail</div>
          {clientLoading ? (
            <p className="landing-card-copy" style={{ marginTop: 16 }}>Loading client record…</p>
          ) : activeClient ? (
            <div className="col" style={{ gap: 16, marginTop: 16 }}>
              <div className="row between wrap" style={{ gap: 10 }}>
                <div>
                  <h3 className="landing-card-title" style={{ marginTop: 0 }}>{activeClient.client.email}</h3>
                  <div className="faint" style={{ fontSize: 12.5 }}>
                    Billing: {activeClient.client.billingEmail ?? 'unknown'} · Last activity: {formatDateTime(activeClient.client.lastActivityAt)}
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="tag">{activeClient.client.isArchived ? 'archived' : 'active'}</span>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={onCloseClient}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="admin-detail-grid">
                <div className="panel admin-detail-panel">
                  <strong>Account</strong>
                  <span className="faint">Plan: {activeClient.client.plan}</span>
                  <span className="faint">Subscription: {activeClient.client.subscriptionStatus ?? 'none'}</span>
                  <span className="faint">Stripe customer: {activeClient.client.stripeCustomerId ?? 'none'}</span>
                  <span className="faint">Stripe subscription: {activeClient.client.stripeSubscriptionId ?? 'none'}</span>
                  {activeClient.client.archivedAt && <span className="faint">Archived: {formatDateTime(activeClient.client.archivedAt)}</span>}
                </div>
                <div className="panel admin-detail-panel">
                  <strong>Usage</strong>
                  <span className="faint">Reports: {activeClient.client.reportCount}</span>
                  <span className="faint">Open tickets: {activeClient.client.openSupportRequests}</span>
                  <span className="faint">Created: {formatDateTime(activeClient.client.createdAt)}</span>
                </div>
              </div>
              <div className="col" style={{ gap: 12 }}>
                <strong>Client Management</strong>
                <div className="field">
                  <label htmlFor="admin-client-billing-email">Billing email</label>
                  <input
                    id="admin-client-billing-email"
                    className="input"
                    value={clientBillingEmail}
                    onChange={(e) => setClientBillingEmail(e.target.value)}
                    placeholder="billing@company.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="admin-client-contact-email">Primary contact email</label>
                  <input
                    id="admin-client-contact-email"
                    className="input"
                    value={clientContactEmail}
                    onChange={(e) => setClientContactEmail(e.target.value)}
                    placeholder="owner@company.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="admin-client-notes">Internal notes</label>
                  <textarea
                    id="admin-client-notes"
                    className="textarea"
                    value={clientInternalNotes}
                    onChange={(e) => setClientInternalNotes(e.target.value)}
                    placeholder="Internal operating notes, follow-ups, or account context."
                  />
                </div>
                <div className="row wrap" style={{ gap: 10 }}>
                  <button className={`btn ${adminClientSaving ? 'btn-danger' : 'btn-primary'}`} type="button" disabled={adminClientSaving} onClick={saveClient}>
                    {adminClientSaving ? 'Saving client…' : 'Save client'}
                  </button>
                  <button
                    className={`btn ${activeClient.client.isArchived ? 'btn-ghost' : 'btn-danger'}`}
                    type="button"
                    disabled={adminClientSaving}
                    onClick={() => onUpdateAdminClient(activeClient.client.id, { isArchived: !activeClient.client.isArchived })}
                  >
                    {activeClient.client.isArchived ? 'Restore client' : 'Archive client'}
                  </button>
                </div>
              </div>
              <div className="col" style={{ gap: 10 }}>
                <strong>Reports</strong>
                {activeClient.reports.length === 0 ? (
                  <p className="landing-card-copy">No reports yet.</p>
                ) : (
                  activeClient.reports.map((item) => (
                    <div key={item.report.id} className="admin-subrow">
                      <strong>{item.report.productName || item.report.domain}</strong>
                      <span className="faint">
                        {item.report.status}
                        {item.report.isArchived ? ' · archived' : ''}
                        {' · '}
                        scan {item.latestScanState ?? 'not started'} · {item.report.domain}
                      </span>
                      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                        <button
                          className={`btn ${archiveReportTone(item)} btn-sm`}
                          type="button"
                          disabled={adminReportBusyId === item.report.id}
                          onClick={() => onUpdateAdminReport(item.report.id, { isArchived: !item.report.isArchived })}
                        >
                          {adminReportBusyId === item.report.id ? 'Saving…' : archiveReportLabel(item)}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          disabled={adminReportBusyId === item.report.id}
                          onClick={() => {
                            if (!window.confirm(`Delete report "${item.report.productName || item.report.domain}" permanently? This removes scans, findings, and exports.`)) return;
                            onDeleteAdminReport(item.report.id);
                          }}
                        >
                          {adminReportBusyId === item.report.id ? 'Deleting…' : 'Delete report'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="col" style={{ gap: 10 }}>
                <strong>Audit trail</strong>
                {activeClient.auditEvents.length === 0 ? (
                  <p className="landing-card-copy">No audit entries yet.</p>
                ) : (
                  activeClient.auditEvents.slice(0, 8).map((event) => (
                    <div key={event.id} className="admin-subrow">
                      <strong>{event.subject}</strong>
                      <span className="faint">{event.actorEmail ?? 'system'} · {formatDateTime(event.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="landing-card-copy" style={{ marginTop: 16 }}>Choose a client to inspect billing state, reports, support history, and audit activity.</p>
          )}
        </div>

        <div className="card">
          <div className="eyebrow">Ticket Detail</div>
          {supportLoading ? (
            <p className="landing-card-copy" style={{ marginTop: 16 }}>Loading support ticket…</p>
          ) : activeSupportRequest ? (
            <div className="col" style={{ gap: 16, marginTop: 16 }}>
              <div className="row between wrap" style={{ gap: 10 }}>
                <div>
                  <h3 className="landing-card-title" style={{ marginTop: 0 }}>{activeSupportRequest.request.subject}</h3>
                  <div className="faint" style={{ fontSize: 12.5 }}>
                    {activeSupportRequest.client.email} · {activeSupportRequest.client.plan} · {activeSupportRequest.request.category}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={onCloseSupportRequest}>
                  Clear
                </button>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                {(['open', 'pending', 'resolved', 'closed'] as SupportRequestStatus[]).map((status) => (
                  <button
                    key={status}
                    className={`btn ${activeSupportRequest.request.status === status ? 'btn-danger' : 'btn-ghost'} btn-sm`}
                    type="button"
                    disabled={supportSubmitting}
                    onClick={() => onUpdateSupportStatus(activeSupportRequest.request.id, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="support-thread">
                {activeSupportRequest.messages.map((message) => (
                  <article key={message.id} className={`support-message support-message-${message.authorRole}`}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <strong>{message.authorRole === 'support' ? 'Support' : 'Customer'}</strong>
                      <span className="faint" style={{ fontSize: 12.5 }}>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="landing-card-copy" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{message.body}</p>
                  </article>
                ))}
              </div>
              <div className="field">
                <label htmlFor="admin-support-reply">Reply as support</label>
                <textarea
                  id="admin-support-reply"
                  className="textarea"
                  value={adminReply}
                  onChange={(e) => setAdminReply(e.target.value)}
                  placeholder="Reply to the client with next steps, billing instructions, or troubleshooting details."
                />
              </div>
              <div className="row wrap" style={{ gap: 10 }}>
                <button className={`btn ${supportSubmitting ? 'btn-danger' : 'btn-primary'}`} type="button" disabled={supportSubmitting || !adminReply.trim()} onClick={submitReply}>
                  {supportSubmitting ? 'Sending reply…' : 'Send reply'}
                </button>
              </div>
              <div className="col" style={{ gap: 10 }}>
                <strong>Audit trail</strong>
                {activeSupportRequest.auditEvents.length === 0 ? (
                  <p className="landing-card-copy">No audit entries yet.</p>
                ) : (
                  activeSupportRequest.auditEvents.map((event) => (
                    <div key={event.id} className="admin-subrow">
                      <strong>{event.subject}</strong>
                      <span className="faint">{event.actorEmail ?? 'system'} · {formatDateTime(event.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="landing-card-copy" style={{ marginTop: 16 }}>Choose a ticket to reply as support, change status, and review the client’s thread history.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">All Reports</div>
        <div className="col" style={{ gap: 10, marginTop: 16 }}>
          {reports.map((item) => (
            <div key={item.report.id} className="admin-subrow">
              <strong>{item.report.productName || item.report.domain}</strong>
              <span className="faint">
                {item.clientEmail ?? 'unknown client'} · {item.report.status} · {item.latestScanState ?? 'no scan'} · created {formatDateTime(item.report.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AuthScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <Brand />
        <span className="spacer" />
        <span className="draftpill hide-mob">Secure workspace</span>
      </header>
      <main className="main" id="main" style={{ display: 'grid', placeItems: 'center' }}>
        {children}
      </main>
    </div>
  );
}

function MarketingShell({
  children,
  actions,
  pageActions,
}: {
  children: ReactNode;
  actions?: ReactNode;
  pageActions?: (args: { page: MarketingPage; goTo: (page: MarketingPage) => void }) => ReactNode;
}) {
  const [page, setPage] = useState<MarketingPage>(getMarketingPageFromHash());

  useEffect(() => {
    const onHashChange = () => setPage(getMarketingPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const goTo = (next: MarketingPage) => {
    window.location.hash = next === 'home' ? '' : next;
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app landing-app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <Brand />
        {pageActions?.({ page, goTo })}
        <span className="spacer" />
        <span className="draftpill hide-mob">Accessibility report workspace</span>
        {actions}
      </header>
      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}

/** AccessOps mark: accessibility figure inside the continuous-operations ring.
 *  White on transparent — the `.mark` container provides the indigo tile. */
function BrandMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="23" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" />
      <circle cx="32" cy="15" r="5" fill="#fff" />
      <path
        d="M19 26 H45 M32 21 V38 M32 38 L23 49 M32 38 L41 49"
        fill="none"
        stroke="#fff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="mark">
        <BrandMark />
      </span>
      <span className="name">
        {BRAND_NAME}<span className="sub">{BRAND_SUB}</span>
      </span>
    </div>
  );
}

function getMarketingPageFromHash(): MarketingPage {
  const raw = window.location.hash.replace(/^#/, '');
  return MARKETING_PAGES.some((page) => page.id === raw) ? (raw as MarketingPage) : 'home';
}

function MarketingSite({
  error,
  onLogin,
  onSignup,
}: {
  error: string | null;
  onLogin: () => void;
  onSignup: () => void;
}) {
  const [page, setPage] = useState<MarketingPage>(getMarketingPageFromHash());

  useEffect(() => {
    const onHashChange = () => setPage(getMarketingPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (page === 'pricing') return <PricingPage onLogin={onLogin} onSignup={onSignup} />;
  if (page === 'faq') return <FaqPage onSignup={onSignup} />;
  if (page === 'about') return <StartupPage onLogin={onLogin} onSignup={onSignup} />;
  if (page === 'terms') return <TermsPage onSignup={onSignup} />;
  return <HomePage error={error} onLogin={onLogin} onSignup={onSignup} />;
}

function HomePage({ error, onLogin, onSignup }: { error: string | null; onLogin: () => void; onSignup: () => void }) {
  return (
    <>
      <section className="landing-hero">
        <div className="landing-orb landing-orb-a" aria-hidden="true" />
        <div className="landing-orb landing-orb-b" aria-hidden="true" />
        <div className="landing-grid">
          <div className="col" style={{ gap: 18, alignItems: 'flex-start' }}>
            <span className="badge b-ok">VPAT 2.5Rev Editions</span>
            <div>
              <div className="eyebrow">Accessibility Reporting, Modernized</div>
              <h1 className="landing-title">AccessOps helps teams draft VPAT reports with evidence, speed, and review discipline.</h1>
            </div>
            <p className="lead landing-lead">
              {BRAND_NAME} scans a website, drafts an Accessibility Conformance Report, guides your team through every
              criterion, and exports a review-ready document without pretending automation replaces accessibility expertise.
            </p>
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn btn-primary" onClick={onSignup}>
                Create account
                <Icons.arrowR size={16} className="ic" />
              </button>
              <button className="btn btn-ghost" onClick={onLogin}>
                Log in
              </button>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="tag">Secure team workspace</span>
              <span className="tag">WCAG, 508, EU, or International</span>
              <span className="tag">Human approval required</span>
            </div>
            {error && (
              <div role="alert" className="landing-alert">
                <span style={{ color: 'var(--bad)', marginTop: 1 }}>
                  <Icons.alert size={16} />
                </span>
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="landing-hero-card panel">
            <div className="micro muted" style={{ marginBottom: 14 }}>
              What happens after sign-in
            </div>
            <div className="col" style={{ gap: 12 }}>
              {[
                ['01', 'Target the product', 'Start with a domain, conformance target, and crawl scope.'],
                ['02', 'Capture evidence', 'Run automated checks and gather the raw material behind each finding.'],
                ['03', 'Review the draft', 'Edit conformance language, approve each criterion, and add evaluator attestation.'],
              ].map(([n, title, copy]) => (
                <div key={n} className="landing-mini-step">
                  <span className="landing-step-num">{n}</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {copy}
                    </div>
                  </span>
                </div>
              ))}
            </div>
            <hr className="divider" style={{ margin: '18px 0' }} />
            <div className="micro muted" style={{ marginBottom: 10 }}>
              Why teams use it
            </div>
            <div className="landing-metrics">
              <div>
                <div className="landing-metric-num">3</div>
                <div className="faint">official VPAT edition options in one workflow</div>
              </div>
              <div>
                <div className="landing-metric-num">1</div>
                <div className="faint">review surface for every criterion</div>
              </div>
              <div>
                <div className="landing-metric-num">0</div>
                <div className="faint">auto-finalized reports without human approval</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <div className="eyebrow">What {BRAND_NAME} Does</div>
          <h2 className="landing-section-title">A focused workflow for drafting serious accessibility documentation.</h2>
          <p className="lead">
            The product is built for teams that need to explain accessibility clearly to buyers, procurement teams,
            partners, and internal stakeholders without losing rigor.
          </p>
        </div>
        <div className="landing-cards">
          {LANDING_PILLARS.map((item) => (
            <article key={item.title} className="card landing-feature-card">
              <span className="landing-icon">{item.icon({ size: 18 })}</span>
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-copy">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-split">
          <div className="card">
            <div className="eyebrow">How It Works</div>
            <h2 className="landing-section-title" style={{ marginTop: 12 }}>
              From scan to draft report in a controlled review loop.
            </h2>
            <div className="col" style={{ gap: 14, marginTop: 18 }}>
              {LANDING_STEPS.map((step, index) => (
                <div key={step} className="landing-mini-step">
                  <span className="landing-step-num">{String(index + 1).padStart(2, '0')}</span>
                  <span style={{ fontSize: 14 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="eyebrow">Why It Matters</div>
            <h2 className="landing-section-title" style={{ marginTop: 12 }}>
              Accessibility reports shape trust, procurement, and accountability.
            </h2>
            <div className="col" style={{ gap: 12, marginTop: 18 }}>
              {IMPORTANCE_POINTS.map((point) => (
                <div key={point} className="landing-importance-row">
                  <span style={{ color: 'var(--accent)', marginTop: 2 }}>{Icons.checkCircle({ size: 16 })}</span>
                  <span style={{ fontSize: 14 }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <LandingCta
        title="Start building your first draft Accessibility Conformance Report."
        body="Create an account to open the secure workspace, review findings with your team, and turn incoming procurement requests into a repeatable process."
        primaryLabel="Create account"
        secondaryLabel="See pricing"
        onPrimary={onSignup}
        secondaryHref="#pricing"
      />
    </>
  );
}

function PricingPage({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <>
      <section className="landing-section">
        <div className="landing-section-head">
          <div className="eyebrow">Pricing</div>
          <h1 className="landing-section-title">Simple plans for teams moving from one-off VPAT requests to repeatable accessibility operations.</h1>
          <p className="lead">
            Startups usually begin with one urgent questionnaire and then discover the need keeps coming back. These plans
            are designed around that reality, with annual pricing that fits budgeting and procurement cycles.
          </p>
        </div>
        <div className="landing-cards">
          {PRICING_TIERS.map((tier) => (
            <article key={tier.name} className={`card landing-feature-card${tier.featured ? ' landing-featured-card' : ''}`}>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h3 className="landing-card-title" style={{ marginTop: 0 }}>{tier.name}</h3>
                  <p className="landing-card-copy">{tier.summary}</p>
                </div>
                {tier.featured && <span className="badge b-ok">Most popular</span>}
              </div>
              <div className="landing-price-row">
                <span className="landing-price">{tier.price}</span>
                <span className="faint">{tier.cadence}</span>
              </div>
              <div className="col" style={{ gap: 10, marginTop: 18 }}>
                {tier.features.map((feature) => (
                  <div key={feature} className="landing-importance-row">
                    <span style={{ color: 'var(--accent)', marginTop: 2 }}>{Icons.checkCircle({ size: 16 })}</span>
                    <span style={{ fontSize: 14 }}>{feature}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-split">
          <div className="card">
            <div className="eyebrow">What’s Included</div>
            <h2 className="landing-section-title" style={{ marginTop: 12 }}>
              Every plan is built around the same core reporting workflow.
            </h2>
            <div className="col" style={{ gap: 12, marginTop: 18 }}>
              {[
                'Structured draft reports aligned to VPAT 2.5Rev edition requirements',
                'Criterion-by-criterion human approval workflow',
                'Product metadata and evaluator attestation capture',
                'Exportable draft reports for internal and buyer review',
              ].map((item) => (
                <div key={item} className="landing-importance-row">
                  <span style={{ color: 'var(--accent)', marginTop: 2 }}>{Icons.doc({ size: 16 })}</span>
                  <span style={{ fontSize: 14 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Best Fit</div>
            <h2 className="landing-section-title" style={{ marginTop: 12 }}>
              A strong match for startups selling into accessibility-conscious buyers.
            </h2>
            <p className="lead" style={{ marginTop: 12, fontSize: 15 }}>
              If your team is responding to security reviews, procurement checklists, public-sector buying requirements, or enterprise vendor onboarding, this is usually where the value shows up first.
            </p>
            <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
              <span className="tag">B2B SaaS</span>
              <span className="tag">Healthcare</span>
              <span className="tag">EdTech</span>
              <span className="tag">GovTech</span>
              <span className="tag">Procurement-heavy sales</span>
            </div>
          </div>
        </div>
      </section>

      <LandingCta
        title="Pick a plan when you’re ready to operationalize accessibility reporting."
        body="Create an account to explore the workspace first, or log in if your team already has access."
        primaryLabel="Create account"
        secondaryLabel="Log in"
        onPrimary={onSignup}
        onSecondary={onLogin}
      />
    </>
  );
}

function FaqPage({ onSignup }: { onSignup: () => void }) {
  return (
    <>
      <section className="landing-section">
        <div className="landing-section-head">
          <div className="eyebrow">FAQ</div>
          <h1 className="landing-section-title">Common questions from teams evaluating VPAT Builder for the first time.</h1>
        </div>
        <div className="col" style={{ gap: 10 }}>
          {FAQS.map((item, index) => (
            <details key={item.q} className="card" open={index === 0}>
              <summary className="landing-faq-summary">{item.q}</summary>
              <p className="landing-card-copy" style={{ marginTop: 10 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="card">
          <div className="eyebrow">Still Evaluating</div>
          <h2 className="landing-section-title" style={{ marginTop: 12 }}>
            The core idea is straightforward: move from scattered accessibility answers to a structured, reviewable report workflow.
          </h2>
          <p className="lead" style={{ marginTop: 12 }}>
            Most startups do not need another generic scanner. They need a way to turn accessibility work into documentation that buyers, legal teams, and procurement stakeholders can understand.
          </p>
        </div>
      </section>

      <LandingCta
        title="See how the workspace turns findings into a report."
        body="Create an account to move from the public product site into the review flow."
        primaryLabel="Create account"
        secondaryLabel="See pricing"
        onPrimary={onSignup}
        secondaryHref="#pricing"
      />
    </>
  );
}

function StartupPage({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <>
      <section className="landing-section">
        <div className="landing-section-head">
          <div className="eyebrow">For Startups</div>
          <h1 className="landing-section-title">Why early-stage teams care about VPATs sooner than they expect.</h1>
          <p className="lead">
            Founders often discover accessibility reporting during a live deal, a customer security review, or a public-sector procurement process. AccessOps is built for that moment and what comes after it.
          </p>
        </div>
        <div className="landing-cards">
          {STARTUP_POINTS.map((item) => (
            <article key={item.title} className="card landing-feature-card">
              <span className="landing-icon">{Icons.shield({ size: 18 })}</span>
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-copy">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-split">
          <div className="card">
            <div className="eyebrow">Typical Trigger</div>
            <h2 className="landing-section-title" style={{ marginTop: 12 }}>
              “A prospect asked for our VPAT. We don’t have one.”
            </h2>
            <p className="lead" style={{ marginTop: 12, fontSize: 15 }}>
              That is the common starting point. The immediate need is a draft report. The longer-term need is a workflow the team can return to every quarter, release, and customer review cycle.
            </p>
          </div>

          <div className="card">
            <div className="eyebrow">What Changes</div>
            <h2 className="landing-section-title" style={{ marginTop: 12 }}>
              The team gets a system instead of a scramble.
            </h2>
            <div className="col" style={{ gap: 12, marginTop: 18 }}>
              {[
                'PMs and founders can understand the process without becoming accessibility specialists overnight.',
                'Accessibility leads and consultants keep review control instead of cleaning up unstructured notes later.',
                'Sales and customer-facing teams get a clearer answer to share when buyers ask what accessibility support looks like today.',
              ].map((item) => (
                <div key={item} className="landing-importance-row">
                  <span style={{ color: 'var(--accent)', marginTop: 2 }}>{Icons.sparkle({ size: 16 })}</span>
                  <span style={{ fontSize: 14 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <LandingCta
        title="Turn your first VPAT request into a repeatable process."
        body="Create an account to start the workflow, or log in if your team is already using AccessOps."
        primaryLabel="Create account"
        secondaryLabel="Log in"
        onPrimary={onSignup}
        onSecondary={onLogin}
      />
    </>
  );
}

function TermsPage({ onSignup }: { onSignup: () => void }) {
  return (
    <>
      <section className="landing-section">
        <div className="landing-section-head">
          <div className="eyebrow">Terms & Conditions</div>
          <h1 className="landing-section-title">Terms governing use of the AccessOps VPAT Builder platform.</h1>
          <p className="lead">
            Effective date: June 22, 2026. This page provides a working terms template for the product experience and
            should still be reviewed by counsel before you treat it as final legal language.
          </p>
        </div>

        <div className="terms-shell">
          <article className="card terms-intro-card">
            <p className="landing-card-copy" style={{ marginTop: 0 }}>
              By accessing or using AccessOps, you agree to these Terms &amp; Conditions. If you are accepting these
              Terms on behalf of a company or other legal entity, you represent that you have authority to bind that
              entity to these Terms.
            </p>
          </article>

          <div className="terms-grid">
            {TERMS_SECTIONS.map((section) => (
              <article key={section.title} className="card terms-card">
                <h2 className="terms-card-title">{section.title}</h2>
                <div className="col" style={{ gap: 12 }}>
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="landing-card-copy terms-copy">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <LandingCta
        title="Create an account when you’re ready to use the platform."
        body="You can review pricing, create a workspace, and manage subscription terms from the billing flow after sign-up."
        primaryLabel="Create account"
        secondaryLabel="See pricing"
        onPrimary={onSignup}
        secondaryHref="#pricing"
      />
    </>
  );
}

function LandingCta({
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  secondaryHref,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  secondaryHref?: string;
}) {
  return (
    <section className="landing-section">
      <div className="landing-cta panel">
        <div>
          <div className="eyebrow">Ready To Start</div>
          <h2 className="landing-section-title" style={{ marginTop: 12 }}>
            {title}
          </h2>
          <p className="lead" style={{ marginTop: 10 }}>{body}</p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          {onPrimary && <button className="btn btn-primary" onClick={onPrimary}>{primaryLabel}</button>}
          {onSecondary && <button className="btn btn-ghost" onClick={onSecondary}>{secondaryLabel}</button>}
          {!onSecondary && secondaryHref && (
            <a className="btn btn-ghost" href={secondaryHref}>
              {secondaryLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function WizardApp({
  account,
  initialDetail,
  onAccountChange,
  onUpgradeGrowth,
  onBackToReports,
  accountControls,
}: {
  account?: AccountSummary | null;
  initialDetail?: ReportDetail | null;
  onAccountChange?: (account: AccountSummary) => void;
  onUpgradeGrowth?: (() => void) | null;
  onBackToReports?: (() => void) | null;
  accountControls?: ReactNode;
}) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [form, setForm] = useState<WizardForm>({ edition: DEFAULT_EDITION });
  const [findings, setFindings] = useState<Finding[]>(initFindings);
  const [meta, setMeta] = useState<ReportMeta>(() => emptyReportMeta());
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [reportId, setReportId] = useState<string | undefined>();
  const [scanId, setScanId] = useState<string | undefined>();
  const [flowError, setFlowError] = useState<string | null>(null);

  // Holds the in-flight createReport so startScan can await it without a race.
  const reportPromise = useRef<Promise<string> | null>(null);

  useEffect(() => {
    if (!initialDetail) return;

    const { report, scan, findings: detailFindings, pages: detailPages } = initialDetail;
    setForm({
      domain: report.domain,
      level: report.wcagTarget,
      edition: report.edition,
      scope: report.scope,
      authMode: scan?.authMode ?? 'public',
    });
    setFindings(detailFindings.length ? detailFindings : initFindingsForEdition(report.edition));
    setMeta({
      productName: report.productName ?? '',
      productVersion: report.productVersion ?? '',
      vendorName: report.vendorName ?? '',
      contactEmail: report.contactEmail ?? '',
      productDescription: report.productDescription ?? '',
      evaluationMethods: report.evaluationMethods ?? '',
      assistiveTech: report.assistiveTech,
      testEnvironments: report.testEnvironments,
      evaluatorName: report.evaluatorName ?? '',
      evaluatorOrg: report.evaluatorOrg ?? '',
      evaluationStart: report.evaluationStart ?? '',
      evaluationEnd: report.evaluationEnd ?? '',
      notes: report.notes ?? '',
    });
    setPages(detailPages);
    setReportId(report.id);
    setScanId(scan?.id);
    reportPromise.current = Promise.resolve(report.id);
    setFlowError(null);

    let nextStep = 1;
    if (report.status === 'final') nextStep = 6;
    else if (report.status === 'review') nextStep = 4;
    else if (scan?.state === 'drafting') nextStep = 3;
    else if (scan?.state === 'queued' || scan?.state === 'running') nextStep = 2;
    else if (scan?.state === 'done') nextStep = 4;

    setStep(nextStep);
    setReached(nextStep);
  }, [initialDetail]);

  const go = (n: number) => {
    setStep(n);
    setReached((r) => Math.max(r, n));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const set = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));
  const restart = () => {
    if (onBackToReports) {
      onBackToReports();
      return;
    }
    setForm({ edition: DEFAULT_EDITION });
    setFindings(initFindingsForEdition(DEFAULT_EDITION));
    setMeta(emptyReportMeta());
    setPages([]);
    setReportId(undefined);
    setScanId(undefined);
    setFlowError(null);
    reportPromise.current = null;
    setStep(0);
    setReached(0);
    window.scrollTo({ top: 0 });
  };

  /* ---- step transitions (with backend side-effects when hasApi) ---- */

  const onDomainNext = async (v: DomainCommit) => {
    setFlowError(null);
    set(v);
    setFindings(initFindingsForEdition(v.edition));
    setMeta((cur) => ({ ...emptyReportMeta(v.domain), ...cur, productName: cur.productName || emptyReportMeta(v.domain).productName, contactEmail: cur.contactEmail || emptyReportMeta(v.domain).contactEmail }));
    if (hasApi) {
      try {
        reportPromise.current = api
          .createReport({ domain: v.domain, wcagTarget: v.level, edition: v.edition, scope: v.scope })
          .then((r) => {
            setReportId(r.reportId);
            return r.reportId;
          });
        await reportPromise.current;
        if (onAccountChange) {
          api.getAccount().then(onAccountChange).catch((err) => console.error('refreshAccount failed', err));
        }
      } catch (e) {
        console.error('createReport failed', e);
        setFlowError(e instanceof Error ? e.message : 'Could not create report');
        reportPromise.current = null;
        return;
      }
    }
    go(1);
  };

  const onCredsNext = (v: CredsCommit) => {
    setFlowError(null);
    set(v);
    if (hasApi) {
      void (async () => {
        try {
          const rid = (await reportPromise.current) ?? reportId;
          if (!rid) throw new Error('no reportId');
          const r = await api.startScan(rid, {
            authMode: v.authMode,
            user: v.user,
            pass: v.pass,
            loginUrl: v.loginUrl,
          });
          setScanId(r.scanId);
        } catch (e) {
          console.error('startScan failed', e);
          setFlowError(e instanceof Error ? e.message : 'Could not start scan');
        }
      })();
    }
    go(2);
  };

  // Entering Review: pull the server-drafted findings into state.
  const onGenerateNext = () => {
    if (hasApi && reportId) {
      api
        .getReport(reportId)
        .then((detail) => {
          if (detail.findings.length) setFindings(detail.findings);
          if (detail.pages?.length) setPages(detail.pages);
        })
        .catch((e) => console.error('getReport failed', e))
        .finally(() => go(4));
      return;
    }
    go(4);
  };

  // Leaving Details: persist the metadata + attestation, then assemble.
  const onDetailsNext = (m: ReportMeta) => {
    setMeta(m);
    if (hasApi && reportId) {
      api.updateReport(reportId, m).catch((e) => console.error('updateReport failed', e));
    }
    go(6);
  };

  const key = STEPS[step].key;
  const activeLimitReached =
    account?.activeReportLimit !== null &&
    account?.activeReportLimit !== undefined &&
    account.activeReports >= account.activeReportLimit;
  const domainBlockedMessage = subscriptionIssueMessage(account)
    ? subscriptionIssueMessage(account)
    : activeLimitReached
      ? `Your ${account?.plan} plan is already using ${account?.activeReports}/${account?.activeReportLimit} active reports. Finalize an existing report or upgrade to continue.`
      : flowError && key === 'domain'
        ? flowError
        : null;
  const authUpgradeMessage =
    account && !account.canUseAuthenticatedScans
      ? `Authenticated scans are available on Growth and Enterprise. Your ${account.plan} plan can still evaluate public pages and export draft reports.`
      : flowError && key === 'creds'
        ? flowError
        : null;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar">
        <Brand />
        <nav className="stepper" aria-label="Progress">
          {STEPS.map((s, i) => {
            const stateCls = i === step ? 'active' : i < reached || i < step ? 'done' : '';
            return (
              <Fragment key={s.key}>
                {i > 0 && <span className="step-divider" />}
                <button
                  className={`step ${stateCls}`}
                  onClick={() => i <= reached && go(i)}
                  disabled={i > reached}
                  aria-current={i === step ? 'step' : undefined}
                  style={{ cursor: i <= reached ? 'pointer' : 'default' }}
                >
                  <span className="num">{i < step ? <Icons.check size={11} sw={3} /> : i + 1}</span>
                  <span className="lbl">{s.label}</span>
                </button>
              </Fragment>
            );
          })}
        </nav>
        <span className="spacer" />
        {accountControls}
        <span className="draftpill hide-mob">Draft · auto-saved</span>
      </header>

      <main className="main" id="main">
        {key === 'domain' && (
          <DomainScreen
            state={form}
            onNext={onDomainNext}
            blockedMessage={domainBlockedMessage}
            onUpgrade={activeLimitReached ? onUpgradeGrowth : null}
          />
        )}
        {key === 'creds' && (
          <CredentialsScreen
            state={form}
            onNext={onCredsNext}
            onBack={() => go(0)}
            allowAuthenticatedScan={account?.canUseAuthenticatedScans ?? true}
            upgradeMessage={authUpgradeMessage}
            onUpgrade={account && !account.canUseAuthenticatedScans ? onUpgradeGrowth : null}
          />
        )}
        {key === 'examine' && (
          <ExaminingScreen state={form} scanId={scanId} onNext={() => go(3)} onBack={() => go(1)} />
        )}
        {key === 'generate' && (
          <GeneratingScreen
            edition={form.edition ?? DEFAULT_EDITION}
            findings={findings}
            scanId={scanId}
            onNext={onGenerateNext}
            onBack={() => go(2)}
          />
        )}
        {key === 'review' && (
          <ReviewScreen
            edition={form.edition ?? DEFAULT_EDITION}
            findings={findings}
            setFindings={setFindings}
            reportId={reportId}
            onNext={() => go(5)}
            onBack={() => go(3)}
          />
        )}
        {key === 'details' && (
          <DetailsScreen
            state={meta}
            domain={form.domain ?? ''}
            findings={findings}
            pages={
              hasApi && pages.length
                ? pages
                : PAGES.filter((p) => form.authMode === 'auth' || !p.auth).map((p) => ({
                    url: p.url,
                    title: p.title,
                    isAuth: p.auth,
                  }))
            }
            onNext={onDetailsNext}
            onBack={() => go(4)}
          />
        )}
        {key === 'report' && (
          <DownloadScreen
            state={form}
            meta={meta}
            findings={findings}
            edition={form.edition ?? DEFAULT_EDITION}
            reportId={reportId}
            onBack={() => go(5)}
            onRestart={restart}
            onExported={() => {
              if (onAccountChange) {
                api.getAccount().then(onAccountChange).catch((err) => console.error('refreshAccount failed', err));
              }
            }}
          />
        )}
      </main>

      <MobileProgress step={step} total={STEPS.length} label={STEPS[step].label} />
    </div>
  );
}

function MobileProgress({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div style={{ position: 'sticky', bottom: 0, zIndex: 20 }} className="mob-prog">
      <div
        className="row"
        style={{
          gap: 12,
          padding: '10px 16px',
          background: 'color-mix(in oklab,var(--surface) 92%,transparent)',
          backdropFilter: 'blur(8px)',
          borderTop: 'var(--hair)',
        }}
      >
        <span className="micro muted" style={{ flex: 'none' }}>
          {String(step + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <div className="bar" style={{ flex: 1 }}>
          <span style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <span className="micro" style={{ flex: 'none', fontWeight: 600 }}>
          {label}
        </span>
      </div>
    </div>
  );
}
