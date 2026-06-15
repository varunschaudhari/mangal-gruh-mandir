import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import MahaprasadPayment from '../models/MahaprasadPayment.js';
import MahaprasadCashDrawer from '../models/MahaprasadCashDrawer.js';
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

// ── Cash drawer helpers ───────────────────────────────────────────────────────

const DRAWER_DENOMS = [500, 100, 50, 20, 10, 5, 2, 1];
const EMPTY_COUNTS  = Object.fromEntries(DRAWER_DENOMS.map((d) => [String(d), 0]));

// How many of each tracked denomination a given note is worth
const NOTE_TO_DRAWER = {
  10:  { '10': 1 },
  20:  { '20': 1 },
  50:  { '50': 1 },
  100: { '100': 1 },
  200: { '100': 2 },  // ₹200 = 2×₹100
  500: { '500': 1 },
};

// Greedy change breakdown against available counts
function computeChange(amount, counts) {
  const breakdown = {};
  let remaining = Math.round(amount);
  for (const d of DRAWER_DENOMS) {
    const avail = Math.max(0, counts[String(d)] || 0);
    if (remaining >= d && avail > 0) {
      const take = Math.min(Math.floor(remaining / d), avail);
      if (take > 0) { breakdown[String(d)] = take; remaining -= d * take; }
    }
  }
  return { breakdown, canMakeExact: remaining === 0, shortBy: remaining };
}

async function getOrCreateDrawer(dateStr) {
  return MahaprasadCashDrawer.findOneAndUpdate(
    { date: dateStr },
    { $setOnInsert: { counts: { ...EMPTY_COUNTS } } },
    { upsert: true, new: true },
  );
}

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
  const {
    quantity = 1, type = 'paid', occasion = '', date, isGroup = false,
    paymentMode = 'cash', amountReceived = 0, receivedNotes = [],
  } = req.body;

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
      { $match: { date: { $gte: start, $lte: end }, status: { $nin: ['reserved', 'voided'] } } },
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

  // Update cash drawer when cash payment with a known note denomination
  // (runs before payment create so changeBreakdown is captured)
  let drawerChange = null;
  let paymentExtra = {};
  if (type === 'paid' && price > 0) {
    const mode = paymentMode === 'upi' ? 'upi' : 'cash';
    if (mode === 'cash' && Array.isArray(receivedNotes) && receivedNotes.length > 0) {
      try {
        const dateStr    = datePart(couponDate);
        const drawer     = await getOrCreateDrawer(dateStr);
        const totalDue   = price * qty;
        const received   = Math.max(0, Number(amountReceived) || 0);
        const change     = received - totalDue;
        const changeResult = change > 0
          ? computeChange(change, drawer.counts)
          : { breakdown: {}, canMakeExact: true, shortBy: 0 };

        paymentExtra = { receivedNotes, changeBreakdown: changeResult.breakdown };

        // Build denomination inc from every note the customer handed over
        const inc = {};
        for (const note of receivedNotes) {
          const noteMap = NOTE_TO_DRAWER[Number(note)];
          if (noteMap) {
            for (const [d, c] of Object.entries(noteMap)) {
              inc[`counts.${d}`]         = (inc[`counts.${d}`]         || 0) + c;
              inc[`receivedCounts.${d}`] = (inc[`receivedCounts.${d}`] || 0) + c;
            }
          }
        }
        for (const [d, c] of Object.entries(changeResult.breakdown)) {
          inc[`counts.${d}`]       = (inc[`counts.${d}`]       || 0) - c;
          inc[`changeCounts.${d}`] = (inc[`changeCounts.${d}`] || 0) + c;
        }
        if (Object.keys(inc).length) {
          await MahaprasadCashDrawer.updateOne({ date: dateStr }, { $inc: inc });
        }

        drawerChange = {
          breakdown:    changeResult.breakdown,
          canMakeExact: changeResult.canMakeExact,
          shortBy:      changeResult.shortBy,
          total:        change,
        };
      } catch { /* drawer update is non-critical */ }
    }
  }

  // Save payment record for paid coupons
  if (type === 'paid' && price > 0) {
    const totalDue     = price * qty;
    const mode         = paymentMode === 'upi' ? 'upi' : 'cash';
    const received     = mode === 'cash' ? Math.max(0, Number(amountReceived) || 0) : totalDue;
    const changeReturn = mode === 'cash' ? Math.max(0, received - totalDue) : 0;

    MahaprasadPayment.create({
      batchId,
      date:           couponDate,
      couponNumbers:  numbers,
      qty,
      totalDue,
      paymentMode:    mode,
      amountReceived: received,
      changeReturned: changeReturn,
      issuedBy:       req.user._id,
      issuedAt:       new Date(),
      ...paymentExtra,
    }).catch(() => {}); // fire-and-forget; don't fail the coupon issue
  }

  logAction(req, { action: 'mahaprasad.issue', entity: 'MahaprasadCoupon', entityId: batchId, entityRef: batchId, after: { qty, type, isGroup: Boolean(isGroup), groupSize, date: couponDate.toISOString().split('T')[0], occasion: type === 'free' ? occasion : undefined } });
  const msg = isGroup ? `Group coupon (${qty} persons) issued` : `${qty} coupon(s) issued`;
  res.status(201).json(new ApiResponse(201, { coupons, batchId, drawerChange }, msg));
});

