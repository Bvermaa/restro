
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireOwner } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  restaurantProfileSchema,
  restaurantToggleSchema,
  menuCategorySchema,
  menuItemSchema,
  updateMenuItemSchema,
  couponSchema,
  updateOrderStatusSchema,
} from '@qr-restaurant/shared/schemas';
import {
  getDashboard,
  getRestaurant,
  updateRestaurant,
  toggleRestaurant,
  uploadLogo,
  uploadBanner,
  uploadPaymentQr,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  seedDemoMenu,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  getOrders,
  getOrderDetail,
  updateOrderStatus,
  confirmPayment,
  rejectPayment,
  deleteOwnerOrder,
  clearOwnerOrderHistory,
  getAnalytics,
  signTable,
  getRestaurantReviews,
  getKitchenStaff,
  createKitchenStaff,
  deleteKitchenStaff,
  uploadAndParseMenu,
  batchImportMenu,
  getOwnerSubscription,
  buyOwnerSubscription,
  createOwnerSubscriptionOrder,
  verifyOwnerSubscriptionPayment,
} from '../controllers/owner.controller';
import { upload, uploadDocument } from '../services/cloudinary.service';

const router = Router();

// All owner routes require authentication + RESTAURANT_OWNER role
router.use(authenticate, requireOwner);

// Dashboard
router.get('/dashboard', getDashboard);

// Kitchen Staff Account Management
router.get('/kitchen-staff', getKitchenStaff);
router.post('/kitchen-staff', createKitchenStaff);
router.delete('/kitchen-staff/:id', deleteKitchenStaff);

// Restaurant management
router.get('/restaurant', getRestaurant);
router.put('/restaurant', validate(restaurantProfileSchema.partial()), updateRestaurant);
router.patch('/restaurant/toggle', validate(restaurantToggleSchema), toggleRestaurant);
router.post('/restaurant/logo', upload.single('logo'), uploadLogo);
router.post('/restaurant/banner', upload.single('banner'), uploadBanner);
router.post('/restaurant/payment-qr', upload.single('paymentQr'), uploadPaymentQr);
router.get('/restaurant/sign-table', signTable);

// Menu categories
router.get('/menu/categories', getCategories);
router.post('/menu/categories', validate(menuCategorySchema), createCategory);
router.put('/menu/categories/reorder', reorderCategories);
router.put('/menu/categories/:id', validate(menuCategorySchema), updateCategory);
router.delete('/menu/categories/:id', deleteCategory);

// Menu items
router.get('/menu/items', getMenuItems);
router.post('/menu/items', upload.single('image'), createMenuItem);
router.put('/menu/items/:id', upload.single('image'), updateMenuItem);
router.delete('/menu/items/:id', deleteMenuItem);
router.patch('/menu/items/:id/availability', toggleMenuItemAvailability);
router.post('/menu/seed-demo', seedDemoMenu);
router.post('/menu/upload-parse', uploadDocument.single('file'), uploadAndParseMenu);
router.post('/menu/batch-import', batchImportMenu);

// Coupons
router.get('/coupons', getCoupons);
router.post('/coupons', validate(couponSchema), createCoupon);
router.put('/coupons/:id', validate(couponSchema), updateCoupon);
router.delete('/coupons/:id', deleteCoupon);
router.patch('/coupons/:id/toggle', toggleCoupon);

// Orders
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetail);
router.patch('/orders/:id/status', validate(updateOrderStatusSchema), updateOrderStatus);
router.patch('/orders/:id/payment', confirmPayment);
router.patch('/orders/:id/payment-reject', rejectPayment);
router.delete('/orders/history/clear', clearOwnerOrderHistory);
router.delete('/orders/:id', deleteOwnerOrder);
router.get('/reviews', getRestaurantReviews);

// Analytics
router.get('/analytics', getAnalytics);

// Subscription
router.get('/subscription', getOwnerSubscription);
router.post('/subscription/buy', buyOwnerSubscription);
router.post('/subscription/create-order', createOwnerSubscriptionOrder);
router.post('/subscription/verify-payment', verifyOwnerSubscriptionPayment);

export default router;
