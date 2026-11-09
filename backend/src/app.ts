import { validateEnv } from './config/env';
validateEnv();
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { generalLimiter } from './middlewares/rateLimiter.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { requestLogger } from './middlewares/requestLogger.middleware';
import { swaggerSpec } from './swagger';

// Route imports
import authRoutes from './routes/auth.routes';
import menuRoutes from './routes/menu.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import { createDirectOrder, verifyPayment } from './controllers/order.controller';
import profileRoutes from './routes/profile.routes';
import aiRoutes from './routes/ai.routes';
import ownerRoutes from './routes/owner.routes';
import adminRoutes from './routes/admin.routes';
import kitchenRoutes from './routes/kitchen.routes';
import webhookRoutes from './routes/webhook.routes';
import chatRoutes from './routes/chat.routes';
import paymentRoutes from './routes/payment.routes';
import { getSocketServer } from './services/socket.service';

const app = express();

// ── Security Headers ──────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Disabled for API; frontend handles CSP
  })
);

// ── CORS ─────────────────────────────────────────────────────
const configuredClientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const allowedOrigins = Array.from(
  new Set([
    ...configuredClientUrls,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ])
).filter(Boolean);

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  try {
    const url = new URL(normalized);
    const configuredHosts = allowedOrigins.map((u) => {
      try {
        return new URL(u).hostname.replace(/^www\./, '');
      } catch {
        return u;
      }
    });
    const currentHost = url.hostname.replace(/^www\./, '');
    if (configuredHosts.includes(currentHost)) {
      return true;
    }
  } catch {}
  if (process.env.NODE_ENV !== 'production') {
    if (normalized.startsWith('http://localhost:') || normalized.startsWith('http://127.0.0.1:')) {
      return true;
    }
  }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      console.warn(`[CORS Blocked] Origin: ${origin}. Allowed:`, allowedOrigins);
      callback(new Error('CORS blocked for this origin'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// ── Socket.io Fallback Interceptor ─────────────────────────────
// Intercept /socket.io requests that bypassed Engine.io due to proxy trailing slash stripping
app.use((req, res, next) => {
  if (req.url && (req.url.startsWith('/socket.io') || req.path === '/socket.io')) {
    const ioServer = getSocketServer();
    if (ioServer?.engine) {
      (ioServer.engine as any).handleRequest(req, res);
      return;
    }
  }
  next();
});

// ── Body Parsers ──────────────────────────────────────────────
app.use(
  express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Serve local uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Request Logger ─────────────────────────────────────────────
app.use(requestLogger);

// ── Rate Limiting ──────────────────────────────────────────────
app.use('/api', generalLimiter);

// ── Health & Root Check ─────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: '🚀 EZ- Restaurant SaaS API Server is running live!',
    version: '1.0.0',
    documentation: '/api-docs',
    health: '/health',
    api: '/api/v1',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// ── Swagger API Docs ──────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── API Routes ────────────────────────────────────────────────
const API = '/api/v1';

// Direct Razorpay Endpoints
app.post('/api/create-order', createDirectOrder);
app.post('/api/verify-payment', verifyPayment);

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/menu`, menuRoutes);
app.use(`${API}/cart`, cartRoutes);
app.use(`${API}/orders`, orderRoutes);
app.use(`${API}/profile`, profileRoutes);
app.use(`${API}/ai`, aiRoutes);
app.use(`${API}/owner`, ownerRoutes);
app.use(`${API}/kitchen`, kitchenRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/chat`, chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/webhooks`, webhookRoutes);

// ── 404 Handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
  });
});

// ── Global Error Handler ──────────────────────────────────────
app.use(errorHandler);

export default app;
