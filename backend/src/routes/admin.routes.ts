import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/rbac.middleware';
import {
  getAllRestaurants,
  approveRestaurant,
  suspendRestaurant,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  getAllUsers,
  suspendUser,
  deleteUser,
  getGlobalAnalytics,
  getConfig,
  updateConfig,
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getRestaurantDetails,
  terminateRestaurantSessions,
  updateRestaurantFeatures,
  updateRestaurantTabs,
  assignRestaurantSubscription,
  cancelRestaurantSubscription,
  assignPlanDirectly,
  updateSubscriptionPaymentStatus,
  deleteSubscriptionRecord,
  getFreeTrialSettings,
  updateFreeTrialSettings,
  extendFreeSubscription,
  approveFreeTrial,
  rejectFreeTrial,
  getAdminCoupons,
  createAdminCoupon,
  deleteAdminCoupon,
  toggleAdminCoupon,
  broadcastNotification,
  broadcastEmail,
  getAdminReviews,
  getLoyaltySettings,
  updateLoyaltySettings,
} from '../controllers/admin.controller';

const router = Router();

router.use(authenticate, requireAdmin);

// Restaurant management
router.get('/restaurants', getAllRestaurants);
router.post('/restaurants', createRestaurant);
router.get('/restaurants/:id', getRestaurantDetails);
router.patch('/restaurants/:id', updateRestaurant);
router.put('/restaurants/:id', updateRestaurant);
router.patch('/restaurants/:id/approve', approveRestaurant);
router.patch('/restaurants/:id/suspend', suspendRestaurant);
router.patch('/restaurants/:id/features', updateRestaurantFeatures);
router.patch('/restaurants/:id/tabs', updateRestaurantTabs);
router.post('/restaurants/:id/subscription', assignRestaurantSubscription);
router.post('/restaurants/:id/terminate-sessions', terminateRestaurantSessions);
router.delete('/restaurants/:id', deleteRestaurant);

// User management
router.get('/users', getAllUsers);
router.patch('/users/:id/suspend', suspendUser);
router.delete('/users/:id', deleteUser);

// Global analytics
router.get('/analytics', getGlobalAnalytics);

// Configuration
router.get('/config', getConfig);
router.put('/config', updateConfig);

// Loyalty Program Settings
router.get('/loyalty-settings', getLoyaltySettings as any);
router.put('/loyalty-settings', updateLoyaltySettings as any);

// Subscriptions
router.get('/subscriptions', getSubscriptionPlans);
router.get('/subscriptions/free-trial-settings', getFreeTrialSettings);
router.put('/subscriptions/free-trial-settings', updateFreeTrialSettings);
router.patch('/subscriptions/records/:id/extend-free', extendFreeSubscription);
router.patch('/subscriptions/requests/:subscriptionId/approve', approveFreeTrial);
router.patch('/subscriptions/requests/:subscriptionId/reject', rejectFreeTrial);
router.post('/subscriptions', createSubscriptionPlan);
router.put('/subscriptions/:id', updateSubscriptionPlan);
router.delete('/subscriptions/:id', deleteSubscriptionPlan);
router.patch('/subscriptions/:subscriptionId/toggle', cancelRestaurantSubscription);
router.post('/subscriptions/assign', assignPlanDirectly);
router.patch('/subscriptions/records/:id/status', updateSubscriptionPaymentStatus);
router.delete('/subscriptions/records/:id', deleteSubscriptionRecord);

// Coupons
router.get('/coupons', getAdminCoupons);
router.post('/coupons', createAdminCoupon);
router.delete('/coupons/:id', deleteAdminCoupon);
router.patch('/coupons/:id/toggle', toggleAdminCoupon);

// Broadcasts
router.post('/broadcast-notification', broadcastNotification);
router.post('/broadcast-email', broadcastEmail);

// Reviews
router.get('/reviews', getAdminReviews);

export default router;
