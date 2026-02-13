// ============================================================================
// RETROFOOT - AI Transfer Service
// ============================================================================

import type { D1Database } from '@cloudflare/workers-types';
import type { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, ne, inArray, sql, or } from 'drizzle-orm';
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
  aiSellDecision,
  aiFreeAgentDecision,
  aiSelectPlayersToList,
  calculateReleaseCompensation,
  generateListingId,
  generateOfferId,
  createPlayerForCalc,
  DEFAULT_TRANSFER_CONFIG,
  type Position,
  type PlayerAttributes,
  type TransferConfig,
} from '@retrofoot/core';
import {
  processExpiredOffers,
  completeTransfer,
  releasePlayerToFreeAgency,
} from './transfer.service';
import { batchInsertChunked } from '../lib/db/batch';

const LISTING_CHURN_ROUNDS = 6;
const LISTING_MARKDOWN_STEP = 0.04;
const LISTING_MARKDOWN_INTERVAL = 4;
const LISTING_PRICE_FLOOR_RATIO = 0.75;

interface AIListingMaintenanceResult {
  delistedCount: number;
  relistedCount: number;
}

export interface AIOfferResponseResult {
  aiOfferResponses: number;
  aiAutoCompletedTransfers: number;
  aiRejectedOffers: number;
  aiCounterOffers: number;
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface AIPlayerRow {
  id: string;
  teamId: string | null;
  name: string;
  age: number;
  position: string;
  attributes: unknown;
  potential: number;
  contractEndSeason: number;
  wage: number;
  marketValue: number;
  status: string | null;
  form: number | null;
  seasonMinutes: number | null;
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
      seasonMinutes: players.seasonMinutes,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.teamId, aiTeamIds)));

  const playersByTeam = new Map<string, AIPlayerRow[]>();
  for (const player of aiPlayers) {
    if (!player.teamId) continue;
    const existing = playersByTeam.get(player.teamId);
    if (existing) {
      existing.push(player);
    } else {
      playersByTeam.set(player.teamId, [player]);
    }
  }

  const listingMaintenance = await maintainAIListings(
    db,
    saveId,
    aiTeamIds,
    playersByTeam,
    currentSeason,
    currentRound,
  );

  const existingListings = await db
    .select({ playerId: transferListings.playerId })
    .from(transferListings)
    .where(eq(transferListings.saveId, saveId));

  const listedPlayerIds = new Set(existingListings.map((l) => l.playerId));

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
          seasonMinutes: p.seasonMinutes ?? 0,
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

  if (listingMaintenance.delistedCount > 0 || listingMaintenance.relistedCount > 0) {
    console.info(
      '[ai-transfer] listing-maintenance',
      JSON.stringify({
        saveId,
        currentRound,
        delisted: listingMaintenance.delistedCount,
        relisted: listingMaintenance.relistedCount,
        freshListings: newListings.length,
      }),
    );
  }

  return newListings.length + listingMaintenance.relistedCount;
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
    const positionCounts: Record<Position, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      ATT: 0,
    };
    const positionTotalOverall: Record<Position, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      ATT: 0,
    };
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
        DEF:
          positionCounts.DEF > 0
            ? positionTotalOverall.DEF / positionCounts.DEF
            : 50,
        MID:
          positionCounts.MID > 0
            ? positionTotalOverall.MID / positionCounts.MID
            : 50,
        ATT:
          positionCounts.ATT > 0
            ? positionTotalOverall.ATT / positionCounts.ATT
            : 50,
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
    .where(
      and(
        eq(transferListings.saveId, saveId),
        ne(transferListings.status, 'free_agent'),
      ),
    );

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

  const existingOfferSet = new Set(
    existingOffers.map((o) => `${o.playerId}-${o.toTeamId}`),
  );
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

  const buyDecisionReasonCounts = new Map<string, number>();

  for (const [teamId, team] of aiTeamMap) {
    const stats = teamStats.get(teamId);
    if (!stats) continue;

    const needs = calculatePositionNeeds(stats.positionCounts);
    offersThisRound.set(teamId, 0);

    const shuffledListings = shuffleArray(listings);
    for (const listing of shuffledListings) {
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
      } else if (decision.reason) {
        buyDecisionReasonCounts.set(
          decision.reason,
          (buyDecisionReasonCounts.get(decision.reason) || 0) + 1,
        );
      }
    }
  }

  if (newOffers.length > 0) {
    await batchInsertChunked(db, transferOffers, newOffers);
  }

  if (buyDecisionReasonCounts.size > 0) {
    console.info(
      '[ai-transfer] offer-evaluation-summary',
      JSON.stringify({
        saveId,
        currentRound,
        listingsConsidered: listings.length * aiTeamMap.size,
        offersCreated: newOffers.length,
        rejectionReasons: Object.fromEntries(buyDecisionReasonCounts),
      }),
    );
  }

  return newOffers.length;
}

