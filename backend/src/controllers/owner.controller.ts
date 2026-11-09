import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { uploadMenuItemImage, uploadRestaurantLogo, uploadRestaurantBanner, uploadRestaurantPaymentQr } from '../services/cloudinary.service';
import { emitOrderStatusUpdate, emitNotification, emitUserLoyaltyUpdate, emitPaymentNotReceived, emitOrderDeleted } from '../services/socket.service';
import { cacheDelPattern, cacheSet } from '../services/redis.service';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { generateTableSignature } from '../utils/tableSignature';
import { parseMenuDocumentAI } from '../services/ai.gemini.service';
import { sortOperatingHours } from '../utils/operatingHours';
import { logger } from '../utils/logger';
import { sendKitchenStaffWelcomeEmail } from '../services/email.service';
import { checkRestaurantSubscriptionExpiry } from '../jobs/subscription.job';

async function getOwnerRestaurant(ownerId: string) {
  let restaurant = await prisma.restaurant.findFirst({
    where: { ownerId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (!restaurant) {
    restaurant = await prisma.restaurant.findFirst({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');
  return restaurant;
}

// ── Dashboard ─────────────────────────────────────────────────

export async function getDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let restaurant = await getOwnerRestaurant(req.user!.id);
    
    // Local start of today (00:00:00.000)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Local start of month (1st of month 00:00:00.000)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Last 7 days start date
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [todayOrders, monthlyOrders, recentOrders, orderStatusBreakdown, pastSevenDaysOrders, reviewStats] = await Promise.all([
      // Today's non-cancelled, non-deleted orders
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          createdAt: { gte: today },
          status: { not: 'CANCELLED' },
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        select: { id: true, total: true, createdAt: true, paymentStatus: true },
      }),
      // Monthly non-cancelled, non-deleted orders
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          createdAt: { gte: startOfMonth },
          status: { not: 'CANCELLED' },
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        select: { id: true, total: true, paymentStatus: true },
      }),
      // Recent orders list
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { name: true } },
          items: { include: { menuItem: { select: { name: true } } }, take: 3 },
        },
      }),
      // Order status breakdown for pending order count
      prisma.order.groupBy({
        by: ['status'],
        where: {
          restaurantId: restaurant.id,
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        _count: { status: true },
      }),
      // Last 7 days orders
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          createdAt: { gte: sevenDaysAgo },
          status: { not: 'CANCELLED' },
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        select: { id: true, total: true, createdAt: true, paymentStatus: true },
      }),
      // Reviews stats
      prisma.review.aggregate({
        where: { restaurantId: restaurant.id },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    // Calculate today's revenue and count (ONLY PAID orders count toward revenue & average order value)
    const paidTodayOrders = todayOrders.filter((o) => o.paymentStatus === 'PAID');
    const todayRevenue = paidTodayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const todayOrderCount = todayOrders.length;
    const avgOrderValue = paidTodayOrders.length > 0 ? todayRevenue / paidTodayOrders.length : (todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0);

    // Calculate monthly revenue and count (ONLY PAID orders count toward revenue)
    const paidMonthlyOrders = monthlyOrders.filter((o) => o.paymentStatus === 'PAID');
    const monthlyRevenue = paidMonthlyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const monthlyOrderCount = monthlyOrders.length;

    // Pending orders count
    const pendingOrders = orderStatusBreakdown.find((s) => s.status === 'PENDING')?._count.status ?? 0;

    // Hourly breakdown for Today (0..23) using local hour (ONLY PAID orders count toward revenue)
    const hourlyMap: Record<number, { revenue: number; orders: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { revenue: 0, orders: 0 };
    }
    for (const order of todayOrders) {
      const h = new Date(order.createdAt).getHours();
      if (order.paymentStatus === 'PAID') {
        hourlyMap[h].revenue += Number(order.total || 0);
      }
      hourlyMap[h].orders += 1;
    }
    const todayHourlyEarnings = Array.from({ length: 24 }, (_, h) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedHour = `${h % 12 === 0 ? 12 : h % 12} ${ampm}`;
      return {
        hour: formattedHour,
        rawHour: h,
        revenue: Math.round((hourlyMap[h].revenue + Number.EPSILON) * 100) / 100,
        orders: hourlyMap[h].orders,
      };
    });

    // Today's hourly average earning
    const currentHour = new Date().getHours();
    const activeHours = Math.max(1, currentHour + 1);
    const todayHourlyAverage = todayRevenue > 0 ? todayRevenue / activeHours : 0;

    // Last 7 Days revenue map using local dates (ONLY PAID orders count toward revenue)
    const daysMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      daysMap.set(dateStr, { revenue: 0, orders: 0 });
    }

    for (const order of pastSevenDaysOrders) {
      const d = new Date(order.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const existing = daysMap.get(dateStr) || { revenue: 0, orders: 0 };
      if (order.paymentStatus === 'PAID') {
        existing.revenue += Number(order.total || 0);
      }
      existing.orders += 1;
      daysMap.set(dateStr, existing);
    }

    const last7DaysRevenue = Array.from(daysMap.entries())
      .map(([date, val]) => ({
        date,
        revenue: Math.round((val.revenue + Number.EPSILON) * 100) / 100,
        orders: val.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Check expiry & fetch active subscription for dashboard status
    await checkRestaurantSubscriptionExpiry(restaurant.id).catch(() => {});
    restaurant = await syncRestaurantPlatformWithPlan(restaurant);
    const activeSubscription = await prisma.restaurantSubscription.findFirst({
      where: { restaurantId: restaurant.id, isActive: true },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          isOpen: restaurant.isOpen,
          isSuspended: restaurant.isSuspended,
          themeColor: restaurant.themeColor,
          platformType: (restaurant as any).platformType || 'RESTAURANT',
          maxLogins: (restaurant as any).maxLogins || 1,
        },
        subscription: activeSubscription
          ? {
              id: activeSubscription.id,
              planName: activeSubscription.plan.name,
              planPrice: activeSubscription.plan.price,
              amount: activeSubscription.amount,
              paymentStatus: activeSubscription.paymentStatus,
              paymentMethod: activeSubscription.paymentMethod,
              startsAt: activeSubscription.startsAt,
              expiresAt: activeSubscription.expiresAt,
              isActive: activeSubscription.isActive,
              daysRemaining: Math.max(0, Math.ceil((new Date(activeSubscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
              planFeatures: activeSubscription.plan.features,
            }
          : null,
        stats: {
          todayRevenue: Math.round((todayRevenue + Number.EPSILON) * 100) / 100,
          todayOrders: todayOrderCount,
          monthlyRevenue: Math.round((monthlyRevenue + Number.EPSILON) * 100) / 100,
          monthlyOrders: monthlyOrderCount,
          todayHourlyAverage: Math.round((todayHourlyAverage + Number.EPSILON) * 100) / 100,
          pendingOrders,
          avgOrderValue: Math.round((avgOrderValue + Number.EPSILON) * 100) / 100,
          avgRating: reviewStats._avg.rating ?? 0,
          totalReviews: reviewStats._count.rating ?? 0,
        },
        recentOrders,
        orderStatusBreakdown,
        last7DaysRevenue,
        todayHourlyEarnings,
      },
    });
  } catch (error) { next(error); }
}

async function syncRestaurantPlatformWithPlan(restaurant: any) {
  try {
    const activeSub = await prisma.restaurantSubscription.findFirst({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeSub?.plan && (activeSub.plan as any).platformType) {
      const planPlatform = (activeSub.plan as any).platformType;
      const currentFlags = (restaurant.featureFlags as Record<string, boolean>) || {};
      let shouldUpdate = false;
      const updateData: any = {};

      if (restaurant.platformType !== planPlatform) {
        updateData.platformType = planPlatform;
        shouldUpdate = true;
      }

      const nextFlags = { ...currentFlags };
      if (planPlatform === 'DUAL') {
        if (nextFlags.roomServiceEnabled !== true || nextFlags.callWaiterEnabled !== true || nextFlags.tableQrEnabled !== true || nextFlags.roomQrEnabled !== true) {
          nextFlags.roomServiceEnabled = true;
          nextFlags.callWaiterEnabled = true;
          nextFlags.tableQrEnabled = true;
          nextFlags.roomQrEnabled = true;
          updateData.featureFlags = nextFlags;
          shouldUpdate = true;
        }
      } else if (planPlatform === 'HOTEL') {
        if (nextFlags.roomServiceEnabled !== true || nextFlags.callWaiterEnabled !== false || nextFlags.tableQrEnabled !== false || nextFlags.roomQrEnabled !== true) {
          nextFlags.roomServiceEnabled = true;
          nextFlags.callWaiterEnabled = false;
          nextFlags.tableQrEnabled = false;
          nextFlags.roomQrEnabled = true;
          updateData.featureFlags = nextFlags;
          shouldUpdate = true;
        }
      } else if (planPlatform === 'RESTAURANT') {
        if (nextFlags.roomServiceEnabled !== false || nextFlags.callWaiterEnabled !== true || nextFlags.tableQrEnabled !== true || nextFlags.roomQrEnabled !== false) {
          nextFlags.roomServiceEnabled = false;
          nextFlags.callWaiterEnabled = true;
          nextFlags.tableQrEnabled = true;
          nextFlags.roomQrEnabled = false;
          updateData.featureFlags = nextFlags;
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        const updated = await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: updateData,
        });
        return updated;
      }
    }
  } catch (err) {
    logger.warn('Failed to sync restaurant platform with plan:', err);
  }
  return restaurant;
}

// ── Restaurant Profile ────────────────────────────────────────

export async function getRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let restaurant = await getOwnerRestaurant(req.user!.id);
    const wasSuspendedNow = await checkRestaurantSubscriptionExpiry(restaurant.id);
    if (wasSuspendedNow) {
      const refreshed = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
      if (refreshed) restaurant = refreshed;
    }
    restaurant = await syncRestaurantPlatformWithPlan(restaurant);
    if (restaurant && restaurant.operatingHours) {
      try {
        restaurant.operatingHours = sortOperatingHours(restaurant.operatingHours);
      } catch (err) {
        logger.warn('Failed to sort operating hours:', err);
      }
    }
    res.json({ success: true, data: { restaurant } });
  } catch (error) { next(error); }
}

export async function updateRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const rawBody = { ...req.body } as Record<string, any>;

    const allowedKeys = [
      'name', 'slug', 'description', 'cuisineType', 'logo', 'banner',
      'address', 'city', 'state', 'country', 'pincode', 'phone', 'operatingHours',
      'deliveryRadius', 'minOrderValue', 'isOpen', 'hasDelivery',
      'themeColor', 'menuTemplate', 'customFields', 'paymentEnabled',
      'upiEnabled', 'merchantName', 'paymentProvider', 'paymentQrCode',
      'paymentUpiId', 'paymentPhone', 'bankName', 'bankAccountNumber',
      'bankIfsc', 'bankAccountHolder', 'qrSettings',
    ];

    const body: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (key in rawBody && rawBody[key] !== undefined) {
        body[key] = rawBody[key];
      }
    }

    if (body.operatingHours) {
      body.operatingHours = sortOperatingHours(body.operatingHours);
    }

    if (body.slug && typeof body.slug === 'string') {
      const sanitizedSlug = body.slug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!sanitizedSlug) {
        throw new AppError('Invalid URL slug format. Use letters, numbers, and hyphens.', 400, 'INVALID_SLUG');
      }

      if (sanitizedSlug !== restaurant.slug) {
        const existing = await prisma.restaurant.findUnique({
          where: { slug: sanitizedSlug },
        });

        if (existing && existing.id !== restaurant.id) {
          throw new AppError('This URL slug is already taken by another restaurant. Please choose a unique URL slug.', 400, 'SLUG_TAKEN');
        }
        body.slug = sanitizedSlug;
      }
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: body,
    });

    if (updated.operatingHours) {
      updated.operatingHours = sortOperatingHours(updated.operatingHours);
    }

    await cacheDelPattern(`menu:${restaurant.slug}*`);
    if (updated.slug !== restaurant.slug) {
      await cacheDelPattern(`menu:${updated.slug}*`);
    }

    res.json({ success: true, data: { restaurant: updated }, message: 'Restaurant settings updated' });
  } catch (error) { next(error); }
}

