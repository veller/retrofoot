// ============================================================================
// Online league world seeding (subset of clubs + round-robin)
// ============================================================================

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  onlineTeams,
  onlinePlayers,
  onlineStandings,
  onlineFixtures,
  onlineLeagueMembers,
  type NewOnlineTeam,
  type NewOnlinePlayer,
  type NewOnlineStanding,
  type NewOnlineFixture,
} from '@retrofoot/db/schema';
import { TEAMS, ALL_PLAYERS, type TeamSeed } from '@retrofoot/core';
import { batchInsertChunked } from './db/batch';

const DEFAULT_SEASON_LABEL = '2026';

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Round-robin schedule (circle method), same shape as offline seed.
 * kickoff_at left null until scheduling UI exists.
 */
function generateOnlineFixtures(
  teamIds: string[],
  leagueId: string,
  seasonLabel: string,
): NewOnlineFixture[] {
  const matches: NewOnlineFixture[] = [];
  const n = teamIds.length;

  const teamsLocal = [...teamIds];
  if (n % 2 !== 0) {
    teamsLocal.push('BYE');
  }

  const numTeams = teamsLocal.length;
  const halfSeasonRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;

  const fixed = teamsLocal[0];
  const rotating = teamsLocal.slice(1);

  const teamVenueHistory = new Map<string, ('H' | 'A')[]>();
  for (const teamId of teamsLocal) {
    if (teamId !== 'BYE') {
      teamVenueHistory.set(teamId, []);
    }
  }

  const canPlayAt = (teamId: string, venue: 'H' | 'A'): boolean => {
    const history = teamVenueHistory.get(teamId) || [];
    if (history.length < 2) return true;
    const last2 = history.slice(-2);
    return !(last2[0] === venue && last2[1] === venue);
  };

  const recordVenue = (teamId: string, venue: 'H' | 'A') => {
    const history = teamVenueHistory.get(teamId) || [];
    history.push(venue);
    teamVenueHistory.set(teamId, history);
  };

  interface HalfFx {
    round: number;
    homeTeamId: string;
    awayTeamId: string;
  }
  const firstHalfFixtures: HalfFx[] = [];

  for (let round = 0; round < halfSeasonRounds; round++) {
    const roundNumber = round + 1;
    const rotation = [fixed, ...rotating];

    for (let match = 0; match < matchesPerRound; match++) {
      const team1 = rotation[match];
      const team2 = rotation[numTeams - 1 - match];

      if (team1 === 'BYE' || team2 === 'BYE') continue;

      let homeTeam: string;
      let awayTeam: string;

      const t1CanHome = canPlayAt(team1, 'H');
      const t1CanAway = canPlayAt(team1, 'A');
      const t2CanHome = canPlayAt(team2, 'H');
      const t2CanAway = canPlayAt(team2, 'A');

      if (!t1CanHome && t2CanHome) {
        homeTeam = team2;
        awayTeam = team1;
      } else if (!t2CanHome && t1CanHome) {
        homeTeam = team1;
        awayTeam = team2;
      } else if (!t1CanAway && t2CanAway) {
        homeTeam = team1;
        awayTeam = team2;
      } else if (!t2CanAway && t1CanAway) {
        homeTeam = team2;
        awayTeam = team1;
      } else {
        [homeTeam, awayTeam] =
          (round + match) % 2 === 0 ? [team1, team2] : [team2, team1];
      }

      recordVenue(homeTeam, 'H');
      recordVenue(awayTeam, 'A');

      firstHalfFixtures.push({
        round: roundNumber,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
      });

      matches.push({
        id: nanoid(),
        leagueId,
        seasonLabel,
        round: roundNumber,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        kickoffAt: null,
        status: 'scheduled',
        played: false,
        homeScore: null,
        awayScore: null,
      });
    }

    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  for (const fixture of firstHalfFixtures) {
    const secondHalfRound = fixture.round + halfSeasonRounds;

    matches.push({
      id: nanoid(),
      leagueId,
      seasonLabel,
      round: secondHalfRound,
      homeTeamId: fixture.awayTeamId,
      awayTeamId: fixture.homeTeamId,
      kickoffAt: null,
      status: 'scheduled',
      played: false,
      homeScore: null,
      awayScore: null,
    });
  }

  return matches;
}

function teamDbId(leagueId: string, templateId: string): string {
  return `${leagueId}-t-${templateId}`;
}

export interface SeedOnlineLeagueResult {
  seasonLabel: string;
  teamCount: number;
  playerCount: number;
  fixtureCount: number;
}

/**
 * Seeds teams, squad players, standings, fixtures; assigns one club per member.
 * Call only for `lobby` leagues with no existing `online_teams` rows.
 */
export async function seedOnlineLeagueWorld(
  db: ReturnType<typeof drizzle>,
  leagueId: string,
  pickedTemplates: TeamSeed[],
): Promise<SeedOnlineLeagueResult> {
  const seasonLabel = DEFAULT_SEASON_LABEL;
  const templateIds = new Set(pickedTemplates.map((t) => t.id));

  const teamIdMap = new Map<string, string>();
  const newTeams: NewOnlineTeam[] = pickedTemplates.map((team) => {
    const dbId = teamDbId(leagueId, team.id);
    teamIdMap.set(team.id, dbId);
    return {
      id: dbId,
      leagueId,
      name: team.name,
      shortName: team.shortName,
      badgeUrl: null,
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

  const newPlayers: NewOnlinePlayer[] = ALL_PLAYERS.filter((p) =>
    templateIds.has(p.teamId),
  ).map((player) => {
    const teamDbIdVal = teamIdMap.get(player.teamId);
    return {
      id: `${leagueId}-p-${player.teamId}-${player.templateId}`,
      leagueId,
      teamId: teamDbIdVal ?? null,
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
      energy: 100,
      injured: false,
      injuryWeeks: 0,
      contractEndSeason: player.contractEndSeason,
      wage: player.wage,
      marketValue: player.marketValue,
    };
  });

  const teamDbIdsForStandings = pickedTemplates.map((t) => teamIdMap.get(t.id)!);
  const newStandings: NewOnlineStanding[] = teamDbIdsForStandings.map(
    (teamDbIdVal, index) => ({
      id: nanoid(),
      leagueId,
      seasonLabel,
      teamId: teamDbIdVal,
      position: index + 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    }),
  );

  const shuffledTeamIds = shuffleArray(teamDbIdsForStandings);
  const fixturesList = generateOnlineFixtures(
    shuffledTeamIds,
    leagueId,
    seasonLabel,
  );

  await batchInsertChunked(db, onlineTeams, newTeams);
  await batchInsertChunked(db, onlinePlayers, newPlayers);
  await batchInsertChunked(db, onlineStandings, newStandings);
  await batchInsertChunked(db, onlineFixtures, fixturesList);

  return {
    seasonLabel,
    teamCount: newTeams.length,
    playerCount: newPlayers.length,
    fixtureCount: fixturesList.length,
  };
}

export async function assignMembersToTeams(
  db: ReturnType<typeof drizzle>,
  leagueId: string,
  memberRows: { id: string; userId: string }[],
  templatesShuffled: TeamSeed[],
): Promise<void> {
  for (let i = 0; i < memberRows.length; i++) {
    const member = memberRows[i]!;
    const template = templatesShuffled[i]!;
    const tid = teamDbId(leagueId, template.id);
    await db
      .update(onlineLeagueMembers)
      .set({ onlineTeamId: tid })
      .where(eq(onlineLeagueMembers.id, member.id));
  }
}

export function pickRandomTeamTemplates(count: number): TeamSeed[] {
  if (count > TEAMS.length) {
    throw new Error(`Cannot seed more than ${TEAMS.length} teams`);
  }
  return shuffleArray([...TEAMS]).slice(0, count);
}

export { DEFAULT_SEASON_LABEL };
