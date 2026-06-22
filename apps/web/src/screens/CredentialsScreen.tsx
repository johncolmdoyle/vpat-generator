/* Step 2 — Access: public-only vs authenticated crawl. */
import { useState } from 'react';
import { PAGES, type AuthMode, type WizardForm } from '@vpat/shared';
import { Icons, type IconProps } from '../ui/icons.js';
import { NavBar } from '../ui/components.js';
import type { ReactNode } from 'react';

const MODES: [AuthMode, (p: IconProps) => ReactNode, string, string][] = [
  ['public', Icons.globe, 'Public pages only', 'Skip authenticated areas'],
  ['auth', Icons.lock, 'Use credentials', 'Sign in to reach gated pages'],
];

export function CredentialsScreen({
  state,
  onNext,
  onBack,
  allowAuthenticatedScan = true,
  upgradeMessage,
  onUpgrade,
}: {
  state: WizardForm;
  onNext: (v: { authMode: AuthMode; user: string; pass: string; loginUrl: string }) => void;
  onBack: () => void;
  allowAuthenticatedScan?: boolean;
  upgradeMessage?: string | null;
  onUpgrade?: (() => void) | null;
}) {
  const [mode, setMode] = useState<AuthMode>(state.authMode ?? 'public');
  const [user, setUser] = useState(state.user ?? '');
  const [pass, setPass] = useState(state.pass ?? '');
  const [loginUrl, setLoginUrl] = useState(state.loginUrl ?? '/login');
  const [show, setShow] = useState(false);
  const ok =
    (mode === 'public' || (user.trim() !== '' && pass.trim() !== '')) &&
    (mode !== 'auth' || allowAuthenticatedScan);

  const commit = () => onNext({ authMode: mode, user, pass, loginUrl });
  const authPages = PAGES.filter((p) => p.auth).length;

  return (
    <div className="screen" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="eyebrow">Step 02 — Access</div>
      <h1 className="title">Can we reach protected pages?</h1>
      <p className="lead">
        {authPages} of the discovered pages sit behind a sign-in. Provide test credentials to evaluate them, or
        scan public pages only.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 28 }}>
        {MODES.map(([id, Ic, title, d]) => (
          <button
            key={id}
            onClick={() => (id === 'auth' && !allowAuthenticatedScan ? setMode('public') : setMode(id))}
            disabled={id === 'auth' && !allowAuthenticatedScan}
            aria-disabled={id === 'auth' && !allowAuthenticatedScan}
            style={{
              textAlign: 'left',
              padding: '18px 18px',
              borderRadius: 'var(--radius)',
              border: mode === id ? '1.5px solid var(--accent)' : '1px solid var(--border-strong)',
              background: mode === id ? 'color-mix(in oklab, var(--accent) 6%, var(--surface))' : 'var(--surface)',
              boxShadow: mode === id ? 'var(--shadow)' : 'none',
              opacity: id === 'auth' && !allowAuthenticatedScan ? 0.55 : 1,
              transition: 'all .14s',
              cursor: id === 'auth' && !allowAuthenticatedScan ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ color: mode === id ? 'var(--accent)' : 'var(--text-muted)' }}>
              <Ic size={22} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15, marginTop: 10 }}>{title}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {id === 'auth' && !allowAuthenticatedScan ? 'Growth plan required' : d}
            </div>
          </button>
        ))}
      </div>

      {!allowAuthenticatedScan && upgradeMessage && (
        <div
          role="note"
          style={{
            marginTop: 16,
            padding: '13px 15px',
            background: 'var(--surface-2)',
            border: 'var(--hair)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          {upgradeMessage}
          {onUpgrade && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={onUpgrade}>
                Upgrade to Growth
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'auth' && allowAuthenticatedScan && (
        <div className="card screen" style={{ marginTop: 16, padding: 'var(--pad)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="u">Username or email</label>
              <input
                id="u"
                className="input"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="qa-tester@clarus.example"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="p">Password</label>
              <div className="input-prefix" style={{ padding: 0 }}>
                <input
                  id="p"
                  type={show ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="off"
                  style={{
                    padding: '11px 13px',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    flex: 1,
                    fontSize: 14.5,
                  }}
                />
                <button
                  className="btn btn-quiet"
                  style={{ padding: '0 12px' }}
                  onClick={() => setShow((s) => !s)}
                  aria-label="Toggle password visibility"
                >
                  <Icons.eye size={16} />
                </button>
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="lu">Login page</label>
              <input
                id="lu"
                className="input"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="/login"
              />
              <span className="hint">
                We’ll submit these once to establish a session, then crawl as the signed-in user.
              </span>
            </div>
          </div>
          <div
            className="row"
            style={{
              gap: 9,
              marginTop: 16,
              padding: '11px 13px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              border: 'var(--hair)',
            }}
          >
            <span style={{ color: 'var(--ok)' }}>
              <Icons.shield size={17} />
            </span>
            <span className="faint" style={{ fontSize: 12.5 }}>
              Credentials are encrypted in transit, used only for this scan, and never written to the report.
            </span>
          </div>
        </div>
      )}

      <NavBar onBack={onBack} onNext={commit} disabled={!ok} nextLabel="Begin examination" nextIcon={Icons.scan} />
    </div>
  );
}
