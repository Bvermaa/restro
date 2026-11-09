import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { cacheGet, cacheSet, cacheDelPattern } from '../services/redis.service';
import { emitNotification } from '../services/socket.service';
import {
  sendBroadcastEmail,
  sendRestaurantWelcomeEmail,
  sendRestaurantApprovalEmail,
  sendCredentialsUpdatedEmail,
} from '../services/email.service';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { logger } from '../utils/logger';

export async function getAllRestaurants(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, page = '1', limit = '20', search } = req.query as {
      status?: string; page?: string; limit?: string; search?: string;
    };

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
    const skip = (pageNum - 1) * limitNum;
    const where: Record<string, unknown> = {
      deletedAt: null,
      owner: {
        deletedAt: null,
        NOT: { email: { startsWith: 'deleted_' } },
      },
    };

    if (status === 'pending') { where.isApproved = false; where.isSuspended = false; }
    else if (status === 'approved') { where.isApproved = true; where.isSuspended = false; }
    else if (status === 'suspended') { where.isSuspended = true; }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const cleanSearch = search.trim();
      where.OR = [
        { name: { contains: cleanSearch, mode: 'insensitive' } },
        { slug: { contains: cleanSearch, mode: 'insensitive' } },
        { city: { contains: cleanSearch, mode: 'insensitive' } },
      ];
    }

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true, phone: true } },
          subscription: {
            where: { isActive: true },
            include: { plan: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { orders: true, menuItems: true } },
        },
      }),
      prisma.restaurant.count({ where }),
    ]);

    const formattedRestaurants = restaurants.map((r) => ({
      ...r,
      subscription: r.subscription && r.subscription.length > 0 ? r.subscription[0] : null,
      owner: r.owner
        ? {
            ...r.owner,
            email: r.owner.email && r.owner.email.includes(':') ? r.owner.email.split(':')[1] : (r.owner.email ?? ''),
          }
        : null,
    }));

    res.json({
      success: true,
      data: { restaurants: formattedRestaurants },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) { next(error); }
}

export async function approveRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const body = (req.body || {}) as { isApproved?: boolean };

    const restaurant = await prisma.restaurant.findFirst({
      where: { id, deletedAt: null },
      include: { owner: true },
    });
    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    const isApproved = typeof body.isApproved === 'boolean' ? body.isApproved : !restaurant.isApproved;

    const updated = await prisma.restaurant.update({
      where: { id },
      data: { isApproved },
    });

    // Notify restaurant owner
    await prisma.notification.create({
      data: {
        restaurantId: id,
        type: 'RESTAURANT_APPROVED',
        title: isApproved ? 'Restaurant Approved!' : 'Restaurant Approval Revoked',
        message: isApproved
          ? 'Congratulations! Your restaurant has been approved. You can now start accepting orders.'
          : 'Your restaurant approval has been revoked. Please contact support.',
      },
    });

    // Send email notification to restaurant owner
    if (restaurant.owner?.email) {
      sendRestaurantApprovalEmail(
        restaurant.owner.email,
        restaurant.owner.name,
        restaurant.name,
        isApproved,
        restaurant.slug
      ).catch((err) => {
        logger.error(`Failed to send restaurant approval email to ${restaurant.owner?.email}:`, err);
      });
    }

    res.json({ success: true, data: { isApproved: updated.isApproved }, message: `Restaurant ${isApproved ? 'approved' : 'approval revoked'}` });
  } catch (error) { next(error); }
}

export async function updateRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const {
      name, slug, phone, email, address, city, isApproved, isSuspended, isOpen,
      ownerEmail, ownerPassword, commissionRate, featureFlags, disabledTabs,
      paymentEnabled, upiEnabled, merchantName, platformType, maxLogins,
    } = req.body;

    const existing = await prisma.restaurant.findFirst({
      where: { id, deletedAt: null },
      include: { owner: true },
    });
    if (!existing) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    if (slug && slug !== existing.slug) {
      const slugConflict = await prisma.restaurant.findFirst({ where: { slug, id: { not: id } } });
      if (slugConflict) throw new AppError('Slug is already taken by another restaurant.', 400, 'SLUG_TAKEN');
    }

    const parsedMaxLogins = maxLogins !== undefined ? Math.max(1, parseInt(String(maxLogins), 10) || 1) : undefined;

    const updated = await prisma.restaurant.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(typeof isApproved === 'boolean' && { isApproved }),
        ...(typeof isSuspended === 'boolean' && { isSuspended }),
        ...(typeof isOpen === 'boolean' && { isOpen }),
        ...(commissionRate !== undefined && { commissionRate: parseFloat(commissionRate) }),
        ...(platformType !== undefined && { platformType: String(platformType) }),
        ...(parsedMaxLogins !== undefined && { maxLogins: parsedMaxLogins }),
        ...(() => {
          if (featureFlags !== undefined) {
            return {
              featureFlags: {
                ...((existing.featureFlags as Record<string, boolean>) || {}),
                ...featureFlags,
                tableQrEnabled: featureFlags.callWaiterEnabled !== undefined ? featureFlags.callWaiterEnabled : (featureFlags.tableQrEnabled !== undefined ? featureFlags.tableQrEnabled : true),
                roomQrEnabled: featureFlags.roomServiceEnabled !== undefined ? featureFlags.roomServiceEnabled : (featureFlags.roomQrEnabled !== undefined ? featureFlags.roomQrEnabled : true),
              },
            };
          } else if (platformType !== undefined) {
            const isDual = platformType === 'DUAL';
            const isHotel = platformType === 'HOTEL';
            return {
              featureFlags: {
                ...((existing.featureFlags as Record<string, boolean>) || {}),
                roomServiceEnabled: isDual || isHotel,
                callWaiterEnabled: isDual || !isHotel,
                tableQrEnabled: isDual || !isHotel,
                roomQrEnabled: isDual || isHotel,
              },
            };
          }
          return {};
        })(),
        ...(disabledTabs !== undefined && { disabledTabs }),
        ...(typeof paymentEnabled === 'boolean' && { paymentEnabled }),
        ...(typeof upiEnabled === 'boolean' && { upiEnabled }),
        ...(merchantName !== undefined && { merchantName }),
      },
      include: { owner: true },
    });

    if (slug !== existing.slug || featureFlags !== undefined || platformType !== undefined) {
      await cacheDelPattern(`menu:${existing.slug}*`);
    }

    // Handle Owner Account Credentials Update
    if (existing.ownerId && existing.owner) {
      let emailUpdated = false;
      let passwordUpdated = false;
      let normalizedOwnerEmail: string | undefined = undefined;

      if (ownerEmail && typeof ownerEmail === 'string' && ownerEmail.trim().length > 0) {
        const cleanEmail = ownerEmail.trim().toLowerCase();
        const currentOwnerEmail = existing.owner.email.includes(':')
          ? existing.owner.email.split(':')[1].trim().toLowerCase()
          : existing.owner.email.trim().toLowerCase();

        if (cleanEmail !== currentOwnerEmail) {
          const emailConflict = await prisma.user.findFirst({
            where: {
              OR: [
                { email: cleanEmail },
                { email: { endsWith: `:${cleanEmail}` } },
              ],
              id: { not: existing.ownerId },
            },
          });
          if (emailConflict) {
            throw new AppError('The specified owner email is already in use by another user account.', 400, 'EMAIL_EXISTS');
          }
          normalizedOwnerEmail = cleanEmail;
          emailUpdated = true;
        }
      }

      let passwordHash: string | undefined = undefined;
      if (ownerPassword && typeof ownerPassword === 'string' && ownerPassword.trim().length > 0) {
        passwordHash = await bcrypt.hash(ownerPassword.trim(), 12);
        passwordUpdated = true;
      }

      if (emailUpdated || passwordUpdated) {
        await prisma.user.update({
          where: { id: existing.ownerId },
          data: {
            ...(emailUpdated && normalizedOwnerEmail && { email: normalizedOwnerEmail }),
            ...(passwordUpdated && passwordHash && { passwordHash }),
          },
        });

        const targetEmail = normalizedOwnerEmail || existing.owner.email;
        sendCredentialsUpdatedEmail(
          targetEmail,
          existing.owner.name,
          updated.name,
          {
            emailUpdated,
            newEmail: emailUpdated ? normalizedOwnerEmail : undefined,
            passwordUpdated,
            newPassword: passwordUpdated ? ownerPassword.trim() : undefined,
          }
        ).catch((err) => {
          logger.error(`Failed to send credentials update email to ${targetEmail}:`, err);
        });
      }

      if (parsedMaxLogins !== undefined) {
        await prisma.user.update({
          where: { id: existing.ownerId },
          data: { maxLogins: parsedMaxLogins } as any,
        }).catch(() => {});
      }
    }

    res.json({ success: true, data: { restaurant: updated }, message: 'Restaurant details and owner credentials updated successfully' });
  } catch (error) { next(error); }
}


