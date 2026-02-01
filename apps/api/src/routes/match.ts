import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import {
  saves,
  fixtures,
  matchEvents,
  standings,
  teams,
  players,
} from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';

// Match management routes
export const matchRoutes = new Hono<{ Bindings: Env }>();

/**
 * Get current round fixtures for a save with full team and player data
 */
matchRoutes.get('/:saveId/fixtures', async (c) => {
  const auth = createAuth(c.env, c.req.raw.cf);
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

  // Get fixtures for current round
  const fixturesResult = await db
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
    );

  // Get all teams with full info
  const teamsResult = await db
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
    .where(eq(teams.saveId, saveId));

  // Get all players for all teams
  const playersResult = await db
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
    .where(eq(players.saveId, saveId));

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
  const auth = createAuth(c.env, c.req.raw.cf);
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

  if (!body.results || !Array.isArray(body.results)) {
    return c.json({ error: 'Missing results array' }, 400);
  }

  try {
    // Process each match result
    for (const result of body.results) {
      // Update fixture with score
      await db
        .update(fixtures)
        .set({
          played: true,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
        })
        .where(eq(fixtures.id, result.fixtureId));

      // Insert match events
      for (const event of result.events) {
        await db.insert(matchEvents).values({
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

      // Get fixture details to update standings
      const fixtureResult = await db
        .select({
          homeTeamId: fixtures.homeTeamId,
          awayTeamId: fixtures.awayTeamId,
        })
        .from(fixtures)
        .where(eq(fixtures.id, result.fixtureId))
        .limit(1);

      if (fixtureResult.length > 0) {
        const fixture = fixtureResult[0];

        // Update home team standings
        await updateTeamStandings(
          db,
          saveId,
          save.currentSeason!,
          fixture.homeTeamId,
          result.homeScore,
          result.awayScore,
        );

        // Update away team standings
        await updateTeamStandings(
          db,
          saveId,
          save.currentSeason!,
          fixture.awayTeamId,
          result.awayScore,
          result.homeScore,
        );

        // Update team form (lastFiveResults)
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

        await updateTeamForm(db, saveId, fixture.homeTeamId, homeResult);
        await updateTeamForm(db, saveId, fixture.awayTeamId, awayResult);

        // Update player stats for goals
        const goalEvents = result.events.filter((e) => e.type === 'goal');
        for (const goal of goalEvents) {
          if (goal.playerId) {
            await db
              .update(players)
              .set({
                seasonGoals: sql`${players.seasonGoals} + 1`,
              })
              .where(eq(players.id, goal.playerId));
          }
        }
      }
    }

    // Recalculate positions
    await recalculateStandingPositions(db, saveId, save.currentSeason!);

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

// Helper to recalculate standings positions
async function recalculateStandingPositions(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  season: string,
) {
  // Get all standings sorted by points, goal difference, goals for
  const allStandings = await db
    .select()
    .from(standings)
    .where(and(eq(standings.saveId, saveId), eq(standings.season, season)));

  // Sort by points, then goal difference, then goals for
  allStandings.sort((a, b) => {
    const pointsDiff = (b.points ?? 0) - (a.points ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    const gdA = (a.goalsFor ?? 0) - (a.goalsAgainst ?? 0);
    const gdB = (b.goalsFor ?? 0) - (b.goalsAgainst ?? 0);
    const gdDiff = gdB - gdA;
    if (gdDiff !== 0) return gdDiff;

    return (b.goalsFor ?? 0) - (a.goalsFor ?? 0);
  });

  // Update positions
  for (let i = 0; i < allStandings.length; i++) {
    await db
      .update(standings)
      .set({ position: i + 1 })
      .where(eq(standings.id, allStandings[i].id));
  }
}

// Helper to update team form (lastFiveResults)
async function updateTeamForm(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  teamId: string,
  result: 'W' | 'D' | 'L',
) {
  // Fetch current form
  const teamResult = await db
    .select({ lastFiveResults: teams.lastFiveResults })
    .from(teams)
    .where(and(eq(teams.saveId, saveId), eq(teams.id, teamId)))
    .limit(1);

  if (teamResult.length === 0) return;

  // Get current results, append new one, keep last 5
  const currentResults =
    (teamResult[0].lastFiveResults as ('W' | 'D' | 'L')[]) ?? [];
  const newResults = [...currentResults, result].slice(-5);

  // Update team
  await db
    .update(teams)
    .set({ lastFiveResults: newResults })
    .where(and(eq(teams.saveId, saveId), eq(teams.id, teamId)));
}
