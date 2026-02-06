import type { MatchEvent } from '@retrofoot/core';

const SIGNIFICANT_EVENT_TYPES: MatchEvent['type'][] = [
  'goal',
  'own_goal',
  'penalty_scored',
  'penalty_missed',
  'yellow_card',
  'red_card',
  'injury',
  'substitution',
];

export function isSignificantEvent(type: MatchEvent['type']): boolean {
  return SIGNIFICANT_EVENT_TYPES.includes(type);
}
