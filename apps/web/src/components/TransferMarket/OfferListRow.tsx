import { formatCurrency, type Position } from '@retrofoot/core';
import { PositionBadge } from '../PositionBadge';
import type { ActiveOffer } from '../../hooks/useTransfers';

interface OfferListRowProps {
  offer: ActiveOffer;
  direction: 'incoming' | 'outgoing';
  currentRound: number;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  onAcceptCounter?: () => void;
  onComplete?: () => void;
  isProcessing?: boolean;
}

function getStatusBadge(status: string): { label: string; className: string } {
  const fallbackLabel = status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

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
    case 'counter':
      return {
        label: 'Counter',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      };
    default:
      return {
        label: fallbackLabel,
        className: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
      };
  }
}

export function OfferListRow({
  offer,
  direction,
  currentRound,
  onAccept,
  onReject,
  onCounter,
  onAcceptCounter,
  onComplete,
  isProcessing,
}: OfferListRowProps) {
  const statusBadge = getStatusBadge(offer.status);
  const roundsRemaining = offer.expiresRound - currentRound;
  const isExpiringSoon = roundsRemaining <= 2 && offer.status === 'pending';

  const showAcceptReject =
    direction === 'incoming' && offer.status === 'pending';
  const showAcceptCounter =
    direction === 'outgoing' && offer.status === 'counter';
  const showComplete = offer.status === 'accepted' && direction === 'outgoing';

  // Terminology: "Buyer" for incoming (they're buying from us), "Seller" for outgoing (they're selling to us)
  const counterpartyLabel = direction === 'incoming' ? 'Buyer' : 'Seller';
  const counterpartyName =
    direction === 'incoming'
      ? offer.toTeamName
      : offer.fromTeamName || 'Free Agent';

  return (
    <div className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-3">
      {/* Mobile layout */}
      <div className="md:hidden space-y-2">
        <div className="flex items-start gap-2">
          <PositionBadge position={offer.playerPosition as Position} />
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium text-sm truncate">
              {offer.playerName}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {counterpartyLabel}: {counterpartyName}
            </div>
          </div>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border shrink-0 ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-pitch-400 font-bold text-xs">
              {formatCurrency(offer.offerAmount)}
            </div>
            <div className="text-[10px] text-slate-500">Fee</div>
          </div>
          <div>
            <div className="text-amber-400 font-bold text-xs">
              {formatCurrency(offer.offeredWage)}/wk
            </div>
            <div className="text-[10px] text-slate-500">Wage</div>
          </div>
          <div>
            <div className="text-white font-bold text-xs">{offer.contractYears}y</div>
            <div className="text-[10px] text-slate-500">Term</div>
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex items-center gap-3">
        <PositionBadge position={offer.playerPosition as Position} />

        <div className="flex-1 min-w-0">
          <div className="text-white font-medium truncate">{offer.playerName}</div>
          <div className="text-sm text-slate-400">
            {counterpartyLabel}: {counterpartyName}
          </div>
        </div>

        <span
          className={`px-2 py-1 text-xs font-medium rounded border ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>

        <div className="text-right">
          <div className="text-pitch-400 font-bold text-sm">
            {formatCurrency(offer.offerAmount)}
          </div>
          <div className="text-xs text-slate-500">Fee</div>
        </div>

        <div className="text-right">
          <div className="text-amber-400 font-bold text-sm">
            {formatCurrency(offer.offeredWage)}/wk
          </div>
          <div className="text-xs text-slate-500">Wage</div>
        </div>

        <div className="text-right w-12">
          <div className="text-white font-bold text-sm">{offer.contractYears}y</div>
          <div className="text-xs text-slate-500">Term</div>
        </div>
      </div>

      {/* Counter Offer Details */}
      {offer.status === 'counter' && offer.counterAmount !== null && (
        <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700/50 rounded text-sm">
          <span className="text-blue-400 font-medium">Counter: </span>
          <span className="text-white">
            {formatCurrency(offer.counterAmount)} fee,{' '}
            {formatCurrency(offer.counterWage || 0)}/wk wage
          </span>
        </div>
      )}

      {/* Expiration Warning */}
      {isExpiringSoon && (
        <div className="mt-2 text-xs text-yellow-400">
          ⚠️ Expires{' '}
          {roundsRemaining === 0
            ? 'this round'
            : roundsRemaining === 1
              ? 'next round'
              : `in ${roundsRemaining} rounds`}
        </div>
      )}

      {/* Action Buttons */}
      {(showAcceptReject || showAcceptCounter || showComplete) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-600/50">
          {showAcceptReject && (
            <>
              <button
                onClick={onAccept}
                disabled={isProcessing}
                className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={onReject}
                disabled={isProcessing}
                className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={onCounter}
                disabled={isProcessing}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
              >
                Counter
              </button>
            </>
          )}

          {showAcceptCounter && (
            <button
              onClick={onAcceptCounter}
              disabled={isProcessing}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
            >
              Accept Counter Offer
            </button>
          )}

          {showComplete && (
            <button
              onClick={onComplete}
              disabled={isProcessing}
              className="flex-1 py-1.5 bg-pitch-600 hover:bg-pitch-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
            >
              Complete Transfer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
