import type { D1Database } from '@cloudflare/workers-types';
import { nanoid } from 'nanoid';

export const ANALYTICS_EVENT_NAMES = [
  'login_successful',
  'login_unsuccessful',
  'match_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

type AnalyticsPayload = Record<string, unknown> | undefined;

function serializePayload(payload: AnalyticsPayload): string | null {
  if (!payload) {
    return null;
  }
  return JSON.stringify(payload);
}

export async function logAnalyticsEvent(
  db: D1Database,
  eventName: AnalyticsEventName,
  userId: string,
  options?: {
    saveId?: string;
    payload?: AnalyticsPayload;
  },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO analytics_events (id, event_name, user_id, save_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      nanoid(),
      eventName,
      userId,
      options?.saveId ?? null,
      serializePayload(options?.payload),
      Date.now(),
    )
    .run();
}