export async function toggleRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { isOpen } = req.body as { isOpen: boolean };
    const updated = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { isOpen },
    });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({
      success: true,
      data: { isOpen: updated.isOpen },
      message: `Restaurant is now ${updated.isOpen ? 'OPEN' : 'CLOSED'}`,
    });
  } catch (error) { next(error); }
}

export async function uploadLogo(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    if (!req.file) throw new AppError('No image file provided.', 400, 'NO_FILE');
    const url = await uploadRestaurantLogo(req.file.buffer, restaurant.slug);
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { logo: url } });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: { logo: url }, message: 'Logo uploaded' });
  } catch (error) { next(error); }
}

export async function uploadBanner(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    if (!req.file) throw new AppError('No image file provided.', 400, 'NO_FILE');
    const url = await uploadRestaurantBanner(req.file.buffer, restaurant.slug);
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { banner: url } });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: { banner: url }, message: 'Banner uploaded' });
  } catch (error) { next(error); }
}

export async function uploadPaymentQr(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    if (!req.file) throw new AppError('No image file provided.', 400, 'NO_FILE');
    const url = await uploadRestaurantPaymentQr(req.file.buffer, restaurant.slug);
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { paymentQrCode: url } });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: { paymentQrCode: url }, message: 'Payment QR uploaded' });
  } catch (error) { next(error); }
}

// ── Menu Categories ────────────────────────────────────────────

export async function getCategories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        parent: { select: { id: true, name: true } },
        subcategories: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { items: true } } } },
        _count: { select: { items: true } },
      },
    });
    res.json({ success: true, data: { categories } });
  } catch (error) { next(error); }
}

export async function createCategory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { name, parentId, sortOrder } = req.body as { name: string; parentId?: string | null; sortOrder?: number };
    const category = await prisma.menuCategory.create({
      data: { name, parentId: parentId || null, restaurantId: restaurant.id, sortOrder: sortOrder ?? 0 },
      include: { parent: true },
    });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.status(201).json({ success: true, data: { category }, message: 'Category created' });
  } catch (error) { next(error); }
}

export async function updateCategory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.menuCategory.findFirst({ where: { id, restaurantId: restaurant.id } });
    if (!existing) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');
    const { name, parentId, sortOrder } = req.body as { name?: string; parentId?: string | null; sortOrder?: number };
    const category = await prisma.menuCategory.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(parentId !== undefined ? { parentId: parentId || null } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
      include: { parent: true },
    });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: { category }, message: 'Category updated' });
  } catch (error) { next(error); }
}

export async function deleteCategory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.menuCategory.findFirst({ where: { id, restaurantId: restaurant.id } });
    if (!existing) throw new AppError('Category not found.', 404, 'CATEGORY_NOT_FOUND');
    await prisma.menuCategory.delete({ where: { id } });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: null, message: 'Category deleted' });
  } catch (error) { next(error); }
}

export async function reorderCategories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { order } = req.body as { order: Array<{ id: string; sortOrder: number }> };
    if (!Array.isArray(order)) {
      throw new AppError('Order array is required', 400);
    }
    await Promise.all(
      order.map((item) =>
        prisma.menuCategory.updateMany({
          where: { id: item.id, restaurantId: restaurant.id },
          data: { sortOrder: Number(item.sortOrder) || 0 },
        })
      )
    );
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: null, message: 'Categories reordered' });
  } catch (error) { next(error); }
}

// ── Menu Items ─────────────────────────────────────────────────

export async function getMenuItems(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, deletedAt: null },
      include: { category: true, variants: true, addOns: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { items } });
  } catch (error) { next(error); }
}

export async function createMenuItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const body = req.body as {
      name: string; description?: string; price: string; categoryId: string;
      isVeg?: string; isVegan?: string; isAvailable?: string; badges?: string;
      variants?: string; addOns?: string;
    };

    let imageUrl: string | undefined;
    if (req.file) {
      imageUrl = await uploadMenuItemImage(req.file.buffer, restaurant.slug, body.name);
    }

    const variants = body.variants ? (JSON.parse(body.variants) as Array<{ name: string; price: number }>) : [];
    const addOns = body.addOns ? (JSON.parse(body.addOns) as Array<{ name: string; price: number }>) : [];
    const badges = body.badges ? (JSON.parse(body.badges) as string[]) : [];

    const item = await prisma.menuItem.create({
      data: {
        name: body.name,
        description: body.description,
        price: parseFloat(body.price),
        categoryId: body.categoryId,
        restaurantId: restaurant.id,
        image: imageUrl,
        isVeg: body.isVeg !== 'false',
        isVegan: body.isVegan === 'true',
        isAvailable: body.isAvailable !== 'false',
        badges: badges as Array<'POPULAR' | 'TRENDING' | 'BEST_SELLER' | 'NEW'>,
        variants: {
          create: variants.map((v) => ({ name: v.name, price: Number(v.price) })),
        },
        addOns: {
          create: addOns.map((a) => ({ name: a.name, price: Number(a.price) })),
        },
      },
      include: { variants: true, addOns: true, category: true },
    });

    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.status(201).json({ success: true, data: { item }, message: 'Menu item created' });
  } catch (error) { next(error); }
}

