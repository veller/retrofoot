import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, gt, count } from 'drizzle-orm';
import {
  saves,
  teams,
  players,
  standings,
  fixtures,
  transactions,
  tactics,
} from '@retrofoot/db/schema';
import {
  DEFAULT_FORMATION,
  FORMATION_OPTIONS,
  ALL_PLAYERS,
  TEAMS,
  evaluateFormationEligibility,
  generateInitialFreeAgents,
  normalizeFormation,
  selectBestLineup,
  type FormationType,
  type Player,
  type Position,
  type TacticalPosture,
} from '@retrofoot/core';
import {
  seedNewGame,
  getAvailableTeams,
  createPendingSave,
  seedPendingSaveWorld,
} from '../lib/seed';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';

// Save management routes
export const saveRoutes = new Hono<{ Bindings: Env }>();
const EXPECTED_TEAM_COUNT = TEAMS.length;
const EXPECTED_FIXTURE_COUNT = EXPECTED_TEAM_COUNT * (EXPECTED_TEAM_COUNT - 1);

interface SaveSetupStatus {
  ready: boolean;
  stage: string;
  progress: number;
  teamCount: number;
  playerCount: number;
  standingsCount: number;
  fixturesCount: number;
  expectedTeamCount: number;
  expectedPlayerCountMinimum: number;
  expectedFixtureCount: number;
}

async function getSaveSetupStatus(
  db: ReturnType<typeof drizzle>,
  saveId: string,
  currentSeason: string,
  playerTeamId: string,
): Promise<SaveSetupStatus> {
  const [
    teamCountResult,
    playerCountResult,
    standingsCountResult,
    fixturesCountResult,
    playerTeamResult,
  ] = await Promise.all([
    db.select({ value: count() }).from(teams).where(eq(teams.saveId, saveId)),
    db
      .select({ value: count() })
      .from(players)
      .where(eq(players.saveId, saveId)),
    db
      .select({ value: count() })
      .from(standings)
      .where(eq(standings.saveId, saveId)),
    db
      .select({ value: count() })
      .from(fixtures)
      .where(eq(fixtures.saveId, saveId)),
    db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, playerTeamId))
      .limit(1),
  ]);

  const teamCount = Number(teamCountResult[0]?.value ?? 0);
  const playerCount = Number(playerCountResult[0]?.value ?? 0);
  const standingsCount = Number(standingsCountResult[0]?.value ?? 0);
  const fixturesCount = Number(fixturesCountResult[0]?.value ?? 0);
  const seasonNumber = Number.parseInt(currentSeason, 10);
  const generatedFreeAgents = Number.isNaN(seasonNumber)
    ? 0
    : generateInitialFreeAgents(seasonNumber).length;
  const expectedPlayerCountMinimum = ALL_PLAYERS.length + generatedFreeAgents;
  const playerTeamReady = playerTeamResult.length > 0;

  const ready =
    teamCount >= EXPECTED_TEAM_COUNT &&
    playerCount >= expectedPlayerCountMinimum &&
    standingsCount >= EXPECTED_TEAM_COUNT &&
    fixturesCount >= EXPECTED_FIXTURE_COUNT &&
    playerTeamReady;

  let stage = 'initializing';
  if (ready) {
    stage = 'ready';
  } else if (teamCount < EXPECTED_TEAM_COUNT) {
    stage = 'teams';
  } else if (playerCount < expectedPlayerCountMinimum) {
    stage = 'players';
  } else if (standingsCount < EXPECTED_TEAM_COUNT) {
    stage = 'standings';
  } else if (fixturesCount < EXPECTED_FIXTURE_COUNT) {
    stage = 'fixtures';
  }

  const teamProgress = Math.min(1, teamCount / EXPECTED_TEAM_COUNT);
  const playerProgress = Math.min(1, playerCount / expectedPlayerCountMinimum);
  const standingsProgress = Math.min(1, standingsCount / EXPECTED_TEAM_COUNT);
  const fixturesProgress = Math.min(1, fixturesCount / EXPECTED_FIXTURE_COUNT);
  const progress =
    teamProgress * 0.2 +
    playerProgress * 0.5 +
    standingsProgress * 0.1 +
    fixturesProgress * 0.2;

  return {
    ready,
    stage,
    progress: ready ? 1 : Number(progress.toFixed(3)),
    teamCount,
    playerCount,
    standingsCount,
    fixturesCount,
    expectedTeamCount: EXPECTED_TEAM_COUNT,
    expectedPlayerCountMinimum,
    expectedFixtureCount: EXPECTED_FIXTURE_COUNT,
  };
}

