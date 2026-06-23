/**
 * DOCX / PDF / JSON (.vpat) generators for the assembled ACR, laid out to the official
 * VPAT® 2.5Rev International Edition template (BACKEND.md §5):
 *  - product/report information block,
 *  - applicable standards/guidelines + conformance terms,
 *  - the three reports as Criteria | Conformance Level | Remarks tables (with the
 *    cross-referenced 508/EN rows), and
 *  - an evaluator attestation.
 *
 * Every export is explicitly marked DRAFT — the named evaluator/responsible party must
 * review and approve before it is published.
 */
import {
  Footer,
  Header,
  ImageRun,
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  TextRun,
  VerticalAlignTable,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} from 'docx';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import {
  EDITION_META,
  TERMS,
  TEST_PROCEDURE,
  VERSION,
  DEFAULT_EVALUATION_METHODS,
  DRAFT_DISCLAIMER,
  REPORT_META,
  crossReferenceForEdition,
  reportsForEdition,
  type AutoRow,
  type ExportFormat,
  type Finding,
  type ReportDef,
  type ReportEdition,
  type ReportDetail,
  type ReportRecord,
  type WcagTarget,
} from '@vpat/shared';

export interface ExportArtifact {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

type ExportVariant = 'draft' | 'approved';
const ACCESSOPS_LOGO = fileURLToPath(new URL('../assets/accessops-logo.png', import.meta.url));
const ACCESSOPS_LOGO_BUFFER = readFileSync(ACCESSOPS_LOGO);

/* ---------- shared helpers ---------- */

function slug(domain: string): string {
  return domain.replace(/\..*/, '').replace(/[^a-z0-9-]/gi, '') || 'report';
}
function longDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function isoToLong(s: string | null): string {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : longDate(d);
}
function dateStamp(): string {
  return longDate().replace(/\s|,/g, '');
}
function filename(detail: ReportDetail, ext: string, variant: ExportVariant): string {
  const suffix = variant === 'draft' ? '-DRAFT' : '';
  return `VPAT2.5Rev-${detail.report.edition}-${slug(detail.report.domain)}-${dateStamp()}${suffix}.${ext}`;
}

function val(s: string | null | undefined, fallback: string): string {
  return s && s.trim() ? s : fallback;
}

/** Official VPAT product/report information rows. */
function productInfo(r: ReportRecord): [string, string][] {
  const period =
    r.evaluationStart || r.evaluationEnd ? `${isoToLong(r.evaluationStart)} – ${isoToLong(r.evaluationEnd)}` : '—';
  const evaluator = [r.evaluatorName, r.evaluatorOrg].filter(Boolean).join(', ') || '—';
  return [
    ['Name of Product / Version', `${val(r.productName, r.domain)}${r.productVersion ? ` — ${r.productVersion}` : ''}`],
    ['Report Date', longDate()],
    ['Vendor / Author Company', val(r.vendorName, '—')],
    ['Product Description', val(r.productDescription, `Web application at ${r.domain}.`)],
    ['Contact Information', val(r.contactEmail, `accessibility@${r.domain}`)],
    ['Evaluation Methods Used', val(r.evaluationMethods, DEFAULT_EVALUATION_METHODS)],
    ['Assistive Technologies Used', r.assistiveTech.length ? r.assistiveTech.join('; ') : '—'],
    ['Test Environment', r.testEnvironments.length ? r.testEnvironments.join('; ') : '—'],
    ['Evaluation Period', period],
    ['Evaluator', evaluator],
    ['Notes', val(r.notes, 'Draft ACR — confirm findings before publication.')],
  ];
}

/** Applicable Standards / Guidelines rows: [standard, included-for]. */
function standardsRows(edition: ReportEdition, target: WcagTarget): [string, string][] {
  const rank = { A: 1, AA: 2, AAA: 3 }[target];
  const levels = ['Level A', rank >= 2 ? 'Level AA' : '', rank >= 3 ? 'Level AAA' : ''].filter(Boolean).join(', ');
  switch (edition) {
    case 'WCAG':
      return [
        ['WCAG 2.0', levels],
        ['WCAG 2.1', levels],
        ['WCAG 2.2', levels],
      ];
    case '508':
      return [
        ['WCAG 2.0', ['Level A', rank >= 2 ? 'Level AA' : ''].filter(Boolean).join(', ')],
        ['Revised Section 508 (2017)', 'Included'],
      ];
    case 'EU':
      return [
        ['WCAG 2.1', ['Level A', rank >= 2 ? 'Level AA' : ''].filter(Boolean).join(', ')],
        ['EN 301 549 (V3.1.1 / V3.2.1)', 'Included'],
      ];
    case 'INT':
    default:
      return [
        ['WCAG 2.0', levels],
        ['WCAG 2.1', levels],
        ['WCAG 2.2', levels],
        ['Revised Section 508 (2017)', 'Included'],
        ['EN 301 549 (V3.1.1 / V3.2.1)', 'Included'],
      ];
  }
}

const ATTEST_HEADING = 'Evaluator Attestation';
function attestationText(r: ReportRecord, variant: ExportVariant): string {
  const who = [r.evaluatorName, r.evaluatorOrg].filter(Boolean).join(', ') || 'the named evaluator';
  const at = r.assistiveTech.length ? r.assistiveTech.join(', ') : 'the assistive technologies listed above';
  const env = r.testEnvironments.length ? r.testEnvironments.join('; ') : 'the environments listed above';
  const period =
    r.evaluationStart || r.evaluationEnd ? ` between ${isoToLong(r.evaluationStart)} and ${isoToLong(r.evaluationEnd)}` : '';
  const base =
    `This report was prepared by ${who}${period}. Conformance was evaluated using automated tooling together with ` +
    `manual review and assistive-technology testing with ${at}, in ${env}. `;
  if (variant === 'draft') {
    return (
      base +
      `This document is issued as a DRAFT: the responsible party must review and approve every finding before the report ` +
      `is published or relied upon for procurement.`
    );
  }
  return `${base}The responsible party has completed final approval for publication and procurement review.`;
}

/* ---------- JSON (.vpat) ---------- */

function buildVpat(detail: ReportDetail, variant: ExportVariant): ExportArtifact {
  const payload = {
    version: VERSION,
    edition: EDITION_META[detail.report.edition].fullLabel,
    status: variant,
    disclaimer: variant === 'draft' ? DRAFT_DISCLAIMER : null,
    generatedAt: new Date().toISOString(),
    report: detail.report,
    attestation: {
      evaluator: detail.report.evaluatorName,
      organization: detail.report.evaluatorOrg,
      evaluationStart: detail.report.evaluationStart,
      evaluationEnd: detail.report.evaluationEnd,
      assistiveTech: detail.report.assistiveTech,
      testEnvironments: detail.report.testEnvironments,
    },
    findings: detail.findings,
    crossReferenced: detail.auto,
  };
  return {
    buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    contentType: 'application/json',
    filename: filename(detail, 'vpat', variant),
  };
}

/* ---------- DOCX ---------- */

const DOCX_THEME = {
  accent: '4F56D3',
  accentSoft: 'EEF0FF',
  accentPanel: 'E5E8FF',
  text: '21253A',
  muted: '667085',
  border: 'D8DDEA',
  surface: 'FFFFFF',
  surfaceAlt: 'F7F8FC',
  draft: 'B3261E',
  draftSoft: 'FCEDEA',
  ok: '15824B',
  okSoft: 'E8F5EC',
  warn: '9A6700',
  warnSoft: 'FBF0D9',
  bad: 'B3261E',
  badSoft: 'FBE7E6',
  na: '5B6470',
  naSoft: 'ECEEF1',
} as const;

const DOCX_PAGE = {
  width: 12240,
  height: 15840,
  margin: 1440,
  headerFooter: 710,
  contentWidth: 9360,
} as const;

const DOCX_TABLE_MARGINS = { top: 96, bottom: 96, left: 120, right: 120 };
const DOCX_LINE = { top: { style: BorderStyle.SINGLE, size: 1, color: DOCX_THEME.border } } as const;
const DOCX_BORDER = (color: string = DOCX_THEME.border, size = 1) => ({ style: BorderStyle.SINGLE, size, color });
const DOCX_NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const DOCX_GRID_BORDERS = {
  top: DOCX_BORDER(),
  bottom: DOCX_BORDER(),
  left: DOCX_BORDER(),
  right: DOCX_BORDER(),
  insideHorizontal: DOCX_BORDER('E7EAF2'),
  insideVertical: DOCX_BORDER('E7EAF2'),
} as const;
const DOCX_CARD_BORDERS = {
  top: DOCX_BORDER(),
  bottom: DOCX_BORDER(),
  left: DOCX_BORDER(),
  right: DOCX_BORDER(),
  insideHorizontal: DOCX_NO_BORDER,
  insideVertical: DOCX_NO_BORDER,
} as const;
const DOCX_HERO_BORDERS = {
  top: DOCX_NO_BORDER,
  bottom: DOCX_NO_BORDER,
  left: DOCX_NO_BORDER,
  right: DOCX_NO_BORDER,
  insideHorizontal: DOCX_NO_BORDER,
  insideVertical: DOCX_NO_BORDER,
} as const;

function docxText(text: string, opts: Record<string, unknown> = {}): TextRun {
  return new TextRun({ text, ...opts });
}

function docxParagraph(
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    italics?: boolean;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    spacing?: { before?: number; after?: number; line?: number };
    border?: { top?: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string } };
    pageBreakBefore?: boolean;
    bullet?: { level: number };
  } = {},
): Paragraph {
  return new Paragraph({
    heading: opts.heading,
    alignment: opts.alignment,
    spacing: opts.spacing,
    border: opts.border,
    pageBreakBefore: opts.pageBreakBefore,
    bullet: opts.bullet,
    children: [
      docxText(text, {
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color,
        size: opts.size,
        font: 'Aptos',
      }),
    ],
  });
}

