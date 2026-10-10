import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  availability, create, devotee, exportExcel, getOne, getOptions, list, reportDaySheet,
  reportSummary, reportSummaryPdf, resend, voidOne,
} from '../controllers/booking.controller.js';
import {
  createBatch, createClosure, createSevaType, deleteBatch, deleteClosure, deleteSevaType,
  getSetup, updateBatch, updateSettings, updateSevaType,
} from '../controllers/bookingSetup.controller.js';

// /bookings — counter, register, reports
export const bookingRouter = Router();
bookingRouter.use(protect);
bookingRouter.get('/options',              authorize('bookings:read'),   getOptions);
bookingRouter.get('/availability',         authorize('bookings:read'),   availability);
bookingRouter.get('/devotee',              authorize('bookings:create'), devotee);
bookingRouter.get('/export/excel',         authorize('bookings:read'),   exportExcel);
bookingRouter.get('/reports/summary',      authorize('bookings:read'),   reportSummary);
bookingRouter.get('/reports/summary/pdf',  authorize('bookings:read'),   reportSummaryPdf);
bookingRouter.get('/reports/day-sheet',    authorize('bookings:read'),   reportDaySheet);
bookingRouter.route('/')
  .get(authorize('bookings:read'), list)
  .post(authorize('bookings:create'), create);
bookingRouter.get('/:id',                  authorize('bookings:read'),   getOne);
bookingRouter.patch('/:id/void',           authorize('bookings:void'),   voidOne);
bookingRouter.post('/:id/send',            authorize('bookings:create'), resend);

// /booking-setup — seva types, batches, closed dates, settings
export const bookingSetupRouter = Router();
bookingSetupRouter.use(protect);
bookingSetupRouter.get('/', authorize('bookings:read'), getSetup);
bookingSetupRouter.use(authorize('bookings:manage'));
bookingSetupRouter.post('/seva-types', createSevaType);
bookingSetupRouter.route('/seva-types/:id').put(updateSevaType).delete(deleteSevaType);
bookingSetupRouter.post('/batches', createBatch);
bookingSetupRouter.route('/batches/:id').put(updateBatch).delete(deleteBatch);
bookingSetupRouter.post('/closures', createClosure);
bookingSetupRouter.delete('/closures/:id', deleteClosure);
bookingSetupRouter.put('/settings', updateSettings);
