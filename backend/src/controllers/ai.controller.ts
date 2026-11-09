import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import {
  getAIRecommendations,
  getAIChatResponse,
  ChatMessage as GeminiChatMessage,
  getSmartCouponSuggestion,
  getAIDemandForecast,
} from '../services/ai.gemini.service';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { cacheGet, cacheSet } from '../services/redis.service';

// ── 1. Product Recommendations ────────────────────────────────

export async function getRecommendations(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    const { restaurantId } = req.body as { restaurantId: string };

    if (!restaurantId) throw new AppError('restaurantId is required', 400, 'MISSING_PARAMS');

    const cacheKey = `ai:recommend:${userId ?? 'guest'}:${restaurantId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json({ success: true, data: { recommendations: cached }, fromCache: true });
      return;
    }

    // Get customer order history if logged in
    const orderHistory = userId
      ? await prisma.orderItem.groupBy({
          by: ['menuItemId'],
          where: { order: { userId } },
          _count: { menuItemId: true },
          orderBy: { _count: { menuItemId: 'desc' } },
          take: 10,
        })
      : [];

    const menuItemIds = orderHistory.map((o) => o.menuItemId);
    const menuItems = menuItemIds.length > 0
      ? await prisma.menuItem.findMany({
          where: { id: { in: menuItemIds } },
          select: { id: true, name: true },
        })
      : [];

    const customerOrderHistory = orderHistory.map((o) => ({
      itemName: menuItems.find((m) => m.id === o.menuItemId)?.name ?? 'Unknown',
      count: o._count.menuItemId,
    }));

    // Get favorites if logged in
    const favorites = userId
      ? await prisma.favoriteItem.findMany({
          where: { userId },
          include: { menuItem: { select: { name: true } } },
        })
      : [];

    // Get available menu items for this restaurant
    const availableMenu = await prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true, deletedAt: null },
      select: { id: true, name: true, price: true, isVeg: true, category: { select: { name: true } } },
    });

    const recommendations = await getAIRecommendations({
      customerOrderHistory,
      favoriteItems: favorites.map((f) => f.menuItem.name),
      availableMenuItems: availableMenu.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category.name,
        price: m.price,
        isVeg: m.isVeg,
      })),
    });

    // Fetch full menu item data for recommended items
    const recommendedMenuItems = await prisma.menuItem.findMany({
      where: { id: { in: recommendations.map((r) => r.menuItemId) } },
      include: { variants: true },
    });

    const result = recommendations.map((r) => ({
      ...r,
      menuItem: recommendedMenuItems.find((m) => m.id === r.menuItemId),
    }));

    // Cache for 30 minutes
    await cacheSet(cacheKey, result, 1800);

    // Save to DB for history if logged in
    if (userId) {
      await prisma.aiRecommendation.create({
        data: {
          userId,
          restaurantId,
          recommendedItems: result,
        },
      });
    }

    res.json({ success: true, data: { recommendations: result } });
  } catch (error) {
    next(error);
  }
}

// ── 2. AI Chatbot ─────────────────────────────────────────────

export async function chatWithBot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { restaurantId, message, sessionId } = req.body as {
      restaurantId: string;
      message: string;
      sessionId: string;
    };

    if (!restaurantId || !message || !sessionId) {
      throw new AppError('restaurantId, message, and sessionId are required', 400, 'MISSING_PARAMS');
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId, isApproved: true },
      select: { name: true },
    });

    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    // Build menu context
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true, deletedAt: null },
      include: { category: { select: { name: true } }, variants: true },
      take: 100,
    });

    const menuContext = menuItems
      .map(
        (item) =>
          `- ${item.name} | ${item.category.name} | ₹${item.price} | ${item.isVeg ? 'Veg' : 'Non-Veg'}${item.isVegan ? '/Vegan' : ''}`
      )
      .join('\n');

    // Get conversation history from DB
    const conversationHistory = await prisma.chatMessage.findMany({
      where: { sessionId, restaurantId },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    const geminiHistory: GeminiChatMessage[] = conversationHistory.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));

    const response = await getAIChatResponse({
      restaurantName: restaurant.name,
      menuContext,
      conversationHistory: geminiHistory,
      userMessage: message,
    });

    // Extract matched menu items for structured interactive cards
    const matchedMenuItems = menuItems.filter((item) => {
      const nameLower = item.name.toLowerCase();
      const respLower = response.toLowerCase();
      const msgLower = message.toLowerCase();
      return respLower.includes(nameLower) || (nameLower.length > 3 && msgLower.includes(nameLower));
    }).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category?.name,
      isVeg: item.isVeg,
      isVegan: item.isVegan,
      image: item.image,
      description: item.description,
    })).slice(0, 6);

    // Save messages to DB
    await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          sessionId,
          userId: req.user?.id,
          restaurantId,
          role: 'USER',
          content: message,
        },
      }),
      prisma.chatMessage.create({
        data: {
          sessionId,
          userId: req.user?.id,
          restaurantId,
          role: 'ASSISTANT',
          content: response,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        reply: response,
        suggestedItems: matchedMenuItems,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ── 3. Smart Coupon Suggestion ─────────────────────────────────

export async function getCouponSuggestion(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { restaurantSlug, cartItems, cartTotal } = _req.body as {
      restaurantSlug: string;
      cartItems: Array<{ name: string; quantity: number; price: number }>;
      cartTotal: number;
    };

    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: restaurantSlug },
      select: { id: true },
    });

    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [{ restaurantId: restaurant.id }, { restaurantId: null }],
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          }
        ]
      },
      select: {
        code: true,
        type: true,
        value: true,
        minOrderAmount: true,
        maxDiscount: true,
        maxUses: true,
        usedCount: true,
      },
    });

    // Exclude coupons that have reached their usage limit from AI suggestion
    const activeCoupons = coupons.filter(
      (c) => c.maxUses === null || c.usedCount < c.maxUses
    );

    const suggestion = await getSmartCouponSuggestion({
      cartItems,
      cartTotal,
      availableCoupons: activeCoupons.map((c) => ({
        ...c,
        type: c.type as 'FLAT' | 'PERCENT',
      })),
    });

    res.json({
      success: true,
      data: {
        suggestion,
        coupons: coupons.map((c) => ({
          code: c.code,
          type: c.type,
          value: c.value,
          minOrderAmount: c.minOrderAmount,
          maxDiscount: c.maxDiscount,
          maxUses: c.maxUses,
          usedCount: c.usedCount,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ── 4. AI Demand Forecast ──────────────────────────────────────

export async function getDemandForecast(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const restaurantId = req.params.restaurantId as string;

    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId },
      select: { name: true, ownerId: true },
    });

    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    if (req.user!.role === 'RESTAURANT_OWNER' && restaurant.ownerId !== req.user!.id) {
      throw new AppError('Access denied.', 403, 'ACCESS_DENIED');
    }

    const cacheKey = `ai:forecast:${restaurantId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, fromCache: true });
      return;
    }

    // Get last 30 days of order data
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ordersRaw = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: thirtyDaysAgo },
        status: { not: 'CANCELLED' },
      },
      select: { createdAt: true, total: true },
    });

    // Group by date
    const ordersByDate = new Map<string, { totalOrders: number; totalRevenue: number; hours: number[] }>();
    for (const order of ordersRaw) {
      const date = order.createdAt.toISOString().split('T')[0] ?? '';
      const hour = order.createdAt.getHours();
      const existing = ordersByDate.get(date) ?? { totalOrders: 0, totalRevenue: 0, hours: [] };
      existing.totalOrders++;
      existing.totalRevenue += order.total;
      existing.hours.push(hour);
      ordersByDate.set(date, existing);
    }

    const last30DaysOrders = Array.from(ordersByDate.entries()).map(([date, data]) => ({
      date,
      totalOrders: data.totalOrders,
      totalRevenue: data.totalRevenue,
      peakHour: data.hours.sort(
        (a, b) =>
          data.hours.filter((h) => h === b).length - data.hours.filter((h) => h === a).length
      )[0] ?? 12,
    }));

    // Top items this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const topItemsRaw = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: { restaurantId, createdAt: { gte: thisMonth }, status: { not: 'CANCELLED' }, paymentStatus: 'PAID' },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    });

    const topItemIds = topItemsRaw.map((t) => t.menuItemId);
    const topItems = await prisma.menuItem.findMany({
      where: { id: { in: topItemIds } },
      select: { id: true, name: true },
    });

    const topItemsThisMonth = topItemsRaw.map((t) => ({
      name: topItems.find((i) => i.id === t.menuItemId)?.name ?? 'Unknown',
      totalQuantity: t._sum?.quantity ?? 0,
      totalRevenue: t._sum?.subtotal ?? 0,
    }));

    const currentMonthRevenue = await prisma.order.aggregate({
      where: { restaurantId, createdAt: { gte: thisMonth }, status: { not: 'CANCELLED' }, paymentStatus: 'PAID' },
      _sum: { total: true },
    });

    const forecast = await getAIDemandForecast({
      restaurantName: restaurant.name,
      last30DaysOrders,
      topItemsThisMonth,
      currentMonthRevenue: currentMonthRevenue._sum?.total ?? 0,
    });

    // Cache for 6 hours
    await cacheSet(cacheKey, forecast, 6 * 60 * 60);

    res.json({ success: true, data: forecast });
  } catch (error) {
    next(error);
  }
}
