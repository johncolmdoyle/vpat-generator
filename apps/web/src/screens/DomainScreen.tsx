/* Step 1 — Target: domain, WCAG conformance target, crawl scope. */
import { useState } from 'react';
import type { CrawlScope, WcagTarget, WizardForm } from '@vpat/shared';
import { Icons } from '../ui/icons.js';
import { NavBar } from '../ui/components.js';

const INT_STANDARDS = [
  { label: 'WCAG 2.0 / 2.1 / 2.2', note: 'W3C Web Content Accessibility Guidelines' },
  { label: 'Revised Section 508', note: 'U.S. federal procurement' },
  { label: 'EN 301 549', note: 'European public sector (V3.1.1 & V3.2.1)' },
];
const LEVELS: [WcagTarget, string, string][] = [
  ['A', 'Level A', 'Minimum'],
  ['AA', 'Level A & AA', 'Standard target'],
  ['AAA', 'Level A, AA & AAA', 'Most stringent'],
];
const SCOPES: [CrawlScope, string, string][] = [
  ['auto', 'Auto-discover', 'Up to 25 reachable pages'],
  ['single', 'This page only', 'Single URL'],
  ['sitemap', 'From sitemap', 'Use /sitemap.xml'],
];

const pillStyle = (on: boolean) => ({
  padding: '10px 14px',
  borderRadius: 'var(--radius-pill)',
  fontSize: 13,
  fontWeight: 600,
  border: on ? '1.5px solid var(--accent)' : '1px solid var(--border-strong)',
  background: on ? 'color-mix(in oklab, var(--accent) 10%, var(--surface))' : 'var(--surface)',
  color: on ? 'var(--accent)' : 'var(--text-muted)',
});

export function DomainScreen({
  state,
  onNext,
  blockedMessage,
  onUpgrade,
}: {
  state: WizardForm;
  onNext: (v: { domain: string; level: WcagTarget; scope: CrawlScope }) => void;
  blockedMessage?: string | null;
  onUpgrade?: (() => void) | null;
}) {
  const [domain, setDomain] = useState(state.domain ?? '');
  const [level, setLevel] = useState<WcagTarget>(state.level ?? 'AA');
  const [scope, setScope] = useState<CrawlScope>(state.scope ?? 'auto');
  const valid = domain.trim().length > 2 && domain.includes('.');

  const commit = () => onNext({ domain: domain.trim(), level, scope });

  return (
    <div className="screen" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="eyebrow">Step 01 — Target</div>
      <h1 className="title">What site should we evaluate?</h1>
      <p className="lead">
        We’ll crawl the site, run automated checks, and assemble a draft{' '}
        <strong>Accessibility Conformance Report</strong> on the VPAT® 2.5Rev{' '}
        <strong>International Edition</strong> template.
      </p>

      <div className="field" style={{ marginTop: 30 }}>
        <label htmlFor="dom">Website URL</label>
        <div className="input-prefix">
          <span className="pfx">https://</span>
          <input
            id="dom"
            value={domain}
            placeholder="clarus-health.example"
            onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\//, ''))}
            onKeyDown={(e) => e.key === 'Enter' && valid && commit()}
            autoFocus
          />
        </div>
        <div className="row wrap" style={{ gap: 7, marginTop: 4 }}>
          <span className="hint">Try:</span>
          {['clarus-health.example', 'northwind-portal.example'].map((s) => (
            <button key={s} className="tag" style={{ cursor: 'pointer' }} onClick={() => setDomain(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 28, padding: '16px 18px' }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="micro muted">Standards covered — International Edition</span>
          <span className="tag">All three included</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          {INT_STANDARDS.map((s) => (
            <div key={s.label} className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--ok)', marginTop: 1 }}>
                <Icons.checkCircle size={16} />
              </span>
              <span>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  {s.note}
                </div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="micro muted" style={{ marginBottom: 12 }}>
          WCAG conformance target
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {LEVELS.map(([id, l, d]) => (
            <button key={id} onClick={() => setLevel(id)} style={pillStyle(level === id)} title={d}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="micro muted" style={{ marginBottom: 12 }}>
          Crawl scope
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {SCOPES.map(([id, l, d]) => (
            <button key={id} onClick={() => setScope(id)} style={pillStyle(scope === id)} title={d}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {blockedMessage && (
        <div
          role="alert"
          style={{
            marginTop: 18,
            padding: '13px 15px',
            background: 'var(--warn-bg)',
            border: '1px solid color-mix(in oklab, var(--warn) 30%, transparent)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--warn)',
            fontSize: 13,
          }}
        >
          {blockedMessage}
          {onUpgrade && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={onUpgrade}>
                Upgrade plan
              </button>
            </div>
          )}
        </div>
      )}

      <NavBar back={false} onNext={commit} disabled={!valid || !!blockedMessage} nextLabel="Set up access" />
    </div>
  );
}
