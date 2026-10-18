import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import MahaprasadPayment from '../models/MahaprasadPayment.js';
import MahaprasadCashDrawer from '../models/MahaprasadCashDrawer.js';
import Settings from '../models/Settings.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { getPermissionsForRole } from '../middleware/authorize.js';
import { logger } from '../utils/logger.js';
import { APP_TIMEZONE, localDateStr } from '../utils/dates.js';
import { temple } from '../services/temple.service.js';
import { sendCouponMessage } from '../services/mahaprasadNotify.service.js';
import { couponImageUrl, couponPageUrl } from '../utils/publicUrl.js';
import {
  GS, NOT_SOLD, adjustPersons, datePart, dayBounds, generateCouponNumbers, getPriceForDate,
  nanoid, newShareToken, personsCounter, takePersons,
} from '../services/mahaprasadSale.service.js';

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
    { upsert: true, returnDocument: 'after' },
  );
}

// Shown as "issued by" for coupons devotees bought on the public page (/prasad)
const ONLINE_ISSUER = { _id: null, name: 'Online' };

// Why a coupon can't be served. `code` lets the redeem screen show the right warning.
function refuseUnredeemable(coupon) {
  if (coupon.status === 'redeemed') {
    const at = coupon.redeemedAt ? new Date(coupon.redeemedAt).toLocaleString('en-IN') : 'earlier';
    throw new ApiError(409, `Already redeemed on ${at}`, [{ code: 'redeemed' }]);
  }
  if (coupon.status === 'voided') {
    throw new ApiError(409, `Coupon ${coupon.couponNumber} was cancelled — do not serve`, [{ code: 'voided' }]);
  }
  if (coupon.status === 'reserved') {
    throw new ApiError(409,
      `Coupon ${coupon.couponNumber} has not been sold — if it was issued offline, sync that counter first`,
      [{ code: 'not_sold' }]);
  }
  // Bought on the public page while Razorpay had test keys: nobody paid for it
  if (coupon.testMode) {
    throw new ApiError(409, `Coupon ${coupon.couponNumber} is a TEST coupon (no real payment) — do not serve`, [{ code: 'test' }]);
  }
}

// ── Controllers ───────────────────────────────────────────────────────────────

