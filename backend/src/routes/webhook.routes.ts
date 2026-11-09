import { Router } from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller';

const router = Router();

// POST /api/v1/webhooks/razorpay
router.post('/razorpay', handleRazorpayWebhook);

export default router;