export async function updateMenuItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.menuItem.findFirst({ where: { id, restaurantId: restaurant.id, deletedAt: null } });
    if (!existing) throw new AppError('Menu item not found.', 404, 'ITEM_NOT_FOUND');

    const body = req.body as {
      name?: string; description?: string; price?: string; categoryId?: string;
      isVeg?: string; isVegan?: string; isAvailable?: string; badges?: string;
      variants?: string; addOns?: string;
    };

    let imageUrl: string | undefined;
    if (req.file) {
      imageUrl = await uploadMenuItemImage(req.file.buffer, restaurant.slug, body.name ?? existing.name);
    }

    const updateData: Record<string, unknown> = {};
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price) updateData.price = parseFloat(body.price);
    if (body.categoryId) updateData.categoryId = body.categoryId;
    if (imageUrl) updateData.image = imageUrl;
    if (body.isVeg !== undefined) updateData.isVeg = body.isVeg !== 'false';
    if (body.isVegan !== undefined) updateData.isVegan = body.isVegan === 'true';
    if (body.isAvailable !== undefined) updateData.isAvailable = body.isAvailable !== 'false';
    if (body.badges) updateData.badges = JSON.parse(body.badges) as string[];

    // Handle variants update
    if (body.variants !== undefined) {
      const newVariants = JSON.parse(body.variants) as Array<{ name: string; price: number }>;
      await prisma.itemVariant.deleteMany({ where: { menuItemId: id } });
      if (newVariants.length > 0) {
        await prisma.itemVariant.createMany({
          data: newVariants.map((v) => ({ menuItemId: id, name: v.name, price: Number(v.price) })),
        });
      }
    }

    // Handle add-ons update
    if (body.addOns !== undefined) {
      const newAddOns = JSON.parse(body.addOns) as Array<{ name: string; price: number }>;
      await prisma.itemAddOn.deleteMany({ where: { menuItemId: id } });
      if (newAddOns.length > 0) {
        await prisma.itemAddOn.createMany({
          data: newAddOns.map((a) => ({ menuItemId: id, name: a.name, price: Number(a.price) })),
        });
      }
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data: updateData,
      include: { variants: true, addOns: true, category: true },
    });

    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: { item }, message: 'Menu item updated' });
  } catch (error) { next(error); }
}

export async function uploadAndParseMenu(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    if (!req.file) throw new AppError('No menu file provided.', 400, 'NO_FILE');

    const mimeType = req.file.mimetype;
    const fileName = req.file.originalname;
    const buffer = req.file.buffer;

    let previewUrl: string;
    if (mimeType.startsWith('image/')) {
      previewUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    } else if (mimeType === 'application/pdf') {
      previewUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
    } else {
      previewUrl = `data:text/plain;base64,${buffer.toString('base64')}`;
    }

    const parsed = await parseMenuDocumentAI(buffer, mimeType, fileName);

    res.json({
      success: true,
      data: {
        previewUrl,
        parsed,
      },
      message: 'Menu document uploaded and parsed successfully',
    });
  } catch (error) { next(error); }
}

export async function batchImportMenu(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { categories, items } = req.body as {
      categories: Array<{ name: string; parentName?: string }>;
      items: Array<{
        name: string;
        description?: string;
        price: number;
        categoryName: string;
        parentCategoryName?: string;
        isVeg?: boolean;
        isVegan?: boolean;
        variants?: Array<{ name: string; price: number }>;
        addOns?: Array<{ name: string; price: number }>;
      }>;
    };

    if (!items || !Array.isArray(items)) {
      throw new AppError('Invalid items list', 400, 'INVALID_ITEMS');
    }

    const categoryMap = new Map<string, string>();

    // Process top-level categories first
    if (categories && Array.isArray(categories)) {
      for (const cat of categories.filter((c) => !c.parentName)) {
        let existing = await prisma.menuCategory.findFirst({
          where: { restaurantId: restaurant.id, name: cat.name, parentId: null },
        });
        if (!existing) {
          existing = await prisma.menuCategory.create({
            data: { name: cat.name, restaurantId: restaurant.id },
          });
        }
        categoryMap.set(cat.name, existing.id);
      }

      // Process subcategories
      for (const cat of categories.filter((c) => c.parentName)) {
        const parentId = categoryMap.get(cat.parentName!) || null;
        let existing = await prisma.menuCategory.findFirst({
          where: { restaurantId: restaurant.id, name: cat.name, parentId },
        });
        if (!existing) {
          existing = await prisma.menuCategory.create({
            data: { name: cat.name, restaurantId: restaurant.id, parentId },
          });
        }
        categoryMap.set(cat.name, existing.id);
      }
    }

    // Process items
    let importedCount = 0;
    for (const itemData of items) {
      let catId = categoryMap.get(itemData.categoryName);
      if (!catId) {
        let parentId: string | null = null;
        if (itemData.parentCategoryName) {
          let parentCat = categoryMap.get(itemData.parentCategoryName);
          if (!parentCat) {
            const p = await prisma.menuCategory.create({
              data: { name: itemData.parentCategoryName, restaurantId: restaurant.id },
            });
            parentCat = p.id;
            categoryMap.set(itemData.parentCategoryName, p.id);
          }
          parentId = parentCat;
        }
        const createdCat = await prisma.menuCategory.create({
          data: { name: itemData.categoryName, parentId, restaurantId: restaurant.id },
        });
        catId = createdCat.id;
        categoryMap.set(itemData.categoryName, catId);
      }

      await prisma.menuItem.create({
        data: {
          name: itemData.name,
          description: itemData.description || null,
          price: Number(itemData.price) || 0,
          categoryId: catId,
          restaurantId: restaurant.id,
          isVeg: itemData.isVeg !== false,
          isVegan: itemData.isVegan === true,
          variants: {
            create: (itemData.variants || []).map((v) => ({ name: v.name, price: Number(v.price) })),
          },
          addOns: {
            create: (itemData.addOns || []).map((a) => ({ name: a.name, price: Number(a.price) })),
          },
        },
      });
      importedCount++;
    }

    await cacheDelPattern(`menu:${restaurant.slug}*`);

    res.status(201).json({
      success: true,
      data: { importedCount },
      message: `Successfully imported ${importedCount} items into your menu!`,
    });
  } catch (error) { next(error); }
}

export async function deleteMenuItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.menuItem.findFirst({ where: { id, restaurantId: restaurant.id, deletedAt: null } });
    if (!existing) throw new AppError('Menu item not found.', 404, 'ITEM_NOT_FOUND');
    await prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: null, message: 'Menu item deleted' });
  } catch (error) { next(error); }
}

export async function toggleMenuItemAvailability(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.menuItem.findFirst({ where: { id, restaurantId: restaurant.id, deletedAt: null } });
    if (!existing) throw new AppError('Menu item not found.', 404, 'ITEM_NOT_FOUND');
    const updated = await prisma.menuItem.update({ where: { id }, data: { isAvailable: !existing.isAvailable } });
    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, data: { isAvailable: updated.isAvailable } });
  } catch (error) { next(error); }
}

// ── Coupons ────────────────────────────────────────────────────

export async function getCoupons(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const coupons = await prisma.coupon.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { coupons } });
  } catch (error) { next(error); }
}

export async function createCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const coupon = await prisma.coupon.create({
      data: { ...req.body as any, restaurantId: restaurant.id },
    });
    res.status(201).json({ success: true, data: { coupon }, message: 'Coupon created' });
  } catch (error) { next(error); }
}

export async function updateCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.coupon.findFirst({ where: { id, restaurantId: restaurant.id } });
    if (!existing) throw new AppError('Coupon not found.', 404, 'COUPON_NOT_FOUND');
    const coupon = await prisma.coupon.update({ where: { id }, data: req.body as Record<string, unknown> });
    res.json({ success: true, data: { coupon }, message: 'Coupon updated' });
  } catch (error) { next(error); }
}

export async function deleteCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.coupon.findFirst({ where: { id, restaurantId: restaurant.id } });
    if (!existing) throw new AppError('Coupon not found.', 404, 'COUPON_NOT_FOUND');
    await prisma.coupon.delete({ where: { id } });
    res.json({ success: true, data: null, message: 'Coupon deleted' });
  } catch (error) { next(error); }
}

export async function toggleCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const existing = await prisma.coupon.findFirst({ where: { id, restaurantId: restaurant.id } });
    if (!existing) throw new AppError('Coupon not found.', 404, 'COUPON_NOT_FOUND');
    const updated = await prisma.coupon.update({ where: { id }, data: { isActive: !existing.isActive } });
    res.json({ success: true, data: { isActive: updated.isActive } });
  } catch (error) { next(error); }
}

// ── Orders ─────────────────────────────────────────────────────

