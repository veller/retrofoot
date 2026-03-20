import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { gameRoutes } from './routes/game';
import { saveRoutes } from './routes/save';
import { authRoutes } from './routes/auth';
import { matchRoutes } from './routes/match';
import { transferRoutes } from './routes/transfer';
import { seasonRoutes } from './routes/season';
import { achievementsRoutes } from './routes/achievements';
import { analyticsRoutes } from './routes/analytics';
import { adminRoutes } from './routes/admin';
import { onlineRoutes } from './routes/online';
import { resolveAllowedOrigins, type CloudflareBindings } from './lib/auth';
import { MatchRoom } from './durable/MatchRoom';
import { createRateLimitMiddleware } from './lib/rate-limit';

// Re-export the Env type for use in other files
export type Env = CloudflareBindings;

// Create Hono app with environment type
const app = new Hono<{ Bindings: Env }>();

const authRateLimit = createRateLimitMiddleware({
  keyPrefix: 'auth',
  maxRequests: 30,
  windowMs: 60_000,
});

const writeRateLimit = createRateLimitMiddleware({
  keyPrefix: 'writes',
  maxRequests: 80,
  windowMs: 60_000,
  methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
});

const adminReadRateLimit = createRateLimitMiddleware({
  keyPrefix: 'admin',
  maxRequests: 120,
  windowMs: 60_000,
  methods: ['GET'],
});

// Global middleware
app.use('*', logger());
app.use('*', async (c, next) => {
  const allowedOrigins = resolveAllowedOrigins(c.env.ALLOWED_ORIGINS);
  const corsMiddleware = cors({
    origin: allowedOrigins,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Basic abuse protection for auth and write-heavy endpoints.
app.use('/api/auth/*', authRateLimit);
app.use('/api/save', writeRateLimit);
app.use('/api/save/*', writeRateLimit);
app.use('/api/match', writeRateLimit);
app.use('/api/match/*', writeRateLimit);
app.use('/api/transfer', writeRateLimit);
app.use('/api/transfer/*', writeRateLimit);
app.use('/api/season', writeRateLimit);
app.use('/api/season/*', writeRateLimit);
app.use('/api/analytics/*', writeRateLimit);
app.use('/api/online', writeRateLimit);
app.use('/api/online/*', writeRateLimit);
app.use('/api/admin/*', adminReadRateLimit);

// Health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.route('/api/auth', authRoutes);
app.route('/api/game', gameRoutes);
app.route('/api/save', saveRoutes);
app.route('/api/match', matchRoutes);
app.route('/api/transfer', transferRoutes);
app.route('/api/season', seasonRoutes);
app.route('/api/achievements', achievementsRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/online', onlineRoutes);
app.route('/api/admin', adminRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
    },
    500,
  );
});

// Export for Cloudflare Workers
export { MatchRoom };
export default app;

// Export type for Hono RPC client
export type AppType = typeof app;
