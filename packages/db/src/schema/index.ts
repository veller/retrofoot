// ============================================================================
// RETROFOOT - Database Schema (Drizzle + SQLite/D1)
// ============================================================================

import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ============================================================================
// Users & Authentication
// ============================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  name: text('name'),
  image: text('image'), // Optional user avatar
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), // Session token for Better Auth
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'), // For security tracking
  userAgent: text('user_agent'), // For security tracking
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(), // Better Auth uses this for credential accounts
  providerId: text('provider_id').notNull(), // 'credential' for email/password
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp',
  }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp',
  }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'), // Hashed password for credential provider
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // Email or other identifier
  value: text('value').notNull(), // Token value
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

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
  gameOver: integer('game_over', { mode: 'boolean' }).default(false),
  gameOverReason: text('game_over_reason'), // 'relegated' | null
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

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
  // Team form tracking
  momentum: integer('momentum').default(50),
  lastFiveResults: text('last_five_results', { mode: 'json' }).default([]),
  // Financial tracking
  balance: integer('balance').default(0), // Current cash balance
  roundWages: integer('round_wages').default(0), // Cached sum of player wages per round
  seasonRevenue: integer('season_revenue').default(0), // Running total this season
  seasonExpenses: integer('season_expenses').default(0), // Running total this season
});

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
  position: text('position').notNull(), // GK, DEF, MID, ATT
  preferredFoot: text('preferred_foot').notNull(),

  // Attributes stored as JSON for flexibility
  attributes: text('attributes', { mode: 'json' }).notNull(),

  potential: integer('potential').notNull(),
  morale: integer('morale').default(70),
  fitness: integer('fitness').default(100),
  injured: integer('injured', { mode: 'boolean' }).default(false),
  injuryWeeks: integer('injury_weeks').default(0),
  contractEndSeason: integer('contract_end_season').notNull(),
  wage: integer('wage').notNull(),
  marketValue: integer('market_value').notNull(),

  // Player status and form tracking
  status: text('status').default('active'), // active, retiring, retired, deceased, suspended
  form: integer('form').default(70), // 1-100
  lastFiveRatings: text('last_five_ratings', { mode: 'json' }).default([]),
  seasonGoals: integer('season_goals').default(0),
  seasonAssists: integer('season_assists').default(0),
  seasonMinutes: integer('season_minutes').default(0),
  seasonAvgRating: real('season_avg_rating').default(0),
});

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
});

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
});

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
});

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
});

// ============================================================================
// Transfer Listings (players for sale / free agents)
// ============================================================================

export const transferListings = sqliteTable(
  'transfer_listings',
  {
    id: text('id').primaryKey(),
    saveId: text('save_id')
      .notNull()
      .references(() => saves.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    teamId: text('team_id').references(() => teams.id, { onDelete: 'cascade' }), // null = free agent
    askingPrice: integer('asking_price').notNull(),
    status: text('status').notNull(), // 'available' | 'contract_expiring' | 'free_agent'
    listedRound: integer('listed_round').notNull(),
  },
  (table) => ({
    // Unique constraint: a player can only be listed once per save
    savePlayerUnique: uniqueIndex('transfer_listings_save_player_unique').on(
      table.saveId,
      table.playerId,
    ),
  }),
);

// ============================================================================
// Transfer Offers (active negotiations)
// ============================================================================

export const transferOffers = sqliteTable('transfer_offers', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  fromTeamId: text('from_team_id').references(() => teams.id, {
    onDelete: 'cascade',
  }), // null = free agent
  toTeamId: text('to_team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  offerAmount: integer('offer_amount').notNull(),
  offeredWage: integer('offered_wage').notNull(),
  contractYears: integer('contract_years').notNull(),
  status: text('status').notNull(), // pending, accepted, rejected, counter, expired, completed, cancelled
  counterAmount: integer('counter_amount'), // Counter-offer fee
  counterWage: integer('counter_wage'), // Counter-offer wage
  createdRound: integer('created_round').notNull(),
  expiresRound: integer('expires_round').notNull(),
  respondedRound: integer('responded_round'),
});

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
});

// ============================================================================
// Financial Transactions (history tracking)
// ============================================================================

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'income' | 'expense'
  category: text('category').notNull(), // match_day, sponsorship, tv_rights, wages, stadium, operations, etc.
  amount: integer('amount').notNull(),
  description: text('description'),
  round: integer('round').notNull(), // Which round this transaction occurred
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// ============================================================================
// Season History (tracks completed seasons)
// ============================================================================

export const seasonHistory = sqliteTable('season_history', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  seasonYear: text('season_year').notNull(), // e.g., "2024/25"
  championTeamId: text('champion_team_id').notNull(),
  championTeamName: text('champion_team_name').notNull(),
  starPlayerId: text('star_player_id').notNull(),
  starPlayerName: text('star_player_name').notNull(),
  topScorerId: text('top_scorer_id').notNull(),
  topScorerName: text('top_scorer_name').notNull(),
  topScorerGoals: integer('top_scorer_goals').notNull(),
  topAssisterId: text('top_assister_id').notNull(),
  topAssisterName: text('top_assister_name').notNull(),
  topAssisterAssists: integer('top_assister_assists').notNull(),
  playerTeamId: text('player_team_id').notNull(),
  playerTeamPosition: integer('player_team_position').notNull(),
  playerTeamPoints: integer('player_team_points').notNull(),
  playerTeamRelegated: integer('player_team_relegated', {
    mode: 'boolean',
  }).default(false),
  relegatedTeamIds: text('relegated_team_ids', { mode: 'json' }).notNull(), // Array of team IDs
  completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// Achievements (trophies, records, milestones)
// ============================================================================

export const achievements = sqliteTable('achievements', {
  id: text('id').primaryKey(),
  saveId: text('save_id')
    .notNull()
    .references(() => saves.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'trophy' | 'record' | 'milestone'
  key: text('key').notNull(), // e.g., 'league_champion', 'top_scorer', '100_matches'
  value: text('value'), // Optional value (e.g., goal count for record)
  seasonYear: text('season_year'), // Season when achieved (for trophies)
  unlockedAt: integer('unlocked_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// Type exports for use in application
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

export type Save = typeof saves.$inferSelect;
export type NewSave = typeof saves.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;

export type Standing = typeof standings.$inferSelect;
export type NewStanding = typeof standings.$inferInsert;

export type Fixture = typeof fixtures.$inferSelect;
export type NewFixture = typeof fixtures.$inferInsert;

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;

export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;

export type Tactics = typeof tactics.$inferSelect;
export type NewTactics = typeof tactics.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type TransferListing = typeof transferListings.$inferSelect;
export type NewTransferListing = typeof transferListings.$inferInsert;

export type TransferOffer = typeof transferOffers.$inferSelect;
export type NewTransferOffer = typeof transferOffers.$inferInsert;

export type SeasonHistory = typeof seasonHistory.$inferSelect;
export type NewSeasonHistory = typeof seasonHistory.$inferInsert;

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