// POST /mahaprasad/issue
export const issueCoupons = asyncHandler(async (req, res) => {
  const {
    quantity = 1, type = 'paid', occasion = '', date, isGroup = false,
    paymentMode = 'cash', amountReceived = 0, receivedNotes = [], mobile, name = '',
  } = req.body;
  const devoteeName = type === 'free' ? String(name || '').trim() : '';   // asked for Free Seva

  const qty        = Math.min(Math.max(1, parseInt(quantity) || 1), 200);
  const groupSize  = isGroup ? qty : 1;   // persons per coupon document
  const couponCount = isGroup ? 1 : qty;  // number of documents to create

  const couponDate = date ? new Date(date) : new Date();
  couponDate.setHours(12, 0, 0, 0);

  const settings = await Settings.getOrCreate();
  const price    = type === 'free' ? 0 : getPriceForDate(settings, couponDate);

  // Daily limit — counts persons (a group of 5 is 5), taken atomically before anything is saved
  await takePersons(couponDate, qty, settings.mahaprasadDailyCap || 0);

  const batchId  = nanoid(10);
  const shareToken = newShareToken();
  const dateStr  = datePart(couponDate);
  const paid     = type === 'paid' && price > 0;
  const mode     = paymentMode === 'upi' ? 'upi' : 'cash';
  const totalDue = price * qty;
  // Anything that fails from here gives the persons back and removes this batch's coupons, so a
  // sale is either saved with its payment or not at all.
  const undo = async () => {
    await MahaprasadCoupon.deleteMany({ batchId }).catch((err) => logger.error('Mahaprasad: could not undo coupons', { batchId, error: err.message }));
    await adjustPersons(couponDate, -qty).catch((err) => logger.error('Mahaprasad: could not give back the daily limit', { batchId, error: err.message }));
  };

  let numbers, coupons;
  try {
    numbers = await generateCouponNumbers(couponDate, couponCount);
    coupons = await MahaprasadCoupon.insertMany(numbers.map((n) => ({
      couponNumber: n,
      date:         couponDate,
      type,
      amount:       isGroup ? price * groupSize : price,  // total amount for group
      occasion:     type === 'free' ? (occasion || '') : '',
      mobile,
      name:         devoteeName,
      status:       'issued',
      issuedBy:     req.user._id,
      issuedAt:     new Date(),
      batchId,
      groupSize,
      isGroup:      Boolean(isGroup),
      shareToken,
    })), { ordered: true });
  } catch (err) {
    await undo();
    throw err;
  }

  // Cash with the notes handed over: work out the change from what's in the drawer. The drawer
  // itself is updated once the payment is saved.
  let drawerChange = null;
  let drawerInc    = null;
  let paymentExtra = {};
  if (paid && mode === 'cash' && Array.isArray(receivedNotes) && receivedNotes.length > 0) {
    try {
      const drawer   = await getOrCreateDrawer(dateStr);
      const received = Math.max(0, Number(amountReceived) || 0);
      const change   = received - totalDue;
      const changeResult = change > 0
        ? computeChange(change, drawer.counts)
        : { breakdown: {}, canMakeExact: true, shortBy: 0 };

      // Every note the devotee handed over goes in; the change goes out
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
      if (Object.keys(inc).length) drawerInc = inc;
      paymentExtra = { receivedNotes, changeBreakdown: changeResult.breakdown };
      drawerChange = {
        breakdown:    changeResult.breakdown,
        canMakeExact: changeResult.canMakeExact,
        shortBy:      changeResult.shortBy,
        total:        change,
      };
    } catch (err) {
      // The sale still goes through and its money is in the payment record; only the note count is missed
      logger.error('Mahaprasad: cash drawer could not be read', { batchId, error: err.message });
    }
  }

  // The payment record is the money. Without it the sale isn't accounted for, so undo the coupons.
  if (paid) {
    const received = mode === 'cash' ? Math.max(0, Number(amountReceived) || 0) : totalDue;
    try {
      await MahaprasadPayment.create({
        batchId,
        date:           couponDate,
        couponNumbers:  numbers,
        qty,
        mobile,
        totalDue,
        paymentMode:    mode,
        amountReceived: received,
        changeReturned: mode === 'cash' ? Math.max(0, received - totalDue) : 0,
        issuedBy:       req.user._id,
        issuedAt:       new Date(),
        ...paymentExtra,
      });
    } catch (err) {
      logger.error('Mahaprasad: payment record not saved — sale undone', { batchId, error: err.message });
      await undo();
      throw new ApiError(500, 'The payment could not be saved, so no coupons were issued — please try again');
    }
  }

  if (drawerInc) {
    await MahaprasadCashDrawer.updateOne({ date: dateStr }, { $inc: drawerInc })
      .catch((err) => logger.error('Mahaprasad: cash drawer not updated', { batchId, error: err.message }));
  }

  logAction(req, { action: 'mahaprasad.issue', entity: 'MahaprasadCoupon', entityId: batchId, entityRef: coupons[0]._id, after: { qty, type, isGroup: Boolean(isGroup), groupSize, date: localDateStr(couponDate), occasion: type === 'free' ? occasion : undefined, name: devoteeName || undefined, mobile, amount: paid ? totalDue : 0, paymentMode: paid ? mode : undefined } });
  // Coupon numbers to the devotee's phone, in the background (only when WhatsApp / SMS is set up for it).
  const shareUrl = couponPageUrl(shareToken);
  sendCouponMessage({ mobile, numbers, date: couponDate, persons: qty, link: shareUrl, image: couponImageUrl(shareToken) });
  const msg = isGroup ? `Group coupon (${qty} persons) issued` : `${qty} coupon(s) issued`;
  res.status(201).json(new ApiResponse(201, { coupons, batchId, drawerChange, shareUrl, shareImageUrl: couponImageUrl(shareToken) }, msg));
});

