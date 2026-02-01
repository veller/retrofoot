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
authRoutes.on(['GET', 'POST'], '/*', async (c) => {
  // Create auth instance with environment bindings and Cloudflare context
  const auth = createAuth(c.env, c.req.raw.cf);

  // Let Better Auth handle the request
  return auth.handler(c.req.raw);
});
