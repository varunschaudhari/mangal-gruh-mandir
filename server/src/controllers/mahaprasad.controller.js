import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import DailyCounter from '../models/DailyCounter.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { randomBytes } from 'crypto';
import { logAction } from '../services/audit.service.js';
const nanoid = () => randomBytes(6).toString('hex');

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getPriceForDate(settings, date) {
  const d   = date ? new Date(date) : new Date();
  const key = DAY_KEYS[d.getDay()];
  return settings.mahaprasadDayPricing?.[key] ?? 0;
}

function dayBounds(date) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}

function datePart(date) {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

// Atomic counter — returns the starting sequence number for this batch.
// Uses findOneAndUpdate $inc so concurrent requests never collide.
async function nextCouponSequence(date, qty) {
  const dateStr = datePart(date);
  // $inc atomically adds qty; new:false returns value BEFORE increment
  const counter = await DailyCounter.findOneAndUpdate(
    { module: 'mahaprasad', date: dateStr },
    { $inc: { count: qty } },
    { upsert: true, new: false, setDefaultsOnInsert: true }
  );
  return (counter?.count ?? 0) + 1; // first number of this batch
}

async function generateCouponNumbers(date, qty) {
  const prefix  = `MP-${datePart(date)}`;
  const startAt = await nextCouponSequence(date, qty);
  const numbers = [];
  for (let i = 0; i < qty; i++) {
    numbers.push(`${prefix}-${String(startAt + i).padStart(3, '0')}`);
  }
  return numbers;
}

// ── Controllers ───────────────────────────────────────────────────────────────

// POST /mahaprasad/issue
export const issueCoupons = asyncHandler(async (req, res) => {
  const { quantity = 1, type = 'paid', occasion = '', date, isGroup = false } = req.body;

  const qty        = Math.min(Math.max(1, parseInt(quantity) || 1), 200);
  const groupSize  = isGroup ? qty : 1;   // persons per coupon document
  const couponCount = isGroup ? 1 : qty;  // number of documents to create

  const couponDate = date ? new Date(date) : new Date();
  couponDate.setHours(12, 0, 0, 0);

  const settings = await Settings.getOrCreate();
  const price    = type === 'free' ? 0 : getPriceForDate(settings, couponDate);

  // Daily cap check — counts persons (sum of groupSize), not documents
  const cap = settings.mahaprasadDailyCap || 0;
  if (cap > 0) {
    const { start, end } = dayBounds(couponDate);
    const [capAgg] = await MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, status: { $ne: 'reserved' } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$groupSize', 1] } } } },
    ]);
    const currentTotal = capAgg?.total || 0;
    if (currentTotal + qty > cap) {
      const remaining = Math.max(0, cap - currentTotal);
      throw new ApiError(400,
        remaining === 0
          ? `Daily cap of ${cap} persons reached for this date`
          : `Only ${remaining} more person${remaining !== 1 ? 's' : ''} can be issued today (cap: ${cap})`
      );
    }
  }

  const numbers = await generateCouponNumbers(couponDate, couponCount);
  const batchId = nanoid(10);

  const docs = numbers.map((n) => ({
    couponNumber: n,
    date:         couponDate,
    type,
    amount:       isGroup ? price * groupSize : price,  // total amount for group
    occasion:     type === 'free' ? (occasion || '') : '',
    status:       'issued',
    issuedBy:     req.user._id,
    issuedAt:     new Date(),
    batchId,
    groupSize,
    isGroup:      Boolean(isGroup),
  }));

  const coupons = await MahaprasadCoupon.insertMany(docs, { ordered: true });
  logAction(req, { action: 'mahaprasad.issue', entity: 'MahaprasadCoupon', entityId: batchId, entityRef: batchId, after: { qty, type, isGroup: Boolean(isGroup), groupSize, date: couponDate.toISOString().split('T')[0], occasion: type === 'free' ? occasion : undefined } });
  const msg = isGroup ? `Group coupon (${qty} persons) issued` : `${qty} coupon(s) issued`;
  res.status(201).json(new ApiResponse(201, { coupons, batchId }, msg));
});

