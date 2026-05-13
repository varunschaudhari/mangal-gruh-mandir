import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getDailyReport,
  exportDailyPDF,
  exportDailyExcel,
  getDailyWhatsApp,
} from '../controllers/report.controller.js';

const router = Router();

router.use(protect);
router.use(authorize('reports:read'));

router.get('/daily',           getDailyReport);
router.get('/daily/pdf',       exportDailyPDF);
router.get('/daily/excel',     exportDailyExcel);
router.get('/daily/whatsapp',  getDailyWhatsApp);

export default router;