// GET /mahaprasad/summary
export const getDailySummary = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const { start, end } = dayBounds(date);

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
  // Numbers held for offline sale (reserved) aren't coupons yet — never listed
  filter.status = status || { $ne: 'reserved' };
  if (type)   filter.type   = type;
  // Search by coupon number, the devotee's mobile number (4+ digits) or name (Free Seva)
  if (search) {
    const s = String(search).trim();
    const digits = s.replace(/\D/g, '');
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const or = [{ couponNumber: { $regex: escaped.toUpperCase(), $options: 'i' } }];
    if (digits.length >= 4 && !/^MP/i.test(s)) or.push({ mobile: { $regex: digits.slice(-10) } });
    if (/\p{L}/u.test(s) && !/^MP-?\d/i.test(s)) or.push({ name: { $regex: escaped, $options: 'i' } });
    filter.$or = or;
  }

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
  // Bought on the public page: no staff issued it
  for (const c of coupons) if (c.channel === 'online' && !c.issuedBy) c.issuedBy = ONLINE_ISSUER;

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
  const coupon = await MahaprasadCoupon.findOne({ couponNumber: req.params.number }).lean();
  if (!coupon) throw new ApiError(404, `Coupon ${req.params.number} not found`);
  refuseUnredeemable(coupon);

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

  // Only an issued coupon turns into a redeemed one, in one step — two counters scanning the same
  // coupon at once can't both serve it, nor can one that was cancelled a moment ago.
  const redeemed = await MahaprasadCoupon.findOneAndUpdate(
    { _id: coupon._id, status: 'issued' },
    { $set: { status: 'redeemed', redeemedBy: req.user._id, redeemedAt: new Date() } },
    { returnDocument: 'after' },
  ).populate('issuedBy', 'name').populate('redeemedBy', 'name').lean();
  if (!redeemed) {
    refuseUnredeemable(await MahaprasadCoupon.findById(coupon._id).lean() || coupon);
    throw new ApiError(409, 'Coupon could not be redeemed — please scan again');
  }
  logAction(req, { action: 'mahaprasad.redeem', entity: 'MahaprasadCoupon', entityId: coupon.couponNumber, entityRef: coupon._id });

  res.json(new ApiResponse(200, redeemed, 'Coupon redeemed'));
});

// GET /mahaprasad/batches?date=YYYY-MM-DD
export const getBatches = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const { start, end } = dayBounds(date);

  const batches = await MahaprasadCoupon.aggregate([
    // Numbers held by offline counters aren't sales yet
    { $match: { date: { $gte: start, $lte: end }, status: { $ne: 'reserved' } } },
    { $sort:  { couponNumber: 1 } },
    { $group: {
      _id:        '$batchId',
      count:      { $sum: 1 },
      type:       { $first: '$type' },
      occasion:   { $first: '$occasion' },
      mobile:     { $first: '$mobile' },
      name:       { $first: '$name' },
      issuedAt:   { $first: '$issuedAt' },
      issuedById: { $first: '$issuedBy' },
      numbers:    { $push: '$couponNumber' },
      couponFrom: { $first: '$couponNumber' },
      couponTo:   { $last: '$couponNumber' },
      groupSize:  { $first: '$groupSize' },
      isGroup:    { $first: '$isGroup' },
      shareToken: { $first: '$shareToken' },
      channel:    { $first: '$channel' },
      statuses:   { $addToSet: '$status' },
    }},
    { $sort: { issuedAt: -1 } },
  ]);

  // Manually hydrate issuedBy
  const User = (await import('../models/User.js')).default;
  const userIds = [...new Set(batches.map((b) => b.issuedById?.toString()).filter(Boolean))];
  const users   = await User.find({ _id: { $in: userIds } }).select('name').lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));
  const result  = batches.map(({ shareToken, ...b }) => ({
    ...b,
    issuedBy: b.issuedById ? { _id: b.issuedById, name: userMap[b.issuedById.toString()] || '—' } : b.channel === 'online' ? ONLINE_ISSUER : null,
    shareUrl: shareToken ? couponPageUrl(shareToken) : null,   // sales from before links existed have none
    shareImageUrl: shareToken ? couponImageUrl(shareToken) : null,   // the QR picture, for the WhatsApp button
  }));

  res.json(new ApiResponse(200, result));
});

