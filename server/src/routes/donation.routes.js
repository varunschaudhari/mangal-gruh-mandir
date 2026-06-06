import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getDonations, getDonation, getDonationStats, createDonation, voidDonation, exportDonationsExcel, exportDonationsPDF, get80GReceipt, getDonationReceipt, getDonorStatement } from '../controllers/donation.controller.js';

const router = Router();
router.use(protect);

// Static routes before /:id to avoid param collision
router.get('/stats',                      authorize('donations:read'),  getDonationStats);
router.get('/donor-statement/:donorId',   authorize('donations:read'),  getDonorStatement);
router.get('/export/excel',               authorize('donations:read'),  exportDonationsExcel);
router.get('/export/pdf',                 authorize('donations:read'),  exportDonationsPDF);

router.route('/')
  .get(authorize('donations:read'),  getDonations)
  .post(authorize('donations:write'), createDonation);

router.route('/:id')
  .get(authorize('donations:read'), getDonation);

router.patch('/:id/void',      authorize('donations:write'), voidDonation);
router.get('/:id/80g-receipt', authorize('donations:read'),  get80GReceipt);
router.get('/:id/receipt',     authorize('donations:read'),  getDonationReceipt);

export default router;
