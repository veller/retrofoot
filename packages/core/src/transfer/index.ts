// ============================================================================
// RETROFOOT - Transfer System
// ============================================================================
// Simplified transfer market inspired by Elifoot/Brasfoot
// - No complex negotiations or agent fees
// - Offer → Accept/Reject/Counter mechanics
// - Year-round transfers (no windows)
// - AI teams make predictable, rule-based decisions

import type {
  Player,
  Position,
  TransferListing,
  TransferListingStatus,
  TransferNegotiation,
} from '../types';
import { calculateOverall } from '../types';
import { DEFAULT_TRANSFER_CONFIG, type TransferConfig } from './config';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Offer expires after this many rounds if not responded to */
export const OFFER_EXPIRY_ROUNDS = 3;

/** Minimum contract length in years */
export const MIN_CONTRACT_YEARS = 1;

/** Maximum contract length in years */
export const MAX_CONTRACT_YEARS = 5;

/** Base wage calculation constant */
export const BASE_WAGE_MULTIPLIER = 10_000;

/** Reputation difference that triggers wage discount */
export const REPUTATION_WAGE_THRESHOLD = 15;

/** Age thresholds for valuation */
export const YOUTH_AGE_THRESHOLD = 24;
export const VETERAN_AGE_THRESHOLD = 29;

/** Contract expiry threshold (seasons remaining) */
export const CONTRACT_EXPIRY_THRESHOLD = 1;

/** Ideal squad size for AI decisions */
export const IDEAL_SQUAD_SIZE = 28;

/** Minimum overall relative to team average for AI buys */
export const AI_BUY_OVERALL_THRESHOLD = -5;

// ============================================================================
// VALUATION FUNCTIONS
// ============================================================================

/**
 * Calculate the asking price for a player
 * askingPrice = marketValue × ageModifier × contractModifier
 *
 * - Youth premium (+25% + potential bonus) for age < 24
 * - Age discount (-10%/year) for age > 29
 * - Contract expiry discount (-40%) for last year
 */
export function calculateAskingPrice(
  player: Player,
  currentSeason: number,
): number {
  const overall = calculateOverall(player);
  let price = player.marketValue;

  // Age modifier
  if (player.age < YOUTH_AGE_THRESHOLD) {
    // Youth premium: +25% base + potential bonus
    const potentialBonus = Math.max(0, player.potential - overall) * 0.01;
    price *= 1.25 + potentialBonus;
  } else if (player.age > VETERAN_AGE_THRESHOLD) {
    // Veteran discount: -10% per year over threshold
    const yearsOver = player.age - VETERAN_AGE_THRESHOLD;
    price *= Math.max(0.5, 1 - yearsOver * 0.1); // Cap at 50% discount
  }

  // Contract modifier: -40% if contract expires this season
  const contractYearsRemaining = player.contractEndSeason - currentSeason;
  if (contractYearsRemaining <= CONTRACT_EXPIRY_THRESHOLD) {
    price *= 0.6;
  }

  return Math.round(price);
}

/**
 * Calculate the wage a player would demand
 * baseWage = (overall/50)³ × 10,000
 *
 * - Young players accept 15% less
 * - Older players want 10% more
 * - Accept lower for bigger club (+15 reputation difference)
 */
export function calculateWageDemand(
  player: Player,
  buyingTeamReputation: number,
  sellingTeamReputation: number = 50,
): number {
  const overall = calculateOverall(player);

  // Base wage calculation: exponential based on ability
  const baseWage = Math.pow(overall / 50, 3) * BASE_WAGE_MULTIPLIER;

  let wage = baseWage;

  // Age modifier
  if (player.age < YOUTH_AGE_THRESHOLD) {
    wage *= 0.85; // Young players accept 15% less
  } else if (player.age > VETERAN_AGE_THRESHOLD) {
    wage *= 1.1; // Older players want 10% more
  }

  // Reputation modifier: accept lower for bigger clubs
  const reputationDiff = buyingTeamReputation - sellingTeamReputation;
  if (reputationDiff >= REPUTATION_WAGE_THRESHOLD) {
    wage *= 0.9; // 10% discount for significantly bigger club
  }

  return Math.round(wage);
}

