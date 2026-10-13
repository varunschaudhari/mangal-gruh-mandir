import Booking from '../models/Booking.js';
import BookingBatch from '../models/BookingBatch.js';
import BookingClosure from '../models/BookingClosure.js';
import BookingHall, { HALL_CODE } from '../models/BookingHall.js';
import BookingSettings from '../models/BookingSettings.js';
import SevaType, { SCHEDULES } from '../models/SevaType.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { addDays, dateKeyOf, isDateKey } from '../services/booking/rules.js';
import { listHalls } from '../services/booking/halls.js';
import { recountSeats } from '../services/booking/booking.service.js';

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const weekdays = (w) => (Array.isArray(w) ? [...new Set(w.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : undefined);

// GET /booking-setup
export const getSetup = asyncHandler(async (req, res) => {
  const [sevaTypes, batches, closures, settings, halls] = await Promise.all([
    SevaType.find().sort({ sortOrder: 1, name: 1 }).lean(),
    BookingBatch.find().sort({ start: 1, hall: 1 }).lean(),
    BookingClosure.find({ date: { $gte: addDays(dateKeyOf(), -30) } }).sort({ date: 1 }).lean(),
    BookingSettings.getOrCreate(),
    listHalls({ sync: true }),
  ]);
  res.json(new ApiResponse(200, { sevaTypes, batches, closures, settings, halls }));
});

// ── Seva types ────────────────────────────────────────────────────────────────

const SEVA_FIELDS = ['name', 'nameMr', 'code', 'description', 'price', 'schedule', 'duration', 'slotTime', 'dailyLimit', 'maxPeople', 'needsPostalAddress', 'isActive', 'sortOrder'];

const sevaPayload = (body) => {
  const data = pick(body, SEVA_FIELDS);
  if (data.schedule && !SCHEDULES.includes(data.schedule)) throw new ApiError(400, 'Unknown schedule');
  if (body.weekdays !== undefined) data.weekdays = weekdays(body.weekdays);
  return data;
};

export const createSevaType = asyncHandler(async (req, res) => {
  const seva = await SevaType.create(sevaPayload(req.body));
  logAction(req, { action: 'booking.seva_create', entity: 'SevaType', entityId: seva.name, entityRef: seva._id, after: { price: seva.price, schedule: seva.schedule } });
  res.status(201).json(new ApiResponse(201, seva, 'Seva type added'));
});

export const updateSevaType = asyncHandler(async (req, res) => {
  const before = await SevaType.findById(req.params.id).lean();
  if (!before) throw new ApiError(404, 'Seva type not found');
  const seva = await SevaType.findByIdAndUpdate(req.params.id, sevaPayload(req.body), { returnDocument: 'after', runValidators: true });
  logAction(req, {
    action: 'booking.seva_update', entity: 'SevaType', entityId: seva.name, entityRef: seva._id,
    before: { price: before.price, isActive: before.isActive }, after: { price: seva.price, isActive: seva.isActive },
  });
  res.json(new ApiResponse(200, seva, 'Seva type saved'));
});

// Deleting is only allowed before the first booking; after that, switch it off instead.
export const deleteSevaType = asyncHandler(async (req, res) => {
  if (await Booking.exists({ sevaType: req.params.id })) throw new ApiError(400, 'This seva has bookings — mark it inactive instead');
  const seva = await SevaType.findByIdAndDelete(req.params.id);
  if (!seva) throw new ApiError(404, 'Seva type not found');
  logAction(req, { action: 'booking.seva_delete', entity: 'SevaType', entityId: seva.name, entityRef: seva._id });
  res.json(new ApiResponse(200, null, 'Seva type deleted'));
});

// ── Halls ─────────────────────────────────────────────────────────────────────
// The code is fixed once added (batches, bookings and printed slips carry it); the names can
// change any time. A hall can be removed only while nothing uses it — otherwise switch it off.

const hallFields = (body) => {
  const data = pick(body, ['name', 'nameMr', 'isActive', 'sortOrder']);
  for (const k of ['name', 'nameMr']) if (data[k] !== undefined) data[k] = String(data[k] ?? '').trim().slice(0, 60);
  if (data.isActive !== undefined) data.isActive = Boolean(data.isActive);
  if (data.sortOrder !== undefined) data.sortOrder = Number(data.sortOrder) || 0;
  return data;
};

export const createHall = asyncHandler(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!HALL_CODE.test(code)) throw new ApiError(400, 'Hall code: up to 8 capital letters or digits, like H1');
  if (await BookingHall.exists({ code })) throw new ApiError(409, `Hall ${code} is already in the list`);
  const data = hallFields(req.body);
  if (data.sortOrder === undefined) data.sortOrder = await BookingHall.countDocuments();
  const hall = await BookingHall.create({ ...data, code });
  logAction(req, { action: 'booking.hall_create', entity: 'BookingHall', entityId: hall.code, entityRef: hall._id, after: { name: hall.name, nameMr: hall.nameMr } });
  res.status(201).json(new ApiResponse(201, hall, 'Hall added'));
});

