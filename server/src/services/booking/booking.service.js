import crypto from 'crypto';
import Booking from '../../models/Booking.js';
import BookingBatch from '../../models/BookingBatch.js';
import BookingClosure from '../../models/BookingClosure.js';
import BookingSettings from '../../models/BookingSettings.js';
import DailyCounter from '../../models/DailyCounter.js';
import SevaType from '../../models/SevaType.js';
import SlotCounter from '../../models/SlotCounter.js';
import ApiError from '../../utils/ApiError.js';
import { isPincode } from '../pincode.service.js';
import { cleanPaymentRef, paymentRefProblem } from '../../../../shared/payment.js';
import {
  batchEnded, batchLabel, batchesFor, closedReason, dateKeyOf, dateKeyToDate, diffFields, financialYear,
  formatReceiptNo, isDateKey, normalisePhone, seatsFor, slotKey,
} from './rules.js';

// ── Seats ─────────────────────────────────────────────────────────────────────

const bookedByKey = async (keys) => {
  const rows = await SlotCounter.find({ key: { $in: keys } }).lean();
  return Object.fromEntries(rows.map((r) => [r.key, r.booked]));
};

/**
 * Takes `seats` from a batch/slot counter in one atomic update and returns the serial number.
 * The filter only matches while enough seats are left; when it doesn't match, the upsert
 * collides with the existing key (E11000) — that means "full". The first E11000 can also be
 * two counters creating the counter at the same moment, so it is retried once.
 * `serial: false` only adds seats (more people on an existing booking) without a new serial.
 */
export async function reserveSeats(key, dateKey, seats, capacity, { serial = true } = {}) {
  if (capacity && seats > capacity) throw new ApiError(409, 'Not enough seats left in this batch');
  const filter = capacity ? { key, booked: { $lte: capacity - seats } } : { key };
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await SlotCounter.findOneAndUpdate(
        filter,
        { $inc: serial ? { booked: seats, seq: 1 } : { booked: seats }, $setOnInsert: { date: dateKey } },
        { upsert: true, returnDocument: 'after' },
      );
      return doc.seq;
    } catch (err) {
      if (err.code !== 11000) throw err;
      if (attempt > 0) throw new ApiError(409, 'This batch is full — please choose another');
    }
  }
}

export const releaseSeats = (key, seats) => SlotCounter.updateOne({ key }, { $inc: { booked: -seats } });

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Puts the seat counters for today and later back in line with the confirmed bookings. A
 * counter can drift if the server stops between taking a seat and saving the booking, or a
 * seat release after a void / move fails — then a batch shows "full" while seats are free.
 * Safe while the counter is booking: counters are read first, the bookings counted a moment
 * later (so a booking saved in between is included), and a counter is only corrected if it
 * hasn't moved since it was read. Serial numbers are never lowered.
 * Returns [{ key, date, before, after }] for the counters it corrected.
 */
export async function recountSeats({ from = dateKeyOf(), settleMs = 1500 } = {}) {
  const counters = await SlotCounter.find({ date: { $gte: from } }).lean();
  await sleep(settleMs);
  const rows = await Booking.aggregate([
    { $match: { status: 'confirmed', dateKey: { $gte: from }, seats: { $gt: 0 } } },
    {
      $group: {
        _id: { batch: '$batch', sevaType: '$sevaType', schedule: '$schedule', dateKey: '$dateKey' },
        seats: { $sum: '$seats' }, maxSerial: { $max: '$serialNo' },
      },
    },
  ]);
  const actual = new Map();
  for (const r of rows) {
    const key = counterKeyOf({ ...r._id, seats: r.seats });
    if (!key) continue;
    const a = actual.get(key) || { seats: 0, maxSerial: 0, date: r._id.dateKey };
    a.seats += r.seats;
    a.maxSerial = Math.max(a.maxSerial, r.maxSerial || 0);
    actual.set(key, a);
  }

  const fixed = [];
  const seen = new Set();
  for (const c of counters) {
    seen.add(c.key);
    const a = actual.get(c.key) || { seats: 0, maxSerial: 0 };
    const set = {};
    if (c.booked !== a.seats) set.booked = a.seats;
    if ((c.seq || 0) < a.maxSerial) set.seq = a.maxSerial;
    if (!Object.keys(set).length) continue;
    const res = await SlotCounter.updateOne({ _id: c._id, booked: c.booked, seq: c.seq }, { $set: set });
    if (res.modifiedCount) fixed.push({ key: c.key, date: c.date, before: c.booked, after: set.booked ?? c.booked });
  }
  // Bookings whose counter is missing altogether: create it
  for (const [key, a] of actual) {
    if (seen.has(key)) continue;
    const res = await SlotCounter.updateOne({ key }, { $setOnInsert: { key, date: a.date, booked: a.seats, seq: a.maxSerial } }, { upsert: true });
    if (res.upsertedCount) fixed.push({ key, date: a.date, before: 0, after: a.seats });
  }
  return fixed;
}

