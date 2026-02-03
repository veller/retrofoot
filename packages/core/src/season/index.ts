// ============================================================================
// RETROFOOT - Season System
// ============================================================================
// Season management, fixtures, standings, calendar

import type {
  Team,
  Season,
  Fixture,
  StandingEntry,
  MatchResult,
  Player,
} from '../types';
import { createDefaultForm, calculateOverall } from '../types';
import { simulateMatch } from '../match';
import { createDefaultTactics } from '../team';
import { shouldRetire } from '../player';

// Generate round-robin fixtures for a league
// Uses circle method and ensures no team has more than 2 consecutive home/away games
export function generateFixtures(teams: Team[], seasonYear: string): Fixture[] {
  const n = teams.length;
  const fixtures: Fixture[] = [];

  // If odd number of teams, add a "bye" placeholder
  const teamIds = teams.map((t) => t.id);
  if (n % 2 !== 0) {
    teamIds.push('BYE');
  }

  const numTeams = teamIds.length;
  const halfSeasonRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;

  // Circle method: fix first team, rotate the rest
  const fixed = teamIds[0];
  const rotating = teamIds.slice(1);

  // Track each team's venue history to enforce max 2 consecutive
  const teamVenueHistory = new Map<string, ('H' | 'A')[]>();
  for (const teamId of teamIds) {
    if (teamId !== 'BYE') {
      teamVenueHistory.set(teamId, []);
    }
  }

  // Helper to check if a team can play at a venue
  const canPlayAt = (teamId: string, venue: 'H' | 'A'): boolean => {
    const history = teamVenueHistory.get(teamId) || [];
    if (history.length < 2) return true;
    const last2 = history.slice(-2);
    return !(last2[0] === venue && last2[1] === venue);
  };

  // Helper to record a venue
  const recordVenue = (teamId: string, venue: 'H' | 'A') => {
    const history = teamVenueHistory.get(teamId) || [];
    history.push(venue);
    teamVenueHistory.set(teamId, history);
  };

  // Generate first half fixtures
  const firstHalfFixtures: Fixture[] = [];

  for (let round = 0; round < halfSeasonRounds; round++) {
    // Create rotation for this round
    const rotation = [fixed, ...rotating];

    for (let match = 0; match < matchesPerRound; match++) {
      const team1 = rotation[match];
      const team2 = rotation[numTeams - 1 - match];

      // Skip bye matches
      if (team1 === 'BYE' || team2 === 'BYE') continue;

      // Determine home/away based on constraints
      let homeTeam: string, awayTeam: string;

      const t1CanHome = canPlayAt(team1, 'H');
      const t1CanAway = canPlayAt(team1, 'A');
      const t2CanHome = canPlayAt(team2, 'H');
      const t2CanAway = canPlayAt(team2, 'A');

      if (!t1CanHome && t2CanHome) {
        // team1 must be away
        homeTeam = team2;
        awayTeam = team1;
      } else if (!t2CanHome && t1CanHome) {
        // team2 must be away
        homeTeam = team1;
        awayTeam = team2;
      } else if (!t1CanAway && t2CanAway) {
        // team1 must be home
        homeTeam = team1;
        awayTeam = team2;
      } else if (!t2CanAway && t1CanAway) {
        // team2 must be home
        homeTeam = team2;
        awayTeam = team1;
      } else {
        // No constraints - use round+match parity for variation
        [homeTeam, awayTeam] =
          (round + match) % 2 === 0 ? [team1, team2] : [team2, team1];
      }

      // Record venues
      recordVenue(homeTeam, 'H');
      recordVenue(awayTeam, 'A');

      // Calculate date (one round per week, starting August)
      const startDate = new Date(`${seasonYear.split('/')[0]}-08-01`);
      startDate.setDate(startDate.getDate() + round * 7);

      firstHalfFixtures.push({
        id: `fixture-${round + 1}-${match + 1}`,
        round: round + 1,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        date: startDate.toISOString(),
        played: false,
      });
    }

    // Rotate teams (keep first fixed)
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  // Add first half to fixtures
  fixtures.push(...firstHalfFixtures);

  // Generate second half by swapping home/away from first half
  for (const fixture of firstHalfFixtures) {
    const secondHalfRound = fixture.round + halfSeasonRounds;

    // Calculate date for second half
    const startDate = new Date(`${seasonYear.split('/')[0]}-08-01`);
    startDate.setDate(startDate.getDate() + (secondHalfRound - 1) * 7);

    fixtures.push({
      id: `fixture-${secondHalfRound}-${fixture.id.split('-')[2]}`,
      round: secondHalfRound,
      homeTeamId: fixture.awayTeamId, // Swap home/away
      awayTeamId: fixture.homeTeamId,
      date: startDate.toISOString(),
      played: false,
    });
  }

  return fixtures;
}

// Initialize standings for a new season
export function initializeStandings(teams: Team[]): StandingEntry[] {
  return teams.map((team, index) => ({
    position: index + 1,
    teamId: team.id,
    teamName: team.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
}

// Update standings after a match
export function updateStandings(
  standings: StandingEntry[],
  result: MatchResult,
): StandingEntry[] {
  const updated = standings.map((entry) => ({ ...entry }));

  const homeEntry = updated.find((e) => e.teamId === result.homeTeamId);
  const awayEntry = updated.find((e) => e.teamId === result.awayTeamId);

  if (!homeEntry || !awayEntry) return standings;

  // Update home team
  homeEntry.played += 1;
  homeEntry.goalsFor += result.homeScore;
  homeEntry.goalsAgainst += result.awayScore;

  // Update away team
  awayEntry.played += 1;
  awayEntry.goalsFor += result.awayScore;
  awayEntry.goalsAgainst += result.homeScore;

  // Determine winner
  if (result.homeScore > result.awayScore) {
    homeEntry.won += 1;
    homeEntry.points += 3;
    awayEntry.lost += 1;
  } else if (result.homeScore < result.awayScore) {
    awayEntry.won += 1;
    awayEntry.points += 3;
    homeEntry.lost += 1;
  } else {
    homeEntry.drawn += 1;
    homeEntry.points += 1;
    awayEntry.drawn += 1;
    awayEntry.points += 1;
  }

  // Update goal differences
  homeEntry.goalDifference = homeEntry.goalsFor - homeEntry.goalsAgainst;
  awayEntry.goalDifference = awayEntry.goalsFor - awayEntry.goalsAgainst;

  // Sort standings by: points, goal difference, goals for
  updated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });

  // Update positions
  updated.forEach((entry, index) => {
    entry.position = index + 1;
  });

  return updated;
}

// Simulate all matches in a round (for AI-controlled teams)
export function simulateRound(
  season: Season,
  teams: Team[],
  playerTeamId: string,
): { season: Season; results: MatchResult[] } {
  const round = season.currentRound;
  const roundFixtures = season.fixtures.filter(
    (f) => f.round === round && !f.played,
  );

  const results: MatchResult[] = [];
  let updatedStandings = [...season.standings];
  const updatedFixtures = [...season.fixtures];

  for (const fixture of roundFixtures) {
    // Skip player's match - they need to play it manually
    if (
      fixture.homeTeamId === playerTeamId ||
      fixture.awayTeamId === playerTeamId
    ) {
      continue;
    }

    const homeTeam = teams.find((t) => t.id === fixture.homeTeamId);
    const awayTeam = teams.find((t) => t.id === fixture.awayTeamId);

    if (!homeTeam || !awayTeam) continue;

    // Simulate the match
    const result = simulateMatch({
      homeTeam,
      awayTeam,
      homeTactics: createDefaultTactics(homeTeam),
      awayTactics: createDefaultTactics(awayTeam),
    });

    results.push(result);
    updatedStandings = updateStandings(updatedStandings, result);

    // Update fixture
    const fixtureIndex = updatedFixtures.findIndex((f) => f.id === fixture.id);
    if (fixtureIndex !== -1) {
      updatedFixtures[fixtureIndex] = {
        ...updatedFixtures[fixtureIndex],
        played: true,
        result,
      };
    }
  }

  return {
    season: {
      ...season,
      standings: updatedStandings,
      fixtures: updatedFixtures,
    },
    results,
  };
}

// Check if season is complete
export function isSeasonComplete(season: Season): boolean {
  return season.fixtures.every((f) => f.played);
}

// Get current round's fixtures
export function getCurrentRoundFixtures(season: Season): Fixture[] {
  return season.fixtures.filter((f) => f.round === season.currentRound);
}

// Advance to next round
export function advanceRound(season: Season): Season {
  const currentRoundFixtures = getCurrentRoundFixtures(season);
  const allPlayed = currentRoundFixtures.every((f) => f.played);

  if (!allPlayed) {
    throw new Error(
      'Cannot advance: not all matches in current round are played',
    );
  }

  return {
    ...season,
    currentRound: season.currentRound + 1,
  };
}

// Create a new season
export function createSeason(teams: Team[], year: string): Season {
  const fixtures = generateFixtures(teams, year);
  const totalRounds = Math.max(...fixtures.map((f) => f.round));

  return {
    year,
    currentRound: 1,
    totalRounds,
    standings: initializeStandings(teams),
    fixtures,
    transferWindowOpen: false,
  };
}

// Get promotion/relegation positions
export function getPromotionRelegationPositions(leagueSize: number): {
  promotion: number[];
  relegation: number[];
} {
  // Top 4 get promoted (or qualify for continental competition)
  const promotion = [1, 2, 3, 4];

  // Bottom 4 get relegated
  const relegation = Array.from(
    { length: 4 },
    (_, i) => leagueSize - i,
  ).reverse();

  return { promotion, relegation };
}

// ============================================================================
// SEASON END PROCESSING
// ============================================================================

// Process all players at the end of a season
// - Age all players by 1 year
// - Reset season stats
// - Check for retirements
export function processSeasonEnd(players: Player[]): {
  updatedPlayers: Player[];
  retirements: Player[];
} {
  const updatedPlayers: Player[] = [];
  const retirements: Player[] = [];

  for (const player of players) {
    const updated: Player = {
      ...player,
      attributes: { ...player.attributes },
      form: { ...player.form },
    };

    // Age the player
    updated.age += 1;

    // Reset season stats
    updated.form = {
      ...createDefaultForm(),
      form: updated.form.form, // Keep current form level
    };

    // Check for retirement (age 33+)
    if (shouldRetire(updated)) {
      updated.status = 'retiring';
      retirements.push(updated);
    }

    updatedPlayers.push(updated);
  }

  return { updatedPlayers, retirements };
}

// Get the next season year string
export function getNextSeasonYear(currentYear: string): string {
  // Parse "2024/25" format
  const parts = currentYear.split('/');
  if (parts.length !== 2) {
    // Fallback
    const year = parseInt(currentYear, 10) || 2024;
    return `${year + 1}/${(year + 2).toString().slice(-2)}`;
  }

  const startYear = parseInt(parts[0], 10);
  const nextStart = startYear + 1;
  const nextEnd = (nextStart + 1).toString().slice(-2);

  return `${nextStart}/${nextEnd}`;
}

// ============================================================================
// COMPLETE SEASON END PROCESSING
// ============================================================================

/**
 * Calculate the prize money and TV rights bonus based on final league position
 */
export function calculateSeasonEndBudget(
  currentBudget: number,
  finalPosition: number,
  teamReputation: number,
): {
  prizeMoney: number;
  tvRights: number;
  totalBonus: number;
  newBudget: number;
} {
  // Prize money tiers (champion gets most)
  const prizeMoneyTiers: Record<number, number> = {
    1: 50_000_000, // Champion
    2: 35_000_000,
    3: 25_000_000,
    4: 20_000_000, // Top 4
    5: 15_000_000,
    6: 12_000_000,
    7: 10_000_000,
    8: 8_000_000, // Top 8
    9: 6_000_000,
    10: 5_000_000,
    // Bottom 10 get less
  };

  // Default prize money for positions 11-20
  const prizeMoney =
    prizeMoneyTiers[finalPosition] ||
    Math.max(2_000_000, 5_000_000 - (finalPosition - 10) * 500_000);

  // TV rights based on reputation (better teams get more exposure)
  const tvRights = Math.floor(teamReputation * 100_000);

  const totalBonus = prizeMoney + tvRights;
  const newBudget = currentBudget + totalBonus;

  return {
    prizeMoney,
    tvRights,
    totalBonus,
    newBudget,
  };
}

/**
 * Calculate reputation change based on final league position
 */
export function calculateReputationChange(
  currentReputation: number,
  finalPosition: number,
): number {
  let change = 0;

  if (finalPosition === 1) {
    change = 5; // Champion
  } else if (finalPosition <= 4) {
    change = 3; // Top 4
  } else if (finalPosition <= 8) {
    change = 1; // Top 8
  } else if (finalPosition >= 17) {
    change = -3; // Bottom 4 (relegated zone)
  }

  // Apply change and clamp to 1-100
  const newReputation = Math.max(1, Math.min(100, currentReputation + change));
  return newReputation;
}

/**
 * Get the relegated team IDs (positions 17-20)
 */
export function getRelegatedTeams(standings: StandingEntry[]): string[] {
  return standings.filter((s) => s.position >= 17).map((s) => s.teamId);
}

/**
 * Check if a team was relegated
 */
export function isTeamRelegated(
  teamId: string,
  standings: StandingEntry[],
): boolean {
  const standing = standings.find((s) => s.teamId === teamId);
  return standing ? standing.position >= 17 : false;
}

/**
 * Reset team for new season (momentum, form, financial trackers)
 */
export function resetTeamForNewSeason(team: Team): Team {
  return {
    ...team,
    momentum: 50, // Reset to neutral
    lastFiveResults: [], // Clear results
    seasonRevenue: 0,
    seasonExpenses: 0,
  };
}

/**
 * Reset player stats for new season (preserves form level)
 */
export function resetPlayerForNewSeason(player: Player): Player {
  return {
    ...player,
    form: {
      ...createDefaultForm(),
      form: player.form.form, // Keep current form level
    },
    fitness: 100, // Full fitness at season start
    injured: false,
    injuryWeeks: 0,
  };
}

/**
 * Get current contract end year number from season string
 */
export function getSeasonEndYear(seasonYear: string): number {
  // Parse "2024/25" to get end year (2025)
  const parts = seasonYear.split('/');
  if (parts.length !== 2) {
    return parseInt(seasonYear, 10) || 2025;
  }

  const startYear = parseInt(parts[0], 10);
  return startYear + 1;
}

/**
 * Process contract expirations and auto-renewals
 */
export function processContracts(
  players: Player[],
  currentSeasonYear: string,
): {
  renewedPlayers: Player[];
  releasedPlayers: Player[];
  updatedPlayers: Player[];
} {
  const currentEndYear = getSeasonEndYear(currentSeasonYear);
  const renewedPlayers: Player[] = [];
  const releasedPlayers: Player[] = [];
  const updatedPlayers: Player[] = [];

  for (const player of players) {
    // Check if contract expires at end of this season
    if (player.contractEndSeason <= currentEndYear) {
      // Auto-renew if player is good enough and young enough
      const overall = calculateOverall(player);
      if (overall >= 65 && player.age < 33) {
        // Renew for 2-3 years
        const renewalYears = player.age < 28 ? 3 : 2;
        const renewed: Player = {
          ...player,
          contractEndSeason: currentEndYear + renewalYears,
        };
        renewedPlayers.push(renewed);
        updatedPlayers.push(renewed);
      } else {
        // Release player (contract expired)
        releasedPlayers.push(player);
      }
    } else {
      updatedPlayers.push(player);
    }
  }

  return { renewedPlayers, releasedPlayers, updatedPlayers };
}

// Re-export star player functions
export {
  calculateStarPlayerScore,
  selectStarPlayer,
  selectTopScorer,
  selectTopAssister,
  getSeasonAwards,
} from './star-player';

// Re-export enhanced player functions
export {
  calculateRetirementChance,
  shouldRetireEnhanced,
  generateYouthPlayer,
  processRetirements,
} from '../player';
