// ============================================================================
// RETROFOOT - Database Schema (Drizzle + SQLite/D1)
// ============================================================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ============================================================================
// Users & Authentication
// ============================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================================
// Game Saves
// ============================================================================

export const saves = sqliteTable('saves', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  playerTeamId: text('player_team_id').notNull(),
  managerName: text('manager_name').notNull(),
  managerReputation: integer('manager_reputation').default(50),
  currentSeason: text('current_season').notNull(), // e.g., "2024/25"
  currentRound: integer('current_round').default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================================
// Teams
// ============================================================================

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
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
})

// ============================================================================
// Players
// ============================================================================

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  nickname: text('nickname'),
  age: integer('age').notNull(),
  nationality: text('nationality').notNull(),
  position: text('position').notNull(),
  preferredFoot: text('preferred_foot').notNull(),

  // Attributes stored as JSON for flexibility
  attributes: text('attributes', { mode: 'json' }).notNull(),

  potential: integer('potential').notNull(),
  developmentRate: real('development_rate').notNull(),
  morale: integer('morale').default(70),
  fitness: integer('fitness').default(100),
  injured: integer('injured', { mode: 'boolean' }).default(false),
  injuryWeeks: integer('injury_weeks').default(0),
  contractEndSeason: integer('contract_end_season').notNull(),
  wage: integer('wage').notNull(),
  marketValue: integer('market_value').notNull(),
})

// ============================================================================
// Standings
// ============================================================================

export const standings = sqliteTable('standings', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  played: integer('played').default(0),
  won: integer('won').default(0),
  drawn: integer('drawn').default(0),
  lost: integer('lost').default(0),
  goalsFor: integer('goals_for').default(0),
  goalsAgainst: integer('goals_against').default(0),
  points: integer('points').default(0),
})

// ============================================================================
// Fixtures
// ============================================================================

export const fixtures = sqliteTable('fixtures', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  round: integer('round').notNull(),
  homeTeamId: text('home_team_id')
    .notNull()
    .references(() => teams.id),
  awayTeamId: text('away_team_id')
    .notNull()
    .references(() => teams.id),
  date: text('date').notNull(),
  played: integer('played', { mode: 'boolean' }).default(false),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
})

// ============================================================================
// Match Events (for replays/history)
// ============================================================================

export const matchEvents = sqliteTable('match_events', {
  id: text('id').primaryKey(),
  fixtureId: text('fixture_id')
    .notNull()
    .references(() => fixtures.id, { onDelete: 'cascade' }),
  minute: integer('minute').notNull(),
  type: text('type').notNull(),
  team: text('team').notNull(), // 'home' | 'away'
  playerId: text('player_id'),
  playerName: text('player_name'),
  description: text('description'),
})

// ============================================================================
// Transfers
// ============================================================================

export const transfers = sqliteTable('transfers', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id),
  fromTeamId: text('from_team_id').references(() => teams.id),
  toTeamId: text('to_team_id').references(() => teams.id),
  fee: integer('fee').notNull(),
  wage: integer('wage').notNull(),
  season: text('season').notNull(),
  date: text('date').notNull(),
})

// ============================================================================
// Tactics (per team per save)
// ============================================================================

export const tactics = sqliteTable('tactics', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  formation: text('formation').notNull(),
  posture: text('posture').notNull(),
  lineup: text('lineup', { mode: 'json' }).notNull(), // Array of player IDs
  substitutes: text('substitutes', { mode: 'json' }).notNull(), // Array of player IDs
})

// ============================================================================
// Type exports for use in application
// ============================================================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type Save = typeof saves.$inferSelect
export type NewSave = typeof saves.$inferInsert

export type Team = typeof teams.$inferSelect
export type NewTeam = typeof teams.$inferInsert

export type Player = typeof players.$inferSelect
export type NewPlayer = typeof players.$inferInsert

export type Standing = typeof standings.$inferSelect
export type NewStanding = typeof standings.$inferInsert

export type Fixture = typeof fixtures.$inferSelect
export type NewFixture = typeof fixtures.$inferInsert

export type MatchEvent = typeof matchEvents.$inferSelect
export type NewMatchEvent = typeof matchEvents.$inferInsert

export type Transfer = typeof transfers.$inferSelect
export type NewTransfer = typeof transfers.$inferInsert

export type Tactics = typeof tactics.$inferSelect
export type NewTactics = typeof tactics.$inferInsert
