import { Router } from 'express';
import { apiLimiter } from '../middleware/rateLimiter.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import departmentRoutes from './department.routes.js';
import categoryRoutes from './category.routes.js';
import unitRoutes from './unit.routes.js';
import productRoutes from './product.routes.js';
import supplierRoutes from './supplier.routes.js';
import stockTransactionRoutes from './stockTransaction.routes.js';
import stockBalanceRoutes from './stockBalance.routes.js';
import stockLedgerRoutes from './stockLedger.routes.js';
import reportRoutes from './report.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import roleRoutes from './role.routes.js';
import stockBatchRoutes from './stockBatch.routes.js';

const router = Router();

router.use(apiLimiter);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/departments', departmentRoutes);
router.use('/categories', categoryRoutes);
router.use('/units', unitRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/transactions', stockTransactionRoutes);
router.use('/balances', stockBalanceRoutes);
router.use('/ledger', stockLedgerRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/roles', roleRoutes);
router.use('/batches', stockBatchRoutes);

export default router;
