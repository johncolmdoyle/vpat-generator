/* vpat-app.jsx — orchestrator: stepper, state machine, tweaks. */

const STEPS = [
  { key: "domain",     label: "Target" },
  { key: "creds",      label: "Access" },
  { key: "examine",    label: "Examine" },
  { key: "generate",   label: "Draft" },
  { key: "review",     label: "Review" },
  { key: "report",     label: "Report" },
];

const ACCENTS = ["#4f56d3", "#2f6fdb", "#0e8f86", "#7a4fd0"];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "airy",
  "accent": "#4f56d3",
  "density": "regular"
}/*EDITMODE-END*/;

function initFindings() {
  return window.VPAT.CRITERIA.map(c => ({ ...c, approved: false, edited: false }));
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [form, setForm] = useState({});
  const [findings, setFindings] = useState(initFindings);

  // apply tweaks to root
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.direction = t.direction || "airy";
    if (t.density === "regular") r.removeAttribute("data-density");
    else r.dataset.density = t.density;
    r.style.setProperty("--accent", t.accent || "#4f56d3");
  }, [t.direction, t.density, t.accent]);

  const go = (n) => { setStep(n); setReached(r => Math.max(r, n)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const restart = () => { setForm({}); setFindings(initFindings()); setStep(0); setReached(0); window.scrollTo({ top: 0 }); };

  const key = STEPS[step].key;

  return (
    <div className="app">
      {/* top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="mark">Ax</span>
          <span className="name">Axiom<span className="sub">VPAT</span></span>
        </div>
        <nav className="stepper" aria-label="Progress">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 && <span className="step-divider" />}
              <button className={`step ${i === step ? "active" : i < reached || i < step ? "done" : ""}`}
                onClick={() => i <= reached && go(i)} disabled={i > reached}
                style={{ cursor: i <= reached ? "pointer" : "default" }}>
                <span className="num">{i < step ? <Icons.check size={11} sw={3} /> : i + 1}</span>
                <span className="lbl">{s.label}</span>
              </button>
            </React.Fragment>
          ))}
        </nav>
        <span className="spacer" />
        <span className="draftpill hide-mob">Draft · auto-saved</span>
      </header>

      <main className="main">
        {key === "domain"   && <DomainScreen state={form} set={set} onNext={() => go(1)} />}
        {key === "creds"    && <CredentialsScreen state={form} set={set} onNext={() => go(2)} onBack={() => go(0)} />}
        {key === "examine"  && <ExaminingScreen state={form} onNext={() => go(3)} onBack={() => go(1)} />}
        {key === "generate" && <GeneratingScreen state={form} findings={findings} onNext={() => go(4)} onBack={() => go(2)} />}
        {key === "review"   && <ReviewScreen findings={findings} setFindings={setFindings} onNext={() => go(5)} onBack={() => go(3)} />}
        {key === "report"   && <DownloadScreen state={form} findings={findings} onBack={() => go(4)} onRestart={restart} />}
      </main>

      {/* mobile progress bar (visible <880px) */}
      <MobileProgress step={step} total={STEPS.length} label={STEPS[step].label} />

      <TweaksPanel>
        <TweakSection label="Design direction" />
        <TweakRadio label="Direction" value={t.direction}
          options={["airy", "console", "slate"]}
          onChange={v => setTweak("direction", v)} />
        <TweakColor label="Accent" value={t.accent} options={ACCENTS} onChange={v => setTweak("accent", v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density}
          options={["compact", "regular", "roomy"]}
          onChange={v => setTweak("density", v === "roomy" ? "comfortable" : v)} />
      </TweaksPanel>
    </div>
  );
}

function MobileProgress({ step, total, label }) {
  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 20 }} className="mob-prog">
      <div className="row" style={{ gap: 12, padding: "10px 16px", background: "color-mix(in oklab,var(--surface) 92%,transparent)", backdropFilter: "blur(8px)", borderTop: "var(--hair)" }}>
        <span className="micro muted" style={{ flex: "none" }}>{String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        <div className="bar" style={{ flex: 1 }}><span style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
        <span className="micro" style={{ flex: "none", fontWeight: 600 }}>{label}</span>
      </div>
      <style>{`.mob-prog{display:block}@media(min-width:880px){.mob-prog{display:none}}`}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
