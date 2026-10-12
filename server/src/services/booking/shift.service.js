import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import BookingShift from '../../models/BookingShift.js';
import ApiError from '../../utils/ApiError.js';
import { dateKeyOf, dateKeyToDate, denominationTotal, DENOMINATIONS, shiftCash } from './rules.js';

// A counter person's shift runs from their last handover to the moment they close it. Every
// booking they took in between (not yet in a shift) is linked to the closed shift, so nothing is
// counted twice and nothing is missed. Someone's first close takes everything they booked since
// shift closing started at the temple (the first handover anyone made) — so a new clerk who didn't
// close on Monday hands Monday's cash over on Tuesday. Bookings from before then are left alone.

const toId = (id) => new mongoose.Types.ObjectId(String(id));

async function openRange(userId) {
  const [first, last, goLive] = await Promise.all([
    BookingShift.findOne({ user: userId }).sort({ closedAt: 1 }).select('startedAt').lean(),
    BookingShift.findOne({ user: userId }).sort({ closedAt: -1 }).select('closedAt').lean(),
    BookingShift.findOne().sort({ startedAt: 1 }).select('startedAt').lean(),   // the temple's first handover
  ]);
  return {
    // their own first shift; else since shift closing started; the very first close of all: today
    floor: first?.startedAt || goLive?.startedAt || dateKeyToDate(dateKeyOf()),
    since: last?.closedAt || null,
  };
}

const openFilter = (userId, floor, until) => ({
  createdBy: toId(userId), shift: null, channel: 'counter', paidAt: { $gte: floor, $lte: until },
});

const emptyTotals = () => ({ count: 0, amount: 0, cash: 0, upi: 0, card: 0, voidedCount: 0 });

/** Count and amount per payment mode for confirmed bookings, plus how many were voided. */
async function totalsFor(match) {
  const rows = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: { status: '$status', mode: '$paymentMode' },
        count: { $sum: 1 }, amount: { $sum: '$amount' },
        first: { $min: '$paidAt' }, last: { $max: '$paidAt' },
      },
    },
  ]);
  const totals = emptyTotals();
  let first = null; let last = null;
  for (const r of rows) {
    if (!first || r.first < first) first = r.first;
    if (!last || r.last > last) last = r.last;
    if (r._id.status === 'voided') { totals.voidedCount += r.count; continue; }
    totals.count += r.count;
    totals.amount += r.amount;
    if (r._id.mode in totals) totals[r._id.mode] += r.amount;
  }
  return { totals, first, last };
}

/** What the person at the counter would hand over if they closed now. */
export async function currentShift(user) {
  const { floor, since } = await openRange(user._id);
  const now = new Date();
  const { totals, first, last } = await totalsFor(openFilter(user._id, floor, now));
  const lastShift = await BookingShift.findOne({ user: user._id }).sort({ closedAt: -1 })
    .select('closedAt countedCash difference status').lean();
  return { since, firstAt: first, lastAt: last, totals, expectedCash: totals.cash, lastShift, denominations: DENOMINATIONS };
}

/**
 * Closes the shift: links the bookings, works out the cash that should be in the drawer
 * (opening float + cash bookings) and records the count. A difference needs a note.
 */