function docxMultilineParagraphs(
  text: string,
  opts: { size?: number; bold?: boolean; color?: string; spacingAfter?: number; italics?: boolean } = {},
): Paragraph[] {
  return text.split('\n').map(
    (line, index) =>
      new Paragraph({
        spacing: { after: index === text.split('\n').length - 1 ? opts.spacingAfter ?? 0 : 30 },
        children: [
          docxText(line, {
            bold: opts.bold,
            italics: opts.italics,
            color: opts.color ?? DOCX_THEME.text,
            size: opts.size ?? 20,
            font: 'Aptos',
          }),
        ],
      }),
  );
}

function docxCell(
  children: Paragraph[],
  opts: {
    width?: number;
    shade?: string;
    verticalAlign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable];
    borders?: Record<string, unknown>;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
    columnSpan?: number;
  } = {},
): TableCell {
  return new TableCell({
    children,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shade } : undefined,
    verticalAlign: opts.verticalAlign,
    borders: opts.borders,
    margins: opts.margins ?? DOCX_TABLE_MARGINS,
    columnSpan: opts.columnSpan,
  });
}

function kvTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: DOCX_PAGE.contentWidth, type: WidthType.DXA },
    indent: { size: 0, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [2600, 6760],
    borders: DOCX_GRID_BORDERS,
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          cantSplit: true,
          children: [
            docxCell(
              [docxParagraph(label, { size: 18, bold: true, color: DOCX_THEME.muted, spacing: { after: 0 } })],
              { width: 2600, shade: DOCX_THEME.surfaceAlt, verticalAlign: VerticalAlignTable.CENTER },
            ),
            docxCell(docxMultilineParagraphs(value, { size: 19, spacingAfter: 0 }), {
              width: 6760,
              verticalAlign: VerticalAlignTable.CENTER,
            }),
          ],
        }),
    ),
  });
}

function docxSimpleTable(
  headers: [string, number][],
  rows: string[][],
  opts: { headerFill?: string; headerText?: string } = {},
): Table {
  return new Table({
    width: { size: DOCX_PAGE.contentWidth, type: WidthType.DXA },
    indent: { size: 0, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: headers.map(([, width]) => width),
    borders: DOCX_GRID_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map(([label, width]) =>
          docxCell(
            [docxParagraph(label, { size: 18, bold: true, color: opts.headerText ?? DOCX_THEME.accent, spacing: { after: 0 } })],
            {
              width,
              shade: opts.headerFill ?? DOCX_THEME.accentSoft,
              verticalAlign: VerticalAlignTable.CENTER,
            },
          ),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: row.map((value, index) =>
              docxCell(docxMultilineParagraphs(value, { size: 18, spacingAfter: 0 }), {
                width: headers[index]?.[1],
                verticalAlign: VerticalAlignTable.CENTER,
              }),
            ),
          }),
      ),
    ],
  });
}

function conformanceTable(rows: { id: string; level: string; remarks: string }[]): Table {
  return docxSimpleTable(
    [
      ['Criteria', 2400],
      ['Conformance Level', 1800],
      ['Remarks and Explanations', 5160],
    ],
    rows.map((row) => [row.id, row.level, row.remarks]),
  );
}

function statusFill(status: string): { fill: string; text: string } {
  switch (status) {
    case 'Supports':
      return { fill: DOCX_THEME.okSoft, text: DOCX_THEME.ok };
    case 'Partially Supports':
      return { fill: DOCX_THEME.warnSoft, text: DOCX_THEME.warn };
    case 'Does Not Support':
      return { fill: DOCX_THEME.badSoft, text: DOCX_THEME.bad };
    default:
      return { fill: DOCX_THEME.naSoft, text: DOCX_THEME.na };
  }
}

function wcagRemark(edition: ReportEdition, f: Finding): string {
  if (f.report !== 'wcag' || f.obsolete) return f.remarks;
  const x = crossReferenceForEdition(edition, f.id);
  if (!x.en.length && !x.s508.length) return f.remarks;
  const refs = [
    x.en.length ? `EN 301 549 ${x.en.join(', ')}` : '',
    x.s508.length ? `Section 508 ${x.s508.join(', ')}` : '',
  ].filter(Boolean);
  return refs.length ? `${f.remarks}\nAlso documents: ${refs.join('; ')}.` : f.remarks;
}

function criterionLabel(f: Finding): string {
  return `${f.id} ${f.name}${f.level ? ` (Level ${f.level})` : ''}`;
}
function autoLabel(a: AutoRow): string {
  return `${a.id} ${a.name}`;
}

function reportNoteForEdition(edition: ReportEdition, rep: ReportDef): string {
  if (rep.id === 'wcag') {
    if (edition === 'WCAG') return 'This edition focuses on the WCAG conformance tables only.';
    if (edition === '508') return 'Tables 1 & 2 also document Revised Section 508 provisions that incorporate WCAG 2.0.';
    if (edition === 'EU') return 'Tables 1 & 2 also document EN 301 549 provisions that incorporate WCAG 2.1.';
  }
  return rep.note;
}

