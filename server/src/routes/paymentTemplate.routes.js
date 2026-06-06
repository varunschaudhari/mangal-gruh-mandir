import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getTemplates, createTemplate, deleteTemplate, markTemplateUsed } from '../controllers/paymentTemplate.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('payments:read'),  getTemplates)
  .post(authorize('payments:write'), createTemplate);

router.delete('/:id',     authorize('payments:write'), deleteTemplate);
router.patch('/:id/use',  authorize('payments:write'), markTemplateUsed);

export default router;