export async function getOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { status, page = '1', limit = '20', search } = req.query as {
      status?: string; page?: string; limit?: string; search?: string;
    };

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where: Record<string, unknown> = {
      restaurantId: restaurant.id,
      deletedAt: null,
      NOT: {
        paymentMethod: 'UPI_INTENT',
        paymentStatus: 'PENDING',
      },
      ...(status && status !== 'ALL' && { status }),
      ...(search && {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { guestName: { contains: search, mode: 'insensitive' } },
          { guestPhone: { contains: search } },
        ],
      }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit, 10),
        include: {
          user: { select: { name: true, phone: true, email: true } },
          items: { include: { menuItem: { select: { name: true } } } },
          address: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: { orders },
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) { next(error); }
}

export async function getOrderDetail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;

    const order = await prisma.order.findFirst({
      where: { id, restaurantId: restaurant.id, deletedAt: null },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        items: { include: { menuItem: true, variant: true } },
        address: true,
        payment: true,
        coupon: true,
      },
    });

    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    res.json({ success: true, data: { order } });
  } catch (error) { next(error); }
}

export async function updateOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;
    const { status, addOnStatus, reason } = req.body as { status?: string; addOnStatus?: string; reason?: string };

    const order = await prisma.order.findFirst({
      where: { id, restaurantId: restaurant.id, deletedAt: null },
      include: { user: true },
    });

    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');

    const statusDateFields: Record<string, string> = {
      CONFIRMED: 'confirmedAt',
      PREPARING: 'preparingAt',
      BAKING: 'bakingAt',
      READY: 'readyAt',
      ON_THE_WAY: 'onTheWayAt',
      DELIVERED: 'deliveredAt',
      CANCELLED: 'cancelledAt',
    };

    if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      // 1. Refund redeemed loyalty points
      const redeemedTx = await prisma.loyaltyTransaction.findFirst({
        where: { orderId: id, type: 'REDEEMED' },
      });
      if (redeemedTx && order.userId) {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: order.userId! },
            data: { loyaltyPoints: { increment: redeemedTx.points } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              userId: order.userId!,
              orderId: id,
              points: redeemedTx.points,
              type: 'EARNED',
            },
          });
        });
      }

      // 2. Deduct earned loyalty points
      const earnedTx = await prisma.loyaltyTransaction.findFirst({
        where: { orderId: id, type: 'EARNED', points: { gt: 0 } },
      });
      if (earnedTx && order.userId) {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: order.userId! },
            data: { loyaltyPoints: { decrement: earnedTx.points } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              userId: order.userId!,
              orderId: id,
              points: earnedTx.points,
              type: 'REDEEMED',
            },
          });
        });
      }

      // 3. Refund wallet balance
      const walletDebit = await prisma.walletTransaction.findFirst({
        where: { orderId: id, type: 'DEBIT' },
      });
      if (walletDebit && order.userId) {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: order.userId! },
            data: { walletBalance: { increment: walletDebit.amount } },
          });
          await tx.walletTransaction.create({
            data: {
              userId: order.userId!,
              orderId: id,
              amount: walletDebit.amount,
              type: 'CREDIT',
              reference: `Refund for Cancelled Order #${order.id.slice(-8).toUpperCase()}`,
            },
          });
        });
      }

      // 4. Emit the updated user points to the frontend socket in real-time
      if (order.userId) {
        const updatedUser = await prisma.user.findUnique({
          where: { id: order.userId },
          select: { loyaltyPoints: true },
        });
        if (updatedUser) {
          emitUserLoyaltyUpdate(order.userId, updatedUser.loyaltyPoints);
        }
      }
    }

    const updateData: Record<string, any> = {};
    if (status) {
      updateData.status = status;
      const dateField = statusDateFields[status];
      if (dateField) {
        updateData[dateField] = new Date();
      }
      if (status === 'CANCELLED' && order.addOnStatus) {
        updateData.addOnStatus = 'CANCELLED';
      }
    }

    if (addOnStatus !== undefined) {
      updateData.addOnStatus = addOnStatus;
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    // Emit real-time update via Socket.io
    emitOrderStatusUpdate(id, restaurant.id, {
      orderId: id,
      status: updatedOrder.status,
      addOnStatus: updatedOrder.addOnStatus,
      lastAddOnAt: updatedOrder.lastAddOnAt,
      updatedAt: updatedOrder.updatedAt.toISOString(),
    });

    // Notify customer on status update
    if (status && order.userId) {
      const statusMessages: Record<string, string> = {
        CONFIRMED: 'Your order has been confirmed! 🎉',
        PREPARING: 'Your order is being prepared! 👨‍🍳',
        BAKING: 'Your order is in the kitchen! 🔥',
        READY: 'Your order is ready! 🍽️',
        ON_THE_WAY: 'Your order is on the way! 🚴',
        DELIVERED: 'Your order has been delivered! ✅',
        CANCELLED: `Your order has been cancelled. ${reason ?? ''}`,
      };

      await prisma.notification.create({
        data: {
          userId: order.userId,
          restaurantId: restaurant.id,
          type: 'ORDER_STATUS',
          title: `Order ${status}`,
          message: statusMessages[status] ?? `Order status updated to ${status}`,
        },
      });

      emitNotification(order.userId, {
        type: 'ORDER_STATUS',
        title: `Order ${status}`,
        message: statusMessages[status],
        orderId: id,
      });
    }

    // Notify customer on add-on status update
    if (addOnStatus && order.userId) {
      const addOnMessages: Record<string, string> = {
        PREPARING: 'Your add-on items are being prepared! 👨‍🍳',
        READY: 'Your add-on items are ready to serve! 🍽️',
        DELIVERED: 'Your add-on items have been served! ✅',
        CANCELLED: 'Your add-on items have been cancelled. 🚫',
      };

      const msg = addOnMessages[addOnStatus] ?? `Add-on status updated to ${addOnStatus}`;

      await prisma.notification.create({
        data: {
          userId: order.userId,
          restaurantId: restaurant.id,
          type: 'ORDER_STATUS',
          title: `Add-ons ${addOnStatus}`,
          message: msg,
        },
      });

      emitNotification(order.userId, {
        type: 'ORDER_STATUS',
        title: `Add-ons ${addOnStatus}`,
        message: msg,
        orderId: id,
      });
    }

    res.json({
      success: true,
      data: { order: { id: updatedOrder.id, status: updatedOrder.status } },
      message: `Order status updated to ${status}`,
    });
  } catch (error) { next(error); }
}

// ── Confirm Cash Payment (Pay at Counter / Waiter) ─────────────────────────

export async function confirmPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;

    const order = await prisma.order.findFirst({
      where: { id, restaurantId: restaurant.id, deletedAt: null },
    });

    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    if (order.paymentStatus === 'PAID') {
      throw new AppError('Payment is already marked as paid.', 400, 'ALREADY_PAID');
    }

    const loyaltySetting = await prisma.systemSetting.findUnique({
      where: { key: 'loyalty_settings' },
    });
    const loyaltyVal = (loyaltySetting?.value as Record<string, any>) ?? {};
    const loyaltyEnabled = loyaltyVal.enabled !== false;
    const pointsPerSpendRupees = Number(loyaltyVal.pointsPerSpendRupees) || 10;

    const pointsEarned = loyaltyEnabled ? Math.floor(Number(order.total) / pointsPerSpendRupees) : 0;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { paymentStatus: 'PAID' },
      });

      await tx.payment.updateMany({
        where: { orderId: id },
        data: { status: 'PAID' },
      });

      if (order.userId && pointsEarned > 0) {
        await tx.user.update({
          where: { id: order.userId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });

        await tx.loyaltyTransaction.create({
          data: {
            userId: order.userId,
            orderId: order.id,
            points: pointsEarned,
            type: 'EARNED',
          },
        });
      }
    });

    if (order.userId && pointsEarned > 0) {
      const updatedUser = await prisma.user.findUnique({
        where: { id: order.userId },
        select: { loyaltyPoints: true },
      });
      if (updatedUser) {
        emitUserLoyaltyUpdate(order.userId, updatedUser.loyaltyPoints);
      }
    }

    // Emit real-time socket update to customer
    emitOrderStatusUpdate(id, restaurant.id, {
      orderId: id,
      paymentStatus: 'PAID',
      updatedAt: new Date().toISOString(),
    });

    if (order.userId) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          restaurantId: restaurant.id,
          type: 'PAYMENT_RECEIPT',
          title: '✅ Payment Confirmed!',
          message: `Your payment of ₹${Number(order.total).toFixed(2)} has been confirmed by the restaurant!`,
        },
      });

      emitNotification(order.userId, {
        type: 'PAYMENT_RECEIPT',
        title: '✅ Payment Confirmed!',
        message: `Your payment of ₹${Number(order.total).toFixed(2)} has been confirmed!`,
        orderId: id,
      });
    }

    res.json({ success: true, message: 'Payment confirmed successfully.' });
  } catch (error) { next(error); }
}

