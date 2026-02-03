// ============================================================================
// RETROFOOT - AI Transfer Service
// ============================================================================
// Handles AI team transfer decisions during round advancement

import type { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, ne, inArray, sql } from 'drizzle-orm';
import {
  teams,
  players,
  transferListings,
  transferOffers,
} from '@retrofoot/db/schema';
import {
  calculateOverall,
  calculateAskingPrice,
  calculatePositionNeeds,
  aiBuyDecision,
  aiFreeAgentDecision,
  aiSelectPlayersToList,
  generateListingId,
  generateOfferId,
  createPlayerForCalc,
  DEFAULT_TRANSFER_CONFIG,
  type Position,
  type PlayerAttributes,
  type TransferConfig,
} from '@retrofoot/core';

import { processExpiredOffers } from './transfer.service';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Fisher-Yates shuffle for fair randomization
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// AI LISTING DECISIONS
// ============================================================================

/**
 * Have AI teams list players for sale
 */
export async function processAIListings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentSeason: number,
  currentRound: number,
): Promise<number> {
  // Get all AI teams (not the player's team)
  const aiTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), ne(teams.id, playerTeamId)));

  if (aiTeams.length === 0) return 0;

  const aiTeamIds = aiTeams.map((t) => t.id);

  // Get all players from AI teams
  const aiPlayers = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      name: players.name,
      age: players.age,
      position: players.position,
      attributes: players.attributes,
      potential: players.potential,
      contractEndSeason: players.contractEndSeason,
      wage: players.wage,
      marketValue: players.marketValue,
      status: players.status,
      form: players.form,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.teamId, aiTeamIds)));

  // Get existing listings to avoid duplicates
  const existingListings = await db
    .select({ playerId: transferListings.playerId })
    .from(transferListings)
    .where(eq(transferListings.saveId, saveId));

  const listedPlayerIds = new Set(existingListings.map((l) => l.playerId));

  // Group players by team
  const playersByTeam = new Map<string, typeof aiPlayers>();
  for (const player of aiPlayers) {
    if (!player.teamId) continue;
    const teamPlayers = playersByTeam.get(player.teamId);
    if (teamPlayers) {
      teamPlayers.push(player);
    } else {
      playersByTeam.set(player.teamId, [player]);
    }
  }

  // For each AI team, select players to list
  const newListings: Array<{
    id: string;
    saveId: string;
    playerId: string;
    teamId: string;
    askingPrice: number;
    status: string;
    listedRound: number;
  }> = [];

  for (const [teamId, teamPlayers] of playersByTeam) {
    // Convert to format expected by aiSelectPlayersToList
    const formattedPlayers = teamPlayers.map((p) => {
      const attrs = p.attributes as Record<string, number>;
      return {
        id: p.id,
        name: p.name,
        age: p.age,
        position: p.position as Position,
        attributes: attrs as unknown as PlayerAttributes,
        potential: p.potential,
        contractEndSeason: p.contractEndSeason,
        wage: p.wage,
        marketValue: p.marketValue,
        status: (p.status || 'active') as
          | 'active'
          | 'retiring'
          | 'retired'
          | 'deceased'
          | 'suspended',
        form: {
          form: (p.form as number) || 70,
          lastFiveRatings: [] as number[],
          seasonGoals: 0,
          seasonAssists: 0,
          seasonMinutes: 0,
          seasonAvgRating: 0,
        },
        morale: 70,
        fitness: 100,
        injured: false,
        injuryWeeks: 0,
        nickname: undefined,
        nationality: 'Brazil',
        preferredFoot: 'right' as const,
      };
    });

    const toList = aiSelectPlayersToList(formattedPlayers, currentSeason);

    for (const player of toList) {
      // Skip if already listed
      if (listedPlayerIds.has(player.id)) continue;

      const askingPrice = calculateAskingPrice(player, currentSeason);
      const contractYearsRemaining = player.contractEndSeason - currentSeason;
      const status =
        contractYearsRemaining <= 1 ? 'contract_expiring' : 'available';

      newListings.push({
        id: generateListingId(saveId),
        saveId,
        playerId: player.id,
        teamId,
        askingPrice,
        status,
        listedRound: currentRound,
      });
    }
  }

  // Insert new listings
  if (newListings.length > 0) {
    await db.insert(transferListings).values(newListings);
  }

  return newListings.length;
}

// ============================================================================
// AI BUY DECISIONS
// ============================================================================

/**
 * Have AI teams make offers for players they need
 */
