import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { cartItemSchema, updateCartItemSchema } from '@qr-restaurant/shared/schemas';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCoupon,
  removeCoupon,
} from '../controllers/cart.controller';
import { applyCouponSchema } from '@qr-restaurant/shared/schemas';

const router = Router();

router.get('/', authenticate, getCart);
router.post('/', authenticate, validate(cartItemSchema), addToCart);
router.put('/:cartItemId', authenticate, validate(updateCartItemSchema), updateCartItem);
router.delete('/:cartItemId', authenticate, removeCartItem);
router.delete('/', authenticate, clearCart);
router.post('/coupon', optionalAuth, validate(applyCouponSchema), applyCoupon);
router.delete('/coupon/:code', optionalAuth, removeCoupon);

export default router;
