import Booking from '../models/Booking.js';
import BookingSettings from '../models/BookingSettings.js';
import SevaType from '../models/SevaType.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPermissionsForRole } from '../middleware/authorize.js';
import { logAction } from '../services/audit.service.js';
import {
  createBooking, editBooking, getAvailability, lookupDevotee, moveBooking, voidBooking,
} from '../services/booking/booking.service.js';
import { checkInByCode, checkInById, checkInSummary, hallBoard, undoCheckIn } from '../services/booking/checkin.service.js';
import { receiptUrl, sendReceipt } from '../services/booking/notify.js';
import { attendanceReport, daySheet, registerFilter, summary } from '../services/booking/reports.js';
import { bookingsExcel, summaryPdf } from '../services/booking/exports.js';
import { dateKeyOf, isDateKey } from '../services/booking/rules.js';

const withUrl = (b) => (b ? { ...b, receiptUrl: receiptUrl(b) } : b);
const POPULATE = [
  { path: 'createdBy', select: 'name' }, { path: 'voidedBy', select: 'name' }, { path: 'history.by', select: 'name' },
  { path: 'checkedInBy', select: 'name' },
];

const can = async (req, perm) => {
  const perms = await getPermissionsForRole(req.user.role);
  return perms.includes('*') || perms.includes(perm);
};

// GET /bookings/options — what the counter and the register need to start
export const getOptions = asyncHandler(async (req, res) => {
  const [allSevaTypes, settings, temple, staffIds] = await Promise.all([
    SevaType.find().sort({ sortOrder: 1, name: 1 }).lean(),
    BookingSettings.getOrCreate(),
    Settings.getOrCreate(),
    Booking.distinct('createdBy'),
  ]);
  const staff = await User.find({ _id: { $in: staffIds } }).select('name').sort({ name: 1 }).lean();
  res.json(new ApiResponse(200, {
    sevaTypes: allSevaTypes.filter((s) => s.isActive), // bookable now (counter)
    allSevaTypes,                                       // incl. switched-off ones, for filters and old bookings
    staff,
    settings: {
      receiptPrefix: settings.receiptPrefix, capacityUnit: settings.capacityUnit, maxAdvanceDays: settings.maxAdvanceDays,
      printerName: settings.printerName || temple.mahaprasadPrinterName || '', paperWidth: settings.paperWidth,
      receiptFooter: settings.receiptFooter,
      whatsappAuto: Boolean(temple.waEnabled && settings.whatsappAuto),
      templeName: temple.templeName, templeAddress: temple.templeAddress, templePhone: temple.templePhone,
    },
  }));
});

// GET /bookings/availability?sevaType=&date=YYYY-MM-DD
export const availability = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await getAvailability(req.query.sevaType, req.query.date || dateKeyOf())));
});

// GET /bookings/devotee?phone= — returning devotee's details
export const devotee = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await lookupDevotee(req.query.phone)));
});

// POST /bookings
export const create = asyncHandler(async (req, res) => {
  const { booking, duplicate } = await createBooking(req.body, req.user);
  if (!duplicate) {
    logAction(req, {
      action: 'booking.create', entity: 'Booking', entityId: booking.receiptNo, entityRef: booking._id,
      meta: { seva: booking.sevaName, amount: booking.amount, date: booking.dateKey, batch: booking.batchLabel, mode: booking.paymentMode },
    });
    sendReceipt(booking); // WhatsApp / SMS in the background — never holds up the counter
  }
  const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
  res.status(duplicate ? 200 : 201).json(new ApiResponse(duplicate ? 200 : 201, withUrl(populated), duplicate ? 'Already booked' : 'Booked'));
});

