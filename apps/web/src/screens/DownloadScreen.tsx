/* Step 6 — Report: conformance summary, per-report breakdown, ACR header, downloads.
   With an API the export is a real DOCX/PDF/JSON in S3 (BACKEND.md §5); in mock mode
   it just confirms a generated filename. */
import { useEffect, useState } from 'react';
import {
  EDITION_META,
  reportsForEdition,
  type ConformanceLevel,
  type ExportFormat,
  type Finding,
  type ReportMeta,
  type ReportEdition,
  type WizardForm,
} from '@vpat/shared';
import { Icons, type IconProps } from '../ui/icons.js';
import { STATUS_META } from '../ui/status.js';
import { NavBar, Ring } from '../ui/components.js';
import { hasApi } from '../config.js';
import { api } from '../api/client.js';
import type { ReactNode } from 'react';

const SUMMARY_ROWS: [ConformanceLevel, string][] = [
  ['Supports', 'var(--ok)'],
  ['Partially Supports', 'var(--warn)'],
  ['Does Not Support', 'var(--bad)'],
  ['Not Applicable', 'var(--na)'],
];

type Counts = Record<ConformanceLevel, number>;
const countsBy = (items: Finding[]): Counts =>
  (Object.keys(STATUS_META) as ConformanceLevel[]).reduce((a, s) => {
    a[s] = items.filter((f) => f.status === s).length;
    return a;
  }, {} as Counts);