// GET /mahaprasad/print  ?numbers=MP-...,MP-...
export const printCoupons = asyncHandler(async (req, res) => {
  const numberList = req.query.numbers?.split(',').filter(Boolean) || [];
  if (!numberList.length) throw new ApiError(400, 'No coupon numbers provided');

  // Never print a cancelled coupon or a number that was never sold — it would look valid
  const coupons = await MahaprasadCoupon.find({ couponNumber: { $in: numberList }, status: { $nin: NOT_SOLD } }).lean();
  if (!coupons.length) throw new ApiError(404, 'No coupons to print — they were cancelled or never sold');

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
    { $match: { ...filter, status: { $nin: NOT_SOLD } } },
    { $group: {
      _id:       { $dateToString: { format: '%Y-%m', date: '$date', timezone: APP_TIMEZONE } },
      total:     { $sum: GS },
      redeemed:  { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } },
      paid:      { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, GS, 0] } },
      free:      { $sum: { $cond: [{ $eq: ['$type',   'free']     }, GS, 0] } },
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

  const [issuedRows, redeemedRows, paymentRows] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, status: { $nin: NOT_SOLD } } },
      { $group: {
        _id:       '$issuedBy',
        issued:    { $sum: GS },
        paid:      { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, GS, 0] } },   // persons, like issued and free seva
        freeSeva:  { $sum: { $cond: [{ $eq: ['$type', 'free'] }, GS, 0] } },
        collected: { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, '$amount', 0] } },
      }},
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, status: 'redeemed' } },
      { $group: { _id: '$redeemedBy', redeemed: { $sum: GS } } },
    ]),
    // The money by how it was paid: cash and UPI at the counters, online on the public page (no staff)
    MahaprasadPayment.aggregate([
      { $match: { ...filter, voided: { $ne: true } } },
      { $group: { _id: { by: '$issuedBy', mode: '$paymentMode' }, total: { $sum: '$totalDue' } } },
    ]),
  ]);
  const byMode = new Map();   // user id (or 'online') → { cash, upi, online }
  for (const p of paymentRows) {
    const key = p._id.by?.toString() || 'online';
    const m = byMode.get(key) || { cash: 0, upi: 0, online: 0 };
    if (p._id.mode in m) m[p._id.mode] += p.total;
    byMode.set(key, m);
  }
  const money = (key) => byMode.get(key) || { cash: 0, upi: 0, online: 0 };

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
    const uid = r._id?.toString();
    // No staff on it: bought by devotees on the public page
    if (!uid) { merged.set('online', { userId: 'online', name: 'Online (website)', issued: r.issued, paid: r.paid, freeSeva: r.freeSeva, collected: r.collected, redeemed: 0, ...money('online') }); return; }
    merged.set(uid, { userId: uid, name: userMap[uid] || 'Unknown', issued: r.issued, paid: r.paid, freeSeva: r.freeSeva, collected: r.collected, redeemed: redeemedMap[uid] || 0, ...money(uid) });
  });
  redeemedRows.forEach((r) => {
    const uid = r._id?.toString(); if (!uid || merged.has(uid)) return;
    merged.set(uid, { userId: uid, name: userMap[uid] || 'Unknown', issued: 0, paid: 0, freeSeva: 0, collected: 0, redeemed: r.redeemed, ...money(uid) });
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
        _id:    { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: APP_TIMEZONE } },
        count:  { $sum: GS },
        paid:   { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, GS, 0] } },
        free:   { $sum: { $cond: [{ $eq: ['$type', 'free'] }, GS, 0] } },
        wasted: { $sum: '$amount' },
      }},
      { $sort: { _id: -1 } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: wasteFilter },
      { $group: { _id: null, count: { $sum: GS }, paid: { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, GS, 0] } }, free: { $sum: { $cond: [{ $eq: ['$type', 'free'] }, GS, 0] } }, wasted: { $sum: '$amount' } } },
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
  const dateStr  = req.query.date || localDateStr();
  const { start, end } = dayBounds(dateStr);
  const dateLabel = new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

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
  const onlineTotal = paymentAgg.find((p) => p._id === 'online')?.total || 0;
  const pending   = total - redeemed;
  const redPct    = total > 0 ? Math.round((redeemed / total) * 100) : 0;
  const fmtN      = (n) => Number(n || 0).toLocaleString('en-IN');

  // Short date label: "19 Jun 2026" — used in the copyable summary line
  const shortDate = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const lines = [
    `📿 ${temple().name} — ${shortDate}`,
    `Coupons: ${fmtN(total)} | Free: ${fmtN(free)} | Paid: ${fmtN(paid)}`,
    `Redeemed: ${fmtN(redeemed)} (${redPct}%) | Pending: ${fmtN(pending)}`,
    (cashTotal > 0 || upiTotal > 0 || onlineTotal > 0)
      ? [`Cash: ₹${fmtN(cashTotal)}`, `UPI: ₹${fmtN(upiTotal)}`, onlineTotal > 0 && `Online: ₹${fmtN(onlineTotal)}`].filter(Boolean).join(' | ')
      : null,
    `Total: ₹${fmtN(collected)}`,
  ].filter(Boolean);

  if (occasionAgg.length) {
    lines.push('');
    occasionAgg.forEach((o) => lines.push(`${o._id}: ${fmtN(o.count)} free coupons`));
  }

  lines.push('— Sent via MGM Counter');

  res.json(new ApiResponse(200, {
    text: lines.join('\n'),
    data: { total, free, paid, redeemed, pending, redPct, cashTotal, upiTotal, onlineTotal, collected, shortDate, dateLabel },
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

  const [rows, occasionRows, settings, freeRows] = await Promise.all([
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, status: { $nin: NOT_SOLD } } },
      { $group: {
        _id:       { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: APP_TIMEZONE } },
        total:     { $sum: GS },
        redeemed:  { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } },
        paid:      { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, GS, 0] } },
        free:      { $sum: { $cond: [{ $eq: ['$type',   'free']     }, GS, 0] } },
        collected: { $sum: { $cond: [{ $eq: ['$type',   'paid']     }, '$amount', 0] } },
        // …of which bought online (the public page)
        online:    { $sum: { $cond: [{ $eq: ['$channel', 'online'] }, '$amount', 0] } },
      }},
      { $sort: { _id: -1 } },
    ]),
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, status: { $nin: NOT_SOLD }, type: 'free', occasion: { $nin: [null, ''] } } },
      { $group: { _id: '$occasion', count: { $sum: GS }, redeemed: { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    Settings.getOrCreate(),
    // Free Seva, one row per issue: who received it, for what, how many persons (latest 500)
    MahaprasadCoupon.aggregate([
      { $match: { ...filter, status: { $nin: NOT_SOLD }, type: 'free' } },
      { $group: {
        _id:      '$batchId',
        name:     { $first: '$name' },
        mobile:   { $first: '$mobile' },
        occasion: { $first: '$occasion' },
        date:     { $first: '$date' },
        issuedAt: { $first: '$issuedAt' },
        issuedBy: { $first: '$issuedBy' },
        persons:  { $sum: GS },
        redeemed: { $sum: { $cond: [{ $eq: ['$status', 'redeemed'] }, GS, 0] } },
      } },
      { $sort: { issuedAt: -1 } },
      { $limit: 500 },
    ]),
  ]);
  const freeStaff = await (await import('../models/User.js')).default
    .find({ _id: { $in: [...new Set(freeRows.map((r) => r.issuedBy?.toString()).filter(Boolean))] } }).select('name').lean();
  const freeStaffName = Object.fromEntries(freeStaff.map((u) => [u._id.toString(), u.name]));
  const freeSeva = freeRows.map(({ _id, issuedBy, ...r }) => ({ ...r, batchId: _id, issuedBy: issuedBy ? freeStaffName[issuedBy.toString()] || '—' : '' }));

  const totals = rows.reduce(
    (acc, r) => ({
      total:     acc.total     + r.total,
      redeemed:  acc.redeemed  + r.redeemed,
      paid:      acc.paid      + r.paid,
      free:      acc.free      + r.free,
      collected: acc.collected + r.collected,
      online:    acc.online    + r.online,
    }),
    { total: 0, redeemed: 0, paid: 0, free: 0, collected: 0, online: 0 }
  );

  res.json(new ApiResponse(200, {
    rows,
    totals,
    occasionBreakdown: occasionRows,
    freeSeva,
    dayPricing: settings.mahaprasadDayPricing,
  }));
});

