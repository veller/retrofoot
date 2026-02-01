import type { Position } from '@retrofoot/core'

const POSITION_GROUP_COLORS: Record<Position, string> = {
  GK: 'bg-green-600',
  CB: 'bg-yellow-500',
  LB: 'bg-yellow-500',
  RB: 'bg-yellow-500',
  CDM: 'bg-orange-500',
  CM: 'bg-orange-500',
  CAM: 'bg-orange-500',
  LM: 'bg-orange-500',
  RM: 'bg-orange-500',
  LW: 'bg-red-600',
  RW: 'bg-red-600',
  ST: 'bg-red-600',
}

interface PositionBadgeProps {
  position: Position
  className?: string
}

export function PositionBadge({ position, className = '' }: PositionBadgeProps) {
  const bgColor = POSITION_GROUP_COLORS[position] ?? 'bg-slate-600'

  return (
    <span
      className={`inline-flex items-center text-white text-xs font-medium px-2 py-0.5 rounded ${bgColor} ${className}`}
    >
      {position}
    </span>
  )
}
