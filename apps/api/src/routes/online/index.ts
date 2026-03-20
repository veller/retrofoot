import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { customAlphabet, nanoid } from 'nanoid';
import {
  onlineLeagues,
  onlineLeagueMembers,
  onlineTeams,
  onlineStandings,
  onlineFixtures,
  onlineMatchSessions,
  users,
} from '@retrofoot/db/schema';
import { createAuth } from '../../lib/auth';
import { logOnlineAnalyticsEvent } from '../../lib/analytics';
import {
  assignMembersToTeams,
  pickRandomTeamTemplates,
  seedOnlineLeagueWorld,
  shuffleArray,
  DEFAULT_SEASON_LABEL,
} from '../../lib/seed-online';
import type { Env } from '../../index';
import { z } from 'zod';

const genInviteCode = customAlphabet(
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
  8,
);

export const onlineRoutes = new Hono<{ Bindings: Env }>();

function seasonLabelFromLeague(league: { settings: unknown } | null): string {
  if (
    !league?.settings ||
    typeof league.settings !== 'object' ||
    Array.isArray(league.settings)
  ) {
    return DEFAULT_SEASON_LABEL;
  }
  const sl = (league.settings as Record<string, unknown>).seasonLabel;
  return typeof sl === 'string' ? sl : DEFAULT_SEASON_LABEL;
}

async function assertOnlineMember(
  db: ReturnType<typeof drizzle>,
  userId: string,
  leagueId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: onlineLeagueMembers.id })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, leagueId),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

const createLeagueSchema = z.object({
  maxMembers: z.number().int().min(2).max(20).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(4).max(32).trim(),
});

const addCompanionBodySchema = z.object({
  companionUserId: z.string().min(1),
});

async function requireUserId(
  c: Context<{ Bindings: Env }>,
): Promise<string | null> {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  return session?.user?.id ?? null;
}

/** Create lobby league; host is first member */
onlineRoutes.post('/leagues', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: z.infer<typeof createLeagueSchema>;
  try {
    const raw = await c.req.json();
    const parsed = createLeagueSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = new Date();
  const leagueId = nanoid();
  const memberId = nanoid();

  let inviteCode = genInviteCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db
      .select({ id: onlineLeagues.id })
      .from(onlineLeagues)
      .where(eq(onlineLeagues.inviteCode, inviteCode))
      .limit(1);
    if (clash.length === 0) break;
    inviteCode = genInviteCode();
  }

  const maxMembers = body.maxMembers ?? 8;

  await db.insert(onlineLeagues).values({
    id: leagueId,
    hostUserId: userId,
    inviteCode,
    status: 'lobby',
    maxMembers,
    settings: body.settings ?? undefined,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(onlineLeagueMembers).values({
    id: memberId,
    leagueId,
    userId,
    onlineTeamId: null,
    role: 'host',
    joinedAt: now,
  });

  return c.json(
    {
      league: {
        id: leagueId,
        inviteCode,
        status: 'lobby',
        maxMembers,
        currentRound: 1,
        hostUserId: userId,
        settings: body.settings ?? null,
        createdAt: now.toISOString(),
      },
    },
    201,
  );
});

/** Leagues the current user belongs to */
onlineRoutes.get('/leagues/mine', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      leagueId: onlineLeagues.id,
      inviteCode: onlineLeagues.inviteCode,
      status: onlineLeagues.status,
      maxMembers: onlineLeagues.maxMembers,
      currentRound: onlineLeagues.currentRound,
      hostUserId: onlineLeagues.hostUserId,
      createdAt: onlineLeagues.createdAt,
      role: onlineLeagueMembers.role,
    })
    .from(onlineLeagueMembers)
    .innerJoin(
      onlineLeagues,
      eq(onlineLeagueMembers.leagueId, onlineLeagues.id),
    )
    .where(eq(onlineLeagueMembers.userId, userId))
    .orderBy(desc(onlineLeagues.createdAt));

  return c.json({
    leagues: rows.map((r) => ({
      id: r.leagueId,
      inviteCode: r.inviteCode,
      status: r.status,
      maxMembers: r.maxMembers,
      currentRound: r.currentRound ?? 1,
      hostUserId: r.hostUserId,
      role: r.role,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
    })),
  });
});