// GET /mahaprasad/summary
export const getDailySummary = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const { start, end } = dayBounds(date);

  // Sum groupSize (not document count) so a group coupon of 5 counts as 5 persons
  const GS = { $ifNull: ['$groupSize', 1] };

  const [summaryAgg, paidAgg, settings] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, status: { $ne: 'reserved' } } },
      { $group: {
        _id:      null,
        total:    { $sum: GS },
        redeemed: { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } },
        paid:     { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, GS, 0] } },
      }},
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, type: 'paid', status: { $ne: 'reserved' } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]),
    Settings.getOrCreate(),
  ]);

  const s         = summaryAgg[0] || {};
  const total     = s.total    || 0;
  const redeemed  = s.redeemed || 0;
  const paid      = s.paid     || 0;
  const free      = total - paid;
  const collected = paidAgg[0]?.totalAmount || 0;

  res.json(new ApiResponse(200, {
    total, redeemed, pending: total - redeemed, paid, free, collected,
    cap:           settings.mahaprasadDailyCap || 0,
    pricePerPlate: getPriceForDate(settings, date),
  }));
});

// GET /mahaprasad/coupons
export const getCoupons = asyncHandler(async (req, res) => {
  const { date, status, type, search, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (date) {
    const { start, end } = dayBounds(date);
    filter.date = { $gte: start, $lte: end };
  }
  if (status) filter.status = status;
  if (type)   filter.type   = type;
  if (search) filter.couponNumber = { $regex: search.trim().toUpperCase(), $options: 'i' };

  const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 50);
  const lim  = Math.min(100, parseInt(limit) || 50);

  const [coupons, total] = await Promise.all([
    MahaprasadCoupon.find(filter)
      .populate('issuedBy',   'name')
      .populate('redeemedBy', 'name')
      .sort({ issuedAt: -1 })
      .skip(skip).limit(lim)
      .lean(),
    MahaprasadCoupon.countDocuments(filter),
  ]);

  res.json(new ApiResponse(200, { coupons, total, page: parseInt(page), pages: Math.ceil(total / lim) }));
});

// GET /mahaprasad/lookup/:number
export const lookupCoupon = asyncHandler(async (req, res) => {
  const coupon = await MahaprasadCoupon.findOne({ couponNumber: req.params.number })
    .populate('issuedBy',   'name')
    .populate('redeemedBy', 'name')
    .lean();
  if (!coupon) throw new ApiError(404, 'Coupon not found');
  res.json(new ApiResponse(200, coupon));
});

// PATCH /mahaprasad/redeem/:number
export const redeemCoupon = asyncHandler(async (req, res) => {
  const coupon = await MahaprasadCoupon.findOne({ couponNumber: req.params.number });
  if (!coupon) throw new ApiError(404, `Coupon ${req.params.number} not found`);

  if (coupon.status === 'redeemed') {
    const at = coupon.redeemedAt
      ? new Date(coupon.redeemedAt).toLocaleString('en-IN')
      : 'earlier';
    throw new ApiError(409, `Already redeemed on ${at}`);
  }

  // Expiry check
  const settings = await Settings.getOrCreate();
  const validityDays = settings.mahaprasadCouponValidityDays ?? 1;
  if (validityDays > 0) {
    const couponDay = new Date(coupon.date); couponDay.setHours(0, 0, 0, 0);
    const expiryDay = new Date(couponDay);
    expiryDay.setDate(expiryDay.getDate() + validityDays);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (today >= expiryDay) {
      const issuedOn = couponDay.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      throw new ApiError(410, `Coupon expired — was valid for ${validityDays} day(s) from ${issuedOn}`);
    }
  }

  coupon.status     = 'redeemed';
  coupon.redeemedBy = req.user._id;
  coupon.redeemedAt = new Date();
  await coupon.save();
  logAction(req, { action: 'mahaprasad.redeem', entity: 'MahaprasadCoupon', entityId: String(coupon._id), entityRef: coupon.couponNumber });

  const populated = await MahaprasadCoupon.findById(coupon._id)
    .populate('issuedBy', 'name').populate('redeemedBy', 'name').lean();
  res.json(new ApiResponse(200, populated, 'Coupon redeemed'));
});

