// Pure helpers for the counter shift close and the cash handover register (see shiftUtils.test.js).
// The sums match the server (services/booking/rules.js), so the screen shows what will be saved.

export const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

/** A count typed into a box → whole number ≥ 0 ('' and junk count as 0). */
export const toCount = (v) => Math.max(0, Math.floor(Number(v) || 0));

const countOf = (counts, d) => toCount(counts?.[d] ?? counts?.[String(d)]);

/** Total of a note/coin count: { 500: 3, 100: 2 } → 1700. Unknown notes are ignored. */
export const denominationTotal = (counts = {}) => DENOMS.reduce((sum, d) => sum + d * countOf(counts, d), 0);

/** Only the notes actually counted, keyed by note — { '500': 3 } — as the server stores them. */
export const countedNotes = (counts = {}) => Object.fromEntries(
  DENOMS.map((d) => [String(d), countOf(counts, d)]).filter(([, n]) => n > 0),
);

/** What a money box holds while typing: digits only (commas, spaces and ₹ dropped), at most 7. */
export const cleanDigits = (raw, max = 7) => String(raw ?? '').replace(/\D/g, '').slice(0, max);

/** Rupees typed in a box → whole rupees, or null when the box is empty. */
export const parseRupees = (v) => {
  const s = cleanDigits(v, 12);
  return s ? Number(s) : null;
};

/** Cash that should be in the drawer (opening float + cash bookings) and how far the count is off. */
export const shiftCash = (cash = 0, openingFloat = 0, countedCash = 0) => {
  const expectedCash = Math.round((Number(openingFloat) || 0) + (Number(cash) || 0));
  return { expectedCash, difference: Math.round(Number(countedCash) || 0) - expectedCash };
};

/** 'match' | 'short' | 'excess' — drives the colours (green / red / amber). */
export const differenceTone = (difference) => {
  const n = Math.round(Number(difference) || 0);
  if (n < 0) return 'short';
  if (n > 0) return 'excess';
  return 'match';
};

/** Tailwind classes per tone: text, soft box, badge variant. */
export const TONE = {
  match: { text: 'text-green-700', box: 'border-green-200 bg-green-50', badge: 'green', label: 'Matches' },
  short: { text: 'text-red-700', box: 'border-red-200 bg-red-50', badge: 'red', label: 'Short' },
  excess: { text: 'text-amber-700', box: 'border-amber-200 bg-amber-50', badge: 'yellow', label: 'Excess' },
};

const inr = (n) => Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-IN');

/** −₹200 / +₹150 / ₹0 */
export const signedRupees = (n) => {
  const v = Math.round(Number(n) || 0);
  if (v < 0) return `−₹${inr(v)}`;
  if (v > 0) return `+₹${inr(v)}`;
  return '₹0';
};

/** "Matches" / "Short ₹200" / "Excess ₹150" in the screen's language (t = the useT() function). */
export const differenceText = (t, difference) => {
  const tone = differenceTone(difference);
  if (tone === 'match') return t('Matches');
  return t(tone === 'short' ? 'Short ₹{amount}' : 'Excess ₹{amount}', { amount: inr(difference) });
};

/**
 * The POST /booking-shifts/close body. `mode` is 'notes' (count each note) or 'total' (one figure).
 * Returns null when the count is missing (the total box is empty).
 */
export function buildCloseBody({ mode, counts, typed, openingFloat, notes }) {
  const body = { openingFloat: parseRupees(openingFloat) ?? 0, notes: String(notes ?? '').trim() };
  if (mode === 'notes') {
    const notesCounted = countedNotes(counts);
    if (Object.keys(notesCounted).length) body.denominations = notesCounted;
    else body.countedCash = 0;
    return body;
  }
  const total = parseRupees(typed);
  if (total === null) return null;
  body.countedCash = total;
  return body;
}

/** The cash counted on screen: the notes' total, or the typed figure (null while the box is empty). */
export const countedFrom = (mode, counts, typed) => (mode === 'notes' ? denominationTotal(counts) : parseRupees(typed));

/** A booking voided after its shift was closed — the cash count still included it. */
export const isVoidedAfterClose = (booking, shift) => Boolean(
  booking?.status === 'voided' && booking.voidedAt && shift?.closedAt
  && new Date(booking.voidedAt) > new Date(shift.closedAt),
);

/** Note lines for the slip and the detail view: [{ note: 500, count: 3, total: 1500 }], big notes first. */
export const denominationLines = (counts = {}) => DENOMS
  .map((d) => ({ note: d, count: countOf(counts, d), total: d * countOf(counts, d) }))
  .filter((l) => l.count > 0);

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "9:12 am" when it was today, otherwise "Sat, 10 Oct, 6:05 pm". */
export function fmtWhen(d, now = new Date()) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (sameDay(date, now)) return time;
  return `${date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

// ── Opening float, remembered per device ──────────────────────────────────────
const PREFS_KEY = 'mgm-booking-shift';

/** { float: '500', mode: 'notes' | 'total' } from this device (defaults when missing / blocked). */
export function readShiftPrefs() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) || '{}');
    return { float: cleanDigits(v.float), mode: v.mode === 'total' ? 'total' : 'notes' };
  } catch {
    return { float: '', mode: 'notes' };
  }
}

export function saveShiftPrefs(prefs) {
  try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}
