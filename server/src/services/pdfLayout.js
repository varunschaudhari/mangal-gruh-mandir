import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { temple } from './temple.service.js';

// One look for every PDF the server makes. Receipts, vouchers and payslips get the full
// letterhead (logo, the temple's name in Marathi and English, address, contacts, registration
// numbers); reports and registers get a slim header so the tables keep the room. Saffron is only
// an accent (lines, headings) — it prints as a clear grey on an office black & white printer.
//
// Text is set in Mukta, which has Devanagari and Latin (and ₹): Marathi names print correctly.
// The fonts are registered under the Helvetica names too, so drawing code can keep using them.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, '../../assets');
export const LOGO_PATH = path.join(ASSETS, 'logo.png');
const FONT = (name) => path.join(ASSETS, 'fonts', `Mukta-${name}.ttf`);
const HAS_LOGO = existsSync(LOGO_PATH);

export const PDF_COLORS = {
  accent: '#c2410c',      // temple saffron, dark enough to print
  accentSoft: '#fff7ed',  // light tint for header rows / boxes (barely shows in B/W)
  text: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
};

/** The y offset that centres one line of text (font size `size`) in a row of height `h` — Mukta's ascender is tall. */
export const mid = (h, size) => h / 2 - 0.815 * size;

const fmtNow = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A new PDF with the temple fonts. Same options as new PDFDocument (A4, 40 pt margins, buffered pages by default). */
export function createPdf(options = {}) {
  // The starting font is Mukta too: pdfkit caches its first font under its name, and a cached
  // standard Helvetica would win over the names registered below
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, ...options, font: FONT('Regular') });
  for (const [name, file] of [
    ['Helvetica', 'Regular'], ['Helvetica-Oblique', 'Regular'], ['Body', 'Regular'],
    ['Helvetica-Bold', 'Bold'], ['Helvetica-BoldOblique', 'Bold'], ['Body-Bold', 'Bold'],
    ['Body-SemiBold', 'SemiBold'],
  ]) doc.registerFont(name, FONT(file));
  doc.font('Helvetica');
  return doc;
}

const contentBox = (doc) => ({ left: doc.page.margins.left, width: doc.page.width - doc.page.margins.left - doc.page.margins.right });

function logo(doc, x, y, size) {
  if (!HAS_LOGO) return false;
  try { doc.image(LOGO_PATH, x, y, { fit: [size, size] }); return true; } catch { return false; }
}

/** "Trust Reg. No. … · PAN … · 80G …" — only the numbers filled in Settings → Temple / 80G. */
export function registrationLine(t = temple()) {
  return [
    t.trustReg && `Trust Reg. No. ${t.trustReg}`,
    t.pan && `PAN ${t.pan}`,
    t.reg80G && `80G ${t.reg80G}`,
  ].filter(Boolean).join('   ·   ');
}

/**
 * The full letterhead (receipts, vouchers, payslips), then the document's title with its number
 * and date. Returns the y to continue from.
 */
