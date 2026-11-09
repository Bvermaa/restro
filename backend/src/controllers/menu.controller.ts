import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { cacheGet, cacheSet } from '../services/redis.service';
import { emitWaiterCall } from '../services/socket.service';
import { ensureDatabaseSeeded } from '../utils/autoSeed';
import { verifyTableSignature } from '../utils/tableSignature';
import { logger } from '../utils/logger';

// Public: list of approved restaurants (for demo/landing page)
export async function getPublicRestaurants(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let restaurants = await prisma.restaurant.findMany({
      where: { isApproved: true, isSuspended: false, deletedAt: null },
      select: { slug: true, name: true, cuisineType: true, logo: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    if (!restaurants || restaurants.length === 0) {
      await ensureDatabaseSeeded();
      restaurants = await prisma.restaurant.findMany({
        where: { isApproved: true, isSuspended: false, deletedAt: null },
        select: { slug: true, name: true, cuisineType: true, logo: true },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
    }

    res.json({ success: true, data: { restaurants: restaurants || [] } });
  } catch (error) {
    try {
      await ensureDatabaseSeeded();
      const restaurants = await prisma.restaurant.findMany({
        where: { isApproved: true, isSuspended: false, deletedAt: null },
        select: { slug: true, name: true, cuisineType: true, logo: true },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      res.json({ success: true, data: { restaurants: restaurants || [] } });
    } catch (retryErr) {
      next(retryErr);
    }
  }
}

export async function getRestaurantMenu(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const restaurantSlug = req.params.restaurantSlug as string;
    const cacheKey = `menu:${restaurantSlug}`;

    // Try cache first (TTL 5 minutes)
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, fromCache: true });
      return;
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        slug: restaurantSlug,
        deletedAt: null,
        isApproved: true,
        isSuspended: false,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        cuisineType: true,
        logo: true,
        banner: true,
        address: true,
        city: true,
        phone: true,
        operatingHours: true,
        isOpen: true,
        hasDelivery: true,
        minOrderValue: true,
        deliveryRadius: true,
        themeColor: true,
        menuTemplate: true,
        customFields: true,
        paymentQrCode: true,
        paymentUpiId: true,
        paymentPhone: true,
        bankName: true,
        bankAccountNumber: true,
        bankIfsc: true,
        bankAccountHolder: true,
        // New: UPI Intent payment settings
        paymentEnabled: true,
        upiEnabled: true,
        merchantName: true,
        featureFlags: true,
        platformType: true,
      },
    });

    if (!restaurant) {
      await ensureDatabaseSeeded();
      const retrySlug = restaurantSlug.toLowerCase();
      const retryRestaurant = await prisma.restaurant.findFirst({
        where: {
          slug: retrySlug,
          deletedAt: null,
          isApproved: true,
          isSuspended: false,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          cuisineType: true,
          logo: true,
          banner: true,
          address: true,
          city: true,
          phone: true,
          operatingHours: true,
          isOpen: true,
          hasDelivery: true,
          minOrderValue: true,
          deliveryRadius: true,
          themeColor: true,
          menuTemplate: true,
          customFields: true,
          paymentQrCode: true,
          paymentUpiId: true,
          paymentPhone: true,
          bankName: true,
          bankAccountNumber: true,
          bankIfsc: true,
          bankAccountHolder: true,
          // New: UPI Intent payment settings
          paymentEnabled: true,
          upiEnabled: true,
          merchantName: true,
          featureFlags: true,
          platformType: true,
        },
      });

      if (!retryRestaurant) {
        throw new AppError(
          'Restaurant not found or not yet approved.',
          404,
          'RESTAURANT_NOT_FOUND'
        );
      }
      
      const categories = await prisma.menuCategory.findMany({
        where: { restaurantId: retryRestaurant.id },
        orderBy: { sortOrder: 'asc' },
        include: {
          parent: { select: { id: true, name: true } },
          subcategories: { select: { id: true, name: true } },
          items: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            include: { variants: true, addOns: true },
          },
        },
      });

      const data = { restaurant: retryRestaurant, categories };
      await cacheSet(cacheKey, data, 300);
      res.json({ success: true, data });
      return;
    }

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        parent: { select: { id: true, name: true } },
        subcategories: { select: { id: true, name: true } },
        items: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            variants: true,
            addOns: true,
          },
        },
      },
    });

    const data = { restaurant, categories };

    // Cache for 5 minutes
    await cacheSet(cacheKey, data, 300);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// POST /menu/:restaurantSlug/call-waiter (public — no auth required)