/** Join lobby by invite code */
onlineRoutes.post('/leagues/join', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: z.infer<typeof joinLeagueSchema>;
  try {
    const raw = await c.req.json();
    const parsed = joinLeagueSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const db = drizzle(c.env.DB);
  const code = body.inviteCode.toUpperCase();

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.inviteCode, code))
    .limit(1);

  if (!league) {
    return c.json({ error: 'League not found' }, 404);
  }

  if (league.status !== 'lobby') {
    return c.json({ error: 'League is not accepting joins' }, 409);
  }

  const [existing] = await db
    .select({ id: onlineLeagueMembers.id })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, league.id),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({
      league: {
        id: league.id,
        inviteCode: league.inviteCode,
        status: league.status,
        maxMembers: league.maxMembers,
        currentRound: league.currentRound ?? 1,
        hostUserId: league.hostUserId,
        alreadyMember: true,
      },
    });
  }

  const memberCountResult = await db
    .select()
    .from(onlineLeagueMembers)
    .where(eq(onlineLeagueMembers.leagueId, league.id));

  if (memberCountResult.length >= league.maxMembers) {
    return c.json({ error: 'League is full' }, 409);
  }

  const now = new Date();
  await db.insert(onlineLeagueMembers).values({
    id: nanoid(),
    leagueId: league.id,
    userId,
    onlineTeamId: null,
    role: 'player',
    joinedAt: now,
  });

  return c.json({
    league: {
      id: league.id,
      inviteCode: league.inviteCode,
      status: league.status,
      maxMembers: league.maxMembers,
      currentRound: league.currentRound ?? 1,
      hostUserId: league.hostUserId,
    },
  });
});

/** League detail — members only */
onlineRoutes.get('/leagues/:leagueId', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const db = drizzle(c.env.DB);

  const [membership] = await db
    .select({ id: onlineLeagueMembers.id })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, leagueId),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({
    league: {
      id: league.id,
      inviteCode: league.inviteCode,
      status: league.status,
      maxMembers: league.maxMembers,
      currentRound: league.currentRound ?? 1,
      hostUserId: league.hostUserId,
      settings: league.settings ?? null,
      createdAt:
        league.createdAt instanceof Date
          ? league.createdAt.toISOString()
          : new Date(league.createdAt).toISOString(),
      updatedAt:
        league.updatedAt instanceof Date
          ? league.updatedAt.toISOString()
          : new Date(league.updatedAt).toISOString(),
    },
  });
});

/** Clubs in this online league — members only */
onlineRoutes.get('/leagues/:leagueId/teams', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const db = drizzle(c.env.DB);

  const isMember = await assertOnlineMember(db, userId, leagueId);
  if (!isMember) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const rows = await db
    .select({
      id: onlineTeams.id,
      name: onlineTeams.name,
      shortName: onlineTeams.shortName,
      primaryColor: onlineTeams.primaryColor,
      secondaryColor: onlineTeams.secondaryColor,
    })
    .from(onlineTeams)
    .where(eq(onlineTeams.leagueId, leagueId))
    .orderBy(asc(onlineTeams.name));

  return c.json({ teams: rows });
});

/** League table — members only; ranks by points, GD, GF */
onlineRoutes.get('/leagues/:leagueId/standings', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const db = drizzle(c.env.DB);

  const isMember = await assertOnlineMember(db, userId, leagueId);
  if (!isMember) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  const seasonLabel = seasonLabelFromLeague(league);

  const rows = await db
    .select({
      teamId: onlineStandings.teamId,
      played: onlineStandings.played,
      won: onlineStandings.won,
      drawn: onlineStandings.drawn,
      lost: onlineStandings.lost,
      goalsFor: onlineStandings.goalsFor,
      goalsAgainst: onlineStandings.goalsAgainst,
      points: onlineStandings.points,
      teamName: onlineTeams.name,
      teamShortName: onlineTeams.shortName,
    })
    .from(onlineStandings)
    .innerJoin(onlineTeams, eq(onlineStandings.teamId, onlineTeams.id))
    .where(
      and(
        eq(onlineStandings.leagueId, leagueId),
        eq(onlineStandings.seasonLabel, seasonLabel),
      ),
    );

  const sorted = [...rows].sort((a, b) => {
    const pts = (b.points ?? 0) - (a.points ?? 0);
    if (pts !== 0) return pts;
    const gdA = (a.goalsFor ?? 0) - (a.goalsAgainst ?? 0);
    const gdB = (b.goalsFor ?? 0) - (b.goalsAgainst ?? 0);
    if (gdB !== gdA) return gdB - gdA;
    return (b.goalsFor ?? 0) - (a.goalsFor ?? 0);
  });

  const standings = sorted.map((r, index) => ({
    position: index + 1,
    teamId: r.teamId,
    teamName: r.teamName,
    teamShortName: r.teamShortName,
    played: r.played ?? 0,
    won: r.won ?? 0,
    drawn: r.drawn ?? 0,
    lost: r.lost ?? 0,
    goalsFor: r.goalsFor ?? 0,
    goalsAgainst: r.goalsAgainst ?? 0,
    points: r.points ?? 0,
  }));

  return c.json({ seasonLabel, standings });
});

