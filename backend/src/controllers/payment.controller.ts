import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { buildUpiIntentUrl, generateTransactionRef, isValidUpiId } from '../services/payment.upi.service';
import { emitNewOrder, emitNotification, emitOrderStatusUpdate } from '../services/socket.service';
import { logger } from '../utils/logger';

/**
 * STEP 6 — CUSTOMER PAY BUTTON & UPI INTENT GENERATION
 * 
 * Generates an authoritative UPI intent request for an order.
 * Amount is retrieved directly from the database and NEVER trusted from frontend.
 */
export async function createUpiIntent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { orderId } = req.body as { orderId: string };

    if (!orderId) {
      throw new AppError('Order ID is required to create a UPI payment attempt.', 400, 'ORDER_ID_REQUIRED');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
      include: { restaurant: true },
    });

    if (!order) {
      throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    }

    if (order.paymentStatus === 'PAID') {
      throw new AppError('This order has already been paid.', 400, 'ORDER_ALREADY_PAID');
    }

    const restaurant = order.restaurant;

    if (restaurant.paymentEnabled === false) {
      throw new AppError('Online payments are currently disabled for this restaurant.', 400, 'PAYMENTS_DISABLED');
    }

    if (restaurant.upiEnabled === false) {
      throw new AppError('UPI payments are disabled for this restaurant.', 400, 'UPI_DISABLED');
    }

    let merchantVpa = restaurant.paymentUpiId;
    if (!merchantVpa || !isValidUpiId(merchantVpa)) {
      const fallbackUpi = process.env.PLATFORM_DEFAULT_UPI_ID || 'ezrestro@upi';
      merchantVpa = isValidUpiId(fallbackUpi) ? fallbackUpi : 'teamezrestro@upi';
    }

    // Authoritative amount comes directly from DB
    const authoritativeAmount = order.total;
    const merchantName = restaurant.merchantName || restaurant.name;
    const txnRef = generateTransactionRef(order.id);

    // Build properly encoded UPI intent URL
    const upiIntentUrl = buildUpiIntentUrl({
      merchantVpa,
      merchantName,
      amount: authoritativeAmount,
      txnRef,
      orderNote: `SwiftBite Order #${order.id.slice(-6).toUpperCase()}`,
    });

    // Create or update Payment record with unique transaction reference and PENDING status
    const payment = await prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        method: 'UPI_INTENT',
        status: 'PENDING',
        amount: authoritativeAmount,
        txnRef,
      },
      update: {
        method: 'UPI_INTENT',
        status: 'PENDING',
        amount: authoritativeAmount,
        txnRef,
      },
    });

    // Ensure order payment method is recorded as UPI_INTENT
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentMethod: 'UPI_INTENT' },
    });

    logger.info('UPI Intent generated successfully:', {
      orderId: order.id,
      paymentId: payment.id,
      txnRef,
      amount: authoritativeAmount,
      merchantVpa,
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: order.id,
        txnRef,
        amount: authoritativeAmount,
        currency: 'INR',
        merchantVpa,
        merchantName,
        upiIntentUrl,
      },
      message: 'UPI payment request created successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * STEP 13 — PAYMENT STATUS API
 * 
 * Read-only endpoint for querying server-side payment state.
 * The frontend must NEVER be allowed to update payment status via this endpoint.
 */
export async function getPaymentStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paymentIdOrOrderId = req.params.paymentId as string;

    if (!paymentIdOrOrderId) {
      throw new AppError('Payment ID or Order ID parameter is required.', 400, 'PARAM_REQUIRED');
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ id: paymentIdOrOrderId }, { orderId: paymentIdOrOrderId }, { txnRef: paymentIdOrOrderId }],
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            total: true,
            restaurantId: true,
          },
        },
      },
    });

    if (!payment) {
      throw new AppError('Payment record not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        txnRef: payment.txnRef,
        status: payment.status,
        orderStatus: payment.order.status,
        orderPaymentStatus: payment.order.paymentStatus,
        amount: payment.amount,
        paidAt: payment.paidAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * STEP 10, 11, 12, 17, 22 — SERVER-SIDE VERIFICATION & WEBHOOK API
 * 
 * Verifies that payment was actually received by the merchant provider.
 * Enforces amount matching, idempotency, database transactions, and Socket.IO emission.
 */
export async function verifyAndConfirmPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      paymentId,
      orderId,
      txnRef,
      providerTxnId,
      receivedAmount,
      secret,
    } = req.body as {
      paymentId?: string;
      orderId?: string;
      txnRef?: string;
      providerTxnId?: string;
      receivedAmount: number;
      secret?: string;
    };

    // Enforce trusted webhook secret authentication (NO hard-coded fallback secret permitted)
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError('Server misconfiguration: Payment webhook secret is not configured in the environment.', 500, 'WEBHOOK_CONFIG_ERROR');
    }
    const providedSecret = secret || (req.headers['x-webhook-secret'] as string) || (req.headers['x-api-key'] as string);

    if (!providedSecret || providedSecret !== webhookSecret) {
      throw new AppError('Unauthorized: Invalid or missing webhook authorization secret.', 401, 'UNAUTHORIZED_WEBHOOK');
    }

    // Find target payment record
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(paymentId ? [{ id: paymentId }] : []),
          ...(orderId ? [{ orderId }] : []),
          ...(txnRef ? [{ txnRef }] : []),
        ],
      },
      include: {
        order: {
          include: { restaurant: true, items: { include: { menuItem: true } } },
        },
      },
    });

    if (!payment) {
      throw new AppError('Payment attempt not found.', 404, 'PAYMENT_NOT_FOUND');
    }

    const order = payment.order;

    // STEP 17 — Idempotency Check: If already PAID, return clean success without duplicating logic
    if (payment.status === 'PAID' && order.paymentStatus === 'PAID') {
      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          orderId: order.id,
          status: 'PAID',
          paidAt: payment.paidAt,
          duplicate: true,
        },
        message: 'Payment was already verified and confirmed.',
      });
      return;
    }

    // STEP 12 — AMOUNT VERIFICATION
    const expectedAmount = payment.amount;
    const isAmountValid = Math.abs(receivedAmount - expectedAmount) < 0.01;

    if (!isAmountValid) {
      logger.error('CRITICAL: Payment amount mismatch detected!', {
        paymentId: payment.id,
        expectedAmount,
        receivedAmount,
      });

      // Mark payment as FAILED due to amount discrepancy
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      throw new AppError(
        `Payment amount verification failed. Expected ₹${expectedAmount.toFixed(2)}, received ₹${receivedAmount.toFixed(2)}.`,
        400,
        'AMOUNT_MISMATCH'
      );
    }

    // STEP 22 — DATABASE TRANSACTION COMMIT BEFORE SOCKET EMISSION
    const now = new Date();

    const [updatedPayment, updatedOrder] = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt: now,
          providerTxnId: providerTxnId || `UPI-TXN-${Date.now()}`,
        },
      });

      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          status: 'CONFIRMED',
          confirmedAt: now,
        },
        include: { restaurant: true, items: { include: { menuItem: true } } },
      });

      return [p, o];
    });

    logger.info('Payment verified and order confirmed successfully:', {
      orderId: updatedOrder.id,
      paymentId: updatedPayment.id,
      amount: updatedPayment.amount,
      paidAt: updatedPayment.paidAt,
    });

    // STEP 15 & 16 — REAL-TIME SOCKET.IO NOTIFICATIONS AFTER DB COMMIT
    emitOrderStatusUpdate(updatedOrder.id, updatedOrder.restaurantId, {
      orderId: updatedOrder.id,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paidAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    emitNewOrder(updatedOrder.restaurantId, updatedOrder);

    // Create notification for restaurant owner
    await prisma.notification.create({
      data: {
        restaurantId: updatedOrder.restaurantId,
        type: 'NEW_ORDER',
        title: 'New Paid Order Confirmed! 🎉',
        message: `Order #${updatedOrder.id.slice(-8).toUpperCase()} payment of ₹${updatedPayment.amount.toFixed(2)} verified and order confirmed!`,
      },
    });

    if (updatedOrder.userId) {
      emitNotification(updatedOrder.userId, {
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Confirmed! 🎉',
        message: `Your payment of ₹${updatedPayment.amount.toFixed(2)} for Order #${updatedOrder.id.slice(-6).toUpperCase()} was successfully verified.`,
      });
    }

    res.json({
      success: true,
      data: {
        paymentId: updatedPayment.id,
        orderId: updatedOrder.id,
        status: updatedPayment.status,
        orderStatus: updatedOrder.status,
        paidAt: updatedPayment.paidAt,
      },
      message: 'Payment verified and order confirmed successfully!',
    });
  } catch (error) {
    next(error);
  }
}
