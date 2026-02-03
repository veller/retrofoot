// ============================================================================
// RETROFOOT - Season Routes
// ============================================================================
// Route handlers for season management (summary, advance, history)

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  saves,
  teams,
  players,
  standings,
  fixtures,
  seasonHistory,
  achievements,
  transferListings,
  transferOffers,
} from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';
import {
  getSeasonAwards,
  getRelegatedTeams,
  isTeamRelegated,
  calculateSeasonEndBudget,
  calculateReputationChange,
  getNextSeasonYear,
  generateFixtures,
  initializeStandings,
} from '@retrofoot/core/season';
import { processRetirements } from '@retrofoot/core/player';
import {
  checkAndUnlockAchievements,
  type UnlockedAchievement,
} from '@retrofoot/core/achievements';
import type { Player, Position, StandingEntry } from '@retrofoot/core/types';
import { batchInsertChunked } from '../lib/db/batch';

export const seasonRoutes = new Hono<{ Bindings: Env }>();

// Get season summary after round 38
seasonRoutes.get('/:saveId/summary', async (c) => {
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
    .select()
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const save = saveResult[0];

  // Fetch teams, players, and standings
  const [teamsResult, playersResult, standingsResult] = await Promise.all([
    db.select().from(teams).where(eq(teams.saveId, saveId)),
    db.select().from(players).where(eq(players.saveId, saveId)),
    db
      .select()
      .from(standings)
      .where(
        and(
          eq(standings.saveId, saveId),
          eq(standings.season, save.currentSeason),
        ),
      )
      .orderBy(standings.position),
  ]);

  // Transform players to core type
  const playersWithTeam = playersResult.map((p) => ({
    player: {
      id: p.id,
      name: p.name,
      nickname: p.nickname || undefined,
      age: p.age,
      nationality: p.nationality,
      position: p.position as Position,
      preferredFoot: p.preferredFoot as 'left' | 'right' | 'both',
      attributes: p.attributes as Player['attributes'],
      potential: p.potential,
      morale: p.morale ?? 70,
      fitness: p.fitness ?? 100,
      injured: p.injured ?? false,
      injuryWeeks: p.injuryWeeks ?? 0,
      contractEndSeason: p.contractEndSeason,
      wage: p.wage,
      marketValue: p.marketValue,
      status: (p.status ?? 'active') as Player['status'],
      form: {
        form: p.form ?? 70,
        lastFiveRatings: (p.lastFiveRatings as number[]) ?? [],
        seasonGoals: p.seasonGoals ?? 0,
        seasonAssists: p.seasonAssists ?? 0,
        seasonMinutes: p.seasonMinutes ?? 0,
        seasonAvgRating: p.seasonAvgRating ?? 0,
      },
    } as Player,
    teamId: p.teamId || '',
  }));

  // Transform standings to core type
  const standingsForAwards: StandingEntry[] = standingsResult.map((s) => {
    const team = teamsResult.find((t) => t.id === s.teamId);
    return {
      position: s.position,
      teamId: s.teamId,
      teamName: team?.name || 'Unknown',
      played: s.played ?? 0,
      won: s.won ?? 0,
      drawn: s.drawn ?? 0,
      lost: s.lost ?? 0,
      goalsFor: s.goalsFor ?? 0,
      goalsAgainst: s.goalsAgainst ?? 0,
      goalDifference: (s.goalsFor ?? 0) - (s.goalsAgainst ?? 0),
      points: s.points ?? 0,
    };
  });

  // Get season awards
  const awards = getSeasonAwards(playersWithTeam, standingsForAwards);

  // Get champion team
  const champion = standingsForAwards.find((s) => s.position === 1);
  const championTeam = teamsResult.find((t) => t.id === champion?.teamId);

  // Get relegated teams
  const relegatedTeamIds = getRelegatedTeams(standingsForAwards);
  const relegatedTeams = teamsResult
    .filter((t) => relegatedTeamIds.includes(t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
    }));

  // Get player's team standing
  const playerTeamStanding = standingsForAwards.find(
    (s) => s.teamId === save.playerTeamId,
  );
  const playerTeam = teamsResult.find((t) => t.id === save.playerTeamId);
  const isPlayerRelegated = isTeamRelegated(
    save.playerTeamId,
    standingsForAwards,
  );

  return c.json({
    season: save.currentSeason,
    champion: championTeam
      ? {
          id: championTeam.id,
          name: championTeam.name,
          shortName: championTeam.shortName,
          points: champion?.points || 0,
        }
      : null,
    starPlayer: awards.starPlayer
      ? {
          id: awards.starPlayer.player.id,
          name: awards.starPlayer.player.name,
          teamId: awards.starPlayer.teamId,
          teamName:
            teamsResult.find((t) => t.id === awards.starPlayer?.teamId)?.name ||
            '',
          score: awards.starPlayer.score,
        }
      : null,
    topScorer: awards.topScorer
      ? {
          id: awards.topScorer.player.id,
          name: awards.topScorer.player.name,
          teamId: awards.topScorer.teamId,
          teamName:
            teamsResult.find((t) => t.id === awards.topScorer?.teamId)?.name ||
            '',
          goals: awards.topScorer.goals,
        }
      : null,
    topAssister: awards.topAssister
      ? {
          id: awards.topAssister.player.id,
          name: awards.topAssister.player.name,
          teamId: awards.topAssister.teamId,
          teamName:
            teamsResult.find((t) => t.id === awards.topAssister?.teamId)
              ?.name || '',
          assists: awards.topAssister.assists,
        }
      : null,
    relegatedTeams,
    playerTeam: {
      id: playerTeam?.id || '',
      name: playerTeam?.name || '',
      shortName: playerTeam?.shortName || '',
      position: playerTeamStanding?.position || 0,
      points: playerTeamStanding?.points || 0,
      isRelegated: isPlayerRelegated,
    },
    standings: standingsForAwards,
  });
});

