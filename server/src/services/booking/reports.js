import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import BookingBatch from '../../models/BookingBatch.js';
import BookingClosure from '../../models/BookingClosure.js';
import SevaType from '../../models/SevaType.js';
import { APP_TIMEZONE } from '../../utils/dates.js';
import { addDays, dateKeyOf, dateKeysBetween, dateKeyToDate, isDateKey } from './rules.js';
import { summariseAttendance } from './attendance.js';

// Income is counted on the day it was paid (paidAt); seats on the puja date (dateKey).

/** Mongo filter for the booking register / exports from query-string filters. */
export function buildFilter(q = {}) {
  const filter = {};
  filter.status = q.status === 'voided' ? 'voided' : q.status === 'all' ? { $in: ['confirmed', 'voided'] } : 'confirmed';

  const range = {};
  if (isDateKey(q.from)) range.$gte = dateKeyToDate(q.from);
  if (isDateKey(q.to)) { const end = dateKeyToDate(q.to); end.setHours(23, 59, 59, 999); range.$lte = end; }
  if (Object.keys(range).length) {
    if (q.dateField === 'puja') filter.performDate = range; else filter.paidAt = range;
  }
  if (isDateKey(q.pujaDate)) filter.dateKey = q.pujaDate;

  for (const [param, field] of [['sevaType', 'sevaType'], ['batch', 'batch'], ['createdBy', 'createdBy']]) {
    if (q[param] && mongoose.isValidObjectId(q[param])) filter[field] = new mongoose.Types.ObjectId(q[param]);
  }
  if (['cash', 'upi', 'card', 'online'].includes(q.paymentMode)) filter.paymentMode = q.paymentMode;
  if (['counter', 'online'].includes(q.channel)) filter.channel = q.channel;
  // Hall check-in: who came, and who booked but never came (only past days count as no-shows).
  if (q.arrival === 'arrived') filter.checkedInAt = { $ne: null };
  if (q.arrival === 'noshow') {
    const today = dateKeyOf();
    filter.checkedInAt = null;
    filter.dateKey = isDateKey(q.pujaDate) ? (q.pujaDate < today ? q.pujaDate : '-') : { $lt: today };
  }

  const search = String(q.q || '').trim();
  if (search) {
    const digits = search.replace(/\D/g, '');
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { receiptNo: rx },
      { 'devotee.name': rx },
      ...(digits.length >= 4 ? [{ 'devotee.phone': { $regex: digits } }] : []),
    ];
  }
  return filter;
}

/**
 * buildFilter() for lists and exports: no-shows count only on days the hall scanned (a day with
 * no check-ins at all isn't everyone missing) — the same rule as the attendance report.
 */
export async function registerFilter(q = {}) {
  const filter = buildFilter(q);
  if (q.arrival === 'noshow') {
    const days = await Booking.distinct('dateKey', { dateKey: filter.dateKey, checkedInAt: { $ne: null } });
    filter.dateKey = { $in: days };
  }
  return filter;
}

const dateGroup = (format) => ({ $dateToString: { format, date: '$paidAt', timezone: APP_TIMEZONE } });

