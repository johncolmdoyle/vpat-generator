/* App — wizard orchestrator: top bar, stepper, state machine.
   Runs the local mock flow by default; when `hasApi`, drives the real backend. */
import { Fragment, useRef, useState } from 'react';
import {
  CRITERIA,
  toFinding,
  type AuthMode,
  type CrawlScope,
  type Finding,
  type WcagTarget,
  type WizardForm,
} from '@vpat/shared';
import { Icons } from './ui/icons.js';
import { hasApi } from './config.js';
import { api } from './api/client.js';
import { DomainScreen } from './screens/DomainScreen.js';
import { CredentialsScreen } from './screens/CredentialsScreen.js';
import { ExaminingScreen } from './screens/ExaminingScreen.js';
import { GeneratingScreen } from './screens/GeneratingScreen.js';
import { ReviewScreen } from './screens/ReviewScreen.js';
import { DownloadScreen } from './screens/DownloadScreen.js';

const STEPS = [
  { key: 'domain', label: 'Target' },
  { key: 'creds', label: 'Access' },
  { key: 'examine', label: 'Examine' },
  { key: 'generate', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'report', label: 'Report' },
] as const;

function initFindings(): Finding[] {
  return CRITERIA.map(toFinding);
}

export type DomainCommit = { domain: string; level: WcagTarget; scope: CrawlScope };
export type CredsCommit = { authMode: AuthMode; user: string; pass: string; loginUrl: string };

export function App() {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [form, setForm] = useState<WizardForm>({});
  const [findings, setFindings] = useState<Finding[]>(initFindings);
  const [reportId, setReportId] = useState<string | undefined>();
  const [scanId, setScanId] = useState<string | undefined>();

  // Holds the in-flight createReport so startScan can await it without a race.
  const reportPromise = useRef<Promise<string> | null>(null);

  const go = (n: number) => {
    setStep(n);
    setReached((r) => Math.max(r, n));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const set = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));
  const restart = () => {
    setForm({});
    setFindings(initFindings());
    setReportId(undefined);
    setScanId(undefined);
    reportPromise.current = null;
    setStep(0);
    setReached(0);
    window.scrollTo({ top: 0 });
  };

  /* ---- step transitions (with backend side-effects when hasApi) ---- */

  const onDomainNext = (v: DomainCommit) => {
    set(v);
    if (hasApi) {
      reportPromise.current = api
        .createReport({ domain: v.domain, wcagTarget: v.level, scope: v.scope })
        .then((r) => {
          setReportId(r.reportId);
          return r.reportId;
        });
      reportPromise.current.catch((e) => console.error('createReport failed', e));
    }
    go(1);
  };

  const onCredsNext = (v: CredsCommit) => {
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
        })
        .catch((e) => console.error('getReport failed', e))
        .finally(() => go(4));
      return;
    }
    go(4);
  };

  const key = STEPS[step].key;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar">
        <div className="brand">
          <span className="mark">Ax</span>
          <span className="name">
            Axiom<span className="sub">VPAT</span>
          </span>
        </div>
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
        <span className="draftpill hide-mob">Draft · auto-saved</span>
      </header>

      <main className="main" id="main">
        {key === 'domain' && <DomainScreen state={form} onNext={onDomainNext} />}
        {key === 'creds' && <CredentialsScreen state={form} onNext={onCredsNext} onBack={() => go(0)} />}
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
        {key === 'report' && (
          <DownloadScreen
            state={form}
            findings={findings}
            reportId={reportId}
            onBack={() => go(4)}
            onRestart={restart}
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
