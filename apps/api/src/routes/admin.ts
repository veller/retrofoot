import { Hono } from 'hono';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import * as schema from '@retrofoot/db/schema';
import { analyticsEvents, users } from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import { isAdminSession } from '../lib/admin';
import {
  ADMIN_SEGMENT_TYPES,
  decodeSegmentCursor,
  getAdminMetrics,
  getAdminSegment,
} from '../services/admin-metrics.service';
import type { Env } from '../index';

const PAGE_SIZE = 100;

function encodeCursor(t: number, id: string): string {
  return btoa(JSON.stringify({ t, id }));
}

function decodeCursor(raw: string): { t: number; id: string } | null {
  try {
    const parsed = JSON.parse(atob(raw)) as { t?: unknown; id?: unknown };
    if (typeof parsed.t !== 'number' || typeof parsed.id !== 'string') {
      return null;
    }
    return { t: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}

export const adminRoutes = new Hono<{ Bindings: Env }>();

const segmentTypeSchema = z.enum(ADMIN_SEGMENT_TYPES);

const METHODOLOGY = [
  'All funnel counts are per user (aggregated across every save they own).',
  'Never played / one match: uses standings.played for the player’s club row (player_team_id) per save; then MAX across saves.',
  'Inactive (early stall): user has a save with game_over=false, updated_at older than the window, and current_round at or below the stall round.',
  'Login, never match_completed: based on analytics_events only (requires users to have logged in at least once after analytics existed).',
] as const;

function parseMetricsWindows(c: {
  req: { query: (k: string) => string | undefined };
}): { inactiveDays: number; stallRound: number } {
  const inactiveRaw = Number.parseInt(c.req.query('inactiveDays') ?? '14', 10);
  const stallRaw = Number.parseInt(c.req.query('stallRound') ?? '5', 10);
  const inactiveDays = Number.isFinite(inactiveRaw)
    ? Math.min(365, Math.max(1, inactiveRaw))
    : 14;
  const stallRound = Number.isFinite(stallRaw)
    ? Math.min(38, Math.max(1, stallRaw))
    : 5;
  return { inactiveDays, stallRound };
}

async function requireAdmin(c: {
  env: Env;
  req: { url: string; raw: Request };
}): Promise<
  { ok: true } | { ok: false; status: 401 | 403; body: { error: string } }
> {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session?.user?.id) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  if (!isAdminSession(session, c.env)) {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }
  return { ok: true };
}

adminRoutes.get('/me', async (c) => {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({ isAdmin: isAdminSession(session, c.env) });
});

adminRoutes.get('/metrics', async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) {
    return c.json(gate.body, gate.status);
  }

  const windows = parseMetricsWindows(c);
  const result = await getAdminMetrics(c.env.DB, windows);
  return c.json({
    ...result,
    methodology: [...METHODOLOGY],
  });
});

adminRoutes.get('/metrics/segment', async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) {
    return c.json(gate.body, gate.status);
  }

  const typeParsed = segmentTypeSchema.safeParse(c.req.query('type') ?? '');
  if (!typeParsed.success) {
    return c.json({ error: 'Invalid or missing type' }, 400);
  }
  const type = typeParsed.data;

  const limitRaw = Number.parseInt(c.req.query('limit') ?? '50', 10);
  const pageLimit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, limitRaw))
    : 50;

  const windows = parseMetricsWindows(c);
  const cursor = decodeSegmentCursor(c.req.query('cursor') ?? null);

  const result = await getAdminSegment(
    c.env.DB,
    type,
    cursor,
    windows,
    pageLimit,
  );

  return c.json(result);
});

adminRoutes.get('/analytics-events', async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) {
    return c.json(gate.body, gate.status);
  }

  const cursorRaw = c.req.query('cursor') ?? '';
  let cursor: { t: number; id: string } | null = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return c.json({ error: 'Invalid cursor' }, 400);
    }
  }

  const eventNameFilter = c.req.query('eventName')?.trim();
  if (eventNameFilter && eventNameFilter.length > 128) {
    return c.json({ error: 'Invalid eventName' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });

  let whereClause: SQL | undefined;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    const cursorPredicate = or(
      lt(analyticsEvents.createdAt, cursorDate),
      and(
        eq(analyticsEvents.createdAt, cursorDate),
        lt(analyticsEvents.id, cursor.id),
      ),
    );
    whereClause = eventNameFilter
      ? and(cursorPredicate, eq(analyticsEvents.eventName, eventNameFilter))
      : cursorPredicate;
  } else if (eventNameFilter) {
    whereClause = eq(analyticsEvents.eventName, eventNameFilter);
  }

  let query = db
    .select({
      id: analyticsEvents.id,
      eventName: analyticsEvents.eventName,
      userId: analyticsEvents.userId,
      saveId: analyticsEvents.saveId,
      payload: analyticsEvents.payload,
      createdAt: analyticsEvents.createdAt,
      userEmail: users.email,
    })
    .from(analyticsEvents)
    .leftJoin(users, eq(analyticsEvents.userId, users.id))
    .$dynamic();

  if (whereClause) {
    query = query.where(whereClause);
  }

  const rows = await query
    .orderBy(desc(analyticsEvents.createdAt), desc(analyticsEvents.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last?.createdAt
      ? encodeCursor(last.createdAt.getTime(), last.id)
      : null;

  return c.json({
    events: slice.map((r) => ({
      id: r.id,
      eventName: r.eventName,
      userId: r.userId,
      userEmail: r.userEmail ?? null,
      saveId: r.saveId,
      payload: r.payload ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  });
});