export async function suspendRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const body = (req.body || {}) as { isSuspended?: boolean };

    const restaurant = await prisma.restaurant.findFirst({ where: { id, deletedAt: null } });
    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    const isSuspended = typeof body.isSuspended === 'boolean' ? body.isSuspended : !restaurant.isSuspended;

    const updated = await prisma.restaurant.update({
      where: { id },
      data: { isSuspended, ...(isSuspended && { isOpen: false }) },
    });

    // Also update connected owner user suspension status (keep deletedAt null so user stays visible as Suspended)
    if (restaurant.ownerId) {
      await prisma.user.update({
        where: { id: restaurant.ownerId },
        data: { verifyToken: isSuspended ? 'SUSPENDED' : null, deletedAt: null },
      }).catch((err) => logger.warn('Failed to update owner user suspension:', err));
    }

    res.json({ success: true, data: { isSuspended: updated.isSuspended }, message: `Restaurant ${isSuspended ? 'suspended' : 'reactivated'}` });
  } catch (error) { next(error); }
}

export async function getAllUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, page = '1', limit = '15', search } = req.query as {
      role?: string; page?: string; limit?: string; search?: string;
    };

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, parseInt(String(limit), 10) || 15);
    const skip = (pageNum - 1) * limitNum;
    const where: Record<string, unknown> = { deletedAt: null };

    if (role && role !== 'all') {
      where.role = role;
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const cleanSearch = search.trim();
      where.OR = [
        { name: { contains: cleanSearch, mode: 'insensitive' } },
        { email: { contains: cleanSearch, mode: 'insensitive' } },
        { phone: { contains: cleanSearch } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          isVerified: true, verifyToken: true, loyaltyPoints: true, walletBalance: true,
          createdAt: true, deletedAt: true,
          restaurant: {
            select: { id: true, name: true, slug: true, isSuspended: true, deletedAt: true },
          },
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const mappedUsers = users.map((u) => {
      const isRestArray = Array.isArray(u.restaurant);
      const activeRest = isRestArray
        ? u.restaurant.find((r) => r.deletedAt === null) || u.restaurant[0]
        : (u.restaurant as any);
      const isAnyRestSuspended = isRestArray
        ? u.restaurant.some((r) => r.isSuspended)
        : Boolean((u.restaurant as any)?.isSuspended);
      return {
        ...u,
        isSuspended: Boolean(isAnyRestSuspended) || u.verifyToken === 'SUSPENDED',
        restaurantName: activeRest?.name ?? null,
        restaurantSlug: activeRest?.slug ?? null,
        restaurantId: activeRest?.id ?? null,
        email: u.email && u.email.includes(':') ? u.email.split(':')[1] : (u.email ?? ''),
      };
    });

    res.json({
      success: true,
      data: { users: mappedUsers },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) { next(error); }
}

export async function suspendUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const body = (req.body || {}) as { suspend?: boolean };
    const { suspend } = body;

    if (id === req.user!.id) throw new AppError('You cannot suspend your own account.', 400, 'CANNOT_SELF_SUSPEND');

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

    if (user.role === 'SUPER_ADMIN') {
      throw new AppError('Super Admin accounts cannot be suspended.', 400, 'CANNOT_SUSPEND_SUPER_ADMIN');
    }

    const rest = await prisma.restaurant.findFirst({ where: { ownerId: id, deletedAt: null } });
    const isCurrentlySuspended = Boolean(rest?.isSuspended) || user.verifyToken === 'SUSPENDED';
    const shouldSuspend = typeof suspend === 'boolean' ? suspend : !isCurrentlySuspended;

    await prisma.user.update({
      where: { id },
      data: { verifyToken: shouldSuspend ? 'SUSPENDED' : null },
    });

    if (user.role === 'RESTAURANT_OWNER') {
      await prisma.restaurant.updateMany({
        where: { ownerId: id },
        data: { isSuspended: shouldSuspend, ...(shouldSuspend && { isOpen: false }) },
      });
    }

    res.json({ success: true, data: { id, isSuspended: shouldSuspend }, message: `User ${shouldSuspend ? 'suspended' : 'reactivated'} successfully` });
  } catch (error) { next(error); }
}

export async function deleteUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    if (id === req.user!.id) throw new AppError('You cannot delete your own account.', 400, 'CANNOT_SELF_DELETE');

    const user = await prisma.user.findFirst({ where: { id } });
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

    const timestamp = Date.now();
    await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        email: `deleted_${timestamp}_${user.email}`,
        googleId: user.googleId ? `deleted_${timestamp}_${user.googleId}` : null,
      },
    });

    // Also soft-delete and suspend any restaurant owned by this user
    await prisma.restaurant.updateMany({
      where: { ownerId: id },
      data: { deletedAt: new Date(), isApproved: false, isSuspended: true, isOpen: false },
    });

    res.json({ success: true, message: `User ${user.name} deleted successfully.` });
  } catch (error) { next(error); }
}

