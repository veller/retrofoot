import { formatCurrency, type Position } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import type { ActiveOffer } from '../../hooks/useTransfers';

interface OfferCardProps {
  offer: ActiveOffer;
  direction: 'incoming' | 'outgoing';
  currentRound: number;
  onAccept?: () => void;
  onReject?: () => void;
  onAcceptCounter?: () => void;
  onComplete?: () => void;
  isProcessing?: boolean;
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      };
    case 'accepted':
      return {
        label: 'Accepted',
        className: 'bg-green-500/20 text-green-400 border-green-500/50',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'bg-red-500/20 text-red-400 border-red-500/50',
      };
    case 'counter':
      return {
        label: 'Counter Offer',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      };
    case 'expired':
      return {
        label: 'Expired',
        className: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-pitch-500/20 text-pitch-400 border-pitch-500/50',
      };
    default:
      return {
        label: status,
        className: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
      };
  }
}

export function OfferCard({
  offer,
  direction,
  currentRound,
  onAccept,
  onReject,
  onAcceptCounter,
  onComplete,
  isProcessing,
}: OfferCardProps) {
  const statusBadge = getStatusBadge(offer.status);
  const roundsRemaining = offer.expiresRound - currentRound;
  const isExpiringSoon = roundsRemaining <= 2 && offer.status === 'pending';
  const isExpiringUrgent = roundsRemaining <= 1 && offer.status === 'pending';

  const showAcceptReject =
    direction === 'incoming' && offer.status === 'pending';
  const showAcceptCounter =
    direction === 'outgoing' && offer.status === 'counter';
  const showComplete = offer.status === 'accepted' && direction === 'outgoing';

  return (
    <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <PositionBadge position={offer.playerPosition as Position} />
          <div>
            <span className="text-white font-medium">{offer.playerName}</span>
            <p className="text-sm text-slate-400">
              {direction === 'incoming'
                ? `From: ${offer.toTeamName}`
                : `To: ${offer.fromTeamName || 'Free Agent'}`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-2 py-1 text-xs font-medium rounded border ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
          {direction === 'incoming' && offer.status === 'pending' && (
            <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded font-medium">
              Must Respond
            </span>
          )}
        </div>
      </div>

      {/* Offer Details */}
      <div className="grid grid-cols-3 gap-4 text-center p-3 bg-slate-800/50 rounded mb-3">
        <div>
          <div className="text-pitch-400 font-bold">
            {formatCurrency(offer.offerAmount)}
          </div>
          <div className="text-xs text-slate-500">Fee</div>
        </div>
        <div>
          <div className="text-amber-400 font-bold">
            {formatCurrency(offer.offeredWage)}/wk
          </div>
          <div className="text-xs text-slate-500">Wage</div>
        </div>
        <div>
          <div className="text-white font-bold">{offer.contractYears}y</div>
          <div className="text-xs text-slate-500">Contract</div>
        </div>
      </div>

      {/* Counter Offer Details */}
      {offer.status === 'counter' && offer.counterAmount !== null && (
        <div className="mb-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded">
          <p className="text-blue-400 text-sm font-medium mb-2">
            Counter Offer:
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Fee: </span>
              <span className="text-white">
                {formatCurrency(offer.counterAmount)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Wage: </span>
              <span className="text-white">
                {formatCurrency(offer.counterWage || 0)}/wk
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Expiration Warning */}
      {isExpiringSoon && (
        <div
          className={`mb-3 p-2 rounded text-sm ${
            isExpiringUrgent
              ? 'bg-red-900/20 border border-red-700/50 text-red-400'
              : 'bg-yellow-900/20 border border-yellow-700/50 text-yellow-400'
          }`}
        >
          {isExpiringUrgent ? '⚠️ ' : ''}
          Expires{' '}
          {roundsRemaining === 0
            ? 'this round'
            : roundsRemaining === 1
              ? 'next round'
              : `in ${roundsRemaining} rounds`}
          !
        </div>
      )}

      {/* Action Buttons */}
      {(showAcceptReject || showAcceptCounter || showComplete) && (
        <div className="flex gap-2">
          {showAcceptReject && (
            <>
              <button
                onClick={onAccept}
                disabled={isProcessing}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={onReject}
                disabled={isProcessing}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}

          {showAcceptCounter && (
            <button
              onClick={onAcceptCounter}
              disabled={isProcessing}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition-colors disabled:opacity-50"
            >
              Accept Counter Offer
            </button>
          )}

          {showComplete && (
            <button
              onClick={onComplete}
              disabled={isProcessing}
              className="flex-1 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-medium rounded transition-colors disabled:opacity-50"
            >
              Complete Transfer
            </button>
          )}
        </div>
      )}

      {/* Round Info */}
      <div className="mt-3 pt-3 border-t border-slate-600/50 flex justify-between text-xs text-slate-500">
        <span>Created: Round {offer.createdRound}</span>
        {offer.status === 'pending' && (
          <span>Expires: Round {offer.expiresRound}</span>
        )}
        {offer.respondedRound && (
          <span>Responded: Round {offer.respondedRound}</span>
        )}
      </div>
    </div>
  );
}
