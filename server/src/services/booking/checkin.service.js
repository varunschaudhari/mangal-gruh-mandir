import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import BookingBatch from '../../models/BookingBatch.js';
import SevaType from '../../models/SevaType.js';
import Settings from '../../models/Settings.js';
import ApiError from '../../utils/ApiError.js';
import {
  batchStateAt, checkInVerdict, dateKeyOf, financialYear, isDateKey, labelTimes, receiptTokenOf,
} from './rules.js';

// Hall check-in: staff scan the QR on the devotee's slip (or type the receipt number) at the
// hall. A valid slip is marked checked in once; a second scan shows when and by whom.

const POPULATE = { path: 'checkedInBy', select: 'name' };

// What the scanner screen shows about a booking.
const brief = (b) => ({
  _id: b._id, receiptNo: b.receiptNo, status: b.status, sevaType: b.sevaType, sevaName: b.sevaName, schedule: b.schedule,
  dateKey: b.dateKey || null, batchLabel: b.batchLabel, hall: b.hall, serialNo: b.serialNo, peopleCount: b.peopleCount,
  devotee: { name: b.devotee?.name, gotra: b.devotee?.gotra, familyNames: b.devotee?.familyNames || [] },
  checkedInAt: b.checkedInAt || null, checkedInBy: b.checkedInBy?.name ? { name: b.checkedInBy.name } : null,
  checkInOverride: b.checkInOverride || '',
});

/**
 * The booking a scanned / typed code points to: the QR link or token, a full receipt number
 * (ABH/2026-27/00010), or just the number from this financial year's series (10).
 */
async function findByCode(raw) {
  const code = String(raw || '').trim();
  if (!code) throw new ApiError(400, 'Scan the QR code on the slip or type the receipt number');
  const token = receiptTokenOf(code);
  if (token) return Booking.findOne({ receiptToken: token }).populate(POPULATE).lean();
  if (/^\d{1,7}$/.test(code)) return Booking.findOne({ fy: financialYear(), seq: Number(code) }).populate(POPULATE).lean();
  if (/^[A-Z]{1,10}\/\d{4}-\d{2}\/\d{1,7}$/i.test(code)) return Booking.findOne({ receiptNo: code.toUpperCase() }).populate(POPULATE).lean();
  if (/^https?:\/\//i.test(code)) throw new ApiError(400, 'This QR code is not a booking slip');
  return null;
}

/**
 * Checks a booking in if its slip is valid here and now. `override` lets staff check in a
 * devotee whose batch is over or who came to another hall. Always answers with the verdict:
 * { result, checkedIn (true when marked now), canOverride, booking }.
 */
async function checkInBooking(booking, { hall = '', override = false } = {}, user) {
  const verdict = checkInVerdict(booking, { today: dateKeyOf(), hall: String(hall || '').trim() });
  const allowed = verdict.result === 'ok' || (override && verdict.canOverride);
  if (!allowed) return { ...verdict, checkedIn: false, booking: brief(booking) };

  const saved = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed', checkedInAt: null },
    { $set: { checkedInAt: new Date(), checkedInBy: user?._id, checkInOverride: verdict.result === 'ok' ? '' : verdict.result } },
    { returnDocument: 'after' },
  ).populate(POPULATE).lean();
  if (saved) return { result: verdict.result === 'ok' ? 'ok' : 'overridden', canOverride: false, checkedIn: true, booking: brief(saved) };

  // Someone scanned the same slip a moment earlier, or it was voided meanwhile.
  const now = await Booking.findById(booking._id).populate(POPULATE).lean();
  return { ...checkInVerdict(now, { today: dateKeyOf() }), checkedIn: false, booking: brief(now) };
}

export async function checkInByCode(code, opts, user) {
  const booking = await findByCode(code);
  if (!booking) throw new ApiError(404, 'No booking found for this code');
  return checkInBooking(booking, opts, user);
}

export async function checkInById(id, opts, user) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Booking not found');
  const booking = await Booking.findById(id).populate(POPULATE).lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  return checkInBooking(booking, opts, user);
}

/** Takes back a check-in made by mistake. */
export async function undoCheckIn(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Booking not found');
  const before = await Booking.findOne({ _id: id, checkedInAt: { $ne: null } }).populate(POPULATE).lean();
  if (!before) throw new ApiError(400, 'This booking is not checked in');
  const saved = await Booking.findOneAndUpdate(
    { _id: id, checkedInAt: before.checkedInAt },
    { $set: { checkedInAt: null, checkedInBy: null, checkInOverride: '' } },
    { returnDocument: 'after' },
  ).lean();
  if (!saved) throw new ApiError(409, 'This booking changed just now — try again');
  return { booking: brief(saved), was: brief(before) };
}

