import ExcelJS from 'exceljs';

const HDR_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } }; // orange
const BORDER    = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

const TYPE_LABELS = { named: 'Named', hundi: 'Hundi', anonymous: 'Anonymous' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

function headerRow(sheet, values) {
  const row = sheet.addRow(values);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HDR_FILL; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = BORDER;
  });
  row.height = 18;
}

export async function generateDonationExcel(res, { donations, from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mangal Grah Mandir'; wb.created = new Date();

  const rangeLabel = from || to
    ? `${from ? fmtDate(from) : 'Beginning'} – ${to ? fmtDate(to) : 'Today'}`
    : 'All Time';

  const totalCash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const totalKind = donations.reduce((s, d) =>
    s + (d.kindItems || []).reduce((ks, k) => ks + (k.estimatedValue || 0), 0), 0);

  // ── Sheet 1: Donations ──────────────────────────────────────────────────────
  const sheet = wb.addWorksheet('Donations');
  sheet.columns = [
    { key: 'no',       width: 18 }, { key: 'date',      width: 14 },
    { key: 'type',     width: 12 }, { key: 'donor',     width: 24 },
    { key: 'pan',      width: 14 }, { key: 'occasion',  width: 20 },
    { key: 'cash',     width: 14 }, { key: 'mode',      width: 14 },
    { key: 'kindQty',  width: 12 }, { key: 'kindVal',   width: 14 },
    { key: 'total',    width: 14 }, { key: 'notes',     width: 24 },
  ];

  sheet.mergeCells('A1:L1');
  const t1 = sheet.getCell('A1');
  t1.value = 'Mangal Grah Mandir – Donation Register';
  t1.font = { bold: true, size: 13, color: { argb: 'FFEA580C' } }; t1.alignment = { horizontal: 'center' };
  sheet.getRow(1).height = 22;

  sheet.mergeCells('A2:L2');
  const t2 = sheet.getCell('A2');
  t2.value = `Period: ${rangeLabel}   |   Generated: ${fmtDate(new Date())}`;
  t2.font = { size: 10, color: { argb: 'FF6B7280' } }; t2.alignment = { horizontal: 'center' };

  sheet.addRow([]);
  headerRow(sheet, ['Receipt No.', 'Date', 'Type', 'Donor', 'PAN', 'Occasion', 'Cash (₹)', 'Payment', 'Kind Items', 'Kind Value (₹)', 'Total (₹)', 'Notes']);

  for (const d of donations) {
    const donor = d.donor?.name || d.donorName || (d.donationType === 'hundi' ? 'Hundi' : 'Anonymous');
    const kindQty  = (d.kindItems || []).length;
    const kindVal  = (d.kindItems || []).reduce((s, k) => s + (k.estimatedValue || 0), 0);
    const total    = (d.cashAmount || 0) + kindVal;

    const row = sheet.addRow([
      d.donationNumber, fmtDate(d.date), TYPE_LABELS[d.donationType] || d.donationType,
      donor, d.panNumber || d.donor?.panNumber || '',
      d.occasion?.name || '', d.cashAmount || 0, d.paymentMode || '',
      kindQty, kindVal, total, d.notes || '',
    ]);
    row.getCell(7).numFmt  = '₹#,##0.00';
    row.getCell(10).numFmt = '₹#,##0.00';
    row.getCell(11).numFmt = '₹#,##0.00';
    row.eachCell((cell) => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
  }

  // Totals row
  const totRow = sheet.addRow(['', '', '', '', '', 'TOTAL', totalCash, '', '', totalKind, totalCash + totalKind, '']);
  totRow.eachCell((cell) => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; });
  [7, 10, 11].forEach((col) => { totRow.getCell(col).numFmt = '₹#,##0.00'; });

  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="donations-${new Date().toISOString().split('T')[0]}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
