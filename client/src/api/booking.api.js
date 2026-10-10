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
export const resendReceipt      = (id)             => api.post(`/bookings/${id}/send`);
export const exportBookingsExcel = (params)        => api.get('/bookings/export/excel', { params, responseType: 'blob' });

// ── Reports ───────────────────────────────────────────────────────────────────
export const getBookingSummary   = (params) => api.get('/bookings/reports/summary', { params });
export const getBookingSummaryPdf = (params) => api.get('/bookings/reports/summary/pdf', { params, responseType: 'blob' });
export const getDaySheet         = (date)   => api.get('/bookings/reports/day-sheet', { params: { date } });

// ── Setup (/booking-setup) ────────────────────────────────────────────────────
export const getBookingSetup      = ()         => api.get('/booking-setup');
export const createSevaType       = (data)     => api.post('/booking-setup/seva-types', data);
export const updateSevaType       = (id, data) => api.put(`/booking-setup/seva-types/${id}`, data);
export const deleteSevaType       = (id)       => api.delete(`/booking-setup/seva-types/${id}`);
export const createBookingBatch   = (data)     => api.post('/booking-setup/batches', data);
export const updateBookingBatch   = (id, data) => api.put(`/booking-setup/batches/${id}`, data);
export const deleteBookingBatch   = (id)       => api.delete(`/booking-setup/batches/${id}`);
export const createClosure        = (data)     => api.post('/booking-setup/closures', data);
export const deleteClosure        = (id)       => api.delete(`/booking-setup/closures/${id}`);
export const updateBookingSettings = (data)    => api.put('/booking-setup/settings', data);

// ── Public receipt (no sign-in; plain axios so a stale login never interferes) ─
export const getPublicReceipt = (token) => axios.get(serverUrl(`/api/public/receipts/${token}`));
