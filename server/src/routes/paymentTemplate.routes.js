import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/admin.schemas.js';
import { getTemplates, createTemplate, deleteTemplate, markTemplateUsed } from '../controllers/paymentTemplate.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('payments:read'),  getTemplates)
  .post(authorize('payments:write'), validate(v.createTemplate), createTemplate);

router.delete('/:id',     authorize('payments:write'), validate(v.templateById), deleteTemplate);
router.patch('/:id/use',  authorize('payments:write'), validate(v.templateById), markTemplateUsed);

export default router;
