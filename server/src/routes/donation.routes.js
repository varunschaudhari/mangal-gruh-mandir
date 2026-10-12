import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/donation.schemas.js';
import { getDonations, getDonation, getDonationStats, createDonation, voidDonation, exportDonationsExcel, exportDonationsPDF, get80GReceipt, getDonationReceipt, getDonorStatement, lookupDonor } from '../controllers/donation.controller.js';

const router = Router();
router.use(protect);

// Static routes before /:id to avoid param collision
router.get('/stats',                      authorize('donations:read'),  validate(v.donationStats),   getDonationStats);
router.get('/lookup-donor',               authorize('donations:read'),  validate(v.lookupDonor),     lookupDonor);
router.get('/donor-statement/:donorId',   authorize('donations:read'),  validate(v.donorStatement),  getDonorStatement);
router.get('/export/excel',               authorize('donations:read'),  validate(v.exportDonations), exportDonationsExcel);
router.get('/export/pdf',                 authorize('donations:read'),  validate(v.exportDonations), exportDonationsPDF);

router.route('/')
  .get(authorize('donations:read'),   validate(v.listDonations),  getDonations)
  .post(authorize('donations:write'), validate(v.createDonation), createDonation);

router.route('/:id')
  .get(authorize('donations:read'), validate(v.donationById), getDonation);

router.patch('/:id/void',      authorize('donations:write'), validate(v.voidDonation), voidDonation);
router.get('/:id/80g-receipt', authorize('donations:read'),  validate(v.donationById), get80GReceipt);
router.get('/:id/receipt',     authorize('donations:read'),  validate(v.donationById), getDonationReceipt);

export default router;
