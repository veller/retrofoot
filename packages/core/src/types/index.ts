// ============================================================================
// RETROFOOT - Core Types
// ============================================================================

// Player position types
export type Position =
  | 'GK' // Goalkeeper
  | 'CB' // Center Back
  | 'LB' // Left Back
  | 'RB' // Right Back
  | 'CDM' // Defensive Midfielder
  | 'CM' // Central Midfielder
  | 'CAM' // Attacking Midfielder
  | 'LM' // Left Midfielder
  | 'RM' // Right Midfielder
  | 'LW' // Left Winger
  | 'RW' // Right Winger
  | 'ST'; // Striker

// Player attributes (classic Elifoot-style, ~15 attributes)
export interface PlayerAttributes {
  // Physical
  speed: number; // 1-99
  strength: number; // 1-99
  stamina: number; // 1-99

  // Technical
  shooting: number; // 1-99
  passing: number; // 1-99
  dribbling: number; // 1-99
  heading: number; // 1-99
  tackling: number; // 1-99

  // Mental
  positioning: number; // 1-99
  vision: number; // 1-99
  composure: number; // 1-99
  aggression: number; // 1-99

  // Goalkeeping (only relevant for GK)
  reflexes: number; // 1-99
  handling: number; // 1-99
  diving: number; // 1-99
}

// Player entity
export interface Player {
  id: string;
  name: string;
  nickname?: string; // e.g., "Bunda" for Hulk-inspired player
  age: number;
  nationality: string;
  position: Position;
  preferredFoot: 'left' | 'right' | 'both';
  attributes: PlayerAttributes;
  potential: number; // 1-99, max possible overall
  developmentRate: number; // How fast they develop (0.5-1.5)
  morale: number; // 1-100
  fitness: number; // 1-100
  injured: boolean;
  injuryWeeks: number;
  contractEndSeason: number;
  wage: number; // Weekly wage in currency
  marketValue: number;
}

// Team/Club entity
export interface Team {
  id: string;
  name: string;
  shortName: string; // 3-letter code
  badgeUrl?: string; // Pixel art badge
  primaryColor: string; // Hex color
  secondaryColor: string;
  stadium: string;
  capacity: number;
  reputation: number; // 1-100, affects transfers
  budget: number;
  wagebudget: number;
  players: Player[];
}

// Formation types
export type FormationType =
  | '4-4-2'
  | '4-3-3'
  | '4-2-3-1'
  | '3-5-2'
  | '4-5-1'
  | '5-3-2'
  | '5-4-1'
  | '3-4-3';

// Tactical posture
export type TacticalPosture = 'defensive' | 'balanced' | 'attacking';

// Match tactics
export interface Tactics {
  formation: FormationType;
  posture: TacticalPosture;
  lineup: string[]; // Player IDs in formation order
  substitutes: string[]; // Player IDs on bench
}

// Match event types
export type MatchEventType =
  | 'goal'
  | 'own_goal'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'yellow_card'
  | 'red_card'
  | 'injury'
  | 'substitution'
  | 'chance_missed'
  | 'save'
  | 'corner'
  | 'free_kick'
  | 'offside';

// Single match event
export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  description?: string;
}

// Match result
export interface MatchResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  attendance: number;
  date: string; // ISO date
}

// League standing entry
export interface StandingEntry {
  position: number;
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

// Season calendar entry
export interface Fixture {
  id: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  date: string; // ISO date
  played: boolean;
  result?: MatchResult;
}

// Season state
export interface Season {
  year: string; // e.g., "2024/25"
  currentRound: number;
  totalRounds: number;
  standings: StandingEntry[];
  fixtures: Fixture[];
  transferWindowOpen: boolean;
}

// Game save state
export interface GameSave {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  playerTeamId: string;
  currentSeason: Season;
  managerName: string;
  managerReputation: number;
}

// Transfer offer
export interface TransferOffer {
  id: string;
  playerId: string;
  fromTeamId: string;
  toTeamId: string;
  offerAmount: number;
  wage: number;
  contractYears: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

// Utility type for calculating overall rating
export function calculateOverall(player: Player): number {
  const { attributes, position } = player;

  // Weight attributes based on position
  const weights = getPositionWeights(position);

  let total = 0;
  let weightSum = 0;

  for (const [attr, weight] of Object.entries(weights)) {
    const value = attributes[attr as keyof PlayerAttributes];
    total += value * weight;
    weightSum += weight;
  }

  return Math.round(total / weightSum);
}

function getPositionWeights(
  position: Position,
): Partial<Record<keyof PlayerAttributes, number>> {
  switch (position) {
    case 'GK':
      return {
        reflexes: 3,
        handling: 3,
        diving: 3,
        positioning: 2,
        composure: 1,
      };
    case 'CB':
      return {
        tackling: 3,
        heading: 2,
        strength: 2,
        positioning: 2,
        composure: 1,
      };
    case 'LB':
    case 'RB':
      return { tackling: 2, speed: 2, stamina: 2, passing: 1, positioning: 1 };
    case 'CDM':
      return {
        tackling: 3,
        positioning: 2,
        passing: 2,
        stamina: 1,
        strength: 1,
      };
    case 'CM':
      return { passing: 3, vision: 2, stamina: 2, positioning: 1, shooting: 1 };
    case 'CAM':
      return { passing: 2, vision: 3, dribbling: 2, shooting: 2, composure: 1 };
    case 'LM':
    case 'RM':
      return { speed: 2, dribbling: 2, passing: 2, stamina: 2, shooting: 1 };
    case 'LW':
    case 'RW':
      return { speed: 3, dribbling: 3, shooting: 2, passing: 1, composure: 1 };
    case 'ST':
      return {
        shooting: 3,
        positioning: 2,
        heading: 2,
        composure: 2,
        dribbling: 1,
      };
    default:
      return { shooting: 1, passing: 1, dribbling: 1, tackling: 1, speed: 1 };
  }
}