export async function processAIOfferResponses(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  playerTeamId: string,
  currentRound: number,
  currentSeason: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): Promise<AIOfferResponseResult> {
  const aiTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), ne(teams.id, playerTeamId)));

  if (aiTeams.length === 0) {
    return {
      aiOfferResponses: 0,
      aiAutoCompletedTransfers: 0,
      aiRejectedOffers: 0,
      aiCounterOffers: 0,
    };
  }

  const aiTeamIds = aiTeams.map((t) => t.id);

  const offersNeedingResponse = await db
    .select({
      id: transferOffers.id,
      playerId: transferOffers.playerId,
      fromTeamId: transferOffers.fromTeamId,
      offerAmount: transferOffers.offerAmount,
      offeredWage: transferOffers.offeredWage,
      counterAmount: transferOffers.counterAmount,
      counterWage: transferOffers.counterWage,
      status: transferOffers.status,
    })
    .from(transferOffers)
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        inArray(transferOffers.fromTeamId, aiTeamIds),
        or(
          eq(transferOffers.status, 'pending'),
          eq(transferOffers.status, 'counter'),
        ),
      ),
    );

  if (offersNeedingResponse.length === 0) {
    return {
      aiOfferResponses: 0,
      aiAutoCompletedTransfers: 0,
      aiRejectedOffers: 0,
      aiCounterOffers: 0,
    };
  }

  const sellerTeamIds = Array.from(
    new Set(
      offersNeedingResponse
        .map((offer) => offer.fromTeamId)
        .filter((teamId): teamId is string => Boolean(teamId)),
    ),
  );

  const squadSizeByTeamId = new Map<string, number>();
  if (sellerTeamIds.length > 0) {
    const squadSizes = await db
      .select({
        teamId: players.teamId,
        count: sql<number>`count(*)`,
      })
      .from(players)
      .where(and(eq(players.saveId, saveId), inArray(players.teamId, sellerTeamIds)))
      .groupBy(players.teamId);

    for (const row of squadSizes) {
      if (!row.teamId) continue;
      squadSizeByTeamId.set(row.teamId, Number(row.count));
    }
  }

  const uniquePlayerIds = Array.from(
    new Set(offersNeedingResponse.map((offer) => offer.playerId)),
  );

  const playersInOffers = await db
    .select({
      id: players.id,
      age: players.age,
      position: players.position,
      attributes: players.attributes,
      potential: players.potential,
      wage: players.wage,
      marketValue: players.marketValue,
      contractEndSeason: players.contractEndSeason,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.id, uniquePlayerIds)));

  const playerById = new Map(playersInOffers.map((player) => [player.id, player]));

  const listingAskingPrices = await db
    .select({
      playerId: transferListings.playerId,
      askingPrice: transferListings.askingPrice,
    })
    .from(transferListings)
    .where(
      and(
        eq(transferListings.saveId, saveId),
        inArray(transferListings.playerId, uniquePlayerIds),
      ),
    );

  const askingByPlayerId = new Map(
    listingAskingPrices.map((listing) => [listing.playerId, listing.askingPrice]),
  );

  let aiOfferResponses = 0;
  let aiAutoCompletedTransfers = 0;
  let aiRejectedOffers = 0;
  let aiCounterOffers = 0;

  for (const offer of offersNeedingResponse) {
    const latestOfferState = await db
      .select({
        status: transferOffers.status,
        offerAmount: transferOffers.offerAmount,
        offeredWage: transferOffers.offeredWage,
        counterAmount: transferOffers.counterAmount,
        counterWage: transferOffers.counterWage,
      })
      .from(transferOffers)
      .where(eq(transferOffers.id, offer.id))
      .limit(1);

    const latest = latestOfferState[0];
    if (!latest || (latest.status !== 'pending' && latest.status !== 'counter')) {
      continue;
    }

    const player = playerById.get(offer.playerId);
    const sellerTeamId = offer.fromTeamId;
    if (!player || !sellerTeamId) continue;

    const askingPrice =
      askingByPlayerId.get(offer.playerId) ?? Math.round(player.marketValue * 0.9);
    const evaluationAmount =
      latest.status === 'counter' && latest.counterAmount !== null
        ? latest.counterAmount
        : latest.offerAmount;
    const evaluationWage =
      latest.status === 'counter' && latest.counterWage !== null
        ? latest.counterWage
        : latest.offeredWage;

    const sellDecision = aiSellDecision(
      askingPrice,
      evaluationAmount,
      evaluationWage,
      squadSizeByTeamId.get(sellerTeamId) || 0,
      createPlayerForCalc({
        age: player.age,
        position: player.position,
        attributes: player.attributes as Record<string, number>,
        potential: player.potential,
        wage: player.wage,
        marketValue: player.marketValue,
        contractEndSeason: player.contractEndSeason,
      }),
      currentSeason,
      config,
    );

    if (sellDecision.action === 'accept') {
      await db
        .update(transferOffers)
        .set({
          status: 'accepted',
          respondedRound: currentRound,
          offerAmount: evaluationAmount,
          offeredWage: evaluationWage,
        })
        .where(eq(transferOffers.id, offer.id));

      await completeTransfer(db, d1, saveId, offer.id);
      aiAutoCompletedTransfers++;
      aiOfferResponses++;
      continue;
    }

    if (sellDecision.action === 'counter') {
      await db
        .update(transferOffers)
        .set({
          status: 'counter',
          counterAmount: sellDecision.amount,
          counterWage: sellDecision.wage,
          respondedRound: currentRound,
        })
        .where(eq(transferOffers.id, offer.id));
      aiCounterOffers++;
      aiOfferResponses++;
      continue;
    }

    await db
      .update(transferOffers)
      .set({
        status: 'rejected',
        respondedRound: currentRound,
      })
      .where(eq(transferOffers.id, offer.id));
    aiRejectedOffers++;
    aiOfferResponses++;
  }

  return {
    aiOfferResponses,
    aiAutoCompletedTransfers,
    aiRejectedOffers,
    aiCounterOffers,
  };
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

  const teamStats = new Map<
    string,
    { positionCounts: Record<Position, number>; avgOverall: number }
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
          .set({
            teamId: team.id,
            wage: decision.offeredWage,
            contractEndSeason: newContractEnd,
            morale: 70,
          })
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

