// ============================================================================
// RETROFOOT - Achievement System
// ============================================================================
// Track accomplishments across seasons: trophies, records, milestones

export type AchievementType = 'trophy' | 'record' | 'milestone';

export interface AchievementDefinition {
  key: string;
  type: AchievementType;
  name: string;
  description: string;
  icon?: string;
}

export interface UnlockedAchievement {
  key: string;
  type: AchievementType;
  value?: string;
  seasonYear?: string;
  unlockedAt: Date;
}

// All possible achievements
const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // Trophies (season-based)
  {
    key: 'league_champion',
    type: 'trophy',
    name: 'League Champion',
    description: 'Won the league title',
  },
  {
    key: 'top_4_finish',
    type: 'trophy',
    name: 'Top 4 Finish',
    description: 'Finished in the top 4',
  },
  {
    key: 'survival',
    type: 'trophy',
    name: 'Survival',
    description: 'Avoided relegation for another season',
  },

  // Records (tracked values)
  {
    key: 'best_finish',
    type: 'record',
    name: 'Best League Finish',
    description: 'Highest position achieved in a season',
  },
  {
    key: 'most_points',
    type: 'record',
    name: 'Most Points',
    description: 'Highest points total in a season',
  },
  {
    key: 'most_goals_season',
    type: 'record',
    name: 'Most Goals in Season',
    description: 'Most goals scored by a player in a season',
  },
  {
    key: 'longest_win_streak',
    type: 'record',
    name: 'Longest Win Streak',
    description: 'Most consecutive wins',
  },
  {
    key: 'unbeaten_run',
    type: 'record',
    name: 'Longest Unbeaten Run',
    description: 'Most consecutive matches without a loss',
  },

  // Milestones (cumulative)
  {
    key: 'matches_100',
    type: 'milestone',
    name: '100 Matches',
    description: 'Managed 100 matches',
  },
  {
    key: 'matches_500',
    type: 'milestone',
    name: '500 Matches',
    description: 'Managed 500 matches',
  },
  {
    key: 'wins_50',
    type: 'milestone',
    name: '50 Wins',
    description: 'Won 50 matches',
  },
  {
    key: 'wins_100',
    type: 'milestone',
    name: '100 Wins',
    description: 'Won 100 matches',
  },
  {
    key: 'wins_250',
    type: 'milestone',
    name: '250 Wins',
    description: 'Won 250 matches',
  },
  {
    key: 'seasons_5',
    type: 'milestone',
    name: '5 Seasons',
    description: 'Survived 5 seasons without relegation',
  },
  {
    key: 'seasons_10',
    type: 'milestone',
    name: '10 Seasons',
    description: 'Survived 10 seasons without relegation',
  },
  {
    key: 'titles_3',
    type: 'milestone',
    name: 'Triple Champion',
    description: 'Won 3 league titles',
  },
  {
    key: 'titles_5',
    type: 'milestone',
    name: 'Dynasty',
    description: 'Won 5 league titles',
  },
];

/**
 * Get all achievement definitions
 */
export function getAchievementDefinitions(): AchievementDefinition[] {
  return [...ACHIEVEMENT_DEFINITIONS];
}

/**
 * Get achievement definition by key
 */
export function getAchievementDefinition(
  key: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((a) => a.key === key);
}

interface SeasonStats {
  position: number;
  points: number;
  totalMatches: number;
  totalWins: number;
  topScorerGoals: number;
  winStreak: number;
  unbeatenRun: number;
  seasonCount: number;
  titleCount: number;
}

/**
 * Check and return newly unlocked achievements after a season
 */
