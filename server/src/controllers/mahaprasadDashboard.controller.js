import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import MahaprasadTarget, { DEFAULT_TARGET } from '../models/MahaprasadTarget.js';
import User from '../models/User.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { APP_TIMEZONE, localDateStr } from '../utils/dates.js';

// The Mahaprasad dashboard and TV screen: for one day, how much prasad was given against the
// day's total (a target — nothing is stopped by it).
//   sold     — persons on coupons for that day (counter and online), not cancelled
//   served   — persons whose coupons were scanned at the hall that day
//   toServe  — persons on that day's coupons not scanned yet
// A group coupon for 5 counts as 5.

const NOT_SOLD = ['reserved', 'voided'];
const GS = { $ifNull: ['$groupSize', 1] };
const isOnline = { $eq: ['$channel', 'online'] };

// The server runs on India time (config/timezone.js), so this is the temple's calendar day
const dayRange = (day) => {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1); end.setMilliseconds(-1);
  return { start, end };
};

/** The day's total: that day's own, else the usual one, else DEFAULT_TARGET. */
async function targetFor(day) {
  const docs = await MahaprasadTarget.find({ key: { $in: [day, 'default'] } }).lean();
  const own = docs.find((d) => d.key === day);
  const usual = docs.find((d) => d.key === 'default')?.target ?? DEFAULT_TARGET;
  return { target: own ? own.target : usual, forThisDay: Boolean(own), usual };
}

// GET /mahaprasad/dashboard?date=YYYY-MM-DD (today when not given)
export const getDashboard = asyncHandler(async (req, res) => {
  const day = req.query.date || localDateStr();
  const { start, end } = dayRange(day);
  const ofTheDay = { date: { $gte: start, $lte: end }, status: { $nin: NOT_SOLD } };
  const hourOf = (field) => ({ $toInt: { $dateToString: { format: '%H', date: field, timezone: APP_TIMEZONE } } });

  const [target, [sold = {}], [served = {}], soldByHour, servedByHour, byCounter, [last]] = await Promise.all([
    targetFor(day),
    MahaprasadCoupon.aggregate([
      { $match: ofTheDay },
      { $group: {
        _id: null,
        persons: { $sum: GS },
        coupons: { $sum: 1 },
        online:  { $sum: { $cond: [isOnline, GS, 0] } },
        free:    { $sum: { $cond: [{ $eq: ['$type', 'free'] }, GS, 0] } },
        toServe: { $sum: { $cond: [{ $eq: ['$status', 'issued'] }, GS, 0] } },
        earlier: { $sum: { $cond: [{ $lt: ['$issuedAt', start] }, GS, 0] } },   // sold before the day (online, in advance)
      } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { status: 'redeemed', redeemedAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, persons: { $sum: GS } } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { ...ofTheDay, issuedAt: { $gte: start, $lte: end } } },
      { $group: { _id: hourOf('$issuedAt'), persons: { $sum: GS } } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { status: 'redeemed', redeemedAt: { $gte: start, $lte: end } } },
      { $group: { _id: hourOf('$redeemedAt'), persons: { $sum: GS } } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: ofTheDay },
      { $group: { _id: { $cond: [isOnline, 'online', '$issuedBy'] }, persons: { $sum: GS }, coupons: { $sum: 1 } } },
      { $sort: { persons: -1 } },
    ]),
    MahaprasadCoupon.find({ status: 'redeemed', redeemedAt: { $gte: start, $lte: end } })
      .sort({ redeemedAt: -1 }).limit(1).select('redeemedAt').lean(),
  ]);

  // Hours from the first to the last with anything sold or served
  const soldAt = new Map(soldByHour.map((h) => [h._id, h.persons]));
  const servedAt = new Map(servedByHour.map((h) => [h._id, h.persons]));
  const busy = [...soldAt.keys(), ...servedAt.keys()];
  const hours = busy.length
    ? Array.from({ length: Math.max(...busy) - Math.min(...busy) + 1 }, (_, i) => {
      const hour = Math.min(...busy) + i;
      return { hour, sold: soldAt.get(hour) || 0, served: servedAt.get(hour) || 0 };
    })
    : [];

  const staffIds = byCounter.map((c) => c._id).filter((id) => id && id !== 'online');
  const names = Object.fromEntries((await User.find({ _id: { $in: staffIds } }).select('name').lean())
    .map((u) => [String(u._id), u.name]));
  const counters = byCounter.map((c) => ({
    name: c._id === 'online' ? null : (names[String(c._id)] || '—'),
    online: c._id === 'online',
    persons: c.persons,
    coupons: c.coupons,
  }));

  const soldPersons = sold.persons || 0;
  res.json(new ApiResponse(200, {
    date: day,
    target: target.target,
    targetForThisDay: target.forThisDay,
    usualTarget: target.usual,
    sold: {
      persons: soldPersons,
      coupons: sold.coupons || 0,
      online:  sold.online || 0,
      counter: soldPersons - (sold.online || 0),
      free:    sold.free || 0,
      earlier: sold.earlier || 0,
    },
    served: served.persons || 0,
    toServe: sold.toServe || 0,
    left: Math.max(0, target.target - soldPersons),     // of the day's total, not sold yet
    over: Math.max(0, soldPersons - target.target),     // sold past the total
    hours,
    counters,
    lastServedAt: last?.redeemedAt || null,
    at: new Date(),
  }));
});

// PUT /mahaprasad/dashboard/target  { date?: 'YYYY-MM-DD', target: number | null }
// With a date: that day's total (null = back to the usual one). Without: the usual daily total.
export const setTarget = asyncHandler(async (req, res) => {
  const { date, target } = req.body;
  const key = date || 'default';
  const before = (await MahaprasadTarget.findOne({ key }).lean())?.target ?? null;
  if (target === null) {
    await MahaprasadTarget.deleteOne({ key });
  } else {
    await MahaprasadTarget.updateOne({ key }, { $set: { target, setBy: req.user._id } }, { upsert: true });
  }
  logAction(req, {
    action: 'mahaprasad.target_set', entity: 'MahaprasadTarget', entityId: key,
    before: { target: before ?? (date ? 'usual' : DEFAULT_TARGET) },
    after: { target: target ?? 'usual' },
  });
  const day = date || localDateStr();
  res.json(new ApiResponse(200, await targetFor(day), date ? 'Total for the day saved' : 'Usual daily total saved'));
});
