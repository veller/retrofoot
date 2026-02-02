import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import {
  saves,
  fixtures,
  matchEvents,
  standings,
  teams,
  players,
  transactions,
} from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';
import {
  calculateAttendance,
  calculateMatchDayIncome,
  calculateRoundSponsorship,
  calculateRoundTVRights,
  calculateRoundWages,
  calculateStadiumMaintenance,
  calculateOperatingCosts,
  generateTransactionId,
  calculateMatchRating,
  applyMatchGrowth,
  type Player,
  type PlayerAttributes,
} from '@retrofoot/core';

// Match management routes
export const matchRoutes = new Hono<{ Bindings: Env }>();

/**
 * Get current round fixtures for a save with full team and player data
 */
matchRoutes.get('/:saveId/fixtures', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const saveId = c.req.param('saveId');
  const db = drizzle(c.env.DB);

  // Verify ownership and get save details
  const saveResult = await db
    .select({
      userId: saves.userId,
      currentRound: saves.currentRound,
      currentSeason: saves.currentSeason,
      playerTeamId: saves.playerTeamId,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const save = saveResult[0];

  // Fetch fixtures, teams, and players in parallel (Phase 8)
  const [fixturesResult, teamsResult, playersResult] = await Promise.all([
    // Get fixtures for current round
    db
      .select({
        id: fixtures.id,
        round: fixtures.round,
        homeTeamId: fixtures.homeTeamId,
        awayTeamId: fixtures.awayTeamId,
        date: fixtures.date,
        played: fixtures.played,
        homeScore: fixtures.homeScore,
        awayScore: fixtures.awayScore,
      })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.saveId, saveId),
          eq(fixtures.round, save.currentRound ?? 1),
        ),
      ),
    // Get all teams with full info
    db
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.shortName,
        badgeUrl: teams.badgeUrl,
        primaryColor: teams.primaryColor,
        secondaryColor: teams.secondaryColor,
        stadium: teams.stadium,
        capacity: teams.capacity,
        reputation: teams.reputation,
        budget: teams.budget,
        wageBudget: teams.wageBudget,
        momentum: teams.momentum,
        lastFiveResults: teams.lastFiveResults,
      })
      .from(teams)
      .where(eq(teams.saveId, saveId)),
    // Get all players for all teams
    db
      .select({
        id: players.id,
        teamId: players.teamId,
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
      .where(eq(players.saveId, saveId)),
  ]);

  // Group players by team
  const playersByTeam = new Map<string, typeof playersResult>();
  for (const player of playersResult) {
    if (!player.teamId) continue;
    if (!playersByTeam.has(player.teamId)) {
      playersByTeam.set(player.teamId, []);
    }
    playersByTeam.get(player.teamId)!.push(player);
  }

  // Build teams with players
  const teamsWithPlayers = teamsResult.map((t) => ({
    ...t,
    lastFiveResults: (t.lastFiveResults as ('W' | 'D' | 'L')[]) ?? [],
    players: (playersByTeam.get(t.id) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      nickname: p.nickname,
      age: p.age,
      nationality: p.nationality,
      position: p.position,
      preferredFoot: p.preferredFoot,
      attributes: p.attributes,
      potential: p.potential,
      morale: p.morale ?? 70,
      fitness: p.fitness ?? 100,
      injured: p.injured ?? false,
      injuryWeeks: p.injuryWeeks ?? 0,
      contractEndSeason: p.contractEndSeason,
      wage: p.wage,
      marketValue: p.marketValue,
      status: p.status ?? 'active',
      form: {
        form: p.form ?? 70,
        lastFiveRatings: (p.lastFiveRatings as number[]) ?? [],
        seasonGoals: p.seasonGoals ?? 0,
        seasonAssists: p.seasonAssists ?? 0,
        seasonMinutes: p.seasonMinutes ?? 0,
        seasonAvgRating: p.seasonAvgRating ?? 0,
      },
    })),
  }));

  const teamsMap = new Map(teamsWithPlayers.map((t) => [t.id, t]));

  const enrichedFixtures = fixturesResult.map((f) => ({
    ...f,
    homeTeam: teamsMap.get(f.homeTeamId) || null,
    awayTeam: teamsMap.get(f.awayTeamId) || null,
  }));

  return c.json({
    currentRound: save.currentRound,
    currentSeason: save.currentSeason,
    playerTeamId: save.playerTeamId,
    fixtures: enrichedFixtures,
    teams: teamsWithPlayers,
  });
});

/**
 * Complete a round of matches - save results, update standings, advance round
 */
