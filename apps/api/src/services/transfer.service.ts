// ============================================================================
// RETROFOOT - Transfer Service
// ============================================================================
// D1-specific transfer operations

import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { drizzle } from 'drizzle-orm/d1';
import { eq, and, or, isNull, lt, inArray } from 'drizzle-orm';
import {
  teams,
  players,
  saves,
  transferListings,
  transferOffers,
} from '@retrofoot/db/schema';
import {
  calculateOverall,
  calculateAskingPrice,
  calculateWageDemand,
  aiSellDecision,
  freeAgentDecision,
  generateTransactionId,
  generateListingId,
  generateOfferId,
  createPlayerForCalc,
  OFFER_EXPIRY_ROUNDS,
  getContractWageMultiplier,
  DEFAULT_FREE_AGENT_CONFIG,
} from '@retrofoot/core';

// ============================================================================
// TYPES
// ============================================================================

export interface MarketPlayer {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
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

// ============================================================================
// MARKET QUERIES
// ============================================================================

/**
 * Get all players available in the transfer market
 * Includes listed players from other teams and free agents
 */
export async function getMarketPlayers(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  excludeTeamId?: string,
): Promise<MarketPlayer[]> {
  // Get all listed players
  const listings = await db
    .select({
      id: transferListings.id,
      playerId: transferListings.playerId,
      teamId: transferListings.teamId,
      askingPrice: transferListings.askingPrice,
      status: transferListings.status,
      listedRound: transferListings.listedRound,
    })
    .from(transferListings)
    .where(eq(transferListings.saveId, saveId));

  if (listings.length === 0) {
    return [];
  }

  // Get player details for all listings - use inArray to only fetch needed players
  const playerIds = listings.map((l) => l.playerId);
  const playerResults = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      age: players.age,
      potential: players.potential,
      wage: players.wage,
      attributes: players.attributes,
      contractEndSeason: players.contractEndSeason,
      teamId: players.teamId,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.id, playerIds)));

  const playerMap = new Map(playerResults.map((p) => [p.id, p]));

  // Get team names
  const teamResults = await db
    .select({
      id: teams.id,
      name: teams.name,
    })
    .from(teams)
    .where(eq(teams.saveId, saveId));

  const teamMap = new Map(teamResults.map((t) => [t.id, t.name]));

  // Build market player list
  const marketPlayers: MarketPlayer[] = [];

  for (const listing of listings) {
    // Skip if listing is from the excluded team
    if (excludeTeamId && listing.teamId === excludeTeamId) {
      continue;
    }

    const player = playerMap.get(listing.playerId);
    if (!player) continue;

    // Calculate overall from attributes
    const attrs = player.attributes as Record<string, number>;
    const overall = calculateOverall(
      createPlayerForCalc({
        attributes: attrs,
        position: player.position,
      }),
    );

    marketPlayers.push({
      id: listing.id,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      age: player.age,
      overall,
      potential: player.potential,
      teamId: listing.teamId,
      teamName: listing.teamId ? teamMap.get(listing.teamId) || null : null,
      askingPrice: listing.askingPrice,
      currentWage: player.wage,
      status: listing.status,
      contractEndSeason: player.contractEndSeason,
      listedRound: listing.listedRound,
    });
  }

  // Sort by overall descending
  marketPlayers.sort((a, b) => b.overall - a.overall);

  return marketPlayers;
}

/**
 * Get free agents (players without teams)
 */
export async function getFreeAgents(
  db: ReturnType<typeof drizzle>,
  saveId: string,
): Promise<MarketPlayer[]> {
  const freeAgentPlayers = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      age: players.age,
      potential: players.potential,
      wage: players.wage,
      attributes: players.attributes,
      contractEndSeason: players.contractEndSeason,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), isNull(players.teamId)));

  const saveResult = await db
    .select({ currentRound: saves.currentRound })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;

  return freeAgentPlayers.map((player) => {
    const attrs = player.attributes as Record<string, number>;
    const overall = calculateOverall(
      createPlayerForCalc({
        attributes: attrs,
        position: player.position,
      }),
    );

    return {
      id: `free-${player.id}`,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      age: player.age,
      overall,
      potential: player.potential,
      teamId: null,
      teamName: null,
      askingPrice: 0, // Free agents have no transfer fee
      currentWage: player.wage,
      status: 'free_agent',
      contractEndSeason: player.contractEndSeason,
      listedRound: currentRound,
    };
  });
}

/**
 * Get a team's listed players
 */
export async function getTeamListings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  teamId: string,
): Promise<MarketPlayer[]> {
  const listings = await db
    .select({
      id: transferListings.id,
      playerId: transferListings.playerId,
      askingPrice: transferListings.askingPrice,
      status: transferListings.status,
      listedRound: transferListings.listedRound,
    })
    .from(transferListings)
    .where(
      and(
        eq(transferListings.saveId, saveId),
        eq(transferListings.teamId, teamId),
      ),
    );

  if (listings.length === 0) {
    return [];
  }

  // Get player details - use inArray to only fetch needed players
  const playerIds = listings.map((l) => l.playerId);
  const playerResults = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
      age: players.age,
      potential: players.potential,
      wage: players.wage,
      attributes: players.attributes,
      contractEndSeason: players.contractEndSeason,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.id, playerIds)));

  const playerMap = new Map(playerResults.map((p) => [p.id, p]));

  // Get team name
  const teamResult = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const teamName = teamResult[0]?.name || null;

  return listings.map((listing) => {
    const player = playerMap.get(listing.playerId)!;
    const attrs = player.attributes as Record<string, number>;
    const overall = calculateOverall(
      createPlayerForCalc({
        attributes: attrs,
        position: player.position,
      }),
    );

    return {
      id: listing.id,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      age: player.age,
      overall,
      potential: player.potential,
      teamId,
      teamName,
      askingPrice: listing.askingPrice,
      currentWage: player.wage,
      status: listing.status,
      contractEndSeason: player.contractEndSeason,
      listedRound: listing.listedRound,
    };
  });
}