/**
 * Calculate the minimum acceptable wage for a player
 * (Used for free agent negotiations)
 */
export function calculateMinimumWage(
  player: Player,
  teamReputation: number,
): number {
  const demand = calculateWageDemand(player, teamReputation);
  // Players will accept 15% less than their demand as minimum
  return Math.round(demand * 0.85);
}

// ============================================================================
// AI SELL DECISION
// ============================================================================

export type SellDecision =
  | { action: 'accept' }
  | { action: 'reject' }
  | { action: 'counter'; amount: number; wage: number };

/**
 * AI decision on whether to sell a player
 *
 * willSell if:
 * - offer >= askingPrice → Accept
 * - squad > 28 AND offer >= 80% → Accept
 * - offer >= 75% → Counter at midpoint
 * - else → Reject
 */
export function aiSellDecision(
  askingPrice: number,
  offerAmount: number,
  _offeredWage: number,
  squadSize: number,
  player: Player,
  _currentSeason: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): SellDecision {
  const priceRatio = offerAmount / askingPrice;

  // Accept if offer meets or exceeds asking price
  if (priceRatio >= config.acceptThreshold) {
    return { action: 'accept' };
  }

  // Accept if overstaffed and offer is decent
  if (
    squadSize > config.idealSquadSize &&
    priceRatio >= config.overstaffedAcceptThreshold
  ) {
    return { action: 'accept' };
  }

  // Counter if offer is close
  if (priceRatio >= config.counterThreshold) {
    // Counter at midpoint between offer and asking price
    const counterAmount = Math.round((offerAmount + askingPrice) / 2);
    // Also request slightly higher wage (current + 10%)
    const counterWage = Math.round(player.wage * 1.1);
    return { action: 'counter', amount: counterAmount, wage: counterWage };
  }

  // Reject low offers
  return { action: 'reject' };
}

// ============================================================================
// AI BUY DECISION
// ============================================================================

export interface PositionNeeds {
  GK: { current: number; ideal: number };
  DEF: { current: number; ideal: number };
  MID: { current: number; ideal: number };
  ATT: { current: number; ideal: number };
}

export const IDEAL_POSITION_COUNTS: Record<Position, number> = {
  GK: 3,
  DEF: 9,
  MID: 9,
  ATT: 7,
};

/**
 * Calculate position needs for a team
 */
export function calculatePositionNeeds(
  squadByPosition: Record<Position, number>,
): PositionNeeds {
  return {
    GK: {
      current: squadByPosition.GK || 0,
      ideal: IDEAL_POSITION_COUNTS.GK,
    },
    DEF: {
      current: squadByPosition.DEF || 0,
      ideal: IDEAL_POSITION_COUNTS.DEF,
    },
    MID: {
      current: squadByPosition.MID || 0,
      ideal: IDEAL_POSITION_COUNTS.MID,
    },
    ATT: {
      current: squadByPosition.ATT || 0,
      ideal: IDEAL_POSITION_COUNTS.ATT,
    },
  };
}

/**
 * Check if a position is needed by a team
 */
export function isPositionNeeded(
  position: Position,
  needs: PositionNeeds,
): boolean {
  const positionData = needs[position];
  return positionData.current < positionData.ideal;
}

/**
 * AI decision on whether to buy a player
 *
 * willBuy if:
 * - position needed (< ideal count)
 * - can afford (fee + wage budget)
 * - quality fits (overall >= team avg - 5)
 */