export async function processAIReleases(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  playerTeamId: string,
  currentSeason: number,
  currentRound: number,
): Promise<number> {
  const aiTeams = await db
    .select({
      id: teams.id,
      budget: teams.budget,
    })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), ne(teams.id, playerTeamId)));

  if (aiTeams.length === 0) return 0;

  const aiTeamIds = aiTeams.map((t) => t.id);
  const allAiPlayers = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      age: players.age,
      position: players.position,
      attributes: players.attributes,
      wage: players.wage,
      marketValue: players.marketValue,
      contractEndSeason: players.contractEndSeason,
      status: players.status,
      seasonMinutes: players.seasonMinutes,
    })
    .from(players)
    .where(and(eq(players.saveId, saveId), inArray(players.teamId, aiTeamIds)));

  if (allAiPlayers.length === 0) return 0;

  const existingListings = await db
    .select({ playerId: transferListings.playerId })
    .from(transferListings)
    .where(eq(transferListings.saveId, saveId));
  const listedIds = new Set(existingListings.map((l) => l.playerId));

  const expectedStarterMinutes = Math.max(1, (Math.max(1, currentRound) / 38) * 2700);
  let released = 0;

  for (const team of aiTeams) {
    const squad = allAiPlayers.filter(
      (p) => p.teamId === team.id && (p.status ?? 'active') === 'active',
    );
    if (squad.length <= 20) continue;

    const positionCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    let overallTotal = 0;

    for (const p of squad) {
      const pos = p.position as Position;
      positionCounts[pos]++;
      overallTotal += calculateOverall(
        createPlayerForCalc({
          attributes: p.attributes as Record<string, number>,
          position: p.position,
        }),
      );
    }
    const teamOverallAvg = overallTotal / Math.max(1, squad.length);

    const candidates = squad
      .filter((p) => !listedIds.has(p.id))
      .map((p) => {
        const overall = calculateOverall(
          createPlayerForCalc({
            attributes: p.attributes as Record<string, number>,
            position: p.position,
          }),
        );
        const utilization = (p.seasonMinutes ?? 0) / expectedStarterMinutes;
        const lowUse = utilization < 0.22;
        const oldAndDeclining = p.age >= 34 && overall <= 69;
        const fringeQuality = overall <= teamOverallAvg - 8;
        const quote = calculateReleaseCompensation({
          player: {
            age: p.age,
            wage: p.wage,
            marketValue: p.marketValue,
            contractEndSeason: p.contractEndSeason,
            attributes: p.attributes as unknown as PlayerAttributes,
            position: p.position as Position,
            form: {
              form: 70,
              lastFiveRatings: [],
              seasonGoals: 0,
              seasonAssists: 0,
              seasonMinutes: p.seasonMinutes ?? 0,
              seasonAvgRating: 0,
            },
          },
          currentSeason,
          currentRound,
        });

        return {
          ...p,
          overall,
          lowUse,
          oldAndDeclining,
          fringeQuality,
          quote,
        };
      })
      .filter(
        (p) =>
          p.contractEndSeason > currentSeason &&
          (p.oldAndDeclining || (p.lowUse && p.fringeQuality)),
      )
      .sort((a, b) => {
        const aScore = a.wage + (a.lowUse ? 20000 : 0) - a.overall * 200;
        const bScore = b.wage + (b.lowUse ? 20000 : 0) - b.overall * 200;
        return bScore - aScore;
      });

    for (const candidate of candidates) {
      const pos = candidate.position as Position;
      if (positionCounts[pos] <= 2) continue;

      const annualWage = candidate.wage * 52;
      const maxFee = Math.max(annualWage * 0.9, team.budget * 0.08);
      if (candidate.quote.fee > maxFee) continue;
      if (candidate.quote.fee > annualWage * 1.2) continue;

      await releasePlayerToFreeAgency(db, saveId, candidate.id, team.id);
      positionCounts[pos]--;
      released++;
      break; // max 1 per team per round
    }
  }

  return released;
}

