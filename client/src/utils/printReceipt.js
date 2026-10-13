import { printHtml } from './printHtml.js';
import { temple } from './temple.js';
import { PRINT_FONT, PRINT_HEADER_CSS, esc, letterheadHtml } from './printTemplate.js';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In', STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer', WASTAGE: 'Wastage',
  OPENING_BALANCE: 'Opening Balance', ADJUSTMENT: 'Adjustment',
};

const TYPE_COLORS = {
  STOCK_IN: '#16a34a', STOCK_OUT: '#d97706',
  TRANSFER: '#2563eb', WASTAGE: '#dc2626',
  OPENING_BALANCE: '#6b7280', ADJUSTMENT: '#6b7280',
};

function row(label, value) {
  if (!value) return '';
  return `<tr><td>${label}</td><td>${esc(value)}</td></tr>`;
}

export function printTransactionReceipt(txn) {
  const color = TYPE_COLORS[txn.transactionType] || '#6b7280';
  const typeLabel = TYPE_LABELS[txn.transactionType] || txn.transactionType;
  const date = txn.transactionDate
    ? new Date(txn.transactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const time = txn.transactionDate
    ? new Date(txn.transactionDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Stock Voucher — ${esc(txn.transactionNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${PRINT_FONT};
      font-size: 13px;
      color: #1f2937;
      padding: 24px;
      max-width: 560px;
      margin: 0 auto;
    }
    ${PRINT_HEADER_CSS}
    .lh-logo { width: 54px; height: 54px; } .lh-mr { font-size: 18px; } .lh-en { font-size: 12px; } .lh-sub { font-size: 10px; }

    /* ── Type ── */
    .type-badge {
      display: inline-block; padding: 2px 12px; border-radius: 20px;
      font-size: 12px; font-weight: 700; color: ${color};
      border: 1.5px solid ${color}; margin-bottom: 12px;
    }

    /* ── Product highlight ── */
    .product-box {
      border: 1px solid #e5e7eb;
      border-left: 4px solid ${color};
      border-radius: 6px; padding: 12px 16px; margin-bottom: 14px;
    }
    .product-name { font-size: 16px; font-weight: 700; }
    .product-code { font-size: 11px; color: #9ca3af; font-family: monospace; margin-top: 2px; }
    .product-qty  { font-size: 26px; font-weight: 800; color: ${color}; margin-top: 6px; }
    .product-unit { font-size: 13px; font-weight: 400; color: #6b7280; margin-left: 4px; }

    /* ── Details table ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    td { padding: 5px 0; vertical-align: top; }
    td:first-child { color: #6b7280; width: 44%; font-size: 12px; }
    td:last-child  { font-weight: 600; font-size: 12px; }
    tr + tr td { border-top: 1px solid #f3f4f6; }

    /* ── Notes ── */
    .notes { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 12px; color: #4b5563; }

    /* ── Signatures ── */
    .sig-row { display: flex; gap: 14px; align-items: flex-end; margin-top: 8px; }
    .sig-box  { flex: 1; border-top: 1px solid #9ca3af; padding-top: 5px; text-align: center; font-size: 10px; color: #6b7280; }

    /* ── Stamp ── */
    .stamp-box {
      width: 74px; height: 74px; flex: none; border: 2px dashed #d1d5db;
      border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 10px; color: #9ca3af;
    }

    /* ── Voided watermark ── */
    .voided-watermark {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 72px; font-weight: 900; color: rgba(220,38,38,0.12);
      pointer-events: none; z-index: 0; letter-spacing: 4px;
    }

    /* ── Footer ── */
    .footer { text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 8px; margin-top: 12px; }

    @media print {
      body { padding: 16px; }
      @page { margin: 10mm; size: A5; }
    }
  </style>
</head>
<body>
  ${txn.isVoided ? '<div class="voided-watermark">VOIDED</div>' : ''}

  ${letterheadHtml({ title: 'Stock Voucher', number: txn.transactionNumber, date: [date, time].filter(Boolean).join(', ') })}

  <div><span class="type-badge">${esc(typeLabel)}</span></div>

  <div class="product-box">
    <div class="product-name">${esc(txn.product?.name || '—')}</div>
    <div class="product-code">${esc(txn.product?.code || '')}</div>
    <div class="product-qty">
      ${esc(txn.quantity)}<span class="product-unit">${esc(txn.unit?.symbol || '')}</span>
    </div>
  </div>

  <table>
    ${row('From Department', txn.fromDepartment?.name)}
    ${row('To Department', txn.toDepartment?.name)}
    ${row('Supplier', txn.supplier?.name)}
    ${row('Invoice No.', txn.invoiceNumber)}
    ${row('Donor', txn.donorName)}
    ${row('Rate', txn.rate ? '₹' + txn.rate + ' per ' + (txn.unit?.symbol || 'unit') : '')}
    ${row('Total Value', txn.totalValue ? '₹' + txn.totalValue.toFixed(2) : '')}
    ${row('Purpose', txn.stockOutPurpose)}
    ${row('Issued To', txn.issuedTo)}
    ${row('Wastage Reason', txn.wastageReason)}
    ${row('Recorded By', txn.createdBy?.name)}
  </table>

  ${txn.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(txn.notes)}</div>` : ''}

  <div class="sig-row">
    <div class="sig-box">Prepared By<br/>${esc(txn.createdBy?.name || '')}&nbsp;</div>
    <div class="sig-box">Checked By<br/>&nbsp;</div>
    <div class="sig-box">Authorized By<br/>&nbsp;</div>
    <div class="stamp-box">Stamp</div>
  </div>

  <div class="footer">
    Computer-generated voucher · ${esc(temple().name)} · Stock Management
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  return printHtml(html, {
    filename: `Stock-Voucher-${txn.transactionNumber || typeLabel}.pdf`,
    features: 'width=620,height=820',
  });
}