export function aiBuyDecision(
  player: Player,
  askingPrice: number,
  teamBudget: number,
  teamWageBudget: number,
  teamAverageOverall: number,
  positionNeeds: PositionNeeds,
  teamReputation: number,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG,
): {
  willBuy: boolean;
  offerAmount?: number;
  offeredWage?: number;
  contractYears?: number;
  reason?: string;
} {
  const overall = calculateOverall(player);

  // Calculate effective rating with potential bonus for young players
  const potentialBonus =
    player.age < 25
      ? Math.max(0, (player.potential - overall) * config.potentialWeightForYouth)
      : 0;
  const effectiveRating = overall + potentialBonus;

  // Check if position is needed
  if (!isPositionNeeded(player.position, positionNeeds)) {
    return { willBuy: false, reason: 'Position not needed' };
  }

  // Check if quality fits the team (using effective rating for youth potential)
  if (effectiveRating < teamAverageOverall + config.buyQualityThreshold) {
    return { willBuy: false, reason: 'Player quality too low' };
  }

  // Calculate what wage the player would demand
  const wageDemand = calculateWageDemand(player, teamReputation);

  // Check if can afford the transfer fee
  if (askingPrice > teamBudget * config.maxBudgetSpendRatio) {
    return { willBuy: false, reason: 'Cannot afford transfer fee' };
  }

  // Check if can afford the wage
  if (wageDemand > teamWageBudget * config.maxWageAllocationRatio) {
    return { willBuy: false, reason: 'Cannot afford wages' };
  }

  // Decide offer amount based on config ratio
  const offerAmount = Math.round(askingPrice * config.offerPriceRatio);

  // Contract years based on age
  let contractYears: number;
  if (player.age < 25) {
    contractYears = 4;
  } else if (player.age < 30) {
    contractYears = 3;
  } else {
    contractYears = 2;
  }

  return {
    willBuy: true,
    offerAmount,
    offeredWage: wageDemand,
    contractYears,
  };
}

// ============================================================================
// FREE AGENT DECISION
// ============================================================================

/**
 * AI decision on whether to sign a free agent
 */
export function aiFreeAgentDecision(
  player: Player,
  _teamBudget: number,
  teamWageBudget: number,
  teamAverageOverall: number,
  positionNeeds: PositionNeeds,
  teamReputation: number,
): {
  willSign: boolean;
  offeredWage?: number;
  contractYears?: number;
  reason?: string;
} {
  const overall = calculateOverall(player);

  // Check if position is needed
  if (!isPositionNeeded(player.position, positionNeeds)) {
    return { willSign: false, reason: 'Position not needed' };
  }

  // Check if quality fits (free agents can be slightly below team level)
  if (overall < teamAverageOverall + AI_BUY_OVERALL_THRESHOLD - 3) {
    return { willSign: false, reason: 'Player quality too low' };
  }

  // Calculate what wage the player would demand
  const wageDemand = calculateWageDemand(player, teamReputation);

  // Check if can afford the wage
  if (wageDemand > teamWageBudget * 0.1) {
    return { willSign: false, reason: 'Cannot afford wages' };
  }

  // Contract years based on age (shorter for free agents)
  let contractYears: number;
  if (player.age < 28) {
    contractYears = 3;
  } else if (player.age < 32) {
    contractYears = 2;
  } else {
    contractYears = 1;
  }

  return {
    willSign: true,
    offeredWage: wageDemand,
    contractYears,
  };
}

// ============================================================================
// CONTRACT RENEWAL DECISION
// ============================================================================

/**
 * Decide if a player's contract should be auto-renewed at season end
 * Auto-renew good players (overall >= 65, age < 33)
 */
export function shouldAutoRenew(player: Player): boolean {
  const overall = calculateOverall(player);
  return overall >= 65 && player.age < 33;
}

// ============================================================================
// LISTING HELPERS
// ============================================================================

let listingCounter = 0;

/**
 * Generate a unique listing ID
 * @param saveId Optional saveId to include for uniqueness across saves
 */
export function generateListingId(saveId?: string): string {
  const timestamp = Date.now();
  const counter = listingCounter++;
  const savePrefix = saveId ? `${saveId.slice(0, 8)}-` : '';
  return `lst-${savePrefix}${timestamp}-${counter}`;
}

let offerCounter = 0;

/**
 * Generate a unique offer ID
 * @param saveId Optional saveId to include for uniqueness across saves
 */
export function generateOfferId(saveId?: string): string {
  const timestamp = Date.now();
  const counter = offerCounter++;
  const savePrefix = saveId ? `${saveId.slice(0, 8)}-` : '';
  return `off-${savePrefix}${timestamp}-${counter}`;
}

/**
 * Create a transfer listing for a player
 */
export function createTransferListing(
  player: Player & { id: string },
  teamId: string | null,
  teamName: string | null,
  currentSeason: number,
  currentRound: number,
  status: TransferListingStatus = 'available',
): TransferListing {
  const overall = calculateOverall(player);
  const askingPrice =
    status === 'free_agent' ? 0 : calculateAskingPrice(player, currentSeason);

  return {
    id: generateListingId(),
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    age: player.age,
    overall,
    potential: player.potential,
    teamId,
    teamName,
    askingPrice,
    currentWage: player.wage,
    status,
    contractEndSeason: player.contractEndSeason,
    listedRound: currentRound,
  };
}