// ============================================================================
// LISTING OPERATIONS
// ============================================================================

/**
 * List a player for sale
 */
export async function listPlayerForSale(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerId: string,
  teamId: string,
  askingPrice?: number,
): Promise<{ listingId: string }> {
  // Get player and team info
  const playerResult = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      wage: players.wage,
      attributes: players.attributes,
      position: players.position,
      age: players.age,
      potential: players.potential,
      contractEndSeason: players.contractEndSeason,
      marketValue: players.marketValue,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (playerResult.length === 0) {
    throw new Error('Player not found');
  }

  const player = playerResult[0];

  // Verify player belongs to the team
  if (player.teamId !== teamId) {
    throw new Error('Player does not belong to this team');
  }

  // Get current season/round
  const saveResult = await db
    .select({
      currentSeason: saves.currentSeason,
      currentRound: saves.currentRound,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentSeason = parseInt(saveResult[0]?.currentSeason || '2026', 10);
  const currentRound = saveResult[0]?.currentRound || 1;

  // Check if already listed
  const existingListing = await db
    .select({ id: transferListings.id })
    .from(transferListings)
    .where(
      and(
        eq(transferListings.saveId, saveId),
        eq(transferListings.playerId, playerId),
      ),
    )
    .limit(1);

  if (existingListing.length > 0) {
    throw new Error('Player is already listed');
  }

  // Calculate asking price if not provided
  const attrs = player.attributes as Record<string, number>;
  const finalAskingPrice =
    askingPrice ??
    calculateAskingPrice(
      createPlayerForCalc({
        age: player.age,
        potential: player.potential,
        marketValue: player.marketValue,
        contractEndSeason: player.contractEndSeason,
        attributes: attrs,
        position: player.position,
      }),
      currentSeason,
    );

  // Determine status
  const contractYearsRemaining = player.contractEndSeason - currentSeason;
  const status =
    contractYearsRemaining <= 1 ? 'contract_expiring' : 'available';

  const listingId = generateListingId(saveId);

  try {
    await db.insert(transferListings).values({
      id: listingId,
      saveId,
      playerId,
      teamId,
      askingPrice: finalAskingPrice,
      status,
      listedRound: currentRound,
    });
  } catch (error) {
    // Handle unique constraint violation (race condition)
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed')
    ) {
      throw new Error('Player is already listed');
    }
    throw error;
  }

  return { listingId };
}

/**
 * Remove a player listing
 */
export async function removePlayerListing(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerId: string,
  teamId: string,
): Promise<void> {
  await db
    .delete(transferListings)
    .where(
      and(
        eq(transferListings.saveId, saveId),
        eq(transferListings.playerId, playerId),
        eq(transferListings.teamId, teamId),
      ),
    );
}

// ============================================================================
// OFFER OPERATIONS
// ============================================================================

/**
 * Get active offers for a team (incoming and outgoing)
 */
export async function getTeamOffers(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  teamId: string,
): Promise<{ incoming: ActiveOffer[]; outgoing: ActiveOffer[] }> {
  // Get all offers involving this team
  const offers = await db
    .select()
    .from(transferOffers)
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        or(
          eq(transferOffers.fromTeamId, teamId),
          eq(transferOffers.toTeamId, teamId),
        ),
      ),
    );

  // Get player details
  const playerIds = [...new Set(offers.map((o) => o.playerId))];
  const playerResults = await db
    .select({
      id: players.id,
      name: players.name,
      position: players.position,
    })
    .from(players)
    .where(eq(players.saveId, saveId));

  const playerMap = new Map(
    playerResults.filter((p) => playerIds.includes(p.id)).map((p) => [p.id, p]),
  );

  // Get team names
  const teamResults = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.saveId, saveId));

  const teamMap = new Map(teamResults.map((t) => [t.id, t.name]));

  const mapOffer = (offer: (typeof offers)[0]): ActiveOffer => {
    const player = playerMap.get(offer.playerId);
    return {
      id: offer.id,
      playerId: offer.playerId,
      playerName: player?.name || 'Unknown',
      playerPosition: player?.position || 'Unknown',
      fromTeamId: offer.fromTeamId,
      fromTeamName: offer.fromTeamId
        ? teamMap.get(offer.fromTeamId) || null
        : null,
      toTeamId: offer.toTeamId,
      toTeamName: teamMap.get(offer.toTeamId) || 'Unknown',
      offerAmount: offer.offerAmount,
      offeredWage: offer.offeredWage,
      contractYears: offer.contractYears,
      status: offer.status,
      counterAmount: offer.counterAmount,
      counterWage: offer.counterWage,
      createdRound: offer.createdRound,
      expiresRound: offer.expiresRound,
      respondedRound: offer.respondedRound,
    };
  };

  // Separate incoming (bids on our players, we are seller) and outgoing (bids we made, we are buyer)
  // fromTeamId = seller (owns player), toTeamId = buyer (wants to acquire)
  const incoming = offers
    .filter((o) => o.fromTeamId === teamId) // Bids on MY players (I'm the seller)
    .map(mapOffer);

  const outgoing = offers
    .filter((o) => o.toTeamId === teamId) // Bids I made (I'm the buyer)
    .map(mapOffer);

  return { incoming, outgoing };
}

