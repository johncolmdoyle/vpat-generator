/* vpat-screens.jsx — Domain, Credentials, Examining, Generating, Download screens. */

// International edition always bundles all three; the report's title reflects this.
const INT_STANDARDS = [
  { label: "WCAG 2.0 / 2.1 / 2.2", note: "W3C Web Content Accessibility Guidelines" },
  { label: "Revised Section 508", note: "U.S. federal procurement" },
  { label: "EN 301 549", note: "European public sector (V3.1.1 & V3.2.1)" },
];
const LEVELS = [
  ["A", "Level A", "Minimum"],
  ["AA", "Level A & AA", "Standard target"],
  ["AAA", "Level A, AA & AAA", "Most stringent"],
];


/* ---------- footer nav shared by screens ---------- */
function NavBar({ onBack, onNext, nextLabel = "Continue", nextIcon, disabled, back = true, children }) {
  return (
    <div className="row between" style={{ marginTop: 28, gap: 12, flexWrap: "wrap" }}>
      <div>{back && <button className="btn btn-quiet" onClick={onBack}><Icons.arrowL size={16} className="ic" />Back</button>}</div>
      <div className="row" style={{ gap: 10 }}>
        {children}
        {onNext &&
        <button className="btn btn-primary" onClick={onNext} disabled={disabled}>
            {nextLabel}{(nextIcon || Icons.arrowR)({ size: 16, className: "ic" })}
          </button>
        }
      </div>
    </div>);

}