// GET /bookings — register with filters (see reports.buildFilter / registerFilter)
export const list = asyncHandler(async (req, res) => {
  const filter = await registerFilter(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const sort = req.query.dateField === 'puja' ? { performDate: 1, serialNo: 1 } : { paidAt: -1 };
  const [items, total, sums] = await Promise.all([
    Booking.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate(POPULATE).lean(),
    Booking.countDocuments(filter),
    Booking.aggregate([{ $match: filter }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
  ]);
  res.json(new ApiResponse(200, {
    items: items.map(withUrl),
    total, page, pages: Math.ceil(total / limit) || 1,
    amount: sums[0]?.amount || 0,
  }));
});

// GET /bookings/:id
export const getOne = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate(POPULATE).lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.json(new ApiResponse(200, withUrl(booking)));
});

// PATCH /bookings/:id/void { reason }
export const voidOne = asyncHandler(async (req, res) => {
  const booking = await voidBooking(req.params.id, req.body?.reason, req.user);
  logAction(req, {
    action: 'booking.void', entity: 'Booking', entityId: booking.receiptNo, entityRef: booking._id,
    meta: { reason: booking.voidReason, amount: booking.amount },
  });
  const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
  res.json(new ApiResponse(200, withUrl(populated), 'Booking voided'));
});

// PATCH /bookings/:id { devotee?, peopleCount?, notes?, paymentMode?, paymentRef?, reason? } — fix details
export const update = asyncHandler(async (req, res) => {
  const { booking, changes } = await editBooking(req.params.id, req.body || {}, req.user, { canVoid: await can(req, 'bookings:void') });
  const changed = Object.keys(changes).length > 0;
  if (changed) {
    logAction(req, {
      action: 'booking.edit', entity: 'Booking', entityId: booking.receiptNo, entityRef: booking._id,
      meta: { changes, reason: req.body?.reason || '' },
    });
  }
  const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
  res.json(new ApiResponse(200, withUrl(populated), changed ? 'Booking updated' : 'Nothing changed'));
});

// POST /bookings/:id/move { date, batch?, reason? } — another batch / date, same receipt
export const move = asyncHandler(async (req, res) => {
  const { booking, changes } = await moveBooking(req.params.id, req.body || {}, req.user);
  logAction(req, {
    action: 'booking.move', entity: 'Booking', entityId: booking.receiptNo, entityRef: booking._id,
    meta: { changes, reason: req.body?.reason || '' },
  });
  const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
  res.json(new ApiResponse(200, withUrl(populated), 'Booking moved'));
});

// ── Hall check-in ──
const logCheckIn = (req, r) => {
  if (!r.checkedIn) return;
  logAction(req, {
    action: 'booking.checkin', entity: 'Booking', entityId: r.booking.receiptNo, entityRef: r.booking._id,
    meta: { hall: r.booking.hall, batch: r.booking.batchLabel, override: r.booking.checkInOverride || undefined },
  });
};

// POST /bookings/check-in { code, hall?, override? } — the QR on the slip, or the receipt number
export const checkIn = asyncHandler(async (req, res) => {
  const r = await checkInByCode(req.body?.code, { hall: req.body?.hall, override: Boolean(req.body?.override) }, req.user);
  logCheckIn(req, r);
  res.json(new ApiResponse(200, r));
});

// POST /bookings/:id/check-in { override? } — marked by hand (devotee without the slip)
export const checkInOne = asyncHandler(async (req, res) => {
  const r = await checkInById(req.params.id, { override: Boolean(req.body?.override) }, req.user);
  logCheckIn(req, r);
  res.json(new ApiResponse(200, r));
});

// DELETE /bookings/:id/check-in — undo a check-in made by mistake
export const undoCheckInOne = asyncHandler(async (req, res) => {
  const { booking, was } = await undoCheckIn(req.params.id);
  logAction(req, {
    action: 'booking.checkin.undo', entity: 'Booking', entityId: booking.receiptNo, entityRef: booking._id,
    meta: { checkedInAt: was.checkedInAt, by: was.checkedInBy?.name },
  });
  res.json(new ApiResponse(200, booking, 'Check-in undone'));
});

// GET /bookings/check-in/summary?date=&hall= — arrivals per batch, latest check-ins
export const checkInStatus = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await checkInSummary(req.query)));
});

// GET /bookings/hall-board?hall=&date= — the hall screen: today's batches, serials, who has arrived
export const hallScreen = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await hallBoard(req.query)));
});

// GET /bookings/reports/attendance?from=&to= — fill rate and no-shows
export const reportAttendance = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await attendanceReport(req.query)));
});

// POST /bookings/:id/send — resend the receipt by WhatsApp / SMS
export const resend = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'confirmed') throw new ApiError(400, 'This booking was voided');
  const result = await sendReceipt(booking, { force: true });
  res.json(new ApiResponse(200, result, result.whatsapp === 'sent' || result.sms === 'sent' ? 'Receipt sent' : 'Not sent'));
});

// GET /bookings/export/excel
export const exportExcel = asyncHandler(async (req, res) => {
  const filter = await registerFilter({ ...req.query, status: req.query.status || 'all' });
  const count = await Booking.countDocuments(filter);
  if (count > 50000) throw new ApiError(400, `${count} bookings — narrow the date range (max 50,000 per file)`);
  const bookings = await Booking.find(filter).sort({ paidAt: 1 }).populate('createdBy', 'name').lean();
  await bookingsExcel(res, { bookings });
});

// GET /bookings/reports/summary?from=&to=
export const reportSummary = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await summary(req.query)));
});

// GET /bookings/reports/summary/pdf?from=&to=
export const reportSummaryPdf = asyncHandler(async (req, res) => {
  const [data, temple] = await Promise.all([summary(req.query), Settings.getOrCreate()]);
  const fmt = (k) => new Date(k).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rangeLabel = isDateKey(req.query.from) || isDateKey(req.query.to)
    ? `${isDateKey(req.query.from) ? fmt(req.query.from) : 'Beginning'} – ${isDateKey(req.query.to) ? fmt(req.query.to) : 'Today'}`
    : 'All time';
  summaryPdf(res, { data, rangeLabel, templeName: temple.templeName || 'Mangal Grah Mandir, Amalner' });
});

// GET /bookings/reports/day-sheet?date=YYYY-MM-DD
export const reportDaySheet = asyncHandler(async (req, res) => {
  const date = isDateKey(req.query.date) ? req.query.date : dateKeyOf();
  res.json(new ApiResponse(200, { date, groups: await daySheet(date) }));
});

// GET /public/receipts/:token — the receipt page linked from WhatsApp / SMS (no sign-in)
export const publicReceipt = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) throw new ApiError(404, 'Receipt not found');
  const [b, temple, settings] = await Promise.all([
    Booking.findOne({ receiptToken: token }).lean(),
    Settings.getOrCreate(),
    BookingSettings.getOrCreate(),
  ]);
  if (!b) throw new ApiError(404, 'Receipt not found');
  res.json(new ApiResponse(200, {
    receiptNo: b.receiptNo, status: b.status, sevaName: b.sevaName, schedule: b.schedule, amount: b.amount,
    performDate: b.performDate, dateKey: b.dateKey, batchLabel: b.batchLabel, hall: b.hall, serialNo: b.serialNo,
    devotee: { name: b.devotee.name, phone: `XXXXXX${b.devotee.phone.slice(-4)}`, gotra: b.devotee.gotra, familyNames: b.devotee.familyNames },
    peopleCount: b.peopleCount, paymentMode: b.paymentMode, paidAt: b.paidAt, checkedInAt: b.checkedInAt || null,
    temple: { name: temple.templeName, address: temple.templeAddress, phone: temple.templePhone },
    footer: settings.receiptFooter,
  }));
});
