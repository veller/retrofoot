/**
 * Admin product metrics — aggregate SQL only (bounded D1 work).
 *
 * Definitions (per USER, not per save, unless noted):
 * - registeredUsers: COUNT(users)
 * - usersWithoutSave: users with no row in saves
 * - usersWithSave: DISTINCT user_id in saves
 * - usersNeverPlayedLeague: has ≥1 save; MAX(league matches played for player team across saves) = 0
 *   (standings.played for row matching saves.player_team_id)
 * - usersPlayedExactlyOneLeagueMatch: same MAX = 1
 * - usersInactiveEarlyStall: user has a save with game_over=0, updated_at before cutoff,
 *   current_round <= stallRound (stalled early in season, not touched recently)
 * - usersLoginNeverMatchCompleted: has analytics login_successful and no analytics match_completed
 */

import type { D1Database } from '@cloudflare/workers-types';

export type AdminMetricsWindows = {
  inactiveDays: number;
  stallRound: number;
};

export type AdminMetricsTotals = {
  registeredUsers: number;
  usersWithoutSave: number;
  usersWithSave: number;
  usersNeverPlayedLeague: number;
  usersPlayedExactlyOneLeagueMatch: number;
  usersInactiveEarlyStall: number;
  usersLoginNeverMatchCompleted: number;
};

export type AdminMetricsResult = {
  generatedAt: string;
  windows: AdminMetricsWindows;
  totals: AdminMetricsTotals;
};

async function scalarCount(
  db: D1Database,
  query: string,
  binds: unknown[] = [],
): Promise<number> {
  const stmt = binds.length
    ? db.prepare(query).bind(...binds)
    : db.prepare(query);
  const row = await stmt.first<{ c: number }>();
  return Number(row?.c ?? 0);
}

export async function getAdminMetrics(
  db: D1Database,
  windows: AdminMetricsWindows,
): Promise<AdminMetricsResult> {
  const inactiveCutoffMs = Date.now() - windows.inactiveDays * 86_400_000;

  const registeredUsers = await scalarCount(
    db,
    'SELECT COUNT(*) AS c FROM users',
  );

  const usersWithoutSave = await scalarCount(
    db,
    `SELECT COUNT(*) AS c FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM saves s WHERE s.user_id = u.id)`,
  );

  const usersWithSave = await scalarCount(
    db,
    'SELECT COUNT(DISTINCT user_id) AS c FROM saves',
  );

  const usersNeverPlayedLeague = await scalarCount(
    db,
    `SELECT COUNT(*) AS c FROM (
       SELECT u.id
       FROM users u
       INNER JOIN saves s ON s.user_id = u.id
       LEFT JOIN standings st ON st.save_id = s.id AND st.team_id = s.player_team_id
       GROUP BY u.id
       HAVING MAX(COALESCE(st.played, 0)) = 0
     )`,
  );

  const usersPlayedExactlyOneLeagueMatch = await scalarCount(
    db,
    `SELECT COUNT(*) AS c FROM (
       SELECT u.id
       FROM users u
       INNER JOIN saves s ON s.user_id = u.id
       LEFT JOIN standings st ON st.save_id = s.id AND st.team_id = s.player_team_id
       GROUP BY u.id
       HAVING MAX(COALESCE(st.played, 0)) = 1
     )`,
  );

  const usersInactiveEarlyStall = await scalarCount(
    db,
    `SELECT COUNT(DISTINCT s.user_id) AS c FROM saves s
     WHERE s.game_over = 0
       AND s.updated_at < ?
       AND s.current_round <= ?`,
    [inactiveCutoffMs, windows.stallRound],
  );

  const usersLoginNeverMatchCompleted = await scalarCount(
    db,
    `SELECT COUNT(*) AS c FROM users u
     WHERE EXISTS (
       SELECT 1 FROM analytics_events e
       WHERE e.user_id = u.id AND e.event_name = 'login_successful'
     )
     AND NOT EXISTS (
       SELECT 1 FROM analytics_events e2
       WHERE e2.user_id = u.id AND e2.event_name = 'match_completed'
     )`,
  );

  return {
    generatedAt: new Date().toISOString(),
    windows,
    totals: {
      registeredUsers,
      usersWithoutSave,
      usersWithSave,
      usersNeverPlayedLeague,
      usersPlayedExactlyOneLeagueMatch,
      usersInactiveEarlyStall,
      usersLoginNeverMatchCompleted,
    },
  };
}

export const ADMIN_SEGMENT_TYPES = [
  'no_save',
  'never_played',
  'one_match',
  'inactive',
  'login_no_match',
] as const;

export type AdminSegmentType = (typeof ADMIN_SEGMENT_TYPES)[number];

const DEFAULT_SEGMENT_LIMIT = 50;

export function decodeSegmentCursor(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(atob(raw)) as { id?: unknown };
    return typeof j.id === 'string' && j.id.length > 0 ? j.id : null;
  } catch {
    return null;
  }
}

