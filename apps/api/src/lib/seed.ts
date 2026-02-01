// ============================================================================
// RETROFOOT - Game Seeding
// ============================================================================
// Creates initial game state when a user starts a new save

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
  saves,
  teams,
  players,
  standings,
  fixtures,
  type NewSave,
  type NewTeam,
  type NewPlayer,
  type NewStanding,
  type NewFixture,
} from '@retrofoot/db/schema';
import { TEAMS, ALL_PLAYERS, calculateInitialBalance } from '@retrofoot/core';

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate round-robin fixtures for a season using the circle method
 * Ensures each team plays exactly once per round
 * Returns (N-1)*2 rounds for N teams (home and away)
 */
function generateFixtures(
  teamIds: string[],
  saveId: string,
  season: string,
): NewFixture[] {
  const matches: NewFixture[] = [];
  const n = teamIds.length;

  // Handle odd number of teams by adding a BYE placeholder
  const teams = [...teamIds];
  if (n % 2 !== 0) {
    teams.push('BYE');
  }

  const numTeams = teams.length;
  const rounds = (numTeams - 1) * 2; // Home and away
  const matchesPerRound = numTeams / 2;

  // Circle method: fix first team, rotate the rest
  const fixed = teams[0];
  const rotating = teams.slice(1);

  for (let round = 0; round < rounds; round++) {
    const isSecondHalf = round >= numTeams - 1;
    const roundNumber = round + 1;

    // Create rotation for this round
    const rotation = [fixed, ...rotating];

    for (let match = 0; match < matchesPerRound; match++) {
      const home = rotation[match];
      const away = rotation[numTeams - 1 - match];

      // Skip bye matches
      if (home === 'BYE' || away === 'BYE') continue;

      // Swap home/away for second half of season
      const [homeTeam, awayTeam] = isSecondHalf ? [away, home] : [home, away];

      // Calculate date (one round per week, starting April)
      const startMonth = isSecondHalf ? 8 : 4; // August for second half, April for first
      const roundInHalf = isSecondHalf ? round - (numTeams - 1) : round;
      const monthOffset = Math.floor(roundInHalf / 4);
      const dayOffset = (roundInHalf % 4) * 7 + 1;

      matches.push({
        id: generateId(),
        saveId,
        season,
        round: roundNumber,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        date: `2026-${String(startMonth + monthOffset).padStart(2, '0')}-${String(dayOffset).padStart(2, '0')}`,
        played: false,
      });
    }

    // Rotate teams (keep first fixed)
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  return matches;
}

/**
 * Seeds a new game with all teams and players
 */
export async function seedNewGame(
  db: ReturnType<typeof drizzle>,
  userId: string,
  saveName: string,
  playerTeamId: string,
  managerName: string,
): Promise<{ saveId: string; teamCount: number; playerCount: number }> {
  const saveId = generateId();
  const season = '2026';

  // 1. Create the save record
  const newSave: NewSave = {
    id: saveId,
    userId,
    name: saveName,
    playerTeamId: `${saveId}-${playerTeamId}`, // Will be updated after team creation
    managerName,
    managerReputation: 50,
    currentSeason: season,
    currentRound: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(saves).values(newSave);

  // 2. Create all teams
  const teamIdMap = new Map<string, string>(); // templateId -> dbId

  // Pre-calculate wages per team from player data
  const teamWagesMap = new Map<string, number>();
  for (const player of ALL_PLAYERS) {
    const currentWages = teamWagesMap.get(player.teamId) || 0;
    teamWagesMap.set(player.teamId, currentWages + player.wage);
  }

  const newTeams: NewTeam[] = TEAMS.map((team) => {
    const dbId = `${saveId}-${team.id}`;
    teamIdMap.set(team.id, dbId);

    // Calculate round wages from actual player wages
    const roundWages = teamWagesMap.get(team.id) || 0;

    // Calculate initial balance based on wage buffer + working capital
    const initialBalance = calculateInitialBalance(team.budget, roundWages);

    return {
      id: dbId,
      saveId,
      name: team.name,
      shortName: team.shortName,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      stadium: team.stadium,
      capacity: team.capacity,
      reputation: team.reputation,
      budget: team.budget,
      wageBudget: team.wageBudget,
      momentum: 50,
      lastFiveResults: [],
      // Financial fields
      balance: initialBalance,
      roundWages: roundWages,
      seasonRevenue: 0,
      seasonExpenses: 0,
    };
  });

  // Insert teams one by one to avoid any SQLite limit issues
  for (const team of newTeams) {
    await db.insert(teams).values(team);
  }

  // Update the save with the correct player team ID
  const playerTeamDbId = teamIdMap.get(playerTeamId);
  if (playerTeamDbId) {
    await db
      .update(saves)
      .set({ playerTeamId: playerTeamDbId })
      .where(eq(saves.id, saveId));
  }

  // 3. Create all players
  const newPlayers: NewPlayer[] = ALL_PLAYERS.map((player) => {
    const teamDbId = teamIdMap.get(player.teamId);

    return {
      id: `${saveId}-${player.teamId}-${player.templateId}`,
      saveId,
      teamId: teamDbId || null,
      name: player.name,
      nickname: player.nickname,
      age: player.age,
      nationality: player.nationality,
      position: player.position,
      preferredFoot: player.preferredFoot,
      attributes: player.attributes,
      potential: player.potential,
      morale: 70,
      fitness: 100,
      injured: false,
      injuryWeeks: 0,
      contractEndSeason: player.contractEndSeason,
      wage: player.wage,
      marketValue: player.marketValue,
      status: player.status,
      form: player.form.form,
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 0,
      seasonAvgRating: 0,
    };
  });

  // Insert players one by one to avoid SQLite limit issues
  for (const player of newPlayers) {
    await db.insert(players).values(player);
  }

  // 4. Create standings for all teams
  const newStandings: NewStanding[] = TEAMS.map((team, index) => ({
    id: `${saveId}-standing-${team.id}`,
    saveId,
    season,
    teamId: teamIdMap.get(team.id)!,
    position: index + 1,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));

  // Insert standings one by one
  for (const standing of newStandings) {
    await db.insert(standings).values(standing);
  }

  // 5. Generate fixtures
  // Shuffle team IDs before generating fixtures for balanced home/away distribution
  const teamDbIds = shuffleArray(Array.from(teamIdMap.values()));
  const fixturesList = generateFixtures(teamDbIds, saveId, season);

  // Insert fixtures one by one
  for (const fixture of fixturesList) {
    await db.insert(fixtures).values(fixture);
  }

  return {
    saveId,
    teamCount: newTeams.length,
    playerCount: newPlayers.length,
  };
}

/**
 * Get available teams for selection when creating a new game
 */
export function getAvailableTeams() {
  return TEAMS.map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    reputation: team.reputation,
  }));
}
