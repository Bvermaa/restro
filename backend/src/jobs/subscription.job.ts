import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { emitNotification } from '../services/socket.service';
import { cacheDelPattern } from '../services/redis.service';

/**
 * Checks a specific restaurant's active subscription status.
 * If expired, automatically marks subscription inactive and suspends the restaurant.
 */
export async function checkRestaurantSubscriptionExpiry(restaurantId: string): Promise<boolean> {
  try {
    const now = new Date();
    const activeSub = await prisma.restaurantSubscription.findFirst({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        plan: true,
        restaurant: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeSub && activeSub.expiresAt < now) {
      logger.warn(`Subscription ${activeSub.id} for restaurant ${activeSub.restaurant.name} (${restaurantId}) has expired. Auto-suspending.`);

      // 1. Mark subscription inactive
      await prisma.restaurantSubscription.update({
        where: { id: activeSub.id },
        data: { isActive: false },
      });

      // 2. Suspend restaurant
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { isSuspended: true, isOpen: false },
      });

      // 3. Clear cache
      if (activeSub.restaurant.slug) {
        await cacheDelPattern(`menu:${activeSub.restaurant.slug}*`);
      }

      // 4. Send notification to owner
      if (activeSub.restaurant.ownerId) {
        await prisma.notification.create({
          data: {
            restaurantId,
            userId: activeSub.restaurant.ownerId,
            type: 'SUBSCRIPTION_EXPIRED',
            title: '⚠️ Subscription Expired - Restaurant Suspended',
            message: `Your "${activeSub.plan.name}" subscription expired on ${activeSub.expiresAt.toLocaleDateString()}. Your restaurant has been automatically suspended. Please renew your plan in the Subscription tab to reactivate.`,
          },
        }).catch(() => {});

        emitNotification(activeSub.restaurant.ownerId, {
          type: 'SUBSCRIPTION_EXPIRED',
          title: '⚠️ Subscription Expired - Restaurant Suspended',
          message: `Your "${activeSub.plan.name}" subscription expired. Please renew your plan in the Subscription tab to reactivate.`,
          createdAt: new Date().toISOString(),
        });
      }

      return true; // was expired and suspended
    }

    return false;
  } catch (error) {
    logger.error(`Error checking subscription expiry for restaurant ${restaurantId}:`, error);
    return false;
  }
}

/**
 * Scans all active subscriptions and suspends restaurants whose subscriptions have expired.
 */
export async function checkAndSuspendExpiredSubscriptions(): Promise<number> {
  try {
    const now = new Date();
    const expiredSubs = await prisma.restaurantSubscription.findMany({
      where: {
        isActive: true,
        expiresAt: { lt: now },
      },
      include: {
        restaurant: true,
        plan: true,
      },
    });

    if (expiredSubs.length === 0) {
      return 0;
    }

    logger.info(`Found ${expiredSubs.length} expired active subscription(s). Processing auto-suspensions...`);

    let suspendedCount = 0;
    for (const sub of expiredSubs) {
      try {
        // Mark subscription inactive
        await prisma.restaurantSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });

        // Suspend restaurant if not already suspended
        if (sub.restaurant && !sub.restaurant.isSuspended) {
          await prisma.restaurant.update({
            where: { id: sub.restaurantId },
            data: { isSuspended: true, isOpen: false },
          });
          suspendedCount++;

          if (sub.restaurant.slug) {
            await cacheDelPattern(`menu:${sub.restaurant.slug}*`);
          }

          // Create notification for restaurant owner
          if (sub.restaurant.ownerId) {
            await prisma.notification.create({
              data: {
                restaurantId: sub.restaurantId,
                userId: sub.restaurant.ownerId,
                type: 'SUBSCRIPTION_EXPIRED',
                title: '⚠️ Subscription Expired - Restaurant Suspended',
                message: `Your "${sub.plan.name}" subscription expired on ${sub.expiresAt.toLocaleDateString()}. Your restaurant has been automatically suspended. Please renew your plan to reactivate.`,
              },
            }).catch(() => {});

            emitNotification(sub.restaurant.ownerId, {
              type: 'SUBSCRIPTION_EXPIRED',
              title: '⚠️ Subscription Expired - Restaurant Suspended',
              message: `Your "${sub.plan.name}" subscription has expired. Your restaurant is suspended until renewed.`,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (subErr) {
        logger.error(`Failed to process auto-suspension for subscription ${sub.id}:`, subErr);
      }
    }

    logger.info(`Auto-suspension complete: ${suspendedCount} restaurant(s) suspended due to expired subscriptions.`);
    return suspendedCount;
  } catch (error) {
    logger.error('Error during global subscription expiration check:', error);
    return 0;
  }
}

/**
 * Starts periodic background checker for expired subscriptions (runs every 2 minutes).
 */
export function startSubscriptionCheckerJob(): void {
  // Run once immediately on start
  checkAndSuspendExpiredSubscriptions().catch((err) => {
    logger.error('Initial subscription expiry check failed:', err);
  });

  // Run every 2 minutes
  const INTERVAL_MS = 2 * 60 * 1000;
  setInterval(() => {
    checkAndSuspendExpiredSubscriptions().catch((err) => {
      logger.error('Periodic subscription expiry check failed:', err);
    });
  }, INTERVAL_MS);

  logger.info('⏰ Subscription expiration & auto-suspension background job started (runs every 2m)');
}
