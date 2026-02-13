import { resolveCookiePolicy } from './auth';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const localhostOverride = resolveCookiePolicy('production', {
  url: 'http://localhost:8787/api/auth/session',
  headers: new Headers({
    host: 'localhost:8787',
    'x-forwarded-proto': 'http',
  }),
});
assert(localhostOverride.sameSite === 'lax', 'Localhost should use SameSite=Lax');
assert(localhostOverride.secure === false, 'Localhost should disable Secure');
assert(
  localhostOverride.baseURL === 'http://localhost:8787',
  'Localhost should use development base URL',
);

const productionPolicy = resolveCookiePolicy('production', {
  url: 'https://retrofoot-api.vellerbauer.workers.dev/api/auth/session',
  headers: new Headers({
    host: 'retrofoot-api.vellerbauer.workers.dev',
    'x-forwarded-proto': 'https',
  }),
});
assert(productionPolicy.sameSite === 'none', 'Production should use SameSite=None');
assert(productionPolicy.secure === true, 'Production should keep Secure cookies');
assert(
  productionPolicy.baseURL === 'https://retrofoot-api.vellerbauer.workers.dev',
  'Production should use production base URL',
);

const explicitDevelopment = resolveCookiePolicy('development', {
  url: 'https://retrofoot-api.vellerbauer.workers.dev/api/auth/session',
  headers: new Headers({
    host: 'retrofoot-api.vellerbauer.workers.dev',
    'x-forwarded-proto': 'https',
  }),
});
assert(
  explicitDevelopment.sameSite === 'lax',
  'Development env should always use SameSite=Lax',
);
assert(
  explicitDevelopment.secure === false,
  'Development env should always disable Secure cookies',
);