export function checkAndUnlockAchievements(
  stats: SeasonStats,
  existingAchievements: UnlockedAchievement[],
  seasonYear: string,
): UnlockedAchievement[] {
  const newAchievements: UnlockedAchievement[] = [];
  const existingKeys = new Set(existingAchievements.map((a) => a.key));
  const now = new Date();

  // Helper to check if achievement already exists
  const hasAchievement = (key: string) => existingKeys.has(key);

  // Trophy: League Champion
  if (stats.position === 1) {
    newAchievements.push({
      key: 'league_champion',
      type: 'trophy',
      seasonYear,
      unlockedAt: now,
    });
  }

  // Trophy: Top 4 Finish
  if (stats.position <= 4 && stats.position > 1) {
    newAchievements.push({
      key: 'top_4_finish',
      type: 'trophy',
      seasonYear,
      unlockedAt: now,
    });
  }

  // Trophy: Survival (finished above relegation)
  if (stats.position <= 16) {
    newAchievements.push({
      key: 'survival',
      type: 'trophy',
      seasonYear,
      unlockedAt: now,
    });
  }

  // Record: Best Finish (update if better)
  const existingBestFinish = existingAchievements.find(
    (a) => a.key === 'best_finish',
  );
  if (
    !existingBestFinish ||
    stats.position < parseInt(existingBestFinish.value || '99')
  ) {
    newAchievements.push({
      key: 'best_finish',
      type: 'record',
      value: stats.position.toString(),
      seasonYear,
      unlockedAt: now,
    });
  }

  // Record: Most Points (update if better)
  const existingMostPoints = existingAchievements.find(
    (a) => a.key === 'most_points',
  );
  if (
    !existingMostPoints ||
    stats.points > parseInt(existingMostPoints.value || '0')
  ) {
    newAchievements.push({
      key: 'most_points',
      type: 'record',
      value: stats.points.toString(),
      seasonYear,
      unlockedAt: now,
    });
  }

  // Record: Most Goals in Season
  const existingMostGoals = existingAchievements.find(
    (a) => a.key === 'most_goals_season',
  );
  if (
    stats.topScorerGoals > 0 &&
    (!existingMostGoals ||
      stats.topScorerGoals > parseInt(existingMostGoals.value || '0'))
  ) {
    newAchievements.push({
      key: 'most_goals_season',
      type: 'record',
      value: stats.topScorerGoals.toString(),
      seasonYear,
      unlockedAt: now,
    });
  }

  // Record: Longest Win Streak
  const existingWinStreak = existingAchievements.find(
    (a) => a.key === 'longest_win_streak',
  );
  if (
    stats.winStreak > 0 &&
    (!existingWinStreak ||
      stats.winStreak > parseInt(existingWinStreak.value || '0'))
  ) {
    newAchievements.push({
      key: 'longest_win_streak',
      type: 'record',
      value: stats.winStreak.toString(),
      seasonYear,
      unlockedAt: now,
    });
  }

  // Record: Unbeaten Run
  const existingUnbeaten = existingAchievements.find(
    (a) => a.key === 'unbeaten_run',
  );
  if (
    stats.unbeatenRun > 0 &&
    (!existingUnbeaten ||
      stats.unbeatenRun > parseInt(existingUnbeaten.value || '0'))
  ) {
    newAchievements.push({
      key: 'unbeaten_run',
      type: 'record',
      value: stats.unbeatenRun.toString(),
      seasonYear,
      unlockedAt: now,
    });
  }

  // Milestone: Matches
  if (stats.totalMatches >= 100 && !hasAchievement('matches_100')) {
    newAchievements.push({
      key: 'matches_100',
      type: 'milestone',
      value: stats.totalMatches.toString(),
      unlockedAt: now,
    });
  }
  if (stats.totalMatches >= 500 && !hasAchievement('matches_500')) {
    newAchievements.push({
      key: 'matches_500',
      type: 'milestone',
      value: stats.totalMatches.toString(),
      unlockedAt: now,
    });
  }

  // Milestone: Wins
  if (stats.totalWins >= 50 && !hasAchievement('wins_50')) {
    newAchievements.push({
      key: 'wins_50',
      type: 'milestone',
      value: stats.totalWins.toString(),
      unlockedAt: now,
    });
  }
  if (stats.totalWins >= 100 && !hasAchievement('wins_100')) {
    newAchievements.push({
      key: 'wins_100',
      type: 'milestone',
      value: stats.totalWins.toString(),
      unlockedAt: now,
    });
  }
  if (stats.totalWins >= 250 && !hasAchievement('wins_250')) {
    newAchievements.push({
      key: 'wins_250',
      type: 'milestone',
      value: stats.totalWins.toString(),
      unlockedAt: now,
    });
  }

  // Milestone: Seasons survived
  if (stats.seasonCount >= 5 && !hasAchievement('seasons_5')) {
    newAchievements.push({
      key: 'seasons_5',
      type: 'milestone',
      value: stats.seasonCount.toString(),
      unlockedAt: now,
    });
  }
  if (stats.seasonCount >= 10 && !hasAchievement('seasons_10')) {
    newAchievements.push({
      key: 'seasons_10',
      type: 'milestone',
      value: stats.seasonCount.toString(),
      unlockedAt: now,
    });
  }

  // Milestone: Titles
  if (stats.titleCount >= 3 && !hasAchievement('titles_3')) {
    newAchievements.push({
      key: 'titles_3',
      type: 'milestone',
      value: stats.titleCount.toString(),
      unlockedAt: now,
    });
  }
  if (stats.titleCount >= 5 && !hasAchievement('titles_5')) {
    newAchievements.push({
      key: 'titles_5',
      type: 'milestone',
      value: stats.titleCount.toString(),
      unlockedAt: now,
    });
  }

  return newAchievements;
}

/**
 * Merge new achievements with existing ones (updating records as needed)
 */
export function mergeAchievements(
  existing: UnlockedAchievement[],
  newOnes: UnlockedAchievement[],
): UnlockedAchievement[] {
  const merged = [...existing];

  for (const newAchievement of newOnes) {
    const existingIndex = merged.findIndex((a) => a.key === newAchievement.key);

    if (existingIndex >= 0) {
      // For records, update if new value is better
      if (newAchievement.type === 'record') {
        merged[existingIndex] = newAchievement;
      }
      // For trophies (repeatable), add another entry
      else if (newAchievement.type === 'trophy') {
        merged.push(newAchievement);
      }
      // Milestones are one-time, don't add again
    } else {
      merged.push(newAchievement);
    }
  }

  return merged;
}

/**
 * Get display-friendly achievements summary
 */
export function getAchievementsSummary(achievements: UnlockedAchievement[]): {
  trophies: number;
  leagueTitles: number;
  records: { key: string; value: string; name: string }[];
  milestones: string[];
} {
  const trophies = achievements.filter((a) => a.type === 'trophy').length;
  const leagueTitles = achievements.filter(
    (a) => a.key === 'league_champion',
  ).length;

  // Get best value for each record
  const recordMap = new Map<string, UnlockedAchievement>();
  for (const a of achievements) {
    if (a.type === 'record') {
      const existing = recordMap.get(a.key);
      if (
        !existing ||
        (a.value && existing.value && a.value > existing.value)
      ) {
        recordMap.set(a.key, a);
      }
    }
  }

  const records = Array.from(recordMap.values()).map((a) => ({
    key: a.key,
    value: a.value || '',
    name: getAchievementDefinition(a.key)?.name || a.key,
  }));

  const milestones = achievements
    .filter((a) => a.type === 'milestone')
    .map((a) => getAchievementDefinition(a.key)?.name || a.key);

  return {
    trophies,
    leagueTitles,
    records,
    milestones,
  };
}
