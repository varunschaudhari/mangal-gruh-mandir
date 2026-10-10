import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getPayrollSettings, updatePayrollSettings,
  listRuns, getRun, prepare, editLine, finalize, reopen, markPaid, deleteDraft, downloadFile,
  listAdvances, addAdvance, deleteAdvance,
} from '../controllers/salary.controller.js';

// salary:read   — see salary months, payslips and files
// salary:manage — prepare, change, finalise and pay salary; advances; salary settings
const router = Router();
router.use(protect);

router.get('/settings', authorize('salary:read'), getPayrollSettings);
router.put('/settings', authorize('salary:manage'), updatePayrollSettings);

router.get('/runs', authorize('salary:read'), listRuns);
router.get('/runs/:month', authorize('salary:read'), getRun);
router.post('/runs/:month/prepare', authorize('salary:manage'), prepare);
router.patch('/runs/:month/lines/:staffId', authorize('salary:manage'), editLine);
router.post('/runs/:month/finalize', authorize('salary:manage'), finalize);
router.post('/runs/:month/reopen', authorize('salary:manage'), reopen);
router.post('/runs/:month/paid', authorize('salary:manage'), markPaid);
router.delete('/runs/:month', authorize('salary:manage'), deleteDraft);
router.get('/runs/:month/files/:kind', authorize('salary:read'), downloadFile);

router.get('/advances', authorize('salary:read'), listAdvances);
router.post('/advances', authorize('salary:manage'), addAdvance);
router.delete('/advances/:id', authorize('salary:manage'), deleteAdvance);

export default router;