/**
 * Create a transfer offer/negotiation
 */
export function createTransferOffer(
  saveId: string,
  player: Player & { id: string },
  fromTeamId: string | null,
  fromTeamName: string | null,
  toTeamId: string,
  toTeamName: string,
  offerAmount: number,
  offeredWage: number,
  contractYears: number,
  currentRound: number,
): TransferNegotiation {
  return {
    id: generateOfferId(),
    saveId,
    playerId: player.id,
    playerName: player.name,
    fromTeamId,
    fromTeamName,
    toTeamId,
    toTeamName,
    offerAmount,
    offeredWage,
    contractYears,
    status: 'pending',
    createdRound: currentRound,
    expiresRound: currentRound + OFFER_EXPIRY_ROUNDS,
  };
}

// ============================================================================
// AI LISTING DECISION
// ============================================================================

/**
 * Decide which players an AI team should list for sale
 *
 * List players if:
 * - Squad size > ideal + 2
 * - Player is lowest rated at their position
 * - Player's contract is expiring and won't renew
 */
export function aiSelectPlayersToList(
  players: (Player & { id: string })[],
  currentSeason: number,
): (Player & { id: string })[] {
  const toList: (Player & { id: string })[] = [];
  const squadSize = players.length;

  // If overstaffed, find the weakest players at each overstaffed position
  if (squadSize > IDEAL_SQUAD_SIZE + 2) {
    const byPosition: Record<Position, (Player & { id: string })[]> = {
      GK: [],
      DEF: [],
      MID: [],
      ATT: [],
    };

    // Group players by position
    for (const player of players) {
      byPosition[player.position].push(player);
    }

    // For each position, list the weakest if overstaffed
    for (const position of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
      const positionPlayers = byPosition[position];
      const ideal = IDEAL_POSITION_COUNTS[position];

      if (positionPlayers.length > ideal) {
        // Sort by overall ascending
        const sorted = [...positionPlayers].sort(
          (a, b) => calculateOverall(a) - calculateOverall(b),
        );
        // List the weakest ones
        const excess = positionPlayers.length - ideal;
        for (let i = 0; i < excess; i++) {
          toList.push(sorted[i]);
        }
      }
    }
  }

  // Also list players with expiring contracts who won't renew
  for (const player of players) {
    if (!toList.includes(player)) {
      const contractYearsRemaining = player.contractEndSeason - currentSeason;
      if (
        contractYearsRemaining <= CONTRACT_EXPIRY_THRESHOLD &&
        !shouldAutoRenew(player)
      ) {
        toList.push(player);
      }
    }
  }

  return toList;
}

// ============================================================================
// FREE AGENT GENERATION
// ============================================================================

/** Number of free agents to generate initially */
export const INITIAL_FREE_AGENT_COUNT = 30;

/** Distribution of free agents by position */
export const FREE_AGENT_DISTRIBUTION: Record<Position, number> = {
  GK: 3,
  DEF: 10,
  MID: 10,
  ATT: 7,
};

/** Percentage of free agents who are veterans vs younger rejects */
export const VETERAN_FREE_AGENT_RATIO = 0.7;

// Common first names for procedural generation
const FIRST_NAMES = [
  'João',
  'Pedro',
  'Lucas',
  'Gabriel',
  'Matheus',
  'Rafael',
  'Bruno',
  'Felipe',
  'Gustavo',
  'Daniel',
  'Thiago',
  'Eduardo',
  'Marcos',
  'Roberto',
  'Carlos',
  'André',
  'Fernando',
  'Ricardo',
  'Diego',
  'Leandro',
  'Marcelo',
  'Alessandro',
  'Rodrigo',
  'Vinicius',
  'Paulo',
  'Henrique',
  'Junior',
  'Sergio',
  'Antonio',
  'Miguel',
  'Leonardo',
  'Fabio',
  'Claudio',
  'Jorge',
  'Alex',
  'William',
];