// GET /mahaprasad/batches?date=YYYY-MM-DD
export const getBatches = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const { start, end } = dayBounds(date);

  const batches = await MahaprasadCoupon.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $sort:  { couponNumber: 1 } },
    { $group: {
      _id:        '$batchId',
      count:      { $sum: 1 },
      type:       { $first: '$type' },
      occasion:   { $first: '$occasion' },
      issuedAt:   { $first: '$issuedAt' },
      issuedById: { $first: '$issuedBy' },
      numbers:    { $push: '$couponNumber' },
      couponFrom: { $first: '$couponNumber' },
      couponTo:   { $last: '$couponNumber' },
      groupSize:  { $first: '$groupSize' },
      isGroup:    { $first: '$isGroup' },
    }},
    { $sort: { issuedAt: -1 } },
  ]);

  // Manually hydrate issuedBy
  const User = (await import('../models/User.js')).default;
  const userIds = [...new Set(batches.map((b) => b.issuedById?.toString()).filter(Boolean))];
  const users   = await User.find({ _id: { $in: userIds } }).select('name').lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));
  const result  = batches.map((b) => ({
    ...b,
    issuedBy: b.issuedById ? { _id: b.issuedById, name: userMap[b.issuedById.toString()] || '—' } : null,
  }));

  res.json(new ApiResponse(200, result));
});

// GET /mahaprasad/print  ?numbers=MP-...,MP-...
export const printCoupons = asyncHandler(async (req, res) => {
  const numberList = req.query.numbers?.split(',').filter(Boolean) || [];
  if (!numberList.length) throw new ApiError(400, 'No coupon numbers provided');

  const coupons = await MahaprasadCoupon.find({ couponNumber: { $in: numberList } }).lean();
  if (!coupons.length) throw new ApiError(404, 'No coupons found');

  const settings = await Settings.getOrCreate();
  const { generateCouponsPdf } = await import('../services/mahaprasadPdf.service.js');
  await generateCouponsPdf(res, { coupons, settings: settings.toObject() });
});

// GET /mahaprasad/report/monthly
export const getMonthlyReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) { const s = new Date(from); s.setHours(0,0,0,0); filter.date.$gte = s; }
    if (to)   { const e = new Date(to);   e.setHours(23,59,59,999); filter.date.$lte = e; }
  }

  const rows = await MahaprasadCoupon.aggregate([
    { $match: filter },
    { $group: {
      _id:       { $dateToString: { format: '%Y-%m', date: '$date' } },
      total:     { $sum: 1 },
      redeemed:  { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, 1, 0] } },
      paid:      { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, 1, 0] } },
      free:      { $sum: { $cond: [{ $eq: ['$type',   'free']     }, 1, 0] } },
      collected: { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, '$amount', 0] } },
    }},
    { $sort: { _id: -1 } },
  ]);

  const totals = rows.reduce(
    (acc, r) => ({ total: acc.total + r.total, redeemed: acc.redeemed + r.redeemed, paid: acc.paid + r.paid, free: acc.free + r.free, collected: acc.collected + r.collected }),
    { total: 0, redeemed: 0, paid: 0, free: 0, collected: 0 }
  );

  res.json(new ApiResponse(200, { rows, totals }));
});

// GET /mahaprasad/report/staff
export const getStaffReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) { const s = new Date(from); s.setHours(0,0,0,0); filter.date.$gte = s; }
    if (to)   { const e = new Date(to);   e.setHours(23,59,59,999); filter.date.$lte = e; }
  }

  const [issuedRows, redeemedRows] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: filter },
      { $group: {
        _id:       '$issuedBy',
        issued:    { $sum: 1 },
        freeSeva:  { $sum: { $cond: [{ $eq: ['$type', 'free'] }, 1, 0] } },
        collected: { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, '$amount', 0] } },
      }},
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, status: 'redeemed' } },
      { $group: { _id: '$redeemedBy', redeemed: { $sum: 1 } } },
    ]),
  ]);

  const User = (await import('../models/User.js')).default;
  const allIds = [...new Set([
    ...issuedRows.map((r) => r._id?.toString()),
    ...redeemedRows.map((r) => r._id?.toString()),
  ].filter(Boolean))];

  const users   = await User.find({ _id: { $in: allIds } }).select('name').lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));
  const redeemedMap = Object.fromEntries(redeemedRows.map((r) => [r._id?.toString(), r.redeemed]));

  const merged = new Map();
  issuedRows.forEach((r) => {
    const uid = r._id?.toString(); if (!uid) return;
    merged.set(uid, { userId: uid, name: userMap[uid] || 'Unknown', issued: r.issued, freeSeva: r.freeSeva, collected: r.collected, redeemed: redeemedMap[uid] || 0 });
  });
  redeemedRows.forEach((r) => {
    const uid = r._id?.toString(); if (!uid || merged.has(uid)) return;
    merged.set(uid, { userId: uid, name: userMap[uid] || 'Unknown', issued: 0, freeSeva: 0, collected: 0, redeemed: r.redeemed });
  });

  const rows = [...merged.values()].sort((a, b) => b.issued - a.issued);
  res.json(new ApiResponse(200, { rows }));
});