// GET /mahaprasad/summary
export const getDailySummary = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const { start, end } = dayBounds(date);

  // Sum groupSize (not document count) so a group coupon of 5 counts as 5 persons
  const GS = { $ifNull: ['$groupSize', 1] };

  const [summaryAgg, paidAgg, settings, myAgg, myPayAgg] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, status: { $nin: ['reserved', 'voided'] } } },
      { $group: {
        _id:      null,
        total:    { $sum: GS },
        redeemed: { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } },
        paid:     { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, GS, 0] } },
      }},
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, type: 'paid', status: { $nin: ['reserved', 'voided'] } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]),
    Settings.getOrCreate(),
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, issuedBy: req.user._id, status: { $nin: ['reserved', 'voided'] } } },
      { $group: { _id: null, count: { $sum: GS } } },
    ]),
    MahaprasadPayment.aggregate([
      { $match: { issuedBy: req.user._id, voided: { $ne: true }, date: { $gte: start, $lte: end } } },
      { $group: { _id: '$paymentMode', total: { $sum: '$totalDue' } } },
    ]),
  ]);

  const s         = summaryAgg[0] || {};
  const total     = s.total    || 0;
  const redeemed  = s.redeemed || 0;
  const paid      = s.paid     || 0;
  const free      = total - paid;
  const collected = paidAgg[0]?.totalAmount || 0;
  const myCount   = myAgg[0]?.count || 0;
  const myCash    = myPayAgg.find((p) => p._id === 'cash')?.total || 0;
  const myUpi     = myPayAgg.find((p) => p._id === 'upi')?.total  || 0;

  res.json(new ApiResponse(200, {
    total, redeemed, pending: total - redeemed, paid, free, collected, myCount, myCash, myUpi,
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
      statuses:   { $addToSet: '$status' },
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

// GET /mahaprasad/report/whatsapp?date=YYYY-MM-DD
export const getMahaprasadWhatsApp = asyncHandler(async (req, res) => {
  const dateStr  = req.query.date || new Date().toISOString().split('T')[0];
  const { start, end } = dayBounds(dateStr);
  const dateLabel = new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const GS = { $ifNull: ['$groupSize', 1] };

  const [summaryAgg, paidAgg, paymentAgg, occasionAgg] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, status: { $nin: ['reserved', 'voided'] } } },
      { $group: {
        _id:      null,
        total:    { $sum: GS },
        redeemed: { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } },
        paid:     { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, GS, 0] } },
        free:     { $sum: { $cond: [{ $eq: ['$type', 'free'] }, GS, 0] } },
      }},
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, type: 'paid', status: { $nin: ['reserved', 'voided'] } } },
      { $group: { _id: null, collected: { $sum: '$amount' } } },
    ]),
    MahaprasadPayment.aggregate([
      { $match: { date: { $gte: start, $lte: end }, voided: { $ne: true } } },
      { $group: { _id: '$paymentMode', total: { $sum: '$totalDue' } } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { date: { $gte: start, $lte: end }, type: 'free', status: { $nin: ['reserved', 'voided'] }, occasion: { $nin: ['', null] } } },
      { $group: { _id: '$occasion', count: { $sum: GS } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const s         = summaryAgg[0] || {};
  const total     = s.total    || 0;
  const redeemed  = s.redeemed || 0;
  const paid      = s.paid     || 0;
  const free      = s.free     || 0;
  const collected = paidAgg[0]?.collected || 0;
  const cashTotal = paymentAgg.find((p) => p._id === 'cash')?.total || 0;
  const upiTotal  = paymentAgg.find((p) => p._id === 'upi')?.total  || 0;
  const pending   = total - redeemed;
  const redPct    = total > 0 ? Math.round((redeemed / total) * 100) : 0;
  const fmtN      = (n) => Number(n || 0).toLocaleString('en-IN');

  const lines = [
    `🙏 *Mangal Grah Mandir, Amalner*`,
    `*🍱 Mahaprasad Daily Report*`,
    `📅 ${dateLabel}`,
    ``,
    `*Coupons Issued:* ${fmtN(total)}`,
    paid > 0 ? `  ├ Paid: ${fmtN(paid)}` : null,
    free > 0 ? `  └ Free: ${fmtN(free)}` : null,
    ``,
    `*Redeemed:* ${fmtN(redeemed)} _(${redPct}%)_`,
    pending > 0 ? `*Pending:* ${fmtN(pending)}` : `*Pending:* 0 ✅`,
    ``,
    `*Collections:*`,
    cashTotal > 0 ? `  ├ Cash: ₹${fmtN(cashTotal)}`        : null,
    upiTotal  > 0 ? `  ├ UPI: ₹${fmtN(upiTotal)}`          : null,
    `  └ Total: ₹${fmtN(collected)}`,
  ].filter((l) => l !== null);

  if (occasionAgg.length) {
    lines.push('', '*Free Coupons by Occasion:*');
    occasionAgg.forEach((o) => lines.push(`  • ${o._id}: ${fmtN(o.count)}`));
  }

  lines.push('', `_Generated by MGM System_`);

  res.json(new ApiResponse(200, { text: lines.join('\n') }));
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

// ── Cash drawer ───────────────────────────────────────────────────────────────

// GET /mahaprasad/cash-drawer?date=YYYY-MM-DD
export const getCashDrawer = asyncHandler(async (req, res) => {
  const dateStr = datePart(req.query.date);
  const [drawer, paymentTotals] = await Promise.all([
    getOrCreateDrawer(dateStr),
    MahaprasadPayment.aggregate([
      { $match: { date: { $gte: new Date(`${req.query.date || new Date().toISOString().split('T')[0]}T00:00:00.000Z`),
                          $lt:  new Date(`${req.query.date || new Date().toISOString().split('T')[0]}T23:59:59.999Z`) } } },
      { $group: { _id: '$paymentMode', total: { $sum: '$totalDue' } } },
    ]),
  ]);
  const total    = DRAWER_DENOMS.reduce((s, d) => s + d * (drawer.counts[String(d)] || 0), 0);
  const cashTotal = paymentTotals.find((p) => p._id === 'cash')?.total || 0;
  const upiTotal  = paymentTotals.find((p) => p._id === 'upi')?.total  || 0;
  res.json(new ApiResponse(200, { ...drawer.toObject(), total, cashTotal, upiTotal }));
});

// PUT /mahaprasad/cash-drawer/float  — set opening float by denomination
export const setOpeningFloat = asyncHandler(async (req, res) => {
  const { date, counts } = req.body;
  if (!counts || typeof counts !== 'object') throw new ApiError(400, 'counts object required');

  const dateStr    = datePart(date);
  const safeCounts = Object.fromEntries(
    DRAWER_DENOMS.map((d) => [String(d), Math.max(0, parseInt(counts[String(d)]) || 0)])
  );

  const drawer = await MahaprasadCashDrawer.findOneAndUpdate(
    { date: dateStr },
    { $set: { counts: safeCounts, openingCounts: safeCounts, isFloatSet: true, openedBy: req.user._id, openedAt: new Date() } },
    { upsert: true, new: true },
  );

  const total = DRAWER_DENOMS.reduce((s, d) => s + d * (drawer.counts[String(d)] || 0), 0);
  logAction(req, {
    action: 'mahaprasad.float_set', entity: 'MahaprasadCashDrawer',
    entityId: dateStr, meta: { total },
  });
  res.json(new ApiResponse(200, { ...drawer.toObject(), total }, 'Opening float set'));
});

// PATCH /mahaprasad/cash-drawer/adjust — manual +/- adjustment on one denomination
export const adjustDrawer = asyncHandler(async (req, res) => {
  const { date, denomination, delta } = req.body;
  const d   = Number(denomination);
  const inc = parseInt(delta) || 0;
  if (!DRAWER_DENOMS.includes(d)) throw new ApiError(400, `Invalid denomination: ${denomination}`);
  if (inc === 0) throw new ApiError(400, 'delta must be non-zero');

  const dateStr = datePart(date);
  const drawer  = await MahaprasadCashDrawer.findOneAndUpdate(
    { date: dateStr },
    { $inc: { [`counts.${d}`]: inc } },
    { upsert: true, new: true },
  );

  // Prevent negative counts
  const count = drawer.counts[String(d)] || 0;
  if (count < 0) {
    await MahaprasadCashDrawer.updateOne({ date: dateStr }, { $set: { [`counts.${d}`]: 0 } });
    drawer.counts[String(d)] = 0;
  }

  const total = DRAWER_DENOMS.reduce((s, dn) => s + dn * (drawer.counts[String(dn)] || 0), 0);
  res.json(new ApiResponse(200, { ...drawer.toObject(), total }));
});

// PATCH /mahaprasad/batches/:batchId/void
export const voidBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  if (!batchId) throw new ApiError(400, 'batchId required');

  const coupons = await MahaprasadCoupon.find({ batchId }).lean();
  if (!coupons.length) throw new ApiError(404, 'Batch not found');

  const hasRedeemed = coupons.some((c) => c.status === 'redeemed');
  if (hasRedeemed) throw new ApiError(409, 'Cannot void — one or more coupons already redeemed');

  const alreadyVoided = coupons.every((c) => c.status === 'voided');
  if (alreadyVoided) throw new ApiError(409, 'Batch already voided');

  // Mark all coupons voided
  await MahaprasadCoupon.updateMany({ batchId }, { $set: { status: 'voided' } });

  // Void the payment record and reverse the drawer
  const payment = await MahaprasadPayment.findOneAndUpdate(
    { batchId },
    { $set: { voided: true, voidedAt: new Date(), voidedBy: req.user._id } },
    { new: true },
  );

  if (payment && payment.paymentMode === 'cash' && payment.receivedNotes?.length) {
    const dateStr = datePart(payment.date.toISOString().split('T')[0]);
    const inc = {};
    for (const note of payment.receivedNotes) {
      const noteMap = NOTE_TO_DRAWER[Number(note)];
      if (noteMap) {
        for (const [d, c] of Object.entries(noteMap)) {
          inc[`counts.${d}`]         = (inc[`counts.${d}`]         || 0) - c;
          inc[`receivedCounts.${d}`] = (inc[`receivedCounts.${d}`] || 0) - c;
        }
      }
    }
    const breakdown = payment.changeBreakdown || {};
    for (const [d, c] of Object.entries(breakdown)) {
      inc[`counts.${d}`]       = (inc[`counts.${d}`]       || 0) + Number(c);
      inc[`changeCounts.${d}`] = (inc[`changeCounts.${d}`] || 0) - Number(c);
    }
    if (Object.keys(inc).length) {
      await MahaprasadCashDrawer.updateOne({ date: dateStr }, { $inc: inc }).catch(() => {});
    }
  }

  logAction(req, { action: 'mahaprasad.void', entity: 'MahaprasadCoupon', entityRef: batchId,
    meta: { count: coupons.length } });
  res.json(new ApiResponse(200, { batchId, voided: coupons.length }, `${coupons.length} coupon(s) voided`));
});
