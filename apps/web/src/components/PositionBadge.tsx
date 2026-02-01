import type { Position } from '@retrofoot/core';

const POSITION_COLORS: Record<Position, string> = {
  GK: 'bg-green-600',
  DEF: 'bg-yellow-500',
  MID: 'bg-orange-500',
  ATT: 'bg-red-600',
};

interface PositionBadgeProps {
  position: Position;
  className?: string;
}

export function PositionBadge({
  position,
  className = '',
}: PositionBadgeProps) {
  const bgColor = POSITION_COLORS[position] ?? 'bg-slate-600';

  return (
    <span
      className={`inline-flex items-center text-white text-xs font-medium px-2 py-0.5 rounded ${bgColor} ${className}`}
    >
      {position}
    </span>
  );
}
