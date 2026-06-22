/* Step 4 — Draft: per-criterion drafting, chips flip spinner→colored check.
   With a scanId it streams real drafting progress; otherwise it simulates. */
import { useEffect, useState } from 'react';
import { GEN_PHASES, reportsForEdition, type ConformanceLevel, type Finding, type ReportEdition } from '@vpat/shared';
import { Icons } from '../ui/icons.js';
import { statusColor } from '../ui/status.js';
import { NavBar, Spinner } from '../ui/components.js';
import { hasApi } from '../config.js';
import { api } from '../api/client.js';

export function GeneratingScreen({
  edition,
  findings,
  scanId,
  onNext,
  onBack,
}: {
  edition: ReportEdition;
  findings: Finding[];
  scanId?: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const gen = GEN_PHASES;
  const reports = reportsForEdition(edition);
  const total = findings.length;
  const [drafted, setDrafted] = useState(0);
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(false);
  const [chipStatus, setChipStatus] = useState<Record<string, ConformanceLevel>>({});

  // --- real backend: stream drafting events ---
  useEffect(() => {
    if (!hasApi || !scanId) return;
    const unsub = api.streamScan(scanId, (e) => {
      switch (e.kind) {
        case 'draft-progress':
          setDrafted(e.drafted);
          setPhase(e.phase);
          break;
        case 'draft-chip':
          setChipStatus((m) => ({ ...m, [e.findingId]: e.status }));
          break;
        case 'draft-done':
          setDrafted(e.total);
          setDone(true);
          break;
        default:
          break;
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // --- mock mode: simulate drafting ---
  useEffect(() => {
    if (hasApi) return;
    let alive = true;
    let n = 0;
    let timer: number;
    const tick = () => {
      if (!alive) return;
      n++;
      setDrafted(n);
      setPhase(Math.min(gen.length - 1, Math.floor((n / total) * gen.length)));
      if (n >= total) {
        timer = window.setTimeout(() => alive && setDone(true), 400);
        return;
      }
      timer = window.setTimeout(tick, 180 + Math.random() * 120);
    };
    timer = window.setTimeout(tick, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="eyebrow">Step 04 — Drafting</div>
      <h1 className="title" style={{ marginBottom: 4 }}>
        {done ? 'Draft findings ready' : 'Drafting findings with AI'}
      </h1>
      <p className="lead">
        Each criterion is matched to the captured evidence, assigned a conformance level with plain-language
        remarks, and cross-referenced where the selected VPAT edition requires it — then scored for confidence. Everything is
        editable in the next step.
      </p>

      <div className="card" style={{ marginTop: 26 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <span className="micro muted">{done ? 'Generation complete' : `${gen[phase]}…`}</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
            {Math.min(drafted, total)} / {total}
          </span>
        </div>
        <div className="bar" style={{ marginBottom: 20 }}>
          <span style={{ width: `${(Math.min(drafted, total) / total) * 100}%` }} />
        </div>

        {reports.map((rep) => {
          const items = findings.map((f, i) => ({ f, i })).filter((o) => o.f.report === rep.id);
          if (!items.length) return null;
          return (
            <div key={rep.id} style={{ marginBottom: 16 }}>
              <div className="micro faint" style={{ marginBottom: 8 }}>
                {rep.name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
                {items.map(({ f, i }) => {
                  const on = i < drafted;
                  const color = statusColor(chipStatus[f.id] ?? f.status);
                  return (
                    <div
                      key={f.id}
                      className="row"
                      style={{
                        gap: 8,
                        padding: '9px 11px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'var(--hair)',
                        background: on ? 'var(--surface-2)' : 'transparent',
                        opacity: on ? 1 : 0.4,
                        transition: 'all .35s',
                      }}
                    >
                      {on ? (
                        <span style={{ color }}>
                          <Icons.checkCircle size={15} />
                        </span>
                      ) : (
                        <span style={{ width: 15, height: 15, display: 'grid', placeItems: 'center' }}>
                          <Spinner />
                        </span>
                      )}
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                        {f.id}
                      </span>
                      <span
                        className="faint"
                        style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {f.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <NavBar onBack={onBack} onNext={done ? onNext : null} nextLabel="Review findings" nextIcon={Icons.eye}>
        {!done && (
          <span className="row faint" style={{ gap: 9, fontSize: 13 }}>
            <Spinner /> Generating…
          </span>
        )}
      </NavBar>
    </div>
  );
}