export async function processAITransfers(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  playerTeamId: string,
  currentSeason: string,
  currentRound: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): Promise<{
  aiOfferResponses: number;
  aiAutoCompletedTransfers: number;
  aiRejectedOffers: number;
  aiCounterOffers: number;
  expiredOffers: number;
  newListings: number;
  newOffers: number;
  freeAgentSignings: number;
  releasedPlayers: number;
}> {
  const currentSeasonNum = parseInt(currentSeason, 10);

  const offerResponses = await processAIOfferResponses(
    db,
    d1,
    saveId,
    playerTeamId,
    currentRound,
    currentSeasonNum,
    config,
  );
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
    currentRound,
    config,
  );
  const freeAgentSignings = await processAIFreeAgentSignings(
    db,
    saveId,
    playerTeamId,
    currentSeasonNum,
  );
  const releasedPlayers = await processAIReleases(
    db,
    saveId,
    playerTeamId,
    currentSeasonNum,
    currentRound,
  );

  const summary = {
    aiOfferResponses: offerResponses.aiOfferResponses,
    aiAutoCompletedTransfers: offerResponses.aiAutoCompletedTransfers,
    aiRejectedOffers: offerResponses.aiRejectedOffers,
    aiCounterOffers: offerResponses.aiCounterOffers,
    expiredOffers,
    newListings,
    newOffers,
    freeAgentSignings,
    releasedPlayers,
  };

  console.info(
    '[ai-transfer] round-summary',
    JSON.stringify({
      saveId,
      currentRound,
      ...summary,
    }),
  );

  return summary;
}

