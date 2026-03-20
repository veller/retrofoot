// ============================================================================
// RETROFOOT - Better Auth Configuration
// ============================================================================

import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
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
  /** Online live match coordination (WebSocket per fixture). */
  MATCH_ROOM: DurableObjectNamespace;
  BETTER_AUTH_SECRET: string;
  ENVIRONMENT?: string;
  AUTH_PERF_LOGS?: string;
  API_BASE_URL?: string;
  ALLOWED_ORIGINS?: string;
  /** Comma-separated admin emails; if unset, built-in defaults apply */
  ADMIN_EMAILS?: string;
  /**
   * When `ENVIRONMENT=development` and value is `1`, MatchRoom allows one
   * connected manager to run the sim and resume half-time alone.
   */
  ONLINE_DEV_SINGLE_PLAYER_MATCH?: string;
  /**
   * Shared secret for `POST .../dev/...` routes; required in development
   * when using the companion-member helper.
   */
  ONLINE_DEV_SECRET?: string;
};

// Session duration constants (in seconds)
const ONE_DAY = 60 * 60 * 24;
const SESSION_EXPIRY = ONE_DAY * 7;
const SESSION_REFRESH_AGE = ONE_DAY;
const COOKIE_CACHE_MAX_AGE = 60 * 5;
const CLI_FALLBACK_SECRET =
  'cli-schema-generation-fallback-secret-not-used-at-runtime-32chars';
const PRODUCTION_API_BASE_URL = 'https://retrofoot-api.vellerbauer.workers.dev';
const DEVELOPMENT_API_BASE_URL = 'http://localhost:8787';
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://retrofoot-web.pages.dev',
];

let cachedRuntimeAuth: ReturnType<typeof betterAuth> | null = null;
let cachedRuntimeAuthKey: string | null = null;
let warnedLocalCookieOverride = false;

type RequestContext = {
  url?: string;
  headers?: Headers;
};

type CookiePolicy = {
  sameSite: 'lax' | 'none';
  secure: boolean;
  crossSubDomainCookies: boolean;
  baseURL: string;
  modeKey: string;
  localOverride: boolean;
};

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

function getRuntimeCacheKey(env: CloudflareBindings, modeKey: string): string {
  return `${env.ENVIRONMENT ?? 'production'}:${modeKey}:${env.BETTER_AUTH_SECRET}:${env.API_BASE_URL ?? ''}:${env.ALLOWED_ORIGINS ?? ''}`;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

function normalizeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const closingIndex = trimmed.indexOf(']');
    return closingIndex > 1 ? trimmed.slice(1, closingIndex) : trimmed;
  }
  return trimmed.split(':')[0] || trimmed;
}

function parseFirstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const first = value.split(',')[0]?.trim().toLowerCase();
  return first || null;
}

function parseCsvValues(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function resolveAllowedOrigins(value?: string): string[] {
  const configured = parseCsvValues(value);
  const combined = [...DEFAULT_ALLOWED_ORIGINS, ...configured];
  return Array.from(new Set(combined));
}

function resolveRuntimeSecret(env: CloudflareBindings): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      'BETTER_AUTH_SECRET must be configured and at least 32 characters long.',
    );
  }
  return secret;
}

export function resolveCookiePolicy(
  environment: string | undefined,
  apiBaseUrl: string | undefined,
  context?: RequestContext,
): CookiePolicy {
  const envMode = environment === 'development' ? 'development' : 'production';
  const forwardedProto = parseFirstHeaderValue(
    context?.headers?.get('x-forwarded-proto') ?? null,
  );
  const hostHeader = parseFirstHeaderValue(
    context?.headers?.get('x-forwarded-host') ??
      context?.headers?.get('host') ??
      null,
  );

  let protocol = forwardedProto;
  let hostname = hostHeader ? normalizeHostname(hostHeader) : null;
  if (context?.url) {
    try {
      const parsed = new URL(context.url);
      protocol = protocol || parsed.protocol.replace(':', '').toLowerCase();
      hostname = hostname || parsed.hostname.toLowerCase();
    } catch {
      // Best-effort parser: ignore malformed URLs and use header-derived context.
    }
  }

  const isLocal = Boolean(hostname && isLocalHostname(hostname));
  const isInsecureHttp = protocol === 'http' || (!protocol && isLocal);
  const localOverride = envMode !== 'development' && isLocal && isInsecureHttp;
  const isDevelopmentLike = envMode === 'development' || localOverride;

  return {
    sameSite: isDevelopmentLike ? 'lax' : 'none',
    secure: !isDevelopmentLike,
    crossSubDomainCookies: !isDevelopmentLike,
    baseURL: isDevelopmentLike
      ? DEVELOPMENT_API_BASE_URL
      : apiBaseUrl?.trim() || PRODUCTION_API_BASE_URL,
    modeKey: isDevelopmentLike ? 'development-like' : 'production-like',
    localOverride,
  };
}

function maybeLogLocalCookieOverride(
  env: CloudflareBindings | undefined,
  policy: CookiePolicy,
): void {
  if (!env || !policy.localOverride || warnedLocalCookieOverride) {
    return;
  }

  warnedLocalCookieOverride = true;
  console.warn(
    JSON.stringify({
      event: 'auth_config_warning',
      warning:
        'ENVIRONMENT is production but localhost HTTP request detected. Falling back to development cookie policy.',
      environment: env.ENVIRONMENT,
      secureCookies: policy.secure,
      sameSite: policy.sameSite,
    }),
  );
}

function buildAuth(env?: CloudflareBindings, context?: RequestContext) {
  const isRuntime = Boolean(env);
  const cookiePolicy = resolveCookiePolicy(
    env?.ENVIRONMENT,
    env?.API_BASE_URL,
    context,
  );
  maybeLogLocalCookieOverride(env, cookiePolicy);

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
        enabled: cookiePolicy.crossSubDomainCookies,
      },
      defaultCookieAttributes: {
        sameSite: cookiePolicy.sameSite,
        secure: cookiePolicy.secure,
      },
    },
    trustedOrigins: resolveAllowedOrigins(env?.ALLOWED_ORIGINS),
    secret: env ? resolveRuntimeSecret(env) : CLI_FALLBACK_SECRET,
    baseURL: cookiePolicy.baseURL,
    basePath: '/api/auth',
  });
}

/**
 * Creates a Better Auth instance configured for Cloudflare Workers + D1
 *
 * This function handles both runtime execution (with actual DB)
 * and CLI schema generation (without DB binding).
 */
export function createAuth(env?: CloudflareBindings, context?: RequestContext) {
  if (!env) {
    return buildAuth();
  }

  const cookiePolicy = resolveCookiePolicy(
    env.ENVIRONMENT,
    env.API_BASE_URL,
    context,
  );
  const cacheKey = getRuntimeCacheKey(env, cookiePolicy.modeKey);
  if (cachedRuntimeAuth && cachedRuntimeAuthKey === cacheKey) {
    return cachedRuntimeAuth;
  }

  cachedRuntimeAuth = buildAuth(env, context);
  cachedRuntimeAuthKey = cacheKey;
  return cachedRuntimeAuth;
}

// Export type for the auth instance
export type Auth = ReturnType<typeof createAuth>;

// Export for CLI schema generation
export const auth = createAuth();
