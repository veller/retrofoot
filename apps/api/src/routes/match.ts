// ============================================================================
// RETROFOOT - Match Routes
// ============================================================================
// Route handlers for match management (fixtures, round completion)

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { simulateMatch, selectBestLineup } from '@retrofoot/core';
import {
  saves,
  fixtures,
  teams,
  players,
  standings,
  tactics,
  roundLocks,
} from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';
import {
  CompleteRoundRequestSchema,
  type MatchResultInput,
  RoundLockPayloadSchema,
  type RoundLockPayload,
  type StandingsUpdate,
} from '../types/match.types';
import {
  buildStandingsStatements,
  recalculateStandingPositions,
} from '../services/standings.service';
import { processRoundFinances } from '../services/finance.service';
import { processPlayerStatsAndGrowth } from '../services/player-stats.service';
import { processAITransfers } from '../services/ai-transfer.service';
import { logAnalyticsEvent } from '../lib/analytics';

// Constants
const FORM_HISTORY_LENGTH = 5;
const D1_BATCH_STATEMENT_LIMIT = 250;
const DEFAULT_ROUND = 1;
const DEFAULT_FORM: ('W' | 'D' | 'L')[] = [];
const DEFAULT_DISCIPLINE_PRESET = 'domestic_5yc';
const YELLOW_ACCUMULATION_BY_PRESET: Record<string, number> = {
  domestic_5yc: 5,
  uefa_3yc: 3,
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function getDefaultTactics(team: {
  id: string;
  players: Array<{
    id: string;
    status?: string;
    suspensionMatchesRemaining?: number;
  }>;
}): {
  formation: '4-3-3';
  posture: 'balanced';
  lineup: string[];
  substitutes: string[];
} {
  const { lineup, substitutes } = selectBestLineup(team as never, '4-3-3');
  return {
    formation: '4-3-3',
    posture: 'balanced',
    lineup,
    substitutes,
  };
}

function computeSubMinutesByTeam(events: MatchResultInput['events']): {
  home: Record<string, number>;
  away: Record<string, number>;
} {
  const byTeam = {
    home: {} as Record<string, number>,
    away: {} as Record<string, number>,
  };

  for (const event of events) {
    if (
      event.type !== 'substitution' ||
      !event.playerId ||
      !event.assistPlayerId
    ) {
      continue;
    }

    byTeam[event.team][event.playerId] = event.minute;
    byTeam[event.team][event.assistPlayerId] = event.minute;
  }

  return byTeam;
}

export const matchRoutes = new Hono<{ Bindings: Env }>();

matchRoutes.get('/:saveId/fixtures', async (c) => {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
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
      disciplinePreset: saves.disciplinePreset,
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
        yellowAccumulation: players.yellowAccumulation,
        suspensionMatchesRemaining: players.suspensionMatchesRemaining,
        suspensionReason: players.suspensionReason,
        seasonYellowCards: players.seasonYellowCards,
        seasonRedCards: players.seasonRedCards,
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
      yellowAccumulation: p.yellowAccumulation ?? 0,
      suspensionMatchesRemaining: p.suspensionMatchesRemaining ?? 0,
      suspensionReason:
        (p.suspensionReason as
          | 'straight_red'
          | 'second_yellow'
          | 'yellow_accumulation'
          | null) ?? null,
      seasonYellowCards: p.seasonYellowCards ?? 0,
      seasonRedCards: p.seasonRedCards ?? 0,
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
    disciplinePreset: save.disciplinePreset ?? 'domestic_5yc',
    fixtures: enrichedFixtures,
    teams: teamsWithPlayers,
  });
});

