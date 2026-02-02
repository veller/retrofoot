// ============================================================================
// RETROFOOT - Better Auth Configuration
// ============================================================================

import type { D1Database } from '@cloudflare/workers-types';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@retrofoot/db/schema';

// Cloudflare bindings type
export type CloudflareBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  ENVIRONMENT?: string;
};

// Session duration constants (in seconds)
const ONE_DAY = 60 * 60 * 24;
const SESSION_EXPIRY = ONE_DAY * 7;
const SESSION_REFRESH_AGE = ONE_DAY;
const COOKIE_CACHE_MAX_AGE = 60 * 5;

/**
 * Creates a Better Auth instance configured for Cloudflare Workers + D1
 *
 * This function handles both runtime execution (with actual DB)
 * and CLI schema generation (without DB binding).
 */
export function createAuth(env?: CloudflareBindings) {
  // Use actual DB for runtime, empty object for CLI schema generation
  const db = env
    ? drizzle(env.DB, { schema })
    : ({} as ReturnType<typeof drizzle>);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      usePlural: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    session: {
      expiresIn: SESSION_EXPIRY,
      updateAge: SESSION_REFRESH_AGE,
      cookieCache: { enabled: true, maxAge: COOKIE_CACHE_MAX_AGE },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
      },
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
      },
    },
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://retrofoot-web.pages.dev',
    ],
    secret:
      env?.BETTER_AUTH_SECRET ||
      'cli-schema-generation-fallback-secret-not-used-at-runtime-32chars',
    baseURL:
      env?.ENVIRONMENT === 'development'
        ? 'http://localhost:8787'
        : 'https://retrofoot-api.vellerbauer.workers.dev',
    basePath: '/api/auth',
  });
}

// Export type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

// Export for CLI schema generation
export const auth = createAuth();