/**
 * Get available teams for new game creation
 */
saveRoutes.get('/teams', async (c) => {
  const availableTeams = getAvailableTeams();
  return c.json({ teams: availableTeams });
});

/**
 * List all saves for current user
 */
saveRoutes.get('/', async (c) => {
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

  const db = drizzle(c.env.DB);

  const userSaves = await db
    .select({
      id: saves.id,
      name: saves.name,
      playerTeamId: saves.playerTeamId,
      managerName: saves.managerName,
      currentSeason: saves.currentSeason,
      currentRound: saves.currentRound,
      gameOver: saves.gameOver,
      gameOverReason: saves.gameOverReason,
      createdAt: saves.createdAt,
      updatedAt: saves.updatedAt,
    })
    .from(saves)
    .where(eq(saves.userId, session.user.id));

  return c.json({ saves: userSaves });
});

/**
 * Create new save (seeds the game)
 */
saveRoutes.post('/', async (c) => {
  const requestStart = performance.now();
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const authStart = performance.now();
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  const authMs = Math.round(performance.now() - authStart);

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    name: string;
    teamId: string;
    managerName: string;
  }>();

  if (!body.name || !body.teamId || !body.managerName) {
    return c.json(
      { error: 'Missing required fields: name, teamId, managerName' },
      400,
    );
  }

  const db = drizzle(c.env.DB);
  const mode = c.req.query('mode') === 'sync' ? 'sync' : 'async';

  try {
    if (mode === 'sync') {
      const result = await seedNewGame(
        db,
        session.user.id,
        body.name,
        body.teamId,
        body.managerName,
      );
      const totalMs = Math.round(performance.now() - requestStart);
      console.info('save.create.sync', {
        userId: session.user.id,
        saveId: result.saveId,
        authMs,
        timingsMs: result.timingsMs,
        totalMs,
      });
      return c.json({
        success: true,
        setupStatus: 'ready',
        saveId: result.saveId,
        teamCount: result.teamCount,
        playerCount: result.playerCount,
        message: `Created new save with ${result.teamCount} teams and ${result.playerCount} players`,
        timingsMs: {
          auth: authMs,
          seed: result.timingsMs.total,
          total: totalMs,
        },
      });
    }

    const pendingStart = performance.now();
    const pending = await createPendingSave(
      db,
      session.user.id,
      body.name,
      body.teamId,
      body.managerName,
    );
    const pendingMs = Math.round(performance.now() - pendingStart);

    c.executionCtx.waitUntil(
      (async () => {
        const seedStart = performance.now();
        try {
          const seeded = await seedPendingSaveWorld(
            db,
            pending.saveId,
            pending.season,
          );
          const seedMs = Math.round(performance.now() - seedStart);
          console.info('save.create.async.completed', {
            userId: session.user.id,
            saveId: pending.saveId,
            seedMs,
            timingsMs: seeded.timingsMs,
            teamCount: seeded.teamCount,
            playerCount: seeded.playerCount,
          });
        } catch (seedError) {
          console.error('save.create.async.failed', {
            userId: session.user.id,
            saveId: pending.saveId,
            error: seedError,
          });
        }
      })(),
    );

    const totalMs = Math.round(performance.now() - requestStart);
    console.info('save.create.async.accepted', {
      userId: session.user.id,
      saveId: pending.saveId,
      authMs,
      pendingMs,
      totalMs,
    });
    return c.json(
      {
        success: true,
        setupStatus: 'pending',
        saveId: pending.saveId,
        message: 'Save created. World setup is running in the background.',
        pollUrl: `/api/save/${pending.saveId}/setup-status`,
        timingsMs: {
          auth: authMs,
          pendingSave: pendingMs,
          total: totalMs,
        },
      },
      202,
    );
  } catch (error) {
    console.error('Failed to create save:', error);
    return c.json({ error: 'Failed to create game save' }, 500);
  }
});

/**
 * Get setup status for an asynchronously created save
 */
