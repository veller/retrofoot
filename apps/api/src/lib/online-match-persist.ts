// ============================================================================
// Persist finished online match to D1 (fixtures, standings, events, form)
// ============================================================================

import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { LiveMatchState, MatchEvent, MatchConfig } from '@retrofoot/core';
import {
  onlineFixtures,
  onlineMatchSessions,
  onlineMatchEvents,
  onlineStandings,
  onlineTeams,
} from '@retrofoot/db/schema';
import { nanoid } from 'nanoid';
import { batchInsertChunked } from './db/batch';

const FORM_HISTORY_LENGTH = 5;

export type OnlineRoomState = {
  live: LiveMatchState;
  leagueId: string;
  seasonLabel: string;
  homeUserId: string;
  awayUserId: string;
  waitingHalf: boolean;
  homeHalfReady: boolean;
  awayHalfReady: boolean;
  persisted: boolean;
};

export type OnlineRoomPersistBundle = {
  live: LiveMatchState;
  leagueId: string;
  seasonLabel: string;
};

export function matchConfigFromLive(live: LiveMatchState): MatchConfig {
  return {
    homeTeam: live.homeTeam,
    awayTeam: live.awayTeam,
    homeTactics: live.state.homeTactics,
    awayTactics: live.state.awayTactics,
    homeControl: live.homeControl,
    awayControl: live.awayControl,
    fixtureId: live.fixtureId,
  };
}

export async function markOnlineSessionLive(
  db: ReturnType<typeof drizzle>,
  fixtureId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(onlineMatchSessions)
    .set({ status: 'live', startedAt: now })
    .where(eq(onlineMatchSessions.fixtureId, fixtureId));

  await db
    .update(onlineFixtures)
    .set({ status: 'live' })
    .where(eq(onlineFixtures.id, fixtureId));
}

