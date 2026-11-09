import 'dotenv/config';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app, { allowedOrigins, isOriginAllowed } from './app';
import { initializeSocketService } from './services/socket.service';
import { logger } from './utils/logger';
import { connectRedis, isRedisReady } from './services/redis.service';
import { prisma } from './lib/prisma';

import { ensureDatabaseSeeded } from './utils/autoSeed';
import { startKeepAliveJob } from './jobs/keepAlive.job';
import { startSubscriptionCheckerJob } from './jobs/subscription.job';
import { startTokenCleanupJob } from './jobs/tokenCleanup.job';

// Gracefully handle background disconnections / uncaught exceptions in production without crashing the server process
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection captured gracefully:', reason?.message || reason);
});

process.on('uncaughtException', (error: any) => {
  logger.error('Uncaught Exception captured gracefully:', error?.stack || error?.message || error);
});

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const HOST = '0.0.0.0';

async function bootstrap() {
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (isOriginAllowed(origin)) {
            return callback(null, true);
          }
          callback(new Error('CORS: origin not allowed by Socket.io'));
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['polling', 'websocket'],
    });

    initializeSocketService(io);
    logger.info('✅ Socket.io initialized');

    // Start server immediately on 0.0.0.0 so Render's port scanner passes instantly
    httpServer.listen(PORT, HOST, () => {
      logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
      logger.info(`📚 API docs: http://${HOST}:${PORT}/api-docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV ?? 'development'}`);
      startKeepAliveJob();
      startTokenCleanupJob();
    });

    // Initialize database & redis in parallel after server is already listening
    initializeBackgroundServices().catch((err) => {
      logger.error('Error during background services initialization:', err);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);
      await prisma.$disconnect();
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function initializeBackgroundServices() {
  // Test DB connection with retry loop
  let dbConnected = false;
  const isDev = process.env.NODE_ENV !== 'production';
  let retries = isDev ? 100 : 15; // Retry up to 15 times to allow postgres container to fully accept connections
  while (retries > 0 && !dbConnected) {
    try {
      await prisma.$connect();
      dbConnected = true;
      logger.info('✅ Database connected');

      // Automatically push schema if fresh database
      try {
        const { execSync } = await import('child_process');
        const path = await import('path');
        const fs = await import('fs');
        logger.info('🔄 Ensuring all database tables exist via Prisma schema sync...');
        const possiblePrismaPaths = [
          '/app/node_modules/prisma/build/index.js',
          path.resolve(__dirname, '../../node_modules/prisma/build/index.js'),
          path.resolve(__dirname, '../node_modules/prisma/build/index.js'),
        ];
        const prismaCliPath = possiblePrismaPaths.find((p) => fs.existsSync(p)) || 'npx prisma';
        const possibleSchemaPaths = [
          '/app/backend/prisma/schema.prisma',
          path.resolve(__dirname, '../prisma/schema.prisma'),
          path.resolve(__dirname, '../../backend/prisma/schema.prisma'),
        ];
        const schemaPath = possibleSchemaPaths.find((p) => fs.existsSync(p)) || 'prisma/schema.prisma';

        const cmd = prismaCliPath.startsWith('npx')
          ? `npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`
          : `node "${prismaCliPath}" db push --schema="${schemaPath}" --skip-generate --accept-data-loss`;

        logger.info(`Running schema push: ${cmd}`);
        execSync(cmd, {
          cwd: path.resolve(__dirname, '..'),
          stdio: 'inherit',
          env: process.env,
        });
        logger.info('✅ Database schema verified and synchronized');
      } catch (schemaErr: any) {
        logger.error('⚠️ Database schema sync error:', schemaErr?.message || schemaErr);
      }

      // Auto-ensure default live credentials & demo restaurant exist
      await ensureDatabaseSeeded();
      // Start subscription expiry background check
      startSubscriptionCheckerJob();
    } catch (err) {
      retries--;
      if (retries === 0) {
        logger.error('❌ Database connection failed after maximum retries.');
        break;
      }
      logger.warn(`⚠️ Database connection failed. Retrying in 2 seconds... (${retries} retries remaining)`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Connect Redis
  await connectRedis();
  if (isRedisReady()) {
    logger.info('✅ Redis connected');
  } else {
    logger.warn('⚠️ Redis connection failed. Operating with in-memory fallback cache and rate limiter.');
  }
}

bootstrap();
