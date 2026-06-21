/* Minimal geometric stroke icons, ported from the prototype's vpat-ui.jsx. */
import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** stroke width */
  sw?: number;
  /** viewBox size */
  vb?: number;
  children?: ReactNode;
  d?: string;
}

export function Icon({ d, size = 18, sw = 1.7, vb = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children ?? <path d={d} />}
    </svg>
  );
}

type Glyph = (p: IconProps) => ReactNode;

export const Icons: Record<string, Glyph> = {
  globe: (p) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </Icon>
  ),
  lock: (p) => (
    <Icon {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </Icon>
  ),
  scan: (p) => (
    <Icon {...p}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M4 12h16" />
    </Icon>
  ),
  sparkle: (p) => (
    <Icon {...p}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </Icon>
  ),
  check: (p) => (
    <Icon {...p}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Icon>
  ),
  checkCircle: (p) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.6 2.6L16 9" />
    </Icon>
  ),
  doc: (p) => (
    <Icon {...p}>
      <path d="M7 3h7l5 5v13H7V3Z" />
      <path d="M14 3v5h5" />
    </Icon>
  ),
  download: (p) => (
    <Icon {...p}>
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
    </Icon>
  ),
  arrowR: (p) => (
    <Icon {...p}>
      <path d="M5 12h13m0 0l-5-5m5 5l-5 5" />
    </Icon>
  ),
  arrowL: (p) => (
    <Icon {...p}>
      <path d="M19 12H6m0 0l5-5m-5 5l5 5" />
    </Icon>
  ),
  edit: (p) => (
    <Icon {...p}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 6.5l3 3" />
    </Icon>
  ),
  alert: (p) => (
    <Icon {...p}>
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r="0.4" fill="currentColor" stroke="none" />
      <path d="M10.3 4.3 2.8 17.3A2 2 0 0 0 4.5 20.3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    </Icon>
  ),
  eye: (p) => (
    <Icon {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  code: (p) => (
    <Icon {...p}>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </Icon>
  ),
  page: (p) => (
    <Icon {...p}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </Icon>
  ),
  clock: (p) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  ),
  shield: (p) => (
    <Icon {...p}>
      <path d="M12 3l7 2.5v5.5c0 4.6-3 8.2-7 9.5-4-1.3-7-4.9-7-9.5V5.5L12 3Z" />
    </Icon>
  ),
  filter: (p) => (
    <Icon {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Icon>
  ),
  x: (p) => (
    <Icon {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  ),
};
