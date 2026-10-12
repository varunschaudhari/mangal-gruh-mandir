// Fill rate and no-shows from booking rows — pure, tested in attendance.test.js.
// reports.attendanceReport() fetches the rows (grouped per puja date, batch, seva) and calls this.
import { batchLabel, capacityPlan, percent, weekdayOf } from './rules.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mondayFirst = (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7);

// "7:00 AM – 8:15 AM" → 420, for sorting batches by start time.
const labelMinutes = (label) => {
  const m = String(label || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 24 * 60;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
};

const addTo = (map, key, init, fn) => {
  if (!map.has(key)) map.set(key, init());
  fn(map.get(key));
};

/**
 * rows: [{ _id: { dateKey, batch, sevaType, schedule }, sevaName, label, hall, bookings, seats, people,
 *          arrived, arrivedPeople }] for confirmed bookings in the range; dates: every day in it.
 */
export function summariseAttendance({ rows, dates, batches = [], slotSevas = [], closures = [], today, from, to }) {
  // ── Fill rate ──
  const plan = capacityPlan({ dates, batches: batches.filter((b) => b.isActive !== false), slotSevas, closures });
  const cells = new Map(); // `${dateKey}|${key}` → { dateKey, key, label, hall, capacity, booked }
  for (const p of plan) cells.set(`${p.dateKey}|${p.key}`, { ...p, booked: 0 });
  const batchById = new Map(batches.map((b) => [String(b._id), b]));
  for (const r of rows) {
    const { dateKey, batch, sevaType, schedule } = r._id;
    const key = batch ? `B:${batch}` : schedule === 'slot' ? `S:${sevaType}` : null;
    if (!key) continue; // arrangement sevas have no seat limit
    const id = `${dateKey}|${key}`;
    if (!cells.has(id)) {
      // Booked on a day the plan doesn't offer now (batch switched off since, or a closed day).
      const b = batch && batchById.get(String(batch));
      cells.set(id, {
        dateKey, key, label: b ? batchLabel(b.start, b.end) : r.label, hall: b?.hall ?? r.hall ?? '', capacity: b?.capacity || 0, booked: 0,
      });
    }
    cells.get(id).booked += r.seats;
  }
  const fillBy = (keyOf, labelOf) => {
    const m = new Map();
    for (const c of cells.values()) {
      addTo(m, keyOf(c), () => ({ ...labelOf(c), days: 0, capacity: 0, booked: 0 }), (x) => {
        x.days += 1; x.capacity += c.capacity; x.booked += c.booked;
      });
    }
    return [...m.values()].map((x) => ({ ...x, fill: percent(x.booked, x.capacity) }));
  };
  const fillTotals = [...cells.values()].reduce((t, c) => ({ capacity: t.capacity + c.capacity, booked: t.booked + c.booked }), { capacity: 0, booked: 0 });
  const byTime = (a, b) => labelMinutes(a.label) - labelMinutes(b.label) || (a.hall || '').localeCompare(b.hall || '');

  // ── No-shows (past days with scanning) ──
  const visits = rows.filter((r) => r._id.dateKey < today);
  const scanned = new Set(visits.filter((r) => r.arrived > 0).map((r) => r._id.dateKey));
  const counted = visits.filter((r) => scanned.has(r._id.dateKey));
  const showBy = (keyOf, labelOf) => {
    const m = new Map();
    for (const r of counted) {
      addTo(m, keyOf(r), () => ({ ...labelOf(r), bookings: 0, arrived: 0, people: 0, arrivedPeople: 0 }), (x) => {
        x.bookings += r.bookings; x.arrived += r.arrived; x.people += r.people; x.arrivedPeople += r.arrivedPeople;
      });
    }
    return [...m.values()].map((x) => ({ ...x, noShow: x.bookings - x.arrived, noShowRate: percent(x.bookings - x.arrived, x.bookings) }));
  };
  const [showTotals = { bookings: 0, arrived: 0, people: 0, arrivedPeople: 0, noShow: 0, noShowRate: null }] = showBy(() => 'all', () => ({}));
  const bookedDays = [...new Set(visits.map((r) => r._id.dateKey))].sort();

  return {
    from, to, today,
    fill: {
      totals: { ...fillTotals, fill: percent(fillTotals.booked, fillTotals.capacity) },
      byBatch: fillBy((c) => c.key, (c) => ({ key: c.key, label: c.label, hall: c.hall })).sort(byTime),
      byWeekday: fillBy((c) => weekdayOf(c.dateKey), (c) => ({ weekday: weekdayOf(c.dateKey), name: WEEKDAYS[weekdayOf(c.dateKey)] })).sort(mondayFirst),
      daily: fillBy((c) => c.dateKey, (c) => ({ date: c.dateKey })).sort((a, b) => a.date.localeCompare(b.date)),
    },
    noShow: {
      totals: showTotals,
      scannedDays: scanned.size,
      unscannedDays: bookedDays.filter((d) => !scanned.has(d)).length,
      byBatch: showBy((r) => `${r._id.batch || r._id.sevaType}|${r.label}|${r.hall}`, (r) => ({ label: r.label || r.sevaName, hall: r.hall || '' })).sort(byTime),
      bySeva: showBy((r) => String(r._id.sevaType), (r) => ({ sevaType: r._id.sevaType, name: r.sevaName })).sort((a, b) => b.bookings - a.bookings),
      byWeekday: showBy((r) => weekdayOf(r._id.dateKey), (r) => ({ weekday: weekdayOf(r._id.dateKey), name: WEEKDAYS[weekdayOf(r._id.dateKey)] })).sort(mondayFirst),
      daily: bookedDays.map((d) => {
        const day = visits.filter((r) => r._id.dateKey === d);
        const bookings = day.reduce((n, r) => n + r.bookings, 0);
        const arrived = day.reduce((n, r) => n + r.arrived, 0);
        return { date: d, scanned: scanned.has(d), bookings, arrived, noShow: scanned.has(d) ? bookings - arrived : null };
      }),
    },
  };
}