// ── Availability ──────────────────────────────────────────────────────────────

const loadContext = async () => {
  const [settings, closures] = await Promise.all([
    BookingSettings.getOrCreate(),
    BookingClosure.find({ date: { $gte: dateKeyOf() } }).lean(),
  ]);
  return { settings, closures, today: dateKeyOf() };
};

/**
 * What can be booked for a seva on a date:
 *   { open, reason?, batches: [{ _id, label, hall, capacity, booked, left, ended }], slot: { capacity, booked, left } }
 */
export async function getAvailability(sevaTypeId, dateKey) {
  const sevaType = await SevaType.findById(sevaTypeId).lean();
  if (!sevaType || !sevaType.isActive) throw new ApiError(404, 'Seva type not found');
  if (sevaType.schedule === 'none') return { sevaType, open: true, batches: [], slot: null };
  if (!isDateKey(dateKey)) throw new ApiError(400, 'date must be YYYY-MM-DD');

  const { settings, closures, today } = await loadContext();
  const reason = closedReason({ sevaType, dateKey, closures, today, maxAdvanceDays: settings.maxAdvanceDays });
  const base = { sevaType, dateKey, capacityUnit: settings.capacityUnit, open: !reason, reason: reason || undefined };
  if (reason) return { ...base, batches: [], slot: null };

  if (sevaType.schedule === 'batch') {
    const batches = batchesFor(await BookingBatch.find({ isActive: true }).lean(), sevaType, dateKey);
    const booked = await bookedByKey(batches.map((b) => slotKey.batch(b._id, dateKey)));
    return {
      ...base,
      slot: null,
      batches: batches.map((b) => {
        const used = booked[slotKey.batch(b._id, dateKey)] || 0;
        return {
          _id: b._id, start: b.start, end: b.end, label: batchLabel(b.start, b.end), hall: b.hall,
          capacity: b.capacity, booked: used, left: Math.max(0, b.capacity - used),
          ended: batchEnded(dateKey, b.end),
        };
      }),
    };
  }

  if (sevaType.schedule === 'slot') {
    const used = (await bookedByKey([slotKey.seva(sevaType._id, dateKey)]))[slotKey.seva(sevaType._id, dateKey)] || 0;
    const capacity = sevaType.dailyLimit || 0;
    return { ...base, batches: [], slot: { label: sevaType.slotTime, capacity, booked: used, left: capacity ? Math.max(0, capacity - used) : null } };
  }

  return { ...base, batches: [], slot: null }; // arrangement
}

// ── Receipt numbers ───────────────────────────────────────────────────────────

async function nextReceiptNo(prefix, now = new Date()) {
  const fy = financialYear(now);
  const counter = await DailyCounter.findOneAndUpdate(
    { module: 'booking-receipt', date: fy },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return { fy, seq: counter.count, receiptNo: formatReceiptNo(prefix, fy, counter.count) };
}

// ── Shared checks ─────────────────────────────────────────────────────────────

const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);

/**
 * Devotee details from a request, cleaned and checked against what the seva needs.
 * `checkAddress: false` skips the postal-address rule (fixing a name on an older booking).
 */