function coverHeroTable(report: ReportRecord, variant: ExportVariant): Table {
  const productTitle = val(report.productName, report.domain);
  const summary =
    variant === 'draft'
      ? 'Draft accessibility conformance report prepared for evaluator review, procurement preparation, and approval.'
      : 'Approved accessibility conformance report prepared for procurement, legal review, and customer distribution.';

  return new Table({
    width: { size: DOCX_PAGE.contentWidth, type: WidthType.DXA },
    indent: { size: 0, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [6120, 3240],
    borders: DOCX_HERO_BORDERS,
    rows: [
      new TableRow({
        children: [
          docxCell(
            [
              new Paragraph({
                spacing: { after: 140 },
                children: [
                  new ImageRun({
                    type: 'png',
                    data: ACCESSOPS_LOGO_BUFFER,
                    transformation: { width: 42, height: 42 },
                  }),
                ],
              }),
              docxParagraph('AccessOps', { size: 30, bold: true, color: 'FFFFFF', spacing: { after: 40 } }),
              docxParagraph('VPAT Builder · International Edition', {
                size: 19,
                color: 'DEE3FF',
                spacing: { after: 220 },
              }),
              docxParagraph(productTitle, { size: 34, bold: true, color: 'FFFFFF', spacing: { after: 120 } }),
              docxParagraph(summary, { size: 20, color: 'E7EBFF', spacing: { after: 0 } }),
            ],
            {
              width: 6120,
              shade: DOCX_THEME.accent,
              borders: DOCX_HERO_BORDERS,
              margins: { top: 260, bottom: 260, left: 260, right: 260 },
              verticalAlign: VerticalAlignTable.CENTER,
            },
          ),
          docxCell(
            [
              docxParagraph('EDITION', { size: 15, bold: true, color: DOCX_THEME.accent, spacing: { after: 30 } }),
              docxParagraph(EDITION_META[report.edition].fullLabel, {
                size: 20,
                bold: true,
                color: DOCX_THEME.text,
                spacing: { after: 140 },
              }),
              docxParagraph('WCAG TARGET', { size: 15, bold: true, color: DOCX_THEME.accent, spacing: { after: 30 } }),
              docxParagraph(`Level ${report.wcagTarget}`, {
                size: 20,
                bold: true,
                color: DOCX_THEME.text,
                spacing: { after: 140 },
              }),
              docxParagraph('VENDOR', { size: 15, bold: true, color: DOCX_THEME.accent, spacing: { after: 30 } }),
              docxParagraph(val(report.vendorName, 'Not provided'), {
                size: 19,
                color: DOCX_THEME.text,
                spacing: { after: 140 },
              }),
              docxParagraph('CONTACT', { size: 15, bold: true, color: DOCX_THEME.accent, spacing: { after: 30 } }),
              docxParagraph(val(report.contactEmail, `accessibility@${report.domain}`), {
                size: 19,
                color: DOCX_THEME.text,
                spacing: { after: 0 },
              }),
            ],
            {
              width: 3240,
              shade: DOCX_THEME.accentPanel,
              borders: DOCX_HERO_BORDERS,
              margins: { top: 260, bottom: 260, left: 240, right: 240 },
              verticalAlign: VerticalAlignTable.CENTER,
            },
          ),
        ],
      }),
    ],
  });
}

function calloutTable(tone: 'draft' | 'info', title: string, body: string): Table {
  const fill = tone === 'draft' ? DOCX_THEME.draftSoft : DOCX_THEME.accentSoft;
  const titleColor = tone === 'draft' ? DOCX_THEME.draft : DOCX_THEME.accent;
  return new Table({
    width: { size: DOCX_PAGE.contentWidth, type: WidthType.DXA },
    indent: { size: 0, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [DOCX_PAGE.contentWidth],
    borders: DOCX_CARD_BORDERS,
    rows: [
      new TableRow({
        children: [
          docxCell(
            [
              docxParagraph(title, { size: 20, bold: true, color: titleColor, spacing: { after: 80 } }),
              docxParagraph(body, { size: 18, color: DOCX_THEME.text, spacing: { after: 0 } }),
            ],
            {
              width: DOCX_PAGE.contentWidth,
              shade: fill,
              borders: DOCX_CARD_BORDERS,
              margins: { top: 160, bottom: 160, left: 180, right: 180 },
            },
          ),
        ],
      }),
    ],
  });
}

function overviewCards(report: ReportRecord, variant: ExportVariant): Table {
  const reviewedBy = [report.evaluatorName, report.evaluatorOrg].filter(Boolean).join(', ') || 'Not provided';
  const approval = variant === 'approved' && report.finalizedAt ? `${report.finalizedByEmail ?? 'Approver'} on ${new Date(report.finalizedAt).toLocaleString('en-US')}` : 'Pending final approval';
  const rows: [string, string][] = [
    ['Report status', variant === 'draft' ? 'Draft — evaluator review required' : 'Approved for publication'],
    ['Evaluation period', report.evaluationStart || report.evaluationEnd ? `${isoToLong(report.evaluationStart)} – ${isoToLong(report.evaluationEnd)}` : '—'],
    ['Evaluator', reviewedBy],
    ['Final approval', approval],
  ];
  return docxSimpleTable(
    [
      ['Field', 2500],
      ['Detail', 6860],
    ],
    rows,
    { headerFill: DOCX_THEME.surfaceAlt, headerText: DOCX_THEME.muted },
  );
}

function buildDocxHeaderFooter(report: ReportRecord): { header: Header; footer: Footer } {
  return {
    header: new Header({
      children: [
        new Paragraph({
          border: DOCX_LINE,
          spacing: { after: 120 },
          children: [
            docxText('AccessOps VPAT Builder', { bold: true, color: DOCX_THEME.text, size: 18, font: 'Aptos' }),
            docxText(`  •  ${val(report.productName, report.domain)}`, { color: DOCX_THEME.muted, size: 18, font: 'Aptos' }),
          ],
        }),
      ],
    }),
    footer: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 120 },
          children: [
            new TextRun({
              color: DOCX_THEME.muted,
              size: 18,
              font: 'Aptos',
              children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
            }),
          ],
        }),
      ],
    }),
  };
}

