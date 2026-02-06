import type { MatchEvent } from '@retrofoot/core';

interface EventIconProps {
  type: MatchEvent['type'];
  variant?: 'default' | 'colored';
}

export function EventIcon({ type, variant = 'default' }: EventIconProps) {
  switch (type) {
    case 'goal':
      return <span className={variant === 'colored' ? 'text-yellow-400' : ''}>⚽</span>;
    case 'own_goal':
      return <span className={variant === 'colored' ? 'text-red-400' : ''}>⚽</span>;
    case 'penalty_scored':
      return <span className={variant === 'colored' ? 'text-green-400' : ''}>⚽</span>;
    case 'penalty_missed':
      return <span className={variant === 'colored' ? 'text-red-400' : ''}>❌</span>;
    case 'yellow_card':
      return <span className={variant === 'colored' ? 'text-yellow-400' : ''}>🟨</span>;
    case 'red_card':
      return <span className={variant === 'colored' ? 'text-red-600' : ''}>🟥</span>;
    case 'substitution':
      return <span>🔄</span>;
    case 'injury':
      return <span>🏥</span>;
    default:
      return null;
  }
}
