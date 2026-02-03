// ============================================================================
// RETROFOOT - Standings Service
// ============================================================================
// D1-specific standings operations with batch support

import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { StandingsUpdate } from '../types/match.types';

/**
 * Build D1 prepared statements for updating standings
 */
export function buildStandingsStatements(
  d1: D1Database,
  updates: StandingsUpdate[],
  saveId: string,
  season: string,
): D1PreparedStatement[] {
  return updates.map((u) => {
    const points = u.isWin ? 3 : u.isDraw ? 1 : 0;
    return d1
      .prepare(
        `UPDATE standings SET
          played = played + 1,
          won = won + ?,
          drawn = drawn + ?,
          lost = lost + ?,
          goals_for = goals_for + ?,
          goals_against = goals_against + ?,
          points = points + ?
        WHERE save_id = ? AND season = ? AND team_id = ?`,
      )
      .bind(
        u.isWin ? 1 : 0,
        u.isDraw ? 1 : 0,
        !u.isWin && !u.isDraw ? 1 : 0,
        u.goalsFor,
        u.goalsAgainst,
        points,
        saveId,
        season,
        u.teamId,
      );
  });
}

/**
 * Recalculate standings positions after match results
 * Sorts by points, goal difference, then goals for
 */
export async function recalculateStandingPositions(
  d1: D1Database,
  saveId: string,
  season: string,
): Promise<void> {
  // Get all standings sorted by points, goal difference, goals for
  const result = await d1
    .prepare('SELECT * FROM standings WHERE save_id = ? AND season = ?')
    .bind(saveId, season)
    .all();

  const allStandings = result.results as Array<{
    id: string;
    points: number | null;
    goals_for: number | null;
    goals_against: number | null;
  }>;

  // Sort by points, then goal difference, then goals for
  allStandings.sort((a, b) => {
    const pointsDiff = (b.points ?? 0) - (a.points ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    const gdA = (a.goals_for ?? 0) - (a.goals_against ?? 0);
    const gdB = (b.goals_for ?? 0) - (b.goals_against ?? 0);
    const gdDiff = gdB - gdA;
    if (gdDiff !== 0) return gdDiff;

    return (b.goals_for ?? 0) - (a.goals_for ?? 0);
  });

  // Batch update positions using D1 batch API
  const positionStatements = allStandings.map((standing, i) =>
    d1
      .prepare('UPDATE standings SET position = ? WHERE id = ?')
      .bind(i + 1, standing.id),
  );

  if (positionStatements.length > 0) {
    await d1.batch(positionStatements);
  }
}
