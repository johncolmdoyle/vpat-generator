import type { CrossReference, Criterion, Finding, ReportEdition, ReportKind } from './types.js';

/**
 * Short/long labels for the INT edition's three sub-reports.
 */
export const REPORT_META: Record<ReportKind, { short: string; full: string }> = {
  wcag: { short: 'WCAG 2.2', full: 'WCAG 2.2 Report' },
  '508': { short: 'Section 508', full: 'Revised Section 508 Report' },
  en: { short: 'EN 301 549', full: 'EN 301 549 Report' },
};

export function crossReferenceForEdition(edition: ReportEdition, id: string): CrossReference {
  const full = wcagAlsoApplies(id);
  switch (edition) {
    case 'WCAG':
      return { en: [], s508: [] };
    case '508':
      return { en: [], s508: full.s508 };
    case 'EU':
      return { en: full.en, s508: [] };
    case 'INT':
    default:
      return full;
  }
}

export const PRINCIPLES = ['Perceivable', 'Operable', 'Understandable', 'Robust'] as const;

/**
 * The INT edition records each WCAG criterion once and cross-references it from
 * EN 301 549 and Revised Section 508. Compute the representative mapping for a
 * WCAG success-criterion id.
 *
 * NOTE: in production this becomes a static, per-criterion lookup table (BACKEND.md
 * §2 — "the cross-references are deterministic, not LLM-generated"). The prototype's
 * representative form is kept here for the mock flow.
 */
export function wcagAlsoApplies(id: string): CrossReference {
  return {
    en: [`9.${id} (Web)`, `10.${id} (Non-web doc)`, `11.${id}.1 (Software)`, '12.1.2 / 12.2.4 (Docs)'],
    s508: ['501.1 (Web / Software)', '504.2 (Authoring Tool)', '602.3 (Support Docs)'],
  };
}

/**
 * Build the per-session review state from the static criteria, preserving the
 * original AI draft (`ai*`) for the compliance audit trail.
 */
export function toFinding(c: Criterion): Finding {
  return {
    ...c,
    approved: false,
    edited: false,
    aiStatus: c.status,
    aiRemarks: c.remarks,
    aiConfidence: c.confidence,
  };
}
