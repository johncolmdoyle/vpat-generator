/** Real DOCX / PDF / JSON (.vpat) generators for the assembled ACR (BACKEND.md §5). */
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
} from 'docx';
import PDFDocument from 'pdfkit';
import { REPORTS, VERSION, EDITION, type ExportFormat, type Finding, type ReportDetail } from '@vpat/shared';

export interface ExportArtifact {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function slug(domain: string): string {
  return domain.replace(/\..*/, '').replace(/[^a-z0-9-]/gi, '') || 'report';
}

function dateStamp(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/\s|,/g, '');
}

function filename(detail: ReportDetail, ext: string): string {
  return `VPAT2.5Rev-INT-${slug(detail.report.domain)}-${dateStamp()}.${ext}`;
}

function headerFields(detail: ReportDetail): [string, string][] {
  const r = detail.report;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return [
    ['Name of Product / Version', `${r.domain} — web platform${r.productVersion ? `, ${r.productVersion}` : ''}`],
    ['Report Date', today],
    ['Product Description', r.productDescription ?? 'Customer-facing web application.'],
    ['Contact Information', r.contactEmail ?? `accessibility@${r.domain}`],
    [
      'Evaluation Methods Used',
      r.evaluationMethods ?? 'Automated scan (axe-core, WCAG 2.2 ruleset) + AI-assisted manual review.',
    ],
    ['Notes', r.notes ?? 'Draft ACR generated for internal review.'],
  ];
}

/* ---------- JSON (.vpat) ---------- */

function buildVpat(detail: ReportDetail): ExportArtifact {
  const payload = {
    version: VERSION,
    edition: EDITION,
    generatedAt: new Date().toISOString(),
    report: detail.report,
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

const cell = (text: string, opts: { bold?: boolean; width?: number } = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })],
  });

function reportTable(findings: Finding[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Criterion', { bold: true, width: 12 }),
      cell('Name', { bold: true, width: 26 }),
      cell('Conformance Level', { bold: true, width: 18 }),
      cell('Remarks and Explanations', { bold: true, width: 44 }),
    ],
  });
  const rows = findings.map(
    (f) =>
      new TableRow({
        children: [
          cell(f.id),
          cell(f.name),
          cell(f.status),
          cell(f.remarks),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
    },
    rows: [header, ...rows],
  });
}

async function buildDocx(detail: ReportDetail): Promise<ExportArtifact> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'Accessibility Conformance Report', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `${VERSION} ${EDITION}`, heading: HeadingLevel.HEADING_3 }),
    new Paragraph({ text: '' }),
  ];

  for (const [k, v] of headerFields(detail)) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun({ text: v })] }),
    );
  }

  for (const rep of REPORTS) {
    const findings = detail.findings.filter((f) => f.report === rep.id);
    if (findings.length === 0) continue;
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: rep.name, heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: rep.note }));
    children.push(reportTable(findings));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: filename(detail, 'docx'),
  };
}

/* ---------- PDF ---------- */

function buildPdf(detail: ReportDetail): Promise<ExportArtifact> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () =>
      resolve({
        buffer: Buffer.concat(chunks),
        contentType: 'application/pdf',
        filename: filename(detail, 'pdf'),
      }),
    );
    doc.on('error', reject);

    doc.fontSize(20).text('Accessibility Conformance Report', { align: 'left' });
    doc.fontSize(11).fillColor('#666').text(`${VERSION} ${EDITION}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(10);
    for (const [k, v] of headerFields(detail)) {
      doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(v);
    }

    for (const rep of REPORTS) {
      const findings = detail.findings.filter((f) => f.report === rep.id);
      if (findings.length === 0) continue;
      doc.moveDown();
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a2e').text(rep.name);
      doc.fontSize(9).font('Helvetica').fillColor('#000');
      for (const f of findings) {
        doc.moveDown(0.4);
        doc
          .font('Helvetica-Bold')
          .text(`${f.id}  ${f.name}`, { continued: true })
          .font('Helvetica')
          .fillColor('#555')
          .text(`   — ${f.status}`);
        doc.fillColor('#000').text(f.remarks, { indent: 12 });
      }
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