function sanitiseDevotee(d = {}, sevaType = {}, { checkAddress = true } = {}) {
  const phone = normalisePhone(d.phone);
  if (!phone) throw new ApiError(400, 'Enter a valid 10-digit mobile number');
  const name = clean(d.name, 120);
  if (!name) throw new ApiError(400, 'Enter the devotee name');
  const address = clean(d.address, 400);
  const needsAddress = checkAddress && sevaType.needsPostalAddress;
  if (needsAddress && !address) throw new ApiError(400, 'Postal address is needed for this seva');
  const pincode = clean(d.pincode, 6);
  if (pincode && !isPincode(pincode)) throw new ApiError(400, 'Enter a valid 6-digit PIN code');
  if (needsAddress && !pincode) throw new ApiError(400, 'PIN code is needed for the postal address');
  return {
    name, phone, address, pincode,
    area: clean(d.area, 80), city: clean(d.city, 80), district: clean(d.district, 80), state: clean(d.state, 60),
    email: clean(d.email, 120).toLowerCase(),
    dob: isDateKey(d.dob) ? d.dob : '',
    maritalStatus: ['married', 'unmarried'].includes(d.maritalStatus) ? d.maritalStatus : '',
    gotra: clean(d.gotra, 80),
    familyNames: (Array.isArray(d.familyNames) ? d.familyNames : []).map((n) => clean(n, 80)).filter(Boolean).slice(0, 20),
    rashi: clean(d.rashi, 40),
    nakshatra: clean(d.nakshatra, 40),
    birthTime: clean(d.birthTime, 20),
    birthPlace: clean(d.birthPlace, 80),
    language: ['mr', 'en'].includes(d.language) ? d.language : '',
  };
}

function checkPeople(value, sevaType) {
  const peopleCount = Math.max(1, Math.floor(Number(value) || 1));
  if (sevaType.maxPeople && peopleCount > sevaType.maxPeople) {
    throw new ApiError(400, `${sevaType.name} allows at most ${sevaType.maxPeople} people`);
  }
  return peopleCount;
}

/**
 * When and where a seva is done: checks the date (closures, weekdays, advance limit) and batch.
 * Returns { dateKey, batch, label, hall, counterKey, capacity } — counterKey is null when seats aren't counted.
 */
async function resolveSlot(sevaType, date, batchId, { settings, closures, today }) {
  const slot = { dateKey: null, batch: null, label: '', hall: '', counterKey: null, capacity: 0 };
  if (sevaType.schedule === 'none') return slot;
  if (!isDateKey(date)) throw new ApiError(400, 'Choose the puja date');
  const reason = closedReason({ sevaType, dateKey: date, closures, today, maxAdvanceDays: settings.maxAdvanceDays });
  if (reason) throw new ApiError(400, reason);
  slot.dateKey = date;
  if (sevaType.schedule === 'batch') {
    const batch = await BookingBatch.findById(batchId).lean();
    if (!batch || !batch.isActive || !batchesFor([batch], sevaType, date).length) throw new ApiError(400, 'Choose a batch');
    if (batchEnded(date, batch.end)) throw new ApiError(400, 'This batch has already finished for today');
    Object.assign(slot, {
      batch, label: batchLabel(batch.start, batch.end), hall: batch.hall,
      counterKey: slotKey.batch(batch._id, date), capacity: batch.capacity,
    });
  } else if (sevaType.schedule === 'slot') {
    Object.assign(slot, { label: sevaType.slotTime, counterKey: slotKey.seva(sevaType._id, date), capacity: sevaType.dailyLimit || 0 });
  }
  return slot;
}

// The seat counter a saved booking uses, or null.
const counterKeyOf = (b) => {
  if (!b.dateKey || !b.seats) return null;
  if (b.batch) return slotKey.batch(b.batch, b.dateKey);
  return b.schedule === 'slot' ? slotKey.seva(b.sevaType, b.dateKey) : null;
};

// What the counter shows when a devotee already has a booking.
const bookingBrief = (b) => ({
  _id: b._id, receiptNo: b.receiptNo, sevaName: b.sevaName, dateKey: b.dateKey || null,
  sevaType: b.sevaType, batchLabel: b.batchLabel, hall: b.hall, serialNo: b.serialNo, devoteeName: b.devotee?.name, paidAt: b.paidAt,
});

