import type { Player, FormationType, Position } from '@retrofoot/core';
import {
  getFormationSlotCoordinates,
  calculateOverall,
  type SlotCoordinate,
} from '@retrofoot/core';

export type PitchSlot =
  | { type: 'lineup'; index: number }
  | { type: 'bench'; index: number };

interface PitchViewProps {
  lineup: string[];
  substitutes: string[];
  playersById: Map<string, Player>;
  formation: FormationType;
  onPlayerClick?: (slot: PitchSlot, playerId: string | undefined) => void;
  selectedSlot?: PitchSlot | null;
  /** When set, players with these positions get a highlight (e.g. same defensive/mid/attack group) */
  highlightPositions?: Position[] | null;
  onRemoveFromBench?: (playerId: string) => void;
  benchLimit?: number;
}

export function PitchView({
  lineup,
  substitutes,
  playersById,
  formation,
  onPlayerClick,
  selectedSlot,
  highlightPositions,
  onRemoveFromBench,
  benchLimit = 7,
}: PitchViewProps) {
  const benchCount = substitutes.length;
  const overLimit = benchCount > benchLimit;
  const excessCount = overLimit ? benchCount - benchLimit : 0;
  const coordinates = getFormationSlotCoordinates(formation);

  return (
    <div className="flex flex-col gap-4 items-center">
      {/* Football pitch - horizontal, aspect ratio 105:68 (length:width) */}
      <div className="w-full">
        <div
          id="pitch-container"
          className="relative w-full rounded-lg overflow-hidden border-2 border-white/80"
          style={{
            aspectRatio: '105 / 68',
            background:
              'repeating-linear-gradient(90deg, #50A66E 0px, #50A66E 12px, #489362 12px, #489362 24px)',
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

            const isSelected =
              selectedSlot?.type === 'lineup' && selectedSlot.index === index;
            const isHighlighted =
              !isSelected &&
              highlightPositions?.length &&
              highlightPositions.includes(player.position);

            return (
              <div
                key={playerId}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{
                  left: `${coord.x}%`,
                  top: `${coord.y}%`,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onPlayerClick?.({ type: 'lineup', index }, playerId)
                  }
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') &&
                    onPlayerClick?.({ type: 'lineup', index }, playerId)
                  }
                  className={`w-10 h-10 rounded-full bg-slate-800 border-2 flex items-center justify-center text-xs font-bold text-white shadow-lg ${
                    isSelected
                      ? 'border-yellow-400 ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900'
                      : isHighlighted
                        ? 'border-cyan-400 ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-slate-900'
                        : 'border-pitch-400'
                  } ${onPlayerClick ? 'cursor-pointer hover:border-pitch-300' : 'cursor-default'}`}
                  title={`${player.name} - OVR ${overall}`}
                >
                  {player.position}
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block z-10 px-2 py-1 bg-slate-900/95 border border-slate-600 rounded text-xs whitespace-nowrap">
                  {displayName} ({overall})
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bench area */}
      <div className="w-full bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-400 uppercase">
            Bench ({benchCount}/{benchLimit})
          </h3>
          {overLimit && (
            <p className="text-xs text-amber-400 mt-1">
              You must remove {excessCount} player{excessCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {substitutes.map((playerId, i) => {
            const player = playersById.get(playerId);
            const isSelected =
              selectedSlot?.type === 'bench' && selectedSlot.index === i;
            const isHighlighted =
              !isSelected &&
              !!player &&
              highlightPositions?.length &&
              highlightPositions.includes(player.position);

            return (
              <div
                key={playerId}
                className={`flex items-center gap-2 px-3 py-2 rounded min-w-[100px] ${
                  isSelected
                    ? 'bg-yellow-900/40 border-2 border-yellow-400'
                    : isHighlighted
                      ? 'bg-cyan-900/30 border-2 border-cyan-500/70'
                      : 'bg-slate-700/80'
                } ${onPlayerClick ? 'cursor-pointer hover:bg-slate-600/80' : ''}`}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-remove]'))
                    return;
                  onPlayerClick?.({ type: 'bench', index: i }, playerId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if ((e.target as HTMLElement).closest('[data-remove]'))
                      return;
                    onPlayerClick?.({ type: 'bench', index: i }, playerId);
                  }
                }}
              >
                {player ? (
                  <>
                    <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-bold text-pitch-400 shrink-0">
                      {player.position}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">
                        {player.nickname ?? player.name.split(' ').pop() ?? '?'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        OVR {calculateOverall(player)}
                      </p>
                    </div>
                    {onRemoveFromBench && (
                      <button
                        data-remove
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFromBench(playerId);
                        }}
                        className="text-slate-400 hover:text-white shrink-0 p-1 rounded"
                        title="Remove from bench"
                        aria-label="Remove from bench"
                      >
                        &times;
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500 text-xs">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
