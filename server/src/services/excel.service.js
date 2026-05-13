import ExcelJS from 'exceljs';

const TYPE_LABELS = {
  STOCK_IN:  'Stock In',
  STOCK_OUT: 'Stock Out',
  TRANSFER:  'Transfer',
  WASTAGE:   'Wastage',
};

const TYPE_FILLS = {
  STOCK_IN:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }, // green-100
  STOCK_OUT: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }, // amber-100
  TRANSFER:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }, // blue-100
  WASTAGE:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }, // red-100
};

function col(letter) { return { letter }; }

function setHeaderRow(sheet, values, fillArgb = 'FFEA580C') {
  const row = sheet.addRow(values);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  row.height = 20;
  return row;
}

export async function generateDailyReportExcel(res, { date, department, transactions, summary }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mangal Grah Mandir';
  wb.created = new Date();

  const dateLabel = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summary_sheet = wb.addWorksheet('Summary');
  summary_sheet.columns = [
    { header: '', key: 'label', width: 20 },
    { header: '', key: 'count', width: 14 },
    { header: '', key: 'qty',   width: 14 },
  ];

  summary_sheet.mergeCells('A1:C1');
  const titleCell = summary_sheet.getCell('A1');
  titleCell.value = 'Mangal Grah Mandir – Daily Stock Report';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFEA580C' } };
  titleCell.alignment = { horizontal: 'center' };
  summary_sheet.getRow(1).height = 26;

  summary_sheet.mergeCells('A2:C2');
  const subCell = summary_sheet.getCell('A2');
  subCell.value = `Date: ${dateLabel}${department ? '  |  Dept: ' + department : ''}`;
  subCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  subCell.alignment = { horizontal: 'center' };

  summary_sheet.addRow([]);

  setHeaderRow(summary_sheet, ['Transaction Type', 'Count', 'Total Quantity']);

  const summaryData = [
    ['Stock In',  summary.STOCK_IN.count,  summary.STOCK_IN.totalQty],
    ['Stock Out', summary.STOCK_OUT.count, summary.STOCK_OUT.totalQty],
    ['Transfers', summary.TRANSFER.count,  summary.TRANSFER.totalQty],
    ['Wastage',   summary.WASTAGE.count,   summary.WASTAGE.totalQty],
    ['TOTAL',     Object.values(summary).reduce((s, v) => s + v.count, 0),
                  Object.values(summary).reduce((s, v) => s + v.totalQty, 0)],
  ];

  summaryData.forEach(([label, count, qty], i) => {
    const row = summary_sheet.addRow([label, count, qty]);
    const isTotal = i === summaryData.length - 1;
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      if (isTotal) { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; }
    });
  });

  // ── Sheet 2: All Transactions ─────────────────────────────────────────────
  const txn_sheet = wb.addWorksheet('Transactions');
  txn_sheet.columns = [
    { key: 'txnNo',     width: 20 },
    { key: 'date',      width: 14 },
    { key: 'type',      width: 14 },
    { key: 'product',   width: 28 },
    { key: 'code',      width: 12 },
    { key: 'from',      width: 20 },
    { key: 'to',        width: 20 },
    { key: 'qty',       width: 10 },
    { key: 'unit',      width: 8 },
    { key: 'rate',      width: 10 },
    { key: 'totalVal',  width: 12 },
    { key: 'ref',       width: 20 },
    { key: 'notes',     width: 24 },
    { key: 'by',        width: 16 },
  ];

  setHeaderRow(txn_sheet, [
    'TXN #', 'Date', 'Type', 'Product', 'Code',
    'From Dept', 'To Dept', 'Qty', 'Unit', 'Rate (₹)', 'Value (₹)',
    'Reference', 'Notes', 'By',
  ]);

  for (const t of transactions) {
    const ref = [t.invoiceNumber, t.supplier?.name, t.donorName].filter(Boolean).join(' / ') || '';
    const row = txn_sheet.addRow([
      t.transactionNumber,
      new Date(t.transactionDate).toLocaleDateString('en-IN'),
      TYPE_LABELS[t.transactionType] || t.transactionType,
      t.product?.name || '',
      t.product?.code || '',
      t.fromDepartment?.name || '',
      t.toDepartment?.name || '',
      t.quantity,
      t.unit?.symbol || '',
      t.rate || 0,
      t.totalValue || 0,
      ref,
      t.notes || '',
      t.createdBy?.name || '',
    ]);

    const fill = TYPE_FILLS[t.transactionType];
    if (fill) {
      row.eachCell((cell) => {
        cell.fill = fill;
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
    }
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(10).alignment = { horizontal: 'right' };
    row.getCell(11).alignment = { horizontal: 'right' };
    row.getCell(11).numFmt = '₹#,##0.00';
    row.getCell(10).numFmt = '₹#,##0.00';
  }

  // Freeze header row
  txn_sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
