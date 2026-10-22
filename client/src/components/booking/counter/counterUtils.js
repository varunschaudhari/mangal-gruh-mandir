// Pure helpers for the booking counter (no React, no browser-only imports) — see counterUtils.test.js.
import { isPincode } from '../../../utils/address.js';
import { paymentRefProblem } from '../../../utils/payment.js';
import { cleanPhoneInput, isValidPhone } from '../../../utils/phone.js';

// ── Sankalp lists ─────────────────────────────────────────────────────────────
// The value saved on the booking is the English (transliterated) name; Marathi is the display label.
export const RASHIS = [
  { value: 'Mesha', mr: 'मेष' },
  { value: 'Vrishabha', mr: 'वृषभ' },
  { value: 'Mithuna', mr: 'मिथुन' },
  { value: 'Karka', mr: 'कर्क' },
  { value: 'Simha', mr: 'सिंह' },
  { value: 'Kanya', mr: 'कन्या' },
  { value: 'Tula', mr: 'तूळ' },
  { value: 'Vrishchika', mr: 'वृश्चिक' },
  { value: 'Dhanu', mr: 'धनु' },
  { value: 'Makara', mr: 'मकर' },
  { value: 'Kumbha', mr: 'कुंभ' },
  { value: 'Meena', mr: 'मीन' },
];

export const NAKSHATRAS = [
  { value: 'Ashwini', mr: 'अश्विनी' },
  { value: 'Bharani', mr: 'भरणी' },
  { value: 'Krittika', mr: 'कृत्तिका' },
  { value: 'Rohini', mr: 'रोहिणी' },
  { value: 'Mrigashira', mr: 'मृगशीर्ष' },
  { value: 'Ardra', mr: 'आर्द्रा' },
  { value: 'Punarvasu', mr: 'पुनर्वसू' },
  { value: 'Pushya', mr: 'पुष्य' },
  { value: 'Ashlesha', mr: 'आश्लेषा' },
  { value: 'Magha', mr: 'मघा' },
  { value: 'Purva Phalguni', mr: 'पूर्वा फाल्गुनी' },
  { value: 'Uttara Phalguni', mr: 'उत्तरा फाल्गुनी' },
  { value: 'Hasta', mr: 'हस्त' },
  { value: 'Chitra', mr: 'चित्रा' },
  { value: 'Swati', mr: 'स्वाती' },
  { value: 'Vishakha', mr: 'विशाखा' },
  { value: 'Anuradha', mr: 'अनुराधा' },
  { value: 'Jyeshtha', mr: 'ज्येष्ठा' },
  { value: 'Mula', mr: 'मूळ' },
  { value: 'Purva Ashadha', mr: 'पूर्वाषाढा' },
  { value: 'Uttara Ashadha', mr: 'उत्तराषाढा' },
  { value: 'Shravana', mr: 'श्रवण' },
  { value: 'Dhanishta', mr: 'धनिष्ठा' },
  { value: 'Shatabhisha', mr: 'शततारका' },
  { value: 'Purva Bhadrapada', mr: 'पूर्वा भाद्रपदा' },
  { value: 'Uttara Bhadrapada', mr: 'उत्तरा भाद्रपदा' },
  { value: 'Revati', mr: 'रेवती' },
];

/** SearchableSelect options in the screen's language, keeping a saved value that isn't in the list. */
export function sankalpOptions(list, lang, current) {
  const opts = list.map((x) => (lang === 'mr'
    ? { value: x.value, label: x.mr, sub: x.value }
    : { value: x.value, label: x.value, sub: x.mr }));
  if (current && !list.some((x) => x.value === current)) opts.push({ value: current, label: current });
  return opts;
}

// ── Dates (YYYY-MM-DD in the device's local calendar) ─────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (key) => { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (key, n) => { const d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d); };
export const weekdayOf = (key) => parseKey(key).getDay(); // 0 = Sunday
export const lastBookableDay = (today, maxAdvanceDays) => addDays(today, maxAdvanceDays > 0 ? maxAdvanceDays : 365);

const restricted = (weekdays) => Array.isArray(weekdays) && weekdays.length > 0 && weekdays.length < 7;
export const isAllowedDay = (key, weekdays) => !restricted(weekdays) || weekdays.includes(weekdayOf(key));

/** First day on or after `from` that the seva is done on (and within the booking window), or null. */
export function nextAllowedDay(from, weekdays, last) {
  for (let k = from, i = 0; k <= last && i < 400; k = addDays(k, 1), i++) {
    if (isAllowedDay(k, weekdays)) return k;
  }
  return null;
}