export async function getGlobalAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { period = '7d' } = req.query as { period?: string };
    const days = period === '30d' ? 30 : period === 'month' ? 30 : 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalOrders, totalRevenue, totalUsers, totalRestaurants, topRestaurants, customerGrowth] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: startDate }, status: { not: 'CANCELLED' } } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startDate }, status: { not: 'CANCELLED' }, paymentStatus: 'PAID' },
        _sum: { total: true },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
      prisma.restaurant.count({ where: { deletedAt: null } }),
      prisma.order.groupBy({
        by: ['restaurantId'],
        where: { createdAt: { gte: startDate }, status: { not: 'CANCELLED' }, paymentStatus: 'PAID' },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
      prisma.$queryRaw<Array<{ date: string; count: number }>>`
        SELECT DATE("createdAt")::text as date, COUNT(id)::int as count
        FROM users
        WHERE role = 'CUSTOMER' AND "createdAt" >= ${startDate} AND "deletedAt" IS NULL
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);

    const restaurantIds = topRestaurants.map((r) => r.restaurantId);
    const restaurantNames = await prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, name: true },
    });

    // Calculate commission revenue
    const commissionData = await prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, commissionRate: true },
    });

    const topRestaurantsFormatted = topRestaurants.map((r) => {
      const revenue = r._sum.total ?? 0;
      const commission = commissionData.find((c) => c.id === r.restaurantId)?.commissionRate ?? 5;
      return {
        restaurantId: r.restaurantId,
        name: restaurantNames.find((n) => n.id === r.restaurantId)?.name ?? 'Unknown',
        totalRevenue: revenue,
        totalOrders: r._count.id,
        commissionEarned: (revenue * commission) / 100,
      };
    });

    const data = {
      summary: {
        totalOrders,
        totalRevenue: totalRevenue._sum.total ?? 0,
        platformCommission: totalRevenue._sum.total ? totalRevenue._sum.total * 0.05 : 0,
        totalUsers,
        totalRestaurants,
      },
      topRestaurants: topRestaurantsFormatted,
      customerGrowth,
    };

    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getConfig(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = {
      defaultCommissionRate: parseFloat(process.env.DEFAULT_COMMISSION_RATE ?? '5'),
      gstRate: parseFloat(process.env.GST_RATE ?? '18'),
      deliveryFee: 40,
      packagingFee: 15,
      loyaltyPointsPerRupee: 1,
      minOrderValue: 0,
    };
    res.json({ success: true, data: { config } });
  } catch (error) { next(error); }
}

export async function updateConfig(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // In a production app, persist these to a config table in DB
    // For now, acknowledge the update
    res.json({ success: true, data: req.body, message: 'Configuration updated. Note: Restart server to apply env changes.' });
  } catch (error) { next(error); }
}

// ── Free Trial Plan Constants & Helpers ─────────────────────────

export const DEFAULT_FREE_TRIAL_SETTINGS = {
  enabled: true,
  trialDays: 14,
  planName: 'Free Trial',
  features: {
    qrCodes: 10,
    maxOrders: 300,
    maxMenuItems: 50,
    aiEnabled: true,
    analyticsEnabled: true,
    roomServiceEnabled: true,
  },
};

export async function getOrCreateFreeTrialPlan(platformType: string = 'RESTAURANT') {
  const normType = String(platformType || 'RESTAURANT').toUpperCase();
  let plan = await prisma.subscriptionPlan.findFirst({
    where: {
      price: 0,
      platformType: normType,
    },
  });

  if (!plan) {
    // Fallback to any free plan
    plan = await prisma.subscriptionPlan.findFirst({
      where: { price: 0 },
    });
  }

  if (!plan) {
    const planName =
      normType === 'HOTEL'
        ? 'Free Trial (Hotel)'
        : normType === 'DUAL'
        ? 'Free Trial (Dual All-Access)'
        : 'Free Trial (Restaurant)';

    plan = await prisma.subscriptionPlan.create({
      data: {
        name: planName,
        price: 0,
        platformType: normType,
        features: {
          ...DEFAULT_FREE_TRIAL_SETTINGS.features,
          callWaiterEnabled: normType !== 'HOTEL',
          roomServiceEnabled: normType !== 'RESTAURANT',
        },
      },
    });
  }
  return plan;
}

export async function autoAssignFreeTrial(restaurantId: string, customDays?: number) {
  try {
    let settingVal = DEFAULT_FREE_TRIAL_SETTINGS;
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'free_trial_settings' },
      });
      if (setting?.value) {
        settingVal = { ...DEFAULT_FREE_TRIAL_SETTINGS, ...(setting.value as object) };
      }
    } catch (e) {}

    if (settingVal.enabled === false) {
      return null;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { platformType: true, featureFlags: true },
    }).catch(() => null);

    const platformType = restaurant?.platformType || 'RESTAURANT';
    const freePlan = await getOrCreateFreeTrialPlan(platformType);
    const days = customDays || settingVal.trialDays || 14;
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);

    // Deactivate previous active subscriptions for this restaurant
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId, isActive: true },
      data: { isActive: false },
    });

    const subscription = await prisma.restaurantSubscription.create({
      data: {
        restaurantId,
        planId: freePlan.id,
        startsAt,
        expiresAt,
        isActive: true,
        amount: 0,
        paymentStatus: 'FREE_TRIAL',
        paymentMethod: 'FREE_TRIAL',
      },
      include: { plan: true },
    });

    const planPlatformType = (freePlan as any).platformType || 'RESTAURANT';
    const currentFlags = (restaurant?.featureFlags as Record<string, boolean>) || {};
    const featureFlagsUpdate: any = { ...currentFlags };
    if (planPlatformType === 'DUAL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (planPlatformType === 'HOTEL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = false;
      featureFlagsUpdate.tableQrEnabled = false;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (planPlatformType === 'RESTAURANT') {
      featureFlagsUpdate.roomServiceEnabled = false;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = false;
    }

    // Make sure restaurant is activated and open with correct platformType & flags
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        isSuspended: false,
        isOpen: true,
        platformType: planPlatformType,
        featureFlags: featureFlagsUpdate,
      } as any,
    });

    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'FREE_TRIAL_ACTIVATED',
        title: `🎁 ${freePlan.name} Activated (${days} Days)`,
        message: `Welcome to EZ-Restaurant! Your ${days}-day free trial is active until ${expiresAt.toLocaleDateString()}. Enjoy all platform features!`,
      },
    }).catch(() => {});

    return subscription;
  } catch (error) {
    logger.error(`Failed to auto-assign free trial to restaurant ${restaurantId}:`, error);
    return null;
  }
}

export async function getSubscriptionPlans(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Ensure the Free Trial plan exists
    await getOrCreateFreeTrialPlan().catch(() => {});

    const [plans, subscriptions, freeTrialSettingDb] = await Promise.all([
      prisma.subscriptionPlan.findMany({
        orderBy: { price: 'asc' },
        include: {
          _count: { select: { subscriptions: true } },
        },
      }),
      prisma.restaurantSubscription.findMany({
        where: {
          restaurant: {
            deletedAt: null,
            owner: {
              deletedAt: null,
              NOT: {
                email: { startsWith: 'deleted_' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          plan: true,
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              phone: true,
              isSuspended: true,
              deletedAt: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  deletedAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.systemSetting.findUnique({
        where: { key: 'free_trial_settings' },
      }).catch(() => null),
    ]);

    const freeTrialSettings = freeTrialSettingDb?.value
      ? { ...DEFAULT_FREE_TRIAL_SETTINGS, ...(freeTrialSettingDb.value as object) }
      : DEFAULT_FREE_TRIAL_SETTINGS;

    res.json({
      success: true,
      data: {
        plans,
        subscriptions,
        freeTrialSettings,
      },
    });
  } catch (error) { next(error); }
}

export async function createSubscriptionPlan(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, price, platformType = 'RESTAURANT', features } = req.body as { name: string; price: number; platformType?: string; features: Record<string, unknown> };
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        price: parseFloat(String(price)),
        platformType: String(platformType || 'RESTAURANT'),
        features: features as any,
      } as any,
    });
    res.status(201).json({ success: true, data: { plan }, message: 'Subscription plan created' });
  } catch (error) { next(error); }
}

export async function updateSubscriptionPlan(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const { name, price, platformType, features } = req.body;
    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(platformType !== undefined && { platformType: String(platformType) }),
        ...(features !== undefined && { features }),
      } as any,
    });
    res.json({ success: true, data: { plan }, message: 'Subscription plan updated successfully' });
  } catch (error) { next(error); }
}

export async function deleteSubscriptionPlan(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const activeSubCount = await prisma.restaurantSubscription.count({
      where: { planId: id, isActive: true },
    });
    if (activeSubCount > 0) {
      throw new AppError(`Cannot delete plan: ${activeSubCount} active restaurant subscriptions are currently using it.`, 400, 'PLAN_IN_USE');
    }
    await prisma.subscriptionPlan.delete({ where: { id } });
    res.json({ success: true, message: 'Subscription plan deleted successfully' });
  } catch (error) { next(error); }
}

export async function getRestaurantDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const restaurant = await prisma.restaurant.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
        },
        subscription: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            orders: true,
            menuItems: true,
            categories: true,
            kitchenStaff: true,
            reviews: true,
            coupons: true,
          },
        },
      },
    });

    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    const [revenueAgg, orderCounts, recentOrders] = await Promise.all([
      prisma.order.aggregate({
        where: { restaurantId: id, status: { not: 'CANCELLED' }, paymentStatus: 'PAID', deletedAt: null },
        _sum: { total: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { restaurantId: id, deletedAt: null },
        _count: { id: true },
      }),
      prisma.order.findMany({
        where: { restaurantId: id, deletedAt: null },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tableNumber: true,
          guestName: true,
          total: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
    ]);

    const activeSubscription = restaurant.subscription.find((s) => s.isActive) || null;

    let activeSessionsCount = 0;
    try {
      if (restaurant.ownerId) {
        activeSessionsCount = await (prisma as any).activeSession.count({
          where: { userId: restaurant.ownerId },
        });
      }
    } catch (e) {}

    const formattedOwner = restaurant.owner
      ? {
          ...restaurant.owner,
          email: restaurant.owner.email && restaurant.owner.email.includes(':') ? restaurant.owner.email.split(':')[1] : (restaurant.owner.email ?? ''),
          maxLogins: (restaurant.owner as any).maxLogins || (restaurant as any).maxLogins || 1,
        }
      : null;

    res.json({
      success: true,
      data: {
        restaurant: {
          ...restaurant,
          owner: formattedOwner,
          activeSubscription,
          activeSessionsCount,
        },
        stats: {
          totalRevenue: revenueAgg._sum.total ?? 0,
          ordersByStatus: orderCounts.reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count.id }), {}),
        },
        recentOrders,
      },
    });
  } catch (error) { next(error); }
}

export async function terminateRestaurantSessions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const restaurant = await prisma.restaurant.findFirst({ where: { id, deletedAt: null } });
    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    if (restaurant.ownerId) {
      await (prisma as any).activeSession.deleteMany({
        where: { userId: restaurant.ownerId },
      });
    }

    res.json({
      success: true,
      message: 'All active login sessions for this account have been successfully terminated.',
    });
  } catch (error) { next(error); }
}

export async function updateRestaurantFeatures(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const { featureFlags } = req.body;

    const restaurant = await prisma.restaurant.findFirst({ where: { id, deletedAt: null } });
    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    const currentFlags = (restaurant.featureFlags as Record<string, boolean>) || {};
    const updatedFlags = {
      ...currentFlags,
      ...featureFlags,
      tableQrEnabled: featureFlags.callWaiterEnabled !== undefined ? featureFlags.callWaiterEnabled : (featureFlags.tableQrEnabled !== undefined ? featureFlags.tableQrEnabled : (currentFlags.tableQrEnabled ?? true)),
      roomQrEnabled: featureFlags.roomServiceEnabled !== undefined ? featureFlags.roomServiceEnabled : (featureFlags.roomQrEnabled !== undefined ? featureFlags.roomQrEnabled : (currentFlags.roomQrEnabled ?? true)),
    };

    const updated = await prisma.restaurant.update({
      where: { id },
      data: { featureFlags: updatedFlags },
    });

    await cacheDelPattern(`menu:${restaurant.slug}*`);

    await prisma.notification.create({
      data: {
        restaurantId: id,
        type: 'FEATURE_SETTINGS_UPDATED',
        title: 'Platform Features Updated',
        message: 'Administration has updated feature toggles for your restaurant (e.g., room service, waiter call, ordering).',
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: { featureFlags: updated.featureFlags },
      message: 'Restaurant features updated successfully',
    });
  } catch (error) { next(error); }
}

export async function updateRestaurantTabs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const { disabledTabs } = req.body;

    if (!Array.isArray(disabledTabs)) {
      throw new AppError('disabledTabs must be an array of tab identifiers.', 400, 'BAD_REQUEST');
    }

    const restaurant = await prisma.restaurant.findFirst({ where: { id, deletedAt: null } });
    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');

    const updated = await prisma.restaurant.update({
      where: { id },
      data: { disabledTabs },
    });

    await prisma.notification.create({
      data: {
        restaurantId: id,
        type: 'TABS_PERMISSIONS_UPDATED',
        title: 'Dashboard Tabs Access Updated',
        message: 'Administration has updated accessible management tabs for your restaurant.',
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: { disabledTabs: updated.disabledTabs },
      message: 'Restaurant tabs configuration updated successfully',
    });
  } catch (error) { next(error); }
}

export async function assignRestaurantSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const {
      planId,
      durationInDays = 30,
      startsAt = new Date(),
      isActive = true,
      paymentStatus = 'UNPAID', // Admin assignment is UNPAID unless payment is confirmed!
    } = req.body;

    const [restaurant, plan] = await Promise.all([
      prisma.restaurant.findFirst({ where: { id, deletedAt: null } }),
      prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
    ]);

    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');
    if (!plan) throw new AppError('Subscription plan not found.', 404, 'PLAN_NOT_FOUND');

    const startDate = new Date(startsAt);
    const expiresDate = new Date(startDate);
    expiresDate.setDate(expiresDate.getDate() + (parseInt(String(durationInDays), 10) || 30));

    const days = parseInt(String(durationInDays), 10) || 30;
    const months = days >= 360 ? Math.round(days / 365) * 12 : Math.max(1, Math.round(days / 30));
    const totalPrice = plan.price * months;

    // Deactivate previous active subscriptions
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId: id, isActive: true },
      data: { isActive: false },
    });

    const isFreeTrial = plan.price === 0 || String(paymentStatus).toUpperCase() === 'FREE_TRIAL';
    const isConfirmedPaid = String(paymentStatus).toUpperCase() === 'PAID';

    const newSub = await prisma.restaurantSubscription.create({
      data: {
        restaurantId: id,
        planId,
        startsAt: startDate,
        expiresAt: expiresDate,
        isActive: Boolean(isActive),
        amount: isFreeTrial ? 0 : totalPrice,
        paymentStatus: isFreeTrial ? 'FREE_TRIAL' : (isConfirmedPaid ? 'PAID' : 'UNPAID'),
        paymentMethod: isFreeTrial ? 'FREE_TRIAL' : 'MANUAL_ADMIN',
      },
      include: { plan: true },
    });

    if (Boolean(isActive)) {
      const planPlatformType = (plan as any).platformType || 'RESTAURANT';
      const currentFlags = (restaurant.featureFlags as Record<string, boolean>) || {};
      const featureFlagsUpdate: any = { ...currentFlags };
      if (planPlatformType === 'DUAL') {
        featureFlagsUpdate.roomServiceEnabled = true;
        featureFlagsUpdate.callWaiterEnabled = true;
        featureFlagsUpdate.tableQrEnabled = true;
        featureFlagsUpdate.roomQrEnabled = true;
      } else if (planPlatformType === 'HOTEL') {
        featureFlagsUpdate.roomServiceEnabled = true;
        featureFlagsUpdate.callWaiterEnabled = false;
        featureFlagsUpdate.tableQrEnabled = false;
        featureFlagsUpdate.roomQrEnabled = true;
      } else if (planPlatformType === 'RESTAURANT') {
        featureFlagsUpdate.roomServiceEnabled = false;
        featureFlagsUpdate.callWaiterEnabled = true;
        featureFlagsUpdate.tableQrEnabled = true;
        featureFlagsUpdate.roomQrEnabled = false;
      }

      await prisma.restaurant.update({
        where: { id },
        data: {
          isSuspended: false,
          isOpen: true,
          platformType: planPlatformType,
          featureFlags: featureFlagsUpdate,
        } as any,
      });
    }

    await prisma.notification.create({
      data: {
        restaurantId: id,
        type: 'SUBSCRIPTION_ACTIVATED',
        title: `Plan Assigned: ${plan.name} (${isFreeTrial ? 'Free Trial' : (isConfirmedPaid ? 'Paid' : 'Unpaid')})`,
        message: `Your restaurant has been assigned the "${plan.name}" plan, valid until ${expiresDate.toLocaleDateString()}. Status: ${isFreeTrial ? 'FREE TRIAL' : (isConfirmedPaid ? 'PAID' : 'UNPAID')}.`,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: { subscription: newSub },
      message: `Subscription "${plan.name}" assigned successfully to ${restaurant.name} (${isFreeTrial ? 'FREE TRIAL' : (isConfirmedPaid ? 'PAID' : 'UNPAID')})!`,
    });
  } catch (error) { next(error); }
}

export async function cancelRestaurantSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscriptionId = req.params.subscriptionId as string;
    const sub = await prisma.restaurantSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new AppError('Subscription not found.', 404, 'NOT_FOUND');

    const updated = await prisma.restaurantSubscription.update({
      where: { id: subscriptionId },
      data: { isActive: !sub.isActive },
      include: { plan: true },
    });

    // If deactivated, check if any other active subscription exists; if none, suspend the restaurant!
    if (!updated.isActive) {
      const otherActive = await prisma.restaurantSubscription.findFirst({
        where: { restaurantId: sub.restaurantId, isActive: true },
      });
      if (!otherActive) {
        await prisma.restaurant.update({
          where: { id: sub.restaurantId },
          data: { isSuspended: true, isOpen: false },
        });
      }
    } else {
      // If reactivated, unsuspend the restaurant!
      await prisma.restaurant.update({
        where: { id: sub.restaurantId },
        data: { isSuspended: false, isOpen: true },
      });
    }

    res.json({
      success: true,
      data: { subscription: updated },
      message: `Subscription ${updated.isActive ? 'reactivated' : 'deactivated'} successfully`,
    });
  } catch (error) { next(error); }
}

export async function updateSubscriptionPaymentStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const sub = await prisma.restaurantSubscription.findUnique({ where: { id } });
    if (!sub) throw new AppError('Subscription not found.', 404, 'NOT_FOUND');

    const targetStatus = req.body?.paymentStatus
      ? String(req.body.paymentStatus).toUpperCase()
      : sub.paymentStatus === 'PAID' ? 'UNPAID' : 'PAID';

    const updated = await prisma.restaurantSubscription.update({
      where: { id },
      data: { paymentStatus: targetStatus },
      include: { plan: true },
    });

    res.json({
      success: true,
      data: { subscription: updated },
      message: `Payment status marked as ${targetStatus} successfully!`,
    });
  } catch (error) { next(error); }
}

export async function deleteSubscriptionRecord(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    await prisma.restaurantSubscription.delete({ where: { id } });
    res.json({
      success: true,
      message: 'Subscription record deleted successfully',
    });
  } catch (error) { next(error); }
}

export async function assignPlanDirectly(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { restaurantId, planId, durationInDays = 30, startsAt = new Date(), isActive = true, paymentStatus = 'UNPAID' } = req.body;
    if (!restaurantId || !planId) throw new AppError('Restaurant ID and Plan ID are required.', 400, 'BAD_REQUEST');
    req.params.id = restaurantId;
    return assignRestaurantSubscription(req, res, next);
  } catch (error) { next(error); }
}

// ── Extend / Update Free Days for a Restaurant ──────────────────

export async function extendFreeSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const { additionalDays, newExpiresAt } = req.body as {
      additionalDays?: number;
      newExpiresAt?: string;
    };

    const sub = await prisma.restaurantSubscription.findUnique({
      where: { id },
      include: { restaurant: true, plan: true },
    });
    if (!sub) throw new AppError('Subscription not found.', 404, 'NOT_FOUND');

    let updatedExpiresAt: Date;
    const now = new Date();

    if (newExpiresAt) {
      updatedExpiresAt = new Date(newExpiresAt);
    } else if (additionalDays !== undefined && !isNaN(Number(additionalDays))) {
      // If currently active and unexpired, add to current expiresAt; otherwise add from now
      const baseDate = sub.expiresAt > now ? new Date(sub.expiresAt) : now;
      updatedExpiresAt = new Date(baseDate.getTime() + Number(additionalDays) * 24 * 60 * 60 * 1000);
    } else {
      throw new AppError('Please provide additionalDays (e.g. 7, 14, 30) or newExpiresAt.', 400, 'BAD_REQUEST');
    }

    const updated = await prisma.restaurantSubscription.update({
      where: { id },
      data: {
        expiresAt: updatedExpiresAt,
        isActive: true,
      },
      include: { plan: true, restaurant: true },
    });

    // Make sure restaurant is active and open
    await prisma.restaurant.update({
      where: { id: sub.restaurantId },
      data: { isSuspended: false, isOpen: true },
    });

    const daysLeft = Math.max(0, Math.ceil((updatedExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    await prisma.notification.create({
      data: {
        restaurantId: sub.restaurantId,
        type: 'FREE_TRIAL_EXTENDED',
        title: '🎉 Free Trial Days Updated!',
        message: `Admin has updated your free trial period! Your free plan is now valid until ${updatedExpiresAt.toLocaleDateString()} (${daysLeft} days remaining).`,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: { subscription: updated },
      message: `Free trial updated successfully! Now valid until ${updatedExpiresAt.toLocaleDateString()} (${daysLeft} days remaining).`,
    });
  } catch (error) { next(error); }
}

export async function approveFreeTrial(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscriptionId = req.params.subscriptionId as string;
    const sub = await prisma.restaurantSubscription.findUnique({
      where: { id: subscriptionId },
      include: { restaurant: true, plan: true },
    });
    if (!sub) throw new AppError('Subscription request not found.', 404, 'NOT_FOUND');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Exactly 30 days (1 month)

    // Deactivate previous active subscriptions
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId: sub.restaurantId, isActive: true },
      data: { isActive: false },
    });

    // Activate the free trial
    const updatedSub = await prisma.restaurantSubscription.update({
      where: { id: subscriptionId },
      data: {
        startsAt: now,
        expiresAt,
        isActive: true,
        paymentStatus: 'FREE_TRIAL',
        paymentMethod: 'FREE_TRIAL',
      },
      include: { plan: true },
    });

    const planPlatformType = (sub.plan as any).platformType || 'RESTAURANT';
    const currentFlags = (sub.restaurant.featureFlags as Record<string, boolean>) || {};
    let featureFlagsUpdate: any = { ...currentFlags };

    if (planPlatformType === 'DUAL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (planPlatformType === 'HOTEL') {
      featureFlagsUpdate.roomServiceEnabled = true;
      featureFlagsUpdate.callWaiterEnabled = false;
      featureFlagsUpdate.tableQrEnabled = false;
      featureFlagsUpdate.roomQrEnabled = true;
    } else if (planPlatformType === 'RESTAURANT') {
      featureFlagsUpdate.roomServiceEnabled = false;
      featureFlagsUpdate.callWaiterEnabled = true;
      featureFlagsUpdate.tableQrEnabled = true;
      featureFlagsUpdate.roomQrEnabled = false;
    }

    await prisma.restaurant.update({
      where: { id: sub.restaurantId },
      data: {
        isSuspended: false,
        isOpen: true,
        platformType: planPlatformType,
        featureFlags: featureFlagsUpdate,
      } as any,
    });

    await prisma.notification.create({
      data: {
        restaurantId: sub.restaurantId,
        userId: sub.restaurant.ownerId,
        type: 'FREE_TRIAL_ACTIVATED',
        title: '🎉 Free Trial Approved by Admin!',
        message: `Admin has approved your 30-Day Free Trial (${sub.plan.name}). Your restaurant is now active until ${expiresAt.toLocaleDateString()}.`,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: { subscription: updatedSub },
      message: `30-Day Free Trial approved and activated for ${sub.restaurant.name}!`,
    });
  } catch (error) { next(error); }
}

export async function rejectFreeTrial(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscriptionId = req.params.subscriptionId as string;
    const sub = await prisma.restaurantSubscription.findUnique({
      where: { id: subscriptionId },
      include: { restaurant: true },
    });
    if (!sub) throw new AppError('Subscription request not found.', 404, 'NOT_FOUND');

    await prisma.restaurantSubscription.delete({ where: { id: subscriptionId } });

    await prisma.notification.create({
      data: {
        restaurantId: sub.restaurantId,
        userId: sub.restaurant.ownerId,
        type: 'TRIAL_REJECTED',
        title: 'Free Trial Request Declined',
        message: 'Your Free Trial request was declined by the administrator. Please subscribe to a paid tier or contact support.',
      },
    }).catch(() => {});

    res.json({
      success: true,
      message: `Trial request for ${sub.restaurant.name} declined.`,
    });
  } catch (error) { next(error); }
}

// ── Free Trial Global Settings Controllers ──────────────────────

export async function getFreeTrialSettings(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let settings = DEFAULT_FREE_TRIAL_SETTINGS;
    try {
      const dbSetting = await prisma.systemSetting.findUnique({
        where: { key: 'free_trial_settings' },
      });
      if (dbSetting?.value) {
        settings = { ...DEFAULT_FREE_TRIAL_SETTINGS, ...(dbSetting.value as object) };
      }
    } catch (e) {}

    const freePlan = await getOrCreateFreeTrialPlan();

    res.json({
      success: true,
      data: {
        settings,
        freePlan,
      },
    });
  } catch (error) { next(error); }
}

export async function updateFreeTrialSettings(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { enabled, trialDays, planName, features } = req.body;

    const existing = await prisma.systemSetting.findUnique({
      where: { key: 'free_trial_settings' },
    });
    const current = existing?.value ? (existing.value as Record<string, any>) : DEFAULT_FREE_TRIAL_SETTINGS;

    const updated = {
      ...current,
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      ...(trialDays !== undefined && { trialDays: Math.max(1, parseInt(String(trialDays), 10) || 14) }),
      ...(planName && { planName: String(planName) }),
      ...(features && { features }),
    };

    await prisma.systemSetting.upsert({
      where: { key: 'free_trial_settings' },
      update: { value: updated },
      create: { key: 'free_trial_settings', value: updated },
    });

    // Also update Free Trial SubscriptionPlan if planName or features changed
    const freePlan = await getOrCreateFreeTrialPlan();
    await prisma.subscriptionPlan.update({
      where: { id: freePlan.id },
      data: {
        ...(planName && { name: String(planName) }),
        ...(features && { features }),
      },
    });

    res.json({
      success: true,
      data: { settings: updated },
      message: `Free trial settings updated! Default trial period is now ${updated.trialDays} days.`,
    });
  } catch (error) { next(error); }
}

export async function createRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      name,
      slug: customSlug,
      cuisineType,
      address,
      city,
      pincode,
      phone,
      ownerName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
      platformType = 'RESTAURANT',
      maxLogins = 1,
    } = req.body as {
      name: string;
      slug?: string;
      cuisineType?: string;
      address?: string;
      city?: string;
      pincode?: string;
      phone?: string;
      ownerName: string;
      ownerEmail: string;
      ownerPhone?: string;
      ownerPassword?: string;
      platformType?: string;
      maxLogins?: number | string;
    };

    if (!name || !ownerName || !ownerEmail) {
      throw new AppError('Restaurant name, owner name, and owner email are required.', 400, 'BAD_REQUEST');
    }

    const normalizedOwnerEmail = ownerEmail.toLowerCase().trim();
    const parsedMaxLogins = Math.max(1, parseInt(String(maxLogins), 10) || 1);

    // 1. Find existing user (active or soft-deleted)
    let owner = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedOwnerEmail },
          { email: { endsWith: `:${normalizedOwnerEmail}` } },
        ],
      },
    });

    let finalPassword: string | undefined = undefined;
    if (!owner) {
      finalPassword = ownerPassword?.trim() || 'Owner@123456';
      const passwordHash = await bcrypt.hash(finalPassword, 12);
      owner = await prisma.user.create({
        data: {
          name: ownerName,
          email: normalizedOwnerEmail,
          phone: ownerPhone || null,
          role: 'RESTAURANT_OWNER',
          passwordHash,
          isVerified: true,
          maxLogins: parsedMaxLogins,
        } as any,
      });
    } else {
      // User exists (whether active or soft-deleted) -> Reactivate and assign RESTAURANT_OWNER role
      finalPassword = ownerPassword?.trim() || 'Owner@123456';
      const passwordHash = await bcrypt.hash(finalPassword, 12);
      owner = await prisma.user.update({
        where: { id: owner.id },
        data: {
          name: ownerName || owner.name,
          email: normalizedOwnerEmail,
          phone: ownerPhone || owner.phone,
          role: owner.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'RESTAURANT_OWNER',
          passwordHash,
          isVerified: true,
          deletedAt: null, // Unsuspend & reactivate account!
          maxLogins: parsedMaxLogins,
        } as any,
      });
    }

    // 2. Generate slug — use provided custom slug or generate a unique code
    let slug: string;
    if (customSlug?.trim()) {
      slug = customSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    } else {
      let attempts = 0;
      slug = '';
      do {
        slug = 'rest-' + Math.random().toString(36).slice(2, 8);
        attempts++;
      } while (
        attempts < 10 &&
        await prisma.restaurant.findUnique({ where: { slug } })
      );
    }

    // Check if slug is unique
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug },
    });
    if (existingRestaurant) {
      throw new AppError('A restaurant with this slug/URL already exists. Please choose a different one.', 400, 'SLUG_EXISTS');
    }

    // Configure initial feature flags matching chosen platform type
    const isDual = platformType === 'DUAL';
    const isHotel = platformType === 'HOTEL';
    const initialFeatureFlags = {
      roomServiceEnabled: isDual || isHotel,
      callWaiterEnabled: isDual || !isHotel,
      qrOrderingEnabled: true,
      onlinePaymentEnabled: true,
      aiAssistantEnabled: true,
      loyaltyProgramEnabled: true,
      kitchenDisplayEnabled: true,
      tableReservationEnabled: true,
    };

    // 3. Create restaurant (approved by default since admin creates it)
    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        slug,
        cuisineType: cuisineType || 'General',
        address: address || null,
        city: city || null,
        pincode: pincode || null,
        phone: phone || null,
        ownerId: owner.id,
        isApproved: true,
        isOpen: true,
        platformType: platformType || 'RESTAURANT',
        maxLogins: parsedMaxLogins,
        featureFlags: initialFeatureFlags,
      } as any,
    });

    // Auto-assign Free Trial plan to newly created restaurant
    await autoAssignFreeTrial(restaurant.id);

    // 4. Send email notification to owner containing restaurant details, ID, login email & password
    sendRestaurantWelcomeEmail(
      normalizedOwnerEmail,
      ownerName,
      {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        cuisineType: restaurant.cuisineType,
        city: restaurant.city,
        address: restaurant.address,
        phone: restaurant.phone,
      },
      finalPassword
    ).catch((err) => {
      logger.error(`Failed to send restaurant welcome email to ${normalizedOwnerEmail}:`, err);
    });

    res.status(201).json({
      success: true,
      data: { restaurant },
      message: 'Restaurant created successfully and notification email sent to owner!',
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteRestaurant(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const restaurant = await prisma.restaurant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!restaurant) {
      throw new AppError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND');
    }

    await prisma.restaurant.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isApproved: false,
        isSuspended: true,
      },
    });

    if (restaurant.ownerId) {
      const timestamp = Date.now();
      await prisma.user.update({
        where: { id: restaurant.ownerId },
        data: {
          deletedAt: new Date(),
          email: `deleted_${timestamp}_owner`,
        },
      }).catch((err) => logger.warn('Failed to soft delete restaurant owner on restaurant deletion:', err));
    }

    await cacheDelPattern(`menu:${restaurant.slug}*`);

    res.json({
      success: true,
      message: `Restaurant "${restaurant.name}" deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminCoupons(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupons = await prisma.coupon.findMany({
      where: { restaurantId: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { coupons } });
  } catch (error) { next(error); }
}

export async function createAdminCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, type, value, minOrderAmount, maxDiscount, maxUses, expiresAt } = req.body as {
      code: string; type: 'FLAT' | 'PERCENT'; value: number;
      minOrderAmount?: number; maxDiscount?: number; maxUses?: number; expiresAt?: string;
    };
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value,
        minOrderAmount: minOrderAmount || 0,
        maxDiscount: maxDiscount || null,
        maxUses: maxUses || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        restaurantId: null,
      },
    });
    res.status(201).json({ success: true, data: { coupon } });
  } catch (error) { next(error); }
}

