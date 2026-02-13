import { getSession } from './auth';

type RefetchSession = () => Promise<unknown>;

type SessionRetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
};

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasUserSession(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return false;
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object' || !('user' in data)) {
    return false;
  }
  return Boolean((data as { user?: unknown }).user);
}

async function isSessionActive(): Promise<boolean> {
  try {
    const session = await getSession();
    return hasUserSession(session);
  } catch {
    return false;
  }
}

export async function awaitSessionReady(
  refetch: RefetchSession,
  options?: SessionRetryOptions,
): Promise<boolean> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

  if (await isSessionActive()) {
    return true;
  }

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      await refetch();
    } catch {
      // Ignore transient session fetch failures and continue with retries.
    }

    if (await isSessionActive()) {
      return true;
    }

    if (attempt < maxRetries - 1) {
      await sleep(initialDelayMs * (attempt + 1));
    }
  }

  return false;
}
