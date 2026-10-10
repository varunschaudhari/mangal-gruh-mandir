// Shared bits for the booking register, day sheet and reports (dates, money, labels).
import { localDateStr } from '../../utils/formatters.js';

/** 'YYYY-MM-DD' → local Date at midnight (never via UTC). */
export const parseDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (key, n) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
};

export const MODES = ['cash', 'upi', 'card', 'online'];
export const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' };
export const MODE_BADGE = { cash: 'green', upi: 'purple', card: 'blue', online: 'orange' };

/** Whole rupees, Indian grouping: 125000 → ₹1,25,000 */
export const rupees = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
/** Short form for chart axes: 125000 → ₹1.3L, 4500 → ₹4.5k */
export const rupeesShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${v}`;
};

export const fmtDay = (key, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  (key ? parseDay(key).toLocaleDateString('en-IN', opts) : '—');
export const fmtDateTime = (d) => (d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

/** "10 Oct 2026" or "01 Oct – 31 Oct 2026" or "01 Apr 2026 – 31 Mar 2027". */
export function fmtRange(from, to) {
  if (!from && !to) return '';
  if (from && to && from === to) return fmtDay(from);
  if (from && to && from.slice(0, 4) === to.slice(0, 4)) {
    return `${fmtDay(from, { day: '2-digit', month: 'short' })} – ${fmtDay(to)}`;
  }
  return `${from ? fmtDay(from) : '…'} – ${to ? fmtDay(to) : '…'}`;
}

/** Date-range presets. `all` = no dates. Weeks start on Monday; the financial year on 1 April. */
export function presetRange(key, today = localDateStr()) {
  const [y, m] = today.split('-').map(Number);
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'tomorrow': { const d = addDays(today, 1); return { from: d, to: d }; }
    case 'yesterday': { const d = addDays(today, -1); return { from: d, to: d }; }
    case 'week': {
      const monday = addDays(today, -((parseDay(today).getDay() + 6) % 7));
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: localDateStr(new Date(y, m, 0)) };
    case 'lastMonth': return { from: localDateStr(new Date(y, m - 2, 1)), to: localDateStr(new Date(y, m - 1, 0)) };
    case 'fy': { const start = m >= 4 ? y : y - 1; return { from: `${start}-04-01`, to: `${start + 1}-03-31` }; }
    case 'last12': return { from: localDateStr(new Date(y, m - 12, 1)), to: today };
    case 'all': return { from: '', to: '' };
    default: return null;
  }
}

/** Seva name in the reader's language when the seva type has a Marathi name. */
export const sevaLabel = (lang, sevaById, id, fallback) => {
  const s = sevaById?.get?.(String(id));
  return (lang === 'mr' && s?.nameMr) || s?.name || fallback || '';
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PRINT_FONT = '"Nirmala UI", "Mangal", "Noto Sans Devanagari", "Noto Sans", Arial, sans-serif';

/** "1 booking" / "45 bookings" and "1 person" / "3 people" (t = the useT() function). */
export const nBookings = (t, n) => (n === 1 ? t('1 booking') : t('{n} bookings', { n: Number(n || 0).toLocaleString('en-IN') }));
export const nPeople = (t, n) => (n === 1 ? t('1 person') : t('{n} people', { n: Number(n || 0).toLocaleString('en-IN') }));
