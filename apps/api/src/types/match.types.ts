// ============================================================================
// RETROFOOT - Match Type Definitions
// ============================================================================
// Consolidated type definitions for match-related operations

import { z } from 'zod';

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

/**
 * Schema for match event validation
 */
export const MatchEventSchema = z.object({
  minute: z.number().int().min(0).max(120),
  type: z.enum([
    'goal',
    'own_goal',
    'penalty_scored',
    'penalty_missed',
    'yellow_card',
    'red_card',
    'injury',
    'substitution',
    'chance_missed',
    'save',
    'corner',
    'free_kick',
    'offside',
    'kickoff',
    'half_time',
    'full_time',
  ]),
  team: z.enum(['home', 'away']),
  playerId: z.string().optional(),
  playerName: z.string().optional(),
  assistPlayerId: z.string().optional(),
  assistPlayerName: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Schema for match result input validation
 */
export const MatchResultInputSchema = z.object({
  fixtureId: z.string().min(1),
  homeScore: z.number().int().min(0).max(50),
  awayScore: z.number().int().min(0).max(50),
  attendance: z.number().int().min(0),
  events: z.array(MatchEventSchema),
  lineupPlayerIds: z.array(z.string()).optional(),
  substitutionMinutes: z
    .record(z.string(), z.number().int().min(0).max(120))
    .optional(),
  lineupByTeam: z
    .object({
      home: z.array(z.string()),
      away: z.array(z.string()),
    })
    .optional(),
  substitutionMinutesByTeam: z
    .object({
      home: z.record(z.string(), z.number().int().min(0).max(120)),
      away: z.record(z.string(), z.number().int().min(0).max(120)),
    })
    .optional(),
});

/**
 * Schema for complete round request body
 */
export const CompleteRoundRequestSchema = z.object({
  results: z.array(MatchResultInputSchema).min(1),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

/**
 * Match event from the client
 */
export type MatchEvent = z.infer<typeof MatchEventSchema>;

/**
 * Match result input from client for completing a round
 */
export type MatchResultInput = z.infer<typeof MatchResultInputSchema>;

/**
 * Complete round request body
 */
export type CompleteRoundRequest = z.infer<typeof CompleteRoundRequestSchema>;

// =============================================================================
// Internal Types (not from API input)
// =============================================================================

/**
 * Standings update data for batch operations
 */
export interface StandingsUpdate {
  teamId: string;
  goalsFor: number;
  goalsAgainst: number;
  isWin: boolean;
  isDraw: boolean;
}

/**
 * Form update data for batch operations
 */
export interface FormUpdate {
  teamId: string;
  form: ('W' | 'D' | 'L')[];
}

/**
 * Team financial update for batch operations
 */
export interface TeamFinanceUpdate {
  teamId: string;
  balance: number;
  roundWages: number;
  seasonRevenue: number;
  seasonExpenses: number;
}

/**
 * Transaction record for financial tracking
 */
export interface TransactionRecord {
  id: string;
  saveId: string;
  teamId: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  round: number;
  createdAt: Date;
}

/**
 * Player update for batch operations
 */
export interface PlayerStatsUpdate {
  playerId: string;
  attributes: string;
  form: number;
  lastFiveRatings: string;
  seasonMinutes: number;
  seasonAvgRating: number;
  energy: number;
}

/**
 * Optional context for processRoundFinances to skip internal fetches (round complete flow)
 */
export interface RoundFinancesContext {
  teams: Array<{
    id: string;
    name: string;
    reputation: number;
    capacity: number;
    momentum: number | null;
    balance: number | null;
    seasonRevenue: number | null;
    seasonExpenses: number | null;
  }>;
  players: Array<{ id: string; teamId: string | null; wage: number }>;
  standings: Array<{ teamId: string; position: number | null }>;
  roundFixtures: Array<{
    id: string;
    homeTeamId: string;
    awayTeamId: string;
  }>;
}

/**
 * Optional context for processPlayerStatsAndGrowth to skip internal fetches (round complete flow)
 */
export interface PlayerStatsContext {
  teamPlayers: Array<{
    id: string;
    name: string;
    nickname: string | null;
    age: number;
    nationality: string;
    position: string;
    preferredFoot: string;
    attributes: unknown;
    potential: number;
    morale: number | null;
    fitness: number | null;
    energy: number | null;
    injured: number | boolean | null;
    injuryWeeks: number | null;
    contractEndSeason: number | null;
    wage: number;
    marketValue: number;
    status: string | null;
    form: number | null;
    lastFiveRatings: unknown;
    seasonGoals: number | null;
    seasonAssists: number | null;
    seasonMinutes: number | null;
    seasonAvgRating: number | null;
  }>;
  tactics: { posture: string } | null;
  fixtureMap: Map<string, { homeTeamId: string; awayTeamId: string }>;
}
