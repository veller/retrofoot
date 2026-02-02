// ============================================================================
// RETROFOOT - Finance Service
// ============================================================================
// D1-specific financial operations with batch support

import type { D1Database } from '@cloudflare/workers-types';

// Constants
const DEFAULT_LEAGUE_POSITION = 10;
const DEFAULT_MOMENTUM = 50;
const DEFAULT_REPUTATION = 50;
const TRANSACTIONS_COLUMNS = 10; // Number of columns in transactions table
import type { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import {
  teams,
  players,
  standings,
  fixtures,
  transactions,
} from '@retrofoot/db/schema';
import {
  calculateAttendance,
  calculateMatchDayIncome,
  calculateRoundSponsorship,
  calculateRoundTVRights,
  calculateRoundWages,
  calculateStadiumMaintenance,
  calculateOperatingCosts,
  generateTransactionId,
} from '@retrofoot/core';
import type {
  MatchResultInput,
  TeamFinanceUpdate,
  TransactionRecord,
} from '../types/match.types';
import { batchInsertChunked } from '../lib/db/batch';

/**
 * Process round finances for all teams
 * Calculates income (match day, sponsorship, TV rights) and expenses (wages, stadium, operations)
 */
export async function processRoundFinances(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  season: string,
  currentRound: number,
  matchResults: MatchResultInput[],
): Promise<void> {
  // Get all teams with their financial data and players
  const allTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      reputation: teams.reputation,
      capacity: teams.capacity,
      momentum: teams.momentum,
      balance: teams.balance,
      seasonRevenue: teams.seasonRevenue,
      seasonExpenses: teams.seasonExpenses,
    })
    .from(teams)
    .where(eq(teams.saveId, saveId));

  // Get all players to calculate wages per team
  const allPlayers = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      wage: players.wage,
    })
    .from(players)
    .where(eq(players.saveId, saveId));

  // Group players by team
  const playersByTeam = new Map<string, { wage: number }[]>();
  for (const player of allPlayers) {
    if (!player.teamId) continue;
    const teamPlayers = playersByTeam.get(player.teamId);
    if (teamPlayers) {
      teamPlayers.push({ wage: player.wage });
    } else {
      playersByTeam.set(player.teamId, [{ wage: player.wage }]);
    }
  }

  // Get standings for league positions
  const standingsResult = await db
    .select({
      teamId: standings.teamId,
      position: standings.position,
    })
    .from(standings)
    .where(and(eq(standings.saveId, saveId), eq(standings.season, season)));

  const positionByTeam = new Map<string, number>();
  for (const s of standingsResult) {
    positionByTeam.set(s.teamId, s.position);
  }

  // Get fixtures to determine home/away for this round
  const roundFixtures = await db
    .select({
      id: fixtures.id,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
    })
    .from(fixtures)
    .where(and(eq(fixtures.saveId, saveId), eq(fixtures.round, currentRound)));

  // Build map of home teams and their opponents
  const homeTeamOpponents = new Map<string, string>();
  for (const fixture of roundFixtures) {
    homeTeamOpponents.set(fixture.homeTeamId, fixture.awayTeamId);
  }

  // Build team reputation map for attendance calculation
  const teamReputation = new Map<string, number>();
  for (const team of allTeams) {
    teamReputation.set(team.id, team.reputation);
  }

  // Pre-compute lookup maps for O(1) access
  const fixtureByIdMap = new Map(roundFixtures.map((f) => [f.id, f]));
  const matchResultByHomeTeam = new Map<string, MatchResultInput>();
  for (const r of matchResults) {
    const fixture = fixtureByIdMap.get(r.fixtureId);
    if (fixture) {
      matchResultByHomeTeam.set(fixture.homeTeamId, r);
    }
  }

  // Collect all transactions and team updates for batch operations
  const allTransactions: TransactionRecord[] = [];
  const teamFinanceUpdates: TeamFinanceUpdate[] = [];

  // Process finances for each team
  for (const team of allTeams) {
    const teamPlayers = playersByTeam.get(team.id) ?? [];
    const leaguePosition = positionByTeam.get(team.id) ?? DEFAULT_LEAGUE_POSITION;
    const isHomeGame = homeTeamOpponents.has(team.id);

    // Calculate income
    const sponsorship = calculateRoundSponsorship(team.reputation);
    const tvRights = calculateRoundTVRights(leaguePosition, allTeams.length);

    let matchDayIncome = 0;
    let attendance = 0;

    if (isHomeGame) {
      const awayTeamId = homeTeamOpponents.get(team.id);
      if (!awayTeamId) continue; // Safety check - should not happen if isHomeGame is true
      const awayRep = teamReputation.get(awayTeamId) ?? DEFAULT_REPUTATION;

      // Calculate attendance
      attendance = calculateAttendance(
        { reputation: team.reputation, momentum: team.momentum ?? DEFAULT_MOMENTUM },
        { reputation: awayRep },
        team.capacity,
      );

      // Use actual attendance from match result if available
      const matchResult = matchResultByHomeTeam.get(team.id);
      if (matchResult) {
        attendance = matchResult.attendance;
      }

      matchDayIncome = calculateMatchDayIncome(attendance);
    }

    const totalIncome = sponsorship + tvRights + matchDayIncome;

    // Calculate expenses
    const wages = calculateRoundWages(teamPlayers);
    const stadiumMaintenance = calculateStadiumMaintenance(team.capacity);
    const operatingCosts = calculateOperatingCosts(team.reputation);
    const totalExpenses = wages + stadiumMaintenance + operatingCosts;

    // Calculate new balance
    const currentBalance = team.balance ?? 0;
    const newBalance = currentBalance + totalIncome - totalExpenses;

    // Update season totals
    const newSeasonRevenue = (team.seasonRevenue ?? 0) + totalIncome;
    const newSeasonExpenses = (team.seasonExpenses ?? 0) + totalExpenses;

    // Collect team financial update
    teamFinanceUpdates.push({
      teamId: team.id,
      balance: newBalance,
      roundWages: wages,
      seasonRevenue: newSeasonRevenue,
      seasonExpenses: newSeasonExpenses,
    });

    // Collect transactions
    if (matchDayIncome > 0) {
      allTransactions.push({
        id: generateTransactionId(),
        saveId,
        teamId: team.id,
        type: 'income',
        category: 'match_day',
        amount: matchDayIncome,
        description: `Match day revenue (${attendance.toLocaleString()} fans)`,
        round: currentRound,
        createdAt: new Date(),
      });
    }

    allTransactions.push({
      id: generateTransactionId(),
      saveId,
      teamId: team.id,
      type: 'income',
      category: 'sponsorship',
      amount: sponsorship,
      description: 'Sponsorship payment',
      round: currentRound,
      createdAt: new Date(),
    });

    allTransactions.push({
      id: generateTransactionId(),
      saveId,
      teamId: team.id,
      type: 'income',
      category: 'tv_rights',
      amount: tvRights,
      description: `TV rights (Position ${leaguePosition})`,
      round: currentRound,
      createdAt: new Date(),
    });

    allTransactions.push({
      id: generateTransactionId(),
      saveId,
      teamId: team.id,
      type: 'expense',
      category: 'wages',
      amount: wages,
      description: `Player wages (${teamPlayers.length} players)`,
      round: currentRound,
      createdAt: new Date(),
    });

    allTransactions.push({
      id: generateTransactionId(),
      saveId,
      teamId: team.id,
      type: 'expense',
      category: 'stadium',
      amount: stadiumMaintenance,
      description: 'Stadium maintenance',
      round: currentRound,
      createdAt: new Date(),
    });

    allTransactions.push({
      id: generateTransactionId(),
      saveId,
      teamId: team.id,
      type: 'expense',
      category: 'operations',
      amount: operatingCosts,
      description: 'Operating costs',
      round: currentRound,
      createdAt: new Date(),
    });
  }

  // Batch update all team financial data using D1 batch API
  const teamStatements = teamFinanceUpdates.map((update) =>
    d1
      .prepare(
        'UPDATE teams SET balance = ?, round_wages = ?, season_revenue = ?, season_expenses = ? WHERE id = ?',
      )
      .bind(
        update.balance,
        update.roundWages,
        update.seasonRevenue,
        update.seasonExpenses,
        update.teamId,
      ),
  );

  if (teamStatements.length > 0) {
    await d1.batch(teamStatements);
  }

  // Batch insert all transactions (chunked to avoid D1 variable limit)
  await batchInsertChunked(db, transactions, allTransactions, TRANSACTIONS_COLUMNS);
}
