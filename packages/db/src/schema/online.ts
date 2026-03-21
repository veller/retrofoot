// ============================================================================
// Online / multiplayer (separate from offline `saves` world)
// ============================================================================

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Lobby → seeded world → season in progress → done */
export const onlineLeagues = sqliteTable(
  'online_leagues',
  {
    id: text('id').primaryKey(),
    hostUserId: text('host_user_id').notNull(),
    inviteCode: text('invite_code').notNull().unique(),
    status: text('status').notNull().default('lobby'), // lobby | active | completed | cancelled
    maxMembers: integer('max_members').notNull().default(8),
    currentRound: integer('current_round').notNull().default(1),
    /** JSON: extra rules, display name, etc. */
    settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    hostIdx: index('online_leagues_host_user_id_idx').on(table.hostUserId),
    statusIdx: index('online_leagues_status_idx').on(table.status),
  }),
);

export const onlineLeagueMembers = sqliteTable(
  'online_league_members',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id').notNull(),
    userId: text('user_id').notNull(),
    onlineTeamId: text('online_team_id'),
    /** Core `TEAMS[].id` chosen in lobby before the host starts the league */
    lobbyPickTemplateId: text('lobby_pick_template_id'),
    role: text('role').notNull().default('player'), // host | player
    joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    leagueUserUnique: uniqueIndex('online_league_members_league_user_unique').on(
      table.leagueId,
      table.userId,
    ),
    leagueIdx: index('online_league_members_league_id_idx').on(table.leagueId),
    userIdx: index('online_league_members_user_id_idx').on(table.userId),
  }),
);

export const onlineTeams = sqliteTable(
  'online_teams',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    badgeUrl: text('badge_url'),
    primaryColor: text('primary_color').notNull(),
    secondaryColor: text('secondary_color').notNull(),
    stadium: text('stadium').notNull(),
    capacity: integer('capacity').notNull(),
    reputation: integer('reputation').notNull(),
    budget: integer('budget').notNull(),
    wageBudget: integer('wage_budget').notNull(),
    momentum: integer('momentum').default(50),
    lastFiveResults: text('last_five_results', { mode: 'json' }).default([]),
  },
  (table) => ({
    leagueIdx: index('online_teams_league_id_idx').on(table.leagueId),
  }),
);

export const onlinePlayers = sqliteTable(
  'online_players',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id').notNull(),
    teamId: text('team_id'),
    name: text('name').notNull(),
    nickname: text('nickname'),
    age: integer('age').notNull(),
    nationality: text('nationality').notNull(),
    position: text('position').notNull(),
    preferredFoot: text('preferred_foot').notNull(),
    attributes: text('attributes', { mode: 'json' }).notNull(),
    potential: integer('potential').notNull(),
    morale: integer('morale').default(70),
    fitness: integer('fitness').default(100),
    energy: integer('energy').default(100),
    injured: integer('injured', { mode: 'boolean' }).default(false),
    injuryWeeks: integer('injury_weeks').default(0),
    contractEndSeason: integer('contract_end_season').notNull(),
    wage: integer('wage').notNull(),
    marketValue: integer('market_value').notNull(),
  },
  (table) => ({
    leagueIdx: index('online_players_league_id_idx').on(table.leagueId),
    teamIdx: index('online_players_team_id_idx').on(table.teamId),
  }),
);

export const onlineStandings = sqliteTable(
  'online_standings',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id').notNull(),
    seasonLabel: text('season_label').notNull(),
    teamId: text('team_id').notNull(),
    position: integer('position').notNull(),
    played: integer('played').default(0),
    won: integer('won').default(0),
    drawn: integer('drawn').default(0),
    lost: integer('lost').default(0),
    goalsFor: integer('goals_for').default(0),
    goalsAgainst: integer('goals_against').default(0),
    points: integer('points').default(0),
  },
  (table) => ({
    leagueIdx: index('online_standings_league_id_idx').on(table.leagueId),
    leagueTeamUnique: uniqueIndex('online_standings_league_team_season_unique').on(
      table.leagueId,
      table.seasonLabel,
      table.teamId,
    ),
  }),
);