async function buildDocx(detail: ReportDetail, variant: ExportVariant): Promise<ExportArtifact> {
  const r = detail.report;
  const { header, footer } = buildDocxHeaderFooter(r);
  const children: (Paragraph | Table)[] = [
    coverHeroTable(r, variant),
    docxParagraph('', { spacing: { after: 120 } }),
    calloutTable(
      variant === 'draft' ? 'draft' : 'info',
      variant === 'draft' ? 'Draft report — human approval required' : 'Approved report',
      variant === 'draft'
        ? DRAFT_DISCLAIMER
        : 'The responsible party has completed final approval. Formal exports can be shared without draft labeling.',
    ),
    docxParagraph('', { spacing: { after: 80 } }),
    overviewCards(r, variant),
    new Paragraph({ children: [new PageBreak()] }),
    docxParagraph('Accessibility Conformance Report', {
      size: 30,
      bold: true,
      color: DOCX_THEME.text,
      spacing: { after: 40 },
    }),
    docxParagraph(`Based on ${VERSION} — ${EDITION_META[r.edition].fullLabel}`, {
      size: 18,
      italics: true,
      color: DOCX_THEME.muted,
      spacing: { after: 180 },
    }),
    docxParagraph('Report Information', {
      heading: HeadingLevel.HEADING_1,
      size: 26,
      bold: true,
      color: DOCX_THEME.accent,
      spacing: { before: 0, after: 120 },
    }),
    kvTable(productInfo(r)),
    docxParagraph('Applicable Standards / Guidelines', {
      heading: HeadingLevel.HEADING_1,
      size: 26,
      bold: true,
      color: DOCX_THEME.accent,
      spacing: { before: 220, after: 120 },
    }),
    docxSimpleTable(
      [
        ['Standard / Guideline', 4680],
        ['Included For', 4680],
      ],
      standardsRows(r.edition, r.wcagTarget),
    ),
    docxParagraph('Terms', {
      heading: HeadingLevel.HEADING_1,
      size: 26,
      bold: true,
      color: DOCX_THEME.accent,
      spacing: { before: 220, after: 120 },
    }),
    docxSimpleTable(
      [
        ['Term', 2200],
        ['Definition', 7160],
      ],
      TERMS.map((term) => [term.term, term.def]),
    ),
  ];

  for (const [reportIndex, rep] of reportsForEdition(r.edition).entries()) {
    children.push(
      docxParagraph(rep.name, {
        heading: HeadingLevel.HEADING_1,
        size: 28,
        bold: true,
        color: DOCX_THEME.text,
        spacing: { before: reportIndex === 0 ? 260 : 340, after: 50 },
        pageBreakBefore: reportIndex > 0,
      }),
    );
    children.push(
      docxParagraph(reportNoteForEdition(r.edition, rep), {
        size: 18,
        italics: true,
        color: DOCX_THEME.muted,
        spacing: { after: 140 },
      }),
    );
    for (const sec of rep.sections) {
      const findings = detail.findings.filter((f) => f.report === rep.id && f.section === sec.id);
      const autos = detail.auto.filter((a) => a.report === rep.id && a.section === sec.id);
      if (!findings.length && !autos.length) continue;

      children.push(
        docxParagraph(sec.name, {
          heading: HeadingLevel.HEADING_2,
          size: 22,
          bold: true,
          color: DOCX_THEME.accent,
          spacing: { before: 180, after: 100 },
        }),
      );
      const rows = [
        ...findings.map((f) => ({ id: criterionLabel(f), level: f.status, remarks: wcagRemark(r.edition, f) })),
        ...autos.map((a) => ({ id: autoLabel(a), level: a.status, remarks: a.ref })),
      ];
      children.push(conformanceTable(rows));
    }
  }

  children.push(
    docxParagraph(ATTEST_HEADING, {
      heading: HeadingLevel.HEADING_1,
      size: 26,
      bold: true,
      color: DOCX_THEME.accent,
      spacing: { before: 320, after: 100 },
      pageBreakBefore: true,
    }),
  );
  children.push(docxParagraph(attestationText(r, variant), { size: 19, color: DOCX_THEME.text, spacing: { after: 140 } }));

  if (detail.pages.length) {
    children.push(
      docxParagraph('Pages included in the manual review scope', {
        heading: HeadingLevel.HEADING_2,
        size: 22,
        bold: true,
        color: DOCX_THEME.accent,
        spacing: { before: 180, after: 90 },
      }),
    );
    children.push(
      docxSimpleTable(
        [
          ['Title', 2800],
          ['URL', 6560],
        ],
        detail.pages.map((page) => [page.title || '(Untitled page)', page.url]),
      ),
    );
  }

  children.push(
    docxParagraph('Appendix A — Manual Test Plan', {
      heading: HeadingLevel.HEADING_1,
      size: 26,
      bold: true,
      color: DOCX_THEME.accent,
      spacing: { before: 320, after: 100 },
      pageBreakBefore: true,
    }),
  );
  children.push(
    docxParagraph(
      'Automated tooling covers only part of WCAG. The steps below back the evaluator attestation and support human review of the generated draft.',
      { size: 18, italics: true, color: DOCX_THEME.muted, spacing: { after: 140 } },
    ),
  );
  for (const area of TEST_PROCEDURE) {
    children.push(
      docxParagraph(area.title, {
        heading: HeadingLevel.HEADING_2,
        size: 22,
        bold: true,
        color: DOCX_THEME.text,
        spacing: { before: 140, after: 70 },
      }),
    );
    for (const step of area.steps) {
      children.push(
        docxParagraph(step, {
          size: 18,
          color: DOCX_THEME.text,
          spacing: { after: 50 },
          bullet: { level: 0 },
        }),
      );
    }
    children.push(
      docxParagraph(`Covers: ${area.criteria.join(', ')}`, {
        size: 17,
        italics: true,
        color: DOCX_THEME.muted,
        spacing: { after: 110 },
      }),
    );
  }

  const doc = new Document({
    creator: 'AccessOps',
    title: `Accessibility Conformance Report — ${val(r.productName, r.domain)}`,
    description: `${variant === 'draft' ? 'Draft' : 'Approved'} VPAT export for ${val(r.productName, r.domain)}`,
    sections: [
      {
        headers: { default: header },
        footers: { default: footer },
        properties: {
          page: {
            size: { width: DOCX_PAGE.width, height: DOCX_PAGE.height },
            margin: {
              top: DOCX_PAGE.margin,
              right: DOCX_PAGE.margin,
              bottom: DOCX_PAGE.margin,
              left: DOCX_PAGE.margin,
              header: DOCX_PAGE.headerFooter,
              footer: DOCX_PAGE.headerFooter,
            },
          },
        },
        children,
      },
    ],
    features: {
      updateFields: true,
    },
  });
  const buffer = await Packer.toBuffer(doc);
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: filename(detail, 'docx', variant),
  };
}

