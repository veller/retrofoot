import { useState, useMemo, useCallback, useEffect } from 'react';
import { formatCurrency, type Team } from '@retrofoot/core';
import {
  useTransferMarket,
  useTeamListings,
  useTeamOffers,
  makeTransferOffer,
  respondToOffer,
  acceptCounterOffer,
  completeTransfer,
  listPlayerForSale,
  removePlayerListing,
  type MarketPlayer,
} from '../../hooks';
import { PlayerListingCard } from './PlayerListingCard';
import { PlayerDetailModal } from './PlayerDetailModal';
import { OfferCard } from './OfferCard';
import {
  TransferFilters,
  DEFAULT_FILTERS,
  type FilterState,
} from './TransferFilters';
import { PositionBadge } from '../PositionBadge';
import { calculateOverall } from '@retrofoot/core';

type TransferTab = 'available' | 'free_agents' | 'offers' | 'my_listed';

interface TransferMarketPanelProps {
  saveId: string;
  playerTeam: Team;
  currentRound: number;
}

export function TransferMarketPanel({
  saveId,
  playerTeam,
  currentRound,
}: TransferMarketPanelProps) {
  const [activeTab, setActiveTab] = useState<TransferTab>('available');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPlayer, setSelectedPlayer] = useState<MarketPlayer | null>(
    null,
  );
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
    outgoing,
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

  const filteredListed = useMemo(
    () => filterPlayers(marketData?.listed || []),
    [marketData?.listed, filterPlayers],
  );

  const filteredFreeAgents = useMemo(
    () => filterPlayers(marketData?.freeAgents || []),
    [marketData?.freeAgents, filterPlayers],
  );

  // Action handlers
  const handleMakeOffer = async (
    offerAmount: number,
    offeredWage: number,
    contractYears: number,
  ) => {
    if (!selectedPlayer) return;

    setIsSubmitting(true);
    setActionMessage(null);

    const result = await makeTransferOffer(
      saveId,
      selectedPlayer.playerId,
      selectedPlayer.teamId,
      offerAmount,
      offeredWage,
      contractYears,
    );

    setIsSubmitting(false);

    if (result.success) {
      let message = 'Offer submitted!';
      if (result.aiResponse) {
        if (result.aiResponse.action === 'accept') {
          message = 'Offer accepted! Complete the transfer in the Offers tab.';
        } else if (result.aiResponse.action === 'reject') {
          message = 'Offer rejected by the club.';
        } else if (result.aiResponse.action === 'counter') {
          message = `Counter offer received: ${formatCurrency(result.aiResponse.counterAmount || 0)} fee, ${formatCurrency(result.aiResponse.counterWage || 0)}/wk wage`;
        }
      }
      setActionMessage({ type: 'success', text: message });
      setSelectedPlayer(null);
      refetchOffers();
      refetchMarket();
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'Failed to make offer',
      });
    }
  };

  // Generic handler for offer actions
  const handleOfferAction = async <
    T extends { success: boolean; error?: string },
  >(
    action: () => Promise<T>,
    successMessage: string,
    errorMessage: string,
    refreshMarket = false,
  ) => {
    setIsSubmitting(true);
    const result = await action();
    setIsSubmitting(false);

    if (result.success) {
      setActionMessage({ type: 'success', text: successMessage });
      refetchOffers();
      if (refreshMarket) refetchMarket();
    } else {
      setActionMessage({ type: 'error', text: result.error || errorMessage });
    }
  };

  const handleRespondToOffer = (
    offerId: string,
    response: 'accept' | 'reject',
  ) =>
    handleOfferAction(
      () => respondToOffer(saveId, offerId, response),
      response === 'accept' ? 'Offer accepted!' : 'Offer rejected.',
      'Failed to respond',
    );

  const handleAcceptCounter = (offerId: string) =>
    handleOfferAction(
      () => acceptCounterOffer(saveId, offerId),
      'Counter offer accepted! Complete the transfer.',
      'Failed to accept counter',
    );

  const handleCompleteTransfer = (offerId: string) =>
    handleOfferAction(
      () => completeTransfer(saveId, offerId),
      'Transfer completed! Player has joined your team.',
      'Failed to complete transfer',
      true,
    );

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
      case 'available':
        return (
          <div className="space-y-4">
            <TransferFilters filters={filters} onChange={setFilters} />

            {marketLoading ? (
              <p className="text-slate-400">Loading market...</p>
            ) : filteredListed.length === 0 ? (
              <p className="text-slate-500">No players match your filters.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredListed.map((player) => (
                  <PlayerListingCard
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

      case 'free_agents':
        return (
          <div className="space-y-4">
            <TransferFilters filters={filters} onChange={setFilters} />

            {marketLoading ? (
              <p className="text-slate-400">Loading free agents...</p>
            ) : filteredFreeAgents.length === 0 ? (
              <p className="text-slate-500">
                No free agents match your filters.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredFreeAgents.map((player) => (
                  <PlayerListingCard
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

      case 'offers':
        return (
          <div className="space-y-6">
            {/* Incoming Offers */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                Incoming Offers ({incoming.length})
              </h3>
              {incoming.length === 0 ? (
                <p className="text-slate-500 text-sm">No incoming offers.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {incoming.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      direction="incoming"
                      currentRound={currentRound}
                      onAccept={() => handleRespondToOffer(offer.id, 'accept')}
                      onReject={() => handleRespondToOffer(offer.id, 'reject')}
                      isProcessing={isSubmitting}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Offers */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                My Offers ({outgoing.length})
              </h3>
              {outgoing.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  You haven't made any offers.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {outgoing.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      direction="outgoing"
                      currentRound={currentRound}
                      onAcceptCounter={() => handleAcceptCounter(offer.id)}
                      onComplete={() => handleCompleteTransfer(offer.id)}
                      isProcessing={isSubmitting}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'my_listed':
        return (
          <div className="space-y-6">
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {myListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="bg-slate-700/50 border border-slate-600 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <PositionBadge position={listing.position} />
                          <span className="text-white font-medium">
                            {listing.playerName}
                          </span>
                        </div>
                        <span className="text-pitch-400 font-bold">
                          {listing.overall}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">
                          Asking: {formatCurrency(listing.askingPrice)}
                        </span>
                        <button
                          onClick={() => handleRemoveListing(listing.playerId)}
                          disabled={isSubmitting}
                          className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
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
              <div className="grid gap-2">
                {playerTeam.players
                  .filter(
                    (p) => !myListings.some((l) => l.playerId === p.id),
                  )
                  .sort((a, b) => calculateOverall(b) - calculateOverall(a))
                  .map((player) => (
                    <div
                      key={player.id}
                      className="bg-slate-700/50 border border-slate-600 rounded px-3 py-2 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <PositionBadge position={player.position} />
                        <span className="text-white">
                          {player.nickname || player.name}
                        </span>
                        <span className="text-slate-400 text-sm">
                          {player.age}y
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
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
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );
    }
  };

  // Count pending incoming offers
  const pendingIncoming = incoming.filter((o) => o.status === 'pending');

  return (
    <div className="p-4 space-y-4">
      {/* Alert Banner for Pending Offers */}
      {pendingIncoming.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm flex items-center gap-2">
          <span className="font-medium">
            {pendingIncoming.length} incoming offer
            {pendingIncoming.length > 1 ? 's' : ''} awaiting response
          </span>
          <button
            onClick={() => setActiveTab('offers')}
            className="ml-auto text-amber-400 hover:text-amber-300 underline"
          >
            View Offers
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700 overflow-x-auto">
        {[
          { id: 'available', label: 'Available', count: filteredListed.length },
          {
            id: 'free_agents',
            label: 'Free Agents',
            count: filteredFreeAgents.length,
          },
          {
            id: 'offers',
            label: 'Offers',
            count: incoming.length + outgoing.length,
          },
          { id: 'my_listed', label: 'My Listed', count: myListings.length },
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

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          teamBudget={playerTeam.budget}
          teamWageBudget={playerTeam.wageBudget}
          onClose={() => setSelectedPlayer(null)}
          onMakeOffer={handleMakeOffer}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