/**
 * Make a transfer offer
 */
export async function makeOffer(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerId: string,
  fromTeamId: string | null, // null if buying from free agent
  toTeamId: string,
  offerAmount: number,
  offeredWage: number,
  contractYears: number,
): Promise<{
  offerId: string;
  aiResponse?: { action: string; counterAmount?: number; counterWage?: number };
}> {
  // Get current round
  const saveResult = await db
    .select({
      currentRound: saves.currentRound,
      playerTeamId: saves.playerTeamId,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;
  const playerTeamId = saveResult[0]?.playerTeamId;

  // Check for existing pending offer for this player from this team
  const existingOffer = await db
    .select({ id: transferOffers.id })
    .from(transferOffers)
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        eq(transferOffers.playerId, playerId),
        eq(transferOffers.toTeamId, toTeamId),
        eq(transferOffers.status, 'pending'),
      ),
    )
    .limit(1);

  if (existingOffer.length > 0) {
    throw new Error('You already have a pending offer for this player');
  }

  const offerId = generateOfferId(saveId);

  await db.insert(transferOffers).values({
    id: offerId,
    saveId,
    playerId,
    fromTeamId,
    toTeamId,
    offerAmount,
    offeredWage,
    contractYears,
    status: 'pending',
    createdRound: currentRound,
    expiresRound: currentRound + OFFER_EXPIRY_ROUNDS,
  });

  // If it's a free agent signing or the selling team is AI, process immediately
  if (fromTeamId === null) {
    // Free agent - accept immediately if wage is acceptable
    const playerResult = await db
      .select({
        wage: players.wage,
        attributes: players.attributes,
        position: players.position,
        age: players.age,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (playerResult.length > 0) {
      const player = playerResult[0];
      const attrs = player.attributes as Record<string, number>;

      // Get buying team's reputation
      const teamResult = await db
        .select({ reputation: teams.reputation })
        .from(teams)
        .where(eq(teams.id, toTeamId))
        .limit(1);

      const teamRep = teamResult[0]?.reputation || 50;
      const minWage =
        calculateWageDemand(
          createPlayerForCalc({
            attributes: attrs,
            position: player.position,
            age: player.age,
          }),
          teamRep,
        ) * 0.85; // 15% discount minimum

      if (offeredWage >= minWage) {
        await db
          .update(transferOffers)
          .set({ status: 'accepted', respondedRound: currentRound })
          .where(eq(transferOffers.id, offerId));

        return { offerId, aiResponse: { action: 'accept' } };
      } else {
        // Counter with minimum acceptable wage
        await db
          .update(transferOffers)
          .set({
            status: 'counter',
            counterAmount: 0,
            counterWage: Math.round(minWage),
            respondedRound: currentRound,
          })
          .where(eq(transferOffers.id, offerId));

        return {
          offerId,
          aiResponse: {
            action: 'counter',
            counterAmount: 0,
            counterWage: Math.round(minWage),
          },
        };
      }
    }
  }

  // If selling team is AI-controlled, process immediately
  if (fromTeamId && fromTeamId !== playerTeamId) {
    // Get listing to find asking price
    const listingResult = await db
      .select({ askingPrice: transferListings.askingPrice })
      .from(transferListings)
      .where(
        and(
          eq(transferListings.saveId, saveId),
          eq(transferListings.playerId, playerId),
        ),
      )
      .limit(1);

    if (listingResult.length > 0) {
      const askingPrice = listingResult[0].askingPrice;

      // Get player and squad info
      const playerResult = await db
        .select({
          wage: players.wage,
          attributes: players.attributes,
          position: players.position,
          age: players.age,
          potential: players.potential,
          marketValue: players.marketValue,
          contractEndSeason: players.contractEndSeason,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      const squadCount = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.teamId, fromTeamId));

      if (playerResult.length > 0) {
        const player = playerResult[0];
        const attrs = player.attributes as Record<string, number>;

        const saveData = await db
          .select({ currentSeason: saves.currentSeason })
          .from(saves)
          .where(eq(saves.id, saveId))
          .limit(1);

        const currentSeason = parseInt(
          saveData[0]?.currentSeason || '2026',
          10,
        );

        const decision = aiSellDecision(
          askingPrice,
          offerAmount,
          offeredWage,
          squadCount.length,
          createPlayerForCalc({
            wage: player.wage,
            age: player.age,
            potential: player.potential,
            marketValue: player.marketValue,
            contractEndSeason: player.contractEndSeason,
            attributes: attrs,
            position: player.position,
          }),
          currentSeason,
        );

        if (decision.action === 'accept') {
          await db
            .update(transferOffers)
            .set({ status: 'accepted', respondedRound: currentRound })
            .where(eq(transferOffers.id, offerId));

          return { offerId, aiResponse: { action: 'accept' } };
        } else if (decision.action === 'counter') {
          await db
            .update(transferOffers)
            .set({
              status: 'counter',
              counterAmount: decision.amount,
              counterWage: decision.wage,
              respondedRound: currentRound,
            })
            .where(eq(transferOffers.id, offerId));

          return {
            offerId,
            aiResponse: {
              action: 'counter',
              counterAmount: decision.amount,
              counterWage: decision.wage,
            },
          };
        } else {
          await db
            .update(transferOffers)
            .set({ status: 'rejected', respondedRound: currentRound })
            .where(eq(transferOffers.id, offerId));

          return { offerId, aiResponse: { action: 'reject' } };
        }
      }
    }
  }

  return { offerId };
}

/**
 * Respond to an offer (for player-controlled team)
 */
export async function respondToOffer(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  offerId: string,
  response: 'accept' | 'reject' | 'counter',
  counterAmount?: number,
  counterWage?: number,
): Promise<{ autoCompleted?: boolean }> {
  const saveResult = await db
    .select({ currentRound: saves.currentRound, playerTeamId: saves.playerTeamId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;
  const playerTeamId = saveResult[0]?.playerTeamId;

  if (response === 'accept') {
    // Mark offer as accepted
    await db
      .update(transferOffers)
      .set({ status: 'accepted', respondedRound: currentRound })
      .where(eq(transferOffers.id, offerId));

    // Check if buyer is AI-controlled (not the player's team)
    // When we accept an incoming offer, toTeamId is the buyer
    const offerResult = await db
      .select({ toTeamId: transferOffers.toTeamId })
      .from(transferOffers)
      .where(eq(transferOffers.id, offerId))
      .limit(1);

    const buyerTeamId = offerResult[0]?.toTeamId;

    // If buyer is AI (not player's team), auto-complete the transfer
    if (buyerTeamId && buyerTeamId !== playerTeamId) {
      await completeTransfer(db, d1, saveId, offerId);
      return { autoCompleted: true };
    }

    return { autoCompleted: false };
  } else if (response === 'reject') {
    await db
      .update(transferOffers)
      .set({ status: 'rejected', respondedRound: currentRound })
      .where(eq(transferOffers.id, offerId));
  } else if (response === 'counter') {
    if (counterAmount === undefined || counterWage === undefined) {
      throw new Error('Counter offer requires amount and wage');
    }
    await db
      .update(transferOffers)
      .set({
        status: 'counter',
        counterAmount,
        counterWage,
        respondedRound: currentRound,
      })
      .where(eq(transferOffers.id, offerId));
  }

  return {};
}

/**
 * Accept a counter offer
 */
export async function acceptCounterOffer(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  offerId: string,
): Promise<void> {
  const saveResult = await db
    .select({ currentRound: saves.currentRound })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;

  // Get the offer to update with counter values
  const offerResult = await db
    .select({
      counterAmount: transferOffers.counterAmount,
      counterWage: transferOffers.counterWage,
    })
    .from(transferOffers)
    .where(eq(transferOffers.id, offerId))
    .limit(1);

  if (offerResult.length === 0) {
    throw new Error('Offer not found');
  }

  const offer = offerResult[0];

  // Validate counter offer values exist
  if (offer.counterAmount === null || offer.counterWage === null) {
    throw new Error('No counter offer values to accept');
  }

  await db
    .update(transferOffers)
    .set({
      status: 'accepted',
      offerAmount: offer.counterAmount,
      offeredWage: offer.counterWage,
      respondedRound: currentRound,
    })
    .where(eq(transferOffers.id, offerId));
}

// ============================================================================
// TRANSFER COMPLETION
// ============================================================================

/**
 * Complete an accepted transfer
 * Uses D1 batch for atomicity - all operations succeed or fail together
 */
export async function completeTransfer(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  offerId: string,
): Promise<{ success: boolean; transferId: string }> {
  // Get offer details
  const offerResult = await db
    .select()
    .from(transferOffers)
    .where(eq(transferOffers.id, offerId))
    .limit(1);

  if (offerResult.length === 0) {
    throw new Error('Offer not found');
  }

  const offer = offerResult[0];

  if (offer.status !== 'accepted') {
    throw new Error('Offer is not accepted');
  }

  // Get save details
  const saveResult = await db
    .select({
      currentSeason: saves.currentSeason,
      currentRound: saves.currentRound,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentSeason = saveResult[0]?.currentSeason || '2026';
  const currentRound = saveResult[0]?.currentRound || 1;
  const currentSeasonNum = parseInt(currentSeason, 10);

  // Calculate new contract end season
  const newContractEnd = currentSeasonNum + offer.contractYears;

  // Generate IDs upfront
  const transferId = `txf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date();
  const nowTimestamp = Math.floor(now.getTime() / 1000);

  // Build batch of statements for atomic execution
  const statements: D1PreparedStatement[] = [];

  // 1. Update player
  statements.push(
    d1
      .prepare(
        'UPDATE players SET team_id = ?, wage = ?, contract_end_season = ?, morale = 80 WHERE id = ?',
      )
      .bind(offer.toTeamId, offer.offeredWage, newContractEnd, offer.playerId),
  );

  // 2. Update team finances
  if (offer.fromTeamId && offer.offerAmount > 0) {
    // Selling team gets money
    statements.push(
      d1
        .prepare(
          'UPDATE teams SET budget = budget + ?, balance = balance + ? WHERE id = ?',
        )
        .bind(offer.offerAmount, offer.offerAmount, offer.fromTeamId),
    );

    // Create income transaction for selling team
    const sellTransactionId = generateTransactionId();
    statements.push(
      d1
        .prepare(
          'INSERT INTO transactions (id, save_id, team_id, type, category, amount, description, round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          sellTransactionId,
          saveId,
          offer.fromTeamId,
          'income',
          'player_sale',
          offer.offerAmount,
          'Player sale',
          currentRound,
          nowTimestamp,
        ),
    );
  }

  if (offer.offerAmount > 0) {
    // Buying team loses money
    statements.push(
      d1
        .prepare(
          'UPDATE teams SET budget = budget - ?, balance = balance - ? WHERE id = ?',
        )
        .bind(offer.offerAmount, offer.offerAmount, offer.toTeamId),
    );

    // Create expense transaction for buying team
    const buyTransactionId = generateTransactionId();
    statements.push(
      d1
        .prepare(
          'INSERT INTO transactions (id, save_id, team_id, type, category, amount, description, round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          buyTransactionId,
          saveId,
          offer.toTeamId,
          'expense',
          'player_buy',
          offer.offerAmount,
          'Player purchase',
          currentRound,
          nowTimestamp,
        ),
    );
  }

  // 3. Create transfer record
  statements.push(
    d1
      .prepare(
        'INSERT INTO transfers (id, save_id, player_id, from_team_id, to_team_id, fee, wage, season, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        transferId,
        saveId,
        offer.playerId,
        offer.fromTeamId,
        offer.toTeamId,
        offer.offerAmount,
        offer.offeredWage,
        currentSeason,
        now.toISOString(),
      ),
  );

  // 4. Mark offer as completed (with status check to prevent race condition)
  statements.push(
    d1
      .prepare('UPDATE transfer_offers SET status = ? WHERE id = ? AND status = ?')
      .bind('completed', offerId, 'accepted'),
  );

  // 5. Cancel other pending/counter offers for the same player (player is no longer available)
  statements.push(
    d1
      .prepare(
        'UPDATE transfer_offers SET status = ? WHERE save_id = ? AND player_id = ? AND id != ? AND status IN (?, ?)',
      )
      .bind('cancelled', saveId, offer.playerId, offerId, 'pending', 'counter'),
  );

  // 6. Remove listing if exists
  if (offer.fromTeamId) {
    statements.push(
      d1
        .prepare(
          'DELETE FROM transfer_listings WHERE save_id = ? AND player_id = ?',
        )
        .bind(saveId, offer.playerId),
    );
  }

  // Execute all statements as a batch (atomic)
  await d1.batch(statements);

  return { success: true, transferId };
}

// ============================================================================
// ROUND PROCESSING
// ============================================================================

/**
 * Process expired offers at the start of a round
 */
export async function processExpiredOffers(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  currentRound: number,
): Promise<number> {
  // Use lt() (less than) instead of lte() - offer expires AFTER the expiry round, not ON it
  await db
    .update(transferOffers)
    .set({ status: 'expired' })
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        or(
          eq(transferOffers.status, 'pending'),
          eq(transferOffers.status, 'counter'),
        ),
        lt(transferOffers.expiresRound, currentRound),
      ),
    );

  return 0; // Drizzle doesn't return affected rows easily
}


// ============================================================================
// LIVE NEGOTIATION
// ============================================================================

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

// In-memory storage for active negotiations (cleared on server restart)
// In production, consider using KV or D1 for persistence
interface ActiveNegotiation {
  playerId: string;
  fromTeamId: string | null;
  toTeamId: string;
  round: number;
  lastOffer: NegotiationOffer;
  lastAiOffer?: { fee: number; wage: number };
  hardeningFactor: number; // Increases with each round to prevent exploitation
  createdAt: number; // Timestamp for TTL cleanup
}

const activeNegotiations = new Map<string, ActiveNegotiation>();

const MAX_NEGOTIATION_ROUNDS = 2;
const MIN_COUNTER_INCREASE = 0.05; // 5% minimum increase required
const NEGOTIATION_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL for stale negotiations
let lastCleanupTime = 0;

/**
 * Cleanup stale negotiations that are older than TTL
 * Called lazily on access to avoid Cloudflare Workers global scope restrictions
 */
function cleanupStaleNegotiationsIfNeeded(): void {
  const now = Date.now();
  // Only run cleanup every 5 minutes
  if (now - lastCleanupTime < 5 * 60 * 1000) {
    return;
  }
  lastCleanupTime = now;

  for (const [id, negotiation] of activeNegotiations.entries()) {
    if (now - negotiation.createdAt > NEGOTIATION_TTL_MS) {
      activeNegotiations.delete(id);
    }
  }
}

/**
 * Get a negotiation by ID, with TTL check
 */
function getNegotiation(id: string): ActiveNegotiation | undefined {
  cleanupStaleNegotiationsIfNeeded();
  const negotiation = activeNegotiations.get(id);
  if (negotiation && Date.now() - negotiation.createdAt > NEGOTIATION_TTL_MS) {
    activeNegotiations.delete(id);
    return undefined;
  }
  return negotiation;
}

function generateNegotiationId(): string {
  return `neg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Live negotiation for buying players
 * Handles the entire negotiation in real-time with max 2 counter rounds
 */
export async function negotiateTransfer(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  playerId: string,
  fromTeamId: string | null, // null for free agents
  toTeamId: string,
  offer: NegotiationOffer,
  negotiationId?: string,
  action?: 'counter' | 'accept' | 'walkaway',
): Promise<NegotiationResult> {
  // Get save info
  const saveResult = await db
    .select({
      currentRound: saves.currentRound,
      currentSeason: saves.currentSeason,
      playerTeamId: saves.playerTeamId,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;
  const currentSeason = parseInt(saveResult[0]?.currentSeason || '2026', 10);

  // Resume existing negotiation or start new one
  let negotiation = negotiationId ? getNegotiation(negotiationId) : undefined;
  let newNegotiationId = negotiationId || generateNegotiationId();
  let round = 1;
  let hardeningFactor = 1.0;

  if (negotiation) {
    round = negotiation.round + 1;
    hardeningFactor = negotiation.hardeningFactor;

    // Check if accepting AI's counter offer
    if (action === 'accept' && negotiation.lastAiOffer) {
      // Player accepts AI's counter - complete the transfer
      const offerId = await createAndAcceptOffer(
        db,
        saveId,
        playerId,
        fromTeamId,
        toTeamId,
        negotiation.lastAiOffer.fee,
        negotiation.lastAiOffer.wage,
        offer.years,
        currentRound,
      );

      const transferResult = await completeTransfer(db, d1, saveId, offerId);
      activeNegotiations.delete(newNegotiationId);

      return {
        negotiationId: newNegotiationId,
        round,
        maxRounds: MAX_NEGOTIATION_ROUNDS,
        aiResponse: { action: 'accept', reason: 'Deal!' },
        canCounter: false,
        completed: {
          transferId: transferResult.transferId,
          finalFee: negotiation.lastAiOffer.fee,
          finalWage: negotiation.lastAiOffer.wage,
        },
      };
    }

    if (action === 'walkaway') {
      activeNegotiations.delete(newNegotiationId);
      return {
        negotiationId: newNegotiationId,
        round,
        maxRounds: MAX_NEGOTIATION_ROUNDS,
        aiResponse: { action: 'reject', reason: 'Negotiations ended' },
        canCounter: false,
      };
    }

    // Validate counter offer is meaningful (5% increase minimum)
    if (negotiation.lastOffer) {
      const feeIncrease = (offer.fee - negotiation.lastOffer.fee) / Math.max(negotiation.lastOffer.fee, 1);
      const wageIncrease = (offer.wage - negotiation.lastOffer.wage) / Math.max(negotiation.lastOffer.wage, 1);

      if (feeIncrease < MIN_COUNTER_INCREASE && wageIncrease < MIN_COUNTER_INCREASE) {
        return {
          negotiationId: newNegotiationId,
          round: negotiation.round, // Don't advance round
          maxRounds: MAX_NEGOTIATION_ROUNDS,
          aiResponse: {
            action: 'reject',
            reason: 'Counter offer must be at least 5% higher',
          },
          canCounter: true, // Allow them to try again with a better offer
        };
      }
    }
    // Use the stored hardening factor from negotiation state (don't recalculate)
  }

  // Get player info
  const playerResult = await db
    .select({
      name: players.name,
      wage: players.wage,
      age: players.age,
      potential: players.potential,
      marketValue: players.marketValue,
      contractEndSeason: players.contractEndSeason,
      attributes: players.attributes,
      position: players.position,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (playerResult.length === 0) {
    throw new Error('Player not found');
  }

  const player = playerResult[0];
  const attrs = player.attributes as Record<string, number>;

  let aiDecision: { action: 'accept' | 'reject' | 'counter'; amount?: number; wage?: number };

  if (fromTeamId === null) {
    // Free agent negotiation - use player's current wage as baseline
    const teamResult = await db
      .select({ reputation: teams.reputation })
      .from(teams)
      .where(eq(teams.id, toTeamId))
      .limit(1);

    const teamRep = teamResult[0]?.reputation || 50;

    // Use the player's actual wage as baseline (what they're used to earning)
    // This ensures the modal shows what they'll actually accept
    const playerWage = player.wage;

    // Apply contract length multiplier - longer contracts = lower wage expectations
    // Multiply by multiplier: 5yr (0.85) → lower expected wage, 1yr (1.25) → higher expected wage
    const contractMultiplier = getContractWageMultiplier(offer.years);
    const adjustedExpectedWage = Math.round(
      playerWage * DEFAULT_FREE_AGENT_CONFIG.unemploymentFactor * contractMultiplier
    );

    // Use the new freeAgentDecision function with proper config
    // Pass adjusted wage expectations to the decision function
    const faDecision = freeAgentDecision(
      adjustedExpectedWage / DEFAULT_FREE_AGENT_CONFIG.unemploymentFactor, // Reverse the unemployment factor since freeAgentDecision applies it
      offer.wage,
      teamRep,
      round, // Pass round for hardening factor
    );

    if (faDecision.action === 'accept') {
      aiDecision = { action: 'accept' };
    } else if (faDecision.action === 'reject') {
      // On final round, be more lenient
      if (round >= MAX_NEGOTIATION_ROUNDS && offer.wage >= adjustedExpectedWage * 0.7) {
        aiDecision = { action: 'accept' };
      } else {
        aiDecision = { action: 'reject' };
      }
    } else {
      // Counter - freeAgentDecision already calculated the counter as midpoint
      // between offer and expected wage, so use it directly
      aiDecision = {
        action: 'counter',
        amount: 0,
        wage: faDecision.wage,
      };
    }
  } else {
    // Listed player negotiation
    const listingResult = await db
      .select({ askingPrice: transferListings.askingPrice })
      .from(transferListings)
      .where(
        and(
          eq(transferListings.saveId, saveId),
          eq(transferListings.playerId, playerId),
        ),
      )
      .limit(1);

    if (listingResult.length === 0) {
      throw new Error('Player is not listed for sale');
    }

    const askingPrice = Math.round(listingResult[0].askingPrice * hardeningFactor);

    const squadCount = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.teamId, fromTeamId));

    const decision = aiSellDecision(
      askingPrice,
      offer.fee,
      offer.wage,
      squadCount.length,
      createPlayerForCalc({
        wage: player.wage,
        age: player.age,
        potential: player.potential,
        marketValue: player.marketValue,
        contractEndSeason: player.contractEndSeason,
        attributes: attrs,
        position: player.position,
      }),
      currentSeason,
    );

    if (decision.action === 'accept') {
      aiDecision = { action: 'accept' };
    } else if (decision.action === 'reject') {
      // On final round, be more lenient
      if (round >= MAX_NEGOTIATION_ROUNDS && offer.fee >= askingPrice * 0.85) {
        aiDecision = { action: 'accept' };
      } else {
        aiDecision = { action: 'reject' };
      }
    } else {
      // Counter - but if we're at max rounds, this is the final offer
      if (round >= MAX_NEGOTIATION_ROUNDS) {
        // Final round - no more counters, accept or reject
        if (offer.fee >= askingPrice * 0.9) {
          aiDecision = { action: 'accept' };
        } else {
          aiDecision = { action: 'reject' };
        }
      } else {
        aiDecision = {
          action: 'counter',
          amount: decision.amount,
          wage: decision.wage,
        };
      }
    }
  }

  // Handle AI decision
  if (aiDecision.action === 'accept') {
    // Complete the transfer immediately
    const offerId = await createAndAcceptOffer(
      db,
      saveId,
      playerId,
      fromTeamId,
      toTeamId,
      offer.fee,
      offer.wage,
      offer.years,
      currentRound,
    );

    const transferResult = await completeTransfer(db, d1, saveId, offerId);
    activeNegotiations.delete(newNegotiationId);

    return {
      negotiationId: newNegotiationId,
      round,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: { action: 'accept', reason: 'Deal!' },
      canCounter: false,
      completed: {
        transferId: transferResult.transferId,
        finalFee: offer.fee,
        finalWage: offer.wage,
      },
    };
  }

  if (aiDecision.action === 'reject') {
    activeNegotiations.delete(newNegotiationId);

    return {
      negotiationId: newNegotiationId,
      round,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: {
        action: 'reject',
        reason: round >= MAX_NEGOTIATION_ROUNDS
          ? 'Final offer rejected. No deal.'
          : 'Offer too low',
      },
      canCounter: false,
    };
  }

  // Counter offer - only set if we have valid counter values
  if (aiDecision.amount === undefined || aiDecision.wage === undefined) {
    throw new Error('AI counter decision missing amount or wage');
  }
  // Store hardening factor for next round (add 5% for the next iteration)
  const nextHardeningFactor = hardeningFactor + 0.05;
  activeNegotiations.set(newNegotiationId, {
    playerId,
    fromTeamId,
    toTeamId,
    round,
    lastOffer: offer,
    lastAiOffer: { fee: aiDecision.amount, wage: aiDecision.wage },
    hardeningFactor: nextHardeningFactor,
    createdAt: Date.now(),
  });

  return {
    negotiationId: newNegotiationId,
    round,
    maxRounds: MAX_NEGOTIATION_ROUNDS,
    aiResponse: {
      action: 'counter',
      counterFee: aiDecision.amount,
      counterWage: aiDecision.wage,
      reason: 'We want more',
    },
    canCounter: round < MAX_NEGOTIATION_ROUNDS,
  };
}

/**
 * Helper to create an offer and immediately mark it as accepted
 */
async function createAndAcceptOffer(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerId: string,
  fromTeamId: string | null,
  toTeamId: string,
  offerAmount: number,
  offeredWage: number,
  contractYears: number,
  currentRound: number,
): Promise<string> {
  const offerId = generateOfferId(saveId);

  await db.insert(transferOffers).values({
    id: offerId,
    saveId,
    playerId,
    fromTeamId,
    toTeamId,
    offerAmount,
    offeredWage,
    contractYears,
    status: 'accepted',
    createdRound: currentRound,
    expiresRound: currentRound + OFFER_EXPIRY_ROUNDS,
    respondedRound: currentRound,
  });

  return offerId;
}

/**
 * Respond to incoming AI offer on player's listed player
 * Used when AI makes offers on the player's listed players
 */
export async function negotiateIncomingOffer(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  offerId: string,
  action: 'accept' | 'reject' | 'counter',
  counterOffer?: { fee: number; wage: number },
  negotiationId?: string,
): Promise<NegotiationResult> {
  const saveResult = await db
    .select({ currentRound: saves.currentRound, playerTeamId: saves.playerTeamId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;
  const playerTeamId = saveResult[0]?.playerTeamId;

  // Get the original offer
  const offerResult = await db
    .select()
    .from(transferOffers)
    .where(eq(transferOffers.id, offerId))
    .limit(1);

  if (offerResult.length === 0) {
    throw new Error('Offer not found');
  }

  const offer = offerResult[0];

  // Authorization: verify the offer is for the player's team (they own the player being sold)
  if (offer.fromTeamId !== playerTeamId) {
    throw new Error('Unauthorized: You can only negotiate offers for your own players');
  }
  let newNegotiationId = negotiationId || generateNegotiationId();
  let negotiation = negotiationId ? getNegotiation(negotiationId) : undefined;
  let round = negotiation ? negotiation.round + 1 : 1;
  let hardeningFactor = negotiation ? negotiation.hardeningFactor : 1.0;

  if (action === 'accept') {
    // Accept the offer (or counter)
    const finalFee = negotiation?.lastAiOffer?.fee ?? offer.offerAmount;
    const finalWage = negotiation?.lastAiOffer?.wage ?? offer.offeredWage;

    await db
      .update(transferOffers)
      .set({
        status: 'accepted',
        offerAmount: finalFee,
        offeredWage: finalWage,
        respondedRound: currentRound,
      })
      .where(eq(transferOffers.id, offerId));

    const transferResult = await completeTransfer(db, d1, saveId, offerId);
    activeNegotiations.delete(newNegotiationId);

    return {
      negotiationId: newNegotiationId,
      round,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: { action: 'accept', reason: 'Deal!' },
      canCounter: false,
      completed: {
        transferId: transferResult.transferId,
        finalFee,
        finalWage,
      },
    };
  }

  if (action === 'reject') {
    await db
      .update(transferOffers)
      .set({ status: 'rejected', respondedRound: currentRound })
      .where(eq(transferOffers.id, offerId));

    activeNegotiations.delete(newNegotiationId);

    return {
      negotiationId: newNegotiationId,
      round,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: { action: 'reject', reason: 'Offer rejected' },
      canCounter: false,
    };
  }

  // Counter offer
  if (!counterOffer) {
    throw new Error('Counter offer requires fee and wage');
  }

  // Validate meaningful increase
  const lastFee = negotiation?.lastOffer?.fee ?? offer.offerAmount;
  const feeIncrease = (counterOffer.fee - lastFee) / Math.max(lastFee, 1);
  
  if (feeIncrease < MIN_COUNTER_INCREASE && counterOffer.fee > lastFee) {
    return {
      negotiationId: newNegotiationId,
      round: negotiation?.round ?? 1,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: {
        action: 'reject',
        reason: 'Counter offer must request at least 5% more',
      },
      canCounter: true,
    };
  }

  // AI responds to player's counter - use stored factor, don't recalculate
  const aiWillingness = Math.max(0.7, 1.0 - (round - 1) * 0.1);
  const effectiveAsk = counterOffer.fee * aiWillingness;

  let aiDecision: { action: 'accept' | 'reject' | 'counter'; fee?: number; wage?: number };

  // AI evaluates the counter
  if (offer.offerAmount >= effectiveAsk) {
    aiDecision = { action: 'accept' };
  } else if (round >= MAX_NEGOTIATION_ROUNDS) {
    // Final round - accept if close, reject otherwise
    if (offer.offerAmount >= counterOffer.fee * 0.85) {
      aiDecision = { action: 'accept' };
    } else {
      aiDecision = { action: 'reject' };
    }
  } else {
    // Counter back
    const midpoint = Math.round((offer.offerAmount + counterOffer.fee) / 2);
    aiDecision = {
      action: 'counter',
      fee: midpoint,
      wage: Math.round((offer.offeredWage + counterOffer.wage) / 2),
    };
  }

  if (aiDecision.action === 'accept') {
    await db
      .update(transferOffers)
      .set({
        status: 'accepted',
        offerAmount: counterOffer.fee,
        offeredWage: counterOffer.wage,
        respondedRound: currentRound,
      })
      .where(eq(transferOffers.id, offerId));

    const transferResult = await completeTransfer(db, d1, saveId, offerId);
    activeNegotiations.delete(newNegotiationId);

    return {
      negotiationId: newNegotiationId,
      round,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: { action: 'accept', reason: 'Deal!' },
      canCounter: false,
      completed: {
        transferId: transferResult.transferId,
        finalFee: counterOffer.fee,
        finalWage: counterOffer.wage,
      },
    };
  }

  if (aiDecision.action === 'reject') {
    await db
      .update(transferOffers)
      .set({ status: 'rejected', respondedRound: currentRound })
      .where(eq(transferOffers.id, offerId));

    activeNegotiations.delete(newNegotiationId);

    return {
      negotiationId: newNegotiationId,
      round,
      maxRounds: MAX_NEGOTIATION_ROUNDS,
      aiResponse: { action: 'reject', reason: 'No deal' },
      canCounter: false,
    };
  }

  // Store negotiation state for next round - only if we have valid counter values
  if (aiDecision.fee === undefined || aiDecision.wage === undefined) {
    throw new Error('AI counter decision missing fee or wage');
  }
  // Store hardening factor for next round (add 5% for the next iteration)
  const nextHardeningFactor = hardeningFactor + 0.05;
  activeNegotiations.set(newNegotiationId, {
    playerId: offer.playerId,
    fromTeamId: offer.fromTeamId,
    toTeamId: offer.toTeamId,
    round,
    lastOffer: { fee: counterOffer.fee, wage: counterOffer.wage, years: offer.contractYears },
    lastAiOffer: { fee: aiDecision.fee, wage: aiDecision.wage },
    hardeningFactor: nextHardeningFactor,
    createdAt: Date.now(),
  });

  // Update offer with counter
  await db
    .update(transferOffers)
    .set({
      status: 'counter',
      counterAmount: aiDecision.fee,
      counterWage: aiDecision.wage,
      respondedRound: currentRound,
    })
    .where(eq(transferOffers.id, offerId));

  return {
    negotiationId: newNegotiationId,
    round,
    maxRounds: MAX_NEGOTIATION_ROUNDS,
    aiResponse: {
      action: 'counter',
      counterFee: aiDecision.fee,
      counterWage: aiDecision.wage,
      reason: 'We can meet in the middle',
    },
    canCounter: round < MAX_NEGOTIATION_ROUNDS,
  };
}
