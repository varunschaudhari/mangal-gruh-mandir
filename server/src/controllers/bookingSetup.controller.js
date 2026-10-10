import Booking from '../models/Booking.js';
import BookingBatch from '../models/BookingBatch.js';
import BookingClosure from '../models/BookingClosure.js';
import BookingSettings from '../models/BookingSettings.js';
import SevaType, { SCHEDULES } from '../models/SevaType.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { addDays, dateKeyOf, isDateKey } from '../services/booking/rules.js';

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
const weekdays = (w) => (Array.isArray(w) ? [...new Set(w.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : undefined);

// GET /booking-setup
export const getSetup = asyncHandler(async (req, res) => {
  const [sevaTypes, batches, closures, settings] = await Promise.all([
    SevaType.find().sort({ sortOrder: 1, name: 1 }).lean(),
    BookingBatch.find().sort({ start: 1, hall: 1 }).lean(),
    BookingClosure.find({ date: { $gte: addDays(dateKeyOf(), -30) } }).sort({ date: 1 }).lean(),
    BookingSettings.getOrCreate(),
  ]);
  res.json(new ApiResponse(200, { sevaTypes, batches, closures, settings }));
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

// ── Batches ───────────────────────────────────────────────────────────────────

const batchPayload = (body) => {
  const data = pick(body, ['start', 'end', 'hall', 'capacity', 'isActive']);
  if (data.start && data.end && data.end <= data.start) throw new ApiError(400, 'End time must be after the start time');
  if (body.weekdays !== undefined) data.weekdays = weekdays(body.weekdays);
  if (body.sevaTypes !== undefined) data.sevaTypes = Array.isArray(body.sevaTypes) ? body.sevaTypes : [];
  return data;
};

export const createBatch = asyncHandler(async (req, res) => {
  const batch = await BookingBatch.create(batchPayload(req.body));
  logAction(req, { action: 'booking.batch_create', entity: 'BookingBatch', entityId: `${batch.start} ${batch.hall}`, entityRef: batch._id });
  res.status(201).json(new ApiResponse(201, batch, 'Batch added'));
});

export const updateBatch = asyncHandler(async (req, res) => {
  const batch = await BookingBatch.findByIdAndUpdate(req.params.id, batchPayload(req.body), { returnDocument: 'after', runValidators: true });
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
  const data = pick(req.body, ['receiptPrefix', 'capacityUnit', 'maxAdvanceDays', 'printerName', 'paperWidth', 'receiptFooter', 'whatsappAuto', 'whatsappTemplate', 'smsAuto', 'smsTemplateId']);
  if (data.receiptPrefix !== undefined && !/^[A-Za-z]{1,8}$/.test(data.receiptPrefix)) throw new ApiError(400, 'Receipt prefix: 1–8 letters');
  const settings = await BookingSettings.getOrCreate();
  Object.assign(settings, data);
  await settings.save();
  logAction(req, { action: 'booking.settings_update', entity: 'BookingSettings', entityId: 'settings', entityRef: settings._id, after: data });
  res.json(new ApiResponse(200, settings, 'Settings saved'));
});
