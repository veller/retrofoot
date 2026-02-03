// ============================================================================
// RETROFOOT - Transfer Service
// ============================================================================
// D1-specific transfer operations

import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { drizzle } from 'drizzle-orm/d1';
import { eq, and, or, isNull, lte } from 'drizzle-orm';
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
  generateTransactionId,
  generateListingId,
  generateOfferId,
  createPlayerForCalc,
  OFFER_EXPIRY_ROUNDS,
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

  // Get player details for all listings
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
    .where(eq(players.saveId, saveId));

  // Filter to only players in listings
  const playerMap = new Map(
    playerResults
      .filter((p) => playerIds.includes(p.id))
      .map((p) => [p.id, p]),
  );

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
    const overall = calculateOverall(createPlayerForCalc({
      attributes: attrs,
      position: player.position,
    }));

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
    const overall = calculateOverall(createPlayerForCalc({
      attributes: attrs,
      position: player.position,
    }));

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

  // Get player details
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
    .where(eq(players.saveId, saveId));

  const playerMap = new Map(
    playerResults
      .filter((p) => playerIds.includes(p.id))
      .map((p) => [p.id, p]),
  );

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
    const overall = calculateOverall(createPlayerForCalc({
      attributes: attrs,
      position: player.position,
    }));

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
    .select({ currentSeason: saves.currentSeason, currentRound: saves.currentRound })
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
  const status = contractYearsRemaining <= 1 ? 'contract_expiring' : 'available';

  const listingId = generateListingId();

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
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
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
    playerResults
      .filter((p) => playerIds.includes(p.id))
      .map((p) => [p.id, p]),
  );

  // Get team names
  const teamResults = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.saveId, saveId));

  const teamMap = new Map(teamResults.map((t) => [t.id, t.name]));

  const mapOffer = (offer: typeof offers[0]): ActiveOffer => {
    const player = playerMap.get(offer.playerId);
    return {
      id: offer.id,
      playerId: offer.playerId,
      playerName: player?.name || 'Unknown',
      playerPosition: player?.position || 'Unknown',
      fromTeamId: offer.fromTeamId,
      fromTeamName: offer.fromTeamId ? teamMap.get(offer.fromTeamId) || null : null,
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

  // Separate incoming (offers for players we own) and outgoing (offers we made)
  const incoming = offers
    .filter((o) => o.fromTeamId === teamId && o.status === 'pending')
    .map(mapOffer);

  const outgoing = offers
    .filter((o) => o.toTeamId === teamId)
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
): Promise<{ offerId: string; aiResponse?: { action: string; counterAmount?: number; counterWage?: number } }> {
  // Get current round
  const saveResult = await db
    .select({ currentRound: saves.currentRound, playerTeamId: saves.playerTeamId })
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

  const offerId = generateOfferId();

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
      const minWage = calculateWageDemand(
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
          aiResponse: { action: 'counter', counterAmount: 0, counterWage: Math.round(minWage) },
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

        const currentSeason = parseInt(saveData[0]?.currentSeason || '2026', 10);

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
  saveId: string,
  offerId: string,
  response: 'accept' | 'reject' | 'counter',
  counterAmount?: number,
  counterWage?: number,
): Promise<void> {
  const saveResult = await db
    .select({ currentRound: saves.currentRound })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  const currentRound = saveResult[0]?.currentRound || 1;

  if (response === 'accept') {
    await db
      .update(transferOffers)
      .set({ status: 'accepted', respondedRound: currentRound })
      .where(eq(transferOffers.id, offerId));
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
    d1.prepare(
      'UPDATE players SET team_id = ?, wage = ?, contract_end_season = ?, morale = 80 WHERE id = ?'
    ).bind(offer.toTeamId, offer.offeredWage, newContractEnd, offer.playerId)
  );

  // 2. Update team finances
  if (offer.fromTeamId && offer.offerAmount > 0) {
    // Selling team gets money
    statements.push(
      d1.prepare(
        'UPDATE teams SET budget = budget + ?, balance = balance + ? WHERE id = ?'
      ).bind(offer.offerAmount, offer.offerAmount, offer.fromTeamId)
    );

    // Create income transaction for selling team
    const sellTransactionId = generateTransactionId();
    statements.push(
      d1.prepare(
        'INSERT INTO transactions (id, save_id, team_id, type, category, amount, description, round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(sellTransactionId, saveId, offer.fromTeamId, 'income', 'player_sale', offer.offerAmount, 'Player sale', currentRound, nowTimestamp)
    );
  }

  if (offer.offerAmount > 0) {
    // Buying team loses money
    statements.push(
      d1.prepare(
        'UPDATE teams SET budget = budget - ?, balance = balance - ? WHERE id = ?'
      ).bind(offer.offerAmount, offer.offerAmount, offer.toTeamId)
    );

    // Create expense transaction for buying team
    const buyTransactionId = generateTransactionId();
    statements.push(
      d1.prepare(
        'INSERT INTO transactions (id, save_id, team_id, type, category, amount, description, round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(buyTransactionId, saveId, offer.toTeamId, 'expense', 'player_buy', offer.offerAmount, 'Player purchase', currentRound, nowTimestamp)
    );
  }

  // 3. Create transfer record
  statements.push(
    d1.prepare(
      'INSERT INTO transfers (id, save_id, player_id, from_team_id, to_team_id, fee, wage, season, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(transferId, saveId, offer.playerId, offer.fromTeamId, offer.toTeamId, offer.offerAmount, offer.offeredWage, currentSeason, now.toISOString())
  );

  // 4. Mark offer as completed
  statements.push(
    d1.prepare(
      'UPDATE transfer_offers SET status = ? WHERE id = ?'
    ).bind('completed', offerId)
  );

  // 5. Remove listing if exists
  if (offer.fromTeamId) {
    statements.push(
      d1.prepare(
        'DELETE FROM transfer_listings WHERE save_id = ? AND player_id = ?'
      ).bind(saveId, offer.playerId)
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
  await db
    .update(transferOffers)
    .set({ status: 'expired' })
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        eq(transferOffers.status, 'pending'),
        lte(transferOffers.expiresRound, currentRound),
      ),
    );

  return 0; // Drizzle doesn't return affected rows easily
}
