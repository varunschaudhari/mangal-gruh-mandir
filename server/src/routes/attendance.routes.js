import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getAttendanceSettings, updateAttendanceSettings,
  listStaff, getStaff, createStaff, updateStaff, unmappedMachineIds,
  getRoster, saveRoster, copyRosterWeek,
  getAttendanceDays, getStaffDay, exportRegister, getMonth,
  addManualPunch, ignorePunch, setOverride, removeOverride,
  setDoubleDecision, clearDoubleDecision, setMonthAdjustment, markLeave,
} from '../controllers/attendance.controller.js';

// attendance:read   — see attendance, roster and staff
// attendance:write  — plan the roster and fix attendance (supervisors)
// attendance:manage — staff register, shift timings, rules and machines
// attendance:approve — double-shift rewards and overtime amounts (management)
const router = Router();
router.use(protect);

router.get('/settings', authorize('attendance:read'), getAttendanceSettings);
router.put('/settings', authorize('attendance:manage'), updateAttendanceSettings);

router.get('/staff', authorize('attendance:read'), listStaff);
router.get('/staff/unmapped', authorize('attendance:manage'), unmappedMachineIds);
router.get('/staff/:id', authorize('attendance:read'), getStaff);
router.post('/staff', authorize('attendance:manage'), createStaff);
router.put('/staff/:id', authorize('attendance:manage'), updateStaff);

router.get('/roster', authorize('attendance:read'), getRoster);
router.put('/roster', authorize('attendance:write'), saveRoster);
router.post('/roster/copy-week', authorize('attendance:write'), copyRosterWeek);

router.get('/days', authorize('attendance:read'), getAttendanceDays);
router.get('/days/:staffId/:date', authorize('attendance:read'), getStaffDay);
router.get('/month', authorize('attendance:read'), getMonth);
router.get('/register/excel', authorize('attendance:read'), exportRegister);

router.post('/punches', authorize('attendance:write'), addManualPunch);
router.patch('/punches/:id/ignore', authorize('attendance:write'), ignorePunch);
router.put('/overrides', authorize('attendance:write'), setOverride);
router.delete('/overrides/:staffId/:date', authorize('attendance:write'), removeOverride);
router.post('/leave', authorize('attendance:write'), markLeave);

router.put('/doubles', authorize('attendance:approve'), setDoubleDecision);
router.delete('/doubles/:staffId/:date', authorize('attendance:approve'), clearDoubleDecision);
router.put('/month-adjustments', authorize('attendance:approve'), setMonthAdjustment);

export default router;
