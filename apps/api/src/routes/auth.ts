// ============================================================================
// RETROFOOT - Auth Routes (Better Auth Handler)
// ============================================================================

import { Hono } from 'hono';
import { createAuth, type CloudflareBindings } from '../lib/auth';

// Auth routes - delegates all auth handling to Better Auth
export const authRoutes = new Hono<{ Bindings: CloudflareBindings }>();

/**
 * Better Auth uses a catch-all handler pattern.
 * All auth endpoints are handled by Better Auth:
 *
 * POST /api/auth/sign-up/email - Register with email/password
 * POST /api/auth/sign-in/email - Login with email/password
 * POST /api/auth/sign-out - Logout
 * GET  /api/auth/session - Get current session
 * GET  /api/auth/get-session - Alternative session endpoint
 */
authRoutes.on(['GET', 'POST', 'OPTIONS'], '/*', async (c) => {
  const startedAt = Date.now();
  const path = new URL(c.req.url).pathname;

  // Create auth instance with environment bindings
  const auth = createAuth(c.env);

  // Let Better Auth handle the request
  try {
    const response = await auth.handler(c.req.raw);
    console.log(
      JSON.stringify({
        event: 'auth_perf',
        segment: 'handler',
        path,
        method: c.req.method,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        outcome: 'ok',
      }),
    );
    return response;
  } catch (error) {
    console.log(
      JSON.stringify({
        event: 'auth_perf',
        segment: 'handler',
        path,
        method: c.req.method,
        duration_ms: Date.now() - startedAt,
        outcome: 'error',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
});