export async function deleteAdminCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const coupon = await prisma.coupon.findFirst({ where: { id, restaurantId: null } });
    if (!coupon) throw new AppError('Coupon not found.', 404, 'COUPON_NOT_FOUND');
    await prisma.coupon.delete({ where: { id } });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (error) { next(error); }
}

export async function toggleAdminCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const coupon = await prisma.coupon.findFirst({ where: { id, restaurantId: null } });
    if (!coupon) throw new AppError('Coupon not found.', 404, 'COUPON_NOT_FOUND');
    const updated = await prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive },
    });
    res.json({ success: true, data: { isActive: updated.isActive } });
  } catch (error) { next(error); }
}

export async function broadcastNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = req.user!.id;
    const { title, message, targetRole } = req.body as { title: string; message: string; targetRole?: string };
    if (!title || !message) {
      throw new AppError('Title and message are required for broadcast.', 400, 'BAD_REQUEST');
    }

    const whereClause: any = { deletedAt: null };
    if (targetRole === 'ALL_OWNERS') {
      whereClause.role = 'RESTAURANT_OWNER';
    } else if (targetRole === 'ALL_CUSTOMERS') {
      whereClause.role = 'CUSTOMER';
    }

    const targetUsers = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, role: true, email: true, restaurant: { select: { id: true } } },
    });

    let sentCount = 0;
    for (const u of targetUsers) {
      const userRestaurant = u.restaurant && u.restaurant[0];

      // 1. In-app Notification
      await prisma.notification.create({
        data: {
          userId: u.id,
          restaurantId: userRestaurant?.id ?? null,
          type: 'BROADCAST',
          title: `📢 ${title}`,
          message,
        },
      });

      // 2. Insert broadcast directly into 1-to-1 Owner Chat Thread (skip self)
      if (u.id !== adminUserId) {
        await prisma.directMessage.create({
          data: {
            senderId: adminUserId,
            receiverId: u.id,
            message: `📢 [BROADCAST ANNOUNCEMENT]\nTitle: ${title}\n\n${message}`,
          },
        });
      }

      // 3. Real-time Sockets
      emitNotification(u.id, {
        type: 'BROADCAST',
        title: `📢 ${title}`,
        message,
        createdAt: new Date().toISOString(),
      });
      sentCount++;
    }

    // 4. Send Email Broadcast to all recipients
    const recipientEmails = Array.from(
      new Set(
        targetUsers
          .map((u) => {
            if (!u.email) return '';
            const email = u.email.includes(':') ? u.email.split(':')[1] : u.email;
            return email.toLowerCase().trim();
          })
          .filter((email) => email && email.includes('@') && email.includes('.'))
      )
    );

    if (recipientEmails.length > 0) {
      sendBroadcastEmail(recipientEmails, `📢 ${title}`, message, 'Super Admin Platform Broadcast')
        .then((result) => logger.info(`Broadcast notification email dispatch complete: ${result.success} sent, ${result.failed} failed.`))
        .catch((err) => logger.error('Failed to send broadcast notification emails:', err));
    }

    res.json({
      success: true,
      message: `Broadcast notification & emails sent successfully to ${sentCount} users!`,
      data: { sentCount },
    });
  } catch (error) { next(error); }
}

