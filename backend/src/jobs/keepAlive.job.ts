import { logger } from '../utils/logger';

/**
 * Periodically pings the server's health endpoint to keep the Render free tier service awake
 * and prevent cold starts due to inactivity.
 */
export function startKeepAliveJob(): void {
  // Determine ping URL: custom KEEP_ALIVE_URL > Render automatic external URL > fallback localhost
  const targetUrl =
    process.env.KEEP_ALIVE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || 4000}/health`;

  // Interval set to 10 minutes (600,000 ms) - safely within Render's 15-minute idle threshold
  const PING_INTERVAL_MS = 10 * 60 * 1000;

  logger.info(`🔄 Keep-Alive job registered. Target: ${targetUrl} (Every 10 mins)`);

  const timer = setInterval(async () => {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        logger.info(`⚡ Keep-Alive ping successful (${response.status}) -> ${targetUrl}`);
      } else {
        logger.warn(`⚠️ Keep-Alive ping returned status ${response.status} -> ${targetUrl}`);
      }
    } catch (error: any) {
      logger.warn(`⚠️ Keep-Alive ping failed: ${error?.message || error}`);
    }
  }, PING_INTERVAL_MS);

  // Unref timer so it doesn't prevent Node process shutdown
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
}
