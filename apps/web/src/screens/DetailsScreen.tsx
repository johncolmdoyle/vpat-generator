/* Step 6 — Details: publication metadata + evaluator attestation for the ACR.
   These populate the official VPAT header + attestation block in the exports.
   The report stays a DRAFT; the named evaluator is responsible for approval. */
import { useState } from 'react';
import {
  DEFAULT_EVALUATION_METHODS,
  PAGE_PRIORITY,
  PLATFORM_GUIDES,
  RECORDING_GUIDANCE,
  TEST_PROCEDURE,
  emptyReportMeta,
  type Finding,
  type PageInfo,
  type ReportMeta,
} from '@vpat/shared';
import { Icons } from '../ui/icons.js';
import { NavBar } from '../ui/components.js';

const AT_SUGGESTIONS = ['NVDA 2024.1', 'JAWS 2024', 'VoiceOver (macOS)', 'VoiceOver (iOS)', 'TalkBack (Android)'];
const ENV_SUGGESTIONS = ['Chrome 124 / Windows 11', 'Safari 17 / macOS 14', 'Firefox 126 / Windows 11', 'Chrome / Android 14'];

/** Chip list with free-text add + quick-add suggestions. */
function TagInput({
  label,
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label>{label}</label>
      {values.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 2 }}>
          {values.map((v) => (
            <span key={v} className="badge b-na" style={{ gap: 6 }}>
              {v}
              <button
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'inherit', cursor: 'pointer' }}
              >
                <Icons.x size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="input-prefix" style={{ padding: 0 }}>
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          style={{ padding: '11px 13px', border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 14.5 }}
        />
        <button className="btn btn-quiet" style={{ padding: '0 14px' }} onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </button>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 2 }}>
        <span className="hint">Quick add:</span>
        {suggestions
          .filter((s) => !values.includes(s))
          .map((s) => (
            <button key={s} className="tag" style={{ cursor: 'pointer' }} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

/** Module-scope so it isn't re-created each render (which would drop input focus). */
function TextField({ id, label, value, onChange, type = 'text', placeholder, span }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; span?: boolean;
}) {
  return (
    <div className="field" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function DetailsScreen({
  state,
  domain,
  findings,
  pages,
  onNext,
  onBack,
}: {
  state: ReportMeta | null;
  domain: string;
  findings: Finding[];
  pages: PageInfo[];
  onNext: (meta: ReportMeta) => void;
  onBack: () => void;
}) {
  const [platform, setPlatform] = useState<'windows' | 'mac'>('windows');
  const guide = PLATFORM_GUIDES.find((g) => g.id === platform)!;
  // Criteria with no automated signal / low confidence depend entirely on this pass.
  const toVerify = findings.filter((f) => !f.obsolete && f.confidence < 0.72);
  const [m, setM] = useState<ReportMeta>(() => {
    const base = state ?? emptyReportMeta(domain);
    return {
      ...emptyReportMeta(domain),
      ...base,
      evaluationMethods: base.evaluationMethods || DEFAULT_EVALUATION_METHODS,
    };
  });
  const set = (patch: Partial<ReportMeta>) => setM((cur) => ({ ...cur, ...patch }));

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.contactEmail);
  const datesOk = !!m.evaluationStart && !!m.evaluationEnd && m.evaluationStart <= m.evaluationEnd;
  const required: (keyof ReportMeta)[] = ['productName', 'productVersion', 'vendorName', 'productDescription', 'evaluatorName', 'evaluatorOrg'];
  const filled = required.every((k) => String(m[k]).trim().length > 0);
  const valid = filled && emailOk && datesOk && m.assistiveTech.length > 0 && m.testEnvironments.length > 0;

  return (
    <div className="screen" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="eyebrow">Step 06 — Report details</div>
      <h1 className="title">Report header &amp; evaluator attestation</h1>
      <p className="lead">
        These details populate the official VPAT 2.5Rev header and the attestation block. The report is issued as a{' '}
        <strong>DRAFT</strong> — record who evaluated it and how, then you remain responsible for final review and
        approval before publishing.
      </p>

      {/* ---- manual evaluation guide ---- */}
      <div className="card" style={{ marginTop: 26 }}>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 6 }}>
          <div className="row" style={{ gap: 9 }}>
            <span style={{ color: 'var(--accent)' }}>
              <Icons.shield size={18} />
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>How to perform the manual evaluation</span>
          </div>
          <div className="row" style={{ gap: 6 }} role="tablist" aria-label="Platform">
            {PLATFORM_GUIDES.map((g) => {
              const on = g.id === platform;
              return (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setPlatform(g.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 13,
                    fontWeight: 600,
                    border: on ? '1.5px solid var(--accent)' : '1px solid var(--border-strong)',
                    background: on ? 'color-mix(in oklab, var(--accent) 10%, var(--surface))' : 'var(--surface)',
                    color: on ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
          The automated scan covers only part of WCAG. Do this manual pass on real assistive technology, then record
          what you used below. Testing with <strong>{guide.screenReader}</strong> in <strong>{guide.browser}</strong>.
        </p>

        {/* setup */}
        <div className="micro muted" style={{ marginTop: 16, marginBottom: 8 }}>
          Set up ({guide.label})
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>
          {guide.setup.map((s, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {s}
            </li>
          ))}
        </ol>

        {/* command reference */}
        <div className="micro muted" style={{ marginTop: 16, marginBottom: 8 }}>
          Screen-reader commands you'll use
        </div>
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          {guide.commands.map((c, i) => (
            <div
              key={c.action}
              className="row between"
              style={{ gap: 12, padding: '8px 13px', borderTop: i ? 'var(--hair)' : 'none' }}
            >
              <span style={{ fontSize: 13 }}>{c.action}</span>
              <kbd className="mono tag" style={{ flex: 'none' }}>
                {c.keys}
              </kbd>
            </div>
          ))}
        </div>

        {/* pages to test */}
        <div className="micro muted" style={{ marginTop: 18, marginBottom: 8 }}>
          Pages to test {pages.length > 0 && `· ${pages.length} discovered`}
        </div>
        {pages.length > 0 ? (
          <div className="col" style={{ gap: 5 }}>
            {pages.map((p) => (
              <div
                key={p.url}
                className="row"
                style={{ gap: 10, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: 'var(--hair)' }}
              >
                <Icons.page size={15} className="faint" />
                <span className="mono" style={{ fontSize: 12.5, flex: 'none' }}>
                  {p.url}
                </span>
                <span className="faint" style={{ fontSize: 12.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </span>
                {p.isAuth && (
                  <span className="badge b-na" style={{ fontSize: 10.5, flex: 'none' }}>
                    sign-in
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="faint" style={{ fontSize: 13, margin: 0 }}>
            Test a representative page of each type below (sign in with your test credentials for gated areas).
          </p>
        )}
        <details style={{ marginTop: 8 }}>
          <summary className="faint" style={{ fontSize: 12.5, cursor: 'pointer' }}>
            Which page types matter and why
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.55 }}>
            {PAGE_PRIORITY.map((p) => (
              <li key={p.type} style={{ marginBottom: 3 }}>
                <strong>{p.type}</strong> — <span className="faint">{p.why}</span>
              </li>
            ))}
          </ul>
        </details>

        {/* procedure */}
        <div className="micro muted" style={{ marginTop: 18, marginBottom: 8 }}>
          What to check on each page
        </div>
        <div className="col" style={{ gap: 6 }}>
          {TEST_PROCEDURE.map((area, idx) => (
            <details key={area.title} open={idx === 0} style={{ border: 'var(--hair)', borderRadius: 'var(--radius-sm)', padding: '10px 13px' }}>
              <summary style={{ fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>{area.title}</summary>
              <ul style={{ margin: '8px 0 8px', paddingLeft: 20, fontSize: 13, lineHeight: 1.55 }}>
                {area.steps.map((s, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>
                    {s}
                  </li>
                ))}
              </ul>
              <div className="row wrap" style={{ gap: 5 }}>
                <span className="faint" style={{ fontSize: 11 }}>
                  Covers:
                </span>
                {area.criteria.map((c) => (
                  <span key={c} className="tag">
                    {c}
                  </span>
                ))}
              </div>
            </details>
          ))}
        </div>

        {/* prioritized criteria from the automated pass */}
        {toVerify.length > 0 && (
          <>
            <div className="micro muted" style={{ marginTop: 18, marginBottom: 8 }}>
              Prioritize these {toVerify.length} criteria — flagged by the scan as needing manual verification
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {toVerify.map((f) => (
                <span key={f.report + f.id} className="badge b-warn" style={{ fontSize: 11 }} title={f.name}>
                  {f.id} {f.name}
                </span>
              ))}
            </div>
          </>
        )}

        {/* recording */}
        <div className="micro muted" style={{ marginTop: 18, marginBottom: 8 }}>
          Record your results
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.55 }}>
          {RECORDING_GUIDANCE.map((s, i) => (
            <li key={i} style={{ marginBottom: 3 }}>
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="micro muted" style={{ marginBottom: 14 }}>
          Product
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <TextField id="pn" label="Product name" value={m.productName} onChange={(v) => set({ productName: v })} placeholder="Acme Portal" />
          <TextField id="pv" label="Version" value={m.productVersion} onChange={(v) => set({ productVersion: v })} placeholder="v2025.6" />
          <TextField id="vn" label="Vendor / author company" value={m.vendorName} onChange={(v) => set({ vendorName: v })} placeholder="Acme Inc." />
          <div className="field">
            <label htmlFor="ce">Accessibility contact email</label>
            <input id="ce" className="input" type="email" value={m.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="accessibility@acme.com" />
            {!emailOk && m.contactEmail.length > 0 && <span className="hint" style={{ color: 'var(--bad)' }}>Enter a valid email.</span>}
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pd">Product description</label>
            <textarea id="pd" className="textarea" value={m.productDescription} onChange={(e) => set({ productDescription: e.target.value })} placeholder="Customer-facing web application: marketing site, catalog, account area." style={{ minHeight: 70 }} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="micro muted" style={{ marginBottom: 14 }}>
          Evaluation &amp; attestation
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <TextField id="en" label="Evaluator name" value={m.evaluatorName} onChange={(v) => set({ evaluatorName: v })} placeholder="Jane Tester" />
          <TextField id="eo" label="Evaluator organization" value={m.evaluatorOrg} onChange={(v) => set({ evaluatorOrg: v })} placeholder="A11y Consulting" />
          <TextField id="es" label="Evaluation start" value={m.evaluationStart} onChange={(v) => set({ evaluationStart: v })} type="date" />
          <div className="field">
            <label htmlFor="ee">Evaluation end</label>
            <input id="ee" className="input" type="date" value={m.evaluationEnd} onChange={(e) => set({ evaluationEnd: e.target.value })} />
            {!datesOk && m.evaluationStart && m.evaluationEnd && <span className="hint" style={{ color: 'var(--bad)' }}>End must be on/after start.</span>}
          </div>

          <TagInput
            label="Assistive technologies used (manual testing)"
            values={m.assistiveTech}
            onChange={(v) => set({ assistiveTech: v })}
            suggestions={AT_SUGGESTIONS}
            placeholder="e.g. NVDA 2024.1 — type and press Enter"
          />
          <TagInput
            label="Test environments (browser / OS)"
            values={m.testEnvironments}
            onChange={(v) => set({ testEnvironments: v })}
            suggestions={ENV_SUGGESTIONS}
            placeholder="e.g. Chrome 124 / Windows 11 — type and press Enter"
          />

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="em">Evaluation methods used</label>
            <textarea id="em" className="textarea" value={m.evaluationMethods} onChange={(e) => set({ evaluationMethods: e.target.value })} style={{ minHeight: 96 }} />
            <span className="hint">Prefilled with the automated methodology; edit to reflect your manual testing.</span>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="nt">Notes (optional)</label>
            <textarea id="nt" className="textarea" value={m.notes} onChange={(e) => set({ notes: e.target.value })} style={{ minHeight: 60 }} />
          </div>
        </div>
      </div>

      {!valid && (
        <div className="row" style={{ gap: 9, marginTop: 16, padding: '11px 13px', background: 'var(--warn-bg)', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ color: 'var(--warn)' }}>
            <Icons.alert size={16} />
          </span>
          <span className="faint" style={{ fontSize: 12.5, color: 'var(--warn)' }}>
            Complete all fields, including at least one assistive technology and one test environment, to assemble the report.
          </span>
        </div>
      )}

      <NavBar onBack={onBack} onNext={() => onNext(m)} disabled={!valid} nextLabel="Assemble report" nextIcon={Icons.doc} />
    </div>
  );
}
