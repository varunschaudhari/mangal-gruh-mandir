import { getPermissionsForRole } from '../middleware/authorize.js';
import { logAction } from '../services/audit.service.js';
import { closeShift, currentShift, getShift, listShifts, verifyShift } from '../services/booking/shift.service.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

// bookings:cash = see everyone's handovers and verify them; others see only their own.
const canSeeAll = async (req) => {
  const perms = await getPermissionsForRole(req.user.role);
  return perms.includes('*') || perms.includes('bookings:cash');
};

// GET /booking-shifts/current — my bookings since my last close
export const current = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await currentShift(req.user)));
});

// POST /booking-shifts/close { countedCash | denominations, openingFloat?, notes? }
export const close = asyncHandler(async (req, res) => {
  const shift = await closeShift(req.user, req.body || {});
  logAction(req, {
    action: 'booking.shift.close', entity: 'BookingShift', entityRef: shift._id,
    meta: { bookings: shift.totals.count, cash: shift.totals.cash, counted: shift.countedCash, difference: shift.difference },
  });
  res.status(201).json(new ApiResponse(201, await getShift(shift._id, req.user, { canSeeAll: true }), 'Shift closed'));
});

// GET /booking-shifts?from=&to=&user=&status=
export const list = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await listShifts(req.query, req.user, { canSeeAll: await canSeeAll(req) })));
});

// GET /booking-shifts/:id
export const getOne = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await getShift(req.params.id, req.user, { canSeeAll: await canSeeAll(req) })));
});

// PATCH /booking-shifts/:id/verify { note?, digitalChecked? } — digitalChecked is needed when the shift has UPI / card
export const verify = asyncHandler(async (req, res) => {
  const shift = await verifyShift(req.params.id, req.body || {}, req.user);
  logAction(req, {
    action: 'booking.shift.verify', entity: 'BookingShift', entityRef: shift._id,
    meta: { user: shift.user?.name, difference: shift.difference, note: shift.verifyNote },
  });
  res.json(new ApiResponse(200, shift, 'Handover verified'));
});
