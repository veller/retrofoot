// ============================================================================
// RETROFOOT - Core Types
// ============================================================================

// Player position types (simplified: 4 positions)
export type Position =
  | 'GK' // Goalkeeper
  | 'DEF' // Defender (CB, LB, RB, wing-backs)
  | 'MID' // Midfielder (CDM, CM, CAM, LM, RM)
  | 'ATT'; // Attacker (ST, CF, wingers)

// Player lifecycle status
export type PlayerStatus =
  | 'active' // Playing normally
  | 'retiring' // Announced retirement at season end
  | 'retired' // No longer playing
  | 'deceased' // Future dramatic events
  | 'suspended'; // Banned from football

// Player form tracking (updated after each match)
export interface PlayerForm {
  form: number; // 1-100, affects next match performance
  lastFiveRatings: number[]; // Match ratings (0-10) for trend display
  seasonGoals: number;
  seasonAssists: number;
  seasonMinutes: number;
  seasonAvgRating: number; // Average match rating this season
}

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
  nickname?: string; // e.g., "Tigrinho" for a young striker
  age: number;
  nationality: string;
  position: Position;
  preferredFoot: 'left' | 'right' | 'both';
  attributes: PlayerAttributes;
  potential: number; // 1-99, max possible overall
  morale: number; // 1-100
  fitness: number; // 1-100
  injured: boolean;
  injuryWeeks: number;
  contractEndSeason: number;
  wage: number; // Weekly wage in currency
  marketValue: number;
  // New fields
  status: PlayerStatus; // active, retiring, retired, etc.
  form: PlayerForm; // Form tracking for match performance
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
  wageBudget: number;
  players: Player[];
  // Team form tracking
  momentum: number; // 1-100, affects match simulation
  lastFiveResults: ('W' | 'D' | 'L')[]; // Last 5 match results
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
  | 'offside'
  | 'kickoff'
  | 'half_time'
  | 'full_time';

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

// Position weights for overall calculation (simplified 4 positions)
const POSITION_WEIGHTS: Record<
  Position,
  Partial<Record<keyof PlayerAttributes, number>>
> = {
  GK: { reflexes: 3, handling: 3, diving: 3, positioning: 2, composure: 1 },
  DEF: { tackling: 3, heading: 2, strength: 2, positioning: 2, speed: 1 },
  MID: {
    passing: 3,
    vision: 2,
    stamina: 2,
    dribbling: 1,
    positioning: 1,
    tackling: 1,
  },
  ATT: { shooting: 3, positioning: 2, dribbling: 2, speed: 2, composure: 1 },
};

// Calculate overall rating based on position-weighted attributes
export function calculateOverall(player: Player): number {
  const { attributes, position } = player;

  // Defensive checks for corrupted/missing data
  if (!attributes || !position) {
    return 50; // Return neutral rating for invalid players
  }

  const weights = POSITION_WEIGHTS[position];
  if (!weights) {
    return 50; // Unknown position, return neutral
  }

  let total = 0;
  let weightSum = 0;

  for (const [attr, weight] of Object.entries(weights)) {
    const value = attributes[attr as keyof PlayerAttributes];
    if (typeof value === 'number') {
      total += value * weight;
      weightSum += weight;
    }
  }

  return weightSum > 0 ? Math.round(total / weightSum) : 50;
}

// Create default player form (for new players)
export function createDefaultForm(): PlayerForm {
  return {
    form: 70, // Neutral-positive start
    lastFiveRatings: [],
    seasonGoals: 0,
    seasonAssists: 0,
    seasonMinutes: 0,
    seasonAvgRating: 0,
  };
}
