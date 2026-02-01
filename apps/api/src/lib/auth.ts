// ============================================================================
// RETROFOOT - Better Auth Configuration
// ============================================================================

import type {
  D1Database,
  IncomingRequestCfProperties,
} from '@cloudflare/workers-types';
import { betterAuth } from 'better-auth';
import { withCloudflare } from 'better-auth-cloudflare';
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
export function createAuth(
  env?: CloudflareBindings,
  cf?: IncomingRequestCfProperties,
) {
  // Use actual DB for runtime, empty object for CLI schema generation
  const db = env
    ? drizzle(env.DB, { schema })
    : ({} as ReturnType<typeof drizzle>);

  return betterAuth({
    ...withCloudflare(
      {
        autoDetectIpAddress: true,
        geolocationTracking: false, // Keep simple for now
        cf: cf || {},
        d1: env
          ? {
              db,
              options: {
                usePlural: true, // Our schema uses plural table names (users, sessions, etc.)
                debugLogs: env.ENVIRONMENT === 'development',
              },
            }
          : undefined,
      },
      {
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
        trustedOrigins: [
          'http://localhost:3000',
          'http://localhost:5173',
          'https://retrofoot.pages.dev',
        ],
        rateLimit: { enabled: false }, // Would need KV binding
      },
    ),

    // Fallback secret for CLI schema generation (not used at runtime)
    secret:
      env?.BETTER_AUTH_SECRET ||
      'cli-schema-generation-fallback-secret-not-used-at-runtime-32chars',
    baseURL:
      env?.ENVIRONMENT === 'development'
        ? 'http://localhost:8787'
        : 'https://retrofoot-api.workers.dev',
    basePath: '/api/auth',

    // Database adapter for CLI schema generation (not used at runtime with withCloudflare)
    ...(env
      ? {}
      : {
          database: drizzleAdapter({} as D1Database, {
            provider: 'sqlite',
            usePlural: true,
          }),
        }),
  });
}

// Export type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

// Export for CLI schema generation
export const auth = createAuth();
