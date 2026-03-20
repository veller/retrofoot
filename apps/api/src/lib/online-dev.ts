// ============================================================================
// Online mode — development-only helpers (never rely on these in production)
// ============================================================================

import type { CloudflareBindings } from './auth';

/** `ONLINE_DEV_SINGLE_PLAYER_MATCH=1` plus development environment. */
export function isOnlineDevSinglePlayerMatch(
  env: CloudflareBindings,
): boolean {
  return (
    env.ENVIRONMENT === 'development' &&
    env.ONLINE_DEV_SINGLE_PLAYER_MATCH === '1'
  );
}
