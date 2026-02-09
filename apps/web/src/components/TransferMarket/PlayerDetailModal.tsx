import { useState, useEffect } from 'react';
import { formatCurrency } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import type { MarketPlayer } from '../../hooks/useTransfers';
import { getOverallColor } from '../../lib/ui-utils';

interface PlayerDetailModalProps {
  player: MarketPlayer;
  teamBudget: number;
  teamWageBudget: number;
  onClose: () => void;
  onMakeOffer: (
    offerAmount: number,
    offeredWage: number,
    contractYears: number,
  ) => Promise<void>;
  isSubmitting: boolean;
}

export function PlayerDetailModal({
  player,
  teamBudget,
  teamWageBudget,
  onClose,
  onMakeOffer,
  isSubmitting,
}: PlayerDetailModalProps) {
  const isFreeAgent = player.status === 'free_agent';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Initial offer values
  const [offerAmount, setOfferAmount] = useState(
    isFreeAgent ? 0 : Math.round(player.askingPrice * 0.9),
  );
  const [offeredWage, setOfferedWage] = useState(
    Math.round(player.currentWage * 1.1),
  );
  const [contractYears, setContractYears] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const canAffordFee = offerAmount <= teamBudget;
  const canAffordWage = offeredWage <= teamWageBudget * 0.1; // Max 10% of wage budget for single player
  const canSubmit = canAffordFee && canAffordWage && !isSubmitting;

  const handleSubmit = async () => {
    setError(null);
    try {
      await onMakeOffer(offerAmount, offeredWage, contractYears);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make offer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PositionBadge position={player.position} />
            <div>
              <h2 className="text-lg font-bold text-white">
                {player.playerName}
              </h2>
              <p className="text-sm text-slate-400">
                {player.teamName || 'Free Agent'} | {player.age} years old
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
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

        {/* Player Stats */}
        <div className="p-4 border-b border-slate-700">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div
                className={`text-2xl font-bold ${getOverallColor(player.overall)}`}
              >
                {player.overall}
              </div>
              <div className="text-xs text-slate-500 uppercase">Overall</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">
                {player.potential}
              </div>
              <div className="text-xs text-slate-500 uppercase">Potential</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">
                {player.contractEndSeason}
              </div>
              <div className="text-xs text-slate-500 uppercase">
                Contract End
              </div>
            </div>
          </div>
        </div>

        {/* Asking Values */}
        <div className="p-4 border-b border-slate-700 bg-slate-700/30">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500 uppercase mb-1">
                Asking Price
              </div>
              <div
                className={`text-xl font-bold ${isFreeAgent ? 'text-green-400' : 'text-pitch-400'}`}
              >
                {isFreeAgent ? 'FREE' : formatCurrency(player.askingPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase mb-1">
                Current Wage
              </div>
              <div className="text-xl font-bold text-amber-400">
                {formatCurrency(player.currentWage)}/wk
              </div>
            </div>
          </div>
        </div>

        {/* Offer Form */}
        <div className="p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase">
            {isFreeAgent ? 'Contract Offer' : 'Transfer Offer'}
          </h3>

          {/* Transfer Fee (not for free agents) */}
          {!isFreeAgent && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Transfer Fee
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  value={offerAmount}
                  onChange={(e) =>
                    setOfferAmount(parseInt(e.target.value) || 0)
                  }
                  className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-pitch-500 focus:outline-none"
                />
              </div>
              {!canAffordFee && (
                <p className="text-red-400 text-xs mt-1">
                  Exceeds transfer budget ({formatCurrency(teamBudget)})
                </p>
              )}
            </div>
          )}

          {/* Wage Offer */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Weekly Wage
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">$</span>
              <input
                type="number"
                value={offeredWage}
                onChange={(e) => setOfferedWage(parseInt(e.target.value) || 0)}
                className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-pitch-500 focus:outline-none"
              />
              <span className="text-slate-500">/wk</span>
            </div>
            {!canAffordWage && (
              <p className="text-yellow-400 text-xs mt-1">
                High wage for single player (max recommended:{' '}
                {formatCurrency(teamWageBudget * 0.1)})
              </p>
            )}
          </div>

          {/* Contract Length */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Contract Length
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((years) => (
                <button
                  key={years}
                  onClick={() => setContractYears(years)}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                    contractYears === years
                      ? 'bg-pitch-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {years} {years === 1 ? 'year' : 'years'}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Summary */}
          <div className="p-3 bg-slate-700/50 rounded space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Transfer Fee:</span>
              <span className="text-white">{formatCurrency(offerAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Weekly Wage:</span>
              <span className="text-white">{formatCurrency(offeredWage)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Contract:</span>
              <span className="text-white">
                {contractYears} {contractYears === 1 ? 'year' : 'years'}
              </span>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-600 flex justify-between font-medium">
              <span className="text-slate-300">Total Cost:</span>
              <span className="text-pitch-400">
                {formatCurrency(offerAmount + offeredWage * 52 * contractYears)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-lg font-bold transition-colors ${
              canSubmit
                ? 'bg-pitch-600 hover:bg-pitch-500 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting
              ? 'Submitting...'
              : isFreeAgent
                ? 'Offer Contract'
                : 'Make Offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