export async function recalculateOnlineStandingPositions(
  d1: D1Database,
  leagueId: string,
  seasonLabel: string,
): Promise<void> {
  const result = await d1
    .prepare(
      `SELECT id, points, goals_for, goals_against FROM online_standings
       WHERE league_id = ? AND season_label = ?`,
    )
    .bind(leagueId, seasonLabel)
    .all();

  const rows = result.results as Array<{
    id: string;
    points: number | null;
    goals_for: number | null;
    goals_against: number | null;
  }>;

  rows.sort((a, b) => {
    const pointsDiff = (b.points ?? 0) - (a.points ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    const gdA = (a.goals_for ?? 0) - (a.goals_against ?? 0);
    const gdB = (b.goals_for ?? 0) - (b.goals_against ?? 0);
    const gdDiff = gdB - gdA;
    if (gdDiff !== 0) return gdDiff;

    return (b.goals_for ?? 0) - (a.goals_for ?? 0);
  });

  const stmts = rows.map((row, i) =>
    d1
      .prepare('UPDATE online_standings SET position = ? WHERE id = ?')
      .bind(i + 1, row.id),
  );

  if (stmts.length > 0) {
    await d1.batch(stmts);
  }
}

/**
 * Idempotent: no-op if fixture already marked played.
 */
export async function persistFinishedOnlineMatch(
  db: ReturnType<typeof drizzle>,
  d1: D1Database,
  bundle: OnlineRoomPersistBundle,
): Promise<void> {
  const { live, leagueId, seasonLabel } = bundle;
  const fixtureId = live.fixtureId;
  const homeTeamId = live.homeTeam.id;
  const awayTeamId = live.awayTeam.id;
  const homeScore = live.state.homeScore;
  const awayScore = live.state.awayScore;
  const events = live.state.events;

  const [fx] = await db
    .select({ played: onlineFixtures.played })
    .from(onlineFixtures)
    .where(eq(onlineFixtures.id, fixtureId))
    .limit(1);

  if (!fx || fx.played) {
    return;
  }

  const homeWin = homeScore > awayScore;
  const awayWin = awayScore > homeScore;
  const draw = homeScore === awayScore;

  const [homeStanding] = await db
    .select()
    .from(onlineStandings)
    .where(
      and(
        eq(onlineStandings.leagueId, leagueId),
        eq(onlineStandings.seasonLabel, seasonLabel),
        eq(onlineStandings.teamId, homeTeamId),
      ),
    )
    .limit(1);

  const [awayStanding] = await db
    .select()
    .from(onlineStandings)
    .where(
      and(
        eq(onlineStandings.leagueId, leagueId),
        eq(onlineStandings.seasonLabel, seasonLabel),
        eq(onlineStandings.teamId, awayTeamId),
      ),
    )
    .limit(1);

  if (homeStanding) {
    await db
      .update(onlineStandings)
      .set({
        played: (homeStanding.played ?? 0) + 1,
        won: (homeStanding.won ?? 0) + (homeWin ? 1 : 0),
        drawn: (homeStanding.drawn ?? 0) + (draw ? 1 : 0),
        lost: (homeStanding.lost ?? 0) + (awayWin ? 1 : 0),
        goalsFor: (homeStanding.goalsFor ?? 0) + homeScore,
        goalsAgainst: (homeStanding.goalsAgainst ?? 0) + awayScore,
        points:
          (homeStanding.points ?? 0) + (homeWin ? 3 : draw ? 1 : 0),
      })
      .where(eq(onlineStandings.id, homeStanding.id));
  }

  if (awayStanding) {
    await db
      .update(onlineStandings)
      .set({
        played: (awayStanding.played ?? 0) + 1,
        won: (awayStanding.won ?? 0) + (awayWin ? 1 : 0),
        drawn: (awayStanding.drawn ?? 0) + (draw ? 1 : 0),
        lost: (awayStanding.lost ?? 0) + (homeWin ? 1 : 0),
        goalsFor: (awayStanding.goalsFor ?? 0) + awayScore,
        goalsAgainst: (awayStanding.goalsAgainst ?? 0) + homeScore,
        points:
          (awayStanding.points ?? 0) + (awayWin ? 3 : draw ? 1 : 0),
      })
      .where(eq(onlineStandings.id, awayStanding.id));
  }

  const [homeTeamRow] = await db
    .select()
    .from(onlineTeams)
    .where(eq(onlineTeams.id, homeTeamId))
    .limit(1);

  const [awayTeamRow] = await db
    .select()
    .from(onlineTeams)
    .where(eq(onlineTeams.id, awayTeamId))
    .limit(1);

  const homeResult: 'W' | 'D' | 'L' = homeWin ? 'W' : awayWin ? 'L' : 'D';
  const awayResult: 'W' | 'D' | 'L' = awayWin ? 'W' : homeWin ? 'L' : 'D';

  const prevHomeForm =
    (homeTeamRow?.lastFiveResults as ('W' | 'D' | 'L')[]) ?? [];
  const prevAwayForm =
    (awayTeamRow?.lastFiveResults as ('W' | 'D' | 'L')[]) ?? [];

  const newHomeForm = [...prevHomeForm, homeResult].slice(
    -FORM_HISTORY_LENGTH,
  );
  const newAwayForm = [...prevAwayForm, awayResult].slice(
    -FORM_HISTORY_LENGTH,
  );

  await db
    .update(onlineTeams)
    .set({ lastFiveResults: newHomeForm })
    .where(eq(onlineTeams.id, homeTeamId));

  await db
    .update(onlineTeams)
    .set({ lastFiveResults: newAwayForm })
    .where(eq(onlineTeams.id, awayTeamId));

  const eventRows = events.map((ev: MatchEvent) => ({
    id: nanoid(),
    fixtureId,
    minute: ev.minute,
    type: ev.type,
    team: ev.team,
    playerId: ev.playerId ?? null,
    playerName: ev.playerName ?? null,
    description: ev.description ?? null,
  }));

  if (eventRows.length > 0) {
    await batchInsertChunked(db, onlineMatchEvents, eventRows);
  }

  const now = new Date();

  await db
    .update(onlineFixtures)
    .set({
      played: true,
      status: 'finished',
      homeScore,
      awayScore,
    })
    .where(eq(onlineFixtures.id, fixtureId));

  await db
    .update(onlineMatchSessions)
    .set({
      status: 'completed',
      finishedAt: now,
    })
    .where(eq(onlineMatchSessions.fixtureId, fixtureId));

  await recalculateOnlineStandingPositions(d1, leagueId, seasonLabel);
}
