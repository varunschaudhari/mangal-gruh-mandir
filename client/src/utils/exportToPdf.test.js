import { describe, expect, it, vi } from 'vitest';

const printHtml = vi.fn();
vi.mock('./printHtml.js', () => ({ printHtml: (...a) => printHtml(...a) }));
vi.mock('./temple.js', () => ({ temple: () => ({ name: 'Mangal Grah Mandir', nameMr: 'श्री मंगळग्रह मंदिर' }) }));

const { exportToPdf, tableHtml } = await import('./exportToPdf.js');

const rows = [
  { Date: '2026-10-17', Product: 'Ghee <pure>', 'Amount (₹)': 1250.5, Pct: '45%' },
  { Date: '2026-10-18', Product: 'Rice', 'Amount (₹)': '', Pct: '50%' },
];

describe('report rows as PDF', () => {
  it('uses the row keys as headings, escapes text and right-aligns number columns', () => {
    const html = tableHtml(rows, { title: 'Stock', subtitle: 'October' });
    expect(html).toContain('<th>Date</th><th>Product</th><th class="n">Amount (₹)</th><th class="n">Pct</th>');
    expect(html).toContain('Ghee &lt;pure&gt;');
    expect(html).toContain('<td class="n">1,250.5</td>');
    expect(html).toContain('<h1 class="rh-title">Stock</h1>');
    expect(html).toContain('2 rows');
    expect(html).toContain('size: A4 portrait');
  });

  it('turns wide tables to landscape', () => {
    const wide = [Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`C${i}`, i]))];
    expect(tableHtml(wide)).toContain('size: A4 landscape');
  });

  it('prints with the file name and page width', async () => {
    await exportToPdf(rows, 'Stock_2026-10-17', 'Stock');
    expect(printHtml).toHaveBeenCalledWith(expect.stringContaining('<table>'), { filename: 'Stock_2026-10-17.pdf', width: 794 });
  });
});
