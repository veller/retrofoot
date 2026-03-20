// ============================================================================
// RetroFoot - Admin allowlist (server-only; never import from apps/web)
// ============================================================================

import type { CloudflareBindings } from './auth';

const DEFAULT_ADMIN_EMAILS = [
  'jeanbauerc@gmail.com',
  'vellerbauer@gmail.com',
] as const;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function getAdminEmails(env: CloudflareBindings): Set<string> {
  const raw = env.ADMIN_EMAILS?.trim();
  if (raw) {
    const set = new Set<string>();
    for (const part of raw.split(',')) {
      const e = normalizeEmail(part);
      if (e) set.add(e);
    }
    return set;
  }
  return new Set(DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()));
}

type SessionLike = {
  user?: { email?: string | null; id?: string | null } | null;
} | null;

export function isAdminSession(
  session: SessionLike,
  env: CloudflareBindings,
): boolean {
  const email = normalizeEmail(session?.user?.email);
  if (!email) return false;
  return getAdminEmails(env).has(email);
}
