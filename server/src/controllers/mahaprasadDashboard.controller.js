import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { APP_TIMEZONE, localDateStr } from '../utils/dates.js';
import { temple } from '../services/temple.service.js';

// The Mahaprasad dashboard and TV screen: for one day, how much prasad was given against the
// day's total. The total IS the daily cap in Settings → Mahaprasad — one number: coupon issuing
// stops there (counters and online), and changing it on the dashboard changes it in Settings.
// 0 = no limit, and then the dashboard shows no total.
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

/** The day's total = Settings → Mahaprasad daily cap (the same for every day); 0 = no limit */
async function dayTotal() {
  return (await Settings.getOrCreate()).mahaprasadDailyCap || 0;
}

// GET /api/public/mahaprasad-screen — the TV in the hall or kitchen, no sign-in.
// Today only, and only what the screen shows: no staff names, no money, no hour-by-hour.
export const getScreen = asyncHandler(async (req, res) => {
  const day = localDateStr();
  const { start, end } = dayRange(day);
  const [target, [sold = {}], [served = {}]] = await Promise.all([
    dayTotal(),
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, status: { $nin: NOT_SOLD } } },
      { $group: {
        _id: null,
        persons: { $sum: GS },
        online:  { $sum: { $cond: [isOnline, GS, 0] } },
        toServe: { $sum: { $cond: [{ $eq: ['$status', 'issued'] }, GS, 0] } },
      } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { status: 'redeemed', redeemedAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, persons: { $sum: GS } } },
    ]),
  ]);
  const soldPersons = sold.persons || 0;
  const limited = target > 0;
  const { name, nameMr } = temple();
  res.json(new ApiResponse(200, {
    date: day,
    target,
    limited,
    sold: { persons: soldPersons, online: sold.online || 0 },
    served: served.persons || 0,
    toServe: sold.toServe || 0,
    left: limited ? Math.max(0, target - soldPersons) : null,
    over: limited ? Math.max(0, soldPersons - target) : 0,
    temple: { name, nameMr },
    at: new Date(),
  }));
});

// GET /mahaprasad/dashboard?date=YYYY-MM-DD (today when not given)
export const getDashboard = asyncHandler(async (req, res) => {
  const day = req.query.date || localDateStr();
  const { start, end } = dayRange(day);
  const ofTheDay = { date: { $gte: start, $lte: end }, status: { $nin: NOT_SOLD } };
  const hourOf = (field) => ({ $toInt: { $dateToString: { format: '%H', date: field, timezone: APP_TIMEZONE } } });

  const [target, [sold = {}], [served = {}], soldByHour, servedByHour, byCounter, [last]] = await Promise.all([
    dayTotal(),
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
  const limited = target > 0;
  res.json(new ApiResponse(200, {
    date: day,
    target,      // Settings → Mahaprasad daily cap
    limited,     // false: no daily cap, so no total to count against
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
    left: limited ? Math.max(0, target - soldPersons) : null,   // of the day's total, not sold yet
    over: limited ? Math.max(0, soldPersons - target) : 0,      // sold past the total (offline sales can pass it)
    hours,
    counters,
    lastServedAt: last?.redeemedAt || null,
    at: new Date(),
  }));
});

// PUT /mahaprasad/dashboard/target  { target: number } — the day's total, saved as the daily cap in
// Settings → Mahaprasad (the same number in both places; 0 = no limit)
export const setTarget = asyncHandler(async (req, res) => {
  const { target } = req.body;
  const settings = await Settings.getOrCreate();
  const before = settings.mahaprasadDailyCap || 0;
  settings.mahaprasadDailyCap = target;
  await settings.save();
  logAction(req, {
    action: 'settings.update', entity: 'Settings', entityRef: settings._id,
    before: { mahaprasadDailyCap: before }, after: { mahaprasadDailyCap: target },
    meta: { from: 'Mahaprasad dashboard' },
  });
  res.json(new ApiResponse(200, { target, limited: target > 0 }, 'Daily total saved'));
});
