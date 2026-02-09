import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, type Position } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import {
  type ActiveOffer,
  negotiateIncomingOffer,
} from '../../hooks/useTransfers';
import {
  getSmartIncrement,
  parseMonetaryInput,
  roundToThousand,
} from './utils';

interface CounterOfferModalProps {
  offer: ActiveOffer;
  saveId: string;
  onClose: () => void;
  onComplete: (result: {
    transferId: string;
    finalFee: number;
    finalWage: number;
  }) => void;
  onRejected?: () => void; // Called when AI walks away - parent should refetch offers
}

interface NegotiationRound {
  type: 'offer' | 'response';
  fee: number;
  wage: number;
  action?: 'accept' | 'reject' | 'counter';
  reason?: string;
}

export function CounterOfferModal({
  offer,
  saveId,
  onClose,
  onComplete,
  onRejected,
}: CounterOfferModalProps) {
  // Counter offer form state - round to nearest thousand for cleaner UX
  const [counterFee, setCounterFee] = useState(
    roundToThousand(offer.offerAmount * 1.2),
  );
  const [counterWage, setCounterWage] = useState(
    roundToThousand(offer.offeredWage),
  );
  const [error, setError] = useState<string | null>(null);

  // Negotiation state
  const [history, setHistory] = useState<NegotiationRound[]>([]);
  const [negotiationId, setNegotiationId] = useState<string | null>(null);
  const [aiCounter, setAiCounter] = useState<{
    fee: number;
    wage: number;
  } | null>(null);
  const [canCounter, setCanCounter] = useState(true);
  const [round, setRound] = useState(0);
  const [completed, setCompleted] = useState<{
    transferId: string;
    finalFee: number;
    finalWage: number;
  } | null>(null);
  const [rejected, setRejected] = useState(false); // Track when AI walks away
  const [isNegotiating, setIsNegotiating] = useState(false);

  // Ref for auto-scrolling history to bottom (newest messages)
  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleNegotiate = useCallback(
    async (action: 'accept' | 'reject' | 'counter') => {
      setError(null);
      setIsNegotiating(true);

      try {
        // Add our counter to history (unless accepting or rejecting outright)
        if (action === 'counter') {
          setHistory((prev) => [
            ...prev,
            { type: 'offer', fee: counterFee, wage: counterWage },
          ]);
        }

        const result = await negotiateIncomingOffer(
          saveId,
          offer.id,
          action,
          action === 'counter'
            ? { fee: counterFee, wage: counterWage }
            : undefined,
          negotiationId ?? undefined,
        );

        if (!result.success || !result.result) {
          setError(result.error || 'Negotiation failed');
          // Remove the offer we just added
          if (action === 'counter') {
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
            fee: neg.aiResponse.counterFee ?? counterFee,
            wage: neg.aiResponse.counterWage ?? counterWage,
            action: neg.aiResponse.action,
            reason: neg.aiResponse.reason,
          },
        ]);

        if (
          neg.aiResponse.action === 'counter' &&
          neg.aiResponse.counterFee !== undefined &&
          neg.aiResponse.counterWage !== undefined
        ) {
          setAiCounter({
            fee: neg.aiResponse.counterFee,
            wage: neg.aiResponse.counterWage,
          });
          // Pre-fill with midpoint for next counter (rounded to nearest thousand)
          setCounterFee(
            roundToThousand((counterFee + neg.aiResponse.counterFee) / 2),
          );
          setCounterWage(
            roundToThousand((counterWage + neg.aiResponse.counterWage) / 2),
          );
        } else if (neg.aiResponse.action === 'reject') {
          // AI walked away - negotiation is OVER
          setRejected(true);
          setAiCounter(null);
          onRejected?.(); // Notify parent to refetch offers
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
    },
    [
      saveId,
      offer.id,
      counterFee,
      counterWage,
      negotiationId,
      onComplete,
      onRejected,
    ],
  );

  const handleSubmitCounter = () => {
    handleNegotiate('counter');
  };

  const handleAcceptAiCounter = () => {
    handleNegotiate('accept');
  };

  const handleCounterAgain = () => {
    setAiCounter(null);
  };

  const handleWalkAway = () => {
    // User walks away - just close the modal
    onClose();
  };

  // Determine modal title based on state
  const getTitle = () => {
    if (completed) return 'Sale Complete!';
    if (rejected) return 'Negotiation Failed';
    return 'Counter Offer Negotiation';
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="counter-offer-modal-title"
        className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h3
              id="counter-offer-modal-title"
              className="text-lg font-bold text-white"
            >
              {getTitle()}
            </h3>
            <button
              onClick={onClose}
              disabled={isNegotiating}
              aria-label="Close dialog"
              className="text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
        </div>

        {/* Player Info */}
        <div className="p-4 border-b border-slate-700 bg-slate-700/30">
          <div className="flex items-center gap-3">
            <PositionBadge position={offer.playerPosition as Position} />
            <div>
              <div className="text-white font-medium">{offer.playerName}</div>
              <div className="text-sm text-slate-400">
                Buyer: {offer.toTeamName}
              </div>
            </div>
          </div>
        </div>

        {/* Original Offer */}
        <div className="p-4 border-b border-slate-700">
          <p className="text-sm text-slate-400 mb-2">Their Original Offer:</p>
          <div className="flex gap-4">
            <div>
              <span className="text-slate-500 text-sm">Fee: </span>
              <span className="text-pitch-400 font-medium">
                {formatCurrency(offer.offerAmount)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-sm">Wage: </span>
              <span className="text-amber-400 font-medium">
                {formatCurrency(offer.offeredWage)}/wk
              </span>
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
                        <span
                          className={`text-xs font-medium ${isUserOffer ? 'text-pitch-400' : 'text-slate-300'}`}
                        >
                          {isUserOffer ? 'You' : offer.toTeamName}
                        </span>
                        <span className="text-xs text-slate-500">
                          R{roundNum}
                        </span>
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
                              ? '✗ Walked Away'
                              : '↔ Counter'}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-pitch-400 font-medium">
                          {formatCurrency(entry.fee)}
                        </span>
                        <span className="text-slate-500">•</span>
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

        {/* Completed Sale */}
        {completed && (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-xl font-bold text-green-400 mb-2">
              Player Sold!
            </h3>
            <p className="text-slate-400 mb-4">
              {offer.playerName} has been sold to {offer.toTeamName}
            </p>
            <div className="flex justify-center gap-6 text-sm">
              <div>
                <span className="text-slate-500">Fee: </span>
                <span className="text-pitch-400 font-medium">
                  {formatCurrency(completed.finalFee)}
                </span>
              </div>
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

        {/* Rejected - AI Walked Away */}
        {rejected && !completed && (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">💔</div>
            <h3 className="text-xl font-bold text-red-400 mb-2">
              Buyer Walked Away
            </h3>
            <p className="text-slate-400 mb-4">
              {offer.toTeamName} has ended negotiations for {offer.playerName}.
              They won't make another offer for this player for a while.
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
              Buyer Counter Offer Received
            </h4>
            <div className="flex gap-3">
              <button
                onClick={handleAcceptAiCounter}
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

        {/* Counter Form - only show if not completed and not rejected and no AI counter pending */}
        {!completed && !rejected && !aiCounter && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-400 uppercase">
                {history.length > 0
                  ? 'Your Counter Offer'
                  : 'Make Counter Offer'}
              </h3>
              {round > 0 && (
                <span className="text-xs text-slate-500">Round {round}/2</span>
              )}
            </div>

            {/* Counter Fee */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Your Counter Fee
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCounterFee(
                      Math.max(0, counterFee - getSmartIncrement(counterFee)),
                    )
                  }
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                >
                  −
                </button>
                <input
                  type="text"
                  value={formatCurrency(counterFee)}
                  onChange={(e) =>
                    setCounterFee(parseMonetaryInput(e.target.value))
                  }
                  className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-pitch-500 focus:outline-none text-center"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCounterFee(counterFee + getSmartIncrement(counterFee))
                  }
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Their offer: {formatCurrency(offer.offerAmount)}
              </p>
            </div>

            {/* Counter Wage */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Your Counter Wage (per week)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCounterWage(
                      Math.max(0, counterWage - getSmartIncrement(counterWage)),
                    )
                  }
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                >
                  −
                </button>
                <input
                  type="text"
                  value={formatCurrency(counterWage)}
                  onChange={(e) =>
                    setCounterWage(parseMonetaryInput(e.target.value))
                  }
                  className="flex-1 bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:border-pitch-500 focus:outline-none text-center"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCounterWage(counterWage + getSmartIncrement(counterWage))
                  }
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-bold"
                >
                  +
                </button>
                <span className="text-slate-500">/wk</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Their offer: {formatCurrency(offer.offeredWage)}/wk
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isNegotiating}
                className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitCounter}
                disabled={isNegotiating}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                {isNegotiating ? 'Negotiating...' : 'Send Counter'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Use portal to render at document body level for proper overlay
  return createPortal(modalContent, document.body);
}
