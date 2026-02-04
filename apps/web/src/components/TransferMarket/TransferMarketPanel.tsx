import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatCurrency, type Team, calculateOverall } from '@retrofoot/core';
import {
  useTransferMarket,
  useTeamListings,
  useTeamOffers,
  respondToOffer,
  listPlayerForSale,
  removePlayerListing,
  type MarketPlayer,
  type ActiveOffer,
} from '../../hooks';
import { PlayerListRow, PlayerListHeader } from './PlayerListRow';
import { OfferListRow } from './OfferListRow';
import { CounterOfferModal } from './CounterOfferModal';
import { NegotiationModal } from './NegotiationModal';
import {
  TransferFilters,
  DEFAULT_FILTERS,
  type FilterState,
} from './TransferFilters';
import { PositionBadge } from '../PositionBadge';

type TransferTab = 'search' | 'my_transfers';
type PlayerStatusFilter = 'all' | 'listed' | 'free_agents';

interface TransferMarketPanelProps {
  saveId: string;
  playerTeam: Team;
  currentRound: number;
  onTransferComplete?: () => void;
}

export function TransferMarketPanel({
  saveId,
  playerTeam,
  currentRound,
  onTransferComplete,
}: TransferMarketPanelProps) {
  const [activeTab, setActiveTab] = useState<TransferTab>('search');
  const [statusFilter, setStatusFilter] = useState<PlayerStatusFilter>('all');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPlayer, setSelectedPlayer] = useState<MarketPlayer | null>(
    null,
  );
  const [counterOfferTarget, setCounterOfferTarget] =
    useState<ActiveOffer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Data hooks
  const {
    data: marketData,
    isLoading: marketLoading,
    refetch: refetchMarket,
  } = useTransferMarket(saveId);
  const { listings: myListings, refetch: refetchListings } = useTeamListings(
    saveId,
    playerTeam.id,
  );
  const {
    incoming,
    refetch: refetchOffers,
  } = useTeamOffers(saveId, playerTeam.id);

  // Auto-dismiss action messages after 5 seconds
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Filter players
  const filterPlayers = useCallback(
    (players: MarketPlayer[]): MarketPlayer[] => {
      return players.filter((p) => {
        if (filters.position !== 'ALL' && p.position !== filters.position)
          return false;
        if (p.overall < filters.minOverall || p.overall > filters.maxOverall)
          return false;
        if (filters.maxPrice > 0 && p.askingPrice > filters.maxPrice)
          return false;
        if (p.age > filters.maxAge) return false;
        return true;
      });
    },
    [filters],
  );

  // Combined search results based on status filter
  const searchResults = useMemo(() => {
    const listed = marketData?.listed || [];
    const freeAgents = marketData?.freeAgents || [];

    let combined: MarketPlayer[];
    if (statusFilter === 'listed') {
      combined = listed;
    } else if (statusFilter === 'free_agents') {
      combined = freeAgents;
    } else {
      combined = [...listed, ...freeAgents];
    }

    return filterPlayers(combined);
  }, [marketData, statusFilter, filterPlayers]);

  // Filter active offers (hide expired, rejected, completed, cancelled)
  const filteredIncoming = useMemo(
    () =>
      incoming.filter(
        (o) =>
          o.status !== 'expired' &&
          o.status !== 'rejected' &&
          o.status !== 'completed' &&
          o.status !== 'cancelled',
      ),
    [incoming],
  );

  // Handle transfer completion from NegotiationModal
  const handleTransferComplete = useCallback(() => {
    setActionMessage({
      type: 'success',
      text: 'Transfer completed! Player has joined your team.',
    });
    setSelectedPlayer(null);
    // Refresh all data
    refetchMarket();
    refetchListings();
    refetchOffers();
    // Refresh main save data (squad tab)
    onTransferComplete?.();
  }, [refetchMarket, refetchListings, refetchOffers, onTransferComplete]);

  // Generic handler for offer actions with error handling
  const handleOfferAction = async <
    T extends { success: boolean; error?: string },
  >(
    action: () => Promise<T>,
    successMessage: string,
    errorMessage: string,
    refreshMarket = false,
    isTransferComplete = false,
  ) => {
    setIsSubmitting(true);
    try {
      const result = await action();

      if (result.success) {
        setActionMessage({ type: 'success', text: successMessage });
        refetchOffers();
        if (refreshMarket) refetchMarket();
        // If this is a transfer completion (sale), refresh squad data too
        if (isTransferComplete) onTransferComplete?.();
      } else {
        setActionMessage({ type: 'error', text: result.error || errorMessage });
      }
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespondToOffer = (
    offerId: string,
    response: 'accept' | 'reject',
  ) =>
    handleOfferAction(
      () => respondToOffer(saveId, offerId, response),
      response === 'accept'
        ? 'Transfer completed! Player has been sold.'
        : 'Offer rejected.',
      'Failed to respond',
      response === 'accept', // refreshMarket
      response === 'accept', // isTransferComplete (sale happened)
    );

  // Handle counter offer completion from CounterOfferModal
  const handleCounterOfferComplete = useCallback(() => {
    setCounterOfferTarget(null);
    setActionMessage({ type: 'success', text: 'Player sold!' });
    refetchOffers();
    refetchListings();
    refetchMarket();
    onTransferComplete?.();
  }, [refetchOffers, refetchListings, refetchMarket, onTransferComplete]);

  // Handle counter offer rejection (AI walked away)
  const handleCounterOfferRejected = useCallback(() => {
    refetchOffers(); // Remove rejected offer from list
  }, [refetchOffers]);

  const handleListPlayer = async (playerId: string) => {
    setIsSubmitting(true);
    const result = await listPlayerForSale(saveId, playerId);
    setIsSubmitting(false);

    if (result.success) {
      setActionMessage({ type: 'success', text: 'Player listed for sale!' });
      refetchListings();
      refetchMarket();
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'Failed to list player',
      });
    }
  };

  const handleRemoveListing = async (playerId: string) => {
    setIsSubmitting(true);
    const result = await removePlayerListing(saveId, playerId);
    setIsSubmitting(false);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: 'Player removed from transfer list.',
      });
      refetchListings();
      refetchMarket();
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'Failed to remove listing',
      });
    }
  };

  // Tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return (
          <div className="space-y-4">
            {/* Status Toggle + Filters */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-1 bg-slate-700/50 rounded-lg p-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'listed', label: 'Listed' },
                  { id: 'free_agents', label: 'Free Agents' },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() =>
                      setStatusFilter(option.id as PlayerStatusFilter)
                    }
                    className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                      statusFilter === option.id
                        ? 'bg-pitch-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <TransferFilters filters={filters} onChange={setFilters} />
            </div>

            {marketLoading ? (
              <p className="text-slate-400">Loading market...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-slate-500">No players match your filters.</p>
            ) : (
              <div className="space-y-1">
                <PlayerListHeader />
                {searchResults.map((player) => (
                  <PlayerListRow
                    key={player.id}
                    player={player}
                    onClick={() => setSelectedPlayer(player)}
                    isSelected={selectedPlayer?.id === player.id}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case 'my_transfers':
        return (
          <div className="space-y-6">
            {/* Bids on My Players (incoming) */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                Bids on My Players ({filteredIncoming.length})
              </h3>
              {filteredIncoming.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  No bids on your players.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredIncoming.map((offer) => (
                    <OfferListRow
                      key={offer.id}
                      offer={offer}
                      direction="incoming"
                      currentRound={currentRound}
                      onAccept={() => handleRespondToOffer(offer.id, 'accept')}
                      onReject={() => handleRespondToOffer(offer.id, 'reject')}
                      onCounter={() => setCounterOfferTarget(offer)}
                      isProcessing={isSubmitting}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Listed Players */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                Players Listed for Sale ({myListings.length})
              </h3>
              {myListings.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  No players listed for sale.
                </p>
              ) : (
                <div className="space-y-2">
                  {myListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="flex items-center gap-3 px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded-lg"
                    >
                      <PositionBadge position={listing.position} />
                      <span className="text-white font-medium flex-1">
                        {listing.playerName}
                      </span>
                      <span className="text-slate-400 text-sm">
                        OVR {listing.overall}
                      </span>
                      <span className="text-pitch-400 text-sm">
                        {formatCurrency(listing.askingPrice)}
                      </span>
                      <button
                        onClick={() => handleRemoveListing(listing.playerId)}
                        disabled={isSubmitting}
                        className="px-3 py-1 text-red-400 hover:text-red-300 text-sm border border-red-500/50 rounded hover:border-red-400 transition-colors disabled:opacity-50"
                      >
                        Unlist
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Squad Players to List */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                List a Player
              </h3>
              <div className="space-y-1">
                {playerTeam.players
                  .filter(
                    (p) => !myListings.some((l) => l.playerId === p.id),
                  )
                  .sort((a, b) => calculateOverall(b) - calculateOverall(a))
                  .map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 px-3 py-2 bg-slate-700/30 border border-slate-600/50 rounded-lg"
                    >
                      <PositionBadge position={player.position} />
                      <span className="text-white flex-1">
                        {player.nickname || player.name}
                      </span>
                      <span className="text-slate-400 text-sm">
                        {player.age}y
                      </span>
                      <span className="text-pitch-400 font-medium">
                        OVR {calculateOverall(player)}
                      </span>
                      <button
                        onClick={() => handleListPlayer(player.id)}
                        disabled={isSubmitting}
                        className="px-3 py-1 bg-pitch-600 hover:bg-pitch-500 text-white text-sm rounded disabled:opacity-50"
                      >
                        List
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Count pending incoming offers for alert
  const pendingIncoming = filteredIncoming.filter((o) => o.status === 'pending');

  return (
    <div className="p-4 space-y-4">
      {/* Alert Banner for Pending Offers */}
      {pendingIncoming.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm flex items-center gap-2">
          <span className="font-medium">
            {pendingIncoming.length} incoming bid
            {pendingIncoming.length > 1 ? 's' : ''} awaiting response
          </span>
          <button
            onClick={() => setActiveTab('my_transfers')}
            className="ml-auto text-amber-400 hover:text-amber-300 underline"
          >
            View Bids
          </button>
        </div>
      )}

      {/* Header with budget info */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Transfer Market</h2>
            <p className="text-slate-400 text-sm">
              Search for players, make offers, and manage your squad.
            </p>
          </div>
          <div className="flex gap-6">
            <div>
              <span className="text-slate-500 text-sm">Transfer Budget</span>
              <p className="text-pitch-400 font-bold text-lg">
                {formatCurrency(playerTeam.budget)}
              </p>
            </div>
            <div>
              <span className="text-slate-500 text-sm">Wage Budget</span>
              <p className="text-amber-400 font-bold text-lg">
                {formatCurrency(playerTeam.wageBudget)}/wk
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-sm ${
            actionMessage.type === 'success'
              ? 'bg-green-900/30 border border-green-700 text-green-300'
              : 'bg-red-900/30 border border-red-700 text-red-300'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Tabs - Simplified to 2 tabs */}
      <div className="flex gap-1 border-b border-slate-700 overflow-x-auto">
        {[
          { id: 'search', label: 'Search Players', count: searchResults.length },
          {
            id: 'my_transfers',
            label: 'My Transfers',
            count: myListings.length + filteredIncoming.length,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TransferTab)}
            className={`px-4 py-2 text-sm font-medium transition-colors flex-shrink-0 ${
              activeTab === tab.id
                ? 'text-pitch-400 border-b-2 border-pitch-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-700 rounded">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        {renderTabContent()}
      </div>

      {/* Negotiation Modal (replaces PlayerDetailModal) */}
      {selectedPlayer && (
        <NegotiationModal
          player={selectedPlayer}
          teamBudget={playerTeam.budget}
          teamWageBudget={playerTeam.wageBudget}
          saveId={saveId}
          onClose={() => setSelectedPlayer(null)}
          onComplete={handleTransferComplete}
        />
      )}

      {/* Counter Offer Modal for incoming bids */}
      {counterOfferTarget && (
        <CounterOfferModal
          offer={counterOfferTarget}
          saveId={saveId}
          onClose={() => setCounterOfferTarget(null)}
          onComplete={handleCounterOfferComplete}
          onRejected={handleCounterOfferRejected}
        />
      )}
    </div>
  );
}