// ── Offline support ───────────────────────────────────────────────────────────

// POST /mahaprasad/offline/reserve
// Holds a block of new coupon numbers for this counter to sell while offline. Numbers held
// earlier are never taken back: the counter may already have sold some that it hasn't synced
// yet. Unused ones stay "reserved", which counts nowhere and can't be printed or redeemed.
export const reserveOffline = asyncHandler(async (req, res) => {
  const { qty = 200, date } = req.body;
  const n = Math.min(Math.max(1, parseInt(qty) || 200), 500);

  const couponDate = date ? new Date(date) : new Date();
  couponDate.setHours(12, 0, 0, 0);

  const settings = await Settings.getOrCreate();
  const numbers   = await generateCouponNumbers(couponDate, n);
  const batchId   = nanoid();

  const docs = numbers.map((num) => ({
    couponNumber: num,
    date:         couponDate,
    type:         'paid',
    amount:       0, // not sold yet — the price is set when the sale syncs
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

// GET /api/public/mahaprasad/:token — no sign-in. The page the devotee opens from the WhatsApp /
// SMS link: each coupon of the sale with its QR (the coupon number, as on paper), for the food
// counter to scan off the phone. The link is as good as the paper coupon — each coupon is still
// served once. No mobile number or amount.
export const publicCoupons = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new ApiError(404, 'Coupon not found');
  const [coupons, settings] = await Promise.all([
    MahaprasadCoupon.find({ shareToken: token, status: { $ne: 'reserved' } })
      .select('-_id couponNumber date type occasion status groupSize isGroup redeemedAt channel testMode')
      .sort({ couponNumber: 1 })
      .lean(),
    Settings.getOrCreate(),
  ]);
  if (!coupons.length) throw new ApiError(404, 'Coupon not found');
  res.json(new ApiResponse(200, {
    coupons,
    validityDays: settings.mahaprasadCouponValidityDays ?? 1,
    temple: temple(),
    // Bought on the public page: it has a payment receipt (/api/public/mahaprasad/<token>/receipt.pdf)
    online: coupons.some((c) => c.channel === 'online'),
    // …bought with Razorpay test keys: the page says it isn't valid at the hall
    test: coupons.some((c) => c.testMode),
  }));
});

// GET /api/public/mahaprasad/:token/qr.png — no sign-in. The same coupons as a picture, for the
// top of the WhatsApp message: Meta fetches it when sending, so the QR sits in the devotee's chat
// and needs no internet at the hall.
export const publicCouponsImage = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new ApiError(404, 'Coupon not found');
  const coupons = await MahaprasadCoupon.find({ shareToken: token, status: { $ne: 'reserved' } })
    .select('-_id couponNumber date type occasion status groupSize')
    .sort({ couponNumber: 1 })
    .lean();
  if (!coupons.length) throw new ApiError(404, 'Coupon not found');
  const { couponsQrPng } = await import('../services/mahaprasadQrImage.js');
  const png = await couponsQrPng(coupons, { temple: temple() });
  res.set('Cache-Control', 'public, max-age=300').type('png').send(png);
});

// GET /mahaprasad/offline/redeem-copy
// The food counter's copy for working offline: every coupon that may still be served (within
// its validity, up to a week back, and any for later dates), plus the ones already served or
// cancelled so the phone can say so. Only what the redeem screen shows — no mobile numbers.
export const getRedeemCopy = asyncHandler(async (req, res) => {
  const settings     = await Settings.getOrCreate();
  const validityDays = settings.mahaprasadCouponValidityDays ?? 1;
  const from = new Date(); from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (Math.min(validityDays > 0 ? validityDays : 7, 7) - 1));
  const coupons = await MahaprasadCoupon.find({ date: { $gte: from }, status: { $ne: 'reserved' } })
    .select('couponNumber date type amount occasion status issuedAt issuedBy redeemedAt redeemedBy groupSize isGroup testMode')
    .populate('issuedBy', 'name')
    .populate('redeemedBy', 'name')
    .lean();
  res.json(new ApiResponse(200, { coupons, validityDays, at: new Date() }));
});

