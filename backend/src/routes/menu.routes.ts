import { Router } from 'express';
import { getRestaurantMenu, callWaiter, getPublicRestaurants } from '../controllers/menu.controller';
import { getLoyaltySettings } from '../controllers/admin.controller';

const router = Router();

// Public list of restaurants (for landing page demo button)
router.get('/restaurants', getPublicRestaurants);

// Public loyalty program settings and rules
router.get('/loyalty-settings', getLoyaltySettings as any);

/**
 * @swagger
 * /menu/{restaurantSlug}:
 *   get:
 *     summary: Get restaurant menu by slug (public)
 *     tags: [Menu]
 */
router.get('/:restaurantSlug', getRestaurantMenu);

/**
 * @swagger
 * /menu/{restaurantSlug}/call-waiter:
 *   post:
 *     summary: Call a waiter for a table (public — no auth required)
 *     tags: [Menu]
 */
router.post('/:restaurantSlug/call-waiter', callWaiter);

export default router;

