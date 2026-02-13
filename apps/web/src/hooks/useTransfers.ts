import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { Position } from '@retrofoot/core';

// ============================================================================
// Types
// ============================================================================

export interface MarketPlayer {
  id: string;
  playerId: string;
  playerName: string;
  position: Position;
  age: number;
  overall: number;
  potential: number;
  teamId: string | null;
  teamName: string | null;
  askingPrice: number;
  currentWage: number;
  status: string;
  contractEndSeason: number;
  listedRound: number;
}

export interface ActiveOffer {
  id: string;
  playerId: string;
  playerName: string;
  playerPosition: string;
  fromTeamId: string | null;
  fromTeamName: string | null;
  toTeamId: string;
  toTeamName: string;
  offerAmount: number;
  offeredWage: number;
  contractYears: number;
  status: string;
  counterAmount: number | null;
  counterWage: number | null;
  createdRound: number;
  expiresRound: number;
  respondedRound: number | null;
}

export interface MarketData {
  listed: MarketPlayer[];
  freeAgents: MarketPlayer[];
  total: number;
}

export interface OffersData {
  incoming: ActiveOffer[];
  outgoing: ActiveOffer[];
}

export interface NegotiationOffer {
  fee: number;
  wage: number;
  years: number;
}

export interface NegotiationResult {
  negotiationId: string;
  round: number;
  maxRounds: number;
  aiResponse: {
    action: 'accept' | 'reject' | 'counter';
    counterFee?: number;
    counterWage?: number;
    reason?: string;
  };
  canCounter: boolean;
  completed?: {
    transferId: string;
    finalFee: number;
    finalWage: number;
  };
}

export interface ReleaseFeeQuote {
  playerId: string;
  fee: number;
  hasFee: boolean;
  yearsRemaining: number;
  utilizationRatio: number;
}

// ============================================================================
// Hook: useTransferMarket
// ============================================================================

