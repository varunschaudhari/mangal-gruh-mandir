// Pure helpers for fixing a booking without voiding it: edit details, move to another
// batch / date, and the change history — see bookingFixUtils.test.js.
import { isPincode } from '../../utils/address.js';
import { paymentRefProblem } from '../../utils/payment.js';
import { NAKSHATRAS, RASHIS, devoteeFormValues, fmtDay, isValidPhone } from './counter/counterUtils.js';
import { MODE_LABEL } from './registerUtils.js';

const trim = (s) => String(s ?? '').trim();
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Payment ───────────────────────────────────────────────────────────────────
/**
 * Why the payment mode / reference can't be changed here (English, for t()), or null when it can:
 * only counter bookings, only until the shift is closed, only by whoever took it (or someone who can void).
 */
export function paymentLock(booking = {}, { userId, canVoid = false } = {}) {
  if (booking.channel && booking.channel !== 'counter') return 'Paid online — the payment cannot be changed here';
  if (booking.shift) return 'This booking is in a closed shift — its payment mode can no longer be changed';
  const by = booking.createdBy?._id || booking.createdBy;
  if (!canVoid && String(by || '') !== String(userId || '')) return 'Only the person who took this booking can change how it was paid';
  return null;
}

// ── Edit form ─────────────────────────────────────────────────────────────────
/** The edit form, filled from a saved booking. */
export function editFormValues(b = {}) {
  return {
    devotee: { ...devoteeFormValues(b.devotee || {}), phone: String(b.devotee?.phone || '') },
    peopleCount: Math.max(1, Number(b.peopleCount) || 1),
    notes: String(b.notes || ''),
    paymentMode: b.paymentMode || 'cash',
    paymentRef: String(b.paymentRef || ''),
  };
}

// The form as the server will store it (trimmed, single spaces in the name, email in lower case).
function cleanForm(f) {
  const d = f.devotee || {};
  const devotee = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'familyNames' ? (v || []).map(trim).filter(Boolean) : trim(v)]));
  devotee.name = devotee.name.replace(/\s+/g, ' ');
  devotee.email = devotee.email.toLowerCase();
  return {
    devotee,
    peopleCount: Math.max(1, Number(f.peopleCount) || 1),
    notes: trim(f.notes),
    paymentMode: f.paymentMode,
    paymentRef: f.paymentMode === 'cash' ? '' : trim(f.paymentRef),
  };
}

/**
 * The PATCH /bookings/:id body with only what was changed ({} when nothing was).
 * Payment fields are included only when `canPay`.
 */
export function editPatch(initial, form, { canPay = false } = {}) {
  const a = cleanForm(initial);
  const b = cleanForm(form);
  const body = {};
  const devotee = {};
  for (const k of Object.keys(b.devotee)) if (!same(a.devotee[k], b.devotee[k])) devotee[k] = b.devotee[k];
  if (Object.keys(devotee).length) body.devotee = devotee;
  if (a.peopleCount !== b.peopleCount) body.peopleCount = b.peopleCount;
  if (a.notes !== b.notes) body.notes = b.notes;
  if (canPay) {
    if (a.paymentMode !== b.paymentMode) body.paymentMode = b.paymentMode;
    if (a.paymentRef !== b.paymentRef) body.paymentRef = b.paymentRef;
  }
  return body;
}

/**
 * Checks the edit form. Returns { field: English message } (empty = OK). Like the server, the
 * postal address is only insisted on when the address or PIN is being changed.
 */