saveRoutes.get('/:id/setup-status', async (c) => {
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

  const saveId = c.req.param('id');
  const db = drizzle(c.env.DB);
  const saveResult = await db
    .select({
      id: saves.id,
      userId: saves.userId,
      currentSeason: saves.currentSeason,
      playerTeamId: saves.playerTeamId,
    })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0) {
    return c.json({ error: 'Save not found' }, 404);
  }
  if (saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const setup = await getSaveSetupStatus(
    db,
    saveId,
    saveResult[0].currentSeason,
    saveResult[0].playerTeamId,
  );

  return c.json({
    saveId,
    setupStatus: setup.ready ? 'ready' : 'pending',
    ...setup,
  });
});

/**
 * Get save details with team and player counts
 */
saveRoutes.get('/:id', async (c) => {
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

  const saveId = c.req.param('id');
  const db = drizzle(c.env.DB);

  // Get save details
  const saveResult = await db
    .select()
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0) {
    return c.json({ error: 'Save not found' }, 404);
  }

  const save = saveResult[0];

  // Verify ownership
  if (save.userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const setup = await getSaveSetupStatus(
    db,
    saveId,
    save.currentSeason,
    save.playerTeamId,
  );

  if (!setup.ready) {
    return c.json(
      {
        saveId,
        setupStatus: 'pending',
        ...setup,
      },
      202,
    );
  }

  // Get player team details (ready state)
  const playerTeam = await db
    .select()
    .from(teams)
    .where(eq(teams.id, save.playerTeamId))
    .limit(1);

  return c.json({
    save: {
      id: save.id,
      name: save.name,
      managerName: save.managerName,
      managerReputation: save.managerReputation,
      currentSeason: save.currentSeason,
      currentRound: save.currentRound,
      createdAt: save.createdAt,
      updatedAt: save.updatedAt,
    },
    playerTeam: playerTeam[0] || null,
    teamCount: setup.teamCount,
    playerCount: setup.playerCount,
  });
});

/**
 * Get standings for a save
 */
saveRoutes.get('/:id/standings', async (c) => {
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

  const saveId = c.req.param('id');
  const db = drizzle(c.env.DB);

  // Verify ownership first
  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Get standings with team info
  const standingsResult = await db
    .select({
      position: standings.position,
      teamId: standings.teamId,
      teamName: teams.name,
      teamShortName: teams.shortName,
      played: standings.played,
      won: standings.won,
      drawn: standings.drawn,
      lost: standings.lost,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
      points: standings.points,
    })
    .from(standings)
    .innerJoin(teams, eq(standings.teamId, teams.id))
    .where(eq(standings.saveId, saveId))
    .orderBy(standings.position);

  return c.json({ standings: standingsResult });
});

/**
 * Get squad for a team in a save
 */
saveRoutes.get('/:id/team/:teamId/squad', async (c) => {
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

  const saveId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const db = drizzle(c.env.DB);

  // Verify ownership
  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Get players
  const squad = await db
    .select({
      id: players.id,
      name: players.name,
      nickname: players.nickname,
      age: players.age,
      position: players.position,
      nationality: players.nationality,
      attributes: players.attributes,
      potential: players.potential,
      morale: players.morale,
      fitness: players.fitness,
      energy: players.energy,
      injured: players.injured,
      form: players.form,
      contractEndSeason: players.contractEndSeason,
      wage: players.wage,
      marketValue: players.marketValue,
      // Season stats
      lastFiveRatings: players.lastFiveRatings,
      seasonGoals: players.seasonGoals,
      seasonAssists: players.seasonAssists,
      seasonMinutes: players.seasonMinutes,
      seasonAvgRating: players.seasonAvgRating,
    })
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.saveId, saveId)));

  return c.json({ squad });
});

