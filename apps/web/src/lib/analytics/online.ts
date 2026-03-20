import { apiFetch } from '../api';

export type OnlineAnalyticsEventName =
  | 'online_lobby_created'
  | 'online_league_joined'
  | 'online_lobby_viewed';

type OnlineAnalyticsProps = Record<string, string | number | boolean | null>;

export function trackOnlineEvent(
  eventName: OnlineAnalyticsEventName,
  options?: {
    onlineLeagueId?: string;
    onlineFixtureId?: string;
    onlineMatchSessionId?: string;
    payload?: OnlineAnalyticsProps;
  },
): void {
  if (typeof window === 'undefined') {
    return;
  }

  void apiFetch('/api/analytics/online/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName,
      onlineLeagueId: options?.onlineLeagueId,
      onlineFixtureId: options?.onlineFixtureId,
      onlineMatchSessionId: options?.onlineMatchSessionId,
      payload: options?.payload,
    }),
  }).catch(() => {});
}