/* ============ STEP 1 — DOMAIN ============ */
function DomainScreen({ state, set, onNext }) {
  const [domain, setDomain] = useState(state.domain || "");
  const [level, setLevel] = useState(state.level || "AA");
  const [scope, setScope] = useState(state.scope || "auto");
  const valid = domain.trim().length > 2 && domain.includes(".");

  const commit = () => {set({ domain: domain.trim(), level, scope });onNext();};

  return (
    <div className="screen" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="eyebrow">Step 01 — Target</div>
      <h1 className="title">What site should we evaluate?</h1>
      <p className="lead">We’ll crawl the site, run automated checks, and assemble a draft <strong>Accessibility Conformance Report</strong> on the VPAT® 2.5Rev <strong>International Edition</strong> template.</p>

      <div className="field" style={{ marginTop: 30 }}>
        <label htmlFor="dom">Website URL</label>
        <div className="input-prefix">
          <span className="pfx">https://</span>
          <input id="dom" value={domain} placeholder="clarus-health.example"
          onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\//, ""))}
          onKeyDown={(e) => e.key === "Enter" && valid && commit()} autoFocus />
        </div>
        <div className="row wrap" style={{ gap: 7, marginTop: 4 }}>
          <span className="hint">Try:</span>
          {["clarus-health.example", "northwind-portal.example"].map((s) =>
          <button key={s} className="tag" style={{ cursor: "pointer" }} onClick={() => setDomain(s)}>{s}</button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 28, padding: "16px 18px" }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="micro muted">Standards covered — International Edition</span>
          <span className="tag">All three included</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          {INT_STANDARDS.map((s) => (
            <div key={s.label} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
              <span style={{ color: "var(--ok)", marginTop: 1 }}><Icons.checkCircle size={16} /></span>
              <span>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>{s.note}</div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="micro muted" style={{ marginBottom: 12 }}>WCAG conformance target</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {LEVELS.map(([id, l, d]) => (
            <button key={id} onClick={() => setLevel(id)}
              style={{ padding: "10px 14px", borderRadius: "var(--radius-pill)", fontSize: 13, fontWeight: 600,
                border: level === id ? "1.5px solid var(--accent)" : "1px solid var(--border-strong)",
                background: level === id ? "color-mix(in oklab, var(--accent) 10%, var(--surface))" : "var(--surface)",
                color: level === id ? "var(--accent)" : "var(--text-muted)" }} title={d}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="micro muted" style={{ marginBottom: 12 }}>Crawl scope</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {[["auto", "Auto-discover", "Up to 25 reachable pages"], ["single", "This page only", "Single URL"], ["sitemap", "From sitemap", "Use /sitemap.xml"]].map(([id, l, d]) =>
          <button key={id} onClick={() => setScope(id)}
          style={{ padding: "10px 14px", borderRadius: "var(--radius-pill)", fontSize: 13, fontWeight: 600,
            border: scope === id ? "1.5px solid var(--accent)" : "1px solid var(--border-strong)",
            background: scope === id ? "color-mix(in oklab, var(--accent) 10%, var(--surface))" : "var(--surface)",
            color: scope === id ? "var(--accent)" : "var(--text-muted)" }} title={d}>{l}</button>
          )}
        </div>
      </div>

      <NavBar back={false} onNext={commit} disabled={!valid} nextLabel="Set up access" />
    </div>);

}

/* ============ STEP 2 — CREDENTIALS ============ */
function CredentialsScreen({ state, set, onNext, onBack }) {
  const [mode, setMode] = useState(state.authMode || "public");
  const [user, setUser] = useState(state.user || "");
  const [pass, setPass] = useState(state.pass || "");
  const [loginUrl, setLoginUrl] = useState(state.loginUrl || "/login");
  const [show, setShow] = useState(false);
  const ok = mode === "public" || user.trim() && pass.trim();

  const commit = () => {set({ authMode: mode, user, pass, loginUrl });onNext();};
  const authPages = window.VPAT.PAGES.filter((p) => p.auth).length;

  return (
    <div className="screen" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="eyebrow">Step 02 — Access</div>
      <h1 className="title">Can we reach protected pages?</h1>
      <p className="lead">{authPages} of the discovered pages sit behind a sign-in. Provide test credentials to evaluate them, or scan public pages only.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 28 }}>
        {[["public", Icons.globe, "Public pages only", "Skip authenticated areas"],
        ["auth", Icons.lock, "Use credentials", "Sign in to reach gated pages"]].map(([id, Ic, t, d]) =>
        <button key={id} onClick={() => setMode(id)}
        style={{ textAlign: "left", padding: "18px 18px", borderRadius: "var(--radius)",
          border: mode === id ? "1.5px solid var(--accent)" : "1px solid var(--border-strong)",
          background: mode === id ? "color-mix(in oklab, var(--accent) 6%, var(--surface))" : "var(--surface)",
          boxShadow: mode === id ? "var(--shadow)" : "none", transition: "all .14s" }}>
            <span style={{ color: mode === id ? "var(--accent)" : "var(--text-muted)" }}><Ic size={22} /></span>
            <div style={{ fontWeight: 600, fontSize: 15, marginTop: 10 }}>{t}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{d}</div>
          </button>
        )}
      </div>

      {mode === "auth" &&
      <div className="card screen" style={{ marginTop: 16, padding: "var(--pad)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label htmlFor="u">Username or email</label>
              <input id="u" className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="qa-tester@clarus.example" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="p">Password</label>
              <div className="input-prefix" style={{ padding: 0 }}>
                <input id="p" type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••••" autoComplete="off"
              style={{ padding: "11px 13px", border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 14.5 }} />
                <button className="btn btn-quiet" style={{ padding: "0 12px" }} onClick={() => setShow((s) => !s)} aria-label="Toggle password visibility"><Icons.eye size={16} /></button>
              </div>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="lu">Login page</label>
              <input id="lu" className="input" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="/login" />
              <span className="hint">We’ll submit these once to establish a session, then crawl as the signed-in user.</span>
            </div>
          </div>
          <div className="row" style={{ gap: 9, marginTop: 16, padding: "11px 13px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "var(--hair)" }}>
            <span style={{ color: "var(--ok)" }}><Icons.shield size={17} /></span>
            <span className="faint" style={{ fontSize: 12.5 }}>Credentials are encrypted in transit, used only for this scan, and never written to the report.</span>
          </div>
        </div>
      }

      <NavBar onBack={onBack} onNext={commit} disabled={!ok} nextLabel="Begin examination" nextIcon={Icons.scan} />
    </div>);

}

/* ============ STEP 3 — EXAMINING ============ */
function ExaminingScreen({ state, onNext, onBack }) {
  const phases = window.VPAT.SCAN_PHASES;
  const pages = window.VPAT.PAGES.filter((p) => state.authMode === "auth" || !p.auth);
  const [pi, setPi] = useState(0); // current phase index
  const [log, setLog] = useState([]);
  const [issues, setIssues] = useState(0);
  const [evidence, setEvidence] = useState(0);
  const [done, setDone] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    let pIdx = 0,alive = true;
    const queue = [];
    // build interleaved log of phases + page hits
    phases.forEach((ph, idx) => {
      queue.push({ kind: "phase", idx, text: ph.label });
      if (ph.key === "axe" || ph.key === "render") {
        pages.forEach((pg) => queue.push({ kind: "page", phase: idx, url: pg.url, title: pg.title }));
      }
    });
    let qi = 0;
    const step = () => {
      if (!alive) return;
      if (qi >= queue.length) {
        setPi(phases.length);setDone(true);return;
      }
      const item = queue[qi++];
      if (item.kind === "phase") {
        setPi(item.idx);
        setLog((l) => [...l, { t: "phase", text: item.text }].slice(-60));
      } else {
        const found = Math.floor(Math.random() * 9);
        setIssues((n) => n + found);
        setEvidence((n) => n + 1 + Math.floor(Math.random() * 2));
        setLog((l) => [...l, { t: found > 4 ? "warn" : "ok", text: `GET ${item.url}`, meta: found ? `${found} issues · ${item.title}` : `clean · ${item.title}` }].slice(-60));
      }
      setTimeout(step, item.kind === "phase" ? 520 : 230);
    };
    const id = setTimeout(step, 350);
    return () => {alive = false;clearTimeout(id);};
  }, []);

  useEffect(() => {if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;}, [log]);

  const pct = Math.round(Math.min(pi, phases.length) / phases.length * 100);

  return (
    <div className="screen">
      <div className="row between wrap" style={{ alignItems: "flex-end", gap: 16 }}>
        <div>
          <div className="eyebrow">Step 03 — Examination</div>
          <h1 className="title" style={{ marginBottom: 4 }}>{done ? "Examination complete" : "Examining the site"}</h1>
          <p className="lead mono" style={{ fontSize: 14 }}>https://{state.domain || "clarus-health.example"}</p>
        </div>
        <div className="row" style={{ gap: 22 }}>
          <Stat n={pages.length} label="pages" />
          <Stat n={issues} label="auto issues" tone="warn" />
          <Stat n={evidence} label="evidence" tone="accent" />
        </div>
      </div>

      <div className="bar" style={{ margin: "20px 0 22px" }}><span style={{ width: `${done ? 100 : pct}%` }} /></div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 16 }} className="exam-grid">
        {/* phase checklist */}
        <div className="panel" style={{ padding: "var(--pad)" }}>
          <div className="micro muted" style={{ marginBottom: 14 }}>Pipeline</div>
          <div className="col" style={{ gap: 2 }}>
            {phases.map((ph, i) => {
              const st = i < pi || done ? "done" : i === pi ? "active" : "todo";
              return (
                <div key={ph.key} className="row" style={{ gap: 12, padding: "9px 0", opacity: st === "todo" ? .5 : 1, transition: "opacity .3s" }}>
                  <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center",
                    background: st === "done" ? "var(--ok-bg)" : st === "active" ? "color-mix(in oklab,var(--accent) 14%,transparent)" : "var(--surface-2)",
                    color: st === "done" ? "var(--ok)" : "var(--accent)", border: st === "todo" ? "1px solid var(--border)" : "none" }}>
                    {st === "done" ? <Icons.check size={13} sw={2.6} /> : st === "active" ? <Spinner /> : <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-faint)" }} />}
                  </span>
                  <span style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{ph.label}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>{ph.detail}</div>
                  </span>
                </div>);

            })}
          </div>
        </div>

        {/* live log */}
        <div className="panel" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="row" style={{ gap: 8, padding: "12px 16px", borderBottom: "var(--hair)" }}>
            <Icons.code size={15} className="faint" />
            <span className="micro muted">Activity log</span>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="tag">{log.length}</span>
          </div>
          <div ref={logRef} style={{ fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.7, padding: "12px 16px", height: 320, overflowY: "auto" }}>
            {log.map((e, i) =>
            <div key={i} className="row" style={{ gap: 8, color: e.t === "phase" ? "var(--text)" : "var(--text-muted)" }}>
                {e.t === "phase" ? <span style={{ color: "var(--accent)" }}>▸</span> :
              e.t === "warn" ? <span style={{ color: "var(--warn)" }}>!</span> :
              <span style={{ color: "var(--ok)" }}>✓</span>}
                <span style={{ flex: 1 }}>{e.text}{e.meta && <span className="faint"> — {e.meta}</span>}</span>
              </div>
            )}
            {done && <div style={{ color: "var(--ok)", marginTop: 8 }}>▸ done · {evidence} evidence items captured</div>}
          </div>
        </div>
      </div>

      <NavBar onBack={onBack} onNext={done ? onNext : null} nextLabel="Draft findings with AI" nextIcon={Icons.sparkle}>
        {!done && <span className="row faint" style={{ gap: 9, fontSize: 13 }}><Spinner /> Scanning…</span>}
      </NavBar>
      <style>{`@media (max-width:760px){ .exam-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>);

}

function Stat({ n, label, tone }) {
  const v = Math.round(useCountUp(n, 500));
  const c = tone === "warn" ? "var(--warn)" : tone === "accent" ? "var(--accent)" : "var(--text)";
  return (
    <div className="col" style={{ alignItems: "center" }}>
      <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: c, lineHeight: 1 }}>{v}</div>
      <div className="micro faint" style={{ marginTop: 5 }}>{label}</div>
    </div>);

}
function Spinner() {
  return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ animation: "spin 0.7s linear infinite" }}>
    <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </svg>;
}

/* ============ STEP 4 — GENERATING ============ */
function GeneratingScreen({ state, findings, onNext, onBack }) {
  const gen = window.VPAT.GEN_PHASES;
  const total = findings.length;
  const [drafted, setDrafted] = useState(0);
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true,n = 0;
    const tick = () => {
      if (!alive) return;
      n++;
      setDrafted(n);
      setPhase(Math.min(gen.length - 1, Math.floor(n / total * gen.length)));
      if (n >= total) {setTimeout(() => alive && setDone(true), 400);return;}
      setTimeout(tick, 180 + Math.random() * 120);
    };
    const id = setTimeout(tick, 500);
    return () => {alive = false;clearTimeout(id);};
  }, []);

  return (
    <div className="screen" style={{ maxWidth: 860, margin: "0 auto" }}>
      <div className="eyebrow">Step 04 — Drafting</div>
      <h1 className="title" style={{ marginBottom: 4 }}>{done ? "Draft findings ready" : "Drafting findings with AI"}</h1>
      <p className="lead">Each criterion is matched to the captured evidence, assigned a conformance level with plain-language remarks, and cross-referenced across all three standards — then scored for confidence. Everything is editable in the next step.</p>

      <div className="card" style={{ marginTop: 26 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <span className="micro muted">{done ? "Generation complete" : gen[phase]}…</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{Math.min(drafted, total)} / {total}</span>
        </div>
        <div className="bar" style={{ marginBottom: 20 }}><span style={{ width: `${Math.min(drafted, total) / total * 100}%` }} /></div>

        {window.VPAT.REPORTS.map((rep) => {
          const items = findings.map((f, i) => ({ f, i })).filter((o) => o.f.report === rep.id);
          if (!items.length) return null;
          return (
            <div key={rep.id} style={{ marginBottom: 16 }}>
              <div className="micro faint" style={{ marginBottom: 8 }}>{rep.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
                {items.map(({ f, i }) => {
                  const on = i < drafted;
                  return (
                    <div key={f.id} className="row" style={{ gap: 8, padding: "9px 11px", borderRadius: "var(--radius-sm)",
                      border: "var(--hair)", background: on ? "var(--surface-2)" : "transparent", opacity: on ? 1 : .4,
                      transition: "all .35s" }}>
                      {on ? <span style={{ color: statusColor(f.status) }}><Icons.checkCircle size={15} /></span> :
                      <span style={{ width: 15, height: 15, display: "grid", placeItems: "center" }}><Spinner /></span>}
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{f.id}</span>
                      <span className="faint" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    </div>);
                })}
              </div>
            </div>);
        })}
      </div>

      <NavBar onBack={onBack} onNext={done ? onNext : null} nextLabel="Review findings" nextIcon={Icons.eye}>
        {!done && <span className="row faint" style={{ gap: 9, fontSize: 13 }}><Spinner /> Generating…</span>}
      </NavBar>
    </div>);

}

Object.assign(window, { DomainScreen, CredentialsScreen, ExaminingScreen, GeneratingScreen, Stat, Spinner, NavBar });