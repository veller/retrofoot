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
import { TEAMS, ALL_PLAYERS } from '@retrofoot/core';

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate round-robin fixtures for a season
 * Returns 38 rounds (home and away for each team pair)
 */
function generateFixtures(
  teamIds: string[],
  saveId: string,
  season: string,
): NewFixture[] {
  const matches: NewFixture[] = [];
  let round = 1;

  // Simple round-robin for 20 teams
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      // First leg
      matches.push({
        id: generateId(),
        saveId,
        season,
        round: round,
        homeTeamId: teamIds[i],
        awayTeamId: teamIds[j],
        date: `2026-${String(4 + Math.floor((round - 1) / 4)).padStart(2, '0')}-${String(1 + ((round - 1) % 4) * 7).padStart(2, '0')}`,
        played: false,
      });

      // Second leg
      matches.push({
        id: generateId(),
        saveId,
        season,
        round: round + 19, // Second half of season
        homeTeamId: teamIds[j],
        awayTeamId: teamIds[i],
        date: `2026-${String(8 + Math.floor((round - 1) / 4)).padStart(2, '0')}-${String(1 + ((round - 1) % 4) * 7).padStart(2, '0')}`,
        played: false,
      });

      round++;
      if (round > 19) round = 1; // Reset for next batch
    }
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

  const newTeams: NewTeam[] = TEAMS.map((team) => {
    const dbId = `${saveId}-${team.id}`;
    teamIdMap.set(team.id, dbId);

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
  const teamDbIds = Array.from(teamIdMap.values());
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
