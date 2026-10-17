import { randomBytes } from 'crypto';
import MahaprasadCoupon from '../models/MahaprasadCoupon.js';
import DailyCounter from '../models/DailyCounter.js';
import ApiError from '../utils/ApiError.js';
import { localDateStr } from '../utils/dates.js';

// What every Mahaprasad sale needs, at the counter (controllers/mahaprasad.controller.js) and on
// the public page (mahaprasadOnline.service.js): the day's price, coupon numbers and the daily limit.

export const nanoid = () => randomBytes(6).toString('hex');
// Unguessable: the coupon page link is as good as the paper coupon
export const newShareToken = () => randomBytes(12).toString('base64url');

export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Reserved = a number held by an offline counter, not sold yet. Voided = cancelled. Neither is a
// sale, so neither counts in reports, the daily limit or the money.
export const NOT_SOLD = ['reserved', 'voided'];
// Persons on a coupon — a group coupon for 5 counts as 5
export const GS = { $ifNull: ['$groupSize', 1] };

export function getPriceForDate(settings, date) {
  const d   = date ? new Date(date) : new Date();
  const key = DAY_KEYS[d.getDay()];
  return settings.mahaprasadDayPricing?.[key] ?? 0;
}

export function dayBounds(date) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function datePart(date) {
  return localDateStr(date ? new Date(date) : new Date()).replace(/-/g, '');
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

export async function generateCouponNumbers(date, qty) {
  const prefix  = `MP-${datePart(date)}`;
  const startAt = await nextCouponSequence(date, qty);
  const numbers = [];
  for (let i = 0; i < qty; i++) {
    numbers.push(`${prefix}-${String(startAt + i).padStart(3, '0')}`);
  }
  return numbers;
}

// ── Daily limit ───────────────────────────────────────────────────────────────
// Persons sold per date, kept in a counter beside the coupons so two counters issuing at the
// same moment can't both slip past the limit. Kept even when no limit is set, so turning one on
// later starts from the right number. Online orders waiting for their payment are counted too.

const PERSONS = 'mahaprasad-persons';

// Makes sure the date's counter exists, starting it from the coupons already sold that day.
// Call it before changing any coupon's status, so that change isn't counted twice.
export async function personsCounter(couponDate) {
  const date = datePart(couponDate);
  if (await DailyCounter.exists({ module: PERSONS, date })) return date;
  const { start, end } = dayBounds(couponDate);
  const [agg] = await MahaprasadCoupon.aggregate([
    { $match: { date: { $gte: start, $lte: end }, status: { $nin: NOT_SOLD } } },
    { $group: { _id: null, total: { $sum: GS } } },
  ]);
  await DailyCounter.updateOne({ module: PERSONS, date }, { $setOnInsert: { count: agg?.total || 0 } }, { upsert: true })
    .catch((err) => { if (err.code !== 11000) throw err; }); // another request started it first
  return date;
}

// Counts `qty` more persons for the date, refusing if that would pass the daily limit
export async function takePersons(couponDate, qty, cap) {
  const date = await personsCounter(couponDate);
  const filter = { module: PERSONS, date, ...(cap > 0 && { count: { $lte: cap - qty } }) };
  if (await DailyCounter.findOneAndUpdate(filter, { $inc: { count: qty } })) return;
  const current   = (await DailyCounter.findOne({ module: PERSONS, date }).lean())?.count || 0;
  const remaining = Math.max(0, cap - current);
  throw new ApiError(400,
    remaining === 0
      ? `Daily cap of ${cap} persons reached for this date`
      : `Only ${remaining} more person${remaining !== 1 ? 's' : ''} can be issued today (cap: ${cap})`,
    [{ code: 'cap', remaining }],
  );
}

// Adds or gives back persons without a limit check: sales already made offline, cancellations
export async function adjustPersons(couponDate, delta) {
  const date = await personsCounter(couponDate);
  await DailyCounter.updateOne({ module: PERSONS, date }, { $inc: { count: delta } });
}

/** Persons counted for the date so far (sold, plus online orders being paid) */
export async function personsTaken(couponDate) {
  const date = await personsCounter(couponDate);
  return (await DailyCounter.findOne({ module: PERSONS, date }).lean())?.count || 0;
}
