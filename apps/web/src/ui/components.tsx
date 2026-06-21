/* Shared presentational pieces: count-up hook, donut ring, spinner, status badge, nav bar. */
import { useEffect, useState, type ReactNode } from 'react';
import type { ConformanceLevel } from '@vpat/shared';
import { Icons, type IconProps } from './icons.js';
import { STATUS_META } from './status.js';

/** Animated count-up number (ease-out cubic). */
export function useCountUp(target: number, dur = 700): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start: number | undefined;
    const tick = (t: number) => {
      if (start === undefined) start = t;
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // guarantee final value if rAF is throttled (e.g. background tab)
    const settle = window.setTimeout(() => setV(target), dur + 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [target, dur]);
  return v;
}

/** Donut ring for the conformance summary. */
export function Ring({
  pct,
  size = 132,
  stroke = 13,
  color = 'var(--accent)',
  track = 'var(--surface-2)',
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const animPct = useCountUp(pct, 900);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - animPct / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/** Indeterminate spinner. */
export function Spinner() {
  return (
    <svg
      className="spinner"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      style={{ animation: 'spin 0.7s linear infinite' }}
    >
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Conformance status badge. */
export function StatusBadge({ status, full }: { status: ConformanceLevel; full?: boolean }) {
  const m = STATUS_META[status] ?? STATUS_META['Not Applicable'];
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {full ? status : m.short}
    </span>
  );
}

/** Footer navigation shared by screens. */
export function NavBar({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextIcon,
  disabled,
  back = true,
  children,
}: {
  onBack?: () => void;
  onNext?: (() => void) | null;
  nextLabel?: string;
  nextIcon?: (p: IconProps) => ReactNode;
  disabled?: boolean;
  back?: boolean;
  children?: ReactNode;
}) {
  const NextIcon = nextIcon ?? Icons.arrowR;
  return (
    <div className="row between" style={{ marginTop: 28, gap: 12, flexWrap: 'wrap' }}>
      <div>
        {back && (
          <button className="btn btn-quiet" onClick={onBack}>
            <Icons.arrowL size={16} className="ic" />
            Back
          </button>
        )}
      </div>
      <div className="row" style={{ gap: 10 }}>
        {children}
        {onNext && (
          <button className="btn btn-primary" onClick={onNext} disabled={disabled}>
            {nextLabel}
            {NextIcon({ size: 16, className: 'ic' })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Count-up stat for the examination header. */
export function Stat({ n, label, tone }: { n: number; label: string; tone?: 'warn' | 'accent' }) {
  const v = Math.round(useCountUp(n, 500));
  const c = tone === 'warn' ? 'var(--warn)' : tone === 'accent' ? 'var(--accent)' : 'var(--text)';
  return (
    <div className="col" style={{ alignItems: 'center' }}>
      <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: c, lineHeight: 1 }}>
        {v}
      </div>
      <div className="micro faint" style={{ marginTop: 5 }}>
        {label}
      </div>
    </div>
  );
}