// POST /mahaprasad/offline/sync
// Applies what a counter did while offline. Safe to send twice (a sync whose answer was lost):
// anything already recorded counts as done. The food counter (mahaprasad:redeem) sends only
// redemptions; sales made offline need mahaprasad:issue.
export const syncOffline = asyncHandler(async (req, res) => {
  const { issued = [], redeemed = [] } = req.body;
  if (issued.length) {
    const perms = await getPermissionsForRole(req.user.role);
    if (!perms.includes('*') && !perms.includes('mahaprasad:issue')) {
      throw new ApiError(403, 'Only issue-counter staff can send coupons sold offline');
    }
  }
  const results = {
    issued:   { ok: 0, skipped: 0, failed: [] },
    redeemed: { ok: 0, skipped: 0, conflicts: [] },
  };
  const settings = await Settings.getOrCreate();

  // ── Sales: a held number becomes an issued coupon at the day's price (worked out here, not
  // on the phone). It stays with the person who held it — that's whose counter sold it.
  const held = await MahaprasadCoupon.find({ couponNumber: { $in: issued.map((i) => i.couponNumber) } })
    .select('couponNumber date status batchId issuedBy issuedAt type amount').lean();
  const byNumber = new Map(held.map((c) => [c.couponNumber, c]));
  const days = new Map(held.filter((c) => c.status === 'reserved').map((c) => [datePart(c.date), c.date]));
  for (const day of days.values()) await personsCounter(day);

  const touched = new Map(); // batchId → payment details, for the paid batches in this sync
  const links   = new Map(); // batchId → share token, so a sale's coupons share one link
  const linkFor = (batchId) => { if (!links.has(batchId)) links.set(batchId, newShareToken()); return links.get(batchId); };
  const paymentFor = (batchId, c, item, issuedAt) => {
    if (!touched.has(batchId)) touched.set(batchId, { date: c.date, mobile: item.mobile || '', issuedBy: c.issuedBy, issuedAt,
      paymentMode: item.paymentMode === 'upi' ? 'upi' : 'cash' });
  };
  for (const item of issued) {
    const c       = byNumber.get(item.couponNumber);
    const batchId = `off-${item.batchId || nanoid()}`;
    if (c?.status !== 'reserved') {
      const already = c && ['issued', 'redeemed'].includes(c.status) && [batchId, item.batchId].includes(c.batchId);
      if (already) {
        results.issued.ok++;
        if (c.amount > 0) paymentFor(c.batchId, c, item, c.issuedAt); // in case the first sync stopped before its payment
      } else {
        results.issued.skipped++;
        results.issued.failed.push({ couponNumber: item.couponNumber, reason: c ? c.status : 'not_found' });
      }
      continue;
    }
    const type   = item.type === 'free' ? 'free' : 'paid';
    const amount = type === 'paid' ? getPriceForDate(settings, c.date) : 0;
    const issuedAt = item.issuedAt ? new Date(item.issuedAt) : new Date();
    const updated = await MahaprasadCoupon.findOneAndUpdate(
      { _id: c._id, status: 'reserved' },
      { $set: {
        status: 'issued', type, amount, issuedAt, batchId,
        occasion: type === 'free' ? (item.occasion || '') : '',
        mobile:   item.mobile || '',
        name:     type === 'free' ? String(item.name || '').trim() : '',
        groupSize: 1, isGroup: false, shareToken: linkFor(batchId),
      } },
    );
    if (!updated) { results.issued.skipped++; results.issued.failed.push({ couponNumber: item.couponNumber, reason: 'changed' }); continue; }
    results.issued.ok++;
    // Sold while offline, so counted even past the daily limit
    await adjustPersons(c.date, 1);
    if (amount > 0) paymentFor(batchId, c, item, issuedAt);
  }

  // One payment record per batch sold offline, built from its coupons so a repeated sync
  // writes the same thing again. A batch already cancelled keeps its cancelled record.
  for (const [batchId, b] of touched) {
    const sold  = await MahaprasadCoupon.find({ batchId, status: { $in: ['issued', 'redeemed'] } }).select('couponNumber amount').lean();
    const total = sold.reduce((s, c) => s + (c.amount || 0), 0);
    await MahaprasadPayment.updateOne(
      { batchId, voided: { $ne: true } },
      {
        $setOnInsert: { date: b.date, mobile: b.mobile, paymentMode: b.paymentMode, issuedBy: b.issuedBy, issuedAt: b.issuedAt, offline: true },
        $set: { couponNumbers: sold.map((c) => c.couponNumber), qty: sold.length, totalDue: total, amountReceived: total },
      },
      { upsert: true },
    ).catch((err) => { if (err.code !== 11000) throw err; });
  }

  // ── Redemptions: only an issued coupon can be served (sales above come first, so a coupon
  // sold and served on the same offline phone works). Cancelled or never-sold ones are refused.
  for (const item of redeemed) {
    const redeemedAt = item.redeemedAt ? new Date(item.redeemedAt) : new Date();
    const updated = await MahaprasadCoupon.findOneAndUpdate(
      { couponNumber: item.couponNumber, status: 'issued', testMode: { $ne: true } },
      { $set: { status: 'redeemed', redeemedBy: item.redeemedById || req.user._id, redeemedAt } },
    );
    if (updated) { results.redeemed.ok++; continue; }
    const c = await MahaprasadCoupon.findOne({ couponNumber: item.couponNumber }).select('status redeemedAt testMode').lean();
    if (c?.status === 'redeemed' && c.redeemedAt?.getTime() === redeemedAt.getTime()) { results.redeemed.ok++; continue; } // sent before
    results.redeemed.skipped++;
    results.redeemed.conflicts.push({
      couponNumber: item.couponNumber,
      reason: !c ? 'not_found' : c.status === 'redeemed' ? 'already_redeemed' : c.status === 'voided' ? 'voided' : c.testMode ? 'test' : 'not_sold',
    });
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
  const { start, end } = dayBounds(req.query.date);
  const [drawer, paymentTotals] = await Promise.all([
    getOrCreateDrawer(dateStr),
    MahaprasadPayment.aggregate([
      { $match: { date: { $gte: start, $lte: end }, voided: { $ne: true } } },
      { $group: { _id: '$paymentMode', total: { $sum: '$totalDue' } } },
    ]),
  ]);
  const total    = DRAWER_DENOMS.reduce((s, d) => s + d * (drawer.counts[String(d)] || 0), 0);
  const cashTotal = paymentTotals.find((p) => p._id === 'cash')?.total || 0;
  const upiTotal  = paymentTotals.find((p) => p._id === 'upi')?.total  || 0;
  const onlineTotal = paymentTotals.find((p) => p._id === 'online')?.total || 0;   // not in the drawer: paid on the public page
  res.json(new ApiResponse(200, { ...drawer.toObject(), total, cashTotal, upiTotal, onlineTotal }));
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
    { upsert: true, returnDocument: 'after' },
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
    { upsert: true, returnDocument: 'after' },
  );

  // Prevent negative counts
  const count = drawer.counts[String(d)] || 0;
  if (count < 0) {
    await MahaprasadCashDrawer.updateOne({ date: dateStr }, { $set: { [`counts.${d}`]: 0 } });
    drawer.counts[String(d)] = 0;
  }

  const total = DRAWER_DENOMS.reduce((s, dn) => s + dn * (drawer.counts[String(dn)] || 0), 0);
  logAction(req, {
    action: 'mahaprasad.drawer_adjust', entity: 'MahaprasadCashDrawer', entityId: dateStr, entityRef: drawer._id,
    meta: { denomination: d, change: inc, notesNow: count < 0 ? 0 : count, drawerTotal: total },
  });
  res.json(new ApiResponse(200, { ...drawer.toObject(), total }));
});