export function encodeSegmentCursor(userId: string): string {
  return btoa(JSON.stringify({ id: userId }));
}

export type AdminSegmentRow = {
  userId: string;
  email: string;
  createdAt: string | null;
};

export type AdminSegmentResult = {
  items: AdminSegmentRow[];
  nextCursor: string | null;
};

export async function getAdminSegment(
  db: D1Database,
  type: AdminSegmentType,
  cursor: string | null,
  windows: AdminMetricsWindows,
  pageLimit: number = DEFAULT_SEGMENT_LIMIT,
): Promise<AdminSegmentResult> {
  const inactiveCutoffMs = Date.now() - windows.inactiveDays * 86_400_000;
  const afterId = cursor ?? '';
  const limit = Math.min(100, Math.max(1, pageLimit));
  const fetchLimit = limit + 1;

  type Row = { userId: string; email: string; createdAt: number | null };

  switch (type) {
    case 'no_save': {
      const rows = await db
        .prepare(
          `SELECT u.id AS userId, u.email AS email, u.created_at AS createdAt
           FROM users u
           WHERE NOT EXISTS (SELECT 1 FROM saves s WHERE s.user_id = u.id)
             AND (? = '' OR u.id > ?)
           ORDER BY u.id
           LIMIT ?`,
        )
        .bind(afterId, afterId, fetchLimit)
        .all<Row>();
      return shapeSegmentRows(rows.results ?? [], limit);
    }
    case 'never_played': {
      const rows = await db
        .prepare(
          `SELECT u.id AS userId, u.email AS email, u.created_at AS createdAt
           FROM users u
           INNER JOIN saves s ON s.user_id = u.id
           LEFT JOIN standings st ON st.save_id = s.id AND st.team_id = s.player_team_id
           WHERE (? = '' OR u.id > ?)
           GROUP BY u.id, u.email, u.created_at
           HAVING MAX(COALESCE(st.played, 0)) = 0
           ORDER BY u.id
           LIMIT ?`,
        )
        .bind(afterId, afterId, fetchLimit)
        .all<Row>();
      return shapeSegmentRows(rows.results ?? [], limit);
    }
    case 'one_match': {
      const rows = await db
        .prepare(
          `SELECT u.id AS userId, u.email AS email, u.created_at AS createdAt
           FROM users u
           INNER JOIN saves s ON s.user_id = u.id
           LEFT JOIN standings st ON st.save_id = s.id AND st.team_id = s.player_team_id
           WHERE (? = '' OR u.id > ?)
           GROUP BY u.id, u.email, u.created_at
           HAVING MAX(COALESCE(st.played, 0)) = 1
           ORDER BY u.id
           LIMIT ?`,
        )
        .bind(afterId, afterId, fetchLimit)
        .all<Row>();
      return shapeSegmentRows(rows.results ?? [], limit);
    }
    case 'inactive': {
      const rows = await db
        .prepare(
          `SELECT DISTINCT u.id AS userId, u.email AS email, u.created_at AS createdAt
           FROM users u
           INNER JOIN saves s ON s.user_id = u.id
           WHERE s.game_over = 0
             AND s.updated_at < ?
             AND s.current_round <= ?
             AND (? = '' OR u.id > ?)
           ORDER BY u.id
           LIMIT ?`,
        )
        .bind(
          inactiveCutoffMs,
          windows.stallRound,
          afterId,
          afterId,
          fetchLimit,
        )
        .all<Row>();
      return shapeSegmentRows(rows.results ?? [], limit);
    }
    case 'login_no_match': {
      const rows = await db
        .prepare(
          `SELECT u.id AS userId, u.email AS email, u.created_at AS createdAt
           FROM users u
           WHERE EXISTS (
             SELECT 1 FROM analytics_events e
             WHERE e.user_id = u.id AND e.event_name = 'login_successful'
           )
           AND NOT EXISTS (
             SELECT 1 FROM analytics_events e2
             WHERE e2.user_id = u.id AND e2.event_name = 'match_completed'
           )
           AND (? = '' OR u.id > ?)
           ORDER BY u.id
           LIMIT ?`,
        )
        .bind(afterId, afterId, fetchLimit)
        .all<Row>();
      return shapeSegmentRows(rows.results ?? [], limit);
    }
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function shapeSegmentRows(
  raw: Array<{ userId: string; email: string; createdAt: number | null }>,
  limit: number,
): AdminSegmentResult {
  const hasMore = raw.length > limit;
  const slice = hasMore ? raw.slice(0, limit) : raw;
  const last = slice[slice.length - 1];
  const nextCursor = hasMore && last ? encodeSegmentCursor(last.userId) : null;

  return {
    items: slice.map((r) => ({
      userId: r.userId,
      email: r.email,
      createdAt:
        r.createdAt != null ? new Date(r.createdAt).toISOString() : null,
    })),
    nextCursor,
  };
}
