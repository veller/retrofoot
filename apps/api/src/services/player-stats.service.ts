// ============================================================================
// RETROFOOT - Player Stats Service
// ============================================================================
// D1-specific player stats operations with batch support

import type { D1Database } from '@cloudflare/workers-types';

// Constants
const MATCH_DURATION = 90;
const EXTRA_TIME_MAX = 120;
const FORM_HISTORY_LENGTH = 5;
const AVG_MINUTES_PER_APPEARANCE = 60; // Accounting for substitutions
import type { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import { players, fixtures, tactics } from '@retrofoot/db/schema';
import {
  calculateMatchRating,
  applyMatchGrowth,
  calculateEnergyDrain,
  type Player,
  type PlayerAttributes,
} from '@retrofoot/core';
import type {
  MatchResultInput,
  PlayerStatsUpdate,
  PlayerStatsContext,
} from '../types/match.types';

function getMatchResult(
  teamScore: number,
  opponentScore: number,
): 'win' | 'draw' | 'loss' {
  if (teamScore > opponentScore) return 'win';
  if (teamScore < opponentScore) return 'loss';
  return 'draw';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getBaseRecoveryByMinutes(minutesPlayed: number): number {
  if (minutesPlayed === 0) return 19;
  if (minutesPlayed <= 44) return 6;
  if (minutesPlayed <= 74) return 4;
  return 2.5;
}

function getDnpAgeBaseRecovery(age: number): number {
  if (age <= 30) return 19;
  if (age <= 33) return 16;
  if (age <= 36) return 13;
  return 10;
}

function getPlayedAgeRecoveryAdjustment(age: number): number {
  if (age <= 23) return 1;
  if (age <= 30) return 0.5;
  if (age <= 33) return -0.5;
  if (age <= 36) return -1.5;
  return -2.5;
}

export function calculateRoundEnergyRecovery(options: {
  minutesPlayed: number;
  age: number;
  stamina: number;
  currentEnergy?: number;
}): number {
  const { minutesPlayed, age, stamina, currentEnergy = 100 } = options;
  const missingEnergy = clamp(100 - currentEnergy, 0, 100);
  if (missingEnergy <= 0) return 0;

  if (minutesPlayed === 0) {
    // Young-to-prime players fully recharge when they rest for the whole match.
    if (age <= 30) {
      return missingEnergy;
    }

    const dnpBase = getDnpAgeBaseRecovery(age);
    const staminaRecoveryAdj = clamp((stamina - 55) * 0.14, -3, 4);
    const dnpRecovery = dnpBase + staminaRecoveryAdj;
    return clamp(dnpRecovery, 1, missingEnergy);
  }

  const baseRecovery = getBaseRecoveryByMinutes(minutesPlayed);
  const ageRecoveryAdj = getPlayedAgeRecoveryAdjustment(age);
  const staminaRecoveryAdj = clamp((stamina - 55) * 0.09, -2, 3);
  const olderHeavyLoadPenalty =
    minutesPlayed >= 75 && age >= 34 ? 1 : minutesPlayed >= 75 && age >= 31 ? 0.5 : 0;
  return clamp(
    baseRecovery + ageRecoveryAdj + staminaRecoveryAdj - olderHeavyLoadPenalty,
    0.5,
    12,
  );
}

/**
 * Process player stats, form updates, and growth after matches
 */
export async function processPlayerStatsAndGrowth(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  playerTeamId: string,
  matchResults: MatchResultInput[],
  context?: PlayerStatsContext,
): Promise<void> {
  // Get all players for the player's team (or use context)
  const teamPlayers = context
    ? context.teamPlayers
    : await db
        .select({
          id: players.id,
          name: players.name,
          nickname: players.nickname,
          age: players.age,
          nationality: players.nationality,
          position: players.position,
          preferredFoot: players.preferredFoot,
          attributes: players.attributes,
          potential: players.potential,
          morale: players.morale,
          fitness: players.fitness,
          energy: players.energy,
          injured: players.injured,
          injuryWeeks: players.injuryWeeks,
          contractEndSeason: players.contractEndSeason,
          wage: players.wage,
          marketValue: players.marketValue,
          status: players.status,
          form: players.form,
          lastFiveRatings: players.lastFiveRatings,
          seasonGoals: players.seasonGoals,
          seasonAssists: players.seasonAssists,
          seasonMinutes: players.seasonMinutes,
          seasonAvgRating: players.seasonAvgRating,
        })
        .from(players)
        .where(
          and(eq(players.saveId, saveId), eq(players.teamId, playerTeamId)),
        );

  // Resolve fixture data: from context fixtureMap + matchResults for scores, or fetch
  type FixtureRow = {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
  };
  let playerFixtures: FixtureRow[];
  if (context?.fixtureMap) {
    playerFixtures = matchResults
      .map((r): FixtureRow | null => {
        const f = context.fixtureMap.get(r.fixtureId);
        return f
          ? {
              id: r.fixtureId,
              homeTeamId: f.homeTeamId,
              awayTeamId: f.awayTeamId,
              homeScore: r.homeScore,
              awayScore: r.awayScore,
            }
          : null;
      })
      .filter((x): x is FixtureRow => x !== null);
  } else {
    const fixtureIds = matchResults.map((r) => r.fixtureId);
    playerFixtures = await db
      .select({
        id: fixtures.id,
        homeTeamId: fixtures.homeTeamId,
        awayTeamId: fixtures.awayTeamId,
        homeScore: fixtures.homeScore,
        awayScore: fixtures.awayScore,
      })
      .from(fixtures)
      .where(
        and(eq(fixtures.saveId, saveId), inArray(fixtures.id, fixtureIds)),
      );
  }

  // Find the match result for player's team
  const playerMatch = matchResults.find((result) => {
    const fixture = playerFixtures.find((f) => f.id === result.fixtureId);
    return (
      fixture &&
      (fixture.homeTeamId === playerTeamId ||
        fixture.awayTeamId === playerTeamId)
    );
  });

  if (!playerMatch) return;

  const fixture = playerFixtures.find((f) => f.id === playerMatch.fixtureId);
  if (!fixture) return;
  const teamSide: 'home' | 'away' =
    fixture.homeTeamId === playerTeamId ? 'home' : 'away';

  // Get tactical posture for energy drain (saved tactics for this team)
  let posture: 'defensive' | 'balanced' | 'attacking' = 'balanced';
  if (context?.tactics?.posture) {
    const p = context.tactics.posture as string;
    if (p === 'defensive' || p === 'attacking') posture = p;
  } else {
    const tacticsRows = await db
      .select({ posture: tactics.posture })
      .from(tactics)
      .where(and(eq(tactics.saveId, saveId), eq(tactics.teamId, playerTeamId)))
      .limit(1);
    if (tacticsRows.length > 0 && tacticsRows[0].posture) {
      const p = tacticsRows[0].posture as string;
      if (p === 'defensive' || p === 'attacking') posture = p;
    }
  }

  const isHome = fixture.homeTeamId === playerTeamId;
  const teamScore = isHome ? playerMatch.homeScore : playerMatch.awayScore;
  const opponentScore = isHome ? playerMatch.awayScore : playerMatch.homeScore;
  const isCleanSheet = opponentScore === 0;
  const teamResult = getMatchResult(teamScore, opponentScore);

  // Count goals and assists per player
  const playerGoals = new Map<string, number>();
  const playerAssists = new Map<string, number>();

  for (const event of playerMatch.events) {
    if (event.type === 'goal' && event.playerId) {
      playerGoals.set(
        event.playerId,
        (playerGoals.get(event.playerId) || 0) + 1,
      );
      if (event.assistPlayerId) {
        playerAssists.set(
          event.assistPlayerId,
          (playerAssists.get(event.assistPlayerId) || 0) + 1,
        );
      }
    }
  }

  // Resolve lineup/minutes for this team with compatibility fallback
  const lineupIds = new Set(
    playerMatch.lineupByTeam?.[teamSide] ?? playerMatch.lineupPlayerIds ?? [],
  );
  const subMinutes =
    playerMatch.substitutionMinutesByTeam?.[teamSide] ??
    playerMatch.substitutionMinutes ??
    {};

  // Collect all player updates for batch operation
  const playerUpdates: PlayerStatsUpdate[] = [];
  const energyOnlyUpdates: Array<{ playerId: string; energy: number }> = [];

  // Process each player
  for (const dbPlayer of teamPlayers) {
    // Determine minutes played
    let minutesPlayed = 0;
    if (lineupIds.size > 0) {
      if (lineupIds.has(dbPlayer.id)) {
        // Starter - check if subbed off (clamp to valid range for extra time)
        minutesPlayed = Math.min(
          EXTRA_TIME_MAX,
          Math.max(0, subMinutes[dbPlayer.id] ?? MATCH_DURATION),
        );
      } else if (subMinutes[dbPlayer.id] !== undefined) {
        // Sub who came on (clamp to prevent negative from extra time scenarios)
        minutesPlayed = Math.max(
          0,
          Math.min(MATCH_DURATION, MATCH_DURATION - subMinutes[dbPlayer.id]),
        );
      }
    } else {
      // Fallback: assume first 11 players by ID in events played full match
      // For simplicity, give all players in goal events full match minutes
      const wasInvolved =
        playerGoals.has(dbPlayer.id) || playerAssists.has(dbPlayer.id);
      minutesPlayed = wasInvolved ? MATCH_DURATION : 0;
    }

    const attributes = dbPlayer.attributes as PlayerAttributes;
    const stamina = Number.isFinite(attributes.stamina)
      ? attributes.stamina
      : 60;
    const currentEnergy = dbPlayer.energy ?? 100;
    if (minutesPlayed === 0) {
      const recovery = calculateRoundEnergyRecovery({
        minutesPlayed,
        age: dbPlayer.age,
        stamina,
        currentEnergy,
      });
      const restedEnergy = clamp(round1(currentEnergy + recovery), 0, 100);
      energyOnlyUpdates.push({
        playerId: dbPlayer.id,
        energy: restedEnergy,
      });
      continue;
    }

    const goals = playerGoals.get(dbPlayer.id) || 0;
    const assists = playerAssists.get(dbPlayer.id) || 0;

    // Build a Player object for the core functions
    const player: Player = {
      id: dbPlayer.id,
      name: dbPlayer.name,
      nickname: dbPlayer.nickname ?? undefined,
      age: dbPlayer.age,
      nationality: dbPlayer.nationality,
      position: dbPlayer.position as 'GK' | 'DEF' | 'MID' | 'ATT',
      preferredFoot: dbPlayer.preferredFoot as 'left' | 'right' | 'both',
      attributes,
      potential: dbPlayer.potential,
      morale: dbPlayer.morale ?? 70,
      fitness: dbPlayer.fitness ?? 100,
      energy: dbPlayer.energy ?? 100,
      injured: Boolean(dbPlayer.injured ?? false),
      injuryWeeks: dbPlayer.injuryWeeks ?? 0,
      contractEndSeason: dbPlayer.contractEndSeason ?? 0,
      wage: dbPlayer.wage,
      marketValue: dbPlayer.marketValue,
      status: (dbPlayer.status ?? 'active') as
        | 'active'
        | 'retiring'
        | 'retired'
        | 'deceased'
        | 'suspended',
      form: {
        form: dbPlayer.form ?? 70,
        lastFiveRatings: (dbPlayer.lastFiveRatings as number[]) ?? [],
        seasonGoals: dbPlayer.seasonGoals ?? 0,
        seasonAssists: dbPlayer.seasonAssists ?? 0,
        seasonMinutes: dbPlayer.seasonMinutes ?? 0,
        seasonAvgRating: dbPlayer.seasonAvgRating ?? 0,
      },
    };

    // Calculate match rating
    const matchRating = calculateMatchRating(
      player,
      minutesPlayed,
      goals,
      assists,
      isCleanSheet,
    );

    // Apply in-season growth
    const grownPlayer = applyMatchGrowth(player, minutesPlayed, matchRating, {
      teamResult,
      goals,
      assists,
      goalsConceded: opponentScore,
      cleanSheet: isCleanSheet,
    });

    // Update form ratings
    const newLastFiveRatings = [
      ...player.form.lastFiveRatings,
      matchRating,
    ].slice(-FORM_HISTORY_LENGTH);
    const avgRecent =
      newLastFiveRatings.reduce((a, b) => a + b, 0) / newLastFiveRatings.length;
    const newForm = Math.max(
      1,
      Math.min(100, Math.round(player.form.form * 0.7 + avgRecent * 10 * 0.3)),
    );

    // Calculate new season average rating
    // Estimate total matches played using season minutes
    const newSeasonMinutes = player.form.seasonMinutes + minutesPlayed;
    const previousMatches =
      player.form.seasonMinutes > 0
        ? Math.max(
            1,
            Math.round(player.form.seasonMinutes / AVG_MINUTES_PER_APPEARANCE),
          )
        : 0;
    const totalMatches = previousMatches + 1;
    const prevTotal = player.form.seasonAvgRating * previousMatches;
    const newAvg = (prevTotal + matchRating) / totalMatches;

    // Energy drain from this match
    const drain = calculateEnergyDrain({
      minutesPlayed,
      posture,
      age: dbPlayer.age,
      stamina,
      position: dbPlayer.position as 'GK' | 'DEF' | 'MID' | 'ATT',
    });
    const recovery = calculateRoundEnergyRecovery({
      minutesPlayed,
      age: dbPlayer.age,
      stamina,
      currentEnergy,
    });
    const newEnergy = clamp(round1(currentEnergy - drain + recovery), 0, 100);

    // Collect update for batch operation
    playerUpdates.push({
      playerId: dbPlayer.id,
      attributes: JSON.stringify(grownPlayer.attributes),
      form: newForm,
      lastFiveRatings: JSON.stringify(newLastFiveRatings),
      seasonMinutes: newSeasonMinutes,
      seasonAvgRating: Math.round(newAvg * 10) / 10,
      energy: newEnergy,
    });
  }

  // Batch update all players using D1 batch API
  if (playerUpdates.length > 0 || energyOnlyUpdates.length > 0) {
    const playerStatements = playerUpdates.map((update) =>
      d1
        .prepare(
          'UPDATE players SET attributes = ?, form = ?, last_five_ratings = ?, season_minutes = ?, season_avg_rating = ?, energy = ? WHERE id = ?',
        )
        .bind(
          update.attributes,
          update.form,
          update.lastFiveRatings,
          update.seasonMinutes,
          update.seasonAvgRating,
          update.energy,
          update.playerId,
        ),
    );
    const energyStatements = energyOnlyUpdates.map((update) =>
      d1
        .prepare('UPDATE players SET energy = ? WHERE id = ?')
        .bind(update.energy, update.playerId),
    );
    await d1.batch([...playerStatements, ...energyStatements]);
  }
}
