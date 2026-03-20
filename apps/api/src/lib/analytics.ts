import type { D1Database } from '@cloudflare/workers-types';
import { nanoid } from 'nanoid';

/** Events the browser may POST to /api/analytics/events (match_completed is server-only). */
export const CLIENT_POSTABLE_ANALYTICS_EVENTS = [
  'login_successful',
  'login_unsuccessful',
  'session_start',
  'sign_up_success',
  'game_created',
  'match_started',
  'season_completed',
  'game_over',
] as const;

export type ClientPostableAnalyticsEvent =
  (typeof CLIENT_POSTABLE_ANALYTICS_EVENTS)[number];

export const ANALYTICS_EVENT_NAMES = [
  ...CLIENT_POSTABLE_ANALYTICS_EVENTS,
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