export async function closeShift(user, input = {}) {
  const closedAt = new Date();
  const openingFloat = Math.max(0, Math.round(Number(input.openingFloat) || 0));
  const counts = Object.fromEntries(DENOMINATIONS
    .map((d) => [String(d), Math.max(0, Math.floor(Number(input.denominations?.[d]) || 0))])
    .filter(([, n]) => n > 0));
  const countedCash = Object.keys(counts).length ? denominationTotal(counts) : Number(input.countedCash);
  if (!Number.isFinite(countedCash) || countedCash < 0) throw new ApiError(400, 'Enter the cash you counted');
  const notes = String(input.notes ?? '').trim().slice(0, 500);

  const { floor, since } = await openRange(user._id);
  const filter = openFilter(user._id, floor, closedAt);

  // Check the numbers before linking anything, so a refused close leaves the bookings open.
  const preview = await totalsFor(filter);
  if (!preview.totals.count && !preview.totals.voidedCount) throw new ApiError(400, 'No bookings to hand over since your last close');
  const check = shiftCash(preview.totals, openingFloat, countedCash);
  if (check.difference !== 0 && !notes) {
    throw new ApiError(400, check.difference < 0 ? 'Cash is short — add a note explaining it' : 'Cash is more than expected — add a note explaining it');
  }

  const shiftId = new mongoose.Types.ObjectId();
  await Booking.updateMany(filter, { $set: { shift: shiftId } });
  try {
    // Totals from what was actually linked (a booking saved during the close waits for the next shift).
    const { totals, first } = await totalsFor({ shift: shiftId });
    const { expectedCash, difference } = shiftCash(totals, openingFloat, countedCash);
    if (difference !== 0 && !notes) throw new ApiError(409, 'Bookings changed while closing — check the count and close again');
    const shift = await BookingShift.create({
      _id: shiftId, user: user._id, startedAt: since || first || closedAt, closedAt,
      totals, openingFloat, countedCash, denominations: counts, expectedCash, difference, notes,
    });
    return shift.toObject();
  } catch (err) {
    await Booking.updateMany({ shift: shiftId }, { $set: { shift: null } });
    throw err;
  }
}

// Voids done after a shift was closed: the cash was counted with them in, so flag them.
async function lateVoids(shifts) {
  if (!shifts.length) return {};
  const rows = await Booking.aggregate([
    { $match: { shift: { $in: shifts.map((s) => s._id) }, status: 'voided' } },
    { $lookup: { from: 'bookingshifts', localField: 'shift', foreignField: '_id', as: 's' } },
    { $unwind: '$s' },
    { $match: { $expr: { $gt: ['$voidedAt', '$s.closedAt'] } } },
    { $group: { _id: '$shift', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), { count: r.count, amount: r.amount }]));
}

const POPULATE = [{ path: 'user', select: 'name' }, { path: 'verifiedBy', select: 'name' }];

