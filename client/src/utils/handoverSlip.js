import { printHtml } from './printHtml.js';
import { temple } from './temple.js';
import { PRINT_FONT, PRINT_HEADER_CSS, esc, letterheadHtml } from './printTemplate.js';

// The asset handover slip, signed when a borrowed asset is collected (borrow request and
// borrow group pages).

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function printHandoverSlip(txn) {
  const {
    transactionNumber, asset, borrower, externalBorrower, borrowerType, quantityBorrowed,
    expectedReturnDate, checkedOutAt, conditionAtCheckout, approvedBy, createdBy, notes,
  } = txn;
  const borrowerName = borrowerType === 'external' ? (externalBorrower?.name || '—') : (borrower?.name || '—');
  const qty = Number(quantityBorrowed) || 1;
  const row = (label, value, style = '') => (value
    ? `<div class="row"><span class="lbl">${label}</span><span class="val"${style ? ` style="${style}"` : ''}>${esc(value)}</span></div>`
    : '');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Handover Slip — ${esc(transactionNumber || '')}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${PRINT_FONT}; font-size: 12.5px; color: #1f2937; padding: 24px; max-width: 720px; margin: 0 auto; }
    ${PRINT_HEADER_CSS}
    .section { margin-bottom: 14px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #c2410c; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px; }
    .row    { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; line-height: 1.4; }
    .lbl    { color: #6b7280; flex: 0 0 42%; }
    .val    { font-weight: 600; text-align: right; flex: 1; }
    .terms  { font-size: 11.5px; color: #4b5563; line-height: 1.6; }
    .note-box { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 10px; font-size: 11.5px; color: #4b5563; }
    .sig-area { display: flex; justify-content: space-between; margin-top: 44px; gap: 40px; }
    .sig-box  { flex: 1; text-align: center; }
    .sig-line { border-top: 1px solid #6b7280; margin-bottom: 6px; }
    .sig-name { font-size: 11.5px; font-weight: 600; }
    .sig-lbl  { font-size: 10.5px; color: #6b7280; margin-top: 2px; }
    .footer   { margin-top: 22px; text-align: center; font-size: 10.5px; color: #9ca3af; border-top: 1px dashed #d1d5db; padding-top: 8px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${letterheadHtml({ title: 'Asset Handover Slip', number: transactionNumber || '—', numberLabel: 'Ref.', date: fmt(checkedOutAt || new Date()) })}

  <div class="section">
    <div class="section-title">Asset details</div>
    ${row('Asset name', asset?.name || '—')}
    ${row('Category', asset?.category)}
    ${row('Quantity', `${qty} unit${qty > 1 ? 's' : ''}`)}
  </div>

  <div class="section">
    <div class="section-title">Borrower details</div>
    ${row('Borrower', borrowerName)}
    ${borrowerType === 'external' ? row('Phone', externalBorrower?.phone) : ''}
    ${row('Expected return date', fmt(expectedReturnDate))}
    ${row('Approved by (trustee)', approvedBy?.name || '—')}
    ${checkedOutAt ? row('Date of collection', fmt(checkedOutAt)) : ''}
    ${row('Condition at handover', conditionAtCheckout, 'text-transform:capitalize')}
    ${row('Issued by (help desk)', createdBy?.name)}
  </div>

  ${notes ? `<div class="section">
    <div class="section-title">Notes</div>
    <div class="note-box">${esc(notes)}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Terms</div>
    <div class="terms">
      • The borrower is responsible for the safe custody of the above asset(s) until returned.<br/>
      • Any damage or loss must be reported immediately to the Help Desk.<br/>
      • The asset must be returned by <strong>${fmt(expectedReturnDate)}</strong>.${asset?.finePerDay > 0 ? ` A fine of ₹${esc(asset.finePerDay)}/day applies for late returns.` : ''}
    </div>
  </div>

  <div class="sig-area">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">${esc(borrowerName)}</div>
      <div class="sig-lbl">Borrower signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">${esc(createdBy?.name || 'Help Desk')}</div>
      <div class="sig-lbl">Issued by (help desk)</div>
    </div>
  </div>

  <div class="footer">Printed on ${fmt(new Date())} &nbsp;·&nbsp; ${esc(temple().name)} · Asset Management</div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  return printHtml(html, { filename: `Handover-Slip-${transactionNumber || 'asset'}.pdf` });
}
