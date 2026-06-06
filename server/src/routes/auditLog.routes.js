import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getAuditLogs, getEntityHistory, exportAuditLogs } from '../controllers/auditLog.controller.js';

const router = Router();

// Entity history — any authenticated user who can view the entity can see its history
router.get('/entity/:entityRef', protect, getEntityHistory);

// Full audit log and export — restricted to users with user-management access
router.use(protect, authorize('users:read'));
router.get('/',       getAuditLogs);
router.get('/export', exportAuditLogs);

export default router;
