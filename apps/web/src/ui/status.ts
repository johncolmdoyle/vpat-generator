/* Conformance → badge style. UI-layer mapping onto the design tokens. */
import type { ConformanceLevel } from '@vpat/shared';

type BadgeClass = 'b-ok' | 'b-warn' | 'b-bad' | 'b-na';

export const STATUS_META: Record<ConformanceLevel, { cls: BadgeClass; short: string }> = {
  Supports: { cls: 'b-ok', short: 'Supports' },
  'Partially Supports': { cls: 'b-warn', short: 'Partial' },
  'Does Not Support': { cls: 'b-bad', short: 'Does Not' },
  'Not Applicable': { cls: 'b-na', short: 'N/A' },
  'Not Evaluated': { cls: 'b-na', short: 'Not Eval' },
};

const CLS_COLOR: Record<BadgeClass, string> = {
  'b-ok': 'var(--ok)',
  'b-warn': 'var(--warn)',
  'b-bad': 'var(--bad)',
  'b-na': 'var(--na)',
};

export function statusColor(status: ConformanceLevel): string {
  return CLS_COLOR[(STATUS_META[status] ?? STATUS_META['Not Applicable']).cls];
}

/** Ordered list of selectable conformance levels. */
export const STATUS_ORDER = Object.keys(STATUS_META) as ConformanceLevel[];
