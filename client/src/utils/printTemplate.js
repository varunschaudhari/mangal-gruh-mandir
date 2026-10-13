import { temple } from './temple.js';

// One look for everything printed from the app (the server's PDFs use the same, see
// server/src/services/pdfLayout.js). Receipts, vouchers, slips and payslips get the full
// letterhead — logo, the temple's name in Marathi and English, address, contacts, registration
// numbers; reports and registers get a slim header. Saffron is only an accent (rules, titles) so
// it prints clearly on a black & white office printer.
//
// The logo goes in as LOGO_TOKEN and is swapped for the image itself (a data URL) just before
// printing — printHtml() does that — so it shows in the print window, in the PDF made on the
// phone and offline.

export const LOGO_TOKEN = '__TEMPLE_LOGO__';
export const PRINT_FONT = '"Nirmala UI", "Mukta", "Noto Sans Devanagari", "Mangal", Arial, sans-serif';
export const ACCENT = '#c2410c';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const logoUrl = () => {
  try { return new URL('/logo.png', window.location.origin).href; } catch { return '/logo.png'; }
};

let logoPromise = null;
/** The logo as a data URL ('' if it can't be loaded). Loaded once. */
export function loadLogo() {
  logoPromise ||= fetch(logoUrl())
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('no logo'))))
    .then((blob) => new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    }))
    .catch(() => { logoPromise = null; return ''; });
  return logoPromise;
}

/** Puts the logo into a print template (falls back to the logo's web address). */
export async function withLogo(html) {
  if (!html.includes(LOGO_TOKEN)) return html;
  const src = (await loadLogo()) || logoUrl();
  return html.split(LOGO_TOKEN).join(src);
}

/** Styles for the letterhead and the report header — put inside the template's <style>. */
export const PRINT_HEADER_CSS = `
  .lh { display: flex; align-items: center; gap: 14px; }
  .lh-logo { width: 66px; height: 66px; object-fit: contain; flex: none; }
  .lh-mr { font-size: 21px; font-weight: 700; color: #1f2937; line-height: 1.25; }
  .lh-en { font-size: 13px; font-weight: 600; color: #1f2937; line-height: 1.3; }
  .lh-sub { font-size: 11px; color: #6b7280; line-height: 1.45; }
  .lh-sub .nw { white-space: nowrap; }
  .lh-rule { border-top: 2px solid ${ACCENT}; border-bottom: 0.75px solid ${ACCENT}; height: 3px; margin: 10px 0 12px; }
  .doc-title { text-align: center; font-size: 15px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${ACCENT}; margin: 0; }
  .doc-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; font-size: 12px; color: #1f2937; margin: 6px 0 14px; }
  .rh { display: flex; align-items: center; gap: 10px; }
  .rh-logo { width: 40px; height: 40px; object-fit: contain; flex: none; }
  .rh-name { font-size: 15px; font-weight: 700; color: #1f2937; line-height: 1.2; }
  .rh-sub { font-size: 10.5px; color: #6b7280; }
  .rh-right { margin-left: auto; text-align: right; font-size: 10px; color: #6b7280; }
  .rh-rule { border-top: 1.5px solid ${ACCENT}; margin: 6px 0 8px; }
  .rh-title { font-size: 17px; font-weight: 700; color: #1f2937; margin: 0; }
  .rh-subtitle { font-size: 11.5px; color: #6b7280; margin: 1px 0 10px; }
`;

// Items on a line break between each other, never inside one
const join = (items) => items.filter(Boolean).map((i) => `<span class="nw">${i}</span>`).join(' &nbsp;·&nbsp; ');
const contactLine = (t) => join([t.phone && `Phone ${esc(t.phone)}`, esc(t.email), esc(t.website)]);
const registrationLine = (t) => join([
  t.trustReg && `Trust Reg. No. ${esc(t.trustReg)}`,
  t.pan && `PAN ${esc(t.pan)}`,
  t.reg80G && `80G ${esc(t.reg80G)}`,
]);

/**
 * Full letterhead (receipts, vouchers, slips, payslips), then the document's title and its
 * number / date. All values are plain text (escaped here). `info` overrides the temple details
 * (the public receipt page passes the ones that came with the receipt).
 */
export function letterheadHtml({ title, number, date, numberLabel = 'No.', dateLabel = 'Date', info } = {}) {
  const t = { ...temple(), ...info };
  const lines = [esc(t.address), contactLine(t), registrationLine(t)].filter(Boolean);
  return `<header class="lh">
  <img class="lh-logo" src="${LOGO_TOKEN}" alt="">
  <div>
    <div class="lh-mr">${esc(t.nameMr || t.name)}</div>
    ${t.nameMr ? `<div class="lh-en">${esc(t.name)}</div>` : ''}
    ${lines.map((l) => `<div class="lh-sub">${l}</div>`).join('')}
  </div>
</header>
<div class="lh-rule"></div>
${title ? `<h2 class="doc-title">${esc(title)}</h2>` : ''}
${number || date ? `<div class="doc-meta"><span>${number ? `${esc(numberLabel)} <b>${esc(number)}</b>` : ''}</span><span>${date ? `${esc(dateLabel)} <b>${esc(date)}</b>` : ''}</span></div>` : ''}`;
}

/**
 * Slim header for reports and registers: small logo, temple name, title and a line under it.
 * `right` is HTML (escape it); `printed` replaces the "Printed <time>" text (e.g. translated).
 */
export function reportHeaderHtml({ title, subtitle, right, printed } = {}) {
  const t = temple();
  const stamp = printed ?? `Printed ${new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  return `<header class="rh">
  <img class="rh-logo" src="${LOGO_TOKEN}" alt="">
  <div>
    <div class="rh-name">${esc(t.nameMr || t.name)}</div>
    ${t.nameMr ? `<div class="rh-sub">${esc(t.name)}</div>` : ''}
  </div>
  <div class="rh-right">${right ? `${right}<br>` : ''}${esc(stamp)}</div>
</header>
<div class="rh-rule"></div>
${title ? `<h1 class="rh-title">${esc(title)}</h1>` : ''}
${subtitle ? `<p class="rh-subtitle">${esc(subtitle)}</p>` : ''}`;
}