export const updateHall = asyncHandler(async (req, res) => {
  const before = await BookingHall.findById(req.params.id).lean();
  if (!before) throw new ApiError(404, 'Hall not found');
  if (req.body?.code !== undefined && String(req.body.code).trim().toUpperCase() !== before.code.toUpperCase()) {
    throw new ApiError(400, 'The hall code can’t be changed — slips already carry it. Change the name instead.');
  }
  const data = hallFields(req.body);
  if (data.isActive === false && before.isActive) {
    const n = await BookingBatch.countDocuments({ hall: before.code, isActive: true });
    if (n) throw new ApiError(400, `${n} active batch${n === 1 ? ' uses' : 'es use'} hall ${before.code} — switch ${n === 1 ? 'it' : 'them'} off or move ${n === 1 ? 'it' : 'them'} to another hall first`);
  }
  const hall = await BookingHall.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true });
  logAction(req, {
    action: 'booking.hall_update', entity: 'BookingHall', entityId: hall.code, entityRef: hall._id,
    before: { name: before.name, nameMr: before.nameMr, isActive: before.isActive }, after: { name: hall.name, nameMr: hall.nameMr, isActive: hall.isActive },
  });
  res.json(new ApiResponse(200, hall, 'Hall saved'));
});

export const deleteHall = asyncHandler(async (req, res) => {
  const hall = await BookingHall.findById(req.params.id).lean();
  if (!hall) throw new ApiError(404, 'Hall not found');
  if (await BookingBatch.exists({ hall: hall.code })) throw new ApiError(400, `Batches use hall ${hall.code} — move them to another hall or delete them first`);
  if (await Booking.exists({ hall: hall.code })) throw new ApiError(400, `Hall ${hall.code} has bookings — switch it off instead`);
  await BookingHall.deleteOne({ _id: hall._id });
  logAction(req, { action: 'booking.hall_delete', entity: 'BookingHall', entityId: hall.code, entityRef: hall._id });
  res.json(new ApiResponse(200, null, 'Hall deleted'));
});

// ── Batches ───────────────────────────────────────────────────────────────────

const batchPayload = (body) => {
  const data = pick(body, ['start', 'end', 'hall', 'capacity', 'isActive']);
  if (data.start && data.end && data.end <= data.start) throw new ApiError(400, 'End time must be after the start time');
  if (data.hall !== undefined) data.hall = String(data.hall || '').trim();
  if (body.weekdays !== undefined) data.weekdays = weekdays(body.weekdays);
  if (body.sevaTypes !== undefined) data.sevaTypes = Array.isArray(body.sevaTypes) ? body.sevaTypes : [];
  return data;
};

// A batch's hall must be one from Setup → Halls, and switched on (unless the batch already had it).
async function checkHall(code, current) {
  if (code === undefined || code === current) return;
  const hall = await BookingHall.findOne({ code }).lean();
  if (!hall) throw new ApiError(400, 'Choose a hall from the list (Setup → Halls)');
  if (!hall.isActive) throw new ApiError(400, `Hall ${code} is switched off — switch it on in Setup → Halls first`);
}

export const createBatch = asyncHandler(async (req, res) => {
  const data = batchPayload(req.body);
  if (!data.hall) throw new ApiError(400, 'Choose a hall');
  await checkHall(data.hall);
  const batch = await BookingBatch.create(data);
  logAction(req, { action: 'booking.batch_create', entity: 'BookingBatch', entityId: `${batch.start} ${batch.hall}`, entityRef: batch._id });
  res.status(201).json(new ApiResponse(201, batch, 'Batch added'));
});

