/* vpat-review.jsx — Step 5 (review/approve findings) + Step 6 (download).
   Organized as the VPAT 2.5Rev International Edition's three reports. */

/* ============ STEP 5 — REVIEW ============ */
function ReviewScreen({ findings, setFindings, onNext, onBack }) {
  const REPORTS = window.VPAT.REPORTS;
  const AUTO = window.VPAT.AUTO;
  const [activeRep, setActiveRep] = useState("wcag");
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);

  const f = findings[idx];
  const approvedCount = findings.filter(x => x.approved).length;
  const allApproved = approvedCount === findings.length;

  // findings within active report (with their global indices)
  const repFindings = findings.map((ff, i) => ({ ff, i })).filter(o => o.ff.report === activeRep);
  const repPos = repFindings.findIndex(o => o.i === idx);
  const rep = REPORTS.find(r => r.id === activeRep);
  const repAuto = AUTO.filter(a => a.report === activeRep);

  const repCount = (id) => {
    const items = findings.filter(x => x.report === id);
    return { done: items.filter(x => x.approved).length, total: items.length };
  };

  const switchRep = (id) => {
    setActiveRep(id);
    const first = findings.findIndex(x => x.report === id);
    if (first !== -1) setIdx(first);
  };

  const update = (patch) => setFindings(arr => arr.map((x, i) => i === idx ? { ...x, ...patch, edited: patch.approved === undefined ? true : x.edited } : x));
  const approveAndNext = () => {
    setFindings(arr => arr.map((x, i) => i === idx ? { ...x, approved: true } : x));
    const nextInRep = repFindings.find(o => o.i > idx && !o.ff.approved);
    if (nextInRep) { setIdx(nextInRep.i); return; }
    const anyRep = findings.findIndex((x, i) => i !== idx && !x.approved);
    if (anyRep !== -1) { setIdx(anyRep); setActiveRep(findings[anyRep].report); }
  };
  const approveAll = () => setFindings(arr => arr.map(x => ({ ...x, approved: true })));

  const isWcag = f.report === "wcag";
  const xref = isWcag && !f.obsolete ? wcagAlsoApplies(f.id) : null;

  return (
    <div className="screen">
      <div className="row between wrap" style={{ alignItems: "flex-end", gap: 14, marginBottom: 16 }}>
        <div>
          <div className="eyebrow">Step 05 — Review</div>
          <h1 className="title" style={{ marginBottom: 4 }}>Review the AI draft</h1>
          <p className="lead" style={{ fontSize: 15 }}>One conformance response per criterion, recorded once and cross-referenced across all three standards. Approve as-is or edit. Nothing ships until you say so.</p>
        </div>
        <div className="col" style={{ alignItems: "flex-end", gap: 8, minWidth: 180 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{approvedCount}</span>
            <span className="faint" style={{ fontSize: 13 }}>/ {findings.length} approved</span>
          </div>
          <div className="bar" style={{ width: 180 }}><span style={{ width: `${(approvedCount/findings.length)*100}%`, background: "var(--ok)" }} /></div>
        </div>
      </div>

      {/* report tabs */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
        {REPORTS.map(r => {
          const c = repCount(r.id);
          const on = r.id === activeRep;
          return (
            <button key={r.id} onClick={() => switchRep(r.id)}
              style={{ padding: "9px 15px", borderRadius: "var(--radius-sm)", display: "flex", gap: 10, alignItems: "center",
                border: on ? "1.5px solid var(--accent)" : "1px solid var(--border-strong)",
                background: on ? "color-mix(in oklab,var(--accent) 8%,var(--surface))" : "var(--surface)" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? "var(--accent)" : "var(--text)" }}>{r.name}</span>
              <span className="mono" style={{ fontSize: 11, color: c.done === c.total ? "var(--ok)" : "var(--text-faint)" }}>{c.done}/{c.total}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,280px) minmax(0,1fr)", gap: 16, alignItems: "start" }} className="rev-grid">
        {/* sidebar */}
        <div className="panel rev-side" style={{ padding: "10px", position: "sticky", top: 76, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }} ref={listRef}>
          {rep.sections.map(sec => {
            const secItems = repFindings.filter(o => o.ff.section === sec.id);
            const secAuto = repAuto.filter(a => a.section === sec.id);
            if (!secItems.length && !secAuto.length) return null;
            return (
              <div key={sec.id} style={{ marginBottom: 8 }}>
                <div className="micro muted" style={{ padding: "8px 10px 6px" }}>{sec.name}</div>
                {secItems.map(({ ff: it, i }) => {
                  const active = i === idx;
                  return (
                    <button key={it.id} onClick={() => setIdx(i)}
                      style={{ width: "100%", textAlign: "left", display: "flex", gap: 9, alignItems: "center",
                        padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid transparent",
                        background: active ? "color-mix(in oklab,var(--accent) 9%,var(--surface))" : "transparent",
                        borderColor: active ? "color-mix(in oklab,var(--accent) 30%,transparent)" : "transparent" }}>
                      <span style={{ width: 16, height: 16, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center",
                        background: it.approved ? "var(--ok)" : "transparent", border: it.approved ? "none" : "1.5px solid var(--border-strong)", color: "#fff" }}>
                        {it.approved && <Icons.check size={10} sw={3} />}
                      </span>
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: active ? "var(--accent)" : "var(--text-muted)", width: 42, flex: "none" }}>{it.id}</span>
                      <span style={{ fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: active ? "var(--text)" : "var(--text-muted)" }}>{it.name}</span>
                      <span className="dot" style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: statusColor(it.status) }} />
                    </button>
                  );
                })}
                {/* auto-resolved / cross-referenced rows */}
                {secAuto.map(a => (
                  <div key={a.id} className="row" title={a.ref}
                    style={{ width: "100%", gap: 9, alignItems: "center", padding: "8px 10px", opacity: .8 }}>
                    <span style={{ width: 16, height: 16, flex: "none", display: "grid", placeItems: "center", color: "var(--text-faint)" }}><Icons.arrowR size={11} /></span>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-faint)", width: 42, flex: "none" }}>{a.id}</span>
                    <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-faint)" }}>{a.name}</span>
                    <span className="dot" style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: statusColor(a.status) }} />
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
              <button className="btn btn-ghost btn-sm" onClick={() => repPos > 0 && setIdx(repFindings[repPos - 1].i)} disabled={repPos <= 0}><Icons.arrowL size={15} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => repPos < repFindings.length - 1 && setIdx(repFindings[repPos + 1].i)} disabled={repPos >= repFindings.length - 1}><Icons.arrowR size={15} /></button>
              <span className="faint mono" style={{ fontSize: 12, marginLeft: 6 }}>{repPos + 1} of {repFindings.length} · {rep.name}</span>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={approveAll}><Icons.check size={14} className="ic" />Approve all remaining</button>
          </div>

          <div className="card" style={{ padding: "var(--pad)" }}>
            {/* header */}
            <div className="row between wrap" style={{ gap: 12 }}>
              <div>
                <div className="row" style={{ gap: 9, alignItems: "baseline" }}>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: "var(--accent)" }}>{f.id}</span>
                  <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>{f.name}</h2>
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <span className="tag">{REPORT_META[f.report].short}</span>
                  {isWcag && !f.obsolete && <span className="tag">Level {f.level}</span>}
                  {isWcag && f.ver && <span className="tag">WCAG {f.ver}</span>}
                  {!isWcag && <span className="tag">{f.principle}</span>}
                  {f.auto > 0 && <span className="tag">{f.auto} automated checks</span>}
                </div>
              </div>
              {f.approved
                ? <span className="badge b-ok"><Icons.check size={12} sw={3} />Approved{f.edited ? " · edited" : ""}</span>
                : f.edited ? <span className="tag" style={{ color: "var(--accent)" }}>Edited draft</span> : <span className="tag">AI draft</span>}
            </div>

            {f.obsolete && (
              <div className="row" style={{ gap: 9, marginTop: 14, padding: "10px 13px", background: "var(--na-bg)", borderRadius: "var(--radius-sm)" }}>
                <span style={{ color: "var(--na)" }}><Icons.alert size={16} /></span>
                <span className="faint" style={{ fontSize: 12.5 }}>Obsolete in WCAG 2.2 — resolves automatically to “Supports” for 2.0 / 2.1.</span>
              </div>
            )}

            {/* confidence */}
            <div className="row" style={{ gap: 10, marginTop: 18 }}>
              <span className="micro faint">AI confidence</span>
              <div className="bar" style={{ flex: 1, maxWidth: 220, height: 5 }}>
                <span style={{ width: `${Math.round(f.confidence*100)}%`, background: f.confidence > 0.8 ? "var(--ok)" : f.confidence > 0.7 ? "var(--warn)" : "var(--bad)" }} />
              </div>
              <span className="mono faint" style={{ fontSize: 12 }}>{Math.round(f.confidence*100)}%</span>
              {f.confidence < 0.72 && <span className="badge b-warn" style={{ fontSize: 11 }}><Icons.alert size={12} />Worth a closer look</span>}
            </div>

            <hr className="divider" style={{ margin: "18px 0" }} />

            {/* conformance selector */}
            <div className="micro muted" style={{ marginBottom: 10 }}>Conformance level</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {Object.keys(STATUS_META).filter(s => s !== "Not Evaluated" || f.section === "AAA").map(s => {
                const on = f.status === s;
                const c = statusColor(s);
                return (
                  <button key={s} onClick={() => update({ status: s })}
                    style={{ padding: "9px 14px", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, display: "flex", gap: 8, alignItems: "center",
                      border: on ? `1.5px solid ${c}` : "1px solid var(--border-strong)",
                      background: on ? `color-mix(in oklab, ${c} 12%, var(--surface))` : "var(--surface)",
                      color: on ? c : "var(--text-muted)" }}>
                    <span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{s}
                  </button>
                );
              })}
            </div>

            {/* remarks */}
            <div className="row between" style={{ marginTop: 22, marginBottom: 8 }}>
              <span className="micro muted">Remarks & explanations</span>
              <span className="faint" style={{ fontSize: 11.5 }}>Editable</span>
            </div>
            <textarea className="textarea" value={f.remarks} onChange={e => update({ remarks: e.target.value })} style={{ minHeight: 110 }} />

            {/* evidence */}
            {f.evidence && f.evidence.length > 0 && (
              <React.Fragment>
                <div className="micro muted" style={{ marginTop: 20, marginBottom: 10 }}>Supporting evidence · {f.evidence.length}</div>
                <div className="col" style={{ gap: 7 }}>
                  {f.evidence.map((ev, i) => (
                    <div key={i} className="row" style={{ gap: 11, padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", border: "var(--hair)" }}>
                      <span style={{ color: ev.type === "issue" ? "var(--bad)" : "var(--ok)", marginTop: 1 }}>
                        {ev.type === "issue" ? <Icons.alert size={16} /> : <Icons.checkCircle size={16} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 13.5 }}>{ev.text}</span>
                      <span className="mono faint" style={{ fontSize: 11.5, textAlign: "right" }}>{ev.where}</span>
                    </div>
                  ))}
                </div>
              </React.Fragment>
            )}

            {/* cross-references — the INT edition signature */}
            {xref && (
              <div style={{ marginTop: 20, padding: "13px 15px", borderRadius: "var(--radius-sm)", border: "var(--hair)", background: "var(--surface-2)" }}>
                <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                  <Icons.shield size={15} className="faint" />
                  <span className="micro muted">This response also documents conformance for</span>
                </div>
                <div className="col" style={{ gap: 8 }}>
                  <div className="row wrap" style={{ gap: 6, alignItems: "baseline" }}>
                    <span className="faint" style={{ fontSize: 11.5, width: 92, flex: "none" }}>EN 301 549</span>
                    {xref.en.map(x => <span key={x} className="tag">{x}</span>)}
                  </div>
                  <div className="row wrap" style={{ gap: 6, alignItems: "baseline" }}>
                    <span className="faint" style={{ fontSize: 11.5, width: 92, flex: "none" }}>Section 508</span>
                    {xref.s508.map(x => <span key={x} className="tag">{x}</span>)}
                  </div>
                </div>
              </div>
            )}

            {/* approve */}
            <div className="row between" style={{ marginTop: 22, paddingTop: 18, borderTop: "var(--hair)", gap: 12, flexWrap: "wrap" }}>
              <span className="faint" style={{ fontSize: 12.5 }}>{f.approved ? "Approved — edits are saved automatically." : "Review the level and remarks above, then approve."}</span>
              <button className="btn btn-primary" onClick={approveAndNext}>
                <Icons.check size={16} className="ic" />{f.approved ? "Next finding" : "Approve & continue"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <NavBar onBack={onBack} onNext={onNext} disabled={!allApproved}
        nextLabel={allApproved ? "Assemble report" : `Approve all to continue (${findings.length - approvedCount} left)`} nextIcon={Icons.doc} />
      <style>{`@media (max-width:820px){ .rev-grid{ grid-template-columns:1fr !important; } .rev-side{ position:static !important; max-height:300px !important; } }`}</style>
    </div>
  );
}

/* ============ STEP 6 — DOWNLOAD ============ */
function DownloadScreen({ state, findings, onBack, onRestart }) {
  const REPORTS = window.VPAT.REPORTS;
  const countsBy = (items) => Object.keys(STATUS_META).reduce((a, s) => (a[s] = items.filter(f => f.status === s).length, a), {});
  const counts = countsBy(findings);
  const applicable = findings.length - counts["Not Applicable"] - counts["Not Evaluated"];
  const score = Math.round(((counts["Supports"] + counts["Partially Supports"] * 0.5) / applicable) * 100);
  const edited = findings.filter(f => f.edited).length;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const [downloaded, setDownloaded] = useState(null);
  const domain = state.domain || "clarus-health.example";
  const level = state.level || "AA";
  const levelRank = { A: 1, AA: 2, AAA: 3 }[level];

  const rows = [
    ["Supports", counts["Supports"], "var(--ok)"],
    ["Partially Supports", counts["Partially Supports"], "var(--warn)"],
    ["Does Not Support", counts["Does Not Support"], "var(--bad)"],
    ["Not Applicable", counts["Not Applicable"], "var(--na)"],
  ];

  // applicable standards table
  const yes = (ok) => ok ? <span className="badge b-ok" style={{ fontSize: 11 }}>Yes</span> : <span className="tag">No</span>;
  const wcagRow = (ver) => ({ ver, a: true, aa: levelRank >= 2, aaa: levelRank >= 3 });
  const wcagRows = [wcagRow("2.0"), wcagRow("2.1"), wcagRow("2.2")];

  const header = [
    ["Name of Product / Version", `${domain} — web platform, v2025.6`],
    ["Report Date", today],
    ["Product Description", "Customer-facing web application: marketing site, product catalog, authenticated account area and support center."],
    ["Contact Information", "accessibility@" + domain],
    ["Evaluation Methods Used", "Automated scan (axe-core, WCAG 2.2 ruleset) across 10 pages + AI-assisted manual review with screen-reader and keyboard simulation."],
    ["Notes", "Draft ACR generated for internal review. Confirm findings before publication."],
  ];

  return (
    <div className="screen" style={{ maxWidth: 940, margin: "0 auto" }}>
      <div className="row" style={{ gap: 12, color: "var(--ok)" }}>
        <Icons.checkCircle size={26} />
        <div className="eyebrow" style={{ color: "var(--ok)" }}>Step 06 — Report ready</div>
      </div>
      <h1 className="title" style={{ marginBottom: 6 }}>Accessibility Conformance Report assembled</h1>
      <p className="lead">All {findings.length} criteria reviewed and approved across the WCAG 2.2, Section 508 and EN 301 549 reports. Based on the VPAT® 2.5Rev International Edition.</p>

      {/* conformance summary */}
      <div className="card" style={{ marginTop: 26, display: "grid", gridTemplateColumns: "auto 1fr", gap: "clamp(20px,4vw,40px)", alignItems: "center" }}>
        <div className="col" style={{ alignItems: "center" }}>
          <div style={{ position: "relative", width: 132, height: 132 }}>
            <Ring pct={score} />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <div className="col" style={{ alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>{score}%</span>
                <span className="micro faint" style={{ marginTop: 3 }}>conformance</span>
              </div>
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 10, minWidth: 0 }}>
          {rows.map(([label, n, c]) => (
            <div key={label} className="row" style={{ gap: 12 }}>
              <span className="dot" style={{ width: 9, height: 9, borderRadius: "50%", background: c, flex: "none" }} />
              <span style={{ fontSize: 13.5, flex: 1 }}>{label}</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{n}</span>
              <div className="bar" style={{ width: 120, height: 6 }}><span style={{ width: `${(n/findings.length)*100}%`, background: c }} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* per-report breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 16 }}>
        {REPORTS.map(r => {
          const items = findings.filter(f => f.report === r.id);
          const c = countsBy(items);
          const seg = [["Supports", "var(--ok)"], ["Partially Supports", "var(--warn)"], ["Does Not Support", "var(--bad)"], ["Not Applicable", "var(--na)"]];
          return (
            <div key={r.id} className="panel" style={{ padding: "15px 16px" }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                <span className="mono faint" style={{ fontSize: 11.5 }}>{items.length}</span>
              </div>
              <div className="row" style={{ height: 8, borderRadius: "var(--radius-pill)", overflow: "hidden", gap: 0, border: "var(--hair)" }}>
                {seg.map(([s, col]) => c[s] > 0 && <span key={s} style={{ width: `${(c[s]/items.length)*100}%`, background: col }} />)}
              </div>
              <div className="row wrap" style={{ gap: 10, marginTop: 10 }}>
                {seg.filter(([s]) => c[s] > 0).map(([s, col]) => (
                  <span key={s} className="row" style={{ gap: 5, fontSize: 11.5 }}>
                    <span className="dot" style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />
                    <span className="faint">{STATUS_META[s].short} {c[s]}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ACR header info */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="micro muted" style={{ marginBottom: 14 }}>Accessibility Conformance Report — International Edition · VPAT® 2.5Rev</div>
        <div style={{ display: "grid", gap: 12 }}>
          {header.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(140px,200px) 1fr", gap: 16 }} className="acr-row">
              <div className="faint" style={{ fontSize: 12.5, fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: 13.5, wordBreak: "break-word" }}>{v}</div>
            </div>
          ))}
        </div>

        <hr className="divider" style={{ margin: "18px 0" }} />
        <div className="micro muted" style={{ marginBottom: 12 }}>Applicable standards / guidelines</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: "6px 10px", fontWeight: 600, color: "var(--text-muted)" }}>Standard / Guideline</th>
                <th style={{ padding: "6px 10px", fontWeight: 600, color: "var(--text-muted)" }}>Included in report</th>
              </tr>
            </thead>
            <tbody>
              {wcagRows.map(w => (
                <tr key={w.ver} style={{ borderTop: "var(--hair)" }}>
                  <td style={{ padding: "8px 10px" }}>WCAG {w.ver}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span className="row wrap" style={{ gap: 6 }}>
                      <span className="row" style={{ gap: 5 }}>{yes(w.a)} <span className="faint" style={{ fontSize: 11.5 }}>A</span></span>
                      <span className="row" style={{ gap: 5 }}>{yes(w.aa)} <span className="faint" style={{ fontSize: 11.5 }}>AA</span></span>
                      <span className="row" style={{ gap: 5 }}>{yes(w.aaa)} <span className="faint" style={{ fontSize: 11.5 }}>AAA</span></span>
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "var(--hair)" }}><td style={{ padding: "8px 10px" }}>Revised Section 508</td><td style={{ padding: "8px 10px" }}>{yes(true)}</td></tr>
              <tr style={{ borderTop: "var(--hair)" }}><td style={{ padding: "8px 10px" }}>EN 301 549 (V3.1.1 & V3.2.1)</td><td style={{ padding: "8px 10px" }}>{yes(true)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* downloads */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between wrap" style={{ gap: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Download the report</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>VPAT® 2.5Rev International Edition · 3 reports, conformance tables, remarks & evidence appendix.</div>
          </div>
          <div className="row wrap" style={{ gap: 9 }}>
            {[["PDF", Icons.doc], ["Word", Icons.doc], [".vpat", Icons.code]].map(([fmt, Ic], i) => (
              <button key={fmt} className={i === 0 ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setDownloaded(fmt)}>
                {i === 0 ? <Icons.download size={16} className="ic" /> : <Ic size={16} className="ic" />}{fmt}
              </button>
            ))}
          </div>
        </div>
        {downloaded && (
          <div className="row screen" style={{ gap: 9, marginTop: 16, padding: "11px 14px", background: "var(--ok-bg)", borderRadius: "var(--radius-sm)" }}>
            <span style={{ color: "var(--ok)" }}><Icons.checkCircle size={17} /></span>
            <span style={{ fontSize: 13, color: "var(--ok)", fontWeight: 600 }}>VPAT2.5Rev-INT-{domain.replace(/\..*/,"")}-{today.replace(/\s|,/g,"")}.{downloaded === "Word" ? "docx" : downloaded === "PDF" ? "pdf" : "vpat"} downloaded</span>
            <span className="faint" style={{ fontSize: 12 }}>(prototype — no file generated)</span>
          </div>
        )}
        <div className="faint" style={{ fontSize: 11.5, marginTop: 14 }}>{edited} of {findings.length} findings edited from the AI draft before approval.</div>
      </div>

      <NavBar onBack={onBack} onNext={null}>
        <button className="btn btn-quiet" onClick={onRestart}>Start a new report</button>
      </NavBar>
      <style>{`@media (max-width:560px){ .acr-row{ grid-template-columns:1fr !important; gap:2px !important; } }`}</style>
    </div>
  );
}

Object.assign(window, { ReviewScreen, DownloadScreen });
