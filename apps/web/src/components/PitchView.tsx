import type {
  CSSProperties,
  DragEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  Player,
  FormationType,
  Position,
  TacticalPosture,
} from '@retrofoot/core';
import {
  getFormationSlotCoordinates,
  calculateOverall,
  type SlotCoordinate,
} from '@retrofoot/core';

export type PitchSlot =
  | { type: 'lineup'; index: number }
  | { type: 'bench'; index: number };

function getPlayerBorderStyle(
  isSelected: boolean,
  isHighlighted: boolean | 0 | undefined,
): string {
  if (isSelected) {
    return 'border-yellow-400 ring-2 ring-yellow-400 ring-offset-1 md:ring-offset-2 ring-offset-slate-900';
  }
  if (isHighlighted) {
    return 'border-cyan-400 ring-2 ring-cyan-400/60 ring-offset-1 md:ring-offset-2 ring-offset-slate-900';
  }
  return 'border-pitch-400';
}

function getBenchSlotStyle(
  isSelected: boolean,
  isHighlighted: boolean | 0 | undefined,
): string {
  if (isSelected) {
    return 'bg-yellow-900/40 border-2 border-yellow-400';
  }
  if (isHighlighted) {
    return 'bg-cyan-900/30 border-2 border-cyan-500/70';
  }
  return 'bg-slate-700/80';
}

function getPitchSlotCursorClass(
  hasDnD: boolean,
  onPlayerClick:
    | ((slot: PitchSlot, playerId: string | undefined) => void)
    | undefined,
): string {
  if (hasDnD) return 'cursor-grab active:cursor-grabbing';
  if (onPlayerClick) return 'cursor-pointer hover:border-pitch-300';
  return 'cursor-default';
}

function getBenchSlotCursorClass(
  hasDnD: boolean,
  onPlayerClick:
    | ((slot: PitchSlot, playerId: string | undefined) => void)
    | undefined,
): string {
  if (hasDnD) return 'cursor-grab active:cursor-grabbing';
  if (onPlayerClick) return 'cursor-pointer hover:bg-slate-600/80';
  return '';
}

function ReplaceIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7 16V4M7 4L3 8M7 4L11 8" />
      <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
    </svg>
  );
}

interface PitchViewProps {
  lineup: string[];
  substitutes: string[];
  playersById: Map<string, Player>;
  formation: FormationType;
  opponentLineup?: string[];
  opponentFormation?: FormationType;
  posture?: TacticalPosture | null;
  onPlayerClick?: (slot: PitchSlot, playerId: string | undefined) => void;
  selectedSlot?: PitchSlot | null;
  /** When set, players with these positions get a highlight (e.g. same defensive/mid/attack group) */
  highlightPositions?: Position[] | null;
  benchLimit?: number;
  /** Drag-and-drop: source slot when dragging */
  draggedSlot?: PitchSlot | null;
  /** Drag-and-drop: slot under pointer when dragging (drop target) */
  dropTargetSlot?: PitchSlot | null;
  onDragStart?: (slot: PitchSlot) => void;
  onDragEnd?: () => void;
  onDragOver?: (slot: PitchSlot) => void;
  onDragLeave?: () => void;
  onDrop?: (slot: PitchSlot, e: DragEvent) => void;
  /** Touch drag: long-press handlers for mobile */
  touchDragHandlers?: {
    getPointerDown: (slot: PitchSlot) => (e: ReactPointerEvent) => void;
    getPointerUp: () => (e: ReactPointerEvent) => void;
    getPointerMove: () => (e: ReactPointerEvent) => void;
  };
  hideBench?: boolean;
  hostPinBorderColor?: string;
  hostPinTextColor?: string;
  opponentPinBorderColor?: string;
  opponentPinTextColor?: string;
  opponentPinOpacity?: number;
  hostPinClassName?: string;
  opponentPinClassName?: string;
  offensiveMidfieldShiftX?: number;
  staggerStartSeconds?: number;
  staggerStepSeconds?: number;
  rootClassName?: string;
  pitchWrapperClassName?: string;
  pitchContainerClassName?: string;
  pitchStyle?: CSSProperties;
}

function clampPitchPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getMidfielderHookY(
  posture: TacticalPosture | null | undefined,
  offensiveMidfieldShiftX: number,
): number {
  if (posture === 'defensive') return 47;
  if (posture === 'attacking') return 53 + offensiveMidfieldShiftX;
  return 50;
}

export function PitchView({
  lineup,
  substitutes,
  playersById,
  formation,
  opponentLineup,
  opponentFormation,
  posture,
  onPlayerClick,
  selectedSlot,
  highlightPositions,
  benchLimit = 7,
  draggedSlot = null,
  dropTargetSlot = null,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  touchDragHandlers,
  hideBench = false,
  hostPinBorderColor,
  hostPinTextColor,
  opponentPinBorderColor = '#94a3b8',
  opponentPinTextColor = '#ffffff',
  opponentPinOpacity = 0.3,
  hostPinClassName = '',
  opponentPinClassName = '',
  offensiveMidfieldShiftX = 0,
  staggerStartSeconds,
  staggerStepSeconds,
  rootClassName = 'flex flex-col gap-4 items-center',
  pitchWrapperClassName = 'w-[100%] mx-auto',
  pitchContainerClassName = 'relative w-full rounded-lg overflow-hidden border-2 border-white/80',
  pitchStyle,
}: PitchViewProps) {
  const hasDnD = Boolean(onDrop && onDragStart);
  const benchCount = substitutes.length;
  const coordinates = getFormationSlotCoordinates(formation);
  const opponentCoordinates = opponentFormation
    ? getFormationSlotCoordinates(opponentFormation)
    : null;

  function getDefenderDepthOffset(): number {
    if (!posture) return 0;
    if (posture === 'balanced' || posture === 'attacking') return 5;
    return -2.4;
  }

  // Tactical hook anchors (0-100 depth axis, left-to-right attack direction).
  const goalkeeperHookY = 8;
  const midfielderHookY = getMidfielderHookY(posture, offensiveMidfieldShiftX);
  const strikerHookY = 80;

  function getHostPinDepthY(position: Position, coord: SlotCoordinate): number {
    if (position === 'GK') return clampPitchPercent(goalkeeperHookY);
    // Some pitch variants don't provide tactical posture; keep legacy formation depth there.
    if (!posture) return clampPitchPercent(coord.y);
    if (position === 'MID') return clampPitchPercent(midfielderHookY);
    if (position === 'ATT') return clampPitchPercent(strikerHookY);
    // Keep defenders anchored to formation depth with existing posture offsets.
    return clampPitchPercent(coord.y + getDefenderDepthOffset());
  }

  return (
    <div className={rootClassName}>
      {/* Football pitch - horizontal, aspect ratio 105:68 (length:width), 80% size */}
      <div className={pitchWrapperClassName}>
        <div
          id="pitch-container"
          className={pitchContainerClassName}
          style={{
            aspectRatio: '55 / 30',
            background:
              'repeating-linear-gradient(90deg, #50A66E 0px, #50A66E 12px, #489362 12px, #489362 24px)',
            ...pitchStyle,
          }}
        >
          {/* Halfway line - vertical for horizontal pitch */}
          <div
            id="pitch-line-halfway"
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          />

          {/* Left penalty area (our goal) - 12% width */}
          <div
            id="pitch-line-left-penalty-area"
            className="absolute border-r-2 border-t-2 border-b-2 border-white/70 pointer-events-none"
            style={{
              left: 0,
              top: '20.35%',
              width: '12%',
              height: '59.3%',
            }}
          />
          {/* Left goal area (6-yard box) */}
          <div
            id="pitch-line-left-goal-area"
            className="absolute border-r-2 border-t-2 border-b-2 border-white/70 pointer-events-none"
            style={{
              left: 0,
              top: '36.55%',
              width: '5.24%',
              height: '26.9%',
            }}
          />

          {/* Right penalty area (opposition goal) - 12% width */}
          <div
            id="pitch-line-right-penalty-area"
            className="absolute border-l-2 border-t-2 border-b-2 border-white/70 pointer-events-none"
            style={{
              left: '88%',
              top: '20.35%',
              width: '12%',
              height: '59.3%',
            }}
          />
          {/* Right goal area (6-yard box) */}
          <div
            id="pitch-line-right-goal-area"
            className="absolute border-l-2 border-t-2 border-b-2 border-white/70 pointer-events-none"
            style={{
              left: '94.76%',
              top: '36.55%',
              width: '5.24%',
              height: '26.9%',
            }}
          />

          {/* Center circle outline */}
          <div
            id="pitch-line-center-circle"
            className="absolute border-2 border-white/70 rounded-full pointer-events-none"
            style={{
              left: '50%',
              top: '50%',
              width: '20%',
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Center spot (dot) */}
          <div
            id="pitch-line-center-spot"
            className="absolute rounded-full bg-white pointer-events-none"
            style={{
              left: '50%',
              top: '50%',
              width: '1.5%',
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Players on pitch */}
          {lineup.map((playerId, index) => {
            const player = playersById.get(playerId);
            const coord = coordinates[index] as SlotCoordinate | undefined;
            if (!coord || !player) return null;

            const displayName =
              player.nickname ?? player.name.split(' ').pop() ?? '?';
            const overall = calculateOverall(player);
            const slot: PitchSlot = { type: 'lineup', index };

            const isSelected =
              selectedSlot?.type === 'lineup' && selectedSlot.index === index;
            const isHighlighted =
              !isSelected &&
              highlightPositions?.length &&
              highlightPositions.includes(player.position);
            const isDropTarget =
              dropTargetSlot?.type === 'lineup' &&
              dropTargetSlot.index === index;
            const isDragging =
              draggedSlot?.type === 'lineup' && draggedSlot.index === index;

            return (
              <div
                key={playerId}
                className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 group ${hostPinClassName}`}
                style={{
                  left: `${getHostPinDepthY(player.position, coord)}%`,
                  top: `${coord.x}%`,
                  animationDelay:
                    staggerStartSeconds !== undefined &&
                    staggerStepSeconds !== undefined
                      ? `${staggerStartSeconds + index * staggerStepSeconds}s`
                      : undefined,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  data-pitch-slot={JSON.stringify(slot)}
                  draggable={hasDnD}
                  onDragStart={(e) => {
                    if (!hasDnD) return;
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify(slot),
                    );
                    e.dataTransfer.effectAllowed = 'move';
                    onDragStart?.(slot);
                  }}
                  onDragEnd={() => onDragEnd?.()}
                  onDragOver={(e) => {
                    if (hasDnD && draggedSlot) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      onDragOver?.(slot);
                    }
                  }}
                  onDragLeave={() => onDragLeave?.()}
                  onDrop={(e) => {
                    if (hasDnD) {
                      e.preventDefault();
                      onDrop?.(slot, e);
                    }
                  }}
                  onPointerDown={touchDragHandlers?.getPointerDown(slot)}
                  onPointerUp={touchDragHandlers?.getPointerUp()}
                  onPointerMove={touchDragHandlers?.getPointerMove()}
                  onClick={() =>
                    onPlayerClick?.({ type: 'lineup', index }, playerId)
                  }
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') &&
                    onPlayerClick?.({ type: 'lineup', index }, playerId)
                  }
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 border-2 flex items-center justify-center text-[10px] md:text-xs font-bold text-white shadow-lg ${getPlayerBorderStyle(isSelected, isHighlighted)} ${isDropTarget ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900 border-amber-400' : ''} ${isDragging ? 'opacity-50' : ''} ${getPitchSlotCursorClass(hasDnD, onPlayerClick)}`}
                  style={{
                    borderColor: hostPinBorderColor,
                    color: hostPinTextColor,
                  }}
                  title={`${player.name} - OVR ${overall}`}
                >
                  {isDropTarget ? (
                    <ReplaceIcon className="w-3 h-3 md:w-4 md:h-4 text-amber-400" />
                  ) : (
                    player.position
                  )}
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block z-10 px-2 py-1 bg-slate-900/95 border border-slate-600 rounded text-xs whitespace-nowrap">
                  {displayName} ({overall})
                </div>
              </div>
            );
          })}

          {opponentLineup?.map((playerId, index) => {
            const player = playersById.get(playerId);
            const coord = opponentCoordinates?.[index] as
              | SlotCoordinate
              | undefined;
            if (!coord || !player) return null;

            const mirroredLeft = 100 - coord.y;
            const animationDelay =
              staggerStartSeconds !== undefined &&
              staggerStepSeconds !== undefined
                ? `${staggerStartSeconds + (lineup.length + index) * staggerStepSeconds}s`
                : undefined;

            return (
              <div
                key={`opp-${playerId}`}
                className={`absolute z-0 -translate-x-1/2 -translate-y-1/2 group ${opponentPinClassName}`}
                style={{
                  left: `${mirroredLeft}%`,
                  top: `${coord.x}%`,
                  animationDelay,
                }}
                title={`${player.name} - OVR ${calculateOverall(player)}`}
              >
                <div
                  className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 bg-slate-900/75 text-[10px] font-bold md:text-xs"
                  style={{
                    borderColor: opponentPinBorderColor,
                    color: opponentPinTextColor,
                    opacity: opponentPinOpacity,
                  }}
                >
                  {player.position}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bench area */}
      {!hideBench && (
        <div className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4">
          <div className="mb-2 md:mb-3">
            <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase">
              Bench ({benchCount}/{benchLimit})
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {substitutes.map((playerId, i) => {
              const player = playersById.get(playerId);
              const slot: PitchSlot = { type: 'bench', index: i };
              const isSelected =
                selectedSlot?.type === 'bench' && selectedSlot.index === i;
              const isHighlighted =
                !isSelected &&
                !!player &&
                highlightPositions?.length &&
                highlightPositions.includes(player.position);
              const isDropTarget =
                dropTargetSlot?.type === 'bench' && dropTargetSlot.index === i;
              const isDragging =
                draggedSlot?.type === 'bench' && draggedSlot.index === i;

              return (
                <div
                  key={playerId}
                  data-pitch-slot={JSON.stringify(slot)}
                  className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded min-w-[85px] md:min-w-[100px] ${getBenchSlotStyle(isSelected, isHighlighted)} ${isDropTarget ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-800 border-2 border-amber-400' : ''} ${isDragging ? 'opacity-50' : ''} ${getBenchSlotCursorClass(hasDnD, onPlayerClick)}`}
                  role="button"
                  tabIndex={0}
                  draggable={hasDnD}
                  onPointerDown={touchDragHandlers?.getPointerDown(slot)}
                  onPointerUp={touchDragHandlers?.getPointerUp()}
                  onPointerMove={touchDragHandlers?.getPointerMove()}
                  onDragStart={(e) => {
                    if (!hasDnD) return;
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify(slot),
                    );
                    e.dataTransfer.effectAllowed = 'move';
                    onDragStart?.(slot);
                  }}
                  onDragEnd={() => onDragEnd?.()}
                  onDragOver={(e) => {
                    if (hasDnD && draggedSlot) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      onDragOver?.(slot);
                    }
                  }}
                  onDragLeave={() => onDragLeave?.()}
                  onDrop={(e) => {
                    if (hasDnD) {
                      e.preventDefault();
                      onDrop?.(slot, e);
                    }
                  }}
                  onClick={() =>
                    onPlayerClick?.({ type: 'bench', index: i }, playerId)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ')
                      onPlayerClick?.({ type: 'bench', index: i }, playerId);
                  }}
                >
                  {isDropTarget ? (
                    <ReplaceIcon className="w-4 h-4 md:w-5 md:h-5 text-amber-400 shrink-0" />
                  ) : player ? (
                    <>
                      <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-slate-600 flex items-center justify-center text-[9px] md:text-[10px] font-bold text-pitch-400 shrink-0">
                        {player.position}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] md:text-xs text-white truncate">
                          {player.nickname ??
                            player.name.split(' ').pop() ??
                            '?'}
                        </p>
                        <p className="text-[9px] md:text-[10px] text-slate-400">
                          OVR {calculateOverall(player)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-500 text-xs">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