// GET /mahaprasad/report/wastage
export const getWastageReport = asyncHandler(async (req, res) => {
  const { from } = req.query;

  const settings    = await Settings.getOrCreate();
  const validityDays = settings.mahaprasadCouponValidityDays ?? 1;

  if (validityDays === 0) {
    return res.json(new ApiResponse(200, { rows: [], totals: { count: 0, paid: 0, free: 0, wasted: 0 }, validityDays: 0 }));
  }

  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - validityDays);

  const dateFilter = { $lt: cutoff };
  if (from) { const s = new Date(from); s.setHours(0,0,0,0); dateFilter.$gte = s; }

  const wasteFilter = { status: 'issued', date: dateFilter };

  const [rows, totalsAgg] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: wasteFilter },
      { $group: {
        _id:    { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        count:  { $sum: 1 },
        paid:   { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, 1, 0] } },
        free:   { $sum: { $cond: [{ $eq: ['$type', 'free'] }, 1, 0] } },
        wasted: { $sum: '$amount' },
      }},
      { $sort: { _id: -1 } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: wasteFilter },
      { $group: { _id: null, count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, 1, 0] } }, free: { $sum: { $cond: [{ $eq: ['$type', 'free'] }, 1, 0] } }, wasted: { $sum: '$amount' } } },
    ]),
  ]);

  const t = totalsAgg[0] || {};
  res.json(new ApiResponse(200, {
    rows,
    totals: { count: t.count || 0, paid: t.paid || 0, free: t.free || 0, wasted: t.wasted || 0 },
    validityDays,
  }));
});

// GET /mahaprasad/report
export const getReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) { const s = new Date(from); s.setHours(0,0,0,0); filter.date.$gte = s; }
    if (to)   { const e = new Date(to);   e.setHours(23,59,59,999); filter.date.$lte = e; }
  }

  const [rows, occasionRows, settings] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: filter },
      { $group: {
        _id:       { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        total:     { $sum: 1 },
        redeemed:  { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, 1, 0] } },
        paid:      { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, 1, 0] } },
        free:      { $sum: { $cond: [{ $eq: ['$type',   'free']     }, 1, 0] } },
        collected: { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, '$amount', 0] } },
      }},
      { $sort: { _id: -1 } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, type: 'free', occasion: { $nin: [null, ''] } } },
      { $group: { _id: '$occasion', count: { $sum: 1 }, redeemed: { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    Settings.getOrCreate(),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      total:     acc.total     + r.total,
      redeemed:  acc.redeemed  + r.redeemed,
      paid:      acc.paid      + r.paid,
      free:      acc.free      + r.free,
      collected: acc.collected + r.collected,
    }),
    { total: 0, redeemed: 0, paid: 0, free: 0, collected: 0 }
  );

  res.json(new ApiResponse(200, {
    rows,
    totals,
    occasionBreakdown: occasionRows,
    dayPricing: settings.mahaprasadDayPricing,
  }));
});

// ── Offline support ───────────────────────────────────────────────────────────

