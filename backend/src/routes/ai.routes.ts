import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware';
import { aiLimiter } from '../middlewares/rateLimiter.middleware';
import {
  getRecommendations,
  chatWithBot,
  getCouponSuggestion,
  getDemandForecast,
} from '../controllers/ai.controller';
import { authenticate as authMiddleware } from '../middlewares/auth.middleware';
import { requireOwnerOrAdmin } from '../middlewares/rbac.middleware';

const router = Router();

router.post('/recommend', aiLimiter, optionalAuth, getRecommendations);
router.post('/chat', aiLimiter, optionalAuth, chatWithBot);
router.post('/coupon-suggest', aiLimiter, optionalAuth, getCouponSuggestion);
router.get('/forecast/:restaurantId', aiLimiter, authMiddleware, requireOwnerOrAdmin, getDemandForecast);

export default router;