matchRoutes.post('/:saveId/lock-round', async (c) => {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const saveId = c.req.param('saveId');
  const db = drizzle(c.env.DB);

  const saveResult = await db
    .select({
      userId: saves.userId,
      currentRound: saves.currentRound,
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

  const existingLock = await db
    .select({
      id: roundLocks.id,
      status: roundLocks.status,
      payload: roundLocks.payload,
    })
    .from(roundLocks)
    .where(
      and(eq(roundLocks.saveId, saveId), eq(roundLocks.round, currentRound)),
    )
    .limit(1);

  if (existingLock.length > 0) {
    const payloadResult = RoundLockPayloadSchema.safeParse(
      existingLock[0].payload,
    );
    if (!payloadResult.success) {
      return c.json({ error: 'Stored lock payload is invalid' }, 500);
    }
    return c.json({
      locked: true,
      reused: true,
      status: existingLock[0].status,
      payload: payloadResult.data,
    });
  }

  const [roundFixtures, teamsResult, playersResult, tacticsResult] =
    await Promise.all([
      db
        .select({
          id: fixtures.id,
          round: fixtures.round,
          homeTeamId: fixtures.homeTeamId,
          awayTeamId: fixtures.awayTeamId,
          date: fixtures.date,
          played: fixtures.played,
        })
        .from(fixtures)
        .where(
          and(
            eq(fixtures.saveId, saveId),
            eq(fixtures.round, currentRound),
            eq(fixtures.played, false),
          ),
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
          yellowAccumulation: players.yellowAccumulation,
          suspensionMatchesRemaining: players.suspensionMatchesRemaining,
          suspensionReason: players.suspensionReason,
          seasonYellowCards: players.seasonYellowCards,
          seasonRedCards: players.seasonRedCards,
        })
        .from(players)
        .where(eq(players.saveId, saveId)),
      db
        .select({
          teamId: tactics.teamId,
          formation: tactics.formation,
          posture: tactics.posture,
          lineup: tactics.lineup,
          substitutes: tactics.substitutes,
        })
        .from(tactics)
        .where(eq(tactics.saveId, saveId)),
    ]);

  if (roundFixtures.length === 0) {
    return c.json(
      { error: 'No unplayed fixtures found for current round' },
      400,
    );
  }

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

  const teamsWithPlayers = teamsResult.map((team) => ({
    ...team,
    lastFiveResults:
      (team.lastFiveResults as ('W' | 'D' | 'L')[]) ?? DEFAULT_FORM,
    players: (playersByTeam.get(team.id) ?? []).map((player) => ({
      ...player,
      morale: player.morale ?? 70,
      fitness: player.fitness ?? 100,
      energy: player.energy ?? 100,
      injured: player.injured ?? false,
      injuryWeeks: player.injuryWeeks ?? 0,
      status: player.status ?? 'active',
      yellowAccumulation: player.yellowAccumulation ?? 0,
      suspensionMatchesRemaining: player.suspensionMatchesRemaining ?? 0,
      seasonYellowCards: player.seasonYellowCards ?? 0,
      seasonRedCards: player.seasonRedCards ?? 0,
      form: {
        form: player.form ?? 70,
        lastFiveRatings: (player.lastFiveRatings as number[]) ?? [],
        seasonGoals: player.seasonGoals ?? 0,
        seasonAssists: player.seasonAssists ?? 0,
        seasonMinutes: player.seasonMinutes ?? 0,
        seasonAvgRating: player.seasonAvgRating ?? 0,
      },
    })),
  }));

  const teamMap = new Map(teamsWithPlayers.map((team) => [team.id, team]));
  const tacticsByTeam = new Map(
    tacticsResult.map((row) => [
      row.teamId,
      {
        formation:
          typeof row.formation === 'string' && row.formation.length > 0
            ? row.formation
            : '4-3-3',
        posture:
          row.posture === 'attacking' ||
          row.posture === 'defensive' ||
          row.posture === 'balanced'
            ? row.posture
            : 'balanced',
        lineup: parseStringArray(row.lineup),
        substitutes: parseStringArray(row.substitutes),
      },
    ]),
  );

  const lockedFixtures: RoundLockPayload['fixtures'] = [];
  for (const fixture of roundFixtures) {
    const homeTeam = teamMap.get(fixture.homeTeamId);
    const awayTeam = teamMap.get(fixture.awayTeamId);
    if (!homeTeam || !awayTeam) continue;

    const homeDefaults = getDefaultTactics(homeTeam);
    const awayDefaults = getDefaultTactics(awayTeam);
    const homePersisted = tacticsByTeam.get(homeTeam.id);
    const awayPersisted = tacticsByTeam.get(awayTeam.id);

    const homeTactics = {
      formation: (homePersisted?.formation ?? homeDefaults.formation) as
        | '3-5-2'
        | '4-3-3'
        | '4-4-2'
        | '4-5-1'
        | '5-3-2',
      posture: (homePersisted?.posture ?? homeDefaults.posture) as
        | 'attacking'
        | 'balanced'
        | 'defensive',
      lineup:
        homePersisted?.lineup.length === 11
          ? homePersisted.lineup
          : homeDefaults.lineup,
      substitutes:
        homePersisted && homePersisted.substitutes.length > 0
          ? homePersisted.substitutes
          : homeDefaults.substitutes,
    };
    const awayTactics = {
      formation: (awayPersisted?.formation ?? awayDefaults.formation) as
        | '3-5-2'
        | '4-3-3'
        | '4-4-2'
        | '4-5-1'
        | '5-3-2',
      posture: (awayPersisted?.posture ?? awayDefaults.posture) as
        | 'attacking'
        | 'balanced'
        | 'defensive',
      lineup:
        awayPersisted?.lineup.length === 11
          ? awayPersisted.lineup
          : awayDefaults.lineup,
      substitutes:
        awayPersisted && awayPersisted.substitutes.length > 0
          ? awayPersisted.substitutes
          : awayDefaults.substitutes,
    };

    const simulated = simulateMatch({
      fixtureId: fixture.id,
      homeTeam: homeTeam as never,
      awayTeam: awayTeam as never,
      homeControl: fixture.homeTeamId === save.playerTeamId ? 'human' : 'ai',
      awayControl: fixture.awayTeamId === save.playerTeamId ? 'human' : 'ai',
      homeTactics,
      awayTactics,
    });
    const subMinutesByTeam = computeSubMinutesByTeam(simulated.events);
    const playerSide =
      fixture.homeTeamId === save.playerTeamId
        ? 'home'
        : fixture.awayTeamId === save.playerTeamId
          ? 'away'
          : null;

    lockedFixtures.push({
      fixtureId: fixture.id,
      homeScore: simulated.homeScore,
      awayScore: simulated.awayScore,
      attendance: simulated.attendance,
      events: simulated.events,
      lineupByTeam: {
        home: homeTactics.lineup,
        away: awayTactics.lineup,
      },
      substitutionMinutesByTeam: subMinutesByTeam,
      ...(playerSide
        ? {
            lineupPlayerIds:
              playerSide === 'home' ? homeTactics.lineup : awayTactics.lineup,
            substitutionMinutes: subMinutesByTeam[playerSide],
          }
        : {}),
      lockedAt: new Date().toISOString(),
    });
  }

  if (lockedFixtures.length === 0) {
    return c.json({ error: 'Unable to build lock payload for fixtures' }, 400);
  }

  const payload: RoundLockPayload = {
    saveId,
    round: currentRound,
    createdAt: new Date().toISOString(),
    fixtures: lockedFixtures,
  };

  await db.insert(roundLocks).values({
    id: nanoid(),
    saveId,
    round: currentRound,
    status: 'locked',
    payload,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return c.json({
    locked: true,
    reused: false,
    status: 'locked',
    payload,
  });
});

matchRoutes.post('/:saveId/complete', async (c) => {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
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
      disciplinePreset: saves.disciplinePreset,
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

  // Parse and validate request body with Zod (accepted for backwards compatibility,
  // but server-authoritative completion uses locked server payload only).
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
  } catch {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const lockResult = await db
      .select({
        id: roundLocks.id,
        status: roundLocks.status,
        payload: roundLocks.payload,
      })
      .from(roundLocks)
      .where(
        and(eq(roundLocks.saveId, saveId), eq(roundLocks.round, currentRound)),
      )
      .limit(1);

    if (lockResult.length === 0) {
      return c.json(
        { error: 'No locked round found. Start match first.' },
        409,
      );
    }
    if (lockResult[0].status === 'committed') {
      return c.json({ error: 'Round already completed' }, 409);
    }

    const payloadResult = RoundLockPayloadSchema.safeParse(
      lockResult[0].payload,
    );
    if (!payloadResult.success) {
      return c.json({ error: 'Stored lock payload is invalid' }, 500);
    }

    const lockedResults: MatchResultInput[] = payloadResult.data.fixtures;

    // Fetch fixtures data
    const resultFixtureIds = lockedResults.map((r) => r.fixtureId);
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
    const playerYellowCards = new Map<string, number>();
    const playerRedCards = new Map<string, number>();
    const secondYellowSendOffs = new Set<string>();
    const straightRedSendOffs = new Set<string>();
    const formUpdates = new Map<string, ('W' | 'D' | 'L')[]>();
    const standingsUpdates: StandingsUpdate[] = [];

    for (const result of lockedResults) {
      for (const event of result.events) {
        if (event.playerId && event.type === 'yellow_card') {
          playerYellowCards.set(
            event.playerId,
            (playerYellowCards.get(event.playerId) ?? 0) + 1,
          );
        }
        if (event.playerId && event.type === 'red_card') {
          playerRedCards.set(
            event.playerId,
            (playerRedCards.get(event.playerId) ?? 0) + 1,
          );
          if (event.cardReason === 'second_yellow') {
            secondYellowSendOffs.add(event.playerId);
          } else {
            straightRedSendOffs.add(event.playerId);
          }
        }
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

        const goalEvents = result.events.filter(
          (e) => e.type === 'goal' || e.type === 'penalty_scored',
        );
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

    // Prefetch data for finances in parallel with first writes
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
    ]);

    const fixtureStatements = lockedResults.map((result) =>
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

    const suspensionRollOffStatements = teamIdArray.map((teamId) =>
      c.env.DB.prepare(
        `UPDATE players
         SET suspension_matches_remaining = CASE
           WHEN suspension_matches_remaining > 0 THEN suspension_matches_remaining - 1
           ELSE 0
         END,
         status = CASE
           WHEN suspension_matches_remaining - 1 > 0 THEN 'suspended'
           WHEN status = 'suspended' THEN 'active'
           ELSE status
         END,
         suspension_reason = CASE
           WHEN suspension_matches_remaining - 1 > 0 THEN suspension_reason
           ELSE NULL
         END
         WHERE save_id = ? AND team_id = ? AND suspension_matches_remaining > 0`,
      ).bind(saveId, teamId),
    );
    if (suspensionRollOffStatements.length > 0) {
      await c.env.DB.batch(suspensionRollOffStatements);
    }

    const disciplinePreset = save.disciplinePreset ?? DEFAULT_DISCIPLINE_PRESET;
    const yellowThreshold =
      YELLOW_ACCUMULATION_BY_PRESET[disciplinePreset] ??
      YELLOW_ACCUMULATION_BY_PRESET[DEFAULT_DISCIPLINE_PRESET];
    const cardedPlayerIds = Array.from(
      new Set([...playerYellowCards.keys(), ...playerRedCards.keys()]),
    );
    const cardedPlayerRows =
      cardedPlayerIds.length > 0
        ? await db
            .select({
              id: players.id,
              yellowAccumulation: players.yellowAccumulation,
              suspensionMatchesRemaining: players.suspensionMatchesRemaining,
              suspensionReason: players.suspensionReason,
            })
            .from(players)
            .where(
              and(
                eq(players.saveId, saveId),
                inArray(players.id, cardedPlayerIds),
              ),
            )
        : [];

    const disciplineStatements = cardedPlayerRows.map((row) => {
      const playerId = row.id;
      const yellowInc = playerYellowCards.get(playerId) ?? 0;
      const redInc = playerRedCards.get(playerId) ?? 0;
      const isSecondYellow = secondYellowSendOffs.has(playerId);
      const isStraightRed = straightRedSendOffs.has(playerId);

      let yellowAccum = (row.yellowAccumulation ?? 0) + yellowInc;
      let suspensionMatchesRemaining = row.suspensionMatchesRemaining ?? 0;
      let suspensionReason = row.suspensionReason as
        | 'straight_red'
        | 'second_yellow'
        | 'yellow_accumulation'
        | null;

      if (isSecondYellow || isStraightRed) {
        suspensionMatchesRemaining += 1;
        yellowAccum = 0;
        suspensionReason = isSecondYellow ? 'second_yellow' : 'straight_red';
      } else if (yellowAccum >= yellowThreshold) {
        suspensionMatchesRemaining += 1;
        yellowAccum = 0;
        suspensionReason = 'yellow_accumulation';
      }

      return c.env.DB.prepare(
        `UPDATE players
         SET season_yellow_cards = season_yellow_cards + ?,
             season_red_cards = season_red_cards + ?,
             yellow_accumulation = ?,
             suspension_matches_remaining = ?,
             suspension_reason = CASE
               WHEN ? > 0 THEN ?
               ELSE NULL
             END,
             status = CASE
               WHEN ? > 0 THEN 'suspended'
               WHEN status = 'suspended' THEN 'active'
               ELSE status
             END
         WHERE id = ?`,
      ).bind(
        yellowInc,
        redInc,
        yellowAccum,
        suspensionMatchesRemaining,
        suspensionMatchesRemaining,
        suspensionReason,
        suspensionMatchesRemaining,
        playerId,
      );
    });

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
      for (
        let i = 0;
        i < matchEventStatements.length;
        i += D1_BATCH_STATEMENT_LIMIT
      ) {
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
      disciplineStatements.length > 0
        ? c.env.DB.batch(disciplineStatements)
        : Promise.resolve(),
    ]);

    await recalculateStandingPositions(c.env.DB, saveId, save.currentSeason);

    const [prefetchedTeams, prefetchedPlayers] = await prefetchPromise;

    const standingsResult = await db
      .select({
        teamId: standings.teamId,
        position: standings.position,
      })
      .from(standings)
      .where(
        and(
          eq(standings.saveId, saveId),
          eq(standings.season, save.currentSeason),
        ),
      );

    const playerStatsPromises = teamIdArray.map((teamId) =>
      processPlayerStatsAndGrowth(db, c.env.DB, saveId, teamId, lockedResults),
    );

    await Promise.all([
      Promise.all(playerStatsPromises),
      processRoundFinances(
        db,
        c.env.DB,
        saveId,
        save.currentSeason,
        currentRound,
        lockedResults,
        {
          teams: prefetchedTeams,
          players: prefetchedPlayers,
          standings: standingsResult,
          roundFixtures: roundFixturesData,
        },
      ),
    ]);

    const newRound = currentRound + 1;
    await db
      .update(saves)
      .set({
        currentRound: newRound,
        updatedAt: new Date(),
      })
      .where(eq(saves.id, saveId));
    await db
      .update(roundLocks)
      .set({
        status: 'committed',
        updatedAt: new Date(),
      })
      .where(eq(roundLocks.id, lockResult[0].id));

    // Process AI transfer activity (kept alive with waitUntil)
    const transferPromise = processAITransfers(
      db,
      c.env.DB,
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

    const playerFixtureResult = lockedResults.find((result) => {
      const fixture = fixturesMap.get(result.fixtureId);
      if (!fixture) {
        return false;
      }
      return (
        fixture.homeTeamId === save.playerTeamId ||
        fixture.awayTeamId === save.playerTeamId
      );
    });

    if (playerFixtureResult) {
      await logAnalyticsEvent(c.env.DB, 'match_completed', session.user.id, {
        saveId,
        payload: {
          fixtureId: playerFixtureResult.fixtureId,
          round: currentRound,
          seasonComplete,
        },
      });
    }

    return c.json({
      success: true,
      newRound,
      matchesProcessed: lockedResults.length,
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
