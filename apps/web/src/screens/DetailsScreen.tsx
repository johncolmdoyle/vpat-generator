/* Step 6 — Details: publication metadata + evaluator attestation for the ACR.
   These populate the official VPAT header + attestation block in the exports.
   The report stays a DRAFT; the named evaluator is responsible for approval. */
import { useState } from 'react';
import { DEFAULT_EVALUATION_METHODS, emptyReportMeta, type ReportMeta } from '@vpat/shared';
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
  onNext,
  onBack,
}: {
  state: ReportMeta | null;
  domain: string;
  onNext: (meta: ReportMeta) => void;
  onBack: () => void;
}) {
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

      <div className="card" style={{ marginTop: 26 }}>
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