export function useTransferMarket(saveId: string | undefined) {
  const [data, setData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarket = useCallback(
    async (signal?: AbortSignal) => {
      if (!saveId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch(`/api/transfer/market/${saveId}`, {
          signal,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch market data');
        }
        const json = await response.json();
        if (!signal?.aborted) {
          setData(json);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!signal?.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          // Reset data on error to prevent stale display
          setData(null);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [saveId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchMarket(controller.signal);
    return () => controller.abort();
  }, [fetchMarket]);

  return { data, isLoading, error, refetch: () => fetchMarket() };
}

// ============================================================================
// Hook: useTeamListings
// ============================================================================

export function useTeamListings(
  saveId: string | undefined,
  teamId: string | undefined,
) {
  const [listings, setListings] = useState<MarketPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(
    async (signal?: AbortSignal) => {
      if (!saveId || !teamId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch(
          `/api/transfer/listings/${saveId}/${teamId}`,
          { signal },
        );
        if (!response.ok) {
          throw new Error('Failed to fetch listings');
        }
        const json = await response.json();
        if (!signal?.aborted) {
          setListings(json.listings || []);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!signal?.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          // Reset data on error to prevent stale display
          setListings([]);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [saveId, teamId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchListings(controller.signal);
    return () => controller.abort();
  }, [fetchListings]);

  return { listings, isLoading, error, refetch: () => fetchListings() };
}

// ============================================================================
// Hook: useTeamOffers
// ============================================================================

export function useTeamOffers(
  saveId: string | undefined,
  teamId: string | undefined,
) {
  const [data, setData] = useState<OffersData>({ incoming: [], outgoing: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(
    async (signal?: AbortSignal) => {
      if (!saveId || !teamId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch(
          `/api/transfer/offers/${saveId}/${teamId}`,
          { signal },
        );
        if (!response.ok) {
          throw new Error('Failed to fetch offers');
        }
        const json = await response.json();
        if (!signal?.aborted) {
          setData(json);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!signal?.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          // Reset data on error to prevent stale display
          setData({ incoming: [], outgoing: [] });
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [saveId, teamId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOffers(controller.signal);
    return () => controller.abort();
  }, [fetchOffers]);

  return { ...data, isLoading, error, refetch: () => fetchOffers() };
}

// ============================================================================
// API Functions
// ============================================================================

export async function listPlayerForSale(
  saveId: string,
  playerId: string,
  askingPrice?: number,
): Promise<{ success: boolean; listingId?: string; error?: string }> {
  try {
    const response = await apiFetch(`/api/transfer/list/${saveId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, askingPrice }),
    });
    const json = await response.json();
    if (!response.ok) {
      return { success: false, error: json.error || 'Failed to list player' };
    }
    return { success: true, listingId: json.listingId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function removePlayerListing(
  saveId: string,
  playerId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(
      `/api/transfer/list/${saveId}/${playerId}`,
      {
        method: 'DELETE',
      },
    );
    const json = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: json.error || 'Failed to remove listing',
      };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function makeTransferOffer(
  saveId: string,
  playerId: string,
  fromTeamId: string | null,
  offerAmount: number,
  offeredWage: number,
  contractYears: number,
): Promise<{
  success: boolean;
  offerId?: string;
  aiResponse?: { action: string; counterAmount?: number; counterWage?: number };
  error?: string;
}> {
  try {
    const response = await apiFetch(`/api/transfer/offer/${saveId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        fromTeamId,
        offerAmount,
        offeredWage,
        contractYears,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      return { success: false, error: json.error || 'Failed to make offer' };
    }
    return {
      success: true,
      offerId: json.offerId,
      aiResponse: json.aiResponse,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function getReleaseFeeQuote(
  saveId: string,
  playerId: string,
): Promise<{ success: boolean; quote?: ReleaseFeeQuote; error?: string }> {
  try {
    const response = await apiFetch(`/api/transfer/release-fee/${saveId}/${playerId}`);
    const json = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: json.error || 'Failed to get release fee',
      };
    }
    return { success: true, quote: json as ReleaseFeeQuote };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function releasePlayer(
  saveId: string,
  playerId: string,
): Promise<{ success: boolean; quote?: ReleaseFeeQuote; error?: string }> {
  try {
    const response = await apiFetch(`/api/transfer/release/${saveId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    const json = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: json.error || 'Failed to release player',
      };
    }
    const quote: ReleaseFeeQuote = {
      playerId: json.playerId,
      fee: json.fee,
      hasFee: json.hasFee,
      yearsRemaining: json.yearsRemaining,
      utilizationRatio: json.utilizationRatio,
    };
    return { success: true, quote };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function respondToOffer(
  saveId: string,
  offerId: string,
  response: 'accept' | 'reject' | 'counter',
  counterAmount?: number,
  counterWage?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch(
      `/api/transfer/offer/${saveId}/${offerId}/respond`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, counterAmount, counterWage }),
      },
    );
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.error || 'Failed to respond' };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function acceptCounterOffer(
  saveId: string,
  offerId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(
      `/api/transfer/offer/${saveId}/${offerId}/accept-counter`,
      {
        method: 'POST',
      },
    );
    const json = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: json.error || 'Failed to accept counter',
      };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function completeTransfer(
  saveId: string,
  offerId: string,
): Promise<{ success: boolean; transferId?: string; error?: string }> {
  try {
    const response = await apiFetch(
      `/api/transfer/complete/${saveId}/${offerId}`,
      {
        method: 'POST',
      },
    );
    const json = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: json.error || 'Failed to complete transfer',
      };
    }
    return { success: true, transferId: json.transferId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}


// ============================================================================
// Live Negotiation API Functions
// ============================================================================

/**
 * Negotiate transfer for buying a player (live, multi-round)
 */
export async function negotiateTransfer(
  saveId: string,
  playerId: string,
  fromTeamId: string | null,
  offer: NegotiationOffer,
  negotiationId?: string,
  action?: 'counter' | 'accept' | 'walkaway',
): Promise<{ success: boolean; result?: NegotiationResult; error?: string }> {
  try {
    const response = await apiFetch(`/api/transfer/negotiate/${saveId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        fromTeamId,
        offer,
        negotiationId,
        action,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      return { success: false, error: json.error || 'Failed to negotiate' };
    }
    return { success: true, result: json as NegotiationResult };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Negotiate incoming offer on player's listed player
 */
export async function negotiateIncomingOffer(
  saveId: string,
  offerId: string,
  action: 'accept' | 'reject' | 'counter',
  counterOffer?: { fee: number },
  negotiationId?: string,
): Promise<{ success: boolean; result?: NegotiationResult; error?: string }> {
  try {
    const response = await apiFetch(
      `/api/transfer/negotiate-incoming/${saveId}/${offerId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          counterOffer,
          negotiationId,
        }),
      },
    );
    const json = await response.json();
    if (!response.ok) {
      return { success: false, error: json.error || 'Failed to negotiate' };
    }
    return { success: true, result: json as NegotiationResult };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
