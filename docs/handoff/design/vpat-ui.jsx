/* vpat-ui.jsx — shared icons, helpers, small components. Exports to window. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* --- minimal stroke icons (geometric only) --- */
const Icon = ({ d, size = 18, fill, stroke = "currentColor", sw = 1.7, children, vb = 24, ...p }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill || "none"}
       stroke={children ? stroke : (fill ? "none" : stroke)} strokeWidth={sw}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children || <path d={d} />}
  </svg>
);
const Icons = {
  globe: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18"/></Icon>,
  lock: (p) => <Icon {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></Icon>,
  scan: (p) => <Icon {...p}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/></Icon>,
  sparkle: (p) => <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/></Icon>,
  check: (p) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7"/></Icon>,
  checkCircle: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.6 2.6L16 9"/></Icon>,
  doc: (p) => <Icon {...p}><path d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a0 0 0 0 1 0 0V3Z"/><path d="M14 3v5h5"/></Icon>,
  download: (p) => <Icon {...p}><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/></Icon>,
  arrowR: (p) => <Icon {...p}><path d="M5 12h13m0 0l-5-5m5 5l-5 5"/></Icon>,
  arrowL: (p) => <Icon {...p}><path d="M19 12H6m0 0l5-5m-5 5l5 5"/></Icon>,
  edit: (p) => <Icon {...p}><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3Z"/><path d="M13.5 6.5l3 3"/></Icon>,
  alert: (p) => <Icon {...p}><path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.4" fill="currentColor" stroke="none"/><path d="M10.3 4.3 2.8 17.3A2 2 0 0 0 4.5 20.3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/></Icon>,
  eye: (p) => <Icon {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></Icon>,
  code: (p) => <Icon {...p}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/></Icon>,
  page: (p) => <Icon {...p}><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></Icon>,
  clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></Icon>,
  shield: (p) => <Icon {...p}><path d="M12 3l7 2.5v5.5c0 4.6-3 8.2-7 9.5-4-1.3-7-4.9-7-9.5V5.5L12 3Z"/></Icon>,
  filter: (p) => <Icon {...p}><path d="M4 6h16M7 12h10M10 18h4"/></Icon>,
  x: (p) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>,
};

/* conformance → badge style */
const STATUS_META = {
  "Supports":           { cls: "b-ok",   short: "Supports" },
  "Partially Supports": { cls: "b-warn", short: "Partial" },
  "Does Not Support":   { cls: "b-bad",  short: "Does Not" },
  "Not Applicable":     { cls: "b-na",   short: "N/A" },
  "Not Evaluated":      { cls: "b-na",   short: "Not Eval" },
};
const statusColor = (status) => ({ "b-ok": "var(--ok)", "b-warn": "var(--warn)", "b-bad": "var(--bad)", "b-na": "var(--na)" }[(STATUS_META[status] || STATUS_META["Not Applicable"]).cls]);
const StatusBadge = ({ status, full }) => {
  const m = STATUS_META[status] || STATUS_META["Not Applicable"];
  return <span className={`badge ${m.cls}`}><span className="dot" />{full ? status : m.short}</span>;
};

/* report metadata for the INT edition's three sub-reports */
const REPORT_META = {
  wcag: { short: "WCAG 2.2", full: "WCAG 2.2 Report" },
  "508": { short: "Section 508", full: "Revised Section 508 Report" },
  en: { short: "EN 301 549", full: "EN 301 549 Report" },
};

/* The INT edition records each WCAG criterion once and cross-references it from
   EN 301 549 and Revised Section 508. Compute the representative mapping. */
function wcagAlsoApplies(id) {
  return {
    en: [`9.${id} (Web)`, `10.${id} (Non-web doc)`, `11.${id}.1 (Software)`, "12.1.2 / 12.2.4 (Docs)"],
    s508: ["501.1 (Web / Software)", "504.2 (Authoring Tool)", "602.3 (Support Docs)"],
  };
}

const PRINCIPLES = ["Perceivable", "Operable", "Understandable", "Robust"];

/* animated count-up number */
function useCountUp(target, dur = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const settle = setTimeout(() => setV(target), dur + 80); // guarantee final value if rAF is throttled
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [target, dur]);
  return v;
}

/* donut ring for summary */
function Ring({ pct, size = 132, stroke = 13, color = "var(--accent)", track = "var(--surface-2)" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const animPct = useCountUp(pct, 900);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - animPct/100)}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

Object.assign(window, { Icon, Icons, StatusBadge, STATUS_META, statusColor, wcagAlsoApplies, REPORT_META, PRINCIPLES, useCountUp, Ring,
  useState, useEffect, useRef, useMemo, useCallback });