export const onlineFixtures = sqliteTable(
  'online_fixtures',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id').notNull(),
    seasonLabel: text('season_label').notNull(),
    round: integer('round').notNull(),
    homeTeamId: text('home_team_id').notNull(),
    awayTeamId: text('away_team_id').notNull(),
    kickoffAt: integer('kickoff_at', { mode: 'timestamp' }),
    status: text('status').notNull().default('scheduled'), // scheduled | live | finished | cancelled
    played: integer('played', { mode: 'boolean' }).default(false),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
  },
  (table) => ({
    leagueIdx: index('online_fixtures_league_id_idx').on(table.leagueId),
    leagueRoundIdx: index('online_fixtures_league_round_idx').on(
      table.leagueId,
      table.round,
    ),
  }),
);

export const onlineMatchSessions = sqliteTable(
  'online_match_sessions',
  {
    id: text('id').primaryKey(),
    fixtureId: text('fixture_id').notNull(),
    durableObjectId: text('durable_object_id'),
    status: text('status').notNull().default('pending'), // pending | live | half_time | completed | failed
    rngSeed: text('rng_seed'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
  },
  (table) => ({
    fixtureIdx: index('online_match_sessions_fixture_id_idx').on(table.fixtureId),
    fixtureUnique: uniqueIndex('online_match_sessions_fixture_id_unique').on(
      table.fixtureId,
    ),
  }),
);

export const onlineTactics = sqliteTable(
  'online_tactics',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id').notNull(),
    teamId: text('team_id').notNull(),
    formation: text('formation').notNull(),
    posture: text('posture').notNull(),
    lineup: text('lineup', { mode: 'json' }).notNull().$type<string[]>(),
    substitutes: text('substitutes', { mode: 'json' }).notNull().$type<string[]>(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    leagueTeamUnique: uniqueIndex('online_tactics_league_team_unique').on(
      table.leagueId,
      table.teamId,
    ),
  }),
);

export const onlineMatchEvents = sqliteTable(
  'online_match_events',
  {
    id: text('id').primaryKey(),
    fixtureId: text('fixture_id').notNull(),
    minute: integer('minute').notNull(),
    type: text('type').notNull(),
    team: text('team').notNull(),
    playerId: text('player_id'),
    playerName: text('player_name'),
    description: text('description'),
  },
  (table) => ({
    fixtureIdx: index('online_match_events_fixture_id_idx').on(table.fixtureId),
  }),
);

export const onlineAnalyticsEvents = sqliteTable(
  'online_analytics_events',
  {
    id: text('id').primaryKey(),
    eventName: text('event_name').notNull(),
    userId: text('user_id').notNull(),
    onlineLeagueId: text('online_league_id'),
    onlineFixtureId: text('online_fixture_id'),
    onlineMatchSessionId: text('online_match_session_id'),
    payload: text('payload', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    userIdx: index('online_analytics_events_user_id_idx').on(table.userId),
    leagueIdx: index('online_analytics_events_league_id_idx').on(
      table.onlineLeagueId,
    ),
    nameIdx: index('online_analytics_events_name_created_user_idx').on(
      table.eventName,
      table.createdAt,
      table.userId,
    ),
  }),
);

export type OnlineLeague = typeof onlineLeagues.$inferSelect;
export type NewOnlineLeague = typeof onlineLeagues.$inferInsert;

export type OnlineLeagueMember = typeof onlineLeagueMembers.$inferSelect;
export type NewOnlineLeagueMember = typeof onlineLeagueMembers.$inferInsert;

export type OnlineTeam = typeof onlineTeams.$inferSelect;
export type NewOnlineTeam = typeof onlineTeams.$inferInsert;

export type OnlinePlayer = typeof onlinePlayers.$inferSelect;
export type NewOnlinePlayer = typeof onlinePlayers.$inferInsert;

export type OnlineStanding = typeof onlineStandings.$inferSelect;
export type NewOnlineStanding = typeof onlineStandings.$inferInsert;

export type OnlineFixture = typeof onlineFixtures.$inferSelect;
export type NewOnlineFixture = typeof onlineFixtures.$inferInsert;

export type OnlineMatchSession = typeof onlineMatchSessions.$inferSelect;
export type NewOnlineMatchSession = typeof onlineMatchSessions.$inferInsert;

export type OnlineTactic = typeof onlineTactics.$inferSelect;
export type NewOnlineTactic = typeof onlineTactics.$inferInsert;

export type OnlineMatchEventRow = typeof onlineMatchEvents.$inferSelect;
export type NewOnlineMatchEventRow = typeof onlineMatchEvents.$inferInsert;

export type OnlineAnalyticsEvent = typeof onlineAnalyticsEvents.$inferSelect;
export type NewOnlineAnalyticsEvent = typeof onlineAnalyticsEvents.$inferInsert;
