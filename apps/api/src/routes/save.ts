import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, gt } from 'drizzle-orm';
import {
  saves,
  teams,
  players,
  standings,
  transactions,
} from '@retrofoot/db/schema';
import { seedNewGame, getAvailableTeams } from '../lib/seed';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';

// Save management routes
export const saveRoutes = new Hono<{ Bindings: Env }>();

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
  const auth = createAuth(c.env);
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
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

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

  try {
    const result = await seedNewGame(
      db,
      session.user.id,
      body.name,
      body.teamId,
      body.managerName,
    );

    return c.json({
      success: true,
      saveId: result.saveId,
      teamCount: result.teamCount,
      playerCount: result.playerCount,
      message: `Created new save with ${result.teamCount} teams and ${result.playerCount} players`,
    });
  } catch (error) {
    console.error('Failed to create save:', error);
    return c.json({ error: 'Failed to create game save' }, 500);
  }
});

/**
 * Get save details with team and player counts
 */
saveRoutes.get('/:id', async (c) => {
  const auth = createAuth(c.env);
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

  // Get team count
  const teamResult = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.saveId, saveId));

  // Get player count
  const playerResult = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.saveId, saveId));

  // Get player team details
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
    teamCount: teamResult.length,
    playerCount: playerResult.length,
  });
});

/**
 * Get standings for a save
 */
saveRoutes.get('/:id/standings', async (c) => {
  const auth = createAuth(c.env);
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
  const auth = createAuth(c.env);
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
      injured: players.injured,
      form: players.form,
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
    .where(eq(players.teamId, teamId));

  return c.json({ squad });
});

/**
 * Get transactions for a team in a save
 */
saveRoutes.get('/:id/transactions', async (c) => {
  const auth = createAuth(c.env);
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
  const auth = createAuth(c.env);
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
  const auth = createAuth(c.env);
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
