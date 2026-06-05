export function printDonationReceipt(donation) {
  const {
    donationNumber, donationType, date, donor, donorName, donorPhone,
    panNumber, occasion, cashAmount, paymentMode, paymentRef, kindItems = [], notes,
  } = donation;

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const displayDonor = donor?.name || donorName || (donationType === 'hundi' ? 'Hundi Collection' : 'Anonymous');
  const pan          = panNumber || donor?.panNumber || '';
  const phone        = donorPhone || donor?.phone || '';

  const kindRows = kindItems.map((item) =>
    `<tr>
      <td>${item.product?.name || item.product}</td>
      <td style="text-align:center">${item.quantity} ${item.unit?.symbol || ''}</td>
      <td style="text-align:right">₹${(item.estimatedValue || 0).toLocaleString('en-IN')}</td>
    </tr>`
  ).join('');

  const totalValue = (Number(cashAmount) || 0) +
    kindItems.reduce((s, i) => s + (Number(i.estimatedValue) || 0), 0);

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Donation Receipt ${donationNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; max-width: 580px; margin: 0 auto; }
  .header { text-align:center; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; }
  .temple  { font-size:16px; font-weight:bold; }
  .subtitle { font-size:11px; color:#555; margin-top:2px; }
  .receipt-title { font-size:13px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; margin-top:6px; }
  .ref { font-size:11px; color:#777; font-family:monospace; margin-top:2px; }
  .section { margin-bottom:12px; }
  .row { display:flex; justify-content:space-between; margin-bottom:4px; }
  .lbl { color:#555; } .val { font-weight:bold; }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th { background:#f3f3f3; padding:5px 8px; text-align:left; font-size:11px; border:1px solid #ddd; }
  td { padding:5px 8px; border:1px solid #eee; font-size:11px; }
  .total-row { font-weight:bold; background:#f9f9f9; }
  .sig-area { display:flex; justify-content:space-between; margin-top:28px; }
  .sig-box  { text-align:center; width:44%; }
  .sig-line { border-top:1px solid #111; height:30px; margin-bottom:4px; }
  .sig-label { font-size:10px; color:#555; }
  .footer { text-align:center; margin-top:16px; font-size:10px; color:#aaa; border-top:1px dashed #ccc; padding-top:8px; }
  .note { background:#f9f9f9; border:1px solid #eee; border-radius:4px; padding:6px 10px; font-size:11px; color:#555; margin-top:6px; }
  .tax-note { font-size:10px; color:#555; margin-top:10px; border:1px solid #ddd; padding:6px; border-radius:4px; }
  @media print { body { padding:10px; } }
</style></head><body>

<div class="header">
  <div class="temple">🕉️ Mangal Grah Mandir, Amalner</div>
  <div class="subtitle">Dist. Jalgaon, Maharashtra</div>
  <div class="receipt-title">Donation Receipt</div>
  <div class="ref">${donationNumber}</div>
</div>

<div class="section">
  <div class="row"><span class="lbl">Date</span><span class="val">${fmtDate(date)}</span></div>
  ${displayDonor !== 'Hundi Collection' ? `<div class="row"><span class="lbl">Donor Name</span><span class="val">${displayDonor}</span></div>` : ''}
  ${phone ? `<div class="row"><span class="lbl">Phone</span><span class="val">${phone}</span></div>` : ''}
  ${pan   ? `<div class="row"><span class="lbl">PAN Number</span><span class="val">${pan}</span></div>` : ''}
  ${occasion?.name ? `<div class="row"><span class="lbl">Occasion / Purpose</span><span class="val">${occasion.name}</span></div>` : ''}
</div>

${Number(cashAmount) > 0 ? `
<div class="section">
  <div class="row"><span class="lbl">Cash Donation</span><span class="val">₹${Number(cashAmount).toLocaleString('en-IN')}</span></div>
  <div class="row"><span class="lbl">Payment Mode</span><span class="val" style="text-transform:capitalize">${paymentMode || 'cash'}</span></div>
  ${paymentRef ? `<div class="row"><span class="lbl">Reference</span><span class="val">${paymentRef}</span></div>` : ''}
</div>` : ''}

${kindItems.length > 0 ? `
<div class="section">
  <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">Kind Donations (Vastu Daan)</div>
  <table>
    <tr><th>Item</th><th style="text-align:center">Quantity</th><th style="text-align:right">Est. Value</th></tr>
    ${kindRows}
  </table>
</div>` : ''}

<div class="section">
  <div class="row total-row" style="border-top:1px solid #ddd;padding-top:6px;margin-top:4px;">
    <span>Total Donation Value</span>
    <span>₹${totalValue.toLocaleString('en-IN')}</span>
  </div>
</div>

${notes ? `<div class="note">${notes}</div>` : ''}

${pan ? `<div class="tax-note">
  This donation may be eligible for tax exemption under Section 80G of the Income Tax Act, 1961.
  Subject to temple's registration status. Please verify with your tax advisor.
</div>` : ''}

<div class="sig-area">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Donor Signature</div>
    ${displayDonor !== 'Hundi Collection' ? `<div class="sig-label">(${displayDonor})</div>` : ''}
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">Authorised Signatory</div>
    <div class="sig-label">Mangal Grah Mandir, Amalner</div>
  </div>
</div>

<div class="footer">
  Thank you for your generous donation 🙏 &nbsp;·&nbsp; Generated on ${fmtDate(new Date())}
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=680,height=800');
  if (win) { win.document.write(html); win.document.close(); }
}