/**
 * Quick date chips: Today, Tomorrow and the next Tuesday (the busy day) — or, for a seva
 * done only on some weekdays (Panchamrit: Tuesdays), its next three days.
 * Returns [{ key, kind: 'today' | 'tomorrow' | 'date' }].
 */
export function dateChoices({ today, weekdays, maxAdvanceDays }) {
  const last = lastBookableDay(today, maxAdvanceDays);
  const tomorrow = addDays(today, 1);
  const kind = (k) => (k === today ? 'today' : k === tomorrow ? 'tomorrow' : 'date');
  const out = [];
  if (restricted(weekdays)) {
    for (let k = nextAllowedDay(today, weekdays, last); k && out.length < 3; k = nextAllowedDay(addDays(k, 1), weekdays, last)) {
      out.push({ key: k, kind: kind(k) });
    }
    return out;
  }
  out.push({ key: today, kind: 'today' });
  if (tomorrow <= last) out.push({ key: tomorrow, kind: 'tomorrow' });
  let tue = addDays(today, 2);
  while (weekdayOf(tue) !== 2) tue = addDays(tue, 1);
  if (tue <= last) out.push({ key: tue, kind: 'date' });
  return out;
}

/** "Sat, 10 Oct" in English or Marathi (with ordinary digits). */
export function fmtDay(key, lang, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!key) return '';
  try {
    return parseKey(key).toLocaleDateString({ mr: 'mr-IN-u-nu-latn', hi: 'hi-IN-u-nu-latn' }[lang] || 'en-IN', opts);   // hi: the hall TV
  } catch {
    return parseKey(key).toLocaleDateString('en-IN', opts);
  }
}

// "07:00" + "08:15" → "7:00 – 8:15 AM";  "11:30" + "12:45" → "11:30 AM – 12:45 PM"
export function compactBatchLabel(start, end, fallback = '') {
  const parse = (s) => { const [h, m] = String(s || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? { h, m } : null; };
  const a = parse(start); const b = parse(end);
  if (!a || !b) return fallback;
  const t = ({ h, m }) => `${((h + 11) % 12) + 1}:${pad(m)}`;
  const p = ({ h }) => (h >= 12 ? 'PM' : 'AM');
  return p(a) === p(b) ? `${t(a)} – ${t(b)} ${p(b)}` : `${t(a)} ${p(a)} – ${t(b)} ${p(b)}`;
}

// ── Phone ─────────────────────────────────────────────────────────────────────
// cleanPhoneInput / isValidPhone live in utils/phone.js (shared with the Mahaprasad counter).
export { cleanPhoneInput, isValidPhone };

// ── Devotee form ──────────────────────────────────────────────────────────────
export const EMPTY_DEVOTEE = Object.freeze({
  name: '', email: '', address: '', pincode: '', area: '', city: '', district: '', state: '', dob: '', maritalStatus: '',
  gotra: '', familyNames: [], rashi: '', nakshatra: '', birthTime: '', birthPlace: '',
  language: '',   // WhatsApp receipt: 'mr' / 'en' ('' = Setup's default); a returning devotee's comes back
});
const DEVOTEE_KEYS = Object.keys(EMPTY_DEVOTEE);

const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim());
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/** The form fields from a looked-up devotee (unknown keys dropped, missing ones empty). */
export function devoteeFormValues(d = {}) {
  return Object.fromEntries(DEVOTEE_KEYS.map((k) => {
    if (k === 'familyNames') return [k, Array.isArray(d.familyNames) ? d.familyNames.filter(Boolean) : []];
    return [k, d[k] == null ? '' : String(d[k])];
  }));
}

/** Fills only the empty fields — never overwrites what the staff already typed. */
export const fillEmpty = (current, values) => Object.fromEntries(DEVOTEE_KEYS.map((k) => [k, isEmpty(current[k]) ? values[k] : current[k]]));

/** Clears the fields still holding a pre-filled value (the mobile number was changed). */
export const clearPrefilled = (current, values) => Object.fromEntries(DEVOTEE_KEYS.map((k) => [k, same(current[k], values[k]) ? EMPTY_DEVOTEE[k] : current[k]]));

/** Family names typed as "Asha, Ravi" → ['Asha', 'Ravi'], skipping blanks and repeats. */
export function addFamilyNames(list, text) {
  const out = [...list];
  for (const raw of String(text || '').split(/[,\n]/)) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 20);
}

// ── Validation and request ────────────────────────────────────────────────────
/**
 * Checks the form before booking. Returns { field: English message } (empty = OK).
 * `availability` is the server's answer for the chosen seva + date (undefined while loading).
 */
