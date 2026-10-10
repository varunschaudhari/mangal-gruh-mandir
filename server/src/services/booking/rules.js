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
