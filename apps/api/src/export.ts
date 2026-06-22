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
import PDFDocument from 'pdfkit';
import {
  REPORTS,
  TERMS,
  TEST_PROCEDURE,
  VERSION,
  EDITION,
  DEFAULT_EVALUATION_METHODS,
  DRAFT_DISCLAIMER,
  wcagAlsoApplies,
  type AutoRow,
  type ExportFormat,
  type Finding,
  type ReportDetail,
  type ReportRecord,
  type WcagTarget,
} from '@vpat/shared';

export interface ExportArtifact {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

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
function filename(detail: ReportDetail, ext: string): string {
  return `VPAT2.5Rev-INT-${slug(detail.report.domain)}-${dateStamp()}-DRAFT.${ext}`;
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
function standardsRows(target: WcagTarget): [string, string][] {
  const rank = { A: 1, AA: 2, AAA: 3 }[target];
  const levels = ['Level A', rank >= 2 ? 'Level AA' : '', rank >= 3 ? 'Level AAA' : ''].filter(Boolean).join(', ');
  return [
    ['WCAG 2.0', levels],
    ['WCAG 2.1', levels],
    ['WCAG 2.2', levels],
    ['Revised Section 508 (2017)', 'Included'],
    ['EN 301 549 (V3.1.1 / V3.2.1)', 'Included'],
  ];
}

const ATTEST_HEADING = 'Evaluator Attestation';
function attestationText(r: ReportRecord): string {
  const who = [r.evaluatorName, r.evaluatorOrg].filter(Boolean).join(', ') || 'the named evaluator';
  const at = r.assistiveTech.length ? r.assistiveTech.join(', ') : 'the assistive technologies listed above';
  const env = r.testEnvironments.length ? r.testEnvironments.join('; ') : 'the environments listed above';
  const period =
    r.evaluationStart || r.evaluationEnd ? ` between ${isoToLong(r.evaluationStart)} and ${isoToLong(r.evaluationEnd)}` : '';
  return (
    `This report was prepared by ${who}${period}. Conformance was evaluated using automated tooling together with ` +
    `manual review and assistive-technology testing with ${at}, in ${env}. ` +
    `This document is issued as a DRAFT: the responsible party must review and approve every finding before the report ` +
    `is published or relied upon for procurement.`
  );
}

/* ---------- JSON (.vpat) ---------- */

function buildVpat(detail: ReportDetail): ExportArtifact {
  const payload = {
    version: VERSION,
    edition: EDITION,
    status: 'draft',
    disclaimer: DRAFT_DISCLAIMER,
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
    filename: filename(detail, 'vpat'),
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

function wcagRemark(f: Finding): string {
  if (f.report !== 'wcag' || f.obsolete) return f.remarks;
  const x = wcagAlsoApplies(f.id);
  return `${f.remarks}\nAlso documents: EN 301 549 ${x.en.join(', ')}; Section 508 ${x.s508.join(', ')}.`;
}

function criterionLabel(f: Finding): string {
  return `${f.id} ${f.name}${f.level ? ` (Level ${f.level})` : ''}`;
}
function autoLabel(a: AutoRow): string {
  return `${a.id} ${a.name}`;
}

async function buildDocx(detail: ReportDetail): Promise<ExportArtifact> {
  const r = detail.report;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'Accessibility Conformance Report', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Based on ${VERSION} — ${EDITION}`, italics: true })] }),
    new Paragraph({
      children: [new TextRun({ text: 'DRAFT — pending review and approval', bold: true, color: 'B3261E' })],
      alignment: AlignmentType.LEFT,
    }),
    new Paragraph({ children: [new TextRun({ text: DRAFT_DISCLAIMER, italics: true, color: '666666', size: 18 })] }),
    new Paragraph({ text: '' }),
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
        ...standardsRows(r.wcagTarget).map(([s, inc]) => new TableRow({ children: [tc(s), tc(inc)] })),
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

  for (const rep of REPORTS) {
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: rep.name, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [new TextRun({ text: rep.note, italics: true, size: 18 })] }));
    for (const sec of rep.sections) {
      const findings = detail.findings.filter((f) => f.report === rep.id && f.section === sec.id);
      const autos = detail.auto.filter((a) => a.report === rep.id && a.section === sec.id);
      if (!findings.length && !autos.length) continue;
      children.push(new Paragraph({ text: sec.name, heading: HeadingLevel.HEADING_3 }));
      const rows = [
        ...findings.map((f) => ({ id: criterionLabel(f), level: f.status, remarks: wcagRemark(f) })),
        ...autos.map((a) => ({ id: autoLabel(a), level: a.status, remarks: a.ref })),
      ];
      children.push(conformanceTable(rows));
    }
  }

  children.push(new Paragraph({ text: '' }));
  children.push(new Paragraph({ text: ATTEST_HEADING, heading: HeadingLevel.HEADING_2 }));
  children.push(new Paragraph({ text: attestationText(r) }));

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
    filename: filename(detail, 'docx'),
  };
}

/* ---------- PDF ---------- */

type PdfDoc = InstanceType<typeof PDFDocument>;

function watermark(doc: PdfDoc): void {
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.fillOpacity(0.06).fillColor('#000000').fontSize(120).font('Helvetica-Bold');
  doc.text('DRAFT', 0, doc.page.height / 2 - 80, { width: doc.page.width, align: 'center' });
  doc.fillOpacity(1);
  doc.restore();
}

function pdfTable(doc: PdfDoc, cols: { label: string; w: number }[], rows: string[][]): void {
  const startX = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = cols.map((c) => usableW * c.w);
  const pad = 4;

  const drawRow = (cells: string[], header: boolean) => {
    doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const heights = cells.map((c, i) => doc.heightOfString(c || '', { width: widths[i] - 2 * pad }));
    const h = Math.max(16, ...heights) + 2 * pad;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    let x = startX;
    for (let i = 0; i < cells.length; i++) {
      doc.rect(x, y, widths[i], h).strokeColor('#dddddd').lineWidth(0.5).stroke();
      doc
        .fillColor(header ? '#1a1a2e' : '#222222')
        .text(cells[i] || '', x + pad, y + pad, { width: widths[i] - 2 * pad });
      x += widths[i];
    }
    doc.x = startX;
    doc.y = y + h;
  };

  drawRow(cols.map((c) => c.label), true);
  for (const row of rows) drawRow(row, false);
  doc.x = startX;
  doc.moveDown(0.6);
}

function buildPdf(detail: ReportDetail): Promise<ExportArtifact> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () =>
      resolve({ buffer: Buffer.concat(chunks), contentType: 'application/pdf', filename: filename(detail, 'pdf') }),
    );
    doc.on('error', reject);
    doc.on('pageAdded', () => watermark(doc));

    const r = detail.report;
    watermark(doc); // page 1

    doc.fillColor('#1a1a2e').font('Helvetica-Bold').fontSize(20).text('Accessibility Conformance Report');
    doc.font('Helvetica-Oblique').fontSize(11).fillColor('#666').text(`Based on ${VERSION} — ${EDITION}`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#b3261e').text('DRAFT — pending review and approval');
    doc.font('Helvetica').fontSize(8).fillColor('#666').text(DRAFT_DISCLAIMER, { width: 495 });
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('Report Information');
    doc.moveDown(0.3);
    pdfTable(doc, [{ label: 'Field', w: 0.28 }, { label: 'Value', w: 0.72 }], productInfo(r));

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('Applicable Standards / Guidelines');
    doc.moveDown(0.3);
    pdfTable(doc, [{ label: 'Standard / Guideline', w: 0.5 }, { label: 'Included For', w: 0.5 }], standardsRows(r.wcagTarget));

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('Terms');
    doc.moveDown(0.3);
    pdfTable(doc, [{ label: 'Term', w: 0.26 }, { label: 'Definition', w: 0.74 }], TERMS.map((t) => [t.term, t.def]));

    for (const rep of REPORTS) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#1a1a2e').text(rep.name);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(rep.note, { width: 495 });
      doc.moveDown(0.4);
      for (const sec of rep.sections) {
        const findings = detail.findings.filter((f) => f.report === rep.id && f.section === sec.id);
        const autos = detail.auto.filter((a) => a.report === rep.id && a.section === sec.id);
        if (!findings.length && !autos.length) continue;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(sec.name);
        doc.moveDown(0.2);
        const rows = [
          ...findings.map((f) => [criterionLabel(f), f.status, wcagRemark(f)]),
          ...autos.map((a) => [autoLabel(a), a.status, a.ref]),
        ];
        pdfTable(doc, [{ label: 'Criteria', w: 0.26 }, { label: 'Conformance Level', w: 0.2 }, { label: 'Remarks and Explanations', w: 0.54 }], rows);
      }
    }

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(ATTEST_HEADING);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#222').text(attestationText(r), { width: 495 });

    // Appendix: manual test plan.
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('Appendix A — Manual Test Plan');
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#444')
      .text(
        'Automated tooling covers only part of WCAG. The pages below were evaluated with assistive technology following this procedure, which backs the attestation above.',
        { width: 495 },
      );
    if (detail.pages.length) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Pages tested: ', { continued: true }).font('Helvetica').text(detail.pages.map((p) => p.url).join(', '));
    }
    for (const area of TEST_PROCEDURE) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000').text(area.title);
      doc.font('Helvetica').fontSize(9).fillColor('#222');
      for (const s of area.steps) doc.text(`• ${s}`, { indent: 8, width: 487 });
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666').text(`Covers: ${area.criteria.join(', ')}`, { indent: 8 });
    }

    doc.end();
  });
}

export function buildExport(format: ExportFormat, detail: ReportDetail): Promise<ExportArtifact> {
  switch (format) {
    case 'vpat':
      return Promise.resolve(buildVpat(detail));
    case 'docx':
      return buildDocx(detail);
    case 'pdf':
      return buildPdf(detail);
  }
}
