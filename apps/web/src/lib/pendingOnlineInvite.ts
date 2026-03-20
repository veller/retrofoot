const STORAGE_KEY = 'retrofoot/pendingOnlineInvite';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isOnlineJoinPath(pathname: string): boolean {
  return /^\/online\/join\/[^/]+\/?$/.test(pathname);
}

export function setPendingOnlineInvitePath(pathnameWithSearch: string): void {
  const pathOnly = pathnameWithSearch.split('?')[0] ?? '';
  if (!isOnlineJoinPath(pathOnly)) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ path: pathnameWithSearch, savedAt: Date.now() }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearPendingOnlineInvite(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Returns stored join path and removes it (one-shot after signup). */
export function consumePendingOnlineInvitePath(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; savedAt?: number };
    const path = parsed.path;
    const savedAt = parsed.savedAt;
    localStorage.removeItem(STORAGE_KEY);
    if (
      typeof path !== 'string' ||
      !path.startsWith('/online/join/') ||
      typeof savedAt !== 'number' ||
      Date.now() - savedAt > MAX_AGE_MS
    ) {
      return null;
    }
    return path;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}
