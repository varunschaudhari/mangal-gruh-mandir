import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getDailyReport, exportDailyPDF, exportDailyExcel, getDailyWhatsApp,
  getLowStockReport, exportLowStockPDF, getLowStockWhatsApp,
  getExpiringReport, exportExpiringPDF, getExpiringWhatsApp,
  getValuationReport, exportValuationPDF, exportValuationExcel,
  getSupplierReport, exportSupplierPDF, exportSupplierExcel,
  getFestivalCostReport, getConsumptionTrend, getReorderSuggestions,
} from '../controllers/report.controller.js';

const router = Router();
router.use(protect);
router.use(authorize('reports:read'));

// Daily movement
router.get('/daily',              getDailyReport);
router.get('/daily/pdf',          exportDailyPDF);
router.get('/daily/excel',        exportDailyExcel);
router.get('/daily/whatsapp',     getDailyWhatsApp);

// Low stock
router.get('/low-stock',          getLowStockReport);
router.get('/low-stock/pdf',      exportLowStockPDF);
router.get('/low-stock/whatsapp', getLowStockWhatsApp);

// Expiring stock
router.get('/expiring',           getExpiringReport);
router.get('/expiring/pdf',       exportExpiringPDF);
router.get('/expiring/whatsapp',  getExpiringWhatsApp);

// Stock valuation
router.get('/valuation',          getValuationReport);
router.get('/valuation/pdf',      exportValuationPDF);
router.get('/valuation/excel',    exportValuationExcel);

// Supplier purchases
router.get('/suppliers',          getSupplierReport);
router.get('/suppliers/pdf',      exportSupplierPDF);
router.get('/suppliers/excel',    exportSupplierExcel);

// Festival cost
router.get('/festival-cost',      getFestivalCostReport);

// Consumption trend
router.get('/consumption-trend',  getConsumptionTrend);

// Reorder suggestions
router.get('/reorder-suggestions', getReorderSuggestions);

export default router;