// Common last names for procedural generation
const LAST_NAMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Lima',
  'Pereira',
  'Costa',
  'Rodrigues',
  'Almeida',
  'Ferreira',
  'Gomes',
  'Martins',
  'Araújo',
  'Barbosa',
  'Ribeiro',
  'Carvalho',
  'Mendes',
  'Nascimento',
  'Moreira',
  'Cardoso',
  'Correia',
  'Teixeira',
  'Nunes',
  'Cavalcanti',
  'Monteiro',
  'Campos',
  'Vieira',
  'Marques',
  'Batista',
  'Dias',
  'Freitas',
  'Andrade',
  'Pinto',
  'Castro',
  'Rocha',
  'Moura',
  'Bezerra',
  'Fonseca',
  'Melo',
  'Borges',
];

/**
 * Generate a random name for a free agent
 */
function generatePlayerName(): string {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${firstName} ${lastName}`;
}

/**
 * Generate random attributes based on target overall
 */
function generateAttributes(
  position: Position,
  targetOverall: number,
): Record<string, number> {
  // Base variation around target
  const variance = 8;

  const randomAttr = () =>
    Math.max(
      30,
      Math.min(
        95,
        targetOverall + Math.floor((Math.random() - 0.5) * 2 * variance),
      ),
    );

  // Generate position-appropriate attributes
  if (position === 'GK') {
    return {
      speed: randomAttr() - 10,
      strength: randomAttr(),
      stamina: randomAttr() - 5,
      shooting: 30 + Math.floor(Math.random() * 20),
      passing: randomAttr() - 15,
      dribbling: 30 + Math.floor(Math.random() * 20),
      heading: randomAttr() - 10,
      tackling: 30 + Math.floor(Math.random() * 20),
      positioning: randomAttr(),
      vision: randomAttr() - 10,
      composure: randomAttr(),
      aggression: randomAttr() - 15,
      reflexes: randomAttr() + 5,
      handling: randomAttr() + 5,
      diving: randomAttr() + 5,
    };
  }

  if (position === 'DEF') {
    return {
      speed: randomAttr(),
      strength: randomAttr() + 5,
      stamina: randomAttr(),
      shooting: randomAttr() - 15,
      passing: randomAttr() - 5,
      dribbling: randomAttr() - 10,
      heading: randomAttr() + 5,
      tackling: randomAttr() + 10,
      positioning: randomAttr() + 5,
      vision: randomAttr() - 5,
      composure: randomAttr(),
      aggression: randomAttr(),
      reflexes: 40 + Math.floor(Math.random() * 20),
      handling: 40 + Math.floor(Math.random() * 20),
      diving: 40 + Math.floor(Math.random() * 20),
    };
  }

  if (position === 'MID') {
    return {
      speed: randomAttr(),
      strength: randomAttr() - 5,
      stamina: randomAttr() + 5,
      shooting: randomAttr(),
      passing: randomAttr() + 5,
      dribbling: randomAttr(),
      heading: randomAttr() - 5,
      tackling: randomAttr(),
      positioning: randomAttr(),
      vision: randomAttr() + 5,
      composure: randomAttr(),
      aggression: randomAttr() - 5,
      reflexes: 40 + Math.floor(Math.random() * 20),
      handling: 40 + Math.floor(Math.random() * 20),
      diving: 40 + Math.floor(Math.random() * 20),
    };
  }

  // ATT
  return {
    speed: randomAttr() + 5,
    strength: randomAttr() - 5,
    stamina: randomAttr(),
    shooting: randomAttr() + 10,
    passing: randomAttr() - 5,
    dribbling: randomAttr() + 5,
    heading: randomAttr(),
    tackling: randomAttr() - 15,
    positioning: randomAttr() + 5,
    vision: randomAttr(),
    composure: randomAttr() + 5,
    aggression: randomAttr() - 10,
    reflexes: 40 + Math.floor(Math.random() * 20),
    handling: 40 + Math.floor(Math.random() * 20),
    diving: 40 + Math.floor(Math.random() * 20),
  };
}

export interface FreeAgentData {
  templateId: string;
  name: string;
  nickname: string | null;
  age: number;
  nationality: string;
  position: Position;
  preferredFoot: 'left' | 'right' | 'both';
  attributes: Record<string, number>;
  potential: number;
  contractEndSeason: number;
  wage: number;
  marketValue: number;
  status: 'active';
  form: {
    form: number;
    lastFiveRatings: number[];
    seasonGoals: number;
    seasonAssists: number;
    seasonMinutes: number;
    seasonAvgRating: number;
  };
}

let freeAgentCounter = 0;

/**
 * Generate a single free agent
 */
export function generateFreeAgent(
  position: Position,
  isVeteran: boolean,
  currentSeason: number,
): FreeAgentData {
  // Determine age and overall based on type
  let age: number;
  let overall: number;

  if (isVeteran) {
    // Veterans: age 30-37, overall 55-72
    age = 30 + Math.floor(Math.random() * 8);
    overall = 55 + Math.floor(Math.random() * 18);
  } else {
    // Younger rejects: age 20-26, overall 45-65
    age = 20 + Math.floor(Math.random() * 7);
    overall = 45 + Math.floor(Math.random() * 21);
  }

  // Potential based on age and overall
  const potentialBonus = isVeteran
    ? Math.floor(Math.random() * 3) // Veterans have low potential gain
    : Math.floor(Math.random() * 15); // Young players can develop
  const potential = Math.min(99, overall + potentialBonus);

  // Generate attributes
  const attributes = generateAttributes(position, overall);

  // Calculate wage and market value
  const baseWage = Math.pow(overall / 50, 3) * BASE_WAGE_MULTIPLIER;
  const wage = Math.round(baseWage * 0.7); // Free agents accept lower wages
  const marketValue = Math.round(baseWage * 50 * (1 - (age - 20) * 0.02));

  const templateId = `fa-${Date.now()}-${freeAgentCounter++}`;

  return {
    templateId,
    name: generatePlayerName(),
    nickname: null,
    age,
    nationality: 'Brazil',
    position,
    preferredFoot: Math.random() > 0.8 ? 'left' : 'right',
    attributes,
    potential,
    contractEndSeason: currentSeason, // Expired contract
    wage,
    marketValue,
    status: 'active',
    form: {
      form: 50 + Math.floor(Math.random() * 20),
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 0,
      seasonAvgRating: 0,
    },
  };
}

/**
 * Generate the initial pool of free agents
 * 30 players: 3 GK, 10 DEF, 10 MID, 7 ATT
 * 70% veterans (age 30-37, overall 55-72)
 * 30% younger rejects (age 20-26, overall 45-65)
 */
export function generateInitialFreeAgents(
  currentSeason: number,
): FreeAgentData[] {
  const freeAgents: FreeAgentData[] = [];

  for (const position of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    const count = FREE_AGENT_DISTRIBUTION[position];
    const veteranCount = Math.round(count * VETERAN_FREE_AGENT_RATIO);

    for (let i = 0; i < count; i++) {
      const isVeteran = i < veteranCount;
      freeAgents.push(generateFreeAgent(position, isVeteran, currentSeason));
    }
  }

  return freeAgents;
}

// ============================================================================
// END OF SEASON PROCESSING
// ============================================================================

/**
 * Process contract expirations at the end of a season
 * Returns players who should become free agents
 */
export function processContractExpirations(
  players: (Player & { id: string; teamId: string | null })[],
  currentSeason: number,
): {
  renewed: (Player & { id: string })[];
  released: (Player & { id: string })[];
} {
  const renewed: (Player & { id: string })[] = [];
  const released: (Player & { id: string })[] = [];

  for (const player of players) {
    // Skip players without teams (already free agents)
    if (!player.teamId) continue;

    // Check if contract expires this season
    if (player.contractEndSeason <= currentSeason) {
      if (shouldAutoRenew(player)) {
        renewed.push(player);
      } else {
        released.push(player);
      }
    }
  }

  return { renewed, released };
}

/**
 * Calculate the new contract end season for a renewed player
 */
export function calculateRenewalContractEnd(
  player: Player,
  currentSeason: number,
): number {
  // Younger players get longer contracts
  if (player.age < 25) {
    return currentSeason + 4;
  } else if (player.age < 30) {
    return currentSeason + 3;
  } else {
    return currentSeason + 2;
  }
}

// Re-export config types and defaults
export * from './config';