export function letterhead(doc, { title, number, date, numberLabel = 'No.' } = {}) {
  const t = temple();
  const { left, width } = contentBox(doc);
  const top = doc.page.margins.top - 4;
  const LOGO = 58;
  const hasLogo = logo(doc, left, top, LOGO);
  const x = hasLogo ? left + LOGO + 12 : left;
  const w = width - (x - left);

  let y = top;
  doc.fillColor(PDF_COLORS.text).font('Body-Bold').fontSize(17).text(t.nameMr || t.name, x, y, { width: w, lineGap: -2 });
  y = doc.y;
  if (t.nameMr) {
    doc.font('Body-SemiBold').fontSize(11).fillColor(PDF_COLORS.text).text(t.name, x, y, { width: w });
    y = doc.y;
  }
  if (t.legalName && t.legalName !== t.name) {
    doc.font('Body').fontSize(9).fillColor(PDF_COLORS.text).text(`Managed by ${t.legalName}`, x, y, { width: w });
    y = doc.y;
  }
  const lines = [
    t.address,
    [t.phone && `Phone ${t.phone}`, t.email, t.website].filter(Boolean).join('   ·   '),
    registrationLine(t),
  ].filter(Boolean);
  doc.font('Body').fontSize(8.5).fillColor(PDF_COLORS.muted);
  for (const line of lines) { doc.text(line, x, y, { width: w }); y = doc.y; }

  y = Math.max(y, hasLogo ? top + LOGO : y) + 8;
  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.6).strokeColor(PDF_COLORS.accent).stroke();
  doc.moveTo(left, y + 2.5).lineTo(left + width, y + 2.5).lineWidth(0.4).strokeColor(PDF_COLORS.accent).stroke();
  y += 12;

  if (title) {
    doc.font('Body-Bold').fontSize(13).fillColor(PDF_COLORS.accent)
      .text(String(title).toUpperCase(), left, y, { width, align: 'center', characterSpacing: 1.2 });
    y = doc.y + 4;
  }
  if (number || date) {
    doc.font('Body').fontSize(9.5).fillColor(PDF_COLORS.text);
    if (number) doc.text(`${numberLabel} `, left, y, { continued: true }).font('Body-Bold').text(String(number));
    if (date) doc.font('Body').text(`Date  ${date}`, left, y, { width, align: 'right' });
    y = doc.y + 6;
  }
  doc.font('Helvetica').fillColor(PDF_COLORS.text);
  return y;
}

/**
 * The slim header for reports and registers: small logo, the temple's name, the report's title
 * and a line under it (period, department…). Returns the y to continue from.
 */
export function reportHeader(doc, { title, subtitle } = {}) {
  const t = temple();
  const { left, width } = contentBox(doc);
  const top = doc.page.margins.top - 8;
  const LOGO = 34;
  const hasLogo = logo(doc, left, top, LOGO);
  const x = hasLogo ? left + LOGO + 9 : left;
  const w = width - (x - left);

  doc.font('Body-Bold').fontSize(11).fillColor(PDF_COLORS.text).text(t.nameMr || t.name, x, top - 1, { width: w - 150 });
  doc.font('Body').fontSize(8).fillColor(PDF_COLORS.muted)
    .text(t.nameMr ? t.name : t.address, x, doc.y - 1, { width: w - 150, height: 11, ellipsis: true });
  doc.font('Body').fontSize(7.5).fillColor(PDF_COLORS.muted).text(`Generated ${fmtNow()}`, left + width - 150, top + 2, { width: 150, align: 'right' });

  let y = Math.max(doc.y, top + LOGO) + 5;
  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.2).strokeColor(PDF_COLORS.accent).stroke();
  y += 8;
  if (title) {
    doc.font('Body-Bold').fontSize(14).fillColor(PDF_COLORS.text).text(title, left, y, { width });
    y = doc.y;
  }
  if (subtitle) {
    doc.font('Body').fontSize(9).fillColor(PDF_COLORS.muted).text(subtitle, left, y, { width });
    y = doc.y;
  }
  doc.font('Helvetica').fillColor(PDF_COLORS.text);
  return y + 8;
}

/**
 * On every page: a thin line, the temple's name (and `label`, e.g. a receipt number) on the left,
 * "Page n of m" on the right. Call just before doc.end() — needs bufferPages (createPdf has it).
 */
export function pageFooters(doc, { label = '' } = {}) {
  const t = temple();
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const { left, width } = contentBox(doc);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;   // writing below the margin must not start a new page
    const y = doc.page.height - 26;
    doc.moveTo(left, y - 5).lineTo(left + width, y - 5).lineWidth(0.4).strokeColor(PDF_COLORS.line).stroke();
    doc.font('Body').fontSize(7).fillColor(PDF_COLORS.muted)
      .text([t.name, label].filter(Boolean).join('  ·  '), left, y, { width: width - 90, lineBreak: false })
      .text(`Page ${i - range.start + 1} of ${range.count}`, left + width - 90, y, { width: 90, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

/** Starts a new page when fewer than `needed` points are left; returns the y to draw at. */
export function ensureSpace(doc, y, needed, { onNewPage } = {}) {
  if (y + needed <= doc.page.height - doc.page.margins.bottom - 20) return y;
  doc.addPage();
  const next = doc.page.margins.top;
  return onNewPage ? onNewPage(next) : next;
}