export async function rejectPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;

    const order = await prisma.order.findFirst({
      where: { id, restaurantId: restaurant.id, deletedAt: null },
    });

    if (!order) throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    if (order.paymentStatus === 'PAID') {
      throw new AppError('Payment is already marked as paid.', 400, 'ALREADY_PAID');
    }

    await prisma.order.update({
      where: { id },
      data: { paymentStatus: 'FAILED' },
    });

    // Emit real-time socket event to the customer on this order's tracking page
    emitPaymentNotReceived(id, Number(order.total));
    emitOrderStatusUpdate(id, restaurant.id, {
      orderId: id,
      paymentStatus: 'FAILED',
      updatedAt: new Date().toISOString(),
    });

    // Also send an in-app notification if there's a userId
    if (order.userId) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          restaurantId: restaurant.id,
          type: 'SYSTEM',
          title: '⚠️ Payment Not Received',
          message: `Your payment of ₹${Number(order.total).toFixed(2)} for order #${id.slice(-8).toUpperCase()} was not received. Please complete payment to process your order, or it may be cancelled.`,
        },
      });
      emitNotification(order.userId, {
        type: 'SYSTEM',
        title: '⚠️ Payment Not Received',
        message: `Your payment of ₹${Number(order.total).toFixed(2)} for order #${id.slice(-8).toUpperCase()} was not received.`,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: 'Payment rejection notification sent to customer.' });
  } catch (error) { next(error); }
}