/** Single fixture — members only */
onlineRoutes.get('/leagues/:leagueId/fixtures/:fixtureId', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const fixtureId = c.req.param('fixtureId');
  const db = drizzle(c.env.DB);

  const isMember = await assertOnlineMember(db, userId, leagueId);
  if (!isMember) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  const seasonLabel = seasonLabelFromLeague(league);

  const [fx] = await db
    .select()
    .from(onlineFixtures)
    .where(
      and(
        eq(onlineFixtures.id, fixtureId),
        eq(onlineFixtures.leagueId, leagueId),
        eq(onlineFixtures.seasonLabel, seasonLabel),
      ),
    )
    .limit(1);

  if (!fx) {
    return c.json({ error: 'Not found' }, 404);
  }

  const [home, away] = await Promise.all([
    db
      .select({
        id: onlineTeams.id,
        name: onlineTeams.name,
        shortName: onlineTeams.shortName,
      })
      .from(onlineTeams)
      .where(
        and(
          eq(onlineTeams.id, fx.homeTeamId),
          eq(onlineTeams.leagueId, leagueId),
        ),
      )
      .limit(1),
    db
      .select({
        id: onlineTeams.id,
        name: onlineTeams.name,
        shortName: onlineTeams.shortName,
      })
      .from(onlineTeams)
      .where(
        and(
          eq(onlineTeams.id, fx.awayTeamId),
          eq(onlineTeams.leagueId, leagueId),
        ),
      )
      .limit(1),
  ]);

  const homeTeam = home[0];
  const awayTeam = away[0];

  return c.json({
    seasonLabel,
    fixture: {
      id: fx.id,
      round: fx.round,
      homeTeamId: fx.homeTeamId,
      awayTeamId: fx.awayTeamId,
      homeName: homeTeam?.name ?? 'Home',
      awayName: awayTeam?.name ?? 'Away',
      homeShortName: homeTeam?.shortName ?? '',
      awayShortName: awayTeam?.shortName ?? '',
      played: Boolean(fx.played),
      homeScore: fx.homeScore,
      awayScore: fx.awayScore,
      status: fx.status,
      kickoffAt:
        fx.kickoffAt instanceof Date
          ? fx.kickoffAt.toISOString()
          : fx.kickoffAt != null
            ? new Date(fx.kickoffAt).toISOString()
            : null,
    },
  });
});

/**
 * Ensure D1 session row + return WebSocket path (participants only).
 */
