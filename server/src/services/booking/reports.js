import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import BookingBatch from '../../models/BookingBatch.js';
import SevaType from '../../models/SevaType.js';
import { APP_TIMEZONE } from '../../utils/dates.js';
import { dateKeyToDate, isDateKey } from './rules.js';

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
    .select('receiptNo sevaType sevaName schedule batch batchLabel hall serialNo devotee peopleCount amount paymentMode notes')
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
      groups.set(key, { batch: b.batch, label: b.batchLabel, hall: b.hall, capacity, sevaNames: new Set(), bookings: [], people: 0 });
    }
    const g = groups.get(key);
    g.sevaNames.add(b.sevaName);
    g.bookings.push(b);
    g.people += b.peopleCount || 1;
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
