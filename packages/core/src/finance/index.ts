// ============================================================================
// RETROFOOT - Financial System
// ============================================================================
// All financial calculations for the per-round economy system
// 1 Round = 1 Week for financial purposes

import type {
  Player,
  Team,
  TeamFinances,
  FinancialTransaction,
  FinanceCategory,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base ticket price per spectator */
export const BASE_TICKET_PRICE = 50;

/** Base sponsorship amount for lowest reputation team */
export const BASE_SPONSORSHIP = 50_000;

/** Maximum bonus sponsorship for highest reputation team */
export const MAX_SPONSORSHIP_BONUS = 750_000;

/** Minimum team reputation in the league */
export const MIN_REPUTATION = 55;

/** Maximum team reputation in the league */
export const MAX_REPUTATION = 95;

/** Equal share of TV rights per round for all teams */
export const TV_RIGHTS_EQUAL_SHARE = 200_000;

/** Performance-based TV rights pool per round */
export const TV_RIGHTS_PERFORMANCE_POOL = 300_000;

/** Stadium maintenance cost per seat per round */
export const STADIUM_MAINTENANCE_PER_SEAT = 0.5;

/** Base operating cost per round */
export const BASE_OPERATING_COST = 100_000;

/** Operating cost multiplier per reputation point */
export const OPERATING_COST_PER_REPUTATION = 1_000;

/** Number of rounds to use as wage buffer for initial balance */
export const INITIAL_BALANCE_ROUNDS = 19; // ~half a season

/** Portion of transfer budget to use as working capital */
export const INITIAL_BALANCE_BUDGET_PORTION = 0.1;

// ============================================================================
// INCOME CALCULATIONS
// ============================================================================

/**
 * Calculate attendance for a home match based on team reputations and form
 */
export function calculateAttendance(
  homeTeam: Pick<Team, 'reputation' | 'momentum'>,
  awayTeam: Pick<Team, 'reputation'>,
  stadiumCapacity: number,
): number {
  // Base fill rate from reputation (50-90%)
  const baseFillRate = 0.4 + (homeTeam.reputation / 100) * 0.5;

  // Opponent boost (big games fill more) - 0 to 0.5
  const opponentBoost = awayTeam.reputation / 200;

  // Momentum factor (winning teams draw crowds) - -0.25 to +0.25
  const momentumFactor = (homeTeam.momentum - 50) / 200;

  // Calculate final fill rate, capped at 100%
  const fillRate = Math.min(1, baseFillRate + opponentBoost + momentumFactor);

  return Math.floor(stadiumCapacity * fillRate);
}

/**
 * Calculate match day income from ticket sales
 * Only applies to home games
 */
export function calculateMatchDayIncome(
  attendance: number,
  ticketPrice: number = BASE_TICKET_PRICE,
): number {
  return attendance * ticketPrice;
}

/**
 * Calculate sponsorship income per round based on team reputation
 * Higher reputation teams get more sponsor money
 */
export function calculateRoundSponsorship(reputation: number): number {
  // Scale from BASE_SPONSORSHIP (rep 55) to BASE + MAX_BONUS (rep 95)
  const reputationFactor =
    (reputation - MIN_REPUTATION) / (MAX_REPUTATION - MIN_REPUTATION);
  const clampedFactor = Math.max(0, Math.min(1, reputationFactor));
  return Math.floor(BASE_SPONSORSHIP + MAX_SPONSORSHIP_BONUS * clampedFactor);
}

/**
 * Calculate TV rights income per round
 * Combines equal share + performance-based bonus
 */
export function calculateRoundTVRights(
  leaguePosition: number,
  totalTeams: number = 20,
): number {
  // Everyone gets the equal share
  // Position bonus: 1st place gets full pool, last place gets nothing
  const positionBonus =
    ((totalTeams - leaguePosition) / totalTeams) * TV_RIGHTS_PERFORMANCE_POOL;
  return Math.floor(TV_RIGHTS_EQUAL_SHARE + positionBonus);
}

/**
 * Calculate total round income for a team
 * isHomeGame determines if match day income is included
 */
export function calculateRoundIncome(
  team: Pick<Team, 'reputation' | 'momentum' | 'capacity'>,
  leaguePosition: number,
  isHomeGame: boolean,
  awayTeam?: Pick<Team, 'reputation'>,
): {
  total: number;
  matchDay: number;
  sponsorship: number;
  tvRights: number;
  attendance: number;
} {
  const sponsorship = calculateRoundSponsorship(team.reputation);
  const tvRights = calculateRoundTVRights(leaguePosition);

  let matchDay = 0;
  let attendance = 0;

  if (isHomeGame && awayTeam) {
    attendance = calculateAttendance(team, awayTeam, team.capacity);
    matchDay = calculateMatchDayIncome(attendance);
  }

  return {
    total: matchDay + sponsorship + tvRights,
    matchDay,
    sponsorship,
    tvRights,
    attendance,
  };
}

// ============================================================================
// EXPENSE CALCULATIONS
// ============================================================================

/**
 * Calculate total wages per round (sum of all player wages)
 */
export function calculateRoundWages(players: Pick<Player, 'wage'>[]): number {
  return players.reduce((sum, p) => sum + p.wage, 0);
}

/**
 * Calculate stadium maintenance cost per round
 */
export function calculateStadiumMaintenance(capacity: number): number {
  return Math.floor(capacity * STADIUM_MAINTENANCE_PER_SEAT);
}

/**
 * Calculate operating costs per round
 * Bigger clubs have bigger overhead
 */
export function calculateOperatingCosts(reputation: number): number {
  return Math.floor(
    BASE_OPERATING_COST + reputation * OPERATING_COST_PER_REPUTATION,
  );
}

/**
 * Calculate total round expenses for a team
 */
export function calculateRoundExpenses(
  team: Pick<Team, 'reputation' | 'capacity' | 'players'>,
): {
  total: number;
  wages: number;
  stadium: number;
  operations: number;
} {
  const wages = calculateRoundWages(team.players);
  const stadium = calculateStadiumMaintenance(team.capacity);
  const operations = calculateOperatingCosts(team.reputation);

  return {
    total: wages + stadium + operations,
    wages,
    stadium,
    operations,
  };
}

// ============================================================================
// INITIAL BALANCE
// ============================================================================

/**
 * Calculate initial cash balance for a team when starting a new game
 * Provides a buffer to cover expenses during the first half of the season
 */
export function calculateInitialBalance(
  transferBudget: number,
  wageBudget: number,
): number {
  // Start with ~half-season of wage coverage as safety buffer
  const wageBuffer = wageBudget * INITIAL_BALANCE_ROUNDS;
  // Plus a portion of transfer budget as working capital
  const workingCapital = transferBudget * INITIAL_BALANCE_BUDGET_PORTION;
  return Math.floor(wageBuffer + workingCapital);
}

// ============================================================================
// TRANSACTION HELPERS
// ============================================================================

let transactionCounter = 0;

/**
 * Generate a unique transaction ID
 */
export function generateTransactionId(): string {
  const timestamp = Date.now();
  const counter = transactionCounter++;
  return `txn-${timestamp}-${counter}`;
}

/**
 * Create an income transaction record
 */
export function createIncomeTransaction(
  teamId: string,
  category: FinanceCategory,
  amount: number,
  description: string,
  round: number,
): FinancialTransaction {
  return {
    id: generateTransactionId(),
    teamId,
    type: 'income',
    category,
    amount,
    description,
    round,
  };
}

/**
 * Create an expense transaction record
 */
export function createExpenseTransaction(
  teamId: string,
  category: FinanceCategory,
  amount: number,
  description: string,
  round: number,
): FinancialTransaction {
  return {
    id: generateTransactionId(),
    teamId,
    type: 'expense',
    category,
    amount,
    description,
    round,
  };
}

// ============================================================================
// ROUND PROCESSING
// ============================================================================

/**
 * Process all financial transactions for a team during a round advancement
 * Returns the new balance and list of transactions
 */
export function processRoundFinances(
  team: Pick<Team, 'id' | 'reputation' | 'momentum' | 'capacity' | 'players'>,
  currentBalance: number,
  leaguePosition: number,
  round: number,
  isHomeGame: boolean,
  awayTeam?: Pick<Team, 'reputation'>,
): {
  newBalance: number;
  transactions: FinancialTransaction[];
  income: ReturnType<typeof calculateRoundIncome>;
  expenses: ReturnType<typeof calculateRoundExpenses>;
} {
  const transactions: FinancialTransaction[] = [];

  // Calculate income
  const income = calculateRoundIncome(
    team,
    leaguePosition,
    isHomeGame,
    awayTeam,
  );

  // Calculate expenses
  const expenses = calculateRoundExpenses(team);

  // Create income transactions
  if (income.matchDay > 0) {
    transactions.push(
      createIncomeTransaction(
        team.id,
        'match_day',
        income.matchDay,
        `Match day revenue (${income.attendance.toLocaleString()} fans)`,
        round,
      ),
    );
  }

  transactions.push(
    createIncomeTransaction(
      team.id,
      'sponsorship',
      income.sponsorship,
      'Sponsorship payment',
      round,
    ),
  );

  transactions.push(
    createIncomeTransaction(
      team.id,
      'tv_rights',
      income.tvRights,
      `TV rights (Position ${leaguePosition})`,
      round,
    ),
  );

  // Create expense transactions
  transactions.push(
    createExpenseTransaction(
      team.id,
      'wages',
      expenses.wages,
      `Player wages (${team.players.length} players)`,
      round,
    ),
  );

  transactions.push(
    createExpenseTransaction(
      team.id,
      'stadium',
      expenses.stadium,
      'Stadium maintenance',
      round,
    ),
  );

  transactions.push(
    createExpenseTransaction(
      team.id,
      'operations',
      expenses.operations,
      'Operating costs',
      round,
    ),
  );

  // Calculate new balance
  const newBalance = currentBalance + income.total - expenses.total;

  return {
    newBalance,
    transactions,
    income,
    expenses,
  };
}

// ============================================================================
// FINANCIAL SUMMARY
// ============================================================================

/**
 * Create a TeamFinances summary object
 */
export function createTeamFinances(
  balance: number,
  players: Pick<Player, 'wage'>[],
  lastRoundIncome: number = 0,
  lastMatchIncome: number = 0,
  seasonRevenue: number = 0,
  seasonExpenses: number = 0,
): TeamFinances {
  return {
    balance,
    roundWages: calculateRoundWages(players),
    lastRoundIncome,
    lastMatchIncome,
    seasonRevenue,
    seasonExpenses,
  };
}

/**
 * Format currency for display (Brazilian Real style)
 */
export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 1_000_000_000) {
    return `${sign}R$ ${(absAmount / 1_000_000_000).toFixed(1)}B`;
  } else if (absAmount >= 1_000_000) {
    return `${sign}R$ ${(absAmount / 1_000_000).toFixed(1)}M`;
  } else if (absAmount >= 1_000) {
    return `${sign}R$ ${(absAmount / 1_000).toFixed(0)}K`;
  }
  return `${sign}R$ ${absAmount.toLocaleString()}`;
}

/**
 * Calculate projected season-end balance based on current trends
 * Assumes current income/expense rates continue
 */
export function projectSeasonEndBalance(
  currentBalance: number,
  roundsPlayed: number,
  totalRounds: number,
  seasonRevenue: number,
  seasonExpenses: number,
): number {
  if (roundsPlayed === 0) return currentBalance;

  const avgNetPerRound = (seasonRevenue - seasonExpenses) / roundsPlayed;
  const remainingRounds = totalRounds - roundsPlayed;

  return Math.floor(currentBalance + avgNetPerRound * remainingRounds);
}