export function validateEdit(form, { seva, initial } = {}) {
  const e = {};
  const d = form.devotee || {};
  const was = initial?.devotee || {};
  if (!isValidPhone(trim(d.phone))) e.phone = 'Enter a valid 10-digit mobile number';
  if (!trim(d.name)) e.name = 'Enter the devotee name';
  const addressChanged = trim(d.address) !== trim(was.address) || trim(d.pincode) !== trim(was.pincode);
  if (seva?.needsPostalAddress && addressChanged && !trim(d.address)) e.address = 'Postal address is needed for this seva';
  else if (seva?.needsPostalAddress && addressChanged && !isPincode(trim(d.pincode))) e.address = 'PIN code is needed for the postal address';
  else if (trim(d.pincode) && !isPincode(trim(d.pincode))) e.address = 'Enter a valid 6-digit PIN code';
  if (trim(d.email) && !EMAIL.test(trim(d.email))) e.email = 'Enter a valid email address';
  if (seva?.maxPeople && form.peopleCount > seva.maxPeople) e.people = `${seva.name} allows at most ${seva.maxPeople} people`;
  // Like the server: a payment being changed to UPI / card needs a reference that can be checked
  const payChanged = form.paymentMode !== initial?.paymentMode || trim(form.paymentRef) !== trim(initial?.paymentRef);
  if (payChanged && paymentRefProblem(form.paymentMode, form.paymentRef)) e.payment = paymentRefProblem(form.paymentMode, form.paymentRef);
  return e;
}

// ── Where a booking is ────────────────────────────────────────────────────────
/** "Tue, 13 Oct · 7:00 AM – 8:15 AM · H1 #3" — date, batch, hall and serial of a booking. */
export function bookingWhere(b = {}, lang = 'en') {
  const seat = [b.hall, b.serialNo != null && b.serialNo !== '' && `#${b.serialNo}`].filter(Boolean).join(' ');
  return [b.dateKey && fmtDay(b.dateKey, lang), b.batchLabel, seat].filter(Boolean).join(' · ');
}

// ── History ───────────────────────────────────────────────────────────────────
// Field → label (English, for t()), in the order the changes are listed.
export const HISTORY_LABELS = {
  date: 'Puja date',
  batch: 'Batch',
  serialNo: 'Serial',
  'devotee.name': 'Name',
  'devotee.phone': 'Mobile number',
  peopleCount: 'People',
  'devotee.gotra': 'Gotra',
  'devotee.familyNames': 'Family names',
  'devotee.rashi': 'Rashi',
  'devotee.nakshatra': 'Nakshatra',
  'devotee.dob': 'Date of birth',
  'devotee.birthTime': 'Birth time',
  'devotee.birthPlace': 'Birth place',
  'devotee.maritalStatus': 'Marital status',
  'devotee.email': 'Email',
  'devotee.address': 'Address',
  'devotee.pincode': 'PIN code',
  'devotee.area': 'Village / area',
  'devotee.city': 'City / taluka',
  'devotee.district': 'District',
  'devotee.state': 'State',
  notes: 'Notes',
  paymentMode: 'Payment Mode',
  paymentRef: 'Reference No.',
};
const FIELD_ORDER = Object.keys(HISTORY_LABELS);

/**
 * booking.history newest first, each with its changes as [{ field, before, after }] in a
 * steady order (unknown fields last).
 */
export function historyEntries(history = []) {
  return (Array.isArray(history) ? history : [])
    .map((h, i) => ({ h, i }))
    .sort((x, y) => (new Date(y.h.at) - new Date(x.h.at)) || (y.i - x.i))
    .map(({ h }) => {
      const rank = (f) => (FIELD_ORDER.includes(f) ? FIELD_ORDER.indexOf(f) : FIELD_ORDER.length);
      const changes = Object.entries(h.changes || {})
        .filter(([, v]) => Array.isArray(v))
        .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
        .map(([field, [before, after]]) => ({ field, before, after }));
      return { ...h, changes };
    });
}

/** One before / after value as the reader should see it ('' when empty). `t` is the useT() function. */
export function historyValue(field, value, { t = (s) => s, lang = 'en' } = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (field === 'date' || field === 'devotee.dob') return fmtDay(String(value), lang, { day: 'numeric', month: 'short', year: 'numeric' });
  if (field === 'paymentMode') return t(MODE_LABEL[value] || String(value));
  if (field === 'devotee.maritalStatus') return value === 'married' ? t('Married') : value === 'unmarried' ? t('Unmarried') : String(value);
  if (lang === 'mr' && (field === 'devotee.rashi' || field === 'devotee.nakshatra')) {
    const list = field === 'devotee.rashi' ? RASHIS : NAKSHATRAS;
    return list.find((x) => x.value === value)?.mr || String(value);
  }
  return String(value);
}