export const updateBatch = asyncHandler(async (req, res) => {
  const before = await BookingBatch.findById(req.params.id).lean();
  if (!before) throw new ApiError(404, 'Batch not found');
  const data = batchPayload(req.body);
  if (data.hall === '') throw new ApiError(400, 'Choose a hall');
  await checkHall(data.hall, before.hall);
  const batch = await BookingBatch.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true });
  if (!batch) throw new ApiError(404, 'Batch not found');
  logAction(req, { action: 'booking.batch_update', entity: 'BookingBatch', entityId: `${batch.start} ${batch.hall}`, entityRef: batch._id, after: { capacity: batch.capacity, isActive: batch.isActive } });
  res.json(new ApiResponse(200, batch, 'Batch saved'));
});

export const deleteBatch = asyncHandler(async (req, res) => {
  if (await Booking.exists({ batch: req.params.id })) throw new ApiError(400, 'This batch has bookings — mark it inactive instead');
  const batch = await BookingBatch.findByIdAndDelete(req.params.id);
  if (!batch) throw new ApiError(404, 'Batch not found');
  logAction(req, { action: 'booking.batch_delete', entity: 'BookingBatch', entityId: `${batch.start} ${batch.hall}`, entityRef: batch._id });
  res.json(new ApiResponse(200, null, 'Batch deleted'));
});

// ── Closed dates ──────────────────────────────────────────────────────────────

export const createClosure = asyncHandler(async (req, res) => {
  if (!isDateKey(req.body?.date)) throw new ApiError(400, 'Choose a date');
  const closure = await BookingClosure.create({
    date: req.body.date, reason: String(req.body.reason || '').trim().slice(0, 120),
    sevaTypes: Array.isArray(req.body.sevaTypes) ? req.body.sevaTypes : [], createdBy: req.user._id,
  });
  const existing = await Booking.countDocuments({
    dateKey: closure.date, status: 'confirmed',
    ...(closure.sevaTypes.length ? { sevaType: { $in: closure.sevaTypes } } : {}),
  });
  logAction(req, { action: 'booking.closure_create', entity: 'BookingClosure', entityId: closure.date, entityRef: closure._id, meta: { reason: closure.reason } });
  res.status(201).json(new ApiResponse(201, { ...closure.toObject(), existingBookings: existing }, 'Date closed'));
});

export const deleteClosure = asyncHandler(async (req, res) => {
  const closure = await BookingClosure.findByIdAndDelete(req.params.id);
  if (!closure) throw new ApiError(404, 'Not found');
  logAction(req, { action: 'booking.closure_delete', entity: 'BookingClosure', entityId: closure.date, entityRef: closure._id });
  res.json(new ApiResponse(200, null, 'Date reopened'));
});

// ── Settings ──────────────────────────────────────────────────────────────────

export const updateSettings = asyncHandler(async (req, res) => {
  const data = pick(req.body, ['receiptPrefix', 'capacityUnit', 'maxAdvanceDays', 'printerName', 'paperWidth', 'receiptFooter', 'whatsappAuto', 'whatsappTemplate', 'whatsappImage', 'whatsappLanguages', 'whatsappLanguage', 'smsAuto', 'smsTemplateId']);
  if (data.receiptPrefix !== undefined && !/^[A-Za-z]{1,8}$/.test(data.receiptPrefix)) throw new ApiError(400, 'Receipt prefix: 1–8 letters');
  if (data.whatsappLanguages !== undefined) {
    data.whatsappLanguages = [...new Set([].concat(data.whatsappLanguages).filter((l) => ['mr', 'en'].includes(l)))];
    if (!data.whatsappLanguages.length) throw new ApiError(400, 'Tick at least one language the WhatsApp template is approved in');
  }
  if (data.whatsappLanguage !== undefined && !['mr', 'en'].includes(data.whatsappLanguage)) throw new ApiError(400, 'Message language: Marathi or English');
  const settings = await BookingSettings.getOrCreate();
  Object.assign(settings, data);
  await settings.save();
  logAction(req, { action: 'booking.settings_update', entity: 'BookingSettings', entityId: 'settings', entityRef: settings._id, after: data });
  res.json(new ApiResponse(200, settings, 'Settings saved'));
});

// POST /booking-setup/recount-seats — puts the seat counters (today and later) back in line
// with the bookings, e.g. when a batch shows "full" but has free seats. Also runs every night.
export const recountSeatCounters = asyncHandler(async (req, res) => {
  const fixed = await recountSeats();
  logAction(req, { action: 'booking.seats_recount', entity: 'SlotCounter', entityId: 'seats', meta: { fixed: fixed.length, keys: fixed.slice(0, 20) } });
  res.json(new ApiResponse(200, { fixed }, fixed.length ? 'Seat counts corrected' : 'Seat counts were already right'));
});
