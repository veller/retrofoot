// ============================================================================
// Build @retrofoot/core match state from D1 online_* rows
// ============================================================================

import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import {
  onlineFixtures,
  onlineTeams,
  onlinePlayers,
  onlineTactics,
  onlineLeagueMembers,
  onlineLeagues,
} from '@retrofoot/db/schema';
import type { Team, Player, Tactics, Position, FormationType } from '@retrofoot/core';
import {
  createMatchState,
  sampleAttendance,
  selectBestLineup,
  type LiveMatchState,
} from '@retrofoot/core';

const FORMATIONS: FormationType[] = [
  '4-4-2',
  '4-3-3',
  '3-5-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
  '3-4-3',
];

function asPosition(v: string): Position {
  if (v === 'GK' || v === 'DEF' || v === 'MID' || v === 'ATT') return v;
  return 'MID';
}

function asFormation(v: string): FormationType {
  return (FORMATIONS.includes(v as FormationType) ? v : '4-3-3') as FormationType;
}

function asFoot(v: string): Player['preferredFoot'] {
  if (v === 'left' || v === 'right' || v === 'both') return v;
  return 'right';
}

function mapDbPlayerToCore(row: typeof onlinePlayers.$inferSelect): Player {
  const attrs = row.attributes as Player['attributes'];
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname ?? undefined,
    age: row.age,
    nationality: row.nationality,
    position: asPosition(row.position),
    preferredFoot: asFoot(row.preferredFoot),
    attributes: attrs,
    potential: row.potential,
    morale: row.morale ?? 70,
    fitness: row.fitness ?? 100,
    energy: row.energy ?? 100,
    injured: Boolean(row.injured),
    injuryWeeks: row.injuryWeeks ?? 0,
    contractEndSeason: row.contractEndSeason,
    wage: row.wage,
    marketValue: row.marketValue,
    status: 'active',
    form: {
      form: 70,
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 0,
      seasonAvgRating: 0,
    },
  };
}

function defaultTacticsForTeam(team: Team): Tactics {
  const formation: FormationType = '4-3-3';
  const { lineup, substitutes } = selectBestLineup(team, formation);
  return {
    formation,
    posture: 'balanced',
    lineup,
    substitutes,
  };
}

function tacticsFromRow(
  row: typeof onlineTactics.$inferSelect | undefined,
  team: Team,
): Tactics {
  if (!row) return defaultTacticsForTeam(team);
  const formation = asFormation(row.formation);
  const lineup = (row.lineup as string[]).filter(Boolean);
  const substitutes = (row.substitutes as string[]).filter(Boolean);
  if (lineup.length < 11) {
    return defaultTacticsForTeam(team);
  }
  return {
    formation,
    posture:
      row.posture === 'defensive' || row.posture === 'attacking'
        ? row.posture
        : 'balanced',
    lineup,
    substitutes,
  };
}

export type OnlineMatchBootstrap = {
  live: LiveMatchState;
  leagueId: string;
  seasonLabel: string;
  round: number;
  homeUserId: string | null;
  awayUserId: string | null;
};

/**
 * Load fixture + squads + tactics; build a single LiveMatchState (both sides human).
 */