async function maintainAIListings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  aiTeamIds: string[],
  playersByTeam: Map<string, AIPlayerRow[]>,
  currentSeason: number,
  currentRound: number,
): Promise<AIListingMaintenanceResult> {
  if (aiTeamIds.length === 0) {
    return { delistedCount: 0, relistedCount: 0 };
  }

  const aiListings = await db
    .select({
      id: transferListings.id,
      playerId: transferListings.playerId,
      teamId: transferListings.teamId,
      listedRound: transferListings.listedRound,
    })
    .from(transferListings)
    .where(
      and(eq(transferListings.saveId, saveId), inArray(transferListings.teamId, aiTeamIds)),
    );

  if (aiListings.length === 0) {
    return { delistedCount: 0, relistedCount: 0 };
  }

  const listingPlayerIds = aiListings.map((listing) => listing.playerId);
  const offersForListedPlayers = await db
    .select({
      playerId: transferOffers.playerId,
      createdRound: transferOffers.createdRound,
    })
    .from(transferOffers)
    .where(
      and(
        eq(transferOffers.saveId, saveId),
        inArray(transferOffers.playerId, listingPlayerIds),
      ),
    );

  const offersByPlayerId = new Map<string, number[]>();
  for (const offer of offersForListedPlayers) {
    const rounds = offersByPlayerId.get(offer.playerId);
    if (rounds) {
      rounds.push(offer.createdRound);
    } else {
      offersByPlayerId.set(offer.playerId, [offer.createdRound]);
    }
  }

  const formattedPlayerById = new Map<
    string,
    ReturnType<typeof createPlayerForCalc>
  >();
  const selectedForListingByTeam = new Map<string, Set<string>>();

  for (const [teamId, teamPlayers] of playersByTeam) {
    const formattedPlayers = teamPlayers.map((player) => {
      const formatted = createPlayerForCalc({
        age: player.age,
        position: player.position,
        attributes: player.attributes as Record<string, number>,
        potential: player.potential,
        wage: player.wage,
        marketValue: player.marketValue,
        contractEndSeason: player.contractEndSeason,
      });
      formattedPlayerById.set(player.id, formatted);
      return { ...formatted, id: player.id };
    });

    const selected = aiSelectPlayersToList(formattedPlayers, currentSeason);
    selectedForListingByTeam.set(teamId, new Set(selected.map((player) => player.id)));
  }

  const toDelist = aiListings.filter((listing) => {
    const listingAge = currentRound - listing.listedRound;
    if (listingAge < LISTING_CHURN_ROUNDS) {
      return false;
    }
    const offerRounds = offersByPlayerId.get(listing.playerId) || [];
    const hasOffersSinceListing = offerRounds.some(
      (round) => round >= listing.listedRound,
    );
    return !hasOffersSinceListing;
  });

  if (toDelist.length === 0) {
    return { delistedCount: 0, relistedCount: 0 };
  }

  await db
    .delete(transferListings)
    .where(
      and(
        eq(transferListings.saveId, saveId),
        inArray(
          transferListings.playerId,
          toDelist.map((listing) => listing.playerId),
        ),
      ),
    );

  const relistEntries: Array<{
    id: string;
    saveId: string;
    playerId: string;
    teamId: string;
    askingPrice: number;
    status: string;
    listedRound: number;
  }> = [];

  for (const listing of toDelist) {
    if (!listing.teamId) {
      continue;
    }
    const selectedForTeam = selectedForListingByTeam.get(listing.teamId);
    if (!selectedForTeam || !selectedForTeam.has(listing.playerId)) {
      continue;
    }

    const formattedPlayer = formattedPlayerById.get(listing.playerId);
    if (!formattedPlayer) {
      continue;
    }

    const listingAge = Math.max(0, currentRound - listing.listedRound);
    const markdownSteps = Math.floor(listingAge / LISTING_MARKDOWN_INTERVAL);
    const markdownFactor = Math.max(
      LISTING_PRICE_FLOOR_RATIO,
      1 - markdownSteps * LISTING_MARKDOWN_STEP,
    );

    const baseAskingPrice = calculateAskingPrice(formattedPlayer, currentSeason);
    const adjustedAsking = Math.max(
      Math.round(baseAskingPrice * LISTING_PRICE_FLOOR_RATIO),
      Math.round(baseAskingPrice * markdownFactor),
    );

    relistEntries.push({
      id: generateListingId(saveId),
      saveId,
      playerId: listing.playerId,
      teamId: listing.teamId,
      askingPrice: adjustedAsking,
      status:
        formattedPlayer.contractEndSeason - currentSeason <= 1
          ? 'contract_expiring'
          : 'available',
      listedRound: currentRound,
    });
  }

  if (relistEntries.length > 0) {
    await batchInsertChunked(db, transferListings, relistEntries);
  }

  return {
    delistedCount: toDelist.length,
    relistedCount: relistEntries.length,
  };
}