// ── Create / void ─────────────────────────────────────────────────────────────

/**
 * Validates and saves a counter booking. Returns { booking, duplicate }.
 * If the same phone already has this seva on that date (or, for undated sevas, booked today) it
 * answers 409 with errors[0] = { code: 'DUPLICATE', booking } unless input.allowDuplicate is set.
 */
export async function createBooking(input, user) {
  const ctx = await loadContext();
  const { settings, today } = ctx;

  // A double-tapped "Book" sends the same request id twice — hand back the first booking.
  if (input.clientRequestId) {
    const existing = await Booking.findOne({ clientRequestId: input.clientRequestId }).lean();
    if (existing) return { booking: existing, duplicate: true };
  }

  const sevaType = await SevaType.findById(input.sevaType).lean();
  if (!sevaType || !sevaType.isActive) throw new ApiError(400, 'Choose a seva type');

  const devotee = sanitiseDevotee(input.devotee, sevaType);
  const peopleCount = checkPeople(input.peopleCount, sevaType);
  if (!['cash', 'upi', 'card'].includes(input.paymentMode)) throw new ApiError(400, 'Choose cash, UPI or card');
  // UPI / card must carry a reference the cashier can match with the bank or card-machine statement
  const refProblem = paymentRefProblem(input.paymentMode, input.paymentRef);
  if (refProblem) throw new ApiError(400, refProblem);

  const { dateKey, batch, label, hall, counterKey, capacity } = await resolveSlot(sevaType, input.date, input.batch, ctx);

  if (!input.allowDuplicate) {
    const same = await Booking.findOne({
      'devotee.phone': devotee.phone, sevaType: sevaType._id, status: 'confirmed',
      ...(dateKey ? { dateKey } : { paidAt: { $gte: dateKeyToDate(today) } }),
    }).sort({ paidAt: -1 }).lean();
    if (same) {
      throw new ApiError(409, 'This devotee already has this seva booked for that day', [{ code: 'DUPLICATE', booking: bookingBrief(same) }]);
    }
  }

  const seats = counterKey ? seatsFor(settings.capacityUnit, peopleCount) : 0;
  const serialNo = counterKey ? await reserveSeats(counterKey, dateKey, seats, capacity) : undefined;

  try {
    const now = new Date();
    const { fy, seq, receiptNo } = await nextReceiptNo(settings.receiptPrefix, now);
    const booking = await Booking.create({
      receiptNo, fy, seq,
      sevaType: sevaType._id, sevaName: sevaType.name, schedule: sevaType.schedule, amount: sevaType.price,
      performDate: dateKey ? dateKeyToDate(dateKey) : undefined, dateKey: dateKey || undefined,
      batch: batch?._id, batchLabel: label, hall, serialNo, seats,
      devotee,
      peopleCount,
      notes: clean(input.notes, 500),
      paymentMode: input.paymentMode,
      paymentRef: input.paymentMode === 'cash' ? '' : cleanPaymentRef(input.paymentRef),
      paidAt: now,
      channel: 'counter',
      receiptToken: crypto.randomBytes(12).toString('base64url'),
      clientRequestId: clean(input.clientRequestId, 64) || undefined,
      createdBy: user?._id,
    });
    return { booking: booking.toObject(), duplicate: false };
  } catch (err) {
    if (counterKey) await releaseSeats(counterKey, seats); // give the seat back if saving failed
    if (err.code === 11000 && input.clientRequestId) {
      const existing = await Booking.findOne({ clientRequestId: input.clientRequestId }).lean();
      if (existing) return { booking: existing, duplicate: true };
    }
    throw err;
  }
}

