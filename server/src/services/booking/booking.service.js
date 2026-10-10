import crypto from 'crypto';
import Booking from '../../models/Booking.js';
import BookingBatch from '../../models/BookingBatch.js';
import BookingClosure from '../../models/BookingClosure.js';
import BookingSettings from '../../models/BookingSettings.js';
import DailyCounter from '../../models/DailyCounter.js';
import SevaType from '../../models/SevaType.js';
import SlotCounter from '../../models/SlotCounter.js';
import ApiError from '../../utils/ApiError.js';
import {
  batchEnded, batchLabel, batchesFor, closedReason, dateKeyOf, dateKeyToDate, financialYear,
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
 */
export async function reserveSeats(key, dateKey, seats, capacity) {
  if (capacity && seats > capacity) throw new ApiError(409, 'Not enough seats left in this batch');
  const filter = capacity ? { key, booked: { $lte: capacity - seats } } : { key };
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await SlotCounter.findOneAndUpdate(
        filter,
        { $inc: { booked: seats, seq: 1 }, $setOnInsert: { date: dateKey } },
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

// ── Create / void ─────────────────────────────────────────────────────────────

const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);

/** Validates and saves a counter booking. Returns the saved booking (lean). */
export async function createBooking(input, user) {
  const { settings, closures, today } = await loadContext();

  // A double-tapped "Book" sends the same request id twice — hand back the first booking.
  if (input.clientRequestId) {
    const existing = await Booking.findOne({ clientRequestId: input.clientRequestId }).lean();
    if (existing) return { booking: existing, duplicate: true };
  }

  const sevaType = await SevaType.findById(input.sevaType).lean();
  if (!sevaType || !sevaType.isActive) throw new ApiError(400, 'Choose a seva type');

  const phone = normalisePhone(input.devotee?.phone);
  if (!phone) throw new ApiError(400, 'Enter a valid 10-digit mobile number');
  const name = clean(input.devotee?.name, 120);
  if (!name) throw new ApiError(400, 'Enter the devotee name');
  const peopleCount = Math.max(1, Math.floor(Number(input.peopleCount) || 1));
  if (sevaType.maxPeople && peopleCount > sevaType.maxPeople) {
    throw new ApiError(400, `${sevaType.name} allows at most ${sevaType.maxPeople} people`);
  }
  if (!['cash', 'upi', 'card'].includes(input.paymentMode)) throw new ApiError(400, 'Choose cash, UPI or card');
  const address = clean(input.devotee?.address, 400);
  if (sevaType.needsPostalAddress && !address) throw new ApiError(400, 'Postal address is needed for this seva');

  // When and where
  let dateKey = null; let batch = null; let label = ''; let hall = ''; let counterKey = null; let capacity = 0;
  if (sevaType.schedule !== 'none') {
    dateKey = input.date;
    if (!isDateKey(dateKey)) throw new ApiError(400, 'Choose the puja date');
    const reason = closedReason({ sevaType, dateKey, closures, today, maxAdvanceDays: settings.maxAdvanceDays });
    if (reason) throw new ApiError(400, reason);
  }
  if (sevaType.schedule === 'batch') {
    batch = await BookingBatch.findById(input.batch).lean();
    if (!batch || !batch.isActive || !batchesFor([batch], sevaType, dateKey).length) throw new ApiError(400, 'Choose a batch');
    if (batchEnded(dateKey, batch.end)) throw new ApiError(400, 'This batch has already finished for today');
    label = batchLabel(batch.start, batch.end); hall = batch.hall;
    counterKey = slotKey.batch(batch._id, dateKey); capacity = batch.capacity;
  } else if (sevaType.schedule === 'slot') {
    label = sevaType.slotTime;
    counterKey = slotKey.seva(sevaType._id, dateKey); capacity = sevaType.dailyLimit || 0;
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
      devotee: {
        name, phone, address,
        email: clean(input.devotee?.email, 120).toLowerCase(),
        dob: isDateKey(input.devotee?.dob) ? input.devotee.dob : '',
        maritalStatus: ['married', 'unmarried'].includes(input.devotee?.maritalStatus) ? input.devotee.maritalStatus : '',
        gotra: clean(input.devotee?.gotra, 80),
        familyNames: (Array.isArray(input.devotee?.familyNames) ? input.devotee.familyNames : [])
          .map((n) => clean(n, 80)).filter(Boolean).slice(0, 20),
        rashi: clean(input.devotee?.rashi, 40),
        nakshatra: clean(input.devotee?.nakshatra, 40),
        birthTime: clean(input.devotee?.birthTime, 20),
        birthPlace: clean(input.devotee?.birthPlace, 80),
      },
      peopleCount,
      notes: clean(input.notes, 500),
      paymentMode: input.paymentMode,
      paymentRef: clean(input.paymentRef, 80),
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
  if (booking.dateKey && booking.dateKey >= dateKeyOf() && booking.seats) {
    const key = booking.batch ? slotKey.batch(booking.batch, booking.dateKey) : slotKey.seva(booking.sevaType, booking.dateKey);
    await releaseSeats(key, booking.seats);
  }
  return booking.toObject();
}

// ── Returning devotees ────────────────────────────────────────────────────────

/** Details from the devotee's latest booking, to pre-fill the counter form. */
export async function lookupDevotee(rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (!phone) return null;
  const [latest, count] = await Promise.all([
    Booking.findOne({ 'devotee.phone': phone, status: 'confirmed' }).sort({ paidAt: -1 }).lean(),
    Booking.countDocuments({ 'devotee.phone': phone, status: 'confirmed' }),
  ]);
  if (!latest) return null;
  return {
    devotee: latest.devotee,
    peopleCount: latest.peopleCount,
    bookings: count,
    lastBooking: { receiptNo: latest.receiptNo, sevaName: latest.sevaName, dateKey: latest.dateKey, paidAt: latest.paidAt },
  };
}