/**
 * Today's arrivals for the scanner screen: per batch / slot (optionally one hall) how many
 * bookings and people have come, plus the latest check-ins.
 */
export async function checkInSummary({ date, hall } = {}) {
  const dateKey = isDateKey(date) ? date : dateKeyOf();
  const match = { dateKey, status: 'confirmed', ...(hall ? { hall: String(hall) } : {}) };
  const [groups, recent, halls] = await Promise.all([
    Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: { batch: '$batch', label: '$batchLabel', hall: '$hall' },
          sevaNames: { $addToSet: '$sevaName' },
          bookings: { $sum: 1 },
          people: { $sum: { $ifNull: ['$peopleCount', 1] } },
          arrived: { $sum: { $cond: [{ $ifNull: ['$checkedInAt', false] }, 1, 0] } },
          arrivedPeople: { $sum: { $cond: [{ $ifNull: ['$checkedInAt', false] }, { $ifNull: ['$peopleCount', 1] }, 0] } },
        },
      },
    ]),
    Booking.find({ ...match, checkedInAt: { $ne: null } }).sort({ checkedInAt: -1 }).limit(10).populate(POPULATE).lean(),
    BookingBatch.distinct('hall', { isActive: true }), // the halls a scanner can stand at
  ]);
  const toMinutes = (label) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
    return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : 24 * 60;
  };
  const rows = groups
    .map((g) => ({
      batch: g._id.batch || null, label: g._id.label || '', hall: g._id.hall || '', sevaNames: g.sevaNames.sort(),
      bookings: g.bookings, people: g.people, arrived: g.arrived, arrivedPeople: g.arrivedPeople,
    }))
    .sort((a, b) => toMinutes(a.label) - toMinutes(b.label) || a.hall.localeCompare(b.hall));
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return {
    date: dateKey,
    halls: halls.filter(Boolean).sort(),
    totals: { bookings: sum('bookings'), people: sum('people'), arrived: sum('arrived'), arrivedPeople: sum('arrivedPeople') },
    groups: rows,
    recent: recent.map(brief),
  };
}

/**
 * The hall screen (a TV at the hall): today's batches for one hall (or all), each with its
 * serials and who has arrived, and where it stands now ('now' / 'later' / 'over'). Names only —
 * never phone numbers.
 */
export async function hallBoard({ hall, date } = {}) {
  const today = dateKeyOf();
  const dateKey = isDateKey(date) ? date : today;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [bookings, halls, temple] = await Promise.all([
    Booking.find({ dateKey, status: 'confirmed', ...(hall ? { hall: String(hall) } : {}) })
      .select('serialNo devotee.name peopleCount checkedInAt batch batchLabel hall sevaType sevaName schedule')
      .sort({ serialNo: 1 }).lean(),
    BookingBatch.distinct('hall', { isActive: true }),
    Settings.getOrCreate(),
  ]);
  // Marathi seva names for the screen (hall staff can't read the seva list themselves).
  const sevas = await SevaType.find({ _id: { $in: [...new Set(bookings.map((b) => String(b.sevaType)))] } }).select('nameMr').lean();
  const nameMr = new Map(sevas.map((s) => [String(s._id), s.nameMr]));
  const groups = new Map();
  for (const b of bookings) {
    const key = `${b.batch || b.sevaName}|${b.batchLabel}|${b.hall}`;
    if (!groups.has(key)) {
      const times = labelTimes(b.batchLabel);
      const state = dateKey === today ? batchStateAt(b.batchLabel, minutes) : dateKey < today ? 'over' : 'later';
      groups.set(key, {
        key, label: b.batchLabel || '', hall: b.hall || '', start: times?.start ?? null, end: times?.end ?? null, state,
        sevaNames: new Set(), sevaNamesMr: new Set(), bookings: [], people: 0, arrived: 0, arrivedPeople: 0,
      });
    }
    const g = groups.get(key);
    const people = b.peopleCount || 1;
    g.sevaNames.add(b.sevaName);
    g.sevaNamesMr.add(nameMr.get(String(b.sevaType)) || b.sevaName);
    g.bookings.push({ serialNo: b.serialNo ?? null, name: b.devotee?.name || '', people, arrived: Boolean(b.checkedInAt) });
    g.people += people;
    if (b.checkedInAt) { g.arrived += 1; g.arrivedPeople += people; }
  }
  return {
    date: dateKey,
    now,
    minutes,
    hall: hall ? String(hall) : '',
    templeName: temple?.templeName || '',
    halls: halls.filter(Boolean).sort(),
    groups: [...groups.values()]
      .map((g) => ({ ...g, sevaNames: [...g.sevaNames].sort(), sevaNamesMr: [...g.sevaNamesMr] }))
      .sort((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.hall.localeCompare(b.hall)),
  };
}
