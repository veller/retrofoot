// ============================================================================
// RETROFOOT - Star Player Algorithm
// ============================================================================
// Determines the Star Player of the Season based on weighted criteria

import type { Player, Position, StandingEntry } from '../types';

// Minimum minutes required to qualify for Star Player
const MIN_MINUTES_REQUIRED = 1500;

// Position-based goal weights (defenders scoring is more impressive)
const GOAL_WEIGHTS: Record<Position, number> = {
  GK: 10.0, // Goalkeepers scoring is extremely rare and impressive
  DEF: 3.0, // Defenders scoring is noteworthy
  MID: 1.5, // Midfielders scoring is good
  ATT: 1.0, // Attackers are expected to score
};

// Position-based assist weights (midfielders get bonus)
const ASSIST_WEIGHTS: Record<Position, number> = {
  GK: 3.0,
  DEF: 1.5,
  MID: 1.5,
  ATT: 1.0,
};

interface StarPlayerCandidate {
  player: Player;
  teamId: string;
  score: number;
  breakdown: {
    ratingScore: number;
    goalScore: number;
    assistScore: number;
    teamBonus: number;
  };
}

/**
 * Calculate the Star Player score for a single player
 * Score = weighted combination of:
 * - Season average rating (primary, 0-100 points)
 * - Goals (position-weighted)
 * - Assists (midfielder bonus)
 * - Team success bonus (champion: +15, top 4: +10, top 8: +5)
 */
export function calculateStarPlayerScore(
  player: Player,
  teamId: string,
  standings: StandingEntry[],
): StarPlayerCandidate | null {
  // Check minimum minutes requirement
  if (player.form.seasonMinutes < MIN_MINUTES_REQUIRED) {
    return null;
  }

  // Rating score: season average rating * 10 (max ~100 points)
  const ratingScore = player.form.seasonAvgRating * 10;

  // Goal score: goals * position weight (position-weighted)
  const goalWeight = GOAL_WEIGHTS[player.position] || 1.0;
  const goalScore = player.form.seasonGoals * goalWeight * 2;

  // Assist score: assists * position weight
  const assistWeight = ASSIST_WEIGHTS[player.position] || 1.0;
  const assistScore = player.form.seasonAssists * assistWeight * 1.5;

  // Team success bonus
  const teamStanding = standings.find((s) => s.teamId === teamId);
  let teamBonus = 0;
  if (teamStanding) {
    if (teamStanding.position === 1) {
      teamBonus = 15; // Champion
    } else if (teamStanding.position <= 4) {
      teamBonus = 10; // Top 4
    } else if (teamStanding.position <= 8) {
      teamBonus = 5; // Top 8
    }
  }

  // Total score
  const score = ratingScore + goalScore + assistScore + teamBonus;

  return {
    player,
    teamId,
    score,
    breakdown: {
      ratingScore,
      goalScore,
      assistScore,
      teamBonus,
    },
  };
}

/**
 * Select the Star Player of the Season from all league players
 */
export function selectStarPlayer(
  players: Array<{ player: Player; teamId: string }>,
  standings: StandingEntry[],
): StarPlayerCandidate | null {
  const candidates: StarPlayerCandidate[] = [];

  for (const { player, teamId } of players) {
    // Only active players can win
    if (player.status !== 'active') continue;

    const candidate = calculateStarPlayerScore(player, teamId, standings);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return top candidate or null if none qualify
  return candidates[0] || null;
}

/**
 * Get the Top Scorer of the season
 */
export function selectTopScorer(
  players: Array<{ player: Player; teamId: string }>,
): { player: Player; teamId: string; goals: number } | null {
  let topScorer: { player: Player; teamId: string; goals: number } | null =
    null;

  for (const { player, teamId } of players) {
    if (player.status !== 'active') continue;
    if (player.form.seasonGoals === 0) continue;

    if (!topScorer || player.form.seasonGoals > topScorer.goals) {
      topScorer = {
        player,
        teamId,
        goals: player.form.seasonGoals,
      };
    }
  }

  return topScorer;
}

/**
 * Get the Top Assister of the season
 */
export function selectTopAssister(
  players: Array<{ player: Player; teamId: string }>,
): { player: Player; teamId: string; assists: number } | null {
  let topAssister: { player: Player; teamId: string; assists: number } | null =
    null;

  for (const { player, teamId } of players) {
    if (player.status !== 'active') continue;
    if (player.form.seasonAssists === 0) continue;

    if (!topAssister || player.form.seasonAssists > topAssister.assists) {
      topAssister = {
        player,
        teamId,
        assists: player.form.seasonAssists,
      };
    }
  }

  return topAssister;
}

/**
 * Get all season awards (star player, top scorer, top assister)
 */
export function getSeasonAwards(
  players: Array<{ player: Player; teamId: string }>,
  standings: StandingEntry[],
): {
  starPlayer: StarPlayerCandidate | null;
  topScorer: { player: Player; teamId: string; goals: number } | null;
  topAssister: { player: Player; teamId: string; assists: number } | null;
} {
  return {
    starPlayer: selectStarPlayer(players, standings),
    topScorer: selectTopScorer(players),
    topAssister: selectTopAssister(players),
  };
}
