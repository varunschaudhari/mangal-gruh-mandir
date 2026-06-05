import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getDonations, getDonation, getDonationStats, createDonation, voidDonation, exportDonationsExcel, exportDonationsPDF, get80GReceipt } from '../controllers/donation.controller.js';

const router = Router();
router.use(protect);

router.get('/stats',  authorize('donations:read'),  getDonationStats);
router.route('/')
  .get(authorize('donations:read'),  getDonations)
  .post(authorize('donations:write'), createDonation);

router.route('/:id')
  .get(authorize('donations:read'), getDonation);

router.patch('/:id/void',            authorize('donations:write'), voidDonation);
router.get('/:id/80g-receipt',       authorize('donations:read'),  get80GReceipt);
router.get('/export/excel',          authorize('donations:read'),  exportDonationsExcel);
router.get('/export/pdf',            authorize('donations:read'),  exportDonationsPDF);

export default router;
