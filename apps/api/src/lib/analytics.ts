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

/** Online-only funnel; stored in `online_analytics_events`. */
export const CLIENT_POSTABLE_ONLINE_ANALYTICS_EVENTS = [
  'online_lobby_created',
  'online_league_joined',
  'online_lobby_viewed',
] as const;

export type ClientPostableOnlineAnalyticsEvent =
  (typeof CLIENT_POSTABLE_ONLINE_ANALYTICS_EVENTS)[number];

/** Includes server-only events (not accepted from browser POST). */
export const SERVER_ONLY_ONLINE_ANALYTICS_EVENTS = [
  'online_league_started',
] as const;

export type OnlineAnalyticsEventName =
  | ClientPostableOnlineAnalyticsEvent
  | (typeof SERVER_ONLY_ONLINE_ANALYTICS_EVENTS)[number];

export async function logOnlineAnalyticsEvent(
  db: D1Database,
  eventName: OnlineAnalyticsEventName,
  userId: string,
  options?: {
    onlineLeagueId?: string;
    onlineFixtureId?: string;
    onlineMatchSessionId?: string;
    payload?: AnalyticsPayload;
  },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO online_analytics_events (id, event_name, user_id, online_league_id, online_fixture_id, online_match_session_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      nanoid(),
      eventName,
      userId,
      options?.onlineLeagueId ?? null,
      options?.onlineFixtureId ?? null,
      options?.onlineMatchSessionId ?? null,
      serializePayload(options?.payload),
      Date.now(),
    )
    .run();
}