async function buildXlsx(detail: ReportDetail, variant: ExportVariant): Promise<ExportArtifact> {
  const workbook = new ExcelJS.Workbook();
  const report = detail.report;
  workbook.creator = 'AccessOps';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `VPAT review workbook — ${val(report.productName, report.domain)}`;
  workbook.subject = `${variant === 'draft' ? 'Draft' : 'Approved'} internal review workbook`;

  const findingsRangeStart = 2;
  const findingsRangeEnd = Math.max(findingsRangeStart, detail.findings.length + 1);
  const statusCol = 'F';
  const approvedCol = 'H';

  const overview = workbook.addWorksheet('Overview', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
  });
  overview.columns = [
    { key: 'a', width: 28 },
    { key: 'b', width: 46 },
    { key: 'c', width: 20 },
    { key: 'd', width: 20 },
  ];
  overview.mergeCells('A1:D1');
  overview.getCell('A1').value = 'AccessOps VPAT Review Workbook';
  overview.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: `FF${DOCX_THEME.surface}` } };
  overview.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.accent}` } };
  overview.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  overview.getRow(1).height = 26;
  overview.getCell('A2').value =
    variant === 'draft'
      ? 'Formal deliverables remain PDF and Word. This workbook is for internal audit, review, evidence triage, and approval prep.'
      : 'Formal deliverables remain PDF and Word. This workbook captures the approved report data in a filterable internal-review format.';
  overview.mergeCells('A2:D2');
  overview.getCell('A2').font = { name: 'Aptos', size: 11, color: { argb: `FF${DOCX_THEME.text}` } };
  overview.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.accentSoft}` } };
  overview.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  overview.getRow(2).height = 36;

  const overviewInfo: [string, string][] = [
    ['Product / Version', `${val(report.productName, report.domain)}${report.productVersion ? ` — ${report.productVersion}` : ''}`],
    ['Edition', EDITION_META[report.edition].fullLabel],
    ['WCAG target', `Level ${report.wcagTarget}`],
    ['Vendor', val(report.vendorName, 'Not provided')],
    ['Evaluator', [report.evaluatorName, report.evaluatorOrg].filter(Boolean).join(', ') || 'Not provided'],
    ['Status', variant === 'draft' ? 'Draft — approval still required' : 'Approved'],
    ['Finalized at', report.finalizedAt ? new Date(report.finalizedAt).toLocaleString('en-US') : 'Pending final approval'],
    ['Finalized by', report.finalizedByEmail ?? 'Pending final approval'],
  ];
  let infoRow = 4;
  for (const [label, value] of overviewInfo) {
    overview.getCell(`A${infoRow}`).value = label;
    overview.getCell(`B${infoRow}`).value = value;
    overview.getCell(`A${infoRow}`).font = { bold: true, color: { argb: `FF${DOCX_THEME.muted}` } };
    overview.getCell(`A${infoRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.surfaceAlt}` } };
    overview.getCell(`B${infoRow}`).alignment = { wrapText: true, vertical: 'top' };
    infoRow += 1;
  }

  overview.getCell('D4').value = 'Finding Summary';
  overview.getCell('D4').font = { bold: true, color: { argb: `FF${DOCX_THEME.accent}` } };
  const summaryRows: [string, string][] = [
    ['Supports', `COUNTIF(Findings!$${statusCol}$${findingsRangeStart}:$${statusCol}$${findingsRangeEnd},"Supports")`],
    ['Partially Supports', `COUNTIF(Findings!$${statusCol}$${findingsRangeStart}:$${statusCol}$${findingsRangeEnd},"Partially Supports")`],
    ['Does Not Support', `COUNTIF(Findings!$${statusCol}$${findingsRangeStart}:$${statusCol}$${findingsRangeEnd},"Does Not Support")`],
    ['Not Applicable', `COUNTIF(Findings!$${statusCol}$${findingsRangeStart}:$${statusCol}$${findingsRangeEnd},"Not Applicable")`],
    ['Approved findings', `COUNTIF(Findings!$${approvedCol}$${findingsRangeStart}:$${approvedCol}$${findingsRangeEnd},"Yes")`],
  ];
  let summaryRow = 5;
  for (const [label, formula] of summaryRows) {
    overview.getCell(`D${summaryRow}`).value = label;
    overview.getCell(`D${summaryRow}`).font = { bold: true, color: { argb: `FF${DOCX_THEME.text}` } };
    overview.getCell(`D${summaryRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.surfaceAlt}` } };
    overview.getCell(`E${summaryRow}`).value = { formula };
    summaryRow += 1;
  }

  for (let row = 4; row < summaryRow; row += 1) {
    ['A', 'B', 'D', 'E'].forEach((col) => {
      overview.getCell(`${col}${row}`).border = {
        top: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        left: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        bottom: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        right: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
      };
    });
  }

  const findingsSheet = workbook.addWorksheet('Findings', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  findingsSheet.columns = [
    { header: 'Report', key: 'report', width: 16 },
    { header: 'Section', key: 'section', width: 24 },
    { header: 'Criterion ID', key: 'criterionId', width: 14 },
    { header: 'Criterion', key: 'criterion', width: 38 },
    { header: 'Level', key: 'level', width: 10 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Approved', key: 'approved', width: 12 },
    { header: 'Edited', key: 'edited', width: 10 },
    { header: 'Automated checks', key: 'autoChecks', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 56 },
    { header: 'Evidence summary', key: 'evidence', width: 52 },
    { header: 'EN 301 549 refs', key: 'enRefs', width: 24 },
    { header: 'Section 508 refs', key: 's508Refs', width: 24 },
  ];
  findingsSheet.autoFilter = {
    from: 'A1',
    to: 'N1',
  };
  detail.findings.forEach((finding) => {
    const refs = crossReferenceForEdition(report.edition, finding.id);
    findingsSheet.addRow({
      report: REPORT_META[finding.report].short,
      section: finding.section,
      criterionId: finding.id,
      criterion: finding.name,
      level: finding.level ? `Level ${finding.level}` : '',
      status: finding.status,
      confidence: finding.confidence,
      approved: finding.approved ? 'Yes' : 'No',
      edited: finding.edited ? 'Yes' : 'No',
      autoChecks: finding.auto,
      remarks: finding.remarks,
      evidence: finding.evidence.map((entry) => `${entry.type === 'issue' ? 'Issue' : 'Pass'}: ${entry.text} (${entry.where})`).join('\n'),
      enRefs: refs.en.join(', '),
      s508Refs: refs.s508.join(', '),
    });
  });
  findingsSheet.getRow(1).font = { bold: true, color: { argb: `FF${DOCX_THEME.accent}` } };
  findingsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.accentSoft}` } };
  findingsSheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  findingsSheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        left: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        bottom: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        right: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
      };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    if (rowNumber > 1) {
      const fill = statusFill(String(row.getCell(6).value ?? ''));
      row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill.fill}` } };
      row.getCell(6).font = { bold: true, color: { argb: `FF${fill.text}` } };
      row.getCell(7).numFmt = '0%';
    }
  });

  const pagesSheet = workbook.addWorksheet('Pages Tested', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  pagesSheet.columns = [
    { header: 'Title', key: 'title', width: 36 },
    { header: 'URL', key: 'url', width: 72 },
    { header: 'Authenticated', key: 'auth', width: 14 },
  ];
  detail.pages.forEach((page) => pagesSheet.addRow({ title: page.title || '(Untitled page)', url: page.url, auth: page.isAuth ? 'Yes' : 'No' }));
  pagesSheet.getRow(1).font = { bold: true, color: { argb: `FF${DOCX_THEME.accent}` } };
  pagesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.accentSoft}` } };

  const planSheet = workbook.addWorksheet('Manual Test Plan', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  planSheet.columns = [
    { header: 'Area', key: 'area', width: 28 },
    { header: 'Step', key: 'step', width: 72 },
    { header: 'Covers', key: 'covers', width: 38 },
  ];
  for (const area of TEST_PROCEDURE) {
    area.steps.forEach((step, index) => {
      planSheet.addRow({
        area: index === 0 ? area.title : '',
        step,
        covers: index === 0 ? area.criteria.join(', ') : '',
      });
    });
  }
  planSheet.getRow(1).font = { bold: true, color: { argb: `FF${DOCX_THEME.accent}` } };
  planSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${DOCX_THEME.accentSoft}` } };
  [pagesSheet, planSheet].forEach((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
          left: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
          bottom: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
          right: { style: 'thin', color: { argb: `FF${DOCX_THEME.border}` } },
        };
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: filename(detail, 'xlsx', variant),
  };
}

/* ---------- PDF ---------- */

type PdfDoc = InstanceType<typeof PDFDocument>;
const PDF_THEME = {
  accent: '#4F56D3',
  accentSoft: '#EEF0FF',
  text: '#21253A',
  muted: '#667085',
  border: '#D8DDEA',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8FC',
  draft: '#C83424',
  draftSoft: '#FCEDEA',
  ok: '#15824B',
  okSoft: '#E8F5EC',
  warn: '#9A6700',
  warnSoft: '#FBF0D9',
  bad: '#B3261E',
  badSoft: '#FBE7E6',
  na: '#5B6470',
  naSoft: '#ECEEF1',
} as const;