export function DownloadScreen({
  state,
  meta,
  findings,
  edition,
  reportId,
  reportStatus,
  approvedAt,
  approvedByEmail,
  onBack,
  onRestart,
  onExported,
  onFinalized,
}: {
  state: WizardForm;
  meta: ReportMeta;
  findings: Finding[];
  edition: ReportEdition;
  reportId?: string;
  reportStatus?: 'draft' | 'scanning' | 'review' | 'final';
  approvedAt?: string | null;
  approvedByEmail?: string | null;
  onBack: () => void;
  onRestart: () => void;
  onExported?: () => void;
  onFinalized?: (audit: { approvedAt: string | null; approvedByEmail: string | null }) => void;
}) {
  const reports = reportsForEdition(edition);
  const counts = countsBy(findings);
  const applicable = findings.length - counts['Not Applicable'] - counts['Not Evaluated'];
  const score = Math.round(((counts['Supports'] + counts['Partially Supports'] * 0.5) / applicable) * 100);
  const edited = findings.filter((f) => f.edited).length;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const [downloaded, setDownloaded] = useState<{ name: string; real: boolean } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(reportStatus === 'final');
  const [draftDownloaded, setDraftDownloaded] = useState(reportStatus === 'final');
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [draftDownloadsCollapsed, setDraftDownloadsCollapsed] = useState(reportStatus === 'final');
  const [approvalAudit, setApprovalAudit] = useState<{ approvedAt: string | null; approvedByEmail: string | null }>({
    approvedAt: approvedAt ?? null,
    approvedByEmail: approvedByEmail ?? null,
  });
  const domain = state.domain || 'clarus-health.example';
  const level = state.level ?? 'AA';
  const levelRank = { A: 1, AA: 2, AAA: 3 }[level];

  const rows: [ConformanceLevel, number, string][] = [
    ['Supports', counts['Supports'], 'var(--ok)'],
    ['Partially Supports', counts['Partially Supports'], 'var(--warn)'],
    ['Does Not Support', counts['Does Not Support'], 'var(--bad)'],
    ['Not Applicable', counts['Not Applicable'], 'var(--na)'],
  ];

  const yes = (ok: boolean): ReactNode =>
    ok ? (
      <span className="badge b-ok" style={{ fontSize: 11 }}>
        Yes
      </span>
    ) : (
      <span className="tag">No</span>
    );
  const wcagRow = (ver: string) => ({ ver, a: true, aa: levelRank >= 2, aaa: levelRank >= 3 });
  const wcagRows = [wcagRow('2.0'), wcagRow('2.1'), wcagRow('2.2')];

  const dash = (s: string) => (s && s.trim() ? s : '—');
  const period =
    meta.evaluationStart || meta.evaluationEnd ? `${dash(meta.evaluationStart)} – ${dash(meta.evaluationEnd)}` : '—';
  const header: [string, string][] = [
    ['Name of Product / Version', `${dash(meta.productName || domain)}${meta.productVersion ? ` — ${meta.productVersion}` : ''}`],
    ['Report Date', today],
    ['Vendor / Author Company', dash(meta.vendorName)],
    ['Product Description', dash(meta.productDescription)],
    ['Contact Information', dash(meta.contactEmail || `accessibility@${domain}`)],
    ['Evaluation Methods Used', dash(meta.evaluationMethods)],
    ['Assistive Technologies Used', meta.assistiveTech.length ? meta.assistiveTech.join('; ') : '—'],
    ['Test Environment', meta.testEnvironments.length ? meta.testEnvironments.join('; ') : '—'],
    ['Evaluation Period', period],
    ['Evaluator', [meta.evaluatorName, meta.evaluatorOrg].filter(Boolean).join(', ') || '—'],
    ['Notes', dash(meta.notes)],
  ];

  const downloads: [string, (p: IconProps) => ReactNode][] = [
    ['PDF', Icons.doc],
    ['Word', Icons.doc],
    ['Excel', Icons.doc],
    ['.vpat', Icons.code],
  ];
  const ext = (fmt: string) => (fmt === 'Word' ? 'docx' : fmt === 'PDF' ? 'pdf' : fmt === 'Excel' ? 'xlsx' : 'vpat');
  const mockName = (label: string) =>
    `VPAT2.5Rev-${edition}-${domain.replace(/\..*/, '')}-${today.replace(/\s|,/g, '')}.${ext(label)}`;

  useEffect(() => {
    if (reportStatus === 'final') {
      setIsFinalized(true);
      setDraftDownloaded(true);
      setDraftDownloadsCollapsed(true);
      setApprovalAudit({ approvedAt: approvedAt ?? null, approvedByEmail: approvedByEmail ?? null });
    }
  }, [approvedAt, approvedByEmail, reportStatus]);

  const onDownload = (label: string, variant: 'draft' | 'approved') => {
    setExportError(null);
    if (hasApi && reportId) {
      const fmt = ext(label) as ExportFormat;
      api
        .exportReport(reportId, fmt, variant)
        .then((r) => {
          setDownloaded({ name: r.filename, real: true });
          if (variant === 'draft') setDraftDownloaded(true);
          onExported?.();
          window.open(r.url, '_blank', 'noopener');
        })
        .catch((e: unknown) => {
          console.error('export failed', e);
          setDownloaded(null);
          setExportError(e instanceof Error ? e.message : String(e));
        });
    } else {
      setDownloaded({ name: mockName(label).replace(/(\.[^.]+)$/, variant === 'draft' ? '-DRAFT$1' : '$1'), real: false });
      if (variant === 'draft') setDraftDownloaded(true);
    }
  };

  const onFinalize = () => {
    setFinalizeError(null);
    if (isFinalized) return;
    if (hasApi && reportId) {
      setFinalizeBusy(true);
      api
        .finalizeReport(reportId)
        .then(({ report }) => {
          setIsFinalized(true);
          setDraftDownloadsCollapsed(true);
          const audit = {
            approvedAt: report.finalizedAt ?? null,
            approvedByEmail: report.finalizedByEmail ?? null,
          };
          setApprovalAudit(audit);
          onFinalized?.(audit);
          onExported?.();
        })
        .catch((e: unknown) => {
          console.error('finalize failed', e);
          setFinalizeError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setFinalizeBusy(false));
      return;
    }
    setIsFinalized(true);
    setDraftDownloadsCollapsed(true);
  };
  const approvedWhen = approvalAudit.approvedAt
    ? new Date(approvalAudit.approvedAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="screen" style={{ maxWidth: 940, margin: '0 auto' }}>
      <div className="row" style={{ gap: 12, color: 'var(--ok)' }}>
        <Icons.checkCircle size={26} />
        <div className="eyebrow" style={{ color: 'var(--ok)' }}>
          Step 07 — Report ready
        </div>
      </div>
      <h1 className="title" style={{ marginBottom: 6 }}>
        Accessibility Conformance Report assembled
      </h1>
      <p className="lead">
        All {findings.length} criteria reviewed and approved for the {EDITION_META[edition].fullLabel}. Based on the
        VPAT® 2.5Rev {EDITION_META[edition].fullLabel}.
      </p>

      <div
        className="row"
        style={{ gap: 11, marginTop: 18, padding: '13px 15px', background: 'var(--warn-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid color-mix(in oklab, var(--warn) 30%, transparent)' }}
        role="note"
      >
        <span style={{ color: 'var(--warn)', flex: 'none' }}>
          <Icons.alert size={18} />
        </span>
        <span style={{ fontSize: 13, color: 'var(--warn)' }}>
          <strong>Start with the draft report.</strong> It is prepared for{' '}
          {[meta.evaluatorName, meta.evaluatorOrg].filter(Boolean).join(', ') || 'the named evaluator'} and must be
          reviewed and approved by the responsible party before it is published or used for procurement. Automated
          tooling catches only part of all WCAG issues — the attestation records the manual and assistive-technology
          testing performed.
        </span>
      </div>

      {/* conformance summary */}
      <div
        className="card"
        style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'clamp(20px,4vw,40px)', alignItems: 'center' }}
      >
        <div className="col" style={{ alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 132, height: 132 }}>
            <Ring pct={score} />
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <div className="col" style={{ alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
                  {score}%
                </span>
                <span className="micro faint" style={{ marginTop: 3 }}>
                  conformance
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 10, minWidth: 0 }}>
          {rows.map(([label, n, c]) => (
            <div key={label} className="row" style={{ gap: 12 }}>
              <span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', background: c, flex: 'none' }} />
              <span style={{ fontSize: 13.5, flex: 1 }}>{label}</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                {n}
              </span>
              <div className="bar" style={{ width: 120, height: 6 }}>
                <span style={{ width: `${(n / findings.length) * 100}%`, background: c }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* per-report breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 16 }}>
        {reports.map((r) => {
          const items = findings.filter((f) => f.report === r.id);
          const c = countsBy(items);
          return (
            <div key={r.id} className="panel" style={{ padding: '15px 16px' }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                <span className="mono faint" style={{ fontSize: 11.5 }}>
                  {items.length}
                </span>
              </div>
              <div
                className="row"
                style={{ height: 8, borderRadius: 'var(--radius-pill)', overflow: 'hidden', gap: 0, border: 'var(--hair)' }}
              >
                {SUMMARY_ROWS.map(([s, col]) =>
                  c[s] > 0 ? <span key={s} style={{ width: `${(c[s] / items.length) * 100}%`, background: col }} /> : null,
                )}
              </div>
              <div className="row wrap" style={{ gap: 10, marginTop: 10 }}>
                {SUMMARY_ROWS.filter(([s]) => c[s] > 0).map(([s, col]) => (
                  <span key={s} className="row" style={{ gap: 5, fontSize: 11.5 }}>
                    <span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />
                    <span className="faint">
                      {STATUS_META[s].short} {c[s]}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ACR header info */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="micro muted" style={{ marginBottom: 14 }}>
          Accessibility Conformance Report — {EDITION_META[edition].fullLabel} · VPAT® 2.5Rev
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {header.map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,200px) 1fr', gap: 16 }} className="acr-row">
              <div className="faint" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {k}
              </div>
              <div style={{ fontSize: 13.5, wordBreak: 'break-word' }}>{v}</div>
            </div>
          ))}
        </div>

        <hr className="divider" style={{ margin: '18px 0' }} />
        <div className="micro muted" style={{ marginBottom: 12 }}>
          Applicable standards / guidelines
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Standard / Guideline</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Included in report</th>
              </tr>
            </thead>
            <tbody>
              {edition === '508' && (
                <>
                  <tr style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>WCAG 2.0</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="row wrap" style={{ gap: 6 }}>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(true)} <span className="faint" style={{ fontSize: 11.5 }}>A</span>
                        </span>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(levelRank >= 2)} <span className="faint" style={{ fontSize: 11.5 }}>AA</span>
                        </span>
                      </span>
                    </td>
                  </tr>
                  <tr style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>Revised Section 508</td>
                    <td style={{ padding: '8px 10px' }}>{yes(true)}</td>
                  </tr>
                </>
              )}
              {edition === 'EU' && (
                <>
                  <tr style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>WCAG 2.1</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="row wrap" style={{ gap: 6 }}>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(true)} <span className="faint" style={{ fontSize: 11.5 }}>A</span>
                        </span>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(levelRank >= 2)} <span className="faint" style={{ fontSize: 11.5 }}>AA</span>
                        </span>
                      </span>
                    </td>
                  </tr>
                  <tr style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>EN 301 549 (V3.1.1 &amp; V3.2.1)</td>
                    <td style={{ padding: '8px 10px' }}>{yes(true)}</td>
                  </tr>
                </>
              )}
              {edition === 'INT' && (
                <>
                  {wcagRows.map((w) => (
                    <tr key={w.ver} style={{ borderTop: 'var(--hair)' }}>
                      <td style={{ padding: '8px 10px' }}>WCAG {w.ver}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span className="row wrap" style={{ gap: 6 }}>
                          <span className="row" style={{ gap: 5 }}>
                            {yes(w.a)} <span className="faint" style={{ fontSize: 11.5 }}>A</span>
                          </span>
                          <span className="row" style={{ gap: 5 }}>
                            {yes(w.aa)} <span className="faint" style={{ fontSize: 11.5 }}>AA</span>
                          </span>
                          <span className="row" style={{ gap: 5 }}>
                            {yes(w.aaa)} <span className="faint" style={{ fontSize: 11.5 }}>AAA</span>
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>Revised Section 508</td>
                    <td style={{ padding: '8px 10px' }}>{yes(true)}</td>
                  </tr>
                  <tr style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>EN 301 549 (V3.1.1 &amp; V3.2.1)</td>
                    <td style={{ padding: '8px 10px' }}>{yes(true)}</td>
                  </tr>
                </>
              )}
              {edition === 'WCAG' &&
                wcagRows.map((w) => (
                  <tr key={w.ver} style={{ borderTop: 'var(--hair)' }}>
                    <td style={{ padding: '8px 10px' }}>WCAG {w.ver}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="row wrap" style={{ gap: 6 }}>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(w.a)} <span className="faint" style={{ fontSize: 11.5 }}>A</span>
                        </span>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(w.aa)} <span className="faint" style={{ fontSize: 11.5 }}>AA</span>
                        </span>
                        <span className="row" style={{ gap: 5 }}>
                          {yes(w.aaa)} <span className="faint" style={{ fontSize: 11.5 }}>AAA</span>
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* draft downloads */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between wrap" style={{ gap: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Download Draft Report</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
              Download and review the draft with your evaluator or responsible approver before you finalize it.
            </div>
          </div>
          {isFinalized && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDraftDownloadsCollapsed((open) => !open)}>
              {draftDownloadsCollapsed ? 'Show draft downloads' : 'Hide draft downloads'}
            </button>
          )}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: draftDownloadsCollapsed ? '0fr' : '1fr',
            transition: 'grid-template-rows .24s ease, opacity .24s ease',
            opacity: draftDownloadsCollapsed ? 0.55 : 1,
            marginTop: 14,
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            <div className="row wrap" style={{ gap: 9 }}>
              {downloads.map(([fmt, Ic], i) => (
                <button
                  key={fmt}
                  className={i === 0 ? 'btn btn-primary' : 'btn btn-ghost'}
                  onClick={() => onDownload(fmt, 'draft')}
                >
                  {i === 0 ? <Icons.download size={16} className="ic" /> : <Ic size={16} className="ic" />}
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
        {isFinalized && draftDownloadsCollapsed && (
          <div className="faint" style={{ fontSize: 11.5, marginTop: 12 }}>
            Draft downloads minimized after approval. Expand if you need to re-check the pre-approval file.
          </div>
        )}
        {downloaded && (
          <div
            className="row screen"
            style={{ gap: 9, marginTop: 16, padding: '11px 14px', background: 'var(--ok-bg)', borderRadius: 'var(--radius-sm)' }}
            role="status"
          >
            <span style={{ color: 'var(--ok)' }}>
              <Icons.checkCircle size={17} />
            </span>
            <span style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 600 }}>{downloaded.name} downloaded</span>
            {!downloaded.real && (
              <span className="faint" style={{ fontSize: 12 }}>
                (no file generated in this build)
              </span>
            )}
          </div>
        )}
        {exportError && (
          <div
            className="row screen"
            style={{ gap: 9, marginTop: 16, padding: '11px 14px', background: 'var(--bad-bg)', borderRadius: 'var(--radius-sm)' }}
            role="alert"
          >
            <span style={{ color: 'var(--bad)' }}>
              <Icons.alert size={17} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--bad)' }}>Export failed — {exportError}</span>
          </div>
        )}
          <div className="faint" style={{ fontSize: 11.5, marginTop: 14 }}>
            {edited} of {findings.length} findings edited from the AI draft before approval.
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
            PDF and Word are the formal client-facing deliverables. Excel is a filterable internal review workbook for audit prep and evidence triage.
          </div>
      </div>

      <div className="card" style={{ marginTop: 16, border: '1px solid color-mix(in oklab, var(--accent) 28%, var(--border))' }}>
        <div className="row between wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Finalize Report</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
              Download and review the Draft report first. When final approval is complete, finalize the report to unlock approved exports without draft labeling.
            </div>
          </div>
          {!isFinalized && (
            <button
              className="btn"
              onClick={onFinalize}
              disabled={!draftDownloaded || finalizeBusy}
              style={
                draftDownloaded
                  ? {
                      background: 'var(--ok)',
                      color: 'white',
                      border: '1px solid color-mix(in oklab, var(--ok) 70%, black 10%)',
                      boxShadow: '0 8px 20px -12px color-mix(in oklab, var(--ok) 44%, transparent)',
                    }
                  : { opacity: 0.55, cursor: 'not-allowed' }
              }
            >
              {finalizeBusy ? 'Approving report...' : 'Approve Report'}
            </button>
          )}
        </div>
        {!draftDownloaded && !isFinalized && (
          <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
            Download the Draft report to enable final approval.
          </div>
        )}
        {isFinalized && (
          <div
            className="row screen"
            style={{ gap: 9, marginTop: 14, padding: '11px 14px', background: 'var(--ok-bg)', borderRadius: 'var(--radius-sm)' }}
            role="status"
          >
            <span style={{ color: 'var(--ok)' }}>
              <Icons.checkCircle size={17} />
            </span>
            <span style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 600 }}>
              {`Report approved${approvalAudit.approvedByEmail ? ` by ${approvalAudit.approvedByEmail}` : ''}${approvedWhen ? ` on ${approvedWhen}` : ''}. Approved exports no longer include draft labeling.`}
            </span>
          </div>
        )}
        {finalizeError && (
          <div
            className="row screen"
            style={{ gap: 9, marginTop: 14, padding: '11px 14px', background: 'var(--bad-bg)', borderRadius: 'var(--radius-sm)' }}
            role="alert"
          >
            <span style={{ color: 'var(--bad)' }}>
              <Icons.alert size={17} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--bad)' }}>Final approval failed — {finalizeError}</span>
          </div>
        )}
      </div>

      {isFinalized && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row between wrap" style={{ gap: 14 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Download Approved Report</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                Approved PDF and Word exports remove the draft label from the filename and document contents. The Excel workbook stays available for internal review in approved state as well.
              </div>
            </div>
            <div className="row wrap" style={{ gap: 9 }}>
              {downloads.map(([fmt, Ic], i) => (
                <button
                  key={`approved-${fmt}`}
                  className={i === 0 ? 'btn btn-primary' : 'btn btn-ghost'}
                  onClick={() => onDownload(fmt, 'approved')}
                >
                  {i === 0 ? <Icons.download size={16} className="ic" /> : <Ic size={16} className="ic" />}
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <NavBar onBack={onBack} onNext={null}>
        <button className="btn btn-quiet" onClick={onRestart}>
          Start a new report
        </button>
      </NavBar>
    </div>
  );
}
