import { useState, useEffect } from 'react';
import {
  formatCurrency,
  calculateOverall,
  getFormDisplayStatus,
  type Player,
} from '@retrofoot/core';
import { FormStatusBadge } from './FormStatusBadge';
import { PositionBadge } from './PositionBadge';

interface PlayerActionModalProps {
  player: Player;
  isListed: boolean;
  isInLineup: boolean;
  isOnBench: boolean;
  canAddToBench: boolean;
  onClose: () => void;
  onListForSale: (askingPrice?: number) => Promise<void>;
  onRemoveListing: () => Promise<void>;
  onAddToBench?: () => void;
  isSubmitting: boolean;
}

export function PlayerActionModal({
  player,
  isListed,
  isInLineup,
  isOnBench,
  canAddToBench,
  onClose,
  onListForSale,
  onRemoveListing,
  onAddToBench,
  isSubmitting,
}: PlayerActionModalProps) {
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState(player.marketValue);
  const [error, setError] = useState<string | null>(null);

  const overall = calculateOverall(player);
  const suggestedPrice = player.marketValue;
  const playerDisplayName = player.nickname ?? player.name;

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Form display: HOT only; no COLD badge
  const ratings = player.form.lastFiveRatings ?? [];
  const formStatus = getFormDisplayStatus(ratings);
  const recentAvg =
    ratings.length >= 2
      ? ratings.slice(-2).reduce((a, b) => a + b, 0) / 2
      : null;
  const olderAvg =
    ratings.length >= 3
      ? ratings.slice(0, -2).reduce((a, b) => a + b, 0) / (ratings.length - 2)
      : null;
  const formatRating = (n: number) => n.toFixed(1);

  let formExplanation: string;
  if (ratings.length < 3) {
    formExplanation =
      'Based on match ratings. Need at least 3 games to show form trend.';
  } else if (formStatus === 'hot') {
    formExplanation = `Form improving — last 2 match ratings (${formatRating(recentAvg!)} avg) are better than earlier games (${formatRating(olderAvg!)} avg). HOT is lost if the latest game rating drops.`;
  } else {
    formExplanation = `Form: recent match ratings in line with earlier games (${formatRating(recentAvg!)} vs ${formatRating(olderAvg!)} avg).`;
  }

  const handleListForSale = async () => {
    setError(null);

    // Validate custom price if enabled
    if (useCustomPrice && customPrice <= 0) {
      setError('Asking price must be greater than $0');
      return;
    }

    try {
      const price = useCustomPrice ? customPrice : undefined;
      await onListForSale(price);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list player');
    }
  };

  const handleRemoveListing = async () => {
    setError(null);
    try {
      await onRemoveListing();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove listing');
    }
  };

  const handleAddToBench = () => {
    onAddToBench?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      {/* Mobile: Bottom sheet | Desktop: Centered modal */}
      <div
        className="bg-slate-800 w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl border border-slate-700 max-h-[85vh] flex flex-col animate-slide-up sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <PositionBadge position={player.position} />
            <div className="min-w-0">
              <h2 className="text-white font-bold text-lg truncate">
                {playerDisplayName}
              </h2>
              <p className="text-slate-400 text-sm">{player.age} years old</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 -mr-2"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="px-5 py-4 border-b border-slate-700">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-pitch-400 font-bold text-xl">{overall}</div>
              <div className="text-slate-500 text-xs uppercase">Overall</div>
            </div>
            <div className="text-center">
              <div className="text-amber-400 font-bold text-sm">
                {formatCurrency(player.wage)}
              </div>
              <div className="text-slate-500 text-xs uppercase">Wage/wk</div>
            </div>
            <div className="text-center">
              <div className="text-slate-300 font-bold text-sm">
                {player.contractEndSeason}
              </div>
              <div className="text-slate-500 text-xs uppercase">Contract</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-center gap-6 text-sm">
            <span className="text-slate-400">
              Goals:{' '}
              <span className="text-white font-medium">
                {player.form.seasonGoals}
              </span>
            </span>
            <span className="text-slate-400">
              Assists:{' '}
              <span className="text-white font-medium">
                {player.form.seasonAssists}
              </span>
            </span>
          </div>

          {/* Form trend */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-slate-500 text-xs uppercase">Form</span>
              {formStatus === 'hot' && (
                <FormStatusBadge
                  status="hot"
                  size="md"
                  title="Form improving"
                />
              )}
            </div>
            <p className="text-slate-400 text-xs leading-snug">
              {formExplanation}
            </p>
          </div>
        </div>

        {/* Status Badge - only when listed for sale */}
        {isListed && (
          <div className="px-5 py-3 border-b border-slate-700">
            <span className="px-2 py-1 bg-amber-600/30 text-amber-400 text-xs font-bold rounded border border-amber-500/50">
              LISTED FOR SALE
            </span>
          </div>
        )}

        {/* Actions Section */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Bench Actions */}
          {canAddToBench && !isInLineup && !isOnBench && (
            <button
              onClick={handleAddToBench}
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-pitch-600 hover:bg-pitch-500 disabled:bg-pitch-600/50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
            >
              <span>Send to Bench</span>
            </button>
          )}

          {/* Transfer Actions */}
          {!isListed ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Market Value</span>
                <span className="text-white font-medium">
                  {formatCurrency(suggestedPrice)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="customPrice"
                  checked={useCustomPrice}
                  onChange={(e) => setUseCustomPrice(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-pitch-500 focus:ring-pitch-500"
                />
                <label htmlFor="customPrice" className="text-slate-400 text-sm">
                  Set custom asking price
                </label>
              </div>

              {useCustomPrice && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">$</span>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Number(e.target.value))}
                    min={0}
                    step={100000}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-pitch-500 focus:border-transparent"
                  />
                </div>
              )}

              <button
                onClick={handleListForSale}
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Listing...</span>
                ) : (
                  <span>List for Sale</span>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={handleRemoveListing}
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[48px]"
            >
              {isSubmitting ? (
                <span className="animate-pulse">Removing...</span>
              ) : (
                <span>Remove from Market</span>
              )}
            </button>
          )}
        </div>

        {/* Footer padding for mobile */}
        <div className="h-safe-area-inset-bottom sm:hidden" />
      </div>
    </div>
  );
}
