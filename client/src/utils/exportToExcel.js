import { saveFile } from './fileSaver.js';

/**
 * Export an array of row objects to an .xlsx file.
 * Dynamically imports `xlsx` to avoid bundling/resolution issues at build time.
 * @param {object[]} rows     - Array of plain objects (one per row)
 * @param {string}   filename - Downloaded filename (without extension)
 * @param {string}   sheet    - Sheet tab name
 */
export async function exportToExcel(rows, filename, sheet = 'Sheet1') {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-width columns
  const colWidths = {};
  for (const row of rows) {
    for (const [key, val] of Object.entries(row)) {
      const len = Math.max(String(key).length, String(val ?? '').length);
      colWidths[key] = Math.max(colWidths[key] || 0, len);
    }
  }
  ws['!cols'] = Object.values(colWidths).map((w) => ({ wch: Math.min(w + 2, 40) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  // XLSX.writeFile can't save inside the mobile apps' WebView, so go through saveFile.
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await saveFile(
    new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filename}.xlsx`,
  );
}
