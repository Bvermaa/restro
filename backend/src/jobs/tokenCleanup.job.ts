import { cleanupExpiredRefreshTokens } from '../services/refreshToken.service';
import { logger } from '../utils/logger';

/**
 * Daily job to purge refresh tokens expired more than 7 days ago.
 */
export function startTokenCleanupJob(): void {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  logger.info('🧹 Token Cleanup cron job registered (Runs every 24 hours).');

  // Run cleanup once on initial startup
  cleanupExpiredRefreshTokens().catch((err) => {
    logger.error('Failed to run initial refresh token cleanup:', err);
  });

  const intervalId = setInterval(async () => {
    try {
      await cleanupExpiredRefreshTokens();
    } catch (error) {
      logger.error('Failed to run scheduled refresh token cleanup:', error);
    }
  }, TWENTY_FOUR_HOURS_MS);

  if (intervalId && typeof intervalId.unref === 'function') {
    intervalId.unref();
  }
}
