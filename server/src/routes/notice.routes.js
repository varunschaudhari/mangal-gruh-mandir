import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as schemas from '../validation/notice.schemas.js';
import {
  getStaffNotices, getAllNotices, createNotice, updateNotice, deleteNotice,
} from '../controllers/notice.controller.js';

// Notice board. The devotees' list (no sign-in) is /api/public/notices, in routes/index.js.
const router = Router();
router.use(protect);

router.get('/',        getStaffNotices);   // everyone signed in: the staff notice board
router.get('/all',     authorize('notices:manage'), getAllNotices);
router.post('/',       authorize('notices:manage'), validate(schemas.create), createNotice);
router.put('/:id',     authorize('notices:manage'), validate(schemas.update), updateNotice);
router.delete('/:id',  authorize('notices:manage'), validate(schemas.byId), deleteNotice);

export default router;
