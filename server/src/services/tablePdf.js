import { createPdf, ensureSpace, pageFooters, PDF_COLORS, reportHeader } from './pdfLayout.js';

// A list as a PDF in the house report style (logo header, saffron rule, page numbers): the PDF
// twin of a list that is also offered as Excel (Settings → Reports decides whether Excel is shown).
//
//   columns  [{ header, key, width, align }] — width is relative (the table fills the page)
//   rows     [{ [key]: value }] — printed as given, so format dates and amounts first
//   footer   optional last line, e.g. "12 bookings · ₹24,000"

const SIZE = 7.5;   // pt
const PAD = 3;

export function tablePdf(res, { title, subtitle = '', columns, rows, footer = '', filename, landscape = false }) {
  const doc = createPdf({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 32 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const units = columns.reduce((s, c) => s + (c.width || 1), 0);
  const ws = columns.map((c) => ((c.width || 1) / units) * width);   // column widths
  const xs = ws.map((_, i) => left + ws.slice(0, i).reduce((s, w) => s + w, 0));   // left edges

  const textOpts = (i) => ({ width: ws[i] - 2 * PAD, align: columns[i].align || 'left' });
  const heightOf = (texts) => Math.max(...texts.map((t, i) => doc.heightOfString(t || ' ', textOpts(i)))) + 2 * PAD;

  // The column headings — again at the top of every page
  const head = (y) => {
    doc.font('Body-Bold').fontSize(SIZE);
    const h = heightOf(columns.map((c) => c.header));
    doc.rect(left, y, width, h).fill('#fff7ed');
    columns.forEach((c, i) => doc.fillColor('#7c2d12').text(c.header, xs[i] + PAD, y + PAD, textOpts(i)));
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.8).strokeColor('#fdba74').stroke();
    return y + h;
  };

  let y = head(reportHeader(doc, { title, subtitle }));
  rows.forEach((r, n) => {
    const texts = columns.map((c) => String(r[c.key] ?? ''));
    doc.font('Body').fontSize(SIZE);
    const h = heightOf(texts);
    y = ensureSpace(doc, y, h, { onNewPage: head });
    doc.font('Body').fontSize(SIZE);
    if (n % 2) doc.rect(left, y, width, h).fill('#fafafa');
    texts.forEach((t, i) => doc.fillColor(PDF_COLORS.text).text(t, xs[i] + PAD, y + PAD, textOpts(i)));
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.3).strokeColor(PDF_COLORS.line).stroke();
    y += h;
  });

  if (!rows.length) {
    doc.font('Body').fontSize(9).fillColor(PDF_COLORS.muted).text('Nothing to show for these filters.', left, y + 8, { width });
    y = doc.y;
  }
  if (footer) {
    y = ensureSpace(doc, y + 6, 16);
    doc.font('Body-Bold').fontSize(8.5).fillColor(PDF_COLORS.text).text(footer, left, y, { width });
  }
  pageFooters(doc, { label: title });
  doc.end();
}
