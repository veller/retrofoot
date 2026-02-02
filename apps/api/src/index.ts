import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { gameRoutes } from './routes/game';
import { saveRoutes } from './routes/save';
import { authRoutes } from './routes/auth';
import { matchRoutes } from './routes/match';
import type { CloudflareBindings } from './lib/auth';

// Re-export the Env type for use in other files
export type Env = CloudflareBindings;

// Create Hono app with environment type
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://retrofoot-web.pages.dev',
    ],
    credentials: true,
  }),
);

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
export default app;

// Export type for Hono RPC client
export type AppType = typeof app;