export async function broadcastEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = req.user!.id;
    const { subject, message, targetRole } = req.body as { subject: string; message: string; targetRole?: string };
    if (!subject || !message) {
      throw new AppError('Subject and email content are required.', 400, 'BAD_REQUEST');
    }

    let users: Array<{ id: string; email: string }> = [];

    if (targetRole === 'ALL_OWNERS') {
      const ownerUsers = await prisma.user.findMany({
        where: { role: 'RESTAURANT_OWNER', deletedAt: null },
        select: { id: true, email: true },
      });
      const restaurants = await prisma.restaurant.findMany({
        where: { deletedAt: null },
        select: { owner: { select: { id: true, email: true } } },
      });
      const restOwnerUsers = restaurants.map((r) => r.owner).filter(Boolean) as Array<{ id: string; email: string }>;

      const map = new Map<string, { id: string; email: string }>();
      [...ownerUsers, ...restOwnerUsers].forEach((u) => {
        if (u && u.email) {
          const clean = u.email.includes(':') ? u.email.split(':')[1] : u.email;
          const normalized = clean.toLowerCase().trim();
          if (normalized.includes('@') && normalized.includes('.')) {
            map.set(normalized, { id: u.id, email: normalized });
          }
        }
      });
      users = Array.from(map.values());
    } else if (targetRole === 'ALL_CUSTOMERS') {
      users = await prisma.user.findMany({
        where: { role: 'CUSTOMER', deletedAt: null },
        select: { id: true, email: true },
      });
    } else {
      users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true, email: true },
      });
    }

    for (const u of users) {
      if (u.id && u.id !== adminUserId) {
        await prisma.directMessage.create({
          data: {
            senderId: adminUserId,
            receiverId: u.id,
            message: `📧 [MASS EMAIL ANNOUNCEMENT]\nSubject: ${subject}\n\n${message}`,
          },
        }).catch((err) => logger.warn('Failed to create direct message for broadcast:', err));
      }

      if (u.id) {
        emitNotification(u.id, {
          type: 'BROADCAST',
          title: `📧 ${subject}`,
          message,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const recipientEmails = Array.from(
      new Set(
        users
          .map((u) => {
            if (!u.email) return '';
            const email = u.email.includes(':') ? u.email.split(':')[1] : u.email;
            return email.toLowerCase().trim();
          })
          .filter((email) => email && email.includes('@') && email.includes('.'))
      )
    );

    if (req.user?.email) {
      const reqEmail = req.user.email.includes(':') ? req.user.email.split(':')[1] : req.user.email;
      const normalizedReqEmail = reqEmail.toLowerCase().trim();
      if (normalizedReqEmail && !recipientEmails.includes(normalizedReqEmail)) {
        recipientEmails.push(normalizedReqEmail);
      }
    }
    const adminSmtpEmail = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || '').toLowerCase().trim();
    if (adminSmtpEmail && !recipientEmails.includes(adminSmtpEmail)) {
      recipientEmails.push(adminSmtpEmail);
    }

    logger.info(`Sending broadcast email to ${recipientEmails.length} recipients: ${recipientEmails.join(', ')}`);

    // Dispatch emails asynchronously in the background so that the API request returns instantly
    sendBroadcastEmail(recipientEmails, subject, message, 'Super Admin Platform Announcement')
      .then((result) => {
        logger.info(`Broadcast email complete: ${result.success} sent, ${result.failed} failed.`);
      })
      .catch((err) => {
        logger.error('Background email broadcast dispatch failed:', err);
      });

    res.json({
      success: true,
      message: `Broadcast email dispatch initiated for ${recipientEmails.length} recipient(s) (${recipientEmails.join(', ')})!`,
      data: { recipients: recipientEmails, count: recipientEmails.length },
    });
  } catch (error) { next(error); }
}

// ── Get Admin Reviews ──────────────────────────────────────────

export async function getAdminReviews(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        order: { select: { id: true, guestName: true, total: true } },
        restaurant: { select: { name: true, slug: true } },
      },
    });

    const aggregate = await prisma.review.aggregate({
      _avg: { rating: true },
      _count: { rating: true },
    });

    res.json({
      success: true,
      data: {
        reviews,
        stats: {
          avgRating: aggregate._avg.rating ?? 0,
          totalReviews: aggregate._count.rating ?? 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ── Loyalty Settings Management ──────────────────────────────

export const DEFAULT_LOYALTY_SETTINGS = {
  enabled: true,
  pointsPerSpendRupees: 10,
  pointsPerDiscountRupee: 50,
  minPointsToRedeem: 50,
  conversionRuleText: '50 Loyalty Points = ₹1.00 Discount. Every 50 points saved gives you ₹1 off your total bill!',
  increaseRuleText: 'Earn 1 point for every ₹10 spent. Points are credited to your account when the restaurant owner completes/confirms payment on your order.',
  decreaseRuleText: 'When placing an order, tick "Redeem Loyalty Points" on checkout. Points are deducted to give you an instant bill discount!',
};

export async function getLoyaltySettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let value = DEFAULT_LOYALTY_SETTINGS;
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'loyalty_settings' },
      });
      if (setting?.value) {
        value = { ...DEFAULT_LOYALTY_SETTINGS, ...(setting.value as object) };
      }
    } catch (dbErr) {
      logger.warn('Failed to fetch system_settings for loyalty, returning defaults:', dbErr);
    }
    res.json({ success: true, data: { settings: value } });
  } catch (error) { next(error); }
}

