import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { updateProfileSchema, addressSchema } from '@qr-restaurant/shared/schemas';
import {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getFavorites,
  toggleFavorite,
  getWallet,
  topUpWallet,
  verifyWalletTopUp,
  getLoyalty,
  getNotifications,
  markNotificationsRead,
} from '../controllers/profile.controller';
import { walletTopUpSchema, walletVerifySchema } from '@qr-restaurant/shared/schemas';

const router = Router();

// All profile routes require authentication
router.use(authenticate);

router.get('/', getProfile);
router.put('/', validate(updateProfileSchema), updateProfile);

router.get('/addresses', getAddresses);
router.post('/addresses', validate(addressSchema), addAddress);
router.put('/addresses/:id', validate(addressSchema), updateAddress);
router.delete('/addresses/:id', deleteAddress);
router.patch('/addresses/:id/default', setDefaultAddress);

router.get('/favorites', getFavorites);
router.post('/favorites/:menuItemId', toggleFavorite);

router.get('/wallet', getWallet);
router.post('/wallet/topup', validate(walletTopUpSchema), topUpWallet);
router.post('/wallet/verify', validate(walletVerifySchema), verifyWalletTopUp);

router.get('/loyalty', getLoyalty);

router.get('/notifications', getNotifications);
router.patch('/notifications/read', markNotificationsRead);

export default router;
