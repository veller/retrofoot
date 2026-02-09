// ============================================================================
// RETROFOOT - AI Transfer Service
// ============================================================================

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
import { batchInsertChunked } from '../lib/db/batch';

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function processAIListings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentSeason: number,
  currentRound: number,
): Promise<number> {
  const aiTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), ne(teams.id, playerTeamId)));

  if (aiTeams.length === 0) return 0;

  const aiTeamIds = aiTeams.map((t) => t.id);

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

  const existingListings = await db
    .select({ playerId: transferListings.playerId })
    .from(transferListings)
    .where(eq(transferListings.saveId, saveId));

  const listedPlayerIds = new Set(existingListings.map((l) => l.playerId));

  const playersByTeam = new Map<string, typeof aiPlayers>();
  for (const player of aiPlayers) {
    if (!player.teamId) continue;
    const existing = playersByTeam.get(player.teamId);
    if (existing) {
      existing.push(player);
    } else {
      playersByTeam.set(player.teamId, [player]);
    }
  }

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
    const formattedPlayers = teamPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      position: p.position as Position,
      attributes: p.attributes as unknown as PlayerAttributes,
      potential: p.potential,
      contractEndSeason: p.contractEndSeason,
      wage: p.wage,
      marketValue: p.marketValue,
      status: (p.status || 'active') as 'active' | 'retiring' | 'retired' | 'deceased' | 'suspended',
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
      energy: 100,
      injured: false,
      injuryWeeks: 0,
      nickname: undefined,
      nationality: 'Brazil',
      preferredFoot: 'right' as const,
    }));

    const toList = aiSelectPlayersToList(formattedPlayers, currentSeason);

    for (const player of toList) {
      if (listedPlayerIds.has(player.id)) continue;

      const askingPrice = calculateAskingPrice(player, currentSeason);
      const contractYearsRemaining = player.contractEndSeason - currentSeason;

      newListings.push({
        id: generateListingId(saveId),
        saveId,
        playerId: player.id,
        teamId,
        askingPrice,
        status: contractYearsRemaining <= 1 ? 'contract_expiring' : 'available',
        listedRound: currentRound,
      });
    }
  }

  if (newListings.length > 0) {
    await batchInsertChunked(db, transferListings, newListings);
  }

  return newListings.length;
}

export async function processAIOffers(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentRound: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): Promise<number> {
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

  const aiPlayers = await db
    .select({
      id: players.id,
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
      positionAvgOverall: Record<Position, number>;
    }
  >();

  for (const teamId of aiTeamIds) {
    const teamPlayers = aiPlayers.filter((p) => p.teamId === teamId);
    const positionCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    const positionTotalOverall: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    let totalOverall = 0;

    for (const player of teamPlayers) {
      const pos = player.position as Position;
      positionCounts[pos]++;
      const playerOverall = calculateOverall(
        createPlayerForCalc({
          attributes: player.attributes as Record<string, number>,
          position: player.position,
        }),
      );
      totalOverall += playerOverall;
      positionTotalOverall[pos] += playerOverall;
    }

    teamStats.set(teamId, {
      positionCounts,
      avgOverall: teamPlayers.length > 0 ? totalOverall / teamPlayers.length : 50,
      positionAvgOverall: {
        GK: positionCounts.GK > 0 ? positionTotalOverall.GK / positionCounts.GK : 50,
        DEF: positionCounts.DEF > 0 ? positionTotalOverall.DEF / positionCounts.DEF : 50,
        MID: positionCounts.MID > 0 ? positionTotalOverall.MID / positionCounts.MID : 50,
        ATT: positionCounts.ATT > 0 ? positionTotalOverall.ATT / positionCounts.ATT : 50,
      },
    });
  }

  const listings = await db
    .select({
      id: transferListings.id,
      playerId: transferListings.playerId,
      teamId: transferListings.teamId,
      askingPrice: transferListings.askingPrice,
    })
    .from(transferListings)
    .where(and(eq(transferListings.saveId, saveId), ne(transferListings.status, 'free_agent')));

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

  const existingOffers = await db
    .select({ playerId: transferOffers.playerId, toTeamId: transferOffers.toTeamId })
    .from(transferOffers)
    .where(and(eq(transferOffers.saveId, saveId), eq(transferOffers.status, 'pending')));

  const existingOfferSet = new Set(existingOffers.map((o) => `${o.playerId}-${o.toTeamId}`));
  const offersThisRound = new Map<string, number>();

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

    for (const listing of listings) {
      const currentOffers = offersThisRound.get(teamId) || 0;
      if (currentOffers >= config.maxOffersPerTeamPerRound) break;
      if (listing.teamId === teamId) continue;
      if (existingOfferSet.has(`${listing.playerId}-${teamId}`)) continue;

      const player = playerMap.get(listing.playerId);
      if (!player) continue;

      const decision = aiBuyDecision(
        createPlayerForCalc({
          attributes: player.attributes as Record<string, number>,
          position: player.position,
          age: player.age,
          potential: player.potential,
          wage: player.wage,
          marketValue: player.marketValue,
          contractEndSeason: player.contractEndSeason,
        }),
        listing.askingPrice,
        team.budget,
        team.wageBudget,
        stats.avgOverall,
        needs,
        team.reputation,
        config,
        stats.positionAvgOverall[player.position as Position],
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
        offersThisRound.set(teamId, currentOffers + 1);
      }
    }
  }

  if (newOffers.length > 0) {
    await batchInsertChunked(db, transferOffers, newOffers);
  }

  return newOffers.length;
}