export async function processAIOffers(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  _currentSeason: number,
  currentRound: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): Promise<number> {
  // Get all AI teams with their financial data
  const aiTeams = await db
    .select({
      id: teams.id,
      budget: teams.budget,
      wageBudget: teams.wageBudget,
      reputation: teams.reputation,
    })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), ne(teams.id, playerTeamId)));

  if (aiTeams.length === 0) return 0;

  const aiTeamIds = aiTeams.map((t) => t.id);
  const aiTeamMap = new Map(aiTeams.map((t) => [t.id, t]));

  // Get all players from AI teams to calculate squad composition
  const aiPlayers = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      position: players.position,
      attributes: players.attributes,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.teamId, aiTeamIds)));

  // Calculate position counts and average overall for each team
  const teamStats = new Map<
    string,
    {
      positionCounts: Record<Position, number>;
      avgOverall: number;
    }
  >();

  for (const teamId of aiTeamIds) {
    const teamPlayers = aiPlayers.filter((p) => p.teamId === teamId);
    const positionCounts: Record<Position, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      ATT: 0,
    };
    let totalOverall = 0;

    for (const player of teamPlayers) {
      positionCounts[player.position as Position]++;
      const attrs = player.attributes as Record<string, number>;
      totalOverall += calculateOverall(
        createPlayerForCalc({
          attributes: attrs,
          position: player.position,
        }),
      );
    }

    teamStats.set(teamId, {
      positionCounts,
      avgOverall:
        teamPlayers.length > 0 ? totalOverall / teamPlayers.length : 50,
    });
  }

  // Get available listings (not from AI teams making decisions)
  const listings = await db
    .select({
      id: transferListings.id,
      playerId: transferListings.playerId,
      teamId: transferListings.teamId,
      askingPrice: transferListings.askingPrice,
    })
    .from(transferListings)
    .where(eq(transferListings.saveId, saveId));

  // Get player details for listings
  const listedPlayerIds = listings.map((l) => l.playerId);
  if (listedPlayerIds.length === 0) return 0;

  const listedPlayers = await db
    .select({
      id: players.id,
      position: players.position,
      age: players.age,
      attributes: players.attributes,
      potential: players.potential,
      wage: players.wage,
      marketValue: players.marketValue,
      contractEndSeason: players.contractEndSeason,
    })
    .from(players)
    .where(inArray(players.id, listedPlayerIds));

  const playerMap = new Map(listedPlayers.map((p) => [p.id, p]));

  // Get existing pending offers to avoid duplicates
  const existingOffers = await db
    .select({
      playerId: transferOffers.playerId,
      toTeamId: transferOffers.toTeamId,
    })
    .from(transferOffers)
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        eq(transferOffers.status, 'pending'),
      ),
    );

  const existingOfferSet = new Set(
    existingOffers.map((o) => `${o.playerId}-${o.toTeamId}`),
  );

  // Track offers made this round per team
  const offersThisRound = new Map<string, number>();

  // Each AI team considers making offers up to the configured limit
  const newOffers: Array<{
    id: string;
    saveId: string;
    playerId: string;
    fromTeamId: string | null;
    toTeamId: string;
    offerAmount: number;
    offeredWage: number;
    contractYears: number;
    status: string;
    createdRound: number;
    expiresRound: number;
  }> = [];

  for (const [teamId, team] of aiTeamMap) {
    const stats = teamStats.get(teamId);
    if (!stats) continue;

    const needs = calculatePositionNeeds(stats.positionCounts);
    offersThisRound.set(teamId, 0);

    // Find suitable players to bid on
    for (const listing of listings) {
      // Check if team has reached offer limit for this round
      const currentOffers = offersThisRound.get(teamId) || 0;
      if (currentOffers >= config.maxOffersPerTeamPerRound) break;

      // Don't bid on own players
      if (listing.teamId === teamId) continue;

      // Check if already has pending offer
      if (existingOfferSet.has(`${listing.playerId}-${teamId}`)) continue;

      const player = playerMap.get(listing.playerId);
      if (!player) continue;

      const attrs = player.attributes as Record<string, number>;

      const playerForCalc = createPlayerForCalc({
        attributes: attrs,
        position: player.position,
        age: player.age,
        potential: player.potential,
        wage: player.wage,
        marketValue: player.marketValue,
        contractEndSeason: player.contractEndSeason,
      });

      const decision = aiBuyDecision(
        playerForCalc,
        listing.askingPrice,
        team.budget,
        team.wageBudget,
        stats.avgOverall,
        needs,
        team.reputation,
        config,
      );

      if (decision.willBuy && decision.offerAmount && decision.offeredWage) {
        newOffers.push({
          id: generateOfferId(saveId),
          saveId,
          playerId: listing.playerId,
          fromTeamId: listing.teamId,
          toTeamId: teamId,
          offerAmount: decision.offerAmount,
          offeredWage: decision.offeredWage,
          contractYears: decision.contractYears || 3,
          status: 'pending',
          createdRound: currentRound,
          expiresRound: currentRound + config.offerExpiryRounds,
        });

        // Track offers for this team
        offersThisRound.set(teamId, currentOffers + 1);
      }
    }
  }

  // Insert new offers
  if (newOffers.length > 0) {
    await db.insert(transferOffers).values(newOffers);
  }

  return newOffers.length;
}

