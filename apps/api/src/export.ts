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
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} from 'docx';
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

const BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
};

function tc(text: string, opts: { bold?: boolean; width?: number; shade?: boolean } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F3F6' } : undefined,
    children: text.split('\n').map(
      (line) => new Paragraph({ children: [new TextRun({ text: line, bold: opts.bold })] }),
    ),
  });
}

function kvTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: rows.map(
      ([k, v]) => new TableRow({ children: [tc(k, { bold: true, width: 28, shade: true }), tc(v, { width: 72 })] }),
    ),
  });
}

function conformanceTable(rows: { id: string; level: string; remarks: string }[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      tc('Criteria', { bold: true, width: 26, shade: true }),
      tc('Conformance Level', { bold: true, width: 20, shade: true }),
      tc('Remarks and Explanations', { bold: true, width: 54, shade: true }),
    ],
  });
  const body = rows.map(
    (r) => new TableRow({ children: [tc(r.id), tc(r.level), tc(r.remarks)] }),
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [header, ...body] });
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

async function buildDocx(detail: ReportDetail, variant: ExportVariant): Promise<ExportArtifact> {
  const r = detail.report;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'Accessibility Conformance Report', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Based on ${VERSION} — ${EDITION_META[r.edition].fullLabel}`, italics: true })] }),
    new Paragraph({ text: 'Report Information', heading: HeadingLevel.HEADING_2 }),
    kvTable(productInfo(r)),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Applicable Standards / Guidelines', heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS,
      rows: [
        new TableRow({
          tableHeader: true,
          children: [tc('Standard / Guideline', { bold: true, width: 50, shade: true }), tc('Included For', { bold: true, width: 50, shade: true })],
        }),
        ...standardsRows(r.edition, r.wcagTarget).map(([s, inc]) => new TableRow({ children: [tc(s), tc(inc)] })),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Terms', heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDERS,
      rows: [
        new TableRow({
          tableHeader: true,
          children: [tc('Term', { bold: true, width: 26, shade: true }), tc('Definition', { bold: true, width: 74, shade: true })],
        }),
        ...TERMS.map((t) => new TableRow({ children: [tc(t.term), tc(t.def)] })),
      ],
    }),
  ];
  if (variant === 'draft') {
    children.splice(
      2,
      0,
      new Paragraph({
        children: [new TextRun({ text: 'DRAFT — pending review and approval', bold: true, color: 'B3261E' })],
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({ children: [new TextRun({ text: DRAFT_DISCLAIMER, italics: true, color: '666666', size: 18 })] }),
      new Paragraph({ text: '' }),
    );
  }

  for (const rep of reportsForEdition(r.edition)) {
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: rep.name, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [new TextRun({ text: reportNoteForEdition(r.edition, rep), italics: true, size: 18 })] }));
    for (const sec of rep.sections) {
      const findings = detail.findings.filter((f) => f.report === rep.id && f.section === sec.id);
      const autos = detail.auto.filter((a) => a.report === rep.id && a.section === sec.id);
      if (!findings.length && !autos.length) continue;
      children.push(new Paragraph({ text: sec.name, heading: HeadingLevel.HEADING_3 }));
      const rows = [
        ...findings.map((f) => ({ id: criterionLabel(f), level: f.status, remarks: wcagRemark(r.edition, f) })),
        ...autos.map((a) => ({ id: autoLabel(a), level: a.status, remarks: a.ref })),
      ];
      children.push(conformanceTable(rows));
    }
  }

  children.push(new Paragraph({ text: '' }));
  children.push(new Paragraph({ text: ATTEST_HEADING, heading: HeadingLevel.HEADING_2 }));
  children.push(new Paragraph({ text: attestationText(r, variant) }));

  // Appendix: the manual procedure backing the attestation.
  children.push(new Paragraph({ text: '' }));
  children.push(new Paragraph({ text: 'Appendix A — Manual Test Plan', heading: HeadingLevel.HEADING_2 }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Automated tooling covers only part of WCAG. The pages below were evaluated with assistive technology following this procedure, which backs the attestation above.',
          italics: true,
          size: 18,
        }),
      ],
    }),
  );
  if (detail.pages.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Pages tested: ', bold: true }), new TextRun({ text: detail.pages.map((p) => p.url).join(', ') })],
      }),
    );
  }
  for (const area of TEST_PROCEDURE) {
    children.push(new Paragraph({ text: area.title, heading: HeadingLevel.HEADING_3 }));
    for (const s of area.steps) children.push(new Paragraph({ text: s, bullet: { level: 0 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Covers: ${area.criteria.join(', ')}`, italics: true, color: '666666', size: 18 })] }));
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: filename(detail, 'docx', variant),
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
  doc.fillOpacity(0.08).roundedRect(left + 18, y + 18, 122, 162, 18).fill('#FFFFFF');
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
    case 'docx':
      return buildDocx(detail, variant);
    case 'pdf':
      return buildPdf(detail, variant);
  }
}
