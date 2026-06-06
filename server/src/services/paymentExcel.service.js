import ExcelJS from 'exceljs';

const PM_LABELS     = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };
const STATUS_LABELS = { pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected' };

const STATUS_FILLS = {
  approved:         { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
  pending_approval: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
  rejected:         { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
};

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function setHeaderRow(sheet, values) {
  const row = sheet.addRow(values);
  row.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  row.height = 20;
}

export async function generatePaymentExcel(res, { payments, from, to }) {
  const wb  = new ExcelJS.Workbook();
  wb.creator = 'Mangal Grah Mandir';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Payments');

  sheet.columns = [
    { key: 'paymentNumber', width: 20 },
    { key: 'supplier',      width: 24 },
    { key: 'paymentDate',   width: 14 },
    { key: 'paymentMode',   width: 12 },
    { key: 'totalAmount',   width: 16 },
    { key: 'status',        width: 14 },
    { key: 'invoices',      width: 32 },
    { key: 'referenceNo',   width: 18 },
    { key: 'bankName',      width: 20 },
    { key: 'submittedBy',   width: 18 },
    { key: 'approvedBy',    width: 18 },
    { key: 'approvalNote',  width: 30 },
    { key: 'notes',         width: 30 },
  ];

  // Title
  sheet.mergeCells('A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Mangal Grah Mandir – Payment Register';
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FFEA580C' } };
  titleCell.alignment = { horizontal: 'center' };
  sheet.getRow(1).height = 28;

  // Subtitle
  sheet.mergeCells('A2:M2');
  const subCell = sheet.getCell('A2');
  const fromLabel = from ? fmtDate(new Date(from)) : '';
  const toLabel   = to   ? fmtDate(new Date(to))   : '';
  subCell.value = fromLabel && toLabel
    ? `Period: ${fromLabel} – ${toLabel}`
    : fromLabel ? `From: ${fromLabel}` : 'All dates';
  subCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  subCell.alignment = { horizontal: 'center' };
  sheet.getRow(2).height = 16;

  sheet.addRow([]);

  setHeaderRow(sheet, [
    'Voucher No.', 'Supplier', 'Date', 'Mode', 'Amount (₹)', 'Status',
    'Invoices', 'Reference No.', 'Bank', 'Submitted By', 'Approved By', 'Approval Note', 'Notes',
  ]);

  let approvedTotal = 0;

  for (const p of payments) {
    const invoicesText = p.invoices?.length
      ? p.invoices.map((inv) =>
          `${inv.invoiceNumber || 'Advance'}: ₹${Number(inv.paidAmount).toLocaleString('en-IN')}`
        ).join('\n')
      : '—';

    const row = sheet.addRow({
      paymentNumber: p.paymentNumber || '—',
      supplier:      p.supplier?.name || '—',
      paymentDate:   fmtDate(p.paymentDate),
      paymentMode:   PM_LABELS[p.paymentMode] || p.paymentMode || '—',
      totalAmount:   p.totalAmount || 0,
      status:        STATUS_LABELS[p.status] || p.status,
      invoices:      invoicesText,
      referenceNo:   p.referenceNumber || '—',
      bankName:      p.bankName || '—',
      submittedBy:   p.createdBy?.name || '—',
      approvedBy:    p.approvedBy?.name || '—',
      approvalNote:  p.approvalNote || '—',
      notes:         p.notes || '—',
    });

    const fill = STATUS_FILLS[p.status];
    if (fill) row.eachCell((cell) => { cell.fill = fill; });

    const amtCell = row.getCell('totalAmount');
    amtCell.alignment = { horizontal: 'right' };
    amtCell.numFmt    = '₹#,##0.00';

    if (p.invoices?.length > 1) row.height = Math.max(20, p.invoices.length * 16);

    if (p.status === 'approved') approvedTotal += p.totalAmount || 0;
  }

  // Total row
  const totalRow = sheet.addRow({
    paymentNumber: `TOTAL APPROVED (${payments.filter((p) => p.status === 'approved').length} payments)`,
    totalAmount:   approvedTotal,
  });
  totalRow.height = 20;
  totalRow.getCell('paymentNumber').font  = { bold: true };
  const totalAmtCell = totalRow.getCell('totalAmount');
  totalAmtCell.font      = { bold: true };
  totalAmtCell.numFmt    = '₹#,##0.00';
  totalAmtCell.alignment = { horizontal: 'right' };
  totalAmtCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
  totalAmtCell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };

  const filename = `payments-${from ? from.slice(0, 10) : 'all'}${to ? '_to_' + to.slice(0, 10) : ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}
