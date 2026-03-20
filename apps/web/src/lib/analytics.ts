import { apiFetch } from './api';

type AnalyticsEventName =
  | 'session_start'
  | 'sign_up_success'
  | 'sign_in_success'
  | 'login_successful'
  | 'login_unsuccessful'
  | 'game_created'
  | 'match_started'
  | 'match_completed'
  | 'season_completed'
  | 'game_over';

type AnalyticsProperties = Record<string, string | number | boolean | null>;

/** Sent to API; match_completed is logged server-side only (avoid duplicates). */
const CLIENT_CAPTURED_EVENTS = new Set<AnalyticsEventName>([
  'login_successful',
  'login_unsuccessful',
  'session_start',
  'sign_up_success',
  'game_created',
  'match_started',
  'season_completed',
  'game_over',
]);

function canUseAnalytics(): boolean {
  return typeof window !== 'undefined';
}

export function initAnalytics(): void {
  // In-house analytics has no client script initialization.
}

export function trackEvent(
  eventName: AnalyticsEventName,
  props?: AnalyticsProperties,
): void {
  if (!canUseAnalytics() || !CLIENT_CAPTURED_EVENTS.has(eventName)) {
    return;
  }

  void apiFetch('/api/analytics/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventName,
      payload: props,
    }),
  }).catch(() => {
    // Best-effort analytics should never affect product flows.
  });
}
