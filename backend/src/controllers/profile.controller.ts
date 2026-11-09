import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { createRazorpayOrder, verifyRazorpaySignature } from '../services/payment.razorpay.service';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export async function getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isVerified: true, loyaltyPoints: true, walletBalance: true,
        googleId: true, createdAt: true,
      },
    });
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    res.json({ success: true, data: { user } });
  } catch (error) { next(error); }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, phone } = req.body as { name?: string; phone?: string };
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { ...(name && { name }), ...(phone && { phone }) },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    res.json({ success: true, data: { user }, message: 'Profile updated successfully' });
  } catch (error) { next(error); }
}

export async function getAddresses(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: { addresses } });
  } catch (error) { next(error); }
}

export async function addAddress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { label, flat, street, area, city, pincode, isDefault } = req.body as {
      label: string; flat: string; street: string; area: string;
      city: string; pincode: string; isDefault: boolean;
    };

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user!.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: { userId: req.user!.id, label, flat, street, area, city, pincode, isDefault },
    });
    res.status(201).json({ success: true, data: { address }, message: 'Address added' });
  } catch (error) { next(error); }
}

export async function updateAddress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.address.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new AppError('Address not found.', 404, 'ADDRESS_NOT_FOUND');

    const { isDefault, ...rest } = req.body as { label: string; flat: string; street: string; area: string; city: string; pincode: string; isDefault: boolean };
    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    }

    const address = await prisma.address.update({ where: { id }, data: { ...rest, isDefault } });
    res.json({ success: true, data: { address }, message: 'Address updated' });
  } catch (error) { next(error); }
}

export async function deleteAddress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.address.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new AppError('Address not found.', 404, 'ADDRESS_NOT_FOUND');
    await prisma.address.delete({ where: { id } });
    res.json({ success: true, data: null, message: 'Address deleted' });
  } catch (error) { next(error); }
}

export async function setDefaultAddress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.address.findFirst({ where: { id, userId: req.user!.id } });
    if (!existing) throw new AppError('Address not found.', 404, 'ADDRESS_NOT_FOUND');
    await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    await prisma.address.update({ where: { id }, data: { isDefault: true } });
    res.json({ success: true, data: null, message: 'Default address updated' });
  } catch (error) { next(error); }
}

export async function getFavorites(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const favorites = await prisma.favoriteItem.findMany({
      where: { userId: req.user!.id },
      include: { menuItem: { include: { variants: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { favorites } });
  } catch (error) { next(error); }
}

export async function toggleFavorite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const menuItemId = req.params.menuItemId as string;
    const userId = req.user!.id;

    const existing = await prisma.favoriteItem.findUnique({
      where: { userId_menuItemId: { userId, menuItemId } },
    });

    if (existing) {
      await prisma.favoriteItem.delete({ where: { userId_menuItemId: { userId, menuItemId } } });
      res.json({ success: true, data: { isFavorite: false }, message: 'Removed from favorites' });
    } else {
      await prisma.favoriteItem.create({ data: { userId, menuItemId } });
      res.json({ success: true, data: { isFavorite: true }, message: 'Added to favorites' });
    }
  } catch (error) { next(error); }
}

export async function getWallet(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const [user, transactions] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { walletBalance: true } }),
      prisma.walletTransaction.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    res.json({ success: true, data: { balance: user?.walletBalance ?? 0, transactions } });
  } catch (error) { next(error); }
}

export async function topUpWallet(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { amount } = req.body as { amount: number };
    const userId = req.user!.id;

    const rzOrder = await createRazorpayOrder(amount, 'INR', `wallet-${userId}-${Date.now()}`, {
      userId,
      purpose: 'wallet_topup',
    });

    res.json({
      success: true,
      data: {
        razorpayOrderId: rzOrder.id,
        amount,
        currency: 'INR',
      },
      message: 'Complete payment to add funds to your wallet',
    });
  } catch (error) { next(error); }
}

export async function verifyWalletTopUp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body as {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      amount: number;
    };
    const userId = req.user!.id;

    const isMock = razorpayOrderId.startsWith('order_mock_');
    if (!isMock) {
      const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!isValid) {
        throw new AppError('Payment verification failed. Invalid signature.', 400, 'INVALID_PAYMENT_SIGNATURE');
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
        select: { id: true, name: true, email: true, walletBalance: true },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          amount,
          type: 'CREDIT',
          reference: `Top-up via Razorpay (${razorpayPaymentId})`,
        },
      });

      return updatedUser;
    });

    res.json({
      success: true,
      data: { walletBalance: user.walletBalance },
      message: `Successfully added ₹${amount} to your wallet!`,
    });
  } catch (error) { next(error); }
}

export async function getLoyalty(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const [user, transactions] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { loyaltyPoints: true } }),
      prisma.loyaltyTransaction.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    res.json({ success: true, data: { points: user?.loyaltyPoints ?? 0, transactions } });
  } catch (error) { next(error); }
}

export async function getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let restaurantIds: string[] = [];
    if (req.user?.role === 'RESTAURANT_OWNER') {
      const owned = await prisma.restaurant.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true },
      });
      restaurantIds = owned.map((r) => r.id);
    }

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { userId: req.user!.id },
          ...(restaurantIds.length > 0 ? [{ restaurantId: { in: restaurantIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) { next(error); }
}

export async function markNotificationsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let restaurantIds: string[] = [];
    if (req.user?.role === 'RESTAURANT_OWNER') {
      const owned = await prisma.restaurant.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true },
      });
      restaurantIds = owned.map((r) => r.id);
    }

    await prisma.notification.updateMany({
      where: {
        OR: [
          { userId: req.user!.id },
          ...(restaurantIds.length > 0 ? [{ restaurantId: { in: restaurantIds } }] : []),
        ],
        isRead: false,
      },
      data: { isRead: true },
    });
    res.json({ success: true, data: null, message: 'All notifications marked as read' });
  } catch (error) { next(error); }
}