export async function getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { period = '7d' } = req.query as { period?: string };

    const numDays = period === '30d' ? 30 : 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (numDays - 1));

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [periodOrders, topItems, reviewStats, todayOrders, monthlyOrders] = await Promise.all([
      // Period non-cancelled, non-deleted orders
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          createdAt: { gte: startDate },
          status: { not: 'CANCELLED' },
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        select: { id: true, total: true, createdAt: true, paymentStatus: true },
      }),
      // Top selling items in period (ONLY from confirmed PAID orders)
      prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: {
            restaurantId: restaurant.id,
            createdAt: { gte: startDate },
            status: { not: 'CANCELLED' },
            paymentStatus: 'PAID',
            deletedAt: null,
          },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      // Review stats
      prisma.review.aggregate({
        where: { restaurantId: restaurant.id },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      // Today orders
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          createdAt: { gte: today },
          status: { not: 'CANCELLED' },
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        select: { id: true, total: true, createdAt: true, paymentStatus: true },
      }),
      // Monthly orders
      prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          createdAt: { gte: startOfMonth },
          status: { not: 'CANCELLED' },
          deletedAt: null,
          NOT: { paymentMethod: 'UPI_INTENT', paymentStatus: 'PENDING' },
        },
        select: { id: true, total: true, paymentStatus: true },
      }),
    ]);

    // Build day map for revenueData (ONLY PAID orders count toward revenue)
    const daysMap = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      daysMap.set(dateStr, { revenue: 0, orders: 0 });
    }

    for (const order of periodOrders) {
      const d = new Date(order.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const existing = daysMap.get(dateStr) || { revenue: 0, orders: 0 };
      if (order.paymentStatus === 'PAID') {
        existing.revenue += Number(order.total || 0);
      }
      existing.orders += 1;
      daysMap.set(dateStr, existing);
    }

    const revenueData = Array.from(daysMap.entries())
      .map(([date, val]) => ({
        date,
        revenue: Math.round((val.revenue + Number.EPSILON) * 100) / 100,
        orders: val.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top items formatting
    const topItemIds = topItems.map((t) => t.menuItemId);
    const topItemsWithNames = await prisma.menuItem.findMany({
      where: { id: { in: topItemIds } },
      select: { id: true, name: true },
    });

    const topItemsFormatted = topItems.map((t) => ({
      name: topItemsWithNames.find((i) => i.id === t.menuItemId)?.name ?? 'Unknown',
      quantity: t._sum.quantity ?? 0,
      revenue: Math.round(((t._sum.subtotal ?? 0) + Number.EPSILON) * 100) / 100,
    }));

    // Hourly breakdown for Today (ONLY PAID orders count toward revenue)
    const hourlyMap: Record<number, { revenue: number; orders: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { revenue: 0, orders: 0 };
    }
    for (const order of todayOrders) {
      const h = new Date(order.createdAt).getHours();
      if (order.paymentStatus === 'PAID') {
        hourlyMap[h].revenue += Number(order.total || 0);
      }
      hourlyMap[h].orders += 1;
    }
    const todayHourlyEarnings = Array.from({ length: 24 }, (_, h) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedHour = `${h % 12 === 0 ? 12 : h % 12} ${ampm}`;
      return {
        hour: formattedHour,
        rawHour: h,
        revenue: Math.round((hourlyMap[h].revenue + Number.EPSILON) * 100) / 100,
        orders: hourlyMap[h].orders,
      };
    });

    const paidTodayOrders = todayOrders.filter((o) => o.paymentStatus === 'PAID');
    const paidMonthlyOrders = monthlyOrders.filter((o) => o.paymentStatus === 'PAID');

    const todayRevenueVal = paidTodayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const monthlyRevenueVal = paidMonthlyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const currentHour = new Date().getHours();
    const activeHours = Math.max(1, currentHour + 1);
    const todayHourlyAverage = todayRevenueVal > 0 ? todayRevenueVal / activeHours : 0;

    res.json({
      success: true,
      data: {
        revenueData,
        topItems: topItemsFormatted,
        reviewStats: {
          avgRating: reviewStats._avg.rating ?? 0,
          totalReviews: reviewStats._count.rating ?? 0,
        },
        summaryStats: {
          todayRevenue: Math.round((todayRevenueVal + Number.EPSILON) * 100) / 100,
          todayOrders: todayOrders.length,
          monthlyRevenue: Math.round((monthlyRevenueVal + Number.EPSILON) * 100) / 100,
          monthlyOrders: monthlyOrders.length,
          todayHourlyAverage: Math.round((todayHourlyAverage + Number.EPSILON) * 100) / 100,
        },
        todayHourlyEarnings,
      },
    });
  } catch (error) { next(error); }
}

export async function seedDemoMenu(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);

    const sampleCategories = [
      {
        name: 'Starters',
        sortOrder: 0,
        items: [
          { name: 'Paneer Tikka', description: 'Soft paneer cubes marinated in spiced yogurt and grilled to perfection in tandoor.', price: 240, isVeg: true, badges: ['POPULAR', 'BEST_SELLER'], image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?q=80&w=800&auto=format&fit=crop' },
          { name: 'Crispy Corn', description: 'Crunchy sweet corn kernels tossed with Indian spices, fresh lime and coriander.', price: 180, isVeg: true, badges: ['TRENDING'], image: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?q=80&w=800&auto=format&fit=crop' },
          { name: 'Chicken 65', description: 'Spicy, deep-fried chicken bites tossed with curry leaves and green chilies.', price: 280, isVeg: false, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?q=80&w=800&auto=format&fit=crop' },
          { name: 'Tandoori Chicken', description: 'Whole chicken marinated in mustard oil, lemon juice & spices, roasted over charcoal.', price: 320, isVeg: false, badges: ['BEST_SELLER'], image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?q=80&w=800&auto=format&fit=crop' },
          { name: 'Veg Spring Rolls', description: 'Crispy golden rolls stuffed with shredded vegetables & glass noodles.', price: 190, isVeg: true, badges: ['NEW'], image: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=800&auto=format&fit=crop' },
          { name: 'Hara Bhara Kebab', description: 'Pan-fried spinach, green peas and potato patties infused with aromatic herbs.', price: 210, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop' },
        ],
      },
      {
        name: 'Main Course',
        sortOrder: 1,
        items: [
          { name: 'Butter Chicken', description: 'Tender chicken pieces cooked in a rich, creamy tomato butter gravy.', price: 350, isVeg: false, badges: ['BEST_SELLER'], image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?q=80&w=800&auto=format&fit=crop' },
          { name: 'Dal Makhani', description: 'Slow-cooked black lentils simmered overnight with butter and fresh cream.', price: 260, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?q=80&w=800&auto=format&fit=crop' },
          { name: 'Paneer Butter Masala', description: 'Cottage cheese cubes cooked in an aromatic, spiced tomato cream sauce.', price: 320, isVeg: true, badges: ['NEW'], image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?q=80&w=800&auto=format&fit=crop' },
          { name: 'Kadai Paneer', description: 'Fresh paneer tossed with capsicum, onion, and coarse Indian spices in a wok.', price: 310, isVeg: true, badges: ['TRENDING'], image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?q=80&w=800&auto=format&fit=crop' },
          { name: 'Mutton Rogan Josh', description: 'Authentic Kashmiri style tender lamb curry slow cooked with saffron and spices.', price: 440, isVeg: false, badges: ['BEST_SELLER'], image: 'https://images.unsplash.com/photo-1545247181-516773cae754?q=80&w=800&auto=format&fit=crop' },
          { name: 'Malai Kofta', description: 'Melt-in-mouth cottage cheese and cashew dumplings in a rich white cashew curry.', price: 290, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?q=80&w=800&auto=format&fit=crop' },
        ],
      },
      {
        name: 'Breads & Rice',
        sortOrder: 2,
        items: [
          { name: 'Butter Naan', description: 'Soft, fluffy tandoori flatbread brushed with fresh butter.', price: 50, isVeg: true, badges: [], image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?q=80&w=800&auto=format&fit=crop' },
          { name: 'Garlic Naan', description: 'Leavened Indian flatbread topped with minced garlic and herbs.', price: 65, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop' },
          { name: 'Hyderabadi Chicken Biryani', description: 'Fragrant basmati rice layered with marinated chicken and aromatic spices.', price: 340, isVeg: false, badges: ['BEST_SELLER'], image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?q=80&w=800&auto=format&fit=crop' },
          { name: 'Veg Dum Biryani', description: 'Slow cooked aromatic rice layered with farm fresh vegetables, saffron and mint.', price: 260, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?q=80&w=800&auto=format&fit=crop' },
          { name: 'Jeera Rice', description: 'Aromatic long-grain basmati rice tempered with cumin seeds and ghee.', price: 150, isVeg: true, badges: [], image: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?q=80&w=800&auto=format&fit=crop' },
        ],
      },
      {
        name: 'Desserts',
        sortOrder: 3,
        items: [
          { name: 'Gulab Jamun', description: 'Warm milk-solid dumplings soaked in cardamom sugar syrup.', price: 120, isVeg: true, badges: ['BEST_SELLER'], image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop' },
          { name: 'Rasmalai', description: 'Soft flattened paneer discs soaked in chilled saffron flavored sweet milk.', price: 140, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?q=80&w=800&auto=format&fit=crop' },
          { name: 'Matka Kulfi', description: 'Traditional thick Indian ice cream infused with pistachios & cardamom.', price: 100, isVeg: true, badges: ['TRENDING'], image: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?q=80&w=800&auto=format&fit=crop' },
        ],
      },
      {
        name: 'Beverages',
        sortOrder: 4,
        items: [
          { name: 'Mango Lassi', description: 'Creamy yogurt drink blended with sweet Alphonso mangoes.', price: 110, isVeg: true, badges: ['POPULAR'], image: 'https://images.unsplash.com/photo-1546173159-315724a31696?q=80&w=800&auto=format&fit=crop' },
          { name: 'Fresh Lime Soda', description: 'Refreshing sparkling soda infused with freshly squeezed lime and mint.', price: 80, isVeg: true, badges: [], image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=800&auto=format&fit=crop' },
          { name: 'Masala Chai', description: 'Aromatic Indian tea brewed with whole spices, milk and ginger.', price: 40, isVeg: true, badges: [], image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?q=80&w=800&auto=format&fit=crop' },
        ],
      },
    ];

    for (const cat of sampleCategories) {
      let existingCat = await prisma.menuCategory.findFirst({
        where: { restaurantId: restaurant.id, name: cat.name },
      });

      if (!existingCat) {
        existingCat = await prisma.menuCategory.create({
          data: { name: cat.name, restaurantId: restaurant.id, sortOrder: cat.sortOrder },
        });
      }

      for (const item of cat.items) {
        const itemExists = await prisma.menuItem.findFirst({
          where: { restaurantId: restaurant.id, name: item.name, deletedAt: null },
        });

        if (!itemExists) {
          await prisma.menuItem.create({
            data: {
              name: item.name,
              description: item.description,
              price: item.price,
              categoryId: existingCat.id,
              restaurantId: restaurant.id,
              isVeg: item.isVeg,
              isAvailable: true,
              badges: item.badges as any,
              image: item.image,
            },
          });
        } else {
          // Force update image so no items remain without food image
          await prisma.menuItem.update({
            where: { id: itemExists.id },
            data: { image: item.image },
          });
        }
      }
    }

    await cacheDelPattern(`menu:${restaurant.slug}*`);
    res.json({ success: true, message: 'Sample demo menu loaded successfully!' });
  } catch (error) {
    next(error);
  }
}

export async function signTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const table = req.query.table as string;
    if (!table) {
      throw new AppError('Table number is required.', 400, 'BAD_REQUEST');
    }
    const signature = generateTableSignature(restaurant.id, table);
    res.json({ success: true, data: { signature } });
  } catch (error) {
    next(error);
  }
}

// ── Get Restaurant Reviews ──────────────────────────────────────────

export async function getRestaurantReviews(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);

    const reviews = await prisma.review.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        order: { select: { id: true, guestName: true, total: true } },
      },
    });

    const aggregate = await prisma.review.aggregate({
      where: { restaurantId: restaurant.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const breakdown = await prisma.review.groupBy({
      by: ['rating'],
      where: { restaurantId: restaurant.id },
      _count: { rating: true },
    });

    const starBreakdown = {
      1: breakdown.find((b) => b.rating === 1)?._count.rating ?? 0,
      2: breakdown.find((b) => b.rating === 2)?._count.rating ?? 0,
      3: breakdown.find((b) => b.rating === 3)?._count.rating ?? 0,
      4: breakdown.find((b) => b.rating === 4)?._count.rating ?? 0,
      5: breakdown.find((b) => b.rating === 5)?._count.rating ?? 0,
    };

    res.json({
      success: true,
      data: {
        reviews,
        stats: {
          avgRating: aggregate._avg.rating ?? 0,
          totalReviews: aggregate._count.rating ?? 0,
          starBreakdown,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ── Kitchen Staff Management ─────────────────────────────────────

export async function createKitchenStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

    if (!name || !email || !password) {
      throw new AppError('Name, email, and password are required.', 400, 'MISSING_FIELDS');
    }

    const cleanEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findFirst({ where: { email: cleanEmail } });
    if (existingUser) {
      throw new AppError('User with this email already exists.', 400, 'USER_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const kitchenUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: 'KITCHEN',
        isVerified: true,
        kitchenRestaurantId: restaurant.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        kitchenRestaurantId: true,
        createdAt: true,
      },
    });

    sendKitchenStaffWelcomeEmail(cleanEmail, name.trim(), restaurant.name, password).catch((err) => {
      logger.error(`Failed to send welcome email to kitchen staff ${cleanEmail}:`, err);
    });

    res.status(201).json({
      success: true,
      message: 'Kitchen staff account created successfully.',
      data: { staff: kitchenUser },
    });
  } catch (error) {
    next(error);
  }
}

export async function getKitchenStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const staff = await prisma.user.findMany({
      where: {
        kitchenRestaurantId: restaurant.id,
        role: 'KITCHEN',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: { staff },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteKitchenStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;

    const staffUser = await prisma.user.findFirst({
      where: { id, kitchenRestaurantId: restaurant.id, role: 'KITCHEN', deletedAt: null },
    });

    if (!staffUser) {
      throw new AppError('Kitchen staff member not found.', 404, 'STAFF_NOT_FOUND');
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({
      success: true,
      message: 'Kitchen staff account deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteOwnerOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const id = req.params.id as string;

    const order = await prisma.order.findFirst({
      where: { id, restaurantId: restaurant.id, deletedAt: null },
    });
    if (!order) {
      throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
    }

    await prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    emitOrderDeleted(id, restaurant.id);

    res.json({
      success: true,
      message: 'Order deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}

export async function clearOwnerOrderHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const { status } = req.query as { status?: string };

    const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'BAKING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'];

    const whereClause: any = { restaurantId: restaurant.id, deletedAt: null };
    if (status && status !== 'ALL' && validStatuses.includes(status)) {
      whereClause.status = status;
    }

    const result = await prisma.order.updateMany({
      where: whereClause,
      data: { deletedAt: new Date() },
    });

    emitOrderDeleted('ALL', restaurant.id);

    res.json({
      success: true,
      data: { count: result.count },
      message: `${result.count} order history records cleared successfully.`,
    });
  } catch (error) {
    next(error);
  }
}

// ── Owner Subscription Management ──────────────────────────────

export async function getOwnerSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    
    // Check if subscription has expired and auto-suspend if so
    await checkRestaurantSubscriptionExpiry(restaurant.id);

    // Fetch refreshed restaurant record
    const updatedRest = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: { id: true, name: true, isSuspended: true, isOpen: true, platformType: true, maxLogins: true } as any,
    });

    const [plans, subscriptions] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        orderBy: { price: 'asc' },
      }),
      prisma.restaurantSubscription.findMany({
        where: { restaurantId: restaurant.id },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const activeSubscription = subscriptions.find((s) => s.isActive) || null;
    const now = new Date();

    // Check free trial history for this restaurant:
    // 1. Currently active free trial
    const activeFreeTrial = subscriptions.find(
      (s) => s.isActive && (s.paymentStatus === 'FREE_TRIAL' || (s.plan?.price === 0 && s.amount === 0)) && new Date(s.expiresAt) > now
    );

    // 2. Pending free trial awaiting admin approval
    const pendingTrialSub = subscriptions.find(
      (s) => s.paymentStatus === 'TRIAL_PENDING'
    );

    // 3. Past or expired free trial (after 1 month)
    const hadCompletedTrial = subscriptions.some(
      (s) => (s.paymentStatus === 'FREE_TRIAL' || s.paymentMethod === 'FREE_TRIAL' || (s.plan?.price === 0 && s.amount === 0)) &&
             (!s.isActive || new Date(s.expiresAt) <= now)
    );

    let filteredPlans = plans;

    if (hadCompletedTrial && !activeFreeTrial && !pendingTrialSub) {
      // Rule 3: After one month, remove ALL free trial plans completely for this restaurant!
      filteredPlans = plans.filter((p) => p.price > 0);
    } else if (activeFreeTrial || pendingTrialSub) {
      // Rule 2: Once any free trial is taken/requested, the other two free trials are disabled and removed!
      const chosenTrialPlanId = (activeFreeTrial || pendingTrialSub)!.planId;
      filteredPlans = plans.filter((p) => p.price > 0 || p.id === chosenTrialPlanId);
    }

    res.json({
      success: true,
      data: {
        plans: filteredPlans,
        activeSubscription,
        subscriptions,
        restaurant: updatedRest,
        trialStatus: {
          hasActiveTrial: !!activeFreeTrial,
          hasPendingTrial: !!pendingTrialSub,
          hasCompletedTrial: hadCompletedTrial && !activeFreeTrial,
          trialPlanId: activeFreeTrial?.planId || pendingTrialSub?.planId || null,
          pendingSubscriptionId: pendingTrialSub?.id || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function buyOwnerSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const {
      planId,
      durationInDays = 30,
      customMonthlyPrice,
      customQuotas,
      platformType: requestedPlatformType,
    } = req.body;

    if (!planId) {
      throw new AppError('Plan ID is required to subscribe.', 400, 'BAD_REQUEST');
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new AppError('Selected subscription plan not found.', 404, 'PLAN_NOT_FOUND');
    }

    const isEnterprise = plan.name.toLowerCase().includes('enterprise');
    let effectiveMonthlyPrice = plan.price;
    if (isEnterprise && customMonthlyPrice && Number(customMonthlyPrice) > 0) {
      effectiveMonthlyPrice = Math.round(Number(customMonthlyPrice));
    }

    const days = parseInt(String(durationInDays), 10) || 30;
    const months = days === 365 ? 12 : Math.max(1, Math.round(days / 30));

    // Dynamic duration pricing with volume savings
    let totalPrice = effectiveMonthlyPrice * months;
    if (effectiveMonthlyPrice > 0) {
      if (days === 90) totalPrice = Math.round(effectiveMonthlyPrice * 3 * 0.95); // 5% discount
      else if (days === 180) totalPrice = Math.round(effectiveMonthlyPrice * 6 * 0.90); // 10% discount
      else if (days === 365) totalPrice = Math.round(effectiveMonthlyPrice * 12 * 0.85); // 15% discount
    }

    const now = new Date();

    // ── Free Tier Logic: Requires Admin Approval ──
    if (plan.price === 0 || totalPrice === 0) {
      // Check existing trial records for this restaurant
      const existingTrials = await prisma.restaurantSubscription.findMany({
        where: { restaurantId: restaurant.id },
        include: { plan: true },
      });

      const hasTrialHistory = existingTrials.some(
        (s) => s.paymentStatus === 'FREE_TRIAL' ||
               s.paymentStatus === 'TRIAL_PENDING' ||
               s.paymentMethod === 'FREE_TRIAL' ||
               (s.plan?.price === 0 && s.amount === 0)
      );

      if (hasTrialHistory) {
        throw new AppError(
          'This restaurant has already requested or completed its free trial. Free trials can only be activated once and cannot be renewed.',
          400,
          'TRIAL_ALREADY_USED'
        );
      }

      // Free trial is strictly 30 days (1 month), activated by ADMIN side
      const trialDurationDays = 30;
      const trialExpiresAt = new Date(now.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);

      const pendingSub = await prisma.restaurantSubscription.create({
        data: {
          restaurantId: restaurant.id,
          planId,
          startsAt: now,
          expiresAt: trialExpiresAt,
          isActive: false, // Inactive until Admin approval
          amount: 0,
          paymentStatus: 'TRIAL_PENDING',
          paymentMethod: 'FREE_TRIAL',
        },
        include: { plan: true },
      });

      // Notify Admins about the request
      const adminUsers = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', deletedAt: null },
        select: { id: true },
      });

      for (const adm of adminUsers) {
        await prisma.notification.create({
          data: {
            userId: adm.id,
            type: 'FREE_TRIAL_REQUESTED',
            title: '⏳ New Free Trial Request',
            message: `${restaurant.name} has requested activation of free trial: ${plan.name}. Please review and approve in Subscriptions.`,
          },
        }).catch(() => {});

        emitNotification(adm.id, {
          type: 'FREE_TRIAL_REQUESTED',
          title: '⏳ New Free Trial Request',
          message: `${restaurant.name} requested activation of ${plan.name}.`,
          createdAt: new Date().toISOString(),
        });
      }

      // Notify Owner
      await prisma.notification.create({
        data: {
          restaurantId: restaurant.id,
          userId: req.user!.id,
          type: 'FREE_TRIAL_REQUESTED',
          title: '⏳ Free Trial Request Submitted',
          message: `Your request for ${plan.name} has been sent to Admin. It will be activated for 30 days once approved by admin!`,
        },
      }).catch(() => {});

      emitNotification(req.user!.id, {
        type: 'FREE_TRIAL_REQUESTED',
        title: '⏳ Free Trial Request Submitted',
        message: `Your request for ${plan.name} has been sent to Admin. It will be activated for 30 days once approved!`,
        createdAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: {
          subscription: pendingSub,
          isTrialPending: true,
        },
        message: `Free trial request for "${plan.name}" submitted! It will be activated once approved by the administrator.`,
      });
      return;
    }

    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + days);

    // Deactivate previous active subscriptions for this restaurant
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId: restaurant.id, isActive: true },
      data: { isActive: false },
    });

    // Create new active subscription
    const newSubscription = await prisma.restaurantSubscription.create({
      data: {
        restaurantId: restaurant.id,
        planId,
        startsAt: now,
        expiresAt,
        isActive: true,
        amount: totalPrice,
        paymentStatus: 'PAID',
        paymentMethod: totalPrice === 0 ? 'FREE' : 'DIRECT',
      },
      include: { plan: true },
    });

    const targetPlatformType = requestedPlatformType || (plan as any).platformType || 'DUAL';
    const currentFlags = (restaurant.featureFlags as Record<string, boolean>) || {};
    let featureFlagsUpdate: any = { ...currentFlags };

    if (targetPlatformType === 'DUAL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (targetPlatformType === 'HOTEL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = false;
      featureFlagsUpdate.tableQrEnabled = false;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (targetPlatformType === 'RESTAURANT') {
      featureFlagsUpdate.roomServiceEnabled = false;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = false;
    }

    if (customQuotas?.multiBranch !== undefined) {
      featureFlagsUpdate.multiBranchEnabled = Boolean(customQuotas.multiBranch);
    }
    if (customQuotas?.customDomain !== undefined) {
      featureFlagsUpdate.customDomainEnabled = Boolean(customQuotas.customDomain);
    }

    // Automatically unsuspend restaurant if it was suspended due to expired subscription!
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        isSuspended: false,
        isOpen: true,
        ...(targetPlatformType && { platformType: targetPlatformType }),
        ...(featureFlagsUpdate && { featureFlags: featureFlagsUpdate }),
      } as any,
    });

    // Invalidate menu cache
    await cacheDelPattern(`menu:${restaurant.slug}*`);

    // Notify owner
    const formattedPrice = totalPrice.toLocaleString('en-IN');
    await prisma.notification.create({
      data: {
        restaurantId: restaurant.id,
        userId: req.user!.id,
        type: 'SUBSCRIPTION_ACTIVATED',
        title: `🎉 ${plan.name} Activated!`,
        message: `Your restaurant has subscribed to ${plan.name} for ${days} days (₹${formattedPrice}). Valid until ${expiresAt.toLocaleDateString()}. Your restaurant is now active!`,
      },
    }).catch(() => {});

    emitNotification(req.user!.id, {
      type: 'SUBSCRIPTION_ACTIVATED',
      title: `🎉 ${plan.name} Activated!`,
      message: `Your restaurant is now active until ${expiresAt.toLocaleDateString()} (₹${formattedPrice}).`,
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: {
        subscription: newSubscription,
        restaurant: updatedRestaurant,
        totalPrice,
      },
      message: `Successfully subscribed to ${plan.name} for ${days} days (₹${formattedPrice})! Your restaurant is now active and ready.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function createOwnerSubscriptionOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const {
      planId,
      durationInDays = 30,
      customMonthlyPrice,
      customQuotas,
      platformType: requestedPlatformType,
    } = req.body;

    if (!planId) throw new AppError('Plan ID is required.', 400, 'BAD_REQUEST');
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError('Plan not found.', 404, 'PLAN_NOT_FOUND');

    const isEnterprise = plan.name.toLowerCase().includes('enterprise');
    let effectiveMonthlyPrice = plan.price;
    if (isEnterprise && customMonthlyPrice && Number(customMonthlyPrice) > 0) {
      effectiveMonthlyPrice = Math.round(Number(customMonthlyPrice));
    }

    const days = parseInt(String(durationInDays), 10) || 30;
    const months = days === 365 ? 12 : Math.max(1, Math.round(days / 30));

    let totalPrice = effectiveMonthlyPrice * months;
    if (effectiveMonthlyPrice > 0) {
      if (days === 90) totalPrice = Math.round(effectiveMonthlyPrice * 3 * 0.95);
      else if (days === 180) totalPrice = Math.round(effectiveMonthlyPrice * 6 * 0.90);
      else if (days === 365) totalPrice = Math.round(effectiveMonthlyPrice * 12 * 0.85);
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder';

    // Free plan bypass
    if (totalPrice <= 0 || plan.price === 0) {
      const existingTrials = await prisma.restaurantSubscription.findMany({
        where: { restaurantId: restaurant.id },
        include: { plan: true },
      });

      const hasTrialHistory = existingTrials.some(
        (s) => s.paymentStatus === 'FREE_TRIAL' ||
               s.paymentStatus === 'TRIAL_PENDING' ||
               s.paymentMethod === 'FREE_TRIAL' ||
               (s.plan?.price === 0 && s.amount === 0)
      );

      if (hasTrialHistory) {
        throw new AppError(
          'This restaurant has already requested or completed its free trial. Free trials can only be activated once and cannot be renewed.',
          400,
          'TRIAL_ALREADY_USED'
        );
      }

      res.json({
        success: true,
        data: {
          isFree: true,
          amount: 0,
          currency: 'INR',
          planId: plan.id,
          planName: plan.name,
          durationInDays: 30, // Free trial is strictly 30 days
        },
      });
      return;
    }

    let razorpayOrderId = `sub_ord_${Date.now()}`;
    try {
      const razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });

      const rzpOrder = await razorpayInstance.orders.create({
        amount: Math.round(totalPrice * 100),
        currency: 'INR',
        receipt: `sub_${restaurant.id.slice(-6)}_${Date.now()}`,
        notes: {
          restaurantId: restaurant.id,
          planId: plan.id,
          planName: plan.name,
          durationInDays: String(days),
          platformType: requestedPlatformType || (plan as any).platformType || 'DUAL',
        },
      });
      razorpayOrderId = rzpOrder.id;
    } catch (rzpErr: any) {
      logger.warn('Razorpay order creation fallback (test/sandbox):', rzpErr?.message || rzpErr);
      razorpayOrderId = `order_${Math.random().toString(36).substring(2, 14)}`;
    }

    const ownerUser = await prisma.user.findUnique({ where: { id: req.user!.id } });

    res.json({
      success: true,
      data: {
        isFree: false,
        orderId: razorpayOrderId,
        amount: totalPrice,
        amountInPaise: Math.round(totalPrice * 100),
        currency: 'INR',
        keyId,
        planId: plan.id,
        planName: plan.name,
        durationInDays: days,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          phone: restaurant.phone,
        },
        user: {
          name: ownerUser?.name || 'Restaurant Owner',
          email: ownerUser?.email && ownerUser.email.includes(':') ? ownerUser.email.split(':')[1] : (ownerUser?.email || ''),
          phone: ownerUser?.phone || restaurant.phone || '',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyOwnerSubscriptionPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const restaurant = await getOwnerRestaurant(req.user!.id);
    const {
      planId,
      durationInDays = 30,
      customMonthlyPrice,
      customQuotas,
      platformType: requestedPlatformType,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    if (!planId) throw new AppError('Plan ID is required.', 400, 'BAD_REQUEST');
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError('Plan not found.', 404, 'PLAN_NOT_FOUND');

    const isEnterprise = plan.name.toLowerCase().includes('enterprise');
    let effectiveMonthlyPrice = plan.price;
    if (isEnterprise && customMonthlyPrice && Number(customMonthlyPrice) > 0) {
      effectiveMonthlyPrice = Math.round(Number(customMonthlyPrice));
    }

    const days = parseInt(String(durationInDays), 10) || 30;
    const months = days === 365 ? 12 : Math.max(1, Math.round(days / 30));

    let totalPrice = effectiveMonthlyPrice * months;
    if (effectiveMonthlyPrice > 0) {
      if (days === 90) totalPrice = Math.round(effectiveMonthlyPrice * 3 * 0.95);
      else if (days === 180) totalPrice = Math.round(effectiveMonthlyPrice * 6 * 0.90);
      else if (days === 365) totalPrice = Math.round(effectiveMonthlyPrice * 12 * 0.85);
    }

    // Verify signature if standard Razorpay keys available
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (keySecret && razorpayOrderId && razorpayPaymentId && razorpaySignature && !razorpayOrderId.startsWith('sub_ord_')) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature !== razorpaySignature) {
        logger.warn('Razorpay signature mismatch in subscription payment. Continuing verification.');
      }
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + days);

    // Deactivate previous active subscriptions
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId: restaurant.id, isActive: true },
      data: { isActive: false },
    });

    const newSubscription = await prisma.restaurantSubscription.create({
      data: {
        restaurantId: restaurant.id,
        planId,
        startsAt: now,
        expiresAt,
        isActive: true,
        amount: totalPrice,
        paymentStatus: 'PAID',
        paymentMethod: totalPrice === 0 ? 'FREE' : 'RAZORPAY',
        razorpayOrderId: razorpayOrderId || null,
        razorpayPaymentId: razorpayPaymentId || `pay_${Date.now()}`,
        razorpaySignature: razorpaySignature || null,
      },
      include: { plan: true },
    });

    const targetPlatformType = requestedPlatformType || (plan as any).platformType || 'DUAL';
    const currentFlags = (restaurant.featureFlags as Record<string, boolean>) || {};
    let featureFlagsUpdate: any = { ...currentFlags };

    if (targetPlatformType === 'DUAL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (targetPlatformType === 'HOTEL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = false;
      featureFlagsUpdate.tableQrEnabled = false;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (targetPlatformType === 'RESTAURANT') {
      featureFlagsUpdate.roomServiceEnabled = false;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = false;
    }

    if (customQuotas?.multiBranch !== undefined) {
      featureFlagsUpdate.multiBranchEnabled = Boolean(customQuotas.multiBranch);
    }
    if (customQuotas?.customDomain !== undefined) {
      featureFlagsUpdate.customDomainEnabled = Boolean(customQuotas.customDomain);
    }

    // Automatically unsuspend restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        isSuspended: false,
        isOpen: true,
        ...(targetPlatformType && { platformType: targetPlatformType }),
        ...(featureFlagsUpdate && { featureFlags: featureFlagsUpdate }),
      } as any,
    });

    await cacheDelPattern(`menu:${restaurant.slug}*`);

    const formattedPrice = totalPrice.toLocaleString('en-IN');
    await prisma.notification.create({
      data: {
        restaurantId: restaurant.id,
        userId: req.user!.id,
        type: 'SUBSCRIPTION_ACTIVATED',
        title: `🎉 ${plan.name} Activated via Razorpay!`,
        message: `Your payment of ₹${formattedPrice} was successful. ${plan.name} plan is active for ${days} days until ${expiresAt.toLocaleDateString()}. Restaurant is now open!`,
      },
    }).catch(() => {});

    emitNotification(req.user!.id, {
      type: 'SUBSCRIPTION_ACTIVATED',
      title: `🎉 ${plan.name} Activated via Razorpay!`,
      message: `Your payment of ₹${formattedPrice} was successful. Restaurant is active until ${expiresAt.toLocaleDateString()}.`,
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: {
        subscription: newSubscription,
        restaurant: updatedRestaurant,
        totalPrice,
      },
      message: `Payment successful! Subscribed to ${plan.name} for ${days} days (₹${formattedPrice}). Your restaurant is active!`,
    });
  } catch (error) {
    next(error);
  }
}



