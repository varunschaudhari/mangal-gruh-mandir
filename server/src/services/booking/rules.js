// Pure booking rules (no database) — unit-tested in rules.test.js.

const pad = (n, w = 2) => String(n).padStart(w, '0');

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// "2026-10-13" → local (IST) midnight of that day.
export const dateKeyToDate = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const dateKeyOf = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

// A real calendar day in YYYY-MM-DD form ("2026-02-30" rolls over, so it fails).
export const isDateKey = (s) => DATE_KEY.test(s || '') && dateKeyOf(dateKeyToDate(s)) === s;

export const weekdayOf = (key) => dateKeyToDate(key).getDay(); // 0 = Sunday

export const addDays = (key, n) => {
  const d = dateKeyToDate(key);
  d.setDate(d.getDate() + n);
  return dateKeyOf(d);
};

// Indian financial year (April–March) of a date: 9 Oct 2026 → "2026-27", 10 Feb 2027 → "2026-27".
export const financialYear = (d = new Date()) => {
  const x = new Date(d);
  const start = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1;
  return `${start}-${pad((start + 1) % 100)}`;
};

export const formatReceiptNo = (prefix, fy, seq) => `${prefix || 'ABH'}/${fy}/${pad(seq, 5)}`;

// "07:00" → "7:00 AM", "13:30" → "1:30 PM"
export const to12h = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${suffix}`;
};

export const batchLabel = (start, end) => `${to12h(start)} – ${to12h(end)}`;

// Has the batch finished on that date? (A batch already running can still be booked at the counter.)
export const batchEnded = (dateKey, end, now = new Date()) => {
  const today = dateKeyOf(now);
  if (dateKey !== today) return dateKey < today;
  const [h, m] = end.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
};

// Seats a booking takes in a batch / slot, in the configured capacity unit.
export const seatsFor = (capacityUnit, peopleCount) => (capacityUnit === 'people' ? Math.max(1, Number(peopleCount) || 1) : 1);

// Is this seva open on that date? Returns null when it is, or the reason it isn't.
export function closedReason({ sevaType, dateKey, closures = [], today, maxAdvanceDays }) {
  if (dateKey < today) return 'This date has already passed';
  if (maxAdvanceDays && dateKey > addDays(today, maxAdvanceDays)) return `Bookings open only ${maxAdvanceDays} days ahead`;
  const closure = closures.find((c) => c.date === dateKey
    && (!c.sevaTypes?.length || c.sevaTypes.some((id) => String(id) === String(sevaType._id))));
  if (closure) return closure.reason ? `Closed: ${closure.reason}` : 'Bookings are closed on this date';
  if (sevaType.schedule === 'slot' && sevaType.weekdays?.length && !sevaType.weekdays.includes(weekdayOf(dateKey))) {
    return `${sevaType.name} is not done on this day`;
  }
  return null;
}

// Batches that a seva can use on a date, sorted by time then hall.
export const batchesFor = (batches, sevaType, dateKey) => batches
  .filter((b) => b.isActive !== false)
  .filter((b) => !b.weekdays?.length || b.weekdays.includes(weekdayOf(dateKey)))
  .filter((b) => !b.sevaTypes?.length || b.sevaTypes.some((id) => String(id) === String(sevaType._id)))
  .sort((a, b) => a.start.localeCompare(b.start) || a.hall.localeCompare(b.hall));

export const slotKey = {
  batch: (batchId, dateKey) => `B:${batchId}:${dateKey}`,
  seva:  (sevaTypeId, dateKey) => `S:${sevaTypeId}:${dateKey}`,
};

// Indian mobile number → 10 digits, or '' when it isn't one.
export const normalisePhone = (s) => {
  const digits = String(s || '').replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
};

// ── Shift cash ────────────────────────────────────────────────────────────────

export const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

/** Total of a note/coin count, e.g. { 500: 3, 100: 2 } → 1700. Unknown notes are ignored. */
export const denominationTotal = (counts = {}) => DENOMINATIONS
  .reduce((sum, d) => sum + d * Math.max(0, Math.floor(Number(counts[d] ?? counts[String(d)]) || 0)), 0);

/** Cash the counter should hand over and how far the count is off (negative = short). */
export const shiftCash = ({ cash = 0 }, openingFloat = 0, countedCash = 0) => {
  const expectedCash = Math.round((Number(openingFloat) || 0) + (Number(cash) || 0));
  return { expectedCash, difference: Math.round(Number(countedCash) || 0) - expectedCash };
};

// ── Corrections ───────────────────────────────────────────────────────────────

const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

/** { field: [before, after] } for the fields that differ ('devotee.name' style paths). */
export function diffFields(before, after, fields) {
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const changes = {};
  for (const f of fields) {
    const a = get(before, f); const b = get(after, f);
    if (!same(a, b)) changes[f] = [a ?? '', b ?? ''];
  }
  return changes;
}

// ── Hall check-in ─────────────────────────────────────────────────────────────

// What a scanned slip means at the hall. `hall` is the hall this scanner stands at ('' = any).
//   ok          let in (and mark checked in)
//   already     checked in before — the slip is being used again
//   voided      cancelled booking
//   no-visit    seva done on the devotee's behalf (Post Abhishek) — nothing to check in
//   early/past  booked for another day
//   other-hall  belongs to another hall (can be let in anyway)
//   batch-over  today's batch has finished (can be let in anyway)
export function checkInVerdict(b, { today, now = new Date(), hall = '' } = {}) {
  if (b.status === 'voided') return { result: 'voided', canOverride: false };
  if (!b.dateKey) return { result: 'no-visit', canOverride: false };
  if (b.checkedInAt) return { result: 'already', canOverride: false };
  if (b.dateKey > today) return { result: 'early', canOverride: false };
  if (b.dateKey < today) return { result: 'past', canOverride: false };
  if (hall && b.hall && b.hall !== hall) return { result: 'other-hall', canOverride: true };
  const end = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(b.batchLabel || '');
  if (b.batch && end) {
    const h = (Number(end[1]) % 12) + (end[3].toUpperCase() === 'PM' ? 12 : 0);
    if (now.getHours() * 60 + now.getMinutes() >= h * 60 + Number(end[2])) return { result: 'batch-over', canOverride: true };
  }
  return { result: 'ok', canOverride: false };
}

/** The receipt token in a scanned QR (".../r/<token>"), a bare token, or null. */
export const receiptTokenOf = (code) => {
  const s = String(code || '').trim();
  const fromUrl = /\/r\/([A-Za-z0-9_-]{10,40})\/?(?:[?#].*)?$/.exec(s);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{16}$/.test(s) ? s : null;
};

// ── Hall screen and attendance reports ────────────────────────────────────────

/** "7:00 AM – 8:15 AM" → { start: 420, end: 495 } in minutes after midnight, or null without times. */
export function labelTimes(label) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return null;
  const at = (h, min, ap) => ((Number(h) % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(min);
  return { start: at(m[1], m[2], m[3]), end: at(m[4], m[5], m[6]) };
}

/** Where a batch stands at `minutes` after midnight today: 'now', 'over', 'later', or '' without times. */
export const batchStateAt = (label, minutes) => {
  const r = labelTimes(label);
  if (!r) return '';
  if (minutes >= r.end) return 'over';
  return minutes >= r.start ? 'now' : 'later';
};

/** part / whole as a percentage with one decimal; null when there was nothing to measure. */
export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Every date key from → to (inclusive), at most `max` of them. */
export function dateKeysBetween(from, to, max = 400) {
  const out = [];
  for (let k = from; k <= to && out.length < max; k = addDays(k, 1)) out.push(k);
  return out;
}

/**
 * Seats on offer per day: each active batch on its weekdays, and each slot seva up to its daily
 * limit on its weekdays, except dates closed for everything (or, for a slot seva, closed for it).
 * Returns [{ dateKey, key, label, hall, capacity }] where key is 'B:<batchId>' or 'S:<sevaTypeId>'.
 */
export function capacityPlan({ dates, batches = [], slotSevas = [], closures = [] }) {
  const closedAll = new Set(closures.filter((c) => !c.sevaTypes?.length).map((c) => c.date));
  const closedFor = (dateKey, sevaId) => closures.some((c) => c.date === dateKey
    && c.sevaTypes?.some((id) => String(id) === String(sevaId)));
  const plan = [];
  for (const dateKey of dates) {
    if (closedAll.has(dateKey)) continue;
    const day = weekdayOf(dateKey);
    for (const b of batches) {
      if (b.isActive === false || (b.weekdays?.length && !b.weekdays.includes(day))) continue;
      plan.push({ dateKey, key: `B:${b._id}`, label: batchLabel(b.start, b.end), hall: b.hall || '', capacity: b.capacity || 0 });
    }
    for (const s of slotSevas) {
      if (s.isActive === false || !s.dailyLimit || (s.weekdays?.length && !s.weekdays.includes(day)) || closedFor(dateKey, s._id)) continue;
      plan.push({ dateKey, key: `S:${s._id}`, label: s.slotTime || s.name, hall: '', capacity: s.dailyLimit });
    }
  }
  return plan;
}