export async function voidBooking(id, reason, user) {
  if (!clean(reason)) throw new ApiError(400, 'Enter a reason for voiding');
  const booking = await Booking.findOneAndUpdate(
    { _id: id, status: 'confirmed' },
    { $set: { status: 'voided', voidReason: clean(reason, 300), voidedBy: user?._id, voidedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!booking) throw new ApiError(404, 'Booking not found or already voided');
  // Free the seat if the puja hasn't happened yet.
  const key = counterKeyOf(booking);
  if (key && booking.dateKey >= dateKeyOf()) await releaseSeats(key, booking.seats);
  return booking.toObject();
}

// ── Corrections (the receipt number and amount never change) ──────────────────

const DEVOTEE_FIELDS = ['name', 'phone', 'email', 'address', 'pincode', 'area', 'city', 'district', 'state',
  'dob', 'maritalStatus', 'gotra', 'familyNames', 'rashi', 'nakshatra', 'birthTime', 'birthPlace', 'language'];
const EDIT_FIELDS = [...DEVOTEE_FIELDS.map((f) => `devotee.${f}`), 'peopleCount', 'notes', 'paymentMode', 'paymentRef'];

const findConfirmed = async (id) => {
  const booking = await Booking.findOne({ _id: id, status: 'confirmed' }).lean();
  if (!booking) throw new ApiError(404, 'Booking not found or voided');
  return booking;
};

const changedMeanwhile = () => new ApiError(409, 'This booking was changed by someone else just now — open it again and retry');

/**
 * Fixes details on a confirmed booking: devotee, people, notes, payment reference — and the
 * payment mode, but only by whoever took it (or someone who can void) and only until their shift
 * is closed. When seats are counted per person they follow the people count. Every change is
 * kept in booking.history. Returns { booking, changes } (changes is {} when nothing differed).
 */
export async function editBooking(id, input = {}, user, { canVoid = false } = {}) {
  const booking = await findConfirmed(id);
  const sevaType = (await SevaType.findById(booking.sevaType).lean()) || { name: booking.sevaName };

  const next = {
    devotee: input.devotee
      ? sanitiseDevotee({ ...booking.devotee, ...input.devotee }, sevaType, { checkAddress: 'address' in input.devotee || 'pincode' in input.devotee })
      : booking.devotee,
    peopleCount: input.peopleCount !== undefined ? checkPeople(input.peopleCount, sevaType) : booking.peopleCount,
    notes: input.notes !== undefined ? clean(input.notes, 500) : booking.notes,
    paymentMode: input.paymentMode || booking.paymentMode,
  };
  next.paymentRef = next.paymentMode === 'cash' ? ''
    : input.paymentRef !== undefined ? cleanPaymentRef(input.paymentRef) : booking.paymentRef;

  const modeChanged = next.paymentMode !== booking.paymentMode;
  if (modeChanged) {
    if (booking.channel !== 'counter' || !['cash', 'upi', 'card'].includes(next.paymentMode)) throw new ApiError(400, 'Choose cash, UPI or card');
    if (!canVoid && String(booking.createdBy) !== String(user?._id)) {
      throw new ApiError(403, 'Only the person who took this booking can change how it was paid');
    }
    if (booking.shift) throw new ApiError(400, 'This booking is in a closed shift — its payment mode can no longer be changed');
  }
  // A changed payment (mode or reference) to UPI / card needs a reference that can be checked
  if ((modeChanged || next.paymentRef !== booking.paymentRef) && booking.channel === 'counter') {
    const refProblem = paymentRefProblem(next.paymentMode, next.paymentRef);
    if (refProblem) throw new ApiError(400, refProblem);
  }

  const changes = diffFields(booking, next, EDIT_FIELDS);
  if (!Object.keys(changes).length) return { booking, changes };

  // Seats per person: take the extra seats now, give spare ones back after saving (only while the puja is ahead).
  const key = counterKeyOf(booking);
  let seats = booking.seats;
  let extra = 0;
  if (changes.peopleCount && key && booking.dateKey >= dateKeyOf()) {
    const settings = await BookingSettings.getOrCreate();
    if (settings.capacityUnit === 'people') {
      seats = seatsFor('people', next.peopleCount);
      extra = seats - booking.seats;
      if (extra > 0) {
        const capacity = booking.batch
          ? (await BookingBatch.findById(booking.batch).lean())?.capacity || 0
          : sevaType.dailyLimit || 0;
        try {
          await reserveSeats(key, booking.dateKey, extra, capacity, { serial: false });
        } catch (err) {
          if (err.statusCode === 409) throw new ApiError(409, 'Not enough seats left in this batch for more people');
          throw err;
        }
      }
    }
  }

  const saved = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed', updatedAt: booking.updatedAt, ...(modeChanged ? { shift: null } : {}) },
    {
      $set: { ...next, seats },
      $push: { history: { at: new Date(), by: user?._id, action: 'edit', changes, reason: clean(input.reason, 300) } },
    },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!saved) {
    if (extra > 0) await releaseSeats(key, extra);
    throw changedMeanwhile();
  }
  if (extra < 0) await releaseSeats(key, -extra);
  return { booking: saved, changes };
}

/**
 * Moves a confirmed booking to another batch and/or date. The new seat is taken first (a full
 * batch refuses the move) and gets a new serial; the old seat is then given back if that puja
 * is still ahead. Receipt number, amount and payment stay as they were.
 */
export async function moveBooking(id, input = {}, user) {
  const booking = await findConfirmed(id);
  if (!booking.dateKey) throw new ApiError(400, 'This seva has no date to change');
  const sevaType = await SevaType.findById(booking.sevaType).lean();
  if (!sevaType) throw new ApiError(400, 'This seva type no longer exists');

  const ctx = await loadContext();
  const target = await resolveSlot(sevaType, input.date, input.batch, ctx);
  if (!target.dateKey) throw new ApiError(400, 'This seva has no date to change');
  if (target.dateKey === booking.dateKey && String(target.batch?._id || '') === String(booking.batch || '')) {
    throw new ApiError(400, 'Choose a different date or batch');
  }

  const seats = target.counterKey ? seatsFor(ctx.settings.capacityUnit, booking.peopleCount) : 0;
  const serialNo = target.counterKey ? await reserveSeats(target.counterKey, target.dateKey, seats, target.capacity) : null;

  const where = (b) => [b.batchLabel, b.hall].filter(Boolean).join(' · ');
  const changes = diffFields(
    { date: booking.dateKey, batch: where(booking), serialNo: booking.serialNo ?? null },
    { date: target.dateKey, batch: where({ batchLabel: target.label, hall: target.hall }), serialNo },
    ['date', 'batch', 'serialNo'],
  );

  const saved = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed', dateKey: booking.dateKey, batch: booking.batch || null },
    {
      $set: {
        dateKey: target.dateKey, performDate: dateKeyToDate(target.dateKey), batch: target.batch?._id || null,
        batchLabel: target.label, hall: target.hall, serialNo, seats,
      },
      $push: { history: { at: new Date(), by: user?._id, action: 'move', changes, reason: clean(input.reason, 300) } },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!saved) {
    if (target.counterKey) await releaseSeats(target.counterKey, seats);
    throw changedMeanwhile();
  }
  const oldKey = counterKeyOf(booking);
  if (oldKey && booking.dateKey >= dateKeyOf()) await releaseSeats(oldKey, booking.seats);
  return { booking: saved, changes };
}

// ── Returning devotees ────────────────────────────────────────────────────────

/** Details from the devotee's latest booking, to pre-fill the counter form, and their bookings still ahead. */
export async function lookupDevotee(rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (!phone) return null;
  const [latest, count, upcoming] = await Promise.all([
    Booking.findOne({ 'devotee.phone': phone, status: 'confirmed' }).sort({ paidAt: -1 }).lean(),
    Booking.countDocuments({ 'devotee.phone': phone, status: 'confirmed' }),
    Booking.find({ 'devotee.phone': phone, status: 'confirmed', dateKey: { $gte: dateKeyOf() } })
      .sort({ dateKey: 1, serialNo: 1 }).limit(5).lean(),
  ]);
  if (!latest) return null;
  return {
    devotee: latest.devotee,
    peopleCount: latest.peopleCount,
    bookings: count,
    lastBooking: { receiptNo: latest.receiptNo, sevaName: latest.sevaName, dateKey: latest.dateKey, paidAt: latest.paidAt },
    upcoming: upcoming.map(bookingBrief), // already booked and still ahead — the counter warns about these
  };
}