function statusTheme(status: string) {
  switch (status) {
    case 'Supports':
      return { fill: PDF_THEME.okSoft, text: PDF_THEME.ok };
    case 'Partially Supports':
      return { fill: PDF_THEME.warnSoft, text: PDF_THEME.warn };
    case 'Does Not Support':
      return { fill: PDF_THEME.badSoft, text: PDF_THEME.bad };
    default:
      return { fill: PDF_THEME.naSoft, text: PDF_THEME.na };
  }
}

function ensureSpace(doc: PdfDoc, height: number): void {
  if (doc.y + height <= doc.page.height - doc.page.margins.bottom - 24) return;
  doc.addPage();
}

function drawPageChrome(doc: PdfDoc, report: ReportRecord): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.save();
  doc.rect(0, 0, doc.page.width, 74).fill(PDF_THEME.surfaceAlt);
  doc
    .moveTo(left, 74)
    .lineTo(right, 74)
    .lineWidth(1)
    .strokeColor(PDF_THEME.border)
    .stroke();
  doc.roundedRect(left, 24, 14, 14, 4).fill(PDF_THEME.accent);
  doc
    .fillColor(PDF_THEME.text)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('AccessOps', left + 22, 21);
  doc
    .fillColor(PDF_THEME.muted)
    .font('Helvetica')
    .fontSize(8.5)
    .text(`VPAT Builder • ${EDITION_META[report.edition].fullLabel}`, left + 22, 38);
  doc
    .fillColor(PDF_THEME.accent)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(val(report.productName, report.domain), left, 52, { width: right - left, align: 'right' });
  doc.restore();
  doc.y = 96;
}

function drawBrandMark(doc: PdfDoc, x: number, y: number, size: number, bg = PDF_THEME.accent): void {
  const tile = size;
  const cx = x + tile / 2;
  const cy = y + tile / 2;
  doc.save();
  doc.roundedRect(x, y, tile, tile, Math.max(6, tile * 0.18)).fill(bg);
  doc
    .lineWidth(Math.max(1.5, tile * 0.075))
    .strokeColor('#FFFFFF')
    .opacity(0.55)
    .circle(cx, cy, tile * 0.34)
    .stroke();
  doc.opacity(1).fillColor('#FFFFFF').circle(cx, y + tile * 0.24, tile * 0.075).fill();
  doc
    .lineWidth(Math.max(2, tile * 0.085))
    .strokeColor('#FFFFFF')
    .moveTo(x + tile * 0.3, y + tile * 0.43)
    .lineTo(x + tile * 0.7, y + tile * 0.43)
    .moveTo(cx, y + tile * 0.32)
    .lineTo(cx, y + tile * 0.62)
    .moveTo(cx, y + tile * 0.62)
    .lineTo(x + tile * 0.38, y + tile * 0.8)
    .moveTo(cx, y + tile * 0.62)
    .lineTo(x + tile * 0.62, y + tile * 0.8)
    .lineCap('round')
    .lineJoin('round')
    .stroke();
  doc.restore();
}

function drawBrandLogo(doc: PdfDoc, x: number, y: number, size: number): void {
  try {
    doc.image(ACCESSOPS_LOGO, x, y, { width: size, height: size });
  } catch {
    drawBrandMark(doc, x, y, size);
  }
}

function drawWatermark(doc: PdfDoc): void {
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fillOpacity(0.045).fillColor(PDF_THEME.text).fontSize(108).font('Helvetica-Bold');
  doc.text('DRAFT', 0, doc.page.height / 2 - 70, { width: doc.page.width, align: 'center' });
  doc.fillOpacity(1);
  doc.restore();
}

function decoratePage(doc: PdfDoc, report: ReportRecord, variant: ExportVariant): void {
  if (variant === 'draft') drawWatermark(doc);
  drawPageChrome(doc, report);
}

function finalizePageNumbers(doc: PdfDoc): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const label = `Page ${i + 1} of ${range.count}`;
    const y = doc.page.height - doc.page.margins.bottom - 12;
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF_THEME.muted)
      .text(label, doc.page.margins.left, y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'right',
        lineBreak: false,
      });
  }
}

function sectionHeading(doc: PdfDoc, eyebrow: string, title: string, body?: string): void {
  ensureSpace(doc, body ? 86 : 54);
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(PDF_THEME.accent)
    .text(eyebrow.toUpperCase(), doc.page.margins.left, doc.y);
  doc.moveDown(0.2);
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(PDF_THEME.text)
    .text(title, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  if (body) {
    doc.moveDown(0.25);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PDF_THEME.muted)
      .text(body, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, lineGap: 2 });
  }
  doc.moveDown(0.7);
}

function infoGrid(doc: PdfDoc, rows: [string, string][]): void {
  const left = doc.page.margins.left;
  const gap = 14;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = (usable - gap) / 2;
  let index = 0;

  while (index < rows.length) {
    const slice = rows.slice(index, index + 2);
    const measured = slice.map(([label, value]) => {
      const labelHeight = doc.heightOfString(label, { width: colWidth - 28 });
      const valueHeight = doc.heightOfString(value, { width: colWidth - 28, lineGap: 1 });
      return Math.max(54, 22 + labelHeight + valueHeight);
    });
    const rowHeight = Math.max(...measured);
    ensureSpace(doc, rowHeight + 8);
    const rowTop = doc.y;
    let x = left;
    slice.forEach(([label, value], cardIndex) => {
      doc.roundedRect(x, rowTop, colWidth, rowHeight, 10).fillAndStroke(PDF_THEME.surface, PDF_THEME.border);
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(PDF_THEME.muted)
        .text(label.toUpperCase(), x + 14, rowTop + 10, { width: colWidth - 28 });
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(PDF_THEME.text)
        .text(value, x + 14, rowTop + 24, { width: colWidth - 28, lineGap: 1 });
      x += colWidth + (cardIndex === 0 ? gap : 0);
    });
    doc.y = rowTop + rowHeight + 8;
    index += 2;
  }
}

