import { formatCurrency } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import type { MarketPlayer } from '../../hooks/useTransfers';
import { getOverallColor } from '../../lib/ui-utils';

interface PlayerListingCardProps {
  player: MarketPlayer;
  onClick: () => void;
  isSelected?: boolean;
}

function getStatusBadge(status: string): { label: string; className: string } | null {
  switch (status) {
    case 'contract_expiring':
      return {
        label: 'Contract Expiring',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      };
    case 'free_agent':
      return {
        label: 'Free Agent',
        className: 'bg-green-500/20 text-green-400 border-green-500/50',
      };
    default:
      return null;
  }
}

export function PlayerListingCard({
  player,
  onClick,
  isSelected,
}: PlayerListingCardProps) {
  const statusBadge = getStatusBadge(player.status);
  const isFreeAgent = player.status === 'free_agent';

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'bg-pitch-900/50 border-pitch-500'
          : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-slate-500'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name and Position */}
          <div className="flex items-center gap-2 mb-1">
            <PositionBadge position={player.position} />
            <span className="text-white font-medium truncate">
              {player.playerName}
            </span>
          </div>

          {/* Team and Age */}
          <div className="flex items-center gap-2 text-sm text-slate-400">
            {player.teamName ? (
              <span>{player.teamName}</span>
            ) : (
              <span className="text-slate-500 italic">No Club</span>
            )}
            <span className="text-slate-600">|</span>
            <span>{player.age}y</span>
          </div>

          {/* Status Badge */}
          {statusBadge && (
            <span
              className={`inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded border ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="text-right flex-shrink-0">
          <div className={`text-lg font-bold ${getOverallColor(player.overall)}`}>
            {player.overall}
          </div>
          <div className="text-xs text-slate-500">OVR</div>
          {player.potential > player.overall && (
            <div className="text-xs text-amber-500 mt-1">
              POT {player.potential}
            </div>
          )}
        </div>
      </div>

      {/* Price and Wage */}
      <div className="mt-3 pt-3 border-t border-slate-600/50 flex items-center justify-between text-sm">
        <div>
          <span className="text-slate-500">Price: </span>
          <span className={isFreeAgent ? 'text-green-400' : 'text-pitch-400'}>
            {isFreeAgent ? 'FREE' : formatCurrency(player.askingPrice)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Wage: </span>
          <span className="text-amber-400">
            {formatCurrency(player.currentWage)}/wk
          </span>
        </div>
      </div>
    </div>
  );
}
