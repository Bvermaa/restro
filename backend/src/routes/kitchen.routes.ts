import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireOwnerOrKitchen } from '../middlewares/rbac.middleware';
import {
  getKitchenOrders,
  updateKitchenOrderStatus,
} from '../controllers/kitchen.controller';

const router = Router();

// Protect all kitchen routes
router.use(authenticate, requireOwnerOrKitchen);

router.get('/orders', getKitchenOrders);
router.patch('/orders/:id/status', updateKitchenOrderStatus);

export default router;
