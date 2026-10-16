import { printHtml } from './printHtml.js';
import { temple } from './temple.js';
import { PRINT_FONT, PRINT_HEADER_CSS, esc, letterheadHtml } from './printTemplate.js';
import { amountInWords } from './payslip.js';

const MODE = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank_transfer: 'Bank transfer' };
const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

export function printDonationReceipt(donation) {
  const {
    donationNumber, donationType, date, donor, donorName, donorPhone,
    panNumber, occasion, cashAmount, paymentMode, paymentRef, kindItems = [], notes,
  } = donation;

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const hundi        = !donor?.name && !donorName && donationType === 'hundi';
  const displayDonor = donor?.name || donorName || (hundi ? 'Hundi Collection' : 'Anonymous');
  const pan          = panNumber || donor?.panNumber || '';
  const phone        = donorPhone || donor?.phone || '';

  const kindRows = kindItems.map((item) =>
    `<tr>
      <td>${esc(item.product?.name || item.product)}</td>
      <td class="c">${esc(item.quantity)} ${esc(item.unit?.symbol || '')}</td>
      <td class="r">${inr(item.estimatedValue)}</td>
    </tr>`
  ).join('');

  const totalValue = (Number(cashAmount) || 0) +
    kindItems.reduce((s, i) => s + (Number(i.estimatedValue) || 0), 0);

  const row = (label, value, style = '') => (value
    ? `<tr><td class="lbl">${label}</td><td class="val"${style ? ` style="${style}"` : ''}>${esc(value)}</td></tr>`
    : '');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Donation Receipt ${esc(donationNumber)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: ${PRINT_FONT}; font-size: 13px; color: #1f2937; padding: 24px; max-width: 720px; margin: 0 auto; }
  ${PRINT_HEADER_CSS}
  .details { width:100%; border-collapse:collapse; }
  .details td { padding:6px 0; border-bottom:1px dashed #e5e7eb; vertical-align:top; }
  .details .lbl { color:#6b7280; width:36%; padding-right:12px; }
  .details .val { font-weight:600; }
  h3 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#c2410c; margin:16px 0 6px; }
  .items { width:100%; border-collapse:collapse; }
  .items th { background:#fff7ed; color:#7c2d12; padding:6px 8px; text-align:left; font-size:11.5px; border:1px solid #fdba74; }
  .items td { padding:6px 8px; border:1px solid #e5e7eb; font-size:12px; }
  .items .c { text-align:center; } .items .r { text-align:right; }
  .amount { margin-top:16px; padding:12px 16px; border:1.5px solid #c2410c; border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:16px; }
  .amount b { font-size:22px; color:#c2410c; white-space:nowrap; } .amount span { font-size:12px; color:#4b5563; }
  .note { border:1px solid #e5e7eb; border-radius:4px; padding:8px 10px; font-size:12px; color:#4b5563; margin-top:12px; }
  .tax-note { font-size:11px; color:#4b5563; margin-top:12px; }
  .sig-area { display:flex; justify-content:space-between; margin-top:44px; gap:40px; }
  .sig-box  { text-align:center; flex:1; font-size:11.5px; }
  .sig-line { border-top:1px solid #6b7280; margin-bottom:4px; }
  .sig-label { color:#4b5563; }
  .footer { text-align:center; margin-top:22px; font-size:11px; color:#9ca3af; border-top:1px dashed #d1d5db; padding-top:8px; }
  @media print { body { padding:0; } }
</style></head><body>

${letterheadHtml({ title: 'Donation Receipt', number: donationNumber, numberLabel: 'Receipt No.', date: fmtDate(date) })}

<table class="details">
  ${hundi ? row('Received as', 'Hundi collection') : row(donor?.name || donorName ? 'Received with thanks from' : 'Donor', displayDonor)}
  ${row('Phone', phone)}
  ${row('PAN', pan)}
  ${row('Occasion / Purpose', occasion?.name)}
  ${Number(cashAmount) > 0 ? row('Cash donation', inr(cashAmount)) : ''}
  ${Number(cashAmount) > 0 ? row('Payment mode', MODE[paymentMode] || paymentMode || 'Cash') : ''}
  ${row('Reference', paymentRef)}
</table>

${kindItems.length > 0 ? `
<h3>Kind donations (Vastu Daan)</h3>
<table class="items">
  <tr><th>Item</th><th class="c">Quantity</th><th class="r">Est. value</th></tr>
  ${kindRows}
</table>` : ''}

<div class="amount"><span>Total donation value<br>Rupees ${esc(amountInWords(totalValue))} only</span><b>${inr(totalValue)}</b></div>

${notes ? `<div class="note">${esc(notes)}</div>` : ''}

${pan ? `<p class="tax-note">
  This donation may be eligible for tax exemption under Section 80G of the Income Tax Act, 1961,
  subject to the trust's registration status. Please verify with your tax advisor.
</p>` : ''}

<div class="sig-area">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Donor signature${hundi ? '' : ` (${esc(displayDonor)})`}</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Authorised signatory · For ${esc(temple().legalName || temple().name)}</div>
  </div>
</div>

<div class="footer">Thank you for your generous donation · Printed on ${fmtDate(new Date())}</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  return printHtml(html, { filename: `Donation-${donationNumber || 'receipt'}.pdf` });
}