saveRoutes.get('/:id/tactics/:teamId', async (c) => {
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

  const saveId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const db = drizzle(c.env.DB);

  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const teamResult = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.saveId, saveId)))
    .limit(1);

  if (teamResult.length === 0) {
    return c.json({ error: 'Team not found for this save' }, 404);
  }

  const current = await db
    .select({
      formation: tactics.formation,
      posture: tactics.posture,
      lineup: tactics.lineup,
      substitutes: tactics.substitutes,
    })
    .from(tactics)
    .where(and(eq(tactics.saveId, saveId), eq(tactics.teamId, teamId)))
    .limit(1);

  if (current.length === 0) {
    return c.json({ error: 'Tactics not found' }, 404);
  }

  const row = current[0];
  return c.json({
    tactics: {
      formation: normalizeFormation(row.formation),
      posture: row.posture,
      lineup: (row.lineup as string[]) ?? [],
      substitutes: (row.substitutes as string[]) ?? [],
    },
  });
});

saveRoutes.put('/:id/tactics/:teamId', async (c) => {
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

  const saveId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const db = drizzle(c.env.DB);

  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const teamResult = await db
    .select({
      id: teams.id,
      name: teams.name,
      shortName: teams.shortName,
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
    .where(and(eq(teams.id, teamId), eq(teams.saveId, saveId)))
    .limit(1);

  if (teamResult.length === 0) {
    return c.json({ error: 'Team not found for this save' }, 404);
  }

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
    .where(and(eq(players.teamId, teamId), eq(players.saveId, saveId)));

  const body = await c.req.json<{
    formation?: string;
    posture?: string;
    lineup?: string[];
    substitutes?: string[];
  }>();

  const formation = normalizeFormation(body.formation);
  const posture = body.posture as TacticalPosture;

  if (!['defensive', 'balanced', 'attacking'].includes(posture)) {
    return c.json({ error: 'Invalid posture' }, 400);
  }

  const availabilityPlayers = teamPlayers.map((player) => ({
    position: player.position as Position,
    injured: player.injured ?? false,
    fitness: player.fitness ?? 100,
  }));
  const eligibility = evaluateFormationEligibility(
    formation,
    availabilityPlayers,
  );
  if (!eligibility.eligible) {
    return c.json(
      {
        error: 'Formation not eligible for available players',
        formation,
        required: eligibility.required,
        available: eligibility.available,
        missing: eligibility.missing,
      },
      400,
    );
  }

  const playerIds = new Set(teamPlayers.map((player) => player.id));
  let lineup = Array.isArray(body.lineup) ? body.lineup : [];
  let substitutes = Array.isArray(body.substitutes) ? body.substitutes : [];

  lineup = lineup.filter((id) => typeof id === 'string' && playerIds.has(id));
  substitutes = substitutes.filter(
    (id) => typeof id === 'string' && playerIds.has(id),
  );

  if (lineup.length < 11) {
    const corePlayers: Player[] = teamPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname ?? undefined,
      age: player.age,
      nationality: player.nationality,
      position: player.position as Position,
      preferredFoot:
        (player.preferredFoot as 'left' | 'right' | 'both') ?? 'right',
      attributes: player.attributes as Player['attributes'],
      potential: player.potential,
      morale: player.morale ?? 70,
      fitness: player.fitness ?? 100,
      energy: player.energy ?? 100,
      injured: player.injured ?? false,
      injuryWeeks: player.injuryWeeks ?? 0,
      contractEndSeason: player.contractEndSeason,
      wage: player.wage,
      marketValue: player.marketValue,
      status:
        (player.status as
          | 'active'
          | 'retiring'
          | 'retired'
          | 'deceased'
          | 'suspended') ?? 'active',
      form: {
        form: player.form ?? 70,
        lastFiveRatings: (player.lastFiveRatings as number[]) ?? [],
        seasonGoals: player.seasonGoals ?? 0,
        seasonAssists: player.seasonAssists ?? 0,
        seasonMinutes: player.seasonMinutes ?? 0,
        seasonAvgRating: player.seasonAvgRating ?? 0,
      },
    }));

    const defaultTactics = selectBestLineup(
      {
        ...teamResult[0],
        badgeUrl: undefined,
        momentum: teamResult[0].momentum ?? 50,
        lastFiveResults:
          (teamResult[0].lastFiveResults as ('W' | 'D' | 'L')[]) ?? [],
        players: corePlayers,
      },
      formation,
    );
    lineup = defaultTactics.lineup;
    substitutes = defaultTactics.substitutes;
  }

  // Remove duplicates between lineup and bench.
  const lineupSet = new Set(lineup);
  substitutes = substitutes.filter((id) => !lineupSet.has(id));

  const existing = await db
    .select({ id: tactics.id })
    .from(tactics)
    .where(and(eq(tactics.saveId, saveId), eq(tactics.teamId, teamId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(tactics)
      .set({ formation, posture, lineup, substitutes })
      .where(eq(tactics.id, existing[0].id));
  } else {
    await db.insert(tactics).values({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      saveId,
      teamId,
      formation,
      posture,
      lineup,
      substitutes,
    });
  }

  return c.json({
    success: true,
    tactics: { formation, posture, lineup, substitutes },
    allowedFormations: FORMATION_OPTIONS,
    fallbackFormation: DEFAULT_FORMATION as FormationType,
  });
});

/**
 * Get transactions for a team in a save
 */
saveRoutes.get('/:id/transactions', async (c) => {
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

  const saveId = c.req.param('id');
  const teamId = c.req.query('teamId');
  const db = drizzle(c.env.DB);

  // Verify ownership
  const saveResult = await db
    .select({ userId: saves.userId, playerTeamId: saves.playerTeamId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Use player team if no teamId provided
  const targetTeamId = teamId || saveResult[0].playerTeamId;

  // Get transactions ordered by round descending
  const txns = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      category: transactions.category,
      amount: transactions.amount,
      description: transactions.description,
      round: transactions.round,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.saveId, saveId),
        eq(transactions.teamId, targetTeamId),
      ),
    )
    .orderBy(desc(transactions.round), desc(transactions.createdAt));

  // Group by round
  const byRound: Record<
    number,
    {
      round: number;
      income: {
        category: string;
        amount: number;
        description: string | null;
      }[];
      expenses: {
        category: string;
        amount: number;
        description: string | null;
      }[];
      totalIncome: number;
      totalExpenses: number;
      net: number;
    }
  > = {};

  for (const txn of txns) {
    if (!byRound[txn.round]) {
      byRound[txn.round] = {
        round: txn.round,
        income: [],
        expenses: [],
        totalIncome: 0,
        totalExpenses: 0,
        net: 0,
      };
    }

    const entry = {
      category: txn.category,
      amount: txn.amount,
      description: txn.description,
    };

    if (txn.type === 'income') {
      byRound[txn.round].income.push(entry);
      byRound[txn.round].totalIncome += txn.amount;
    } else {
      byRound[txn.round].expenses.push(entry);
      byRound[txn.round].totalExpenses += txn.amount;
    }
    byRound[txn.round].net =
      byRound[txn.round].totalIncome - byRound[txn.round].totalExpenses;
  }

  // Convert to array sorted by round descending
  const groupedTransactions = Object.values(byRound).sort(
    (a, b) => b.round - a.round,
  );

  return c.json({ transactions: groupedTransactions });
});