// Advance to next season
seasonRoutes.post('/:saveId/advance', async (c) => {
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
    .select()
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const save = saveResult[0];

  // Fetch all data
  const [teamsResult, playersResult, standingsResult, existingAchievements] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.saveId, saveId)),
      db.select().from(players).where(eq(players.saveId, saveId)),
      db
        .select()
        .from(standings)
        .where(
          and(
            eq(standings.saveId, saveId),
            eq(standings.season, save.currentSeason),
          ),
        )
        .orderBy(standings.position),
      db.select().from(achievements).where(eq(achievements.saveId, saveId)),
    ]);

  // Transform standings
  const standingsForAwards: StandingEntry[] = standingsResult.map((s) => {
    const team = teamsResult.find((t) => t.id === s.teamId);
    return {
      position: s.position,
      teamId: s.teamId,
      teamName: team?.name || 'Unknown',
      played: s.played ?? 0,
      won: s.won ?? 0,
      drawn: s.drawn ?? 0,
      lost: s.lost ?? 0,
      goalsFor: s.goalsFor ?? 0,
      goalsAgainst: s.goalsAgainst ?? 0,
      goalDifference: (s.goalsFor ?? 0) - (s.goalsAgainst ?? 0),
      points: s.points ?? 0,
    };
  });

  // Check if player is relegated (game over)
  const playerTeamStanding = standingsForAwards.find(
    (s) => s.teamId === save.playerTeamId,
  );
  const isPlayerRelegated = isTeamRelegated(
    save.playerTeamId,
    standingsForAwards,
  );

  if (isPlayerRelegated) {
    // Mark save as game over
    await db
      .update(saves)
      .set({
        gameOver: true,
        gameOverReason: 'relegated',
        updatedAt: new Date(),
      })
      .where(eq(saves.id, saveId));

    return c.json({
      success: false,
      gameOver: true,
      reason: 'relegated',
      message: 'Your team has been relegated. Game over!',
    });
  }

  // Transform players for core functions
  const playersWithTeam = playersResult.map((p) => ({
    player: {
      id: p.id,
      name: p.name,
      nickname: p.nickname || undefined,
      age: p.age,
      nationality: p.nationality,
      position: p.position as Position,
      preferredFoot: p.preferredFoot as 'left' | 'right' | 'both',
      attributes: p.attributes as Player['attributes'],
      potential: p.potential,
      morale: p.morale ?? 70,
      fitness: p.fitness ?? 100,
      injured: p.injured ?? false,
      injuryWeeks: p.injuryWeeks ?? 0,
      contractEndSeason: p.contractEndSeason,
      wage: p.wage,
      marketValue: p.marketValue,
      status: (p.status ?? 'active') as Player['status'],
      form: {
        form: p.form ?? 70,
        lastFiveRatings: (p.lastFiveRatings as number[]) ?? [],
        seasonGoals: p.seasonGoals ?? 0,
        seasonAssists: p.seasonAssists ?? 0,
        seasonMinutes: p.seasonMinutes ?? 0,
        seasonAvgRating: p.seasonAvgRating ?? 0,
      },
    } as Player,
    teamId: p.teamId || '',
  }));

  // Get season awards for history
  const awards = getSeasonAwards(playersWithTeam, standingsForAwards);
  const champion = standingsForAwards.find((s) => s.position === 1);
  const championTeam = teamsResult.find((t) => t.id === champion?.teamId);

  // Save season to history
  const historyEntry = {
    id: nanoid(),
    saveId,
    seasonYear: save.currentSeason,
    championTeamId: champion?.teamId || '',
    championTeamName: championTeam?.name || '',
    starPlayerId: awards.starPlayer?.player.id || '',
    starPlayerName: awards.starPlayer?.player.name || '',
    topScorerId: awards.topScorer?.player.id || '',
    topScorerName: awards.topScorer?.player.name || '',
    topScorerGoals: awards.topScorer?.goals || 0,
    topAssisterId: awards.topAssister?.player.id || '',
    topAssisterName: awards.topAssister?.player.name || '',
    topAssisterAssists: awards.topAssister?.assists || 0,
    playerTeamId: save.playerTeamId,
    playerTeamPosition: playerTeamStanding?.position || 0,
    playerTeamPoints: playerTeamStanding?.points || 0,
    playerTeamRelegated: false,
    relegatedTeamIds: getRelegatedTeams(standingsForAwards),
    completedAt: new Date(),
  };

  await db.insert(seasonHistory).values(historyEntry);

  // Count completed seasons and titles
  const previousHistory = await db
    .select()
    .from(seasonHistory)
    .where(eq(seasonHistory.saveId, saveId));

  const seasonCount = previousHistory.length;
  const titleCount = previousHistory.filter(
    (h) => h.playerTeamId === h.championTeamId,
  ).length;

  // Transform existing achievements
  const existingUnlocked: UnlockedAchievement[] = existingAchievements.map(
    (a) => ({
      key: a.key,
      type: a.type as UnlockedAchievement['type'],
      value: a.value || undefined,
      seasonYear: a.seasonYear || undefined,
      unlockedAt: new Date(a.unlockedAt),
    }),
  );

  // Get player's top scorer goals for records
  const playerTeamPlayers = playersWithTeam.filter(
    (p) => p.teamId === save.playerTeamId,
  );
  const topPlayerScorer = playerTeamPlayers.reduce(
    (max, p) =>
      p.player.form.seasonGoals > max ? p.player.form.seasonGoals : max,
    0,
  );

  // Check for new achievements
  const newAchievements = checkAndUnlockAchievements(
    {
      position: playerTeamStanding?.position || 20,
      points: playerTeamStanding?.points || 0,
      totalMatches: seasonCount * 38, // Approximate
      totalWins: Math.round(
        (playerTeamStanding?.won || 0) + (seasonCount - 1) * 15,
      ), // Approximate
      topScorerGoals: topPlayerScorer,
      winStreak: 0, // Would need to track this
      unbeatenRun: 0, // Would need to track this
      seasonCount,
      titleCount: titleCount + (playerTeamStanding?.position === 1 ? 1 : 0),
    },
    existingUnlocked,
    save.currentSeason,
  );

  // Save new achievements
  if (newAchievements.length > 0) {
    await batchInsertChunked(
      db,
      achievements,
      newAchievements.map((a) => ({
        id: nanoid(),
        saveId,
        type: a.type,
        key: a.key,
        value: a.value || null,
        seasonYear: a.seasonYear || null,
        unlockedAt: a.unlockedAt,
      })),
    );
  }

  // Process team budget and reputation changes
  const teamUpdates: Promise<void>[] = [];
  for (const team of teamsResult) {
    const standing = standingsForAwards.find((s) => s.teamId === team.id);
    if (!standing) continue;

    const budgetInfo = calculateSeasonEndBudget(
      team.budget,
      standing.position,
      team.reputation,
    );
    const newReputation = calculateReputationChange(
      team.reputation,
      standing.position,
    );

    teamUpdates.push(
      db
        .update(teams)
        .set({
          budget: budgetInfo.newBudget,
          reputation: newReputation,
          momentum: 50, // Reset momentum
          lastFiveResults: [],
          seasonRevenue: 0,
          seasonExpenses: 0,
        })
        .where(eq(teams.id, team.id))
        .then(() => {}),
    );
  }

  await Promise.all(teamUpdates);

  // Process player aging and retirements
  const playersByTeam = new Map<string, Player[]>();
  for (const { player, teamId } of playersWithTeam) {
    const existing = playersByTeam.get(teamId) || [];
    existing.push(player);
    playersByTeam.set(teamId, existing);
  }

  const allRetiredPlayerIds: string[] = [];
  const allNewYouthPlayers: Array<{
    player: Player;
    teamId: string;
  }> = [];

  // Process each team's players
  for (const team of teamsResult) {
    const teamPlayers = playersByTeam.get(team.id) || [];
    const { retiredPlayers, newYouthPlayers } = processRetirements(
      teamPlayers,
      team.id,
      team.reputation,
    );

    allRetiredPlayerIds.push(...retiredPlayers.map((p) => p.id));
    allNewYouthPlayers.push(
      ...newYouthPlayers.map((p) => ({ player: p, teamId: team.id })),
    );
  }

  // Update retired players in DB
  if (allRetiredPlayerIds.length > 0) {
    await c.env.DB.batch(
      allRetiredPlayerIds.map((playerId) =>
        c.env.DB.prepare(
          "UPDATE players SET status = 'retired' WHERE id = ?",
        ).bind(playerId),
      ),
    );
  }

  // Age remaining players and reset their stats
  await c.env.DB.batch([
    c.env.DB.prepare(
      `
      UPDATE players
      SET age = age + 1,
          season_goals = 0,
          season_assists = 0,
          season_minutes = 0,
          season_avg_rating = 0,
          fitness = 100,
          injured = 0,
          injury_weeks = 0
      WHERE save_id = ? AND status != 'retired'
    `,
    ).bind(saveId),
  ]);

  // Insert new youth players
  if (allNewYouthPlayers.length > 0) {
    await batchInsertChunked(
      db,
      players,
      allNewYouthPlayers.map(({ player, teamId }) => ({
        id: player.id,
        saveId,
        teamId,
        name: player.name,
        nickname: player.nickname || null,
        age: player.age,
        nationality: player.nationality,
        position: player.position,
        preferredFoot: player.preferredFoot,
        attributes: player.attributes,
        potential: player.potential,
        morale: player.morale,
        fitness: player.fitness,
        injured: player.injured,
        injuryWeeks: player.injuryWeeks,
        contractEndSeason: player.contractEndSeason,
        wage: player.wage,
        marketValue: player.marketValue,
        status: player.status,
        form: player.form.form,
        lastFiveRatings: player.form.lastFiveRatings,
        seasonGoals: 0,
        seasonAssists: 0,
        seasonMinutes: 0,
        seasonAvgRating: 0,
      })),
    );
  }

  // Clear transfer market (close window)
  await Promise.all([
    db.delete(transferListings).where(eq(transferListings.saveId, saveId)),
    db.delete(transferOffers).where(eq(transferOffers.saveId, saveId)),
  ]);

  // Generate new season fixtures
  const nextSeason = getNextSeasonYear(save.currentSeason);
  const teamsForFixtures = teamsResult.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    stadium: t.stadium,
    capacity: t.capacity,
    reputation: t.reputation,
    budget: t.budget,
    wageBudget: t.wageBudget,
    players: [],
    momentum: 50,
    lastFiveResults: [] as ('W' | 'D' | 'L')[],
  }));

  const newFixtures = generateFixtures(teamsForFixtures, nextSeason);

  // Delete old fixtures and create new ones
  await db.delete(fixtures).where(eq(fixtures.saveId, saveId));

  await batchInsertChunked(
    db,
    fixtures,
    newFixtures.map((f) => ({
      id: nanoid(),
      saveId,
      season: nextSeason,
      round: f.round,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      date: f.date,
      played: false,
      homeScore: null,
      awayScore: null,
    })),
  );

  // Reset standings
  await db
    .delete(standings)
    .where(
      and(
        eq(standings.saveId, saveId),
        eq(standings.season, save.currentSeason),
      ),
    );

  const newStandings = initializeStandings(teamsForFixtures);
  await batchInsertChunked(
    db,
    standings,
    newStandings.map((s) => ({
      id: nanoid(),
      saveId,
      season: nextSeason,
      teamId: s.teamId,
      position: s.position,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    })),
  );

  // Update save to new season
  await db
    .update(saves)
    .set({
      currentSeason: nextSeason,
      currentRound: 1,
      updatedAt: new Date(),
    })
    .where(eq(saves.id, saveId));

  return c.json({
    success: true,
    newSeason: nextSeason,
    retirements: allRetiredPlayerIds.length,
    youthPlayersAdded: allNewYouthPlayers.length,
    newAchievements: newAchievements.map((a) => a.key),
  });
});

// Get season history
seasonRoutes.get('/:saveId/history', async (c) => {
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
    .select({ userId: saves.userId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Get all season history entries
  const history = await db
    .select()
    .from(seasonHistory)
    .where(eq(seasonHistory.saveId, saveId))
    .orderBy(desc(seasonHistory.completedAt));

  return c.json({
    history: history.map((h) => ({
      seasonYear: h.seasonYear,
      champion: {
        teamId: h.championTeamId,
        teamName: h.championTeamName,
      },
      starPlayer: {
        playerId: h.starPlayerId,
        playerName: h.starPlayerName,
      },
      topScorer: {
        playerId: h.topScorerId,
        playerName: h.topScorerName,
        goals: h.topScorerGoals,
      },
      topAssister: {
        playerId: h.topAssisterId,
        playerName: h.topAssisterName,
        assists: h.topAssisterAssists,
      },
      playerTeam: {
        teamId: h.playerTeamId,
        position: h.playerTeamPosition,
        points: h.playerTeamPoints,
        relegated: h.playerTeamRelegated,
      },
      relegatedTeamIds: h.relegatedTeamIds,
      completedAt: h.completedAt,
    })),
  });
});