export async function loadOnlineMatchBootstrap(
  db: ReturnType<typeof drizzle>,
  fixtureId: string,
): Promise<OnlineMatchBootstrap | null> {
  const [fx] = await db
    .select()
    .from(onlineFixtures)
    .where(eq(onlineFixtures.id, fixtureId))
    .limit(1);

  if (!fx || fx.played) {
    return null;
  }

  const [league] = await db
    .select()
    .from(onlineLeagues)
    .where(eq(onlineLeagues.id, fx.leagueId))
    .limit(1);

  if (!league || league.status !== 'active') {
    return null;
  }

  const seasonLabel = fx.seasonLabel;

  const [homeRow, awayRow] = await Promise.all([
    db
      .select()
      .from(onlineTeams)
      .where(
        and(
          eq(onlineTeams.id, fx.homeTeamId),
          eq(onlineTeams.leagueId, fx.leagueId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(onlineTeams)
      .where(
        and(
          eq(onlineTeams.id, fx.awayTeamId),
          eq(onlineTeams.leagueId, fx.leagueId),
        ),
      )
      .limit(1),
  ]);

  const ht = homeRow[0];
  const at = awayRow[0];
  if (!ht || !at) return null;

  const homePlayersRows = await db
    .select()
    .from(onlinePlayers)
    .where(
      and(
        eq(onlinePlayers.leagueId, fx.leagueId),
        eq(onlinePlayers.teamId, ht.id),
      ),
    );

  const awayPlayersRows = await db
    .select()
    .from(onlinePlayers)
    .where(
      and(
        eq(onlinePlayers.leagueId, fx.leagueId),
        eq(onlinePlayers.teamId, at.id),
      ),
    );

  const homePlayers = homePlayersRows.map(mapDbPlayerToCore);
  const awayPlayers = awayPlayersRows.map(mapDbPlayerToCore);

  const homeTeam: Team = {
    id: ht.id,
    name: ht.name,
    shortName: ht.shortName,
    badgeUrl: ht.badgeUrl ?? undefined,
    primaryColor: ht.primaryColor,
    secondaryColor: ht.secondaryColor,
    stadium: ht.stadium,
    capacity: ht.capacity,
    reputation: ht.reputation,
    budget: ht.budget,
    wageBudget: ht.wageBudget,
    players: homePlayers,
    momentum: ht.momentum ?? 50,
    lastFiveResults: (ht.lastFiveResults as ('W' | 'D' | 'L')[]) ?? [],
  };

  const awayTeam: Team = {
    id: at.id,
    name: at.name,
    shortName: at.shortName,
    badgeUrl: at.badgeUrl ?? undefined,
    primaryColor: at.primaryColor,
    secondaryColor: at.secondaryColor,
    stadium: at.stadium,
    capacity: at.capacity,
    reputation: at.reputation,
    budget: at.budget,
    wageBudget: at.wageBudget,
    players: awayPlayers,
    momentum: at.momentum ?? 50,
    lastFiveResults: (at.lastFiveResults as ('W' | 'D' | 'L')[]) ?? [],
  };

  const [homeTacticsRow] = await db
    .select()
    .from(onlineTactics)
    .where(
      and(
        eq(onlineTactics.leagueId, fx.leagueId),
        eq(onlineTactics.teamId, ht.id),
      ),
    )
    .limit(1);

  const [awayTacticsRow] = await db
    .select()
    .from(onlineTactics)
    .where(
      and(
        eq(onlineTactics.leagueId, fx.leagueId),
        eq(onlineTactics.teamId, at.id),
      ),
    )
    .limit(1);

  const homeTactics = tacticsFromRow(homeTacticsRow, homeTeam);
  const awayTactics = tacticsFromRow(awayTacticsRow, awayTeam);

  const state = createMatchState({
    homeTeam,
    awayTeam,
    homeTactics,
    awayTactics,
    homeControl: 'human',
    awayControl: 'human',
    fixtureId: fx.id,
  });

  const attendance = sampleAttendance(homeTeam, awayTeam, homeTeam.capacity, {
    round: fx.round,
    totalRounds: 38,
  });

  const [homeMember] = await db
    .select({ userId: onlineLeagueMembers.userId })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, fx.leagueId),
        eq(onlineLeagueMembers.onlineTeamId, fx.homeTeamId),
      ),
    )
    .limit(1);

  const [awayMember] = await db
    .select({ userId: onlineLeagueMembers.userId })
    .from(onlineLeagueMembers)
    .where(
      and(
        eq(onlineLeagueMembers.leagueId, fx.leagueId),
        eq(onlineLeagueMembers.onlineTeamId, fx.awayTeamId),
      ),
    )
    .limit(1);

  const live: LiveMatchState = {
    fixtureId: fx.id,
    homeTeam,
    awayTeam,
    homeControl: 'human',
    awayControl: 'human',
    state,
    attendance,
  };

  return {
    live,
    leagueId: fx.leagueId,
    seasonLabel,
    round: fx.round,
    homeUserId: homeMember?.userId ?? null,
    awayUserId: awayMember?.userId ?? null,
  };
}
