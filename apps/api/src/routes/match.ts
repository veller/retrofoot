// ============================================================================
// RETROFOOT - Match Routes
// ============================================================================
// Route handlers for match management (fixtures, round completion)

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  saves,
  fixtures,
  teams,
  players,
  tactics,
  standings,
} from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';
import {
  CompleteRoundRequestSchema,
  type MatchResultInput,
  type StandingsUpdate,
} from '../types/match.types';
import {
  buildStandingsStatements,
  recalculateStandingPositions,
} from '../services/standings.service';
import { processRoundFinances } from '../services/finance.service';
import { processPlayerStatsAndGrowth } from '../services/player-stats.service';
import { processAITransfers } from '../services/ai-transfer.service';

// Constants
const FORM_HISTORY_LENGTH = 5;
const D1_BATCH_STATEMENT_LIMIT = 250;
const DEFAULT_ROUND = 1;
const RECOVERY_PER_ROUND = 12;
const DEFAULT_FORM: ('W' | 'D' | 'L')[] = [];

export const matchRoutes = new Hono<{ Bindings: Env }>();

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
  const currentRound = save.currentRound ?? DEFAULT_ROUND;

  const [fixturesResult, teamsResult, playersResult] = await Promise.all([
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
        and(eq(fixtures.saveId, saveId), eq(fixtures.round, currentRound)),
      ),
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
      .where(eq(players.saveId, saveId)),
  ]);

  const playersByTeam = new Map<string, typeof playersResult>();
  for (const player of playersResult) {
    if (!player.teamId) continue;
    const teamPlayers = playersByTeam.get(player.teamId);
    if (teamPlayers) {
      teamPlayers.push(player);
    } else {
      playersByTeam.set(player.teamId, [player]);
    }
  }

  const teamsWithPlayers = teamsResult.map((t) => ({
    ...t,
    lastFiveResults: (t.lastFiveResults as ('W' | 'D' | 'L')[]) ?? DEFAULT_FORM,
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
      energy: p.energy ?? 100,
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

  // Validate required save fields
  if (!save.currentSeason) {
    return c.json({ error: 'Save has no current season' }, 400);
  }
  if (!save.playerTeamId) {
    return c.json({ error: 'Save has no player team' }, 400);
  }

  const currentRound = save.currentRound ?? DEFAULT_ROUND;

  // Parse and validate request body with Zod
  let body: { results: MatchResultInput[] };
  try {
    const rawBody = await c.req.json();
    const parsed = CompleteRoundRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: 'Invalid request body',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      );
    }
    body = parsed.data;
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    // Fetch fixtures data
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

    // Pre-fetch only teams that played for form updates
    const playingTeamsData = await db
      .select({
        id: teams.id,
        lastFiveResults: teams.lastFiveResults,
      })
      .from(teams)
      .where(and(eq(teams.saveId, saveId), inArray(teams.id, teamIdArray)));

    const teamsFormMap = new Map(
      playingTeamsData.map((t) => [
        t.id,
        (t.lastFiveResults as ('W' | 'D' | 'L')[]) ?? DEFAULT_FORM,
      ]),
    );

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

    const playerGoals = new Map<string, number>();
    const playerAssists = new Map<string, number>();
    const formUpdates = new Map<string, ('W' | 'D' | 'L')[]>();
    const standingsUpdates: StandingsUpdate[] = [];

    for (const result of body.results) {
      for (const event of result.events) {
        allMatchEvents.push({
          id: nanoid(),
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
        standingsUpdates.push({
          teamId: fixture.homeTeamId,
          goalsFor: result.homeScore,
          goalsAgainst: result.awayScore,
          isWin: result.homeScore > result.awayScore,
          isDraw: result.homeScore === result.awayScore,
        });
        standingsUpdates.push({
          teamId: fixture.awayTeamId,
          goalsFor: result.awayScore,
          goalsAgainst: result.homeScore,
          isWin: result.awayScore > result.homeScore,
          isDraw: result.homeScore === result.awayScore,
        });

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

        const homeCurrentForm =
          formUpdates.get(fixture.homeTeamId) ??
          teamsFormMap.get(fixture.homeTeamId) ??
          DEFAULT_FORM;
        const newHomeForm = [...homeCurrentForm, homeResult].slice(
          -FORM_HISTORY_LENGTH,
        );
        formUpdates.set(fixture.homeTeamId, newHomeForm);

        const awayCurrentForm =
          formUpdates.get(fixture.awayTeamId) ??
          teamsFormMap.get(fixture.awayTeamId) ??
          DEFAULT_FORM;
        const newAwayForm = [...awayCurrentForm, awayResult].slice(
          -FORM_HISTORY_LENGTH,
        );
        formUpdates.set(fixture.awayTeamId, newAwayForm);

        const goalEvents = result.events.filter((e) => e.type === 'goal');
        for (const goal of goalEvents) {
          if (goal.playerId) {
            playerGoals.set(
              goal.playerId,
              (playerGoals.get(goal.playerId) || 0) + 1,
            );
          }
          if (goal.assistPlayerId) {
            playerAssists.set(
              goal.assistPlayerId,
              (playerAssists.get(goal.assistPlayerId) || 0) + 1,
            );
          }
        }
      }
    }

    const standingsStatements = buildStandingsStatements(
      c.env.DB,
      standingsUpdates,
      saveId,
      save.currentSeason,
    );

    // Prefetch data for finance + player-stats in parallel with first writes
    const prefetchPromise = Promise.all([
      db
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
        .where(eq(teams.saveId, saveId)),
      db
        .select({
          id: players.id,
          teamId: players.teamId,
          wage: players.wage,
        })
        .from(players)
        .where(eq(players.saveId, saveId)),
      db
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
          and(eq(players.saveId, saveId), eq(players.teamId, save.playerTeamId)),
        ),
      db
        .select({ posture: tactics.posture })
        .from(tactics)
        .where(
          and(eq(tactics.saveId, saveId), eq(tactics.teamId, save.playerTeamId)),
        )
        .limit(1),
    ]);

    const fixtureStatements = body.results.map((result) =>
      c.env.DB.prepare(
        'UPDATE fixtures SET played = 1, home_score = ?, away_score = ? WHERE id = ?',
      ).bind(result.homeScore, result.awayScore, result.fixtureId),
    );

    const goalStatements = Array.from(playerGoals.entries()).map(
      ([playerId, goals]) =>
        c.env.DB.prepare(
          'UPDATE players SET season_goals = season_goals + ? WHERE id = ?',
        ).bind(goals, playerId),
    );

    const assistStatements = Array.from(playerAssists.entries()).map(
      ([playerId, assists]) =>
        c.env.DB.prepare(
          'UPDATE players SET season_assists = season_assists + ? WHERE id = ?',
        ).bind(assists, playerId),
    );

    const formStatements = Array.from(formUpdates.entries()).map(
      ([teamId, form]) =>
        c.env.DB.prepare(
          'UPDATE teams SET last_five_results = ? WHERE id = ?',
        ).bind(JSON.stringify(form), teamId),
    );

    const matchEventStatements = allMatchEvents.map((ev) =>
      c.env.DB.prepare(
        'INSERT INTO match_events (id, fixture_id, minute, type, team, player_id, player_name, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        ev.id,
        ev.fixtureId,
        ev.minute,
        ev.type,
        ev.team,
        ev.playerId ?? null,
        ev.playerName ?? null,
        ev.description ?? null,
      ),
    );

    const runMatchEventsBatch = async () => {
      for (let i = 0; i < matchEventStatements.length; i += D1_BATCH_STATEMENT_LIMIT) {
        const chunk = matchEventStatements.slice(
          i,
          i + D1_BATCH_STATEMENT_LIMIT,
        );
        if (chunk.length > 0) await c.env.DB.batch(chunk);
      }
    };

    await Promise.all([
      standingsStatements.length > 0
        ? c.env.DB.batch(standingsStatements)
        : Promise.resolve(),
      fixtureStatements.length > 0
        ? c.env.DB.batch(fixtureStatements)
        : Promise.resolve(),
      runMatchEventsBatch(),
      goalStatements.length > 0
        ? c.env.DB.batch(goalStatements)
        : Promise.resolve(),
      assistStatements.length > 0
        ? c.env.DB.batch(assistStatements)
        : Promise.resolve(),
      formStatements.length > 0
        ? c.env.DB.batch(formStatements)
        : Promise.resolve(),
    ]);

    await recalculateStandingPositions(c.env.DB, saveId, save.currentSeason);

    const [prefetchedTeams, prefetchedPlayers, teamPlayers, tacticsRows] =
      await prefetchPromise;

    const standingsResult = await db
      .select({
        teamId: standings.teamId,
        position: standings.position,
      })
      .from(standings)
      .where(
        and(eq(standings.saveId, saveId), eq(standings.season, save.currentSeason)),
      );

    const fixtureMap = new Map(
      roundFixturesData.map((f) => [
        f.id,
        { homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId },
      ]),
    );

    await Promise.all([
      processPlayerStatsAndGrowth(
        db,
        c.env.DB,
        saveId,
        save.playerTeamId,
        body.results,
        {
          teamPlayers,
          tactics: tacticsRows.length > 0 ? { posture: tacticsRows[0].posture } : null,
          fixtureMap,
        },
      ),
      processRoundFinances(
        db,
        c.env.DB,
        saveId,
        save.currentSeason,
        currentRound,
        body.results,
        {
          teams: prefetchedTeams,
          players: prefetchedPlayers,
          standings: standingsResult,
          roundFixtures: roundFixturesData,
        },
      ),
    ]);

    // Energy recovery for player's team (all players gain back some energy each round)
    await c.env.DB.prepare(
      'UPDATE players SET energy = MIN(100, COALESCE(energy, 100) + ?) WHERE save_id = ? AND team_id = ?',
    )
      .bind(RECOVERY_PER_ROUND, saveId, save.playerTeamId)
      .run();

    const newRound = currentRound + 1;
    await db
      .update(saves)
      .set({
        currentRound: newRound,
        updatedAt: new Date(),
      })
      .where(eq(saves.id, saveId));

    // Process AI transfer activity (kept alive with waitUntil)
    const transferPromise = processAITransfers(
      db,
      saveId,
      save.playerTeamId,
      save.currentSeason,
      newRound,
    ).catch((err) => {
      console.error('AI transfer processing failed:', err);
    });

    c.executionCtx.waitUntil(transferPromise);

    // Check if this was the final round of the season (38 rounds for 20 teams)
    const TOTAL_ROUNDS = 38;
    const seasonComplete = currentRound >= TOTAL_ROUNDS;

    return c.json({
      success: true,
      newRound,
      matchesProcessed: body.results.length,
      seasonComplete,
    });
  } catch (error) {
    console.error('Failed to complete round:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    const isDevelopment = c.env.ENVIRONMENT === 'development';
    const errorStack =
      isDevelopment && error instanceof Error ? error.stack : undefined;

    return c.json(
      {
        error: 'Failed to save match results',
        details: errorMessage,
        ...(errorStack && { stack: errorStack }),
      },
      500,
    );
  }
});