export async function updateLoyaltySettings(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      enabled,
      pointsPerSpendRupees,
      pointsPerDiscountRupee,
      minPointsToRedeem,
      conversionRuleText,
      increaseRuleText,
      decreaseRuleText,
    } = req.body as Record<string, any>;

    const existing = await prisma.systemSetting.findUnique({
      where: { key: 'loyalty_settings' },
    });

    const currentVal = existing?.value ? (existing.value as Record<string, any>) : DEFAULT_LOYALTY_SETTINGS;

    const updatedValue = {
      ...currentVal,
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      ...(pointsPerSpendRupees !== undefined && { pointsPerSpendRupees: Number(pointsPerSpendRupees) || 10 }),
      ...(pointsPerDiscountRupee !== undefined && { pointsPerDiscountRupee: Number(pointsPerDiscountRupee) || 50 }),
      ...(minPointsToRedeem !== undefined && { minPointsToRedeem: Number(minPointsToRedeem) || 50 }),
      ...(conversionRuleText && { conversionRuleText: String(conversionRuleText) }),
      ...(increaseRuleText && { increaseRuleText: String(increaseRuleText) }),
      ...(decreaseRuleText && { decreaseRuleText: String(decreaseRuleText) }),
    };

    const setting = await prisma.systemSetting.upsert({
      where: { key: 'loyalty_settings' },
      update: { value: updatedValue },
      create: { key: 'loyalty_settings', value: updatedValue },
    });

    res.json({ success: true, data: { settings: setting.value }, message: 'Loyalty settings updated successfully' });
  } catch (error) { next(error); }
}