onlineRoutes.post('/leagues/:leagueId/fixtures/:fixtureId/session', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const fixtureId = c.req.param('fixtureId');
  const db = drizzle(c.env.DB);

  const [memberRow] = await db
    .select({
      onlineTeamId: onlineLeagueMembers.onlineTeamId,
    })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, leagueId),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!memberRow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  const seasonLabel = seasonLabelFromLeague(league);

  const [fx] = await db
    .select()
    .from(onlineFixtures)
    .where(
      and(
        eq(onlineFixtures.id, fixtureId),
        eq(onlineFixtures.leagueId, leagueId),
        eq(onlineFixtures.seasonLabel, seasonLabel),
      ),
    )
    .limit(1);

  if (!fx) {
    return c.json({ error: 'Not found' }, 404);
  }

  const tid = memberRow.onlineTeamId;
  if (
    !tid ||
    (tid !== fx.homeTeamId && tid !== fx.awayTeamId)
  ) {
    return c.json(
      { error: 'Only match participants can open the live room' },
      403,
    );
  }

  const doName = `${leagueId}:${fixtureId}`;
  const doId = c.env.MATCH_ROOM.idFromName(doName);
  const durableObjectId = doId.toString();

  const [existingSession] = await db
    .select()
    .from(onlineMatchSessions)
    .where(eq(onlineMatchSessions.fixtureId, fixtureId))
    .limit(1);

  if (!existingSession) {
    await db.insert(onlineMatchSessions).values({
      id: nanoid(),
      fixtureId,
      durableObjectId,
      status: 'pending',
      rngSeed: null,
      startedAt: null,
      finishedAt: null,
    });
  } else if (!existingSession.durableObjectId) {
    await db
      .update(onlineMatchSessions)
      .set({ durableObjectId })
      .where(eq(onlineMatchSessions.fixtureId, fixtureId));
  }

  return c.json({
    fixtureId,
    durableObjectId,
    websocketPath: `/api/online/match/${fixtureId}/ws`,
  });
});

/** WebSocket upgrade → MatchRoom DO (participants only; cookie session). */
onlineRoutes.all('/match/:fixtureId/ws', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (c.req.header('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket Upgrade', { status: 426 });
  }

  const fixtureId = c.req.param('fixtureId');
  const db = drizzle(c.env.DB);

  const [fx] = await db
    .select()
    .from(onlineFixtures)
    .where(eq(onlineFixtures.id, fixtureId))
    .limit(1);

  if (!fx) {
    return new Response('Not found', { status: 404 });
  }

  const [memberRow] = await db
    .select({
      onlineTeamId: onlineLeagueMembers.onlineTeamId,
    })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, fx.leagueId),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!memberRow?.onlineTeamId) {
    return new Response('Forbidden', { status: 403 });
  }

  const tid = memberRow.onlineTeamId;
  if (tid !== fx.homeTeamId && tid !== fx.awayTeamId) {
    return new Response('Not a participant', { status: 403 });
  }

  const doName = `${fx.leagueId}:${fixtureId}`;
  const stub = c.env.MATCH_ROOM.get(c.env.MATCH_ROOM.idFromName(doName));
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-RF-User', userId);
  return stub.fetch(
    new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
    }),
  );
});

/** Fixtures — optional ?round= — members only */
onlineRoutes.get('/leagues/:leagueId/fixtures', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const roundParam = c.req.query('round');
  const roundFilter =
    roundParam !== undefined && roundParam !== ''
      ? Number.parseInt(roundParam, 10)
      : null;

  const db = drizzle(c.env.DB);

  const isMember = await assertOnlineMember(db, userId, leagueId);
  if (!isMember) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  const seasonLabel = seasonLabelFromLeague(league);

  const conditions = [
    eq(onlineFixtures.leagueId, leagueId),
    eq(onlineFixtures.seasonLabel, seasonLabel),
  ];
  if (roundFilter !== null && !Number.isNaN(roundFilter)) {
    conditions.push(eq(onlineFixtures.round, roundFilter));
  }

  const fxRows = await db
    .select()
    .from(onlineFixtures)
    .where(and(...conditions))
    .orderBy(asc(onlineFixtures.round), asc(onlineFixtures.id));

  const teamIds = new Set<string>();
  for (const f of fxRows) {
    teamIds.add(f.homeTeamId);
    teamIds.add(f.awayTeamId);
  }

  const teamList =
    teamIds.size === 0
      ? []
      : await db
          .select({
            id: onlineTeams.id,
            name: onlineTeams.name,
            shortName: onlineTeams.shortName,
          })
          .from(onlineTeams)
          .where(
            and(
              eq(onlineTeams.leagueId, leagueId),
              inArray(onlineTeams.id, [...teamIds]),
            ),
          );

  const teamMap = new Map(teamList.map((t) => [t.id, t]));

  const rounds = [...new Set(fxRows.map((f) => f.round))].sort((a, b) => a - b);

  return c.json({
    seasonLabel,
    currentRound: league.currentRound ?? 1,
    rounds,
    fixtures: fxRows.map((f) => {
      const home = teamMap.get(f.homeTeamId);
      const away = teamMap.get(f.awayTeamId);
      return {
        id: f.id,
        round: f.round,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        homeName: home?.name ?? 'Home',
        awayName: away?.name ?? 'Away',
        homeShortName: home?.shortName ?? '',
        awayShortName: away?.shortName ?? '',
        played: Boolean(f.played),
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        status: f.status,
        kickoffAt:
          f.kickoffAt instanceof Date
            ? f.kickoffAt.toISOString()
            : f.kickoffAt != null
              ? new Date(f.kickoffAt).toISOString()
              : null,
      };
    }),
  });
});