// ============================================================================
// FREE AGENT SIGNING
// ============================================================================

/**
 * Have AI teams sign free agents they need
 */
export async function processAIFreeAgentSignings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentSeason: number,
  _currentRound: number,
): Promise<number> {
  // Get free agents
  const freeAgents = await db
    .select({
      id: players.id,
      position: players.position,
      age: players.age,
      attributes: players.attributes,
      potential: players.potential,
      wage: players.wage,
      marketValue: players.marketValue,
      contractEndSeason: players.contractEndSeason,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), isNull(players.teamId)));

  if (freeAgents.length === 0) return 0;

  // Get AI teams
  const aiTeams = await db
    .select({
      id: teams.id,
      budget: teams.budget,
      wageBudget: teams.wageBudget,
      reputation: teams.reputation,
    })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), ne(teams.id, playerTeamId)));

  if (aiTeams.length === 0) return 0;

  const aiTeamIds = aiTeams.map((t) => t.id);

  // Get squad composition for each AI team
  const aiPlayers = await db
    .select({
      teamId: players.teamId,
      position: players.position,
      attributes: players.attributes,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.teamId, aiTeamIds)));

  const teamStats = new Map<
    string,
    {
      positionCounts: Record<Position, number>;
      avgOverall: number;
    }
  >();

  for (const teamId of aiTeamIds) {
    const teamPlayers = aiPlayers.filter((p) => p.teamId === teamId);
    const positionCounts: Record<Position, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      ATT: 0,
    };
    let totalOverall = 0;

    for (const player of teamPlayers) {
      positionCounts[player.position as Position]++;
      const attrs = player.attributes as Record<string, number>;
      totalOverall += calculateOverall(
        createPlayerForCalc({
          attributes: attrs,
          position: player.position,
        }),
      );
    }

    teamStats.set(teamId, {
      positionCounts,
      avgOverall:
        teamPlayers.length > 0 ? totalOverall / teamPlayers.length : 50,
    });
  }

  let signings = 0;

  // Shuffle teams to randomize who gets first pick (Fisher-Yates for fair distribution)
  const shuffledTeams = shuffleArray(aiTeams);

  // Each team can sign one free agent per round
  const signedPlayers = new Set<string>();

  for (const team of shuffledTeams) {
    const stats = teamStats.get(team.id);
    if (!stats) continue;

    const needs = calculatePositionNeeds(stats.positionCounts);

    for (const fa of freeAgents) {
      if (signedPlayers.has(fa.id)) continue;

      const attrs = fa.attributes as Record<string, number>;

      const faPlayerForCalc = createPlayerForCalc({
        attributes: attrs,
        position: fa.position,
        age: fa.age,
        potential: fa.potential,
        wage: fa.wage,
        marketValue: fa.marketValue,
        contractEndSeason: fa.contractEndSeason,
      });

      const decision = aiFreeAgentDecision(
        faPlayerForCalc,
        team.budget,
        team.wageBudget,
        stats.avgOverall,
        needs,
        team.reputation,
      );

      if (decision.willSign && decision.offeredWage) {
        // Sign the player
        const newContractEnd = currentSeason + (decision.contractYears || 2);

        await db
          .update(players)
          .set({
            teamId: team.id,
            wage: decision.offeredWage,
            contractEndSeason: newContractEnd,
            morale: 70,
          })
          .where(eq(players.id, fa.id));

        // Update team wage budget tracking
        await db
          .update(teams)
          .set({
            roundWages: sql`${teams.roundWages} + ${decision.offeredWage}`,
          })
          .where(eq(teams.id, team.id));

        signedPlayers.add(fa.id);
        signings++;

        // Update position counts
        stats.positionCounts[fa.position as Position]++;

        // Only one signing per team per round
        break;
      }
    }
  }

  return signings;
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process all AI transfer activity for a round
 */
export async function processAITransfers(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentSeason: string,
  currentRound: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): Promise<{
  expiredOffers: number;
  newListings: number;
  newOffers: number;
  freeAgentSignings: number;
}> {
  const currentSeasonNum = parseInt(currentSeason, 10);

  // Process in order
  const expiredOffers = await processExpiredOffers(db, saveId, currentRound);
  const newListings = await processAIListings(
    db,
    saveId,
    playerTeamId,
    currentSeasonNum,
    currentRound,
  );
  const newOffers = await processAIOffers(
    db,
    saveId,
    playerTeamId,
    currentSeasonNum,
    currentRound,
    config,
  );
  const freeAgentSignings = await processAIFreeAgentSignings(
    db,
    saveId,
    playerTeamId,
    currentSeasonNum,
    currentRound,
  );

  return {
    expiredOffers,
    newListings,
    newOffers,
    freeAgentSignings,
  };
}
