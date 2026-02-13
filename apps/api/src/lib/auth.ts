// ============================================================================
// RETROFOOT - Better Auth Configuration
// ============================================================================

import type { D1Database } from '@cloudflare/workers-types';
import { betterAuth } from 'better-auth';
import { verifyPassword as verifyLegacyScryptHash } from 'better-auth/crypto';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@retrofoot/db/schema';
import {
  hashPasswordWorker,
  isWorkerHash,
  verifyPasswordWorker,
} from './password';

// Cloudflare bindings type
export type CloudflareBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  ENVIRONMENT?: string;
  AUTH_PERF_LOGS?: string;
};

// Session duration constants (in seconds)
const ONE_DAY = 60 * 60 * 24;
const SESSION_EXPIRY = ONE_DAY * 7;
const SESSION_REFRESH_AGE = ONE_DAY;
const COOKIE_CACHE_MAX_AGE = 60 * 5;
const CLI_FALLBACK_SECRET =
  'cli-schema-generation-fallback-secret-not-used-at-runtime-32chars';

let cachedRuntimeAuth: ReturnType<typeof betterAuth> | null = null;
let cachedRuntimeAuthKey: string | null = null;

function perfLogsEnabled(env?: CloudflareBindings): boolean {
  return env?.AUTH_PERF_LOGS !== '0';
}

function logAuthPerf(
  env: CloudflareBindings | undefined,
  data: Record<string, unknown>,
) {
  if (!perfLogsEnabled(env)) {
    return;
  }

  console.log(JSON.stringify({ event: 'auth_perf', ...data }));
}

function getRuntimeCacheKey(env: CloudflareBindings): string {
  return `${env.ENVIRONMENT ?? 'production'}:${env.BETTER_AUTH_SECRET}`;
}

function buildAuth(env?: CloudflareBindings) {
  const isRuntime = Boolean(env);

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
      password: isRuntime
        ? {
            hash: async (password) => {
              const startedAt = Date.now();
              logAuthPerf(env, {
                segment: 'password_hash_start',
                hash_format: 'pbkdf2_sha256',
                outcome: 'start',
              });
              try {
                const hash = await hashPasswordWorker(password);
                logAuthPerf(env, {
                  segment: 'password_hash',
                  hash_format: 'pbkdf2_sha256',
                  duration_ms: Date.now() - startedAt,
                  outcome: 'ok',
                });
                return hash;
              } catch (error) {
                logAuthPerf(env, {
                  segment: 'password_hash',
                  hash_format: 'pbkdf2_sha256',
                  duration_ms: Date.now() - startedAt,
                  outcome: 'error',
                  error: error instanceof Error ? error.message : String(error),
                });
                throw error;
              }
            },
            verify: async ({ hash, password }) => {
              const startedAt = Date.now();
              const hashFormat = isWorkerHash(hash)
                ? 'pbkdf2_sha256'
                : 'legacy_scrypt';
              logAuthPerf(env, {
                segment: 'password_verify_start',
                hash_format: hashFormat,
                outcome: 'start',
              });
              try {
                const isValid = isWorkerHash(hash)
                  ? await verifyPasswordWorker({ hash, password })
                  : await verifyLegacyScryptHash({ hash, password });
                logAuthPerf(env, {
                  segment: 'password_verify',
                  hash_format: hashFormat,
                  duration_ms: Date.now() - startedAt,
                  outcome: 'ok',
                  valid: isValid,
                });
                return isValid;
              } catch (error) {
                logAuthPerf(env, {
                  segment: 'password_verify',
                  hash_format: hashFormat,
                  duration_ms: Date.now() - startedAt,
                  outcome: 'error',
                  error: error instanceof Error ? error.message : String(error),
                });
                throw error;
              }
            },
          }
        : undefined,
    },
    session: {
      expiresIn: SESSION_EXPIRY,
      updateAge: SESSION_REFRESH_AGE,
      cookieCache: { enabled: true, maxAge: COOKIE_CACHE_MAX_AGE },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: env?.ENVIRONMENT !== 'development',
      },
      defaultCookieAttributes: {
        sameSite: env?.ENVIRONMENT === 'development' ? 'lax' : 'none',
        secure: env?.ENVIRONMENT !== 'development',
      },
    },
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://retrofoot-web.pages.dev',
    ],
    secret: env?.BETTER_AUTH_SECRET || CLI_FALLBACK_SECRET,
    baseURL:
      env?.ENVIRONMENT === 'development'
        ? 'http://localhost:8787'
        : 'https://retrofoot-api.vellerbauer.workers.dev',
    basePath: '/api/auth',
  });
}

/**
 * Creates a Better Auth instance configured for Cloudflare Workers + D1
 *
 * This function handles both runtime execution (with actual DB)
 * and CLI schema generation (without DB binding).
 */
export function createAuth(env?: CloudflareBindings) {
  if (!env) {
    return buildAuth();
  }

  const cacheKey = getRuntimeCacheKey(env);
  if (cachedRuntimeAuth && cachedRuntimeAuthKey === cacheKey) {
    return cachedRuntimeAuth;
  }

  cachedRuntimeAuth = buildAuth(env);
  cachedRuntimeAuthKey = cacheKey;
  return cachedRuntimeAuth;
}

// Export type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

// Export for CLI schema generation
export const auth = createAuth();
