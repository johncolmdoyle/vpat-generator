/* Step 3 — Examine: live crawl/axe pipeline with counters + activity log.
   With a scanId it streams real events over SSE; otherwise it simulates locally. */
import { useEffect, useRef, useState } from 'react';
import { PAGES, SCAN_PHASES, type WizardForm } from '@vpat/shared';
import { Icons } from '../ui/icons.js';
import { NavBar, Spinner, Stat } from '../ui/components.js';
import { hasApi } from '../config.js';
import { api } from '../api/client.js';

type LogEntry = { t: 'phase' | 'ok' | 'warn'; text: string; meta?: string };
type QueueItem =
  | { kind: 'phase'; idx: number; text: string }
  | { kind: 'page'; phase: number; url: string; title: string };

export function ExaminingScreen({
  state,
  scanId,
  onNext,
  onBack,
}: {
  state: WizardForm;
  scanId?: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const phases = SCAN_PHASES;
  const localPages = PAGES.filter((p) => state.authMode === 'auth' || !p.auth);
  const [pi, setPi] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [issues, setIssues] = useState(0);
  const [evidence, setEvidence] = useState(0);
  const [pagesCount, setPagesCount] = useState(localPages.length);
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // --- real backend: subscribe to the SSE stream ---
  useEffect(() => {
    if (!hasApi || !scanId) return;
    const unsub = api.streamScan(scanId, (e) => {
      switch (e.kind) {
        case 'phase':
          setPi(e.phase);
          break;
        case 'log':
          setLog((l) => [...l, { t: e.level, text: e.text, meta: e.meta }].slice(-60));
          break;
        case 'counter':
          setPagesCount(e.pages);
          setIssues(e.issues);
          setEvidence(e.evidence);
          break;
        case 'scan-done':
          setPagesCount(e.pages);
          setIssues(e.issues);
          setEvidence(e.evidence);
          setPi(phases.length);
          setDone(true);
          break;
        default:
          break; // draft-* events belong to Step 4
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // --- mock mode: simulate the pipeline ---
  useEffect(() => {
    if (hasApi) return;
    let alive = true;
    let timer: number;
    const queue: QueueItem[] = [];
    phases.forEach((ph, idx) => {
      queue.push({ kind: 'phase', idx, text: ph.label });
      if (ph.key === 'axe' || ph.key === 'render') {
        localPages.forEach((pg) => queue.push({ kind: 'page', phase: idx, url: pg.url, title: pg.title }));
      }
    });
    let qi = 0;
    const step = () => {
      if (!alive) return;
      if (qi >= queue.length) {
        setPi(phases.length);
        setDone(true);
        return;
      }
      const item = queue[qi++];
      if (item.kind === 'phase') {
        setPi(item.idx);
        const entry: LogEntry = { t: 'phase', text: item.text };
        setLog((l) => [...l, entry].slice(-60));
      } else {
        const found = Math.floor(Math.random() * 9);
        setIssues((n) => n + found);
        setEvidence((n) => n + 1 + Math.floor(Math.random() * 2));
        const entry: LogEntry = {
          t: found > 4 ? 'warn' : 'ok',
          text: `GET ${item.url}`,
          meta: found ? `${found} issues · ${item.title}` : `clean · ${item.title}`,
        };
        setLog((l) => [...l, entry].slice(-60));
      }
      timer = window.setTimeout(step, item.kind === 'phase' ? 520 : 230);
    };
    timer = window.setTimeout(step, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const pct = Math.round((Math.min(pi, phases.length) / phases.length) * 100);

  return (
    <div className="screen">
      <div className="row between wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
        <div>
          <div className="eyebrow">Step 03 — Examination</div>
          <h1 className="title" style={{ marginBottom: 4 }}>
            {done ? 'Examination complete' : 'Examining the site'}
          </h1>
          <p className="lead mono" style={{ fontSize: 14 }}>
            https://{state.domain || 'clarus-health.example'}
          </p>
        </div>
        <div className="row" style={{ gap: 22 }}>
          <Stat n={pagesCount} label="pages" />
          <Stat n={issues} label="auto issues" tone="warn" />
          <Stat n={evidence} label="evidence" tone="accent" />
        </div>
      </div>

      <div className="bar" style={{ margin: '20px 0 22px' }}>
        <span style={{ width: `${done ? 100 : pct}%` }} />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 16 }}
        className="exam-grid"
      >
        {/* phase checklist */}
        <div className="panel" style={{ padding: 'var(--pad)' }}>
          <div className="micro muted" style={{ marginBottom: 14 }}>
            Pipeline
          </div>
          <div className="col" style={{ gap: 2 }}>
            {phases.map((ph, i) => {
              const st = i < pi || done ? 'done' : i === pi ? 'active' : 'todo';
              return (
                <div
                  key={ph.key}
                  className="row"
                  style={{ gap: 12, padding: '9px 0', opacity: st === 'todo' ? 0.5 : 1, transition: 'opacity .3s' }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      flex: 'none',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background:
                        st === 'done'
                          ? 'var(--ok-bg)'
                          : st === 'active'
                            ? 'color-mix(in oklab,var(--accent) 14%,transparent)'
                            : 'var(--surface-2)',
                      color: st === 'done' ? 'var(--ok)' : 'var(--accent)',
                      border: st === 'todo' ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    {st === 'done' ? (
                      <Icons.check size={13} sw={2.6} />
                    ) : st === 'active' ? (
                      <Spinner />
                    ) : (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-faint)' }} />
                    )}
                  </span>
                  <span style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ph.label}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>
                      {ph.detail}
                    </div>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* live log */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="row" style={{ gap: 8, padding: '12px 16px', borderBottom: 'var(--hair)' }}>
            <Icons.code size={15} className="faint" />
            <span className="micro muted">Activity log</span>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="tag">{log.length}</span>
          </div>
          <div
            ref={logRef}
            style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.7, padding: '12px 16px', height: 320, overflowY: 'auto' }}
          >
            {log.map((e, i) => (
              <div
                key={i}
                className="row"
                style={{ gap: 8, color: e.t === 'phase' ? 'var(--text)' : 'var(--text-muted)' }}
              >
                {e.t === 'phase' ? (
                  <span style={{ color: 'var(--accent)' }}>▸</span>
                ) : e.t === 'warn' ? (
                  <span style={{ color: 'var(--warn)' }}>!</span>
                ) : (
                  <span style={{ color: 'var(--ok)' }}>✓</span>
                )}
                <span style={{ flex: 1 }}>
                  {e.text}
                  {e.meta && <span className="faint"> — {e.meta}</span>}
                </span>
              </div>
            ))}
            {done && (
              <div style={{ color: 'var(--ok)', marginTop: 8 }}>▸ done · {evidence} evidence items captured</div>
            )}
          </div>
        </div>
      </div>

      <NavBar
        onBack={onBack}
        onNext={done ? onNext : null}
        nextLabel="Draft findings with AI"
        nextIcon={Icons.sparkle}
      >
        {!done && (
          <span className="row faint" style={{ gap: 9, fontSize: 13 }}>
            <Spinner /> Scanning…
          </span>
        )}
      </NavBar>
    </div>
  );
}
