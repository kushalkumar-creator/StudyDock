import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env, getEmailProvider, isEmailConfigured, isSupabaseConfigured } from './config/env.js';
import { handleSseConnection } from './lib/realtime.js';
import { verifySupabaseJWT } from './middleware/auth.js';
import { adminRouter } from './routes/admin.js';
import { bookingsRouter } from './routes/bookings.js';
import { booksRouter } from './routes/books.js';
import { dashboardRouter } from './routes/dashboard.js';
import { gateRouter } from './routes/gate.js';
import { seatsRouter } from './routes/seats.js';
import type { AuthenticatedRequest } from './types/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = env.clientUrl
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Real-time Server-Sent Events stream (registered before rate limiter)
  app.get('/api/events', handleSseConnection);

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', globalLimiter);

  // Health check endpoint (fast, non-blocking — ready for Render healthCheckPath)
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'library-management-server',
      supabaseConfigured: isSupabaseConfigured(),
      emailConfigured: isEmailConfigured(),
      emailProvider: getEmailProvider(),
      timezone: env.timezone,
      timestamp: new Date().toISOString(),
    });
  });

  // Current authenticated user profile endpoint
  app.get('/api/me', verifySupabaseJWT, (req: AuthenticatedRequest, res) => {
    res.json({ profile: req.user });
  });

  // Domain API routes
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/seats', seatsRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/gate', gateRouter);
  app.use('/api/books', booksRouter);
  app.use('/api/admin', adminRouter);

  // 404 fallback
  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found.' });
  });

  return app;
}