export function validateBooking({ seva, phone, devotee, date, batchId, availability, peopleCount, capacityUnit, paymentMode, paymentRef }) {
  const e = {};
  const payProblem = paymentRefProblem(paymentMode, paymentRef);
  if (payProblem) e.payment = payProblem;
  if (!isValidPhone(phone)) e.phone = 'Enter a valid 10-digit mobile number';
  if (!seva) { e.seva = 'Choose a seva type'; return e; }
  if (!String(devotee.name || '').trim()) e.name = 'Enter the devotee name';
  if (seva.needsPostalAddress && !String(devotee.address || '').trim()) e.address = 'Postal address is needed for this seva';
  else if (seva.needsPostalAddress && !isPincode(devotee.pincode)) e.address = 'PIN code is needed for the postal address';
  else if (devotee.pincode && !isPincode(devotee.pincode)) e.address = 'Enter a valid 6-digit PIN code';
  if (seva.maxPeople && peopleCount > seva.maxPeople) e.people = `${seva.name} allows at most ${seva.maxPeople} people`;
  if (devotee.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(devotee.email.trim())) e.email = 'Enter a valid email address';
  if (seva.schedule === 'none') return e;

  if (!date) { e.when = 'Choose the puja date'; return e; }
  if (!availability) { e.when = 'Checking seats — try again in a moment'; return e; }
  if (!availability.open) { e.when = availability.reason || 'Bookings are closed on this date'; return e; }
  const seats = capacityUnit === 'people' ? Math.max(1, peopleCount) : 1;
  if (seva.schedule === 'batch') {
    const b = availability.batches?.find((x) => x._id === batchId);
    if (!b) e.when = 'Choose a batch';
    else if (b.ended) e.when = 'This batch has already finished for today';
    else if (b.left < seats) e.when = b.left > 0 ? 'Not enough seats left in this batch' : 'This batch is full — please choose another';
  } else if (seva.schedule === 'slot') {
    const s = availability.slot;
    if (s && s.left !== null && s.left !== undefined && s.left < seats) e.when = 'No seats left on this date';
  }
  return e;
}

const trim = (s) => String(s ?? '').trim();

/** The POST /bookings body (without clientRequestId). */
export function buildBookingBody({ seva, phone, devotee, date, batchId, peopleCount, paymentMode, paymentRef, notes }) {
  const body = {
    sevaType: seva._id,
    devotee: {
      name: trim(devotee.name).replace(/\s+/g, ' '),
      phone,
      email: trim(devotee.email),
      address: trim(devotee.address),
      pincode: trim(devotee.pincode),
      area: trim(devotee.area),
      city: trim(devotee.city),
      district: trim(devotee.district),
      state: trim(devotee.state),
      dob: trim(devotee.dob),
      maritalStatus: devotee.maritalStatus || '',
      gotra: trim(devotee.gotra),
      familyNames: (devotee.familyNames || []).map(trim).filter(Boolean),
      rashi: trim(devotee.rashi),
      nakshatra: trim(devotee.nakshatra),
      birthTime: trim(devotee.birthTime),
      birthPlace: trim(devotee.birthPlace),
      language: devotee.language || '',
    },
    peopleCount: Math.max(1, Number(peopleCount) || 1),
    paymentMode,
    paymentRef: paymentMode === 'cash' ? '' : trim(paymentRef),
    notes: trim(notes),
  };
  if (seva.schedule !== 'none') body.date = date;
  if (seva.schedule === 'batch') body.batch = batchId;
  return body;
}

/** One id per booking attempt, reused when the same booking is retried (server de-duplicates). */
export function newRequestId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    try { return c.randomUUID(); } catch { /* insecure context (plain http on the LAN) */ }
  }
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Server messages ───────────────────────────────────────────────────────────
/**
 * Translates the booking API's English messages (availability reasons and errors).
 * Seva names inside a message are swapped for their Marathi names when the screen is in Marathi.
 */
export function serverText(t, msg, { sevaTypes = [], lang = 'en' } = {}) {
  if (!msg) return '';
  const seva = (name) => (lang === 'mr' && sevaTypes.find((s) => s.name === name)?.nameMr) || name;
  let m;
  if ((m = msg.match(/^(.+) is not done on this day$/))) return t('{seva} is not done on this day', { seva: seva(m[1]) });
  if ((m = msg.match(/^Bookings open only (\d+) days ahead$/))) return t('Bookings open only {n} days ahead', { n: m[1] });
  if ((m = msg.match(/^Closed: (.+)$/s))) return t('Closed: {reason}', { reason: m[1] });
  if ((m = msg.match(/^(.+) allows at most (\d+) people$/))) return t('{seva} allows at most {n} people', { seva: seva(m[1]), n: m[2] });
  return t(msg);
}

export const fmtMoney = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');