/** Current user's club in this league */
onlineRoutes.get('/leagues/:leagueId/me', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const db = drizzle(c.env.DB);

  const [row] = await db
    .select({
      onlineTeamId: onlineLeagueMembers.onlineTeamId,
    })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, leagueId),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!row) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (!row.onlineTeamId) {
    return c.json({
      onlineTeamId: null,
      team: null,
    });
  }

  const [team] = await db
    .select({
      id: onlineTeams.id,
      name: onlineTeams.name,
      shortName: onlineTeams.shortName,
      primaryColor: onlineTeams.primaryColor,
      secondaryColor: onlineTeams.secondaryColor,
    })
    .from(onlineTeams)
    .where(
      and(
        eq(onlineTeams.id, row.onlineTeamId),
        eq(onlineTeams.leagueId, leagueId),
      ),
    )
    .limit(1);

  return c.json({
    onlineTeamId: row.onlineTeamId,
    team: team ?? null,
  });
});

/**
 * Host starts the league: seeds N random clubs (N = members), fixtures, assigns each player a team.
 */
onlineRoutes.post('/leagues/:leagueId/start', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const db = drizzle(c.env.DB);

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (league.hostUserId !== userId) {
    return c.json({ error: 'Only the host can start the league' }, 403);
  }

  if (league.status !== 'lobby') {
    return c.json({ error: 'League has already started' }, 409);
  }

  const [existingTeam] = await db
    .select({ id: onlineTeams.id })
    .from(onlineTeams)
    .where(eq(onlineTeams.leagueId, leagueId))
    .limit(1);

  if (existingTeam) {
    return c.json({ error: 'League world already exists' }, 409);
  }

  const memberRows = await db
    .select({
      id: onlineLeagueMembers.id,
      userId: onlineLeagueMembers.userId,
    })
    .from(onlineLeagueMembers)
    .where(eq(onlineLeagueMembers.leagueId, leagueId))
    .orderBy(asc(onlineLeagueMembers.joinedAt));

  if (memberRows.length < 2) {
    return c.json(
      { error: 'Need at least two players in the lobby to start' },
      400,
    );
  }

  const templates = pickRandomTeamTemplates(memberRows.length);

  const seeded = await seedOnlineLeagueWorld(db, leagueId, templates);

  const shuffleMembers = shuffleArray([...memberRows]);
  const shuffleTemplates = shuffleArray([...templates]);

  await assignMembersToTeams(db, leagueId, shuffleMembers, shuffleTemplates);

  const prevSettings =
    league.settings && typeof league.settings === 'object' && !Array.isArray(league.settings)
      ? { ...(league.settings as Record<string, unknown>) }
      : {};

  await db
    .update(onlineLeagues)
    .set({
      status: 'active',
      currentRound: 1,
      updatedAt: new Date(),
      settings: {
        ...prevSettings,
        seasonLabel: DEFAULT_SEASON_LABEL,
        startedAt: new Date().toISOString(),
      },
    })
    .where(eq(onlineLeagues.id, leagueId));

  await logOnlineAnalyticsEvent(c.env.DB, 'online_league_started', userId, {
    onlineLeagueId: leagueId,
    payload: {
      teamCount: seeded.teamCount,
      playerCount: seeded.playerCount,
      fixtureCount: seeded.fixtureCount,
    },
  });

  return c.json({
    started: true,
    seasonLabel: seeded.seasonLabel,
    teamCount: seeded.teamCount,
    playerCount: seeded.playerCount,
    fixtureCount: seeded.fixtureCount,
  });
});

