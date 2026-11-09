import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifyRazorpayWebhookSignature } from '../services/payment.razorpay.service';
import { AppError } from '../utils/AppError';
import { emitNewOrder, emitNotification } from '../services/socket.service';

interface CustomRequest extends Request {
  rawBody?: Buffer;
}

export async function handleRazorpayWebhook(
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      throw new AppError('Missing signature header', 400, 'MISSING_SIGNATURE');
    }

    // Verify webhook signature using the raw body buffer if available
    const bodyStr = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const isValid = verifyRazorpayWebhookSignature(bodyStr, signature);

    if (!isValid) {
      throw new AppError('Invalid webhook signature', 400, 'INVALID_SIGNATURE');
    }

    const { event, payload } = req.body as {
      event: string;
      payload: {
        payment?: {
          entity: {
            id: string;
            amount: number;
            currency: string;
            status: string;
            order_id: string;
          };
        };
        order?: {
          entity: {
            id: string;
            amount: number;
            currency: string;
            status: string;
          };
        };
      };
    };

    console.log(`[Webhook Received] Event: ${event}`);

    if (event === 'order.paid' || event === 'payment.captured') {
      const razorpayOrderId = payload.order?.entity?.id || payload.payment?.entity?.order_id;
      const razorpayPaymentId = payload.payment?.entity?.id;

      if (!razorpayOrderId) {
        console.warn('⚠️ Webhook missing razorpayOrderId');
        res.status(200).json({ success: true, message: 'No action taken: missing razorpayOrderId' });
        return;
      }

      // Find the order in our database
      const order = await prisma.order.findFirst({
        where: { razorpayOrderId },
        include: { restaurant: true, user: true },
      });

      if (!order) {
        console.warn(`⚠️ Webhook order not found for razorpayOrderId: ${razorpayOrderId}`);
        res.status(200).json({ success: true, message: 'Order not found in database' });
        return;
      }

      // If already paid, do nothing
      if (order.paymentStatus === 'PAID') {
        res.status(200).json({ success: true, message: 'Order already marked as PAID' });
        return;
      }

      // Update Order and Payment records to PAID in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            razorpayPaymentId,
          },
        });

        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: {
            status: 'PAID',
            razorpayPaymentId,
          },
        });
      });

      // Emit new order socket notification to the restaurant
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { items: { include: { menuItem: true } }, restaurant: true },
      });
      if (updatedOrder) {
        emitNewOrder(order.restaurantId, updatedOrder);
      }

      // If registered user, emit user notification
      if (order.userId) {
        emitNotification(order.userId, {
          type: 'ORDER_PLACED',
          title: 'Payment Verified via Webhook',
          message: `Your payment for the order at ${order.restaurant.name} was successfully received.`,
        });
      }

      console.log(`[Webhook Success] Order ${order.id} updated to PAID`);
    } else if (event === 'payment.failed') {
      const razorpayOrderId = payload.payment?.entity?.order_id;
      const razorpayPaymentId = payload.payment?.entity?.id;

      if (!razorpayOrderId) {
        console.warn('⚠️ Webhook missing razorpayOrderId');
        res.status(200).json({ success: true });
        return;
      }

      const order = await prisma.order.findFirst({
        where: { razorpayOrderId },
      });

      if (!order) {
        res.status(200).json({ success: true });
        return;
      }

      if (order.paymentStatus === 'PAID') {
        // Already paid, ignore failed event (could be a retry or alternative payment method)
        res.status(200).json({ success: true });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'FAILED',
            razorpayPaymentId,
          },
        });

        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: {
            status: 'FAILED',
            razorpayPaymentId,
          },
        });
      });

      console.log(`[Webhook Success] Order ${order.id} updated to FAILED`);
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[Webhook Error] Processing failed:', error);
    next(error);
  }
}