/**
 * Get leaderboards (top scorers and top assists) for a save
 */
saveRoutes.get('/:id/leaderboards', async (c) => {
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

  const saveId = c.req.param('id');
  const db = drizzle(c.env.DB);

  // Verify ownership
  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Helper to build leaderboard query for a specific stat
  const buildLeaderboardQuery = (
    statColumn: typeof players.seasonGoals | typeof players.seasonAssists,
  ) =>
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        playerNickname: players.nickname,
        position: players.position,
        teamId: teams.id,
        teamName: teams.name,
        teamShortName: teams.shortName,
        count: statColumn,
      })
      .from(players)
      .innerJoin(teams, eq(players.teamId, teams.id))
      .where(and(eq(players.saveId, saveId), gt(statColumn, 0)))
      .orderBy(desc(statColumn), players.name)
      .limit(10);

  const [topScorers, topAssists] = await Promise.all([
    buildLeaderboardQuery(players.seasonGoals),
    buildLeaderboardQuery(players.seasonAssists),
  ]);

  return c.json({ topScorers, topAssists });
});

/**
 * Delete save
 */
saveRoutes.delete('/:id', async (c) => {
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

  const saveId = c.req.param('id');
  const db = drizzle(c.env.DB);

  // Verify ownership
  const saveResult = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0) {
    return c.json({ error: 'Save not found' }, 404);
  }

  if (saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Delete save (cascades to teams, players, etc.)
  await db.delete(saves).where(eq(saves.id, saveId));

  return c.json({ success: true, deleted: saveId });
});
