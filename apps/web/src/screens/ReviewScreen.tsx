/* Step 5 — Review: approve/edit each finding, organized as the INT edition's three reports.
   This is the human-approval gate; the AI draft never ships unedited. */
import { Fragment, useRef, useState } from 'react';
import {
  REPORT_META,
  autoRowsForEdition,
  crossReferenceForEdition,
  reportsForEdition,
  type ConformanceLevel,
  type ReportEdition,
  type Finding,
  type ReportKind,
} from '@vpat/shared';
import { Icons } from '../ui/icons.js';
import { STATUS_ORDER, statusColor } from '../ui/status.js';
import { hasApi } from '../config.js';
import { api } from '../api/client.js';
import { NavBar } from '../ui/components.js';

export function ReviewScreen({
  edition,
  findings,
  setFindings,
  reportId,
  onNext,
  onBack,
}: {
  edition: ReportEdition;
  findings: Finding[];
  setFindings: React.Dispatch<React.SetStateAction<Finding[]>>;
  reportId?: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const reports = reportsForEdition(edition);
  const [activeRep, setActiveRep] = useState<ReportKind>('wcag');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const f = findings[idx];
  const approvedCount = findings.filter((x) => x.approved).length;
  const allApproved = approvedCount === findings.length;

  const repFindings = findings.map((ff, i) => ({ ff, i })).filter((o) => o.ff.report === activeRep);
  const repPos = repFindings.findIndex((o) => o.i === idx);
  const rep = reports.find((r) => r.id === activeRep)!;
  const repAuto = autoRowsForEdition(edition).filter((a) => a.report === activeRep);

  const repCount = (id: ReportKind) => {
    const items = findings.filter((x) => x.report === id);
    return { done: items.filter((x) => x.approved).length, total: items.length };
  };

  const switchRep = (id: ReportKind) => {
    setActiveRep(id);
    const first = findings.findIndex((x) => x.report === id);
    if (first !== -1) setIdx(first);
  };

  const update = (patch: { status?: ConformanceLevel; remarks?: string }) => {
    setFindings((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch, edited: true } : x)));
    if (hasApi && f.dbId) api.updateFinding(f.dbId, patch).catch((e) => console.error('updateFinding', e));
  };
  const approveAndNext = () => {
    setFindings((arr) => arr.map((x, i) => (i === idx ? { ...x, approved: true } : x)));
    if (hasApi && f.dbId) api.approveFinding(f.dbId).catch((e) => console.error('approveFinding', e));
    const nextInRep = repFindings.find((o) => o.i > idx && !o.ff.approved);
    if (nextInRep) {
      setIdx(nextInRep.i);
      return;
    }
    const anyRep = findings.findIndex((x, i) => i !== idx && !x.approved);
    if (anyRep !== -1) {
      setIdx(anyRep);
      setActiveRep(findings[anyRep].report);
    }
  };
  const approveAll = () => {
    setFindings((arr) => arr.map((x) => ({ ...x, approved: true })));
    if (hasApi && reportId) api.approveAll(reportId).catch((e) => console.error('approveAll', e));
  };

  const isWcag = f.report === 'wcag';
  const xref = isWcag && !f.obsolete ? crossReferenceForEdition(edition, f.id) : null;

  return (
    <div className="screen">
      <div className="row between wrap" style={{ alignItems: 'flex-end', gap: 14, marginBottom: 16 }}>
        <div>
          <div className="eyebrow">Step 05 — Review</div>
          <h1 className="title" style={{ marginBottom: 4 }}>
            Review the AI draft
          </h1>
          <p className="lead" style={{ fontSize: 15 }}>
            One conformance response per criterion, reviewed by a human before export and cross-referenced where this edition requires it.
            Approve as-is or edit. Nothing ships until you say so.
          </p>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 8, minWidth: 180 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {approvedCount}
            </span>
            <span className="faint" style={{ fontSize: 13 }}>
              / {findings.length} approved
            </span>
          </div>
          <div className="bar" style={{ width: 180 }}>
            <span style={{ width: `${(approvedCount / findings.length) * 100}%`, background: 'var(--ok)' }} />
          </div>
        </div>
      </div>

      {/* report tabs */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 16 }} role="tablist" aria-label="Reports">
        {reports.map((r) => {
          const c = repCount(r.id);
          const on = r.id === activeRep;
          return (
            <button
              key={r.id}
              role="tab"
              aria-selected={on}
              onClick={() => switchRep(r.id)}
              style={{
                padding: '9px 15px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                border: on ? '1.5px solid var(--accent)' : '1px solid var(--border-strong)',
                background: on ? 'color-mix(in oklab,var(--accent) 8%,var(--surface))' : 'var(--surface)',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--text)' }}>
                {r.name}
              </span>
              <span className="mono" style={{ fontSize: 11, color: c.done === c.total ? 'var(--ok)' : 'var(--text-faint)' }}>
                {c.done}/{c.total}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,280px) minmax(0,1fr)', gap: 16, alignItems: 'start' }}
        className="rev-grid"
      >
        {/* sidebar */}
        <div
          className="panel rev-side"
          style={{ padding: '10px', position: 'sticky', top: 76, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}
          ref={listRef}
        >
          {rep.sections.map((sec) => {
            const secItems = repFindings.filter((o) => o.ff.section === sec.id);
            const secAuto = repAuto.filter((a) => a.section === sec.id);
            if (!secItems.length && !secAuto.length) return null;
            return (
              <div key={sec.id} style={{ marginBottom: 8 }}>
                <div className="micro muted" style={{ padding: '8px 10px 6px' }}>
                  {sec.name}
                </div>
                {secItems.map(({ ff: it, i }) => {
                  const active = i === idx;
                  return (
                    <button
                      key={it.id}
                      onClick={() => setIdx(i)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        gap: 9,
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid transparent',
                        background: active ? 'color-mix(in oklab,var(--accent) 9%,var(--surface))' : 'transparent',
                        borderColor: active ? 'color-mix(in oklab,var(--accent) 30%,transparent)' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          flex: 'none',
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          background: it.approved ? 'var(--ok)' : 'transparent',
                          border: it.approved ? 'none' : '1.5px solid var(--border-strong)',
                          color: '#fff',
                        }}
                      >
                        {it.approved && <Icons.check size={10} sw={3} />}
                      </span>
                      <span
                        className="mono"
                        style={{ fontSize: 11.5, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text-muted)', width: 42, flex: 'none' }}
                      >
                        {it.id}
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: active ? 'var(--text)' : 'var(--text-muted)',
                        }}
                      >
                        {it.name}
                      </span>
                      <span
                        className="dot"
                        style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: statusColor(it.status) }}
                      />
                    </button>
                  );
                })}
                {/* auto-resolved / cross-referenced rows */}
                {secAuto.map((a) => (
                  <div
                    key={a.id}
                    className="row"
                    title={a.ref}
                    style={{ width: '100%', gap: 9, alignItems: 'center', padding: '8px 10px', opacity: 0.8 }}
                  >
                    <span style={{ width: 16, height: 16, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}>
                      <Icons.arrowR size={11} />
                    </span>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', width: 42, flex: 'none' }}>
                      {a.id}
                    </span>
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)' }}>
                      {a.name}
                    </span>
                    <span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: statusColor(a.status) }} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* detail */}
        <div className="col" style={{ gap: 14, minWidth: 0 }}>
          <div className="row between">
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => repPos > 0 && setIdx(repFindings[repPos - 1].i)}
                disabled={repPos <= 0}
                aria-label="Previous criterion"
              >
                <Icons.arrowL size={15} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => repPos < repFindings.length - 1 && setIdx(repFindings[repPos + 1].i)}
                disabled={repPos >= repFindings.length - 1}
                aria-label="Next criterion"
              >
                <Icons.arrowR size={15} />
              </button>
              <span className="faint mono" style={{ fontSize: 12, marginLeft: 6 }}>
                {repPos + 1} of {repFindings.length} · {rep.name}
              </span>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={approveAll}>
              <Icons.check size={14} className="ic" />
              Approve all remaining
            </button>
          </div>

          <div className="card" style={{ padding: 'var(--pad)' }}>
            {/* header */}
            <div className="row between wrap" style={{ gap: 12 }}>
              <div>
                <div className="row" style={{ gap: 9, alignItems: 'baseline' }}>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>
                    {f.id}
                  </span>
                  <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em' }}>{f.name}</h2>
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <span className="tag">{REPORT_META[f.report].short}</span>
                  {isWcag && !f.obsolete && <span className="tag">Level {f.level}</span>}
                  {isWcag && f.ver && <span className="tag">WCAG {f.ver}</span>}
                  {!isWcag && <span className="tag">{f.principle}</span>}
                  {f.auto > 0 && <span className="tag">{f.auto} automated checks</span>}
                </div>
              </div>
              {f.approved ? (
                <span className="badge b-ok">
                  <Icons.check size={12} sw={3} />
                  Approved{f.edited ? ' · edited' : ''}
                </span>
              ) : f.edited ? (
                <span className="tag" style={{ color: 'var(--accent)' }}>
                  Edited draft
                </span>
              ) : (
                <span className="tag">AI draft</span>
              )}
            </div>

            {f.obsolete && (
              <div
                className="row"
                style={{ gap: 9, marginTop: 14, padding: '10px 13px', background: 'var(--na-bg)', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ color: 'var(--na)' }}>
                  <Icons.alert size={16} />
                </span>
                <span className="faint" style={{ fontSize: 12.5 }}>
                  Obsolete in WCAG 2.2 — resolves automatically to “Supports” for 2.0 / 2.1.
                </span>
              </div>
            )}

            {/* confidence */}
            <div className="row" style={{ gap: 10, marginTop: 18 }}>
              <span className="micro faint">AI confidence</span>
              <div className="bar" style={{ flex: 1, maxWidth: 220, height: 5 }}>
                <span
                  style={{
                    width: `${Math.round(f.confidence * 100)}%`,
                    background: f.confidence > 0.8 ? 'var(--ok)' : f.confidence > 0.7 ? 'var(--warn)' : 'var(--bad)',
                  }}
                />
              </div>
              <span className="mono faint" style={{ fontSize: 12 }}>
                {Math.round(f.confidence * 100)}%
              </span>
              {f.confidence < 0.72 && (
                <span className="badge b-warn" style={{ fontSize: 11 }}>
                  <Icons.alert size={12} />
                  Worth a closer look
                </span>
              )}
            </div>

            <hr className="divider" style={{ margin: '18px 0' }} />

            {/* conformance selector */}
            <div className="micro muted" style={{ marginBottom: 10 }}>
              Conformance level
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {STATUS_ORDER.filter((s) => s !== 'Not Evaluated' || f.section === 'AAA').map((s: ConformanceLevel) => {
                const on = f.status === s;
                const c = statusColor(s);
                return (
                  <button
                    key={s}
                    onClick={() => update({ status: s })}
                    style={{
                      padding: '9px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      border: on ? `1.5px solid ${c}` : '1px solid var(--border-strong)',
                      background: on ? `color-mix(in oklab, ${c} 12%, var(--surface))` : 'var(--surface)',
                      color: on ? c : 'var(--text-muted)',
                    }}
                  >
                    <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                    {s}
                  </button>
                );
              })}
            </div>

            {/* remarks */}
            <div className="row between" style={{ marginTop: 22, marginBottom: 8 }}>
              <span className="micro muted">Remarks &amp; explanations</span>
              <span className="faint" style={{ fontSize: 11.5 }}>
                Editable
              </span>
            </div>
            <label htmlFor="remarks" className="micro" style={{ position: 'absolute', left: -9999 }}>
              Remarks for {f.id} {f.name}
            </label>
            <textarea
              id="remarks"
              className="textarea"
              value={f.remarks}
              onChange={(e) => update({ remarks: e.target.value })}
              style={{ minHeight: 110 }}
            />

            {/* evidence */}
            {f.evidence && f.evidence.length > 0 && (
              <Fragment>
                <div className="micro muted" style={{ marginTop: 20, marginBottom: 10 }}>
                  Supporting evidence · {f.evidence.length}
                </div>
                <div className="col" style={{ gap: 7 }}>
                  {f.evidence.map((ev, i) => (
                    <div
                      key={i}
                      className="row"
                      style={{ gap: 11, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: 'var(--hair)' }}
                    >
                      <span style={{ color: ev.type === 'issue' ? 'var(--bad)' : 'var(--ok)', marginTop: 1 }}>
                        {ev.type === 'issue' ? <Icons.alert size={16} /> : <Icons.checkCircle size={16} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 13.5 }}>{ev.text}</span>
                      <span className="mono faint" style={{ fontSize: 11.5, textAlign: 'right' }}>
                        {ev.where}
                      </span>
                    </div>
                  ))}
                </div>
              </Fragment>
            )}

            {/* cross-references — the INT edition signature */}
            {xref && (xref.en.length > 0 || xref.s508.length > 0) && (
              <div
                style={{ marginTop: 20, padding: '13px 15px', borderRadius: 'var(--radius-sm)', border: 'var(--hair)', background: 'var(--surface-2)' }}
              >
                <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                  <Icons.shield size={15} className="faint" />
                  <span className="micro muted">This response also documents conformance for</span>
                </div>
                <div className="col" style={{ gap: 8 }}>
                  {xref.en.length > 0 && (
                    <div className="row wrap" style={{ gap: 6, alignItems: 'baseline' }}>
                      <span className="faint" style={{ fontSize: 11.5, width: 92, flex: 'none' }}>
                        EN 301 549
                      </span>
                      {xref.en.map((x) => (
                        <span key={x} className="tag">
                          {x}
                        </span>
                      ))}
                    </div>
                  )}
                  {xref.s508.length > 0 && (
                    <div className="row wrap" style={{ gap: 6, alignItems: 'baseline' }}>
                      <span className="faint" style={{ fontSize: 11.5, width: 92, flex: 'none' }}>
                        Section 508
                      </span>
                      {xref.s508.map((x) => (
                        <span key={x} className="tag">
                          {x}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* approve */}
            <div
              className="row between"
              style={{ marginTop: 22, paddingTop: 18, borderTop: 'var(--hair)', gap: 12, flexWrap: 'wrap' }}
            >
              <span className="faint" style={{ fontSize: 12.5 }}>
                {f.approved ? 'Approved — edits are saved automatically.' : 'Review the level and remarks above, then approve.'}
              </span>
              <button className="btn btn-primary" onClick={approveAndNext}>
                <Icons.check size={16} className="ic" />
                {f.approved ? 'Next finding' : 'Approve & continue'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <NavBar
        onBack={onBack}
        onNext={onNext}
        disabled={!allApproved}
        nextLabel={allApproved ? 'Assemble report' : `Approve all to continue (${findings.length - approvedCount} left)`}
        nextIcon={Icons.doc}
      />
    </div>
  );
}
