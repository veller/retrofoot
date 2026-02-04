import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import {
  type MarketPlayer,
  negotiateTransfer,
} from '../../hooks/useTransfers';
import { getOverallColor } from '../../lib/ui-utils';
import {
  getSmartIncrement,
  parseMonetaryInput,
  roundToThousand,
} from './utils';

interface NegotiationModalProps {
  player: MarketPlayer;
  teamBudget: number;
  teamWageBudget: number;
  saveId: string;
  onClose: () => void;
  onComplete: (result: { transferId: string; finalFee: number; finalWage: number }) => void;
}

interface NegotiationRound {
  type: 'offer' | 'response';
  fee: number;
  wage: number;
  action?: 'accept' | 'reject' | 'counter';
  reason?: string;
}

export function NegotiationModal({
  player,
  teamBudget,
  teamWageBudget,
  saveId,
  onClose,
  onComplete,
}: NegotiationModalProps) {
  const isFreeAgent = player.status === 'free_agent';

  // Offer form state - round to nearest thousand for cleaner UX
  const [offerFee, setOfferFee] = useState(
    isFreeAgent ? 0 : roundToThousand(player.askingPrice),
  );
  const [offerWage, setOfferWage] = useState(
    roundToThousand(player.currentWage * 1.1),
  );
  const [contractYears, setContractYears] = useState(3);
  const [error, setError] = useState<string | null>(null);

  // Negotiation state
  const [history, setHistory] = useState<NegotiationRound[]>([]);
  const [negotiationId, setNegotiationId] = useState<string | null>(null);
  const [aiCounter, setAiCounter] = useState<{ fee: number; wage: number } | null>(null);
  const [canCounter, setCanCounter] = useState(true);
  const [round, setRound] = useState(0);
  const [completed, setCompleted] = useState<{
    transferId: string;
    finalFee: number;
    finalWage: number;
  } | null>(null);
  const [rejected, setRejected] = useState(false); // Track when seller walks away
  const [isNegotiating, setIsNegotiating] = useState(false);

  // Ref for auto-scrolling history to bottom (newest messages)
  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const canAffordFee = offerFee <= teamBudget;
  const canAffordWage = offerWage <= teamWageBudget * 0.1;
  const canSubmit = canAffordFee && !isNegotiating && !completed && !rejected;

  const handleNegotiate = useCallback(async (
    fee: number,
    wage: number,
    years: number,
    action?: 'counter' | 'accept' | 'walkaway',
  ) => {
    setError(null);
    setIsNegotiating(true);

    try {
      // Add our offer to history (unless accepting)
      if (action !== 'accept') {
        setHistory((prev) => [
          ...prev,
          { type: 'offer', fee, wage },
        ]);
      }

      const result = await negotiateTransfer(
        saveId,
        player.playerId,
        player.teamId,
        { fee, wage, years },
        negotiationId ?? undefined,
        action,
      );

      if (!result.success || !result.result) {
        setError(result.error || 'Negotiation failed');
        // Remove the offer we just added
        if (action !== 'accept') {
          setHistory((prev) => prev.slice(0, -1));
        }
        return;
      }

      const neg = result.result;
      setNegotiationId(neg.negotiationId);
      setRound(neg.round);
      setCanCounter(neg.canCounter);

      // Add AI response to history
      setHistory((prev) => [
        ...prev,
        {
          type: 'response',
          fee: neg.aiResponse.counterFee ?? fee,
          wage: neg.aiResponse.counterWage ?? wage,
          action: neg.aiResponse.action,
          reason: neg.aiResponse.reason,
        },
      ]);

      if (neg.aiResponse.action === 'counter' &&
          neg.aiResponse.counterFee !== undefined &&
          neg.aiResponse.counterWage !== undefined) {
        setAiCounter({
          fee: neg.aiResponse.counterFee,
          wage: neg.aiResponse.counterWage,
        });
        // Pre-fill with midpoint for next counter (rounded to nearest thousand)
        setOfferFee(roundToThousand((fee + neg.aiResponse.counterFee) / 2));
        setOfferWage(roundToThousand((wage + neg.aiResponse.counterWage) / 2));
      } else if (neg.aiResponse.action === 'reject') {
        // Seller walked away - negotiation is OVER
        setRejected(true);
        setAiCounter(null);
      } else {
        setAiCounter(null);
      }

      if (neg.completed) {
        setCompleted(neg.completed);
        onComplete(neg.completed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Negotiation failed');
    } finally {
      setIsNegotiating(false);
    }
  }, [saveId, player.playerId, player.teamId, negotiationId, onComplete]);

  const handleSubmitOffer = () => {
    handleNegotiate(offerFee, offerWage, contractYears);
  };

  const handleAcceptCounter = () => {
    if (aiCounter) {
      handleNegotiate(aiCounter.fee, aiCounter.wage, contractYears, 'accept');
    }
  };

  const handleCounterAgain = () => {
    setAiCounter(null);
  };

  const handleWalkAway = () => {
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={isNegotiating ? undefined : onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="negotiation-modal-title"
        className="relative bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PositionBadge position={player.position} />
            <div>
              <h2 id="negotiation-modal-title" className="text-lg font-bold text-white">
                {player.playerName}
              </h2>
              <p className="text-sm text-slate-400">
                {player.teamName || 'Free Agent'} | {player.age} years old
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isNegotiating}
            aria-label="Close dialog"
            className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                {isFreeAgent ? 'Wage Demand' : 'Current Wage'}
              </div>
              <div className="text-xl font-bold text-amber-400">
                {formatCurrency(player.currentWage)}/wk
              </div>
            </div>
          </div>
        </div>

        {/* Negotiation History */}
        {history.length > 0 && (
          <div className="border-b border-slate-700">
            <div className="px-4 py-2 bg-slate-700/30 border-b border-slate-600">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Negotiation History
              </h3>
            </div>
            <div
              ref={historyRef}
              className="p-4 space-y-3 max-h-48 overflow-y-auto"
            >
              {history.map((entry, idx) => {
                const roundNum = Math.floor(idx / 2) + 1;
                const isUserOffer = entry.type === 'offer';

                return (
                  <div
                    key={idx}
                    className={`flex ${isUserOffer ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-lg ${
                        isUserOffer
                          ? 'bg-pitch-600/20 border border-pitch-500/50 rounded-br-none'
                          : 'bg-slate-700/70 border border-slate-600 rounded-bl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <span className={`text-xs font-medium ${isUserOffer ? 'text-pitch-400' : 'text-slate-300'}`}>
                          {isUserOffer ? 'You' : player.teamName || 'Player'}
                        </span>
                        <span className="text-xs text-slate-500">R{roundNum}</span>
                      </div>
                      {entry.action && (
                        <div
                          className={`text-sm font-semibold mb-1 ${
                            entry.action === 'accept'
                              ? 'text-green-400'
                              : entry.action === 'reject'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {entry.action === 'accept'
                            ? '✓ Deal Accepted!'
                            : entry.action === 'reject'
                              ? '✗ Rejected'
                              : '↔ Counter'}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-sm">
                        {!isFreeAgent && (
                          <>
                            <span className="text-pitch-400 font-medium">
                              {formatCurrency(entry.fee)}
                            </span>
                            <span className="text-slate-500">•</span>
                          </>
                        )}
                        <span className="text-amber-400 font-medium">
                          {formatCurrency(entry.wage)}/wk
                        </span>
                      </div>
                      {entry.reason && (
                        <div className="text-xs text-slate-400 mt-2 italic border-t border-slate-600/50 pt-2">
                          "{entry.reason}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Transfer */}
        {completed && (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-xl font-bold text-green-400 mb-2">
              Transfer Complete!
            </h3>
            <p className="text-slate-400 mb-4">
              {player.playerName} has joined your team
            </p>
            <div className="flex justify-center gap-6 text-sm">
              {completed.finalFee > 0 && (
                <div>
                  <span className="text-slate-500">Fee: </span>
                  <span className="text-pitch-400 font-medium">
                    {formatCurrency(completed.finalFee)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-500">Wage: </span>
                <span className="text-amber-400 font-medium">
                  {formatCurrency(completed.finalWage)}/wk
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-pitch-600 hover:bg-pitch-500 text-white rounded-lg font-medium"
            >
              Done
            </button>
          </div>
        )}

        {/* Rejected - Seller Walked Away */}
        {rejected && !completed && (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">💔</div>
            <h3 className="text-xl font-bold text-red-400 mb-2">
              Seller Walked Away
            </h3>
            <p className="text-slate-400 mb-4">
              {player.teamName || 'The player'} has ended negotiations for {player.playerName}.
              They won't entertain offers for this player for a while.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium"
            >
              Close
            </button>
          </div>
        )}

        {/* AI Counter Offer Actions */}
        {aiCounter && !completed && !rejected && (
          <div className="p-4 border-b border-slate-700 bg-amber-900/20">
            <h4 className="text-sm font-bold text-amber-400 mb-3">
              Counter Offer Received
            </h4>
            <div className="flex gap-3">
              <button
                onClick={handleAcceptCounter}
                disabled={isNegotiating}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded disabled:opacity-50"
              >
                Accept
              </button>
              {canCounter && (
                <button
                  onClick={handleCounterAgain}
                  disabled={isNegotiating}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded disabled:opacity-50"
                >
                  Counter Again
                </button>
              )}
              <button
                onClick={handleWalkAway}
                disabled={isNegotiating}
                className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded disabled:opacity-50"
              >
                Walk Away
              </button>
            </div>
            {!canCounter && (
              <p className="text-xs text-amber-400/70 mt-2 text-center">
                Final offer - no more counters allowed
              </p>
            )}
          </div>
        )}

        {/* Offer Form */}
        {!completed && !rejected && !aiCounter && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-400 uppercase">
                {history.length > 0
                  ? 'Your Counter Offer'
                  : isFreeAgent
                    ? 'Contract Offer'
                    : 'Transfer Offer'}
              </h3>
              {round > 0 && (
                <span className="text-xs text-slate-500">
                  Round {round}/2
                </span>
              )}
            </div>

            {/* Transfer Fee */}
            {!isFreeAgent && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Transfer Fee
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferFee(Math.max(0, offerFee - getSmartIncrement(offerFee)))}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    value={formatCurrency(offerFee)}
                    onChange={(e) => setOfferFee(parseMonetaryInput(e.target.value))}
                    className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-pitch-500 focus:outline-none text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setOfferFee(offerFee + getSmartIncrement(offerFee))}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                  >
                    +
                  </button>
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
                <button
                  type="button"
                  onClick={() => setOfferWage(Math.max(0, offerWage - getSmartIncrement(offerWage)))}
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                >
                  −
                </button>
                <input
                  type="text"
                  value={formatCurrency(offerWage)}
                  onChange={(e) => setOfferWage(parseMonetaryInput(e.target.value))}
                  className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-pitch-500 focus:outline-none text-center"
                />
                <button
                  type="button"
                  onClick={() => setOfferWage(offerWage + getSmartIncrement(offerWage))}
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                >
                  +
                </button>
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
                    {years}y
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

            {/* Submit Button */}
            <button
              onClick={handleSubmitOffer}
              disabled={!canSubmit}
              className={`w-full py-3 rounded-lg font-bold transition-colors ${
                canSubmit
                  ? 'bg-pitch-600 hover:bg-pitch-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isNegotiating
                ? 'Negotiating...'
                : history.length > 0
                  ? 'Send Counter'
                  : isFreeAgent
                    ? 'Offer Contract'
                    : 'Make Offer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Use portal to render at document body level for proper overlay
  return createPortal(modalContent, document.body);
}
