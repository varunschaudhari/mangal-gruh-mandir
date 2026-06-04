import ExcelJS from 'exceljs';

const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }; // purple
const SECTION_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
const BORDER       = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };

function fDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function headerRow(sheet, values) {
  const row = sheet.addRow(values);
  row.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = BORDER;
  });
  row.height = 20;
}

export async function generateAssetReportExcel(res, { transactions, utilizationData, from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mangal Grah Mandir';
  wb.created = new Date();

  const rangeLabel = from || to
    ? `${from ? fDate(from) : 'Beginning'} – ${to ? fDate(to) : 'Today'}`
    : 'All Time';

  // ── Sheet 1: Transactions ─────────────────────────────────────────────────
  const txnSheet = wb.addWorksheet('Transactions');
  txnSheet.columns = [
    { key: 'ref',        width: 20 },
    { key: 'asset',      width: 24 },
    { key: 'category',   width: 14 },
    { key: 'borrower',   width: 20 },
    { key: 'qty',        width: 8  },
    { key: 'status',     width: 14 },
    { key: 'approvedBy', width: 18 },
    { key: 'borrowedOn', width: 14 },
    { key: 'returnBy',   width: 14 },
    { key: 'returnedOn', width: 14 },
    { key: 'condition',  width: 12 },
    { key: 'lateDays',   width: 10 },
    { key: 'fine',       width: 12 },
    { key: 'fineWaived', width: 12 },
    { key: 'notes',      width: 24 },
    { key: 'loggedBy',   width: 16 },
  ];

  // Title
  txnSheet.mergeCells('A1:P1');
  const t1 = txnSheet.getCell('A1');
  t1.value     = 'Mangal Grah Mandir – Asset Borrow Transactions';
  t1.font      = { bold: true, size: 13, color: { argb: 'FF7C3AED' } };
  t1.alignment = { horizontal: 'center' };
  txnSheet.getRow(1).height = 24;

  txnSheet.mergeCells('A2:P2');
  const t2 = txnSheet.getCell('A2');
  t2.value     = `Period: ${rangeLabel}    |    Generated: ${fDate(new Date())}`;
  t2.font      = { size: 10, color: { argb: 'FF6B7280' } };
  t2.alignment = { horizontal: 'center' };

  txnSheet.addRow([]);

  headerRow(txnSheet, [
    'Ref No.', 'Asset', 'Category', 'Borrower', 'Qty', 'Status',
    'Approved By', 'Borrowed On', 'Return By', 'Returned On',
    'Condition at Return', 'Late Days', 'Fine (₹)', 'Fine Waived', 'Notes', 'Logged By',
  ]);

  for (const t of transactions) {
    const row = txnSheet.addRow([
      t.transactionNumber || '',
      t.asset?.name       || '',
      t.asset?.category   || '',
      t.borrower?.name    || '',
      t.quantityBorrowed,
      STATUS_LABELS[t.status] || t.status,
      t.approvedBy?.name  || '',
      fDate(t.createdAt),
      fDate(t.expectedReturnDate),
      fDate(t.actualReturnDate),
      t.conditionAtReturn || '',
      t.lateDays || 0,
      t.fineApplied ? t.fineAmount : '',
      t.fineWaived  ? 'Yes'        : '',
      t.notes       || '',
      t.createdBy?.name || '',
    ]);

    if (t.status === 'overdue')    row.getCell(6).font = { color: { argb: 'FFDC2626' }, bold: true };
    if (t.conditionAtReturn === 'damaged') row.getCell(11).font = { color: { argb: 'FFDC2626' } };
    if (t.fineApplied) row.getCell(13).numFmt = '₹#,##0.00';

    row.eachCell((cell) => {
      cell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      cell.alignment = { vertical: 'middle' };
    });
  }
  txnSheet.views = [{ state: 'frozen', ySplit: 4 }];

  // ── Sheet 2: Utilization ──────────────────────────────────────────────────
  const utilSheet = wb.addWorksheet('Asset Utilization');
  utilSheet.columns = [
    { key: 'asset',       width: 24 },
    { key: 'category',    width: 14 },
    { key: 'borrows',     width: 14 },
    { key: 'avgDuration', width: 16 },
    { key: 'damages',     width: 12 },
    { key: 'lateDays',    width: 12 },
  ];

  utilSheet.mergeCells('A1:F1');
  const u1 = utilSheet.getCell('A1');
  u1.value     = 'Asset Utilization Summary';
  u1.font      = { bold: true, size: 13, color: { argb: 'FF7C3AED' } };
  u1.alignment = { horizontal: 'center' };
  utilSheet.getRow(1).height = 24;
  utilSheet.addRow([]);

  headerRow(utilSheet, ['Asset', 'Category', 'Total Borrows', 'Avg Duration (days)', 'Damages', 'Total Late Days']);

  for (const u of utilizationData) {
    const row = utilSheet.addRow([u.assetName, u.category, u.totalBorrows, u.avgDurationDays ?? 0, u.damageCount, u.totalLateDays]);
    row.eachCell((cell) => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }; });
    if (u.damageCount > 0) row.getCell(5).font = { color: { argb: 'FFDC2626' } };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="asset-report-${new Date().toISOString().split('T')[0]}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
