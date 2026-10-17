import { printHtml } from './printHtml.js';
import { esc, PRINT_FONT, PRINT_HEADER_CSS, reportHeaderHtml } from './printTemplate.js';

// A report's rows as a PDF in the house report style (logo header, saffron rule) — the same rows
// exportToExcel takes, so a screen can offer either; Settings → Reports decides whether Excel is
// offered at all. Phones save a PDF file; a browser opens the print window ("Save as PDF").
//
//   rows      plain objects, one per row; their keys are the column headings
//   filename  without the extension
//   title     the heading on the page (the Excel sheet name works)
//   subtitle  optional line under it (date range, filters)

const WIDE = 7;   // more columns than this → landscape
const NUMBER = /^[-−]?(₹\s?)?[\d,]+(\.\d+)?\s?%?$/;

const isNumeric = (v) => typeof v === 'number' || NUMBER.test(String(v).trim());
const show = (v) => (typeof v === 'number' ? v.toLocaleString('en-IN') : v ?? '');

/** The page as HTML (exported for tests). */
export function tableHtml(rows, { title = '', subtitle = '' } = {}) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const landscape = cols.length > WIDE;
  // Right-align a column when every filled cell in it is a number (amounts, counts, percentages)
  const right = cols.map((c) => rows.some((r) => r[c] !== '' && r[c] != null)
    && rows.every((r) => r[c] === '' || r[c] == null || isNumeric(r[c])));
  const cell = (tag, v, i) => `<${tag}${right[i] ? ' class="n"' : ''}>${esc(show(v))}</${tag}>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
  body { font-family: ${PRINT_FONT}; margin: 12px; color: #111; }
  ${PRINT_HEADER_CSS}
  .rh-title { font-size: 15px; }
  .rh-subtitle { font-size: 10px; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: ${landscape ? 9 : 10}px; }
  th, td { border: 1px solid #d1d5db; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #fff7ed; color: #7c2d12; font-weight: 600; border-color: #fdba74; }
  tr:nth-child(even) td { background: #fafafa; }
  .n { text-align: right; white-space: nowrap; }
  thead { display: table-header-group; }   /* headings repeat on every page */
  tr { page-break-inside: avoid; }
  .count { margin-top: 6px; font-size: 9px; color: #6b7280; }
</style></head><body>
${reportHeaderHtml({ title, subtitle })}
<table><thead><tr>${cols.map((c, i) => cell('th', c, i)).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${cols.map((c, i) => cell('td', r[c], i)).join('')}</tr>`).join('')}</tbody></table>
<p class="count">${rows.length} ${rows.length === 1 ? 'row' : 'rows'}</p>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}

export async function exportToPdf(rows, filename, title = '', { subtitle = '' } = {}) {
  const cols = new Set(rows.flatMap((r) => Object.keys(r)));
  await printHtml(tableHtml(rows, { title, subtitle }), {
    filename: `${filename}.pdf`,
    width: cols.size > WIDE ? 1123 : 794,   // A4 landscape / portrait at 96 dpi
  });
}

/** exportToExcel or exportToPdf, by format ('excel' | 'pdf') — both take the same arguments. */
export async function exportRows(format, rows, filename, title, opts) {
  if (format === 'excel') {
    const { exportToExcel } = await import('./exportToExcel.js');
    return exportToExcel(rows, filename, title);
  }
  return exportToPdf(rows, filename, title, opts);
}