// PATCH /mahaprasad/batches/:batchId/void  { reason }
// Counter staff can cancel only their own sales from today (a mistake caught on the spot);
// anything else needs mahaprasad:void. A second tap finds nothing left to cancel, so the
// money comes off the drawer once.
export const voidBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { reason } = req.body;

  const coupons = await MahaprasadCoupon.find({ batchId, status: { $ne: 'reserved' } }).lean();
  if (!coupons.length) throw new ApiError(404, 'Batch not found');
  if (coupons.some((c) => c.status === 'redeemed')) throw new ApiError(409, 'Cannot void — one or more coupons already redeemed');
  const live = coupons.filter((c) => c.status === 'issued');
  if (!live.length) throw new ApiError(409, 'Batch already voided');

  const perms = await getPermissionsForRole(req.user.role);
  if (!perms.includes('*') && !perms.includes('mahaprasad:void')) {
    const own   = live.every((c) => String(c.issuedBy) === String(req.user._id));
    const today = live.every((c) => localDateStr(new Date(c.issuedAt)) === localDateStr());
    if (!own || !today) throw new ApiError(403, 'You can cancel only coupons you issued today — ask an admin to cancel this one');
  }

  const couponDate = live[0].date;
  const persons    = live.reduce((s, c) => s + (c.groupSize || 1), 0);
  await personsCounter(couponDate); // before the coupons change, so it starts from the right number

  // Only coupons still issued are cancelled. If one was redeemed meanwhile, put this request's
  // back and stop — half a batch is never cancelled.
  const voidedAt = new Date();
  const stamp    = { voidedAt, voidedBy: req.user._id, voidReason: reason };
  const { modifiedCount } = await MahaprasadCoupon.updateMany({ batchId, status: 'issued' }, { $set: { status: 'voided', ...stamp } });
  if (modifiedCount === 0) throw new ApiError(409, 'Batch already voided');
  if (modifiedCount < live.length) {
    await MahaprasadCoupon.updateMany(
      { batchId, status: 'voided', voidedAt, voidedBy: req.user._id },
      { $set: { status: 'issued' }, $unset: { voidedAt: 1, voidedBy: 1, voidReason: 1 } },
    );
    throw new ApiError(409, 'Cannot void — a coupon in this batch was just redeemed or cancelled');
  }
  await adjustPersons(couponDate, -persons);

  // Cancel the payment once; only the request that cancels it takes the money off the drawer
  const payment = await MahaprasadPayment.findOneAndUpdate(
    { batchId, voided: { $ne: true } },
    { $set: { voided: true, ...stamp } },
    { returnDocument: 'after' },
  );

  if (payment && payment.paymentMode === 'cash' && payment.receivedNotes?.length) {
    const dateStr = datePart(payment.date);
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
      await MahaprasadCashDrawer.updateOne({ date: dateStr }, { $inc: inc })
        .catch((err) => logger.error('Mahaprasad: cash drawer not reversed for a cancelled batch', { batchId, error: err.message }));
    }
  }

  logAction(req, {
    action: 'mahaprasad.void', entity: 'MahaprasadCoupon', entityId: batchId, entityRef: live[0]._id,
    before: { numbers: live.map((c) => c.couponNumber), persons, mobile: live[0].mobile || undefined,
      issuedBy: String(live[0].issuedBy), issuedAt: live[0].issuedAt },
    meta: { reason, amount: payment?.totalDue || 0, paymentMode: payment?.paymentMode },
  });
  res.json(new ApiResponse(200, { batchId, voided: live.length }, `${live.length} coupon(s) voided`));
});