function coverHero(doc: PdfDoc, report: ReportRecord, variant: ExportVariant): void {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;
  const height = 232;
  ensureSpace(doc, height + 10);
  const rightPanelWidth = 228;
  const leftWidth = usable - rightPanelWidth - 34;
  doc.save();
  doc.roundedRect(left, y, usable, height, 18).fill(PDF_THEME.accent);
  doc.fillOpacity(0.1).roundedRect(left + usable - rightPanelWidth, y, rightPanelWidth, height, 18).fill('#FFFFFF');
  doc.fillOpacity(1);
  drawBrandLogo(doc, left + 24, y + 24, 54);
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#FFFFFF')
    .text('AccessOps', left + 92, y + 28, { width: leftWidth - 30 });
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor('#DEE3FF')
    .text('VPAT Builder - International Edition', left + 92, y + 54, { width: leftWidth - 30 });
  const productTitle = val(report.productName, report.domain);
  doc.font('Helvetica-Bold').fontSize(20);
  const productTitleHeight = doc.heightOfString(productTitle, { width: leftWidth, lineGap: 2 });
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#FFFFFF')
    .text(productTitle, left + 24, y + 96, { width: leftWidth, lineGap: 2 });
  doc
    .font('Helvetica')
    .fontSize(9.6)
    .fillColor('#E7EBFF')
    .text(
      variant === 'draft'
        ? 'Branded draft report for evaluator review, procurement preparation, and internal accessibility sign-off.'
        : 'Approved accessibility conformance report prepared for procurement, legal review, and customer distribution.',
      left + 24,
      y + 112 + productTitleHeight,
      { width: leftWidth - 8, lineGap: 2 },
    );

  const chipRows: [string, string][] = [
    ['Edition', EDITION_META[report.edition].fullLabel],
    ['WCAG target', `Level ${report.wcagTarget}`],
    ['Vendor', val(report.vendorName, 'Not provided')],
    ['Contact', val(report.contactEmail, `accessibility@${report.domain}`)],
  ];
  const chipX = left + usable - rightPanelWidth + 22;
  const chipWidth = rightPanelWidth - 44;
  let chipY = y + 28;
  for (const [label, value] of chipRows) {
    doc.roundedRect(chipX, chipY, chipWidth, 38, 16).fill('#FFFFFF');
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(PDF_THEME.accent)
      .text(label.toUpperCase(), chipX + 14, chipY + 8, { width: chipWidth - 28 });
    doc
      .font('Helvetica')
      .fontSize(9.2)
      .fillColor(PDF_THEME.text)
      .text(value, chipX + 14, chipY + 19, { width: chipWidth - 28, lineGap: 1 });
    chipY += 43;
  }
  doc.restore();
  doc.y = y + height + 18;
}

