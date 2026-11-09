import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { emitOrderStatusUpdate } from '../services/socket.service';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { logger } from '../utils/logger';

async function getTargetRestaurantId(req: AuthenticatedRequest): Promise<string> {
  const user = req.user!;
  if (user.role === 'KITCHEN') {
    if (!user.kitchenRestaurantId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { kitchenRestaurantId: true },
      });
      if (!dbUser?.kitchenRestaurantId) {
        throw new AppError('Kitchen account is not assigned to any restaurant.', 403, 'KITCHEN_NOT_ASSIGNED');
      }
      return dbUser.kitchenRestaurantId;
    }
    return user.kitchenRestaurantId;
  }

  // Restaurant Owner or Super Admin fallback
  const rest = await prisma.restaurant.findFirst({
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!rest) {
    throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');
  }
  return rest.id;
}

export async function getKitchenOrders(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const restaurantId = await getTargetRestaurantId(req);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        OR: [
          { status: { in: ['CONFIRMED', 'PREPARING', 'BAKING', 'READY'] } },
          { status: 'DELIVERED', createdAt: { gte: startOfToday } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            addOns: true,
            createdAt: true,
            menuItem: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: { orders, restaurantId },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateKitchenOrderStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const restaurantId = await getTargetRestaurantId(req);
    const id = req.params.id as string;
    const { status, addOnStatus } = req.body as { status?: string; addOnStatus?: string };

    const allowedStatuses = ['PREPARING', 'BAKING', 'READY', 'DELIVERED', 'CANCELLED'];
    const allowedAddOnStatuses = ['PREPARING', 'BAKING', 'READY', 'DELIVERED', 'CANCELLED'];

    if (!status && !addOnStatus) {
      throw new AppError('Either status or addOnStatus is required.', 400, 'STATUS_REQUIRED');
    }

    if (status && !allowedStatuses.includes(status)) {
      throw new AppError(`Invalid status. Allowed values: ${allowedStatuses.join(', ')}`, 400, 'INVALID_STATUS');
    }

    if (addOnStatus && !allowedAddOnStatuses.includes(addOnStatus)) {
      throw new AppError(`Invalid addOnStatus. Allowed values: ${allowedAddOnStatuses.join(', ')}`, 400, 'INVALID_ADDON_STATUS');
    }

    const order = await prisma.order.findFirst({
      where: { id, restaurantId, deletedAt: null },
    });

    if (!order) {
      throw new AppError('Order not found or does not belong to this restaurant.', 404, 'ORDER_NOT_FOUND');
    }

    const statusDateFields: Record<string, string> = {
      CONFIRMED: 'confirmedAt',
      PREPARING: 'preparingAt',
      BAKING: 'preparingAt',
      READY: 'readyAt',
      DELIVERED: 'deliveredAt',
      CANCELLED: 'cancelledAt',
    };

    const updateData: Record<string, any> = {};

    if (status) {
      updateData.status = status;
      if (statusDateFields[status]) {
        updateData[statusDateFields[status]] = new Date();
      }
    }

    // Handle addOnStatus updates
    if (addOnStatus !== undefined) {
      updateData.addOnStatus = addOnStatus;
    } else if (order.addOnStatus && status) {
      // Automatically keep addOnStatus in lockstep with the kitchen progress
      if (status === 'READY') {
        updateData.addOnStatus = 'READY';
      } else if (status === 'DELIVERED') {
        updateData.addOnStatus = 'DELIVERED';
      } else if (status === 'CANCELLED') {
        updateData.addOnStatus = 'CANCELLED';
      } else if (status === 'PREPARING' || status === 'BAKING') {
        updateData.addOnStatus = 'PREPARING';
      }
    }

    const updated = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { name: true, phone: true } },
      },
    });

    // Real-time socket broadcast
    try {
      emitOrderStatusUpdate(updated.id, updated.restaurantId, {
        orderId: updated.id,
        status: updated.status,
        addOnStatus: updated.addOnStatus,
        lastAddOnAt: updated.lastAddOnAt,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (err) {
      logger.warn('Failed to emit socket updates for kitchen order status update:', err);
    }

    res.json({
      success: true,
      data: { order: updated },
      message: `Order status updated to ${status || addOnStatus}`,
    });
  } catch (error) {
    next(error);
  }
}
