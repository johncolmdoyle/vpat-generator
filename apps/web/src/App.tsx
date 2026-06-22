/* App — wizard orchestrator: top bar, stepper, state machine.
   Runs the local mock flow by default; when `hasApi`, drives the real backend. */
import { useAuth0 } from '@auth0/auth0-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  type AccountSummary,
  CRITERIA,
  PAGES,
  emptyReportMeta,
  toFinding,
  type AuthMode,
  type CrawlScope,
  type Finding,
  type PageInfo,
  type ReportDetail,
  type ReportMeta,
  type ReportRecord,
  type SelfServePlan,
  type WcagTarget,
  type WizardForm,
} from '@vpat/shared';
import { Icons } from './ui/icons.js';
import { AUTH0_AUDIENCE, AUTH0_CLIENT_ID, AUTH0_DOMAIN, hasApi, hasAuth, hasPartialAuthConfig } from './config.js';
import { api, setAccessTokenProvider } from './api/client.js';
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
const MARKETING_PAGES = [
  { id: 'home', label: 'Overview' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
  { id: 'about', label: 'For Startups' },
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
    body: 'Crawl public or authenticated flows, capture evidence, and organize findings against the VPAT 2.5Rev International Edition structure.',
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

const FAQS = [
  {
    q: 'What does VPAT Builder actually produce?',
    a: 'It helps your team create a draft Accessibility Conformance Report based on the VPAT 2.5Rev International Edition, including WCAG, Revised Section 508, and EN 301 549 coverage.',
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
  return CRITERIA.map(toFinding);
}

export type DomainCommit = { domain: string; level: WcagTarget; scope: CrawlScope };
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
    if (!hasApi || !isAuthenticated) return;
    void refreshAccount();
    void refreshReports();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!hasApi || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    const sessionId = params.get('session_id');
    if (state === 'cancel') {
      setPendingCheckout(null);
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
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        url.searchParams.delete('session_id');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      })
      .catch((e) => console.error('confirmCheckout failed', e))
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
        checkoutLaunchStarted.current = false;
      })
      .finally(() => setBillingBusy(false));
  }, [account, billingBusy, isAuthenticated, pendingCheckoutPlan]);

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
      userLabel={user?.email ?? user?.name ?? 'Signed in'}
      onCreateReport={() => {
        setActiveDetail(null);
        setActiveView('wizard');
      }}
      onOpenReport={(reportId) => void openReport(reportId)}
      onRefresh={() => void refreshReports()}
      onUpgradeGrowth={() => void openUpgradeFlow()}
      onManageBilling={() => void openPortal()}
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
  userLabel,
  onCreateReport,
  onOpenReport,
  onRefresh,
  onUpgradeGrowth,
  onManageBilling,
  onSignout,
}: {
  account: AccountSummary | null;
  reports: ReportRecord[];
  reportsLoading: boolean;
  reportsError: string | null;
  billingBusy: boolean;
  userLabel: string;
  onCreateReport: () => void;
  onOpenReport: (reportId: string) => void;
  onRefresh: () => void;
  onUpgradeGrowth: () => void;
  onManageBilling: () => void;
  onSignout: () => void;
}) {
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
        {account?.plan === 'starter' && (
          <button className="btn btn-primary btn-sm" onClick={onUpgradeGrowth} disabled={billingBusy}>
            {billingBusy ? 'Opening billing…' : 'Upgrade'}
          </button>
        )}
        {account?.canManageBilling && (
          <button className="btn btn-ghost btn-sm" onClick={onManageBilling} disabled={billingBusy}>
            {billingBusy ? 'Opening billing…' : 'Manage billing'}
          </button>
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
            <button className="btn btn-primary" onClick={onCreateReport}>
              New report
            </button>
            <button className="btn btn-ghost" onClick={onRefresh} disabled={reportsLoading}>
              {reportsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
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
                    <span className="tag">{report.wcagTarget}</span>
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
      </main>
    </div>
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

function Brand() {
  return (
    <div className="brand">
      <span className="mark">AO</span>
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
            <span className="badge b-ok">VPAT 2.5Rev International Edition</span>
            <div>
              <div className="eyebrow">Accessibility Reporting, Modernized</div>
              <h1 className="landing-title">AccessOps helps teams draft VPAT reports with evidence, speed, and review discipline.</h1>
            </div>
            <p className="lead landing-lead">
              {BRAND_SUB} scans a website, drafts an Accessibility Conformance Report, guides your team through every
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
              <span className="tag">WCAG + Section 508 + EN 301 549</span>
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
                <div className="faint">standards aligned in one reporting flow</div>
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
          <div className="eyebrow">What {BRAND_SUB} Does</div>
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
                'Structured draft reports aligned to VPAT 2.5Rev International Edition',
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
  const [form, setForm] = useState<WizardForm>({});
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
      scope: report.scope,
      authMode: scan?.authMode ?? 'public',
    });
    setFindings(detailFindings.length ? detailFindings : initFindings());
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
    setForm({});
    setFindings(initFindings());
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
    setMeta((cur) => ({ ...emptyReportMeta(v.domain), ...cur, productName: cur.productName || emptyReportMeta(v.domain).productName, contactEmail: cur.contactEmail || emptyReportMeta(v.domain).contactEmail }));
    if (hasApi) {
      try {
        reportPromise.current = api
          .createReport({ domain: v.domain, wcagTarget: v.level, scope: v.scope })
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
  const domainBlockedMessage = activeLimitReached
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
          <GeneratingScreen findings={findings} scanId={scanId} onNext={onGenerateNext} onBack={() => go(2)} />
        )}
        {key === 'review' && (
          <ReviewScreen
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
