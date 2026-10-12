import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  availability, checkIn, checkInOne, checkInStatus, create, devotee, exportExcel, getOne, getOptions, hallEvents, hallScreen, list, move,
  reportAttendance, reportDaySheet, reportSummary, reportSummaryPdf, resend, undoCheckInOne, update, voidOne,
} from '../controllers/booking.controller.js';
import * as shifts from '../controllers/bookingShift.controller.js';
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
bookingRouter.get('/reports/attendance',   authorize('bookings:read'),   reportAttendance);
// Hall check-in (scanner at the hall)
bookingRouter.get('/check-in/summary',     authorize('bookings:checkin'), checkInStatus);
bookingRouter.post('/check-in',            authorize('bookings:checkin'), checkIn);
bookingRouter.get('/hall-board',           authorize('bookings:checkin'), hallScreen);
bookingRouter.get('/hall-events',          authorize('bookings:checkin'), hallEvents);
bookingRouter.route('/')
  .get(authorize('bookings:read'), list)
  .post(authorize('bookings:create'), create);
bookingRouter.route('/:id')
  .get(authorize('bookings:read'), getOne)
  .patch(authorize('bookings:create'), update);
bookingRouter.post('/:id/move',            authorize('bookings:create'), move);
bookingRouter.patch('/:id/void',           authorize('bookings:void'),   voidOne);
bookingRouter.post('/:id/send',            authorize('bookings:create'), resend);
bookingRouter.route('/:id/check-in')
  .post(authorize('bookings:checkin'), checkInOne)
  .delete(authorize('bookings:checkin'), undoCheckInOne);

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

// /booking-shifts — counter shift close and cash handover
export const bookingShiftRouter = Router();
bookingShiftRouter.use(protect);
bookingShiftRouter.get('/current',      authorize('bookings:create'), shifts.current);
bookingShiftRouter.post('/close',       authorize('bookings:create'), shifts.close);
bookingShiftRouter.get('/',             authorize('bookings:read'),   shifts.list);
bookingShiftRouter.get('/:id',          authorize('bookings:read'),   shifts.getOne);
bookingShiftRouter.patch('/:id/verify', authorize('bookings:cash'),   shifts.verify);