/** Totals and breakdowns for the reports page. */
export async function summary(q = {}) {
  const match = buildFilter({ ...q, dateField: 'paid' });
  const [totals, byMode, bySeva, byStaff, byChannel, daily, monthly, yearly, voided] = await Promise.all([
    Booking.aggregate([{ $match: match }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' }, people: { $sum: '$peopleCount' } } }]),
    Booking.aggregate([{ $match: match }, { $group: { _id: '$paymentMode', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Booking.aggregate([{ $match: match }, { $group: { _id: '$sevaType', name: { $first: '$sevaName' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { amount: -1 } }]),
    Booking.aggregate([
      { $match: match },
      { $group: {
        _id: '$createdBy', count: { $sum: 1 }, amount: { $sum: '$amount' },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMode', 'cash'] }, '$amount', 0] } },
        upi:  { $sum: { $cond: [{ $eq: ['$paymentMode', 'upi'] }, '$amount', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentMode', 'card'] }, '$amount', 0] } },
      } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user', pipeline: [{ $project: { name: 1 } }] } },
      { $sort: { amount: -1 } },
    ]),
    Booking.aggregate([{ $match: match }, { $group: { _id: '$channel', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Booking.aggregate([{ $match: match }, { $group: { _id: dateGroup('%Y-%m-%d'), count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }]),
    Booking.aggregate([{ $match: match }, { $group: { _id: dateGroup('%Y-%m'), count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }]),
    Booking.aggregate([{ $match: match }, { $group: { _id: dateGroup('%Y'), count: { $sum: 1 }, amount: { $sum: '$amount' } } }, { $sort: { _id: 1 } }]),
    Booking.aggregate([{ $match: { ...match, status: 'voided' } }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
  ]);

  const row = (r) => ({ count: r.count, amount: r.amount });
  return {
    totals: { count: totals[0]?.count || 0, amount: totals[0]?.amount || 0, people: totals[0]?.people || 0 },
    voided: { count: voided[0]?.count || 0, amount: voided[0]?.amount || 0 },
    byMode: Object.fromEntries(byMode.map((r) => [r._id, row(r)])),
    byChannel: Object.fromEntries(byChannel.map((r) => [r._id, row(r)])),
    bySeva: bySeva.map((r) => ({ sevaType: r._id, name: r.name, ...row(r) })),
    byStaff: byStaff.map((r) => ({ user: r._id, name: r.user[0]?.name || 'Unknown', ...row(r), cash: r.cash, upi: r.upi, card: r.card })),
    daily: daily.map((r) => ({ date: r._id, ...row(r) })),
    monthly: monthly.map((r) => ({ month: r._id, ...row(r) })),
    yearly: yearly.map((r) => ({ year: r._id, ...row(r) })),
  };
}

// "7:00 AM – 8:15 AM" → 420, for sorting batches by start time ("10:00" sorts before "7:00" as text).
const labelMinutes = (label) => {
  const m = String(label || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 24 * 60;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
};

/** All confirmed bookings for a puja date, grouped by batch / slot — the day sheet. */
export async function daySheet(dateKey) {
  const bookings = await Booking.find({ dateKey, status: 'confirmed' })
    .sort({ serialNo: 1 })
    .select('receiptNo sevaType sevaName schedule batch batchLabel hall serialNo devotee peopleCount amount paymentMode notes checkedInAt')
    .lean();
  const [batches, slotSevas] = await Promise.all([
    BookingBatch.find({ _id: { $in: [...new Set(bookings.filter((b) => b.batch).map((b) => String(b.batch)))] } }).select('capacity').lean(),
    SevaType.find({ _id: { $in: [...new Set(bookings.filter((b) => b.schedule === 'slot').map((b) => String(b.sevaType)))] } }).select('dailyLimit').lean(),
  ]);
  const capacityOf = new Map([
    ...batches.map((x) => [String(x._id), x.capacity]),
    ...slotSevas.map((x) => [String(x._id), x.dailyLimit || 0]),
  ]);
  const groups = new Map();
  for (const b of bookings) {
    const key = b.batch ? `${b.batch}` : `${b.sevaName}|${b.batchLabel}`;
    if (!groups.has(key)) {
      const capacity = capacityOf.get(String(b.batch || (b.schedule === 'slot' ? b.sevaType : ''))) || 0;
      groups.set(key, { batch: b.batch, label: b.batchLabel, hall: b.hall, capacity, sevaNames: new Set(), bookings: [], people: 0, arrived: 0, arrivedPeople: 0 });
    }
    const g = groups.get(key);
    g.sevaNames.add(b.sevaName);
    g.bookings.push(b);
    g.people += b.peopleCount || 1;
    if (b.checkedInAt) { g.arrived += 1; g.arrivedPeople += b.peopleCount || 1; }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, sevaNames: [...g.sevaNames] }))
    .sort((a, b) => labelMinutes(a.label) - labelMinutes(b.label) || (a.hall || '').localeCompare(b.hall || ''));
}

/** P&L: booking income paid between two dates. */
export async function incomeBetween(from, to) {
  const [r] = await Booking.aggregate([
    { $match: { status: 'confirmed', paidAt: { $gte: from, $lte: to } } },
    { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return { amount: r?.amount || 0, count: r?.count || 0 };
}


/**
 * Fill rate and no-shows for puja dates from → to (default: the last 30 days).
 *   Fill rate = seats booked ÷ seats on offer (batch capacity / slot daily limit, as set now),
 *               per batch, weekday and day. Closed days offer nothing.
 *   No-shows  = bookings never checked in at the hall, on past days when scanning was in use
 *               (a day with no check-ins at all is left out, not counted as everyone missing).
 * Nothing before the first booking counts (the module's start).
 */
export async function attendanceReport(q = {}) {
  const today = dateKeyOf();
  let to = isDateKey(q.to) ? q.to : today;
  let from = isDateKey(q.from) ? q.from : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  const first = await Booking.findOne({ dateKey: { $gt: '' } }).sort({ dateKey: 1 }).select('dateKey').lean();
  if (first && from < first.dateKey) from = first.dateKey;
  const dates = from <= to ? dateKeysBetween(from, to) : [];
  if (dates.length) to = dates[dates.length - 1];

  const [rows, batches, slotSevas, closures] = await Promise.all([
    Booking.aggregate([
      { $match: { status: 'confirmed', dateKey: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { dateKey: '$dateKey', batch: '$batch', sevaType: '$sevaType', schedule: '$schedule' },
          sevaName: { $first: '$sevaName' }, label: { $first: '$batchLabel' }, hall: { $first: '$hall' },
          bookings: { $sum: 1 },
          seats: { $sum: { $ifNull: ['$seats', 1] } },
          people: { $sum: { $ifNull: ['$peopleCount', 1] } },
          arrived: { $sum: { $cond: [{ $ifNull: ['$checkedInAt', false] }, 1, 0] } },
          arrivedPeople: { $sum: { $cond: [{ $ifNull: ['$checkedInAt', false] }, { $ifNull: ['$peopleCount', 1] }, 0] } },
        },
      },
    ]),
    BookingBatch.find().lean(),
    SevaType.find({ schedule: 'slot' }).lean(),
    BookingClosure.find({ date: { $gte: from, $lte: to } }).lean(),
  ]);

  return summariseAttendance({ rows, dates, batches, slotSevas, closures, today, from, to });
}