function simpleTable(doc: PdfDoc, title: string, rows: [string, string][]): void {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const col1 = usable * 0.36;
  const col2 = usable - col1;
  ensureSpace(doc, 48);
  doc
    .font('Helvetica-Bold')
    .fontSize(11.5)
    .fillColor(PDF_THEME.text)
    .text(title);
  doc.moveDown(0.4);
  let y = doc.y;
  doc.roundedRect(left, y, usable, 26, 8).fill(PDF_THEME.accentSoft);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(PDF_THEME.accent)
    .text('Item', left + 12, y + 8, { width: col1 - 24 });
  doc.text('Detail', left + col1 + 12, y + 8, { width: col2 - 24 });
  y += 30;
  for (const [label, value] of rows) {
    const h = Math.max(
      28,
      doc.heightOfString(label, { width: col1 - 24 }) + 14,
      doc.heightOfString(value, { width: col2 - 24 }) + 14,
    );
    ensureSpace(doc, h + 6);
    y = doc.y;
    doc.roundedRect(left, y, usable, h, 8).fillAndStroke(PDF_THEME.surface, PDF_THEME.border);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(PDF_THEME.text)
      .text(label, left + 12, y + 8, { width: col1 - 24 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PDF_THEME.text)
      .text(value, left + col1 + 12, y + 8, { width: col2 - 24, lineGap: 1 });
    doc.y = y + h + 6;
  }
  doc.moveDown(0.4);
}

function callout(doc: PdfDoc, tone: 'draft' | 'info', title: string, body: string): void {
  const fill = tone === 'draft' ? PDF_THEME.draftSoft : PDF_THEME.accentSoft;
  const text = tone === 'draft' ? PDF_THEME.draft : PDF_THEME.accent;
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bodyWidth = usable - 32;
  const titleHeight = doc.heightOfString(title, { width: bodyWidth });
  const bodyHeight = doc.heightOfString(body, { width: bodyWidth, lineGap: 2 });
  const height = Math.max(72, 26 + titleHeight + bodyHeight);
  ensureSpace(doc, height + 8);
  const y = doc.y;
  doc.roundedRect(left, y, usable, height, 12).fill(fill);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(text)
    .text(title, left + 16, y + 14, { width: bodyWidth });
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(PDF_THEME.text)
    .text(body, left + 16, y + 18 + titleHeight, { width: bodyWidth, lineGap: 2 });
  doc.y = y + height + 10;
}

function findingCard(doc: PdfDoc, edition: ReportEdition, finding: Finding): void {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const status = statusTheme(finding.status);
  const refs = crossReferenceForEdition(edition, finding.id);
  const evidenceLines = finding.evidence.slice(0, 3).map((ev) => `${ev.type === 'issue' ? 'Issue' : 'Pass'}: ${ev.text} (${ev.where})`);
  const meta = [
    `${REPORT_META[finding.report].short}`,
    finding.level ? `Level ${finding.level}` : '',
    finding.ver ? `WCAG ${finding.ver}` : '',
    `${Math.round(finding.confidence * 100)}% confidence`,
    finding.auto ? `${finding.auto} automated checks` : '',
  ].filter(Boolean).join(' • ');
  const refLines = [
    refs.en.length ? `EN 301 549: ${refs.en.join(', ')}` : '',
    refs.s508.length ? `Section 508: ${refs.s508.join(', ')}` : '',
  ].filter(Boolean);
  const bodyWidth = usable - 32;
  const bodySections = [
    finding.remarks,
    evidenceLines.length ? `Evidence\n${evidenceLines.map((line) => `- ${line}`).join('\n')}` : '',
    refLines.length ? `Cross-reference\n${refLines.map((line) => `- ${line}`).join('\n')}` : '',
  ].filter(Boolean);
  const bodyText = bodySections.join('\n\n');
  doc.font('Helvetica-Bold').fontSize(11.5);
  const titleHeight = doc.heightOfString(`${finding.id}  ${finding.name}`, { width: usable - 170, lineGap: 1 });
  doc.font('Helvetica').fontSize(9.2);
  const metaHeight = doc.heightOfString(meta, { width: bodyWidth });
  doc.font('Helvetica').fontSize(9.4);
  const contentHeight = doc.heightOfString(bodyText, { width: bodyWidth, lineGap: 2 });
  const metaY = 18 + titleHeight + 4;
  const bodyY = metaY + metaHeight + 8;
  const height = Math.max(118, bodyY + contentHeight + 16);
  ensureSpace(doc, height + 10);
  const y = doc.y;
  doc.roundedRect(left, y, usable, height, 12).fillAndStroke(PDF_THEME.surface, PDF_THEME.border);
  doc
    .font('Helvetica-Bold')
    .fontSize(11.5)
    .fillColor(PDF_THEME.text)
    .text(`${finding.id}  ${finding.name}`, left + 16, y + 14, { width: usable - 170 });
  doc.roundedRect(left + usable - 138, y + 12, 122, 22, 11).fill(status.fill);
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(status.text)
    .text(finding.status, left + usable - 132, y + 19, { width: 110, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(9.2)
    .fillColor(PDF_THEME.muted)
    .text(meta, left + 16, y + metaY, { width: bodyWidth });
  doc
    .font('Helvetica')
    .fontSize(9.4)
    .fillColor(PDF_THEME.text)
    .text(bodyText, left + 16, y + bodyY, {
      width: bodyWidth,
      lineGap: 2,
    });
  doc.y = y + height + 10;
}

function estimateFindingCardHeight(doc: PdfDoc, edition: ReportEdition, finding: Finding): number {
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const refs = crossReferenceForEdition(edition, finding.id);
  const evidenceLines = finding.evidence.slice(0, 3).map((ev) => `${ev.type === 'issue' ? 'Issue' : 'Pass'}: ${ev.text} (${ev.where})`);
  const meta = [
    `${REPORT_META[finding.report].short}`,
    finding.level ? `Level ${finding.level}` : '',
    finding.ver ? `WCAG ${finding.ver}` : '',
    `${Math.round(finding.confidence * 100)}% confidence`,
    finding.auto ? `${finding.auto} automated checks` : '',
  ].filter(Boolean).join(' • ');
  const refLines = [
    refs.en.length ? `EN 301 549: ${refs.en.join(', ')}` : '',
    refs.s508.length ? `Section 508: ${refs.s508.join(', ')}` : '',
  ].filter(Boolean);
  const bodyText = [
    finding.remarks,
    evidenceLines.length ? `Evidence\n${evidenceLines.map((line) => `- ${line}`).join('\n')}` : '',
    refLines.length ? `Cross-reference\n${refLines.map((line) => `- ${line}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  const bodyWidth = usable - 32;
  doc.font('Helvetica-Bold').fontSize(11.5);
  const titleHeight = doc.heightOfString(`${finding.id}  ${finding.name}`, { width: usable - 170, lineGap: 1 });
  doc.font('Helvetica').fontSize(9.2);
  const metaHeight = doc.heightOfString(meta, { width: bodyWidth });
  doc.font('Helvetica').fontSize(9.4);
  const contentHeight = doc.heightOfString(bodyText, { width: bodyWidth, lineGap: 2 });
  return Math.max(118, 18 + titleHeight + 4 + metaHeight + 8 + contentHeight + 16);
}

function autoRowsCard(doc: PdfDoc, title: string, rows: AutoRow[]): void {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const content = rows.map((row) => `${row.id} ${row.name}\n${row.ref}`).join('\n\n');
  const width = usable - 32;
  const titleHeight = doc.heightOfString(title, { width });
  const contentHeight = doc.heightOfString(content, { width, lineGap: 2 });
  const height = Math.max(90, 28 + titleHeight + contentHeight);
  ensureSpace(doc, height + 10);
  const y = doc.y;
  doc.roundedRect(left, y, usable, height, 12).fillAndStroke(PDF_THEME.surfaceAlt, PDF_THEME.border);
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_THEME.text)
    .text(title, left + 16, y + 14, { width });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PDF_THEME.text)
    .text(content, left + 16, y + 18 + titleHeight, { width, lineGap: 2 });
  doc.y = y + height + 10;
}

function buildPdf(detail: ReportDetail, variant: ExportVariant): Promise<ExportArtifact> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () =>
      resolve({ buffer: Buffer.concat(chunks), contentType: 'application/pdf', filename: filename(detail, 'pdf', variant) }),
    );
    doc.on('error', reject);
    doc.on('pageAdded', () => decoratePage(doc, detail.report, variant));

    const r = detail.report;
    decoratePage(doc, r, variant);

    coverHero(doc, r, variant);
    doc
      .font('Helvetica-Bold')
      .fontSize(27)
      .fillColor(PDF_THEME.text)
      .text('Accessibility Conformance Report', doc.page.margins.left, doc.y, { width: 430 });
    doc.moveDown(0.18);
    doc
      .font('Helvetica')
      .fontSize(11.5)
      .fillColor(PDF_THEME.muted)
      .text(`Based on ${VERSION} - ${EDITION_META[r.edition].fullLabel}`, doc.page.margins.left, doc.y, { width: 430 });
    doc.moveDown(0.5);

    if (variant === 'draft') {
      callout(doc, 'draft', 'Draft pending review and approval', DRAFT_DISCLAIMER);
    }

    sectionHeading(
      doc,
      'Report Overview',
      'Report summary',
      variant === 'draft'
        ? 'Use this draft to review factual accuracy, confirm evaluator language, and align final conformance statements before approval.'
        : 'This approved report is formatted for procurement, legal, accessibility, and customer-facing review.',
    );

    infoGrid(doc, [
      ['Product / Version', `${val(r.productName, r.domain)}${r.productVersion ? ` - ${r.productVersion}` : ''}`],
      ['Domain', r.domain],
      ['Evaluation Period', r.evaluationStart || r.evaluationEnd ? `${isoToLong(r.evaluationStart)} - ${isoToLong(r.evaluationEnd)}` : 'Not provided'],
      ['Report Date', longDate()],
      ['Evaluator', [r.evaluatorName, r.evaluatorOrg].filter(Boolean).join(', ') || 'Not provided'],
      ['Assistive Tech', r.assistiveTech.length ? r.assistiveTech.join('; ') : 'Not provided'],
      ['Test Environment', r.testEnvironments.length ? r.testEnvironments.join('; ') : 'Not provided'],
      ['Notes', val(r.notes, 'No additional notes provided')],
    ]);

    if (r.productDescription) {
      callout(doc, 'info', 'Product description', r.productDescription);
    }

    simpleTable(doc, 'Applicable standards and guidelines', standardsRows(r.edition, r.wcagTarget));
    simpleTable(doc, 'Conformance terms used in this report', TERMS.map((term) => [term.term, term.def]));

    if (r.evaluationMethods || detail.pages.length) {
      const methods = val(r.evaluationMethods, DEFAULT_EVALUATION_METHODS);
      const pages = detail.pages.length ? detail.pages.map((p) => p.url).join(', ') : 'No page list captured';
      callout(doc, 'info', 'Evaluation approach', `${methods}\n\nPages tested: ${pages}`);
    }

    for (const rep of reportsForEdition(r.edition)) {
      doc.addPage();
      sectionHeading(doc, 'Report Section', rep.name, reportNoteForEdition(r.edition, rep));
      for (const sec of rep.sections) {
        const findings = detail.findings.filter((f) => f.report === rep.id && f.section === sec.id);
        const autos = detail.auto.filter((a) => a.report === rep.id && a.section === sec.id);
        if (!findings.length && !autos.length) continue;
        const previewHeight = findings.length
          ? estimateFindingCardHeight(doc, r.edition, findings[0])
          : autos.length
            ? 140
            : 0;
        ensureSpace(doc, 86 + Math.min(previewHeight, 180));
        sectionHeading(doc, rep.tag, sec.name);
        for (const finding of findings) {
          findingCard(doc, r.edition, finding);
        }
        if (autos.length) {
          autoRowsCard(doc, 'Reference and automatic rows', autos);
        }
      }
    }

    doc.addPage();
    sectionHeading(doc, 'Attestation', ATTEST_HEADING, attestationText(r, variant));

    // Appendix: manual test plan.
    doc.addPage();
    sectionHeading(
      doc,
      'Appendix',
      'Manual Test Plan',
      'Automated tooling covers only part of WCAG. The procedure below documents the manual and assistive-technology pass that supports the evaluator attestation.',
    );
    if (detail.pages.length) callout(doc, 'info', 'Pages tested', detail.pages.map((p) => p.url).join(', '));
    for (const area of TEST_PROCEDURE) {
      const body = `${area.steps.map((step) => `- ${step}`).join('\n')}\n\nCovers: ${area.criteria.join(', ')}`;
      callout(doc, 'info', area.title, body);
    }

    finalizePageNumbers(doc);
    doc.end();
  });
}

export function buildExport(format: ExportFormat, detail: ReportDetail, variant: ExportVariant = 'draft'): Promise<ExportArtifact> {
  switch (format) {
    case 'vpat':
      return Promise.resolve(buildVpat(detail, variant));
    case 'xlsx':
      return buildXlsx(detail, variant);
    case 'docx':
      return buildDocx(detail, variant);
    case 'pdf':
      return buildPdf(detail, variant);
  }
}
