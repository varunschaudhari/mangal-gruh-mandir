import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getUtilizationReport, getFineReport, exportAssetExcel, exportAssetPDF } from '../controllers/assetReport.controller.js';

const router = Router();
router.use(protect);

router.get('/utilization',    authorize('assets:read'), getUtilizationReport);
router.get('/fines',          authorize('assets:read'), getFineReport);
router.get('/export/excel',   authorize('assets:read'), exportAssetExcel);
router.get('/export/pdf',     authorize('assets:read'), exportAssetPDF);

export default router;
