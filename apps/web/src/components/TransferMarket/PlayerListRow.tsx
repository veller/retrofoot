import { formatCurrency } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import type { MarketPlayer } from '../../hooks/useTransfers';
import { getOverallColor } from '../../lib/ui-utils';

interface PlayerListRowProps {
  player: MarketPlayer;
  onClick: () => void;
  isSelected?: boolean;
}

function getStatusBadge(
  status: string,
): { label: string; className: string } | null {
  switch (status) {
    // Removed 'contract_expiring' badge - user found it confusing
    // (made it seem like listings expire, but they don't)
    case 'free_agent':
      return {
        label: 'Free',
        className: 'bg-green-500/20 text-green-400 border-green-500/50',
      };
    default:
      return null;
  }
}

export function PlayerListRow({
  player,
  onClick,
  isSelected,
}: PlayerListRowProps) {
  const statusBadge = getStatusBadge(player.status);
  const isFreeAgent = player.status === 'free_agent';

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'bg-pitch-900/50 border-pitch-500'
          : 'bg-slate-700/30 border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500'
      }`}
    >
      {/* Mobile layout */}
      <div className="md:hidden p-2.5 space-y-1">
        <div className="flex items-start gap-2">
          <PositionBadge position={player.position} />
          <div className="flex-1 min-w-0">
            <span className="text-white font-medium text-[13px] truncate block">
              {player.playerName}
            </span>
          </div>
          <div className="text-right shrink-0 leading-tight">
            <div className={`text-[13px] font-bold ${getOverallColor(player.overall)}`}>
              {player.overall}
            </div>
            <div className="text-[10px] text-slate-500">
              POT{' '}
              <span
                className={
                  player.potential > player.overall
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }
              >
                {player.potential}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 min-w-0 text-slate-400">
            <span className="truncate">
              {player.teamName || (
                <span className="italic text-slate-500">No Club</span>
              )}
            </span>
            <span className="shrink-0">{player.age}y</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={isFreeAgent ? 'text-green-400' : 'text-pitch-400'}>
              {isFreeAgent ? 'FREE' : formatCurrency(player.askingPrice)}
            </span>
            <span className="text-amber-400">
              {formatCurrency(player.currentWage)}/wk
            </span>
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex items-center gap-3 px-3 py-2">
        <PositionBadge position={player.position} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium truncate">
              {player.playerName}
            </span>
            {statusBadge && (
              <span
                className={`px-1.5 py-0.5 text-xs font-medium rounded border ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            )}
          </div>
        </div>

        <div className="w-28 text-sm text-slate-400 truncate">
          {player.teamName || (
            <span className="italic text-slate-500">No Club</span>
          )}
        </div>

        <div className="w-10 text-center text-sm text-slate-400">{player.age}</div>

        <div
          className={`w-10 text-center font-bold ${getOverallColor(player.overall)}`}
        >
          {player.overall}
        </div>

        <div className="w-10 text-center text-sm">
          <span
            className={
              player.potential > player.overall ? 'text-amber-400' : 'text-slate-400'
            }
          >
            {player.potential}
          </span>
        </div>

        <div className="w-24 text-right text-sm">
          <span className={isFreeAgent ? 'text-green-400' : 'text-pitch-400'}>
            {isFreeAgent ? 'FREE' : formatCurrency(player.askingPrice)}
          </span>
        </div>

        <div className="w-20 text-right text-sm text-amber-400">
          {formatCurrency(player.currentWage)}/wk
        </div>

        <div className="w-5 text-slate-500">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Header row for the list
export function PlayerListHeader() {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
      <div className="w-10">Pos</div>
      <div className="flex-1">Player</div>
      <div className="w-28 hidden sm:block">Team</div>
      <div className="w-10 text-center">Age</div>
      <div className="w-10 text-center">OVR</div>
      <div className="w-10 text-center">POT</div>
      <div className="w-24 text-right">Price</div>
      <div className="w-20 text-right hidden md:block">Wage</div>
      <div className="w-5"></div>
    </div>
  );
}
