import axios from 'axios';
import api from './axios.js';
import { serverUrl } from '../utils/platform.js';

// ── Counter & register (/bookings) ────────────────────────────────────────────
export const getBookingOptions = ()               => api.get('/bookings/options');
export const getAvailability    = (sevaType, date) => api.get('/bookings/availability', { params: { sevaType, date } });
export const lookupDevotee      = (phone)          => api.get('/bookings/devotee', { params: { phone } });
export const createBooking      = (data)           => api.post('/bookings', data);
export const getBookings        = (params)         => api.get('/bookings', { params });
export const getBooking         = (id)             => api.get(`/bookings/${id}`);
export const voidBooking        = (id, reason)     => api.patch(`/bookings/${id}/void`, { reason });
// Fix details { devotee?, peopleCount?, notes?, paymentMode?, paymentRef?, reason? } — receipt no. and amount stay
export const updateBooking      = (id, data)       => api.patch(`/bookings/${id}`, data);
// Another batch / date { date, batch?, reason? } — new serial, same receipt
export const moveBooking        = (id, data)       => api.post(`/bookings/${id}/move`, data);
export const resendReceipt      = (id)             => api.post(`/bookings/${id}/send`);
export const exportBookingsExcel = (params)        => api.get('/bookings/export/excel', { params, responseType: 'blob' });

// ── Reports ───────────────────────────────────────────────────────────────────
export const getBookingSummary   = (params) => api.get('/bookings/reports/summary', { params });
export const getBookingSummaryPdf = (params) => api.get('/bookings/reports/summary/pdf', { params, responseType: 'blob' });
export const getDaySheet         = (date)   => api.get('/bookings/reports/day-sheet', { params: { date } });
// Fill rate and no-shows by puja date ({ from, to })
export const getAttendanceReport = (params) => api.get('/bookings/reports/attendance', { params });

// ── Hall check-in ─────────────────────────────────────────────────────────────
// { code: QR link | receipt no. | number, hall?, override? } → { result, checkedIn, canOverride, booking }
export const checkInByCode     = (data)            => api.post('/bookings/check-in', data);
export const checkInBooking    = (id, override)    => api.post(`/bookings/${id}/check-in`, { override });
export const undoCheckIn       = (id)              => api.delete(`/bookings/${id}/check-in`);
export const getCheckInSummary = (params)          => api.get('/bookings/check-in/summary', { params });
// The hall screen: today's batches with serials and who has arrived ({ hall?, date? })
export const getHallBoard      = (params)          => api.get('/bookings/hall-board', { params });

// ── Shift close & cash handover (/booking-shifts) ─────────────────────────────
export const getCurrentShift = ()           => api.get('/booking-shifts/current');
// { countedCash | denominations: { 500: n, … }, openingFloat?, notes? } — a difference needs notes
export const closeShift      = (data)       => api.post('/booking-shifts/close', data);
export const getShifts       = (params)     => api.get('/booking-shifts', { params });
export const getShift        = (id)         => api.get(`/booking-shifts/${id}`);
export const verifyShift     = (id, note, digitalChecked = false) => api.patch(`/booking-shifts/${id}/verify`, { note, digitalChecked });

// ── Setup (/booking-setup) ────────────────────────────────────────────────────
export const getBookingSetup      = ()         => api.get('/booking-setup');
export const createSevaType       = (data)     => api.post('/booking-setup/seva-types', data);
export const updateSevaType       = (id, data) => api.put(`/booking-setup/seva-types/${id}`, data);
export const deleteSevaType       = (id)       => api.delete(`/booking-setup/seva-types/${id}`);
export const createBookingHall    = (data)     => api.post('/booking-setup/halls', data);
export const updateBookingHall    = (id, data) => api.put(`/booking-setup/halls/${id}`, data);
export const deleteBookingHall    = (id)       => api.delete(`/booking-setup/halls/${id}`);
export const createBookingBatch   = (data)     => api.post('/booking-setup/batches', data);
export const updateBookingBatch   = (id, data) => api.put(`/booking-setup/batches/${id}`, data);
export const deleteBookingBatch   = (id)       => api.delete(`/booking-setup/batches/${id}`);
export const createClosure        = (data)     => api.post('/booking-setup/closures', data);
export const deleteClosure        = (id)       => api.delete(`/booking-setup/closures/${id}`);
export const updateBookingSettings = (data)    => api.put('/booking-setup/settings', data);
export const recountBookingSeats  = ()         => api.post('/booking-setup/recount-seats');

// ── Public receipt (no sign-in; plain axios so a stale login never interferes) ─
export const getPublicReceipt = (token) => axios.get(serverUrl(`/api/public/receipts/${token}`));