/** Closed shifts, newest first. Without `canSeeAll` only the caller's own. */
export async function listShifts(query, viewer, { canSeeAll = false } = {}) {
  const filter = {};
  if (!canSeeAll) filter.user = viewer._id;
  else if (mongoose.isValidObjectId(query.user)) filter.user = query.user;
  if (['closed', 'verified'].includes(query.status)) filter.status = query.status;
  const range = {};
  if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) range.$gte = dateKeyToDate(query.from);
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    const end = dateKeyToDate(query.to); end.setDate(end.getDate() + 1); range.$lt = end;
  }
  if (Object.keys(range).length) filter.closedAt = range;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const [items, total, sums] = await Promise.all([
    BookingShift.find(filter).sort({ closedAt: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE).lean(),
    BookingShift.countDocuments(filter),
    BookingShift.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null, amount: { $sum: '$totals.amount' }, cash: { $sum: '$totals.cash' },
          short: { $sum: { $cond: [{ $lt: ['$difference', 0] }, '$difference', 0] } },
          excess: { $sum: { $cond: [{ $gt: ['$difference', 0] }, '$difference', 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const late = await lateVoids(items);
  return {
    items: items.map((s) => ({ ...s, voidedAfterClose: late[String(s._id)] || null })),
    total, page, pages: Math.ceil(total / limit) || 1,
    summary: sums[0] ? { amount: sums[0].amount, cash: sums[0].cash, short: sums[0].short, excess: sums[0].excess, pending: sums[0].pending }
      : { amount: 0, cash: 0, short: 0, excess: 0, pending: 0 },
  };
}

const DIGITAL = ['upi', 'card'];

/**
 * UPI / card bookings the cashier should look at before verifying: no reference (taken before
 * references were required), payment mode changed after booking (e.g. cash → UPI), or the same
 * reference on another booking. Adds `flags` (and `modeChange`) to each booking; returns the counts.
 */
async function digitalChecks(bookings) {
  const refs = [...new Set(bookings.filter((b) => b.status === 'confirmed' && DIGITAL.includes(b.paymentMode) && b.paymentRef).map((b) => b.paymentRef))];
  const reused = refs.length
    ? new Set((await Booking.aggregate([
      { $match: { paymentRef: { $in: refs }, status: 'confirmed' } },
      { $group: { _id: '$paymentRef', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])).map((r) => r._id))
    : new Set();
  const summary = { upi: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, noRef: 0, modeChanged: 0, reused: 0 };
  for (const b of bookings) {
    const changes = (b.history || []).filter((h) => h.changes?.paymentMode);
    if (changes.length) {
      const [from] = changes[0].changes.paymentMode;
      const [, to] = changes[changes.length - 1].changes.paymentMode;
      b.modeChange = { from, to, at: changes[changes.length - 1].at };
    }
    delete b.history;
    b.flags = [];
    if (b.status !== 'confirmed') continue;
    if (b.modeChange && b.modeChange.from !== b.paymentMode) { b.flags.push('mode-changed'); summary.modeChanged += 1; }
    if (!DIGITAL.includes(b.paymentMode)) continue;
    summary[b.paymentMode].count += 1;
    summary[b.paymentMode].amount += b.amount;
    if (!b.paymentRef) { b.flags.push('no-ref'); summary.noRef += 1; }
    else if (reused.has(b.paymentRef)) { b.flags.push('ref-reused'); summary.reused += 1; }
  }
  return summary;
}

/** One shift with its bookings (for the handover slip), and the UPI / card checks. */
export async function getShift(id, viewer, { canSeeAll = false } = {}) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Shift not found');
  const shift = await BookingShift.findById(id).populate(POPULATE).lean();
  if (!shift || (!canSeeAll && String(shift.user?._id) !== String(viewer._id))) throw new ApiError(404, 'Shift not found');
  const bookings = await Booking.find({ shift: shift._id })
    .select('receiptNo sevaName amount paymentMode paymentRef status paidAt voidedAt voidReason devotee.name dateKey batchLabel history.at history.changes.paymentMode')
    .sort({ paidAt: 1 }).lean();
  const late = await lateVoids([shift]);
  const digital = await digitalChecks(bookings);
  return { ...shift, voidedAfterClose: late[String(shift._id)] || null, bookings, digital };
}

/**
 * Supervisor sign-off. Only an admin may verify their own handover. When the shift has UPI or
 * card payments the verifier must confirm they match the bank / card-machine statement.
 */
export async function verifyShift(id, input = {}, user) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Shift not found');
  const shift = await BookingShift.findById(id).lean();
  if (!shift) throw new ApiError(404, 'Shift not found');
  if (String(shift.user) === String(user._id) && !['admin', 'super_admin'].includes(user.role)) {
    throw new ApiError(403, 'Someone else has to verify your handover');
  }
  const digital = (shift.totals?.upi || 0) + (shift.totals?.card || 0);
  if (digital > 0 && input.digitalChecked !== true) {
    throw new ApiError(400, 'Tick that the UPI and card payments match the bank / card statement');
  }
  const saved = await BookingShift.findOneAndUpdate(
    { _id: id, status: 'closed' },
    {
      $set: {
        status: 'verified', verifiedBy: user._id, verifiedAt: new Date(), verifyNote: String(input.note ?? '').trim().slice(0, 300),
        digitalChecked: digital > 0,
      },
    },
    { returnDocument: 'after' },
  ).populate(POPULATE).lean();
  if (!saved) throw new ApiError(400, 'This shift is already verified');
  return saved;
}