export async function callWaiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const restaurantSlug = req.params.restaurantSlug as string;
    const {
      tableNumber,
      tableToken,
      type = 'default',
      amount,
      paymentMethod,
      itemsSummary,
      purpose,
      customNote,
    } = req.body as {
      tableNumber?: string;
      tableToken?: string;
      type?: 'default' | 'payment' | 'addons';
      amount?: number;
      paymentMethod?: string;
      itemsSummary?: string;
      purpose?: string;
      customNote?: string;
    };

    if (!tableNumber || typeof tableNumber !== 'string' || tableNumber.trim() === '') {
      throw new AppError('tableNumber is required', 400, 'VALIDATION_ERROR');
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        slug: restaurantSlug,
        deletedAt: null,
        isApproved: true,
        isSuspended: false,
      },
      select: { id: true, name: true, ownerId: true, featureFlags: true, platformType: true },
    });

    if (!restaurant) {
      throw new AppError('Restaurant not found', 404, 'RESTAURANT_NOT_FOUND');
    }

    const flags = (restaurant.featureFlags as Record<string, boolean> | null) || {};

    const cleanTable = tableNumber.trim();
    const isExplicitRoom = cleanTable.toLowerCase().includes('room') || cleanTable.toLowerCase().includes('suite');
    const isRoom = restaurant.platformType === 'HOTEL' ? true : restaurant.platformType === 'RESTAURANT' ? false : isExplicitRoom;

    if (isRoom) {
      if (restaurant.platformType === 'RESTAURANT' || flags.roomServiceEnabled === false || flags.roomQrEnabled === false) {
        throw new AppError('Hotel room service is currently disabled for this restaurant by administration.', 403, 'ROOM_SERVICE_DISABLED');
      }
    } else {
      if (restaurant.platformType === 'HOTEL' || flags.callWaiterEnabled === false || flags.tableQrEnabled === false) {
        throw new AppError('Waiter call service is currently disabled for this restaurant by administration.', 403, 'CALL_WAITER_DISABLED');
      }
    }

    // Verify cryptographic signature of the table number ONLY if ENFORCE_TABLE_SIGNATURE is explicitly set to true
    const enforceWaiterSignature = process.env.ENFORCE_TABLE_SIGNATURE === 'true';
    if (enforceWaiterSignature) {
      if (!tableToken || (!verifyTableSignature(restaurant.id, cleanTable, tableToken) && !verifyTableSignature(restaurantSlug, cleanTable, tableToken))) {
        throw new AppError('Calling a waiter requires scanning a valid table QR code.', 403, 'INVALID_TABLE_TOKEN');
      }
    }
    const label = isRoom ? (cleanTable.toLowerCase().startsWith('room') ? cleanTable : `Room ${cleanTable}`) : (cleanTable.toLowerCase().startsWith('table') ? cleanTable : `Table ${cleanTable}`);
    const notifTitle = isRoom
      ? `🛎️ Room Service - ${label}${purpose ? ` (${purpose})` : ''}`
      : `🔔 Waiter Call - ${label}${purpose ? ` (${purpose})` : ''}`;

    let notifMessage = `${label} requested assistance.`;
    if (purpose && customNote) {
      notifMessage = `${purpose} requested for ${label}: "${customNote}"`;
    } else if (purpose) {
      notifMessage = `${purpose} requested for ${label}.`;
    } else if (customNote) {
      notifMessage = `Customer at ${label} noted: "${customNote}"`;
    }

    // Emit real-time waiter call to the restaurant owner's socket room
    emitWaiterCall(
      restaurant.id,
      cleanTable,
      type,
      amount,
      paymentMethod,
      itemsSummary,
      purpose,
      customNote,
      restaurant.ownerId
    );

    // Create persistent notification in database so restaurant owner sees it in dashboard
    await prisma.notification.create({
      data: {
        restaurantId: restaurant.id,
        userId: restaurant.ownerId,
        type: 'WAITER_CALL',
        title: notifTitle,
        message: notifMessage,
      },
    }).catch((err) => logger.warn('Failed to create waiter call notification in DB:', err));

    res.json({
      success: true,
      message: isRoom
        ? `Room service requested for ${label}${purpose ? ` (${purpose})` : ''}`
        : `Waiter called for ${label}${purpose ? ` (${purpose})` : ''}`,
    });
  } catch (error) {
    next(error);
  }
}