/** Member list — members only */
onlineRoutes.get('/leagues/:leagueId/members', async (c) => {
  const userId = await requireUserId(c);
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const leagueId = c.req.param('leagueId');
  const db = drizzle(c.env.DB);

  const [membership] = await db
    .select({ id: onlineLeagueMembers.id })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, leagueId),
        eq(onlineLeagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const rows = await db
    .select({
      userId: onlineLeagueMembers.userId,
      role: onlineLeagueMembers.role,
      onlineTeamId: onlineLeagueMembers.onlineTeamId,
      joinedAt: onlineLeagueMembers.joinedAt,
      name: users.name,
      email: users.email,
      teamName: onlineTeams.name,
      teamShortName: onlineTeams.shortName,
    })
    .from(onlineLeagueMembers)
    .innerJoin(users, eq(onlineLeagueMembers.userId, users.id))
    .leftJoin(
      onlineTeams,
      eq(onlineLeagueMembers.onlineTeamId, onlineTeams.id),
    )
    .where(eq(onlineLeagueMembers.leagueId, leagueId))
    .orderBy(onlineLeagueMembers.joinedAt);

  return c.json({
    members: rows.map((m) => ({
      userId: m.userId,
      role: m.role,
      onlineTeamId: m.onlineTeamId,
      teamName: m.teamName ?? null,
      teamShortName: m.teamShortName ?? null,
      displayName: m.name?.trim() || m.email.split('@')[0],
      joinedAt:
        m.joinedAt instanceof Date
          ? m.joinedAt.toISOString()
          : new Date(m.joinedAt).toISOString(),
    })),
  });
});

/**
 * Development only: add a second real user to the lobby without using the join UI.
 * Requires ENVIRONMENT=development, ONLINE_DEV_SECRET (min 8 chars), and header
 * X-Online-Dev-Secret. Caller must be the league host; league must be in lobby.
 */
onlineRoutes.post('/dev/leagues/:leagueId/add-companion', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not found' }, 404);
  }

  const secret = c.env.ONLINE_DEV_SECRET;
  if (!secret || secret.length < 8) {
    return c.json({ error: 'ONLINE_DEV_SECRET not configured' }, 503);
  }

  if (c.req.header('X-Online-Dev-Secret') !== secret) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const hostUserId = await requireUserId(c);
  if (!hostUserId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: z.infer<typeof addCompanionBodySchema>;
  try {
    const raw = await c.req.json();
    const parsed = addCompanionBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
    }
    body = parsed.data;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const leagueId = c.req.param('leagueId');
  const companionUserId = body.companionUserId.trim();

  if (companionUserId === hostUserId) {
    return c.json({ error: 'Companion must be a different user' }, 400);
  }

  const db = drizzle(c.env.DB);

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, leagueId))
    .limit(1);

  if (!league) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (league.hostUserId !== hostUserId) {
    return c.json({ error: 'Only the host can add a companion' }, 403);
  }

  if (league.status !== 'lobby') {
    return c.json({ error: 'League is not in lobby' }, 409);
  }

  const [companionUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, companionUserId))
    .limit(1);

  if (!companionUser) {
    return c.json({ error: 'Companion user not found' }, 404);
  }

  const [existingCompanion] = await db
    .select({ id: onlineLeagueMembers.id })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, leagueId),
        eq(onlineLeagueMembers.userId, companionUserId),
      ),
    )
    .limit(1);

  if (existingCompanion) {
    return c.json({
      ok: true,
      alreadyMember: true,
      leagueId,
      companionUserId,
    });
  }

  const memberRows = await db
    .select({ id: onlineLeagueMembers.id })
    .from(onlineLeagueMembers)
    .where(eq(onlineLeagueMembers.leagueId, leagueId));

  if (memberRows.length >= league.maxMembers) {
    return c.json({ error: 'League is full' }, 409);
  }

  const now = new Date();
  await db.insert(onlineLeagueMembers).values({
    id: nanoid(),
    leagueId,
    userId: companionUserId,
    onlineTeamId: null,
    role: 'player',
    joinedAt: now,
  });

  return c.json({
    ok: true,
    alreadyMember: false,
    leagueId,
    companionUserId,
  });
});