export async function processAIFreeAgentSignings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentSeason: number,
): Promise<number> {
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

  const aiPlayers = await db
    .select({
      teamId: players.teamId,
      position: players.position,
      attributes: players.attributes,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.teamId, aiTeamIds)));

  const teamStats = new Map<string, { positionCounts: Record<Position, number>; avgOverall: number }>();

  for (const teamId of aiTeamIds) {
    const teamPlayers = aiPlayers.filter((p) => p.teamId === teamId);
    const positionCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    let totalOverall = 0;

    for (const player of teamPlayers) {
      positionCounts[player.position as Position]++;
      totalOverall += calculateOverall(
        createPlayerForCalc({
          attributes: player.attributes as Record<string, number>,
          position: player.position,
        }),
      );
    }

    teamStats.set(teamId, {
      positionCounts,
      avgOverall: teamPlayers.length > 0 ? totalOverall / teamPlayers.length : 50,
    });
  }

  let signings = 0;
  const shuffledTeams = shuffleArray(aiTeams);
  const signedPlayers = new Set<string>();

  for (const team of shuffledTeams) {
    const stats = teamStats.get(team.id);
    if (!stats) continue;

    const needs = calculatePositionNeeds(stats.positionCounts);

    for (const fa of freeAgents) {
      if (signedPlayers.has(fa.id)) continue;

      const decision = aiFreeAgentDecision(
        createPlayerForCalc({
          attributes: fa.attributes as Record<string, number>,
          position: fa.position,
          age: fa.age,
          potential: fa.potential,
          wage: fa.wage,
          marketValue: fa.marketValue,
          contractEndSeason: fa.contractEndSeason,
        }),
        team.budget,
        team.wageBudget,
        stats.avgOverall,
        needs,
        team.reputation,
      );

      if (decision.willSign && decision.offeredWage) {
        const newContractEnd = currentSeason + (decision.contractYears || 2);

        await db
          .update(players)
          .set({ teamId: team.id, wage: decision.offeredWage, contractEndSeason: newContractEnd, morale: 70 })
          .where(eq(players.id, fa.id));

        await db
          .update(teams)
          .set({ roundWages: sql`${teams.roundWages} + ${decision.offeredWage}` })
          .where(eq(teams.id, team.id));

        signedPlayers.add(fa.id);
        signings++;
        stats.positionCounts[fa.position as Position]++;
        break;
      }
    }
  }

  return signings;
}

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

  const expiredOffers = await processExpiredOffers(db, saveId, currentRound);
  const newListings = await processAIListings(db, saveId, playerTeamId, currentSeasonNum, currentRound);
  const newOffers = await processAIOffers(db, saveId, playerTeamId, currentRound, config);
  const freeAgentSignings = await processAIFreeAgentSignings(db, saveId, playerTeamId, currentSeasonNum);

  return { expiredOffers, newListings, newOffers, freeAgentSignings };
}