// POST /mahaprasad/offline/reserve
// Pre-allocates a block of coupon numbers for offline use.
// Old reserved coupons for this user+date are cleaned up first.
export const reserveOffline = asyncHandler(async (req, res) => {
  const { qty = 200, date } = req.body;
  const n = Math.min(Math.max(1, parseInt(qty) || 200), 500);

  const couponDate = date ? new Date(date) : new Date();
  couponDate.setHours(12, 0, 0, 0);
  const { start, end } = dayBounds(couponDate);

  // Remove any leftover reserved coupons for this user+date so re-fetch is idempotent
  await MahaprasadCoupon.deleteMany({
    date:     { $gte: start, $lte: end },
    status:   'reserved',
    issuedBy: req.user._id,
  });

  const settings = await Settings.getOrCreate();
  const numbers   = await generateCouponNumbers(couponDate, n);
  const batchId   = nanoid();

  const docs = numbers.map((num) => ({
    couponNumber: num,
    date:         couponDate,
    type:         'paid',
    amount:       getPriceForDate(settings, couponDate),
    occasion:     '',
    status:       'reserved',
    issuedBy:     req.user._id,
    issuedAt:     new Date(),
    batchId,
  }));

  await MahaprasadCoupon.insertMany(docs, { ordered: true });

  logAction(req, {
    action: 'mahaprasad.offline_reserve', entity: 'MahaprasadCoupon',
    entityId: batchId,
    meta: { count: n, date: couponDate },
  });

  res.json(new ApiResponse(200, {
    coupons:  docs.map((d) => ({ couponNumber: d.couponNumber, date: d.date })),
    count:    n,
    // Include context the client needs to work fully offline
    user:     { _id: req.user._id, name: req.user.name },
    settings: {
      mahaprasadDayPricing:         settings.mahaprasadDayPricing,
      mahaprasadCouponValidityDays: settings.mahaprasadCouponValidityDays,
      mahaprasadPrinterName:        settings.mahaprasadPrinterName,
      templeName:                   settings.templeName,
    },
  }));
});

// GET /mahaprasad/offline/today
// Returns all today's non-reserved coupons for caching on the redeem counter.
export const getTodayForOffline = asyncHandler(async (req, res) => {
  const { start, end } = dayBounds();
  const coupons = await MahaprasadCoupon.find({
    date:   { $gte: start, $lte: end },
    status: { $ne: 'reserved' },
  })
    .populate('issuedBy',   'name')
    .populate('redeemedBy', 'name')
    .lean();
  res.json(new ApiResponse(200, coupons));
});

// POST /mahaprasad/offline/sync
// Accepts batched offline events and applies them to the DB.
export const syncOffline = asyncHandler(async (req, res) => {
  const { issued = [], redeemed = [] } = req.body;
  const results = {
    issued:   { ok: 0, skipped: 0 },
    redeemed: { ok: 0, skipped: 0, conflicts: [] },
  };

  for (const item of issued) {
    const updated = await MahaprasadCoupon.findOneAndUpdate(
      { couponNumber: item.couponNumber, status: 'reserved' },
      {
        $set: {
          status:   'issued',
          type:     item.type     || 'paid',
          amount:   item.amount   ?? 0,
          occasion: item.occasion || '',
          issuedBy: item.issuedById || req.user._id,
          issuedAt: item.issuedAt ? new Date(item.issuedAt) : new Date(),
          batchId:  item.batchId  || nanoid(),
        },
      }
    );
    if (updated) results.issued.ok++;
    else results.issued.skipped++;
  }

  for (const item of redeemed) {
    const updated = await MahaprasadCoupon.findOneAndUpdate(
      { couponNumber: item.couponNumber, status: { $in: ['issued', 'reserved'] } },
      {
        $set: {
          status:      'redeemed',
          redeemedBy:  item.redeemedById || req.user._id,
          redeemedAt:  item.redeemedAt ? new Date(item.redeemedAt) : new Date(),
        },
      }
    );
    if (updated) results.redeemed.ok++;
    else {
      results.redeemed.skipped++;
      results.redeemed.conflicts.push({ couponNumber: item.couponNumber, reason: 'already_redeemed' });
    }
  }

  logAction(req, {
    action: 'mahaprasad.offline_sync', entity: 'MahaprasadCoupon',
    entityId: `sync-${issued.length + redeemed.length}`,
    meta: {
      issuedOk: results.issued.ok,
      issuedSkipped: results.issued.skipped,
      redeemedOk: results.redeemed.ok,
      redeemedSkipped: results.redeemed.skipped,
    },
  });
  res.json(new ApiResponse(200, { results }));
});
