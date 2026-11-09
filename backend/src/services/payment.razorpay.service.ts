/*
 * Razorpay Payment Integration (COMMENTED OUT FOR UPI INTENT FLOW)
 * 
 * Razorpay integration has been disabled in favor of server-verified UPI Intent payments.
 * The functions below are retained as stubs to prevent build errors in legacy callers.
 */

import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export async function createRazorpayOrder(
  _amount: number,
  _currency = 'INR',
  _receipt: string,
  _notes: Record<string, string> = {}
): Promise<{ id: string; amount: number; currency: string; receipt: string }> {
  logger.warn('⚠️ Razorpay order creation called, but Razorpay is disabled in favor of UPI Intent.');
  throw new AppError('Razorpay is disabled. Please use UPI Intent payment option.', 400, 'RAZORPAY_DISABLED');
}

export function verifyRazorpaySignature(
  _razorpayOrderId: string,
  _razorpayPaymentId: string,
  _razorpaySignature: string
): boolean {
  logger.warn('⚠️ Razorpay signature verification called, but Razorpay is disabled.');
  return false;
}

export function verifyRazorpayWebhookSignature(
  _rawBody: string,
  _signature: string
): boolean {
  logger.warn('⚠️ Razorpay webhook signature verification called, but Razorpay is disabled.');
  return false;
}

export async function fetchRazorpayPayment(_paymentId: string): Promise<{
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
}> {
  throw new AppError('Razorpay is disabled.', 400, 'RAZORPAY_DISABLED');
}

export async function initiateRefund(
  _paymentId: string,
  _amount: number,
  _reason = 'Order cancelled'
): Promise<{ id: string; amount: number }> {
  throw new AppError('Razorpay is disabled.', 400, 'RAZORPAY_DISABLED');
}
