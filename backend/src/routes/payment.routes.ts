import { Router } from 'express';
import {
  createUpiIntent,
  getPaymentStatus,
  verifyAndConfirmPayment,
} from '../controllers/payment.controller';

const router = Router();

// Customer endpoint to generate UPI intent payment attempt
router.post('/create-upi-intent', createUpiIntent);

// Read-only endpoint to check server-side payment status
router.get('/:paymentId/status', getPaymentStatus);

// Server-side verification & webhook endpoint
router.post('/verify-upi', verifyAndConfirmPayment);
router.post('/webhook', verifyAndConfirmPayment);

export default router;