matchRoutes.post('/:saveId/complete', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const saveId = c.req.param('saveId');
  const db = drizzle(c.env.DB);

  // Verify ownership
  const saveResult = await db
    .select({
      userId: saves.userId,
      currentRound: saves.currentRound,
      currentSeason: saves.currentSeason,
      playerTeamId: saves.playerTeamId,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const save = saveResult[0];

  // Parse request body
  interface MatchResultInput {
    fixtureId: string;
    homeScore: number;
    awayScore: number;
    attendance: number;
    events: Array<{
      minute: number;
      type: string;
      team: 'home' | 'away';
      playerId?: string;
      playerName?: string;
      description?: string;
    }>;
  }

  const body = await c.req.json<{ results: MatchResultInput[] }>();

  if (!body.results || !Array.isArray(body.results) || body.results.length === 0) {
    return c.json({ error: 'Missing or empty results array' }, 400);
  }

  try {
    // Only fetch fixtures that are in the results (not all fixtures)
    const resultFixtureIds = body.results.map((r) => r.fixtureId);
    const roundFixturesData = await db
      .select({
        id: fixtures.id,
        homeTeamId: fixtures.homeTeamId,
        awayTeamId: fixtures.awayTeamId,
      })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.saveId, saveId),
          inArray(fixtures.id, resultFixtureIds),
        ),
      );

    const fixturesMap = new Map(roundFixturesData.map((f) => [f.id, f]));

    // Get team IDs that played in this round
    const playingTeamIds = new Set<string>();
    for (const f of roundFixturesData) {
      playingTeamIds.add(f.homeTeamId);
      playingTeamIds.add(f.awayTeamId);
    }
    const teamIdArray = Array.from(playingTeamIds);

    // Pre-fetch only teams that played for form updates (Phase 6)
    const playingTeamsData = await db
      .select({
        id: teams.id,
        lastFiveResults: teams.lastFiveResults,
      })
      .from(teams)
      .where(
        and(
          eq(teams.saveId, saveId),
          inArray(teams.id, teamIdArray),
        ),
      );

    const teamsFormMap = new Map(
      playingTeamsData.map((t) => [t.id, (t.lastFiveResults as ('W' | 'D' | 'L')[]) ?? []]),
    );

    // Collect all match events for batch insert (Phase 2)
    const allMatchEvents: Array<{
      id: string;
      fixtureId: string;
      minute: number;
      type: string;
      team: string;
      playerId?: string;
      playerName?: string;
      description?: string;
    }> = [];

    // Aggregate player goals and assists for batch update (Phase 5)
    const playerGoals = new Map<string, number>();
    const playerAssists = new Map<string, number>();

    // Collect form updates (Phase 6)
    const formUpdates = new Map<string, ('W' | 'D' | 'L')[]>();

    // Process each match result - collect data for batch operations
    for (const result of body.results) {
      // Collect match events (Phase 2)
      for (const event of result.events) {
        allMatchEvents.push({
          id: `event-${result.fixtureId}-${event.minute}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fixtureId: result.fixtureId,
          minute: event.minute,
          type: event.type,
          team: event.team,
          playerId: event.playerId,
          playerName: event.playerName,
          description: event.description,
        });
      }

      const fixture = fixturesMap.get(result.fixtureId);
      if (fixture) {
        // Update standings (still individual - needed for points calculation)
        await updateTeamStandings(
          db,
          saveId,
          save.currentSeason!,
          fixture.homeTeamId,
          result.homeScore,
          result.awayScore,
        );
        await updateTeamStandings(
          db,
          saveId,
          save.currentSeason!,
          fixture.awayTeamId,
          result.awayScore,
          result.homeScore,
        );

        // Compute form updates in memory (Phase 6)
        const homeResult: 'W' | 'D' | 'L' =
          result.homeScore > result.awayScore
            ? 'W'
            : result.homeScore < result.awayScore
              ? 'L'
              : 'D';
        const awayResult: 'W' | 'D' | 'L' =
          result.awayScore > result.homeScore
            ? 'W'
            : result.awayScore < result.homeScore
              ? 'L'
              : 'D';

        const homeCurrentForm = formUpdates.get(fixture.homeTeamId) ?? teamsFormMap.get(fixture.homeTeamId) ?? [];
        const newHomeForm = [...homeCurrentForm, homeResult].slice(-5);
        formUpdates.set(fixture.homeTeamId, newHomeForm);

        const awayCurrentForm = formUpdates.get(fixture.awayTeamId) ?? teamsFormMap.get(fixture.awayTeamId) ?? [];
        const newAwayForm = [...awayCurrentForm, awayResult].slice(-5);
        formUpdates.set(fixture.awayTeamId, newAwayForm);

        // Aggregate player stats (Phase 5)
        const goalEvents = result.events.filter((e) => e.type === 'goal');
        for (const goal of goalEvents) {
          if (goal.playerId) {
            playerGoals.set(goal.playerId, (playerGoals.get(goal.playerId) || 0) + 1);
          }
          if (
            'assistPlayerId' in goal &&
            goal.assistPlayerId &&
            typeof goal.assistPlayerId === 'string'
          ) {
            playerAssists.set(
              goal.assistPlayerId,
              (playerAssists.get(goal.assistPlayerId) || 0) + 1,
            );
          }
        }
      }
    }

    // Phase 4: Batch update fixtures using D1 batch API
    const fixtureStatements = body.results.map((result) =>
      c.env.DB.prepare(
        'UPDATE fixtures SET played = 1, home_score = ?, away_score = ? WHERE id = ?',
      ).bind(result.homeScore, result.awayScore, result.fixtureId),
    );
    if (fixtureStatements.length > 0) {
      await c.env.DB.batch(fixtureStatements);
    }

    // Phase 2: Batch insert all match events
    if (allMatchEvents.length > 0) {
      await db.insert(matchEvents).values(allMatchEvents);
    }

    // Phase 5: Batch update player stats using D1 batch API
    const goalStatements = Array.from(playerGoals.entries()).map(([playerId, goals]) =>
      c.env.DB.prepare('UPDATE players SET season_goals = season_goals + ? WHERE id = ?').bind(
        goals,
        playerId,
      ),
    );
    const assistStatements = Array.from(playerAssists.entries()).map(([playerId, assists]) =>
      c.env.DB.prepare('UPDATE players SET season_assists = season_assists + ? WHERE id = ?').bind(
        assists,
        playerId,
      ),
    );
    if (goalStatements.length > 0) {
      await c.env.DB.batch(goalStatements);
    }
    if (assistStatements.length > 0) {
      await c.env.DB.batch(assistStatements);
    }

    // Phase 6: Batch update team forms using D1 batch API
    const formStatements = Array.from(formUpdates.entries()).map(([teamId, form]) =>
      c.env.DB.prepare('UPDATE teams SET last_five_results = ? WHERE id = ?').bind(
        JSON.stringify(form),
        teamId,
      ),
    );
    if (formStatements.length > 0) {
      await c.env.DB.batch(formStatements);
    }

    // Recalculate positions (Phase 7: now uses D1 batch)
    await recalculateStandingPositions(c.env.DB, saveId, save.currentSeason!);

    // Process player minutes, form, and growth for player's team
    await processPlayerStatsAndGrowth(
      db,
      c.env.DB,
      saveId,
      save.playerTeamId!,
      body.results,
    );

    // Process finances for all teams (Phase 3 & 9: batched)
    await processRoundFinances(
      db,
      c.env.DB,
      saveId,
      save.currentSeason!,
      save.currentRound ?? 1,
      body.results,
    );

    // Advance round
    await db
      .update(saves)
      .set({
        currentRound: (save.currentRound ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(saves.id, saveId));

    return c.json({
      success: true,
      newRound: (save.currentRound ?? 1) + 1,
      matchesProcessed: body.results.length,
    });
  } catch (error) {
    console.error('Failed to complete round:', error);
    return c.json({ error: 'Failed to save match results' }, 500);
  }
});

// Helper to update team standings
async function updateTeamStandings(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  season: string,
  teamId: string,
  goalsFor: number,
  goalsAgainst: number,
) {
  const isWin = goalsFor > goalsAgainst;
  const isDraw = goalsFor === goalsAgainst;
  const points = isWin ? 3 : isDraw ? 1 : 0;

  await db
    .update(standings)
    .set({
      played: sql`${standings.played} + 1`,
      won: isWin ? sql`${standings.won} + 1` : standings.won,
      drawn: isDraw ? sql`${standings.drawn} + 1` : standings.drawn,
      lost: !isWin && !isDraw ? sql`${standings.lost} + 1` : standings.lost,
      goalsFor: sql`${standings.goalsFor} + ${goalsFor}`,
      goalsAgainst: sql`${standings.goalsAgainst} + ${goalsAgainst}`,
      points: sql`${standings.points} + ${points}`,
    })
    .where(
      and(
        eq(standings.saveId, saveId),
        eq(standings.season, season),
        eq(standings.teamId, teamId),
      ),
    );
}

// Helper to recalculate standings positions (Phase 7: uses D1 batch)
async function recalculateStandingPositions(
  d1: D1Database,
  saveId: string,
  season: string,
) {
  // Get all standings sorted by points, goal difference, goals for
  const result = await d1
    .prepare('SELECT * FROM standings WHERE save_id = ? AND season = ?')
    .bind(saveId, season)
    .all();

  const allStandings = result.results as Array<{
    id: string;
    points: number | null;
    goals_for: number | null;
    goals_against: number | null;
  }>;

  // Sort by points, then goal difference, then goals for
  allStandings.sort((a, b) => {
    const pointsDiff = (b.points ?? 0) - (a.points ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    const gdA = (a.goals_for ?? 0) - (a.goals_against ?? 0);
    const gdB = (b.goals_for ?? 0) - (b.goals_against ?? 0);
    const gdDiff = gdB - gdA;
    if (gdDiff !== 0) return gdDiff;

    return (b.goals_for ?? 0) - (a.goals_for ?? 0);
  });

  // Phase 7: Batch update positions using D1 batch API
  const positionStatements = allStandings.map((standing, i) =>
    d1.prepare('UPDATE standings SET position = ? WHERE id = ?').bind(i + 1, standing.id),
  );

  if (positionStatements.length > 0) {
    await d1.batch(positionStatements);
  }
}

// Helper to process round finances for all teams (Phase 3 & 9: batched)
interface MatchResultInputFinance {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  attendance: number;
  events: Array<{
    minute: number;
    type: string;
    team: 'home' | 'away';
    playerId?: string;
    playerName?: string;
    description?: string;
  }>;
}

async function processRoundFinances(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  season: string,
  currentRound: number,
  matchResults: MatchResultInputFinance[],
) {
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
    if (!playersByTeam.has(player.teamId)) {
      playersByTeam.set(player.teamId, []);
    }
    playersByTeam.get(player.teamId)!.push({ wage: player.wage });
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

  // Collect all transactions and team updates for batch operations
  const allTransactions: Array<{
    id: string;
    saveId: string;
    teamId: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
    description: string;
    round: number;
    createdAt: Date;
  }> = [];

  const teamFinanceUpdates: Array<{
    teamId: string;
    balance: number;
    roundWages: number;
    seasonRevenue: number;
    seasonExpenses: number;
  }> = [];

  // Process finances for each team (collect data, don't write yet)
  for (const team of allTeams) {
    const teamPlayers = playersByTeam.get(team.id) ?? [];
    const leaguePosition = positionByTeam.get(team.id) ?? 10;
    const isHomeGame = homeTeamOpponents.has(team.id);

    // Calculate income
    const sponsorship = calculateRoundSponsorship(team.reputation);
    const tvRights = calculateRoundTVRights(leaguePosition, allTeams.length);

    let matchDayIncome = 0;
    let attendance = 0;

    if (isHomeGame) {
      const awayTeamId = homeTeamOpponents.get(team.id)!;
      const awayRep = teamReputation.get(awayTeamId) ?? 50;

      // Calculate attendance
      attendance = calculateAttendance(
        { reputation: team.reputation, momentum: team.momentum ?? 50 },
        { reputation: awayRep },
        team.capacity,
      );

      // Use actual attendance from match result if available
      const matchResult = matchResults.find((r) => {
        const fixture = roundFixtures.find((f) => f.id === r.fixtureId);
        return fixture?.homeTeamId === team.id;
      });

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

    // Collect team financial update (Phase 9)
    teamFinanceUpdates.push({
      teamId: team.id,
      balance: newBalance,
      roundWages: wages,
      seasonRevenue: newSeasonRevenue,
      seasonExpenses: newSeasonExpenses,
    });

    // Collect transactions (Phase 3)
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

  // Phase 9: Batch update all team financial data using D1 batch API
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

  // Phase 3: Batch insert all transactions
  if (allTransactions.length > 0) {
    await db.insert(transactions).values(allTransactions);
  }
}

// Helper to process player stats, form updates, and growth after matches
interface MatchResultInput {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  attendance: number;
  events: Array<{
    minute: number;
    type: string;
    team: 'home' | 'away';
    playerId?: string;
    playerName?: string;
    assistPlayerId?: string;
    assistPlayerName?: string;
    description?: string;
  }>;
  // Player minutes tracking
  lineupPlayerIds?: string[];
  substitutionMinutes?: Record<string, number>; // playerId -> minute subbed off
}

async function processPlayerStatsAndGrowth(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  saveId: string,
  playerTeamId: string,
  matchResults: MatchResultInput[],
) {
  // Get all players for the player's team
  const teamPlayers = await db
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
    .where(and(eq(players.saveId, saveId), eq(players.teamId, playerTeamId)));

  // Find the player team's match - only fetch fixtures from the match results
  const fixtureIds = matchResults.map((r) => r.fixtureId);
  const playerFixtures = await db
    .select({
      id: fixtures.id,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
    })
    .from(fixtures)
    .where(
      and(
        eq(fixtures.saveId, saveId),
        inArray(fixtures.id, fixtureIds),
      ),
    );

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

  const isHome = fixture.homeTeamId === playerTeamId;
  const opponentScore = isHome ? playerMatch.awayScore : playerMatch.homeScore;
  const isCleanSheet = opponentScore === 0;

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

  // Get lineup player IDs from the match or assume all starters played 90 mins
  const lineupIds = new Set(playerMatch.lineupPlayerIds || []);
  const subMinutes = playerMatch.substitutionMinutes || {};

  // Collect all player updates for batch operation
  const playerUpdates: Array<{
    playerId: string;
    attributes: string;
    form: number;
    lastFiveRatings: string;
    seasonMinutes: number;
    seasonAvgRating: number;
  }> = [];

  // Process each player
  for (const dbPlayer of teamPlayers) {
    // Determine minutes played
    let minutesPlayed = 0;
    if (lineupIds.size > 0) {
      if (lineupIds.has(dbPlayer.id)) {
        // Starter - check if subbed off
        minutesPlayed = subMinutes[dbPlayer.id] ?? 90;
      } else if (subMinutes[dbPlayer.id] !== undefined) {
        // Sub who came on
        minutesPlayed = 90 - subMinutes[dbPlayer.id];
      }
    } else {
      // Fallback: assume first 11 players by ID in events played 90 mins
      // For simplicity, give all players in goal events 90 mins
      const wasInvolved =
        playerGoals.has(dbPlayer.id) || playerAssists.has(dbPlayer.id);
      minutesPlayed = wasInvolved ? 90 : 0;
    }

    if (minutesPlayed === 0) continue;

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
      attributes: dbPlayer.attributes as PlayerAttributes,
      potential: dbPlayer.potential,
      morale: dbPlayer.morale ?? 70,
      fitness: dbPlayer.fitness ?? 100,
      injured: dbPlayer.injured ?? false,
      injuryWeeks: dbPlayer.injuryWeeks ?? 0,
      contractEndSeason: dbPlayer.contractEndSeason,
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
    const grownPlayer = applyMatchGrowth(player, minutesPlayed, matchRating);

    // Update form ratings
    const newLastFiveRatings = [
      ...player.form.lastFiveRatings,
      matchRating,
    ].slice(-5);
    const avgRecent =
      newLastFiveRatings.reduce((a, b) => a + b, 0) / newLastFiveRatings.length;
    const newForm = Math.max(
      1,
      Math.min(100, Math.round(player.form.form * 0.7 + avgRecent * 10 * 0.3)),
    );

    // Calculate new season average rating
    const newSeasonMinutes = player.form.seasonMinutes + minutesPlayed;
    const matchCount = newLastFiveRatings.length;
    const prevTotal = player.form.seasonAvgRating * (matchCount - 1);
    const newAvg =
      matchCount > 0 ? (prevTotal + matchRating) / matchCount : matchRating;

    // Collect update for batch operation
    playerUpdates.push({
      playerId: dbPlayer.id,
      attributes: JSON.stringify(grownPlayer.attributes),
      form: newForm,
      lastFiveRatings: JSON.stringify(newLastFiveRatings),
      seasonMinutes: newSeasonMinutes,
      seasonAvgRating: Math.round(newAvg * 10) / 10,
    });
  }

  // Batch update all players using D1 batch API
  if (playerUpdates.length > 0) {
    const playerStatements = playerUpdates.map((update) =>
      d1
        .prepare(
          'UPDATE players SET attributes = ?, form = ?, last_five_ratings = ?, season_minutes = ?, season_avg_rating = ? WHERE id = ?',
        )
        .bind(
          update.attributes,
          update.form,
          update.lastFiveRatings,
          update.seasonMinutes,
          update.seasonAvgRating,
          update.playerId,
        ),
    );
    await d1.batch(playerStatements);
  }
}
