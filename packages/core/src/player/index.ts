// ============================================================================
// RETROFOOT - Player System
// ============================================================================
// Player creation, development, aging, retirement

import type { Player, PlayerAttributes, Position } from '../types';
import { calculateOverall, createDefaultForm } from '../types';

// Random helpers
function random(): number {
  return Math.random();
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFromArray<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

// Generate random attribute value within a range
function randomAttribute(base: number, variance: number = 15): number {
  const value = base + randomInt(-variance, variance);
  return Math.max(1, Math.min(99, value));
}

// Determine preferred foot with realistic distribution: 70% right, 27% left, 3% both
function getPreferredFoot(): 'left' | 'right' | 'both' {
  const roll = random();
  if (roll < 0.7) return 'right';
  if (roll < 0.97) return 'left';
  return 'both';
}

// Brazilian first names for regens (fictional but Brazilian-sounding)
const FIRST_NAMES = [
  'Pedro',
  'Lucas',
  'Gabriel',
  'Matheus',
  'Rafael',
  'Bruno',
  'Felipe',
  'Gustavo',
  'Thiago',
  'Leonardo',
  'Ricardo',
  'Eduardo',
  'Marcos',
  'Vinicius',
  'Joao',
  'Carlos',
  'Fernando',
  'Diego',
  'Andre',
  'Rodrigo',
  'Henrique',
  'Caio',
  'Daniel',
  'Igor',
  'Leandro',
  'Marcelo',
  'Neymar',
  'Ronaldo',
  'Romario',
  'Zico',
  'Kaka',
  'Pele',
  'Rivaldo',
  'Adriano',
];

const LAST_NAMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Costa',
  'Pereira',
  'Almeida',
  'Ferreira',
  'Rodrigues',
  'Gomes',
  'Martins',
  'Rocha',
  'Ribeiro',
  'Carvalho',
  'Nascimento',
  'Lima',
  'Araujo',
  'Barbosa',
  'Moreira',
  'Melo',
  'Cardoso',
  'Nunes',
  'Mendes',
  'Freitas',
  'Vieira',
  'Monteiro',
];

const NICKNAMES = [
  'Bunda',
  'Gigante',
  'Maestro',
  'Foguete',
  'Tanque',
  'Perninha',
  'Baixinho',
  'Gordo',
  'Magro',
  'Cabecao',
  'Pezao',
  'Monstro',
  'Reizinho',
  'Principe',
  'Fenomeno',
  'Bruxo',
  'Camisa10',
  'Matador',
  null,
  null,
  null,
  null,
  null,
  null,
  null, // Many players have no nickname
];

// Generate a random player name
export function generatePlayerName(): { name: string; nickname?: string } {
  const firstName = randomFromArray(FIRST_NAMES);
  const lastName = randomFromArray(LAST_NAMES);
  const nickname = randomFromArray(NICKNAMES);

  return {
    name: `${firstName} ${lastName}`,
    nickname: nickname || undefined,
  };
}

// Generate attributes based on position and overall target (simplified 4 positions)
function generateAttributes(
  position: Position,
  targetOverall: number,
): PlayerAttributes {
  const base = targetOverall;

  switch (position) {
    case 'GK':
      return {
        speed: randomAttribute(base - 20, 10),
        strength: randomAttribute(base - 5, 10),
        stamina: randomAttribute(base - 10, 10),
        shooting: randomAttribute(base - 40, 10),
        passing: randomAttribute(base - 15, 10),
        dribbling: randomAttribute(base - 30, 10),
        heading: randomAttribute(base - 10, 10),
        tackling: randomAttribute(base - 30, 10),
        positioning: randomAttribute(base, 10),
        vision: randomAttribute(base - 20, 10),
        composure: randomAttribute(base, 10),
        aggression: randomAttribute(base - 20, 10),
        reflexes: randomAttribute(base + 5, 10),
        handling: randomAttribute(base + 5, 10),
        diving: randomAttribute(base + 5, 10),
      };

    case 'DEF':
      return {
        speed: randomAttribute(base - 5, 10),
        strength: randomAttribute(base + 5, 10),
        stamina: randomAttribute(base + 5, 10),
        shooting: randomAttribute(base - 20, 10),
        passing: randomAttribute(base - 5, 10),
        dribbling: randomAttribute(base - 10, 10),
        heading: randomAttribute(base + 5, 10),
        tackling: randomAttribute(base + 10, 10),
        positioning: randomAttribute(base + 5, 10),
        vision: randomAttribute(base - 10, 10),
        composure: randomAttribute(base, 10),
        aggression: randomAttribute(base + 5, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      };

    case 'MID':
      return {
        speed: randomAttribute(base, 10),
        strength: randomAttribute(base - 5, 10),
        stamina: randomAttribute(base + 5, 10),
        shooting: randomAttribute(base, 10),
        passing: randomAttribute(base + 10, 10),
        dribbling: randomAttribute(base + 5, 10),
        heading: randomAttribute(base - 10, 10),
        tackling: randomAttribute(base, 10),
        positioning: randomAttribute(base + 5, 10),
        vision: randomAttribute(base + 10, 10),
        composure: randomAttribute(base + 5, 10),
        aggression: randomAttribute(base - 5, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      };

    case 'ATT':
      return {
        speed: randomAttribute(base + 5, 10),
        strength: randomAttribute(base - 5, 10),
        stamina: randomAttribute(base, 10),
        shooting: randomAttribute(base + 15, 10),
        passing: randomAttribute(base - 5, 10),
        dribbling: randomAttribute(base + 10, 10),
        heading: randomAttribute(base, 10),
        tackling: randomAttribute(base - 25, 10),
        positioning: randomAttribute(base + 10, 10),
        vision: randomAttribute(base, 10),
        composure: randomAttribute(base + 10, 10),
        aggression: randomAttribute(base, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      };

    default:
      // Fallback balanced attributes
      return {
        speed: randomAttribute(base, 10),
        strength: randomAttribute(base, 10),
        stamina: randomAttribute(base, 10),
        shooting: randomAttribute(base, 10),
        passing: randomAttribute(base, 10),
        dribbling: randomAttribute(base, 10),
        heading: randomAttribute(base, 10),
        tackling: randomAttribute(base, 10),
        positioning: randomAttribute(base, 10),
        vision: randomAttribute(base, 10),
        composure: randomAttribute(base, 10),
        aggression: randomAttribute(base, 10),
        reflexes: randomAttribute(base - 20, 5),
        handling: randomAttribute(base - 30, 5),
        diving: randomAttribute(base - 30, 5),
      };
  }
}

// Generate a new player (for regens, youth academy, etc.)
export function generatePlayer(options: {
  position?: Position;
  ageRange?: [number, number];
  overallRange?: [number, number];
  nationality?: string;
}): Player {
  const {
    // Simplified to 4 positions with weighted distribution
    position = randomFromArray([
      'GK',
      'DEF',
      'DEF',
      'DEF',
      'DEF', // 4 defenders
      'MID',
      'MID',
      'MID',
      'MID', // 4 midfielders
      'ATT',
      'ATT',
      'ATT', // 3 attackers
    ] as Position[]),
    ageRange = [17, 35],
    overallRange = [55, 85],
    nationality = 'Brazil',
  } = options;

  const age = randomInt(ageRange[0], ageRange[1]);
  const targetOverall = randomInt(overallRange[0], overallRange[1]);
  const { name, nickname } = generatePlayerName();

  // Potential is higher for younger players
  const ageFactor = Math.max(0, (30 - age) / 13); // 17yo = 1.0, 30yo = 0.0
  const potentialBonus = Math.floor(ageFactor * 15);
  const potential = Math.min(
    99,
    targetOverall + randomInt(5, 15) + potentialBonus,
  );

  const preferredFoot = getPreferredFoot();

  const player: Player = {
    id: `player-${Date.now()}-${randomInt(1000, 9999)}`,
    name,
    nickname,
    age,
    nationality,
    position,
    preferredFoot,
    attributes: generateAttributes(position, targetOverall),
    potential,
    morale: randomInt(60, 90),
    fitness: randomInt(80, 100),
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2026 + randomInt(1, 4),
    wage: calculateWage(targetOverall),
    marketValue: calculateMarketValue(targetOverall, age),
    status: 'active',
    form: createDefaultForm(),
  };

  return player;
}

// Calculate weekly wage based on overall
function calculateWage(overall: number): number {
  // Base wage curve: exponential growth
  const baseWage = Math.pow(overall / 50, 3) * 10000;
  return Math.round(baseWage / 100) * 100; // Round to nearest 100
}

// Calculate market value based on overall and age
function calculateMarketValue(overall: number, age: number): number {
  const baseValue = Math.pow(overall / 50, 4) * 1_000_000;

  // Age modifier: peak at 25-28, decreases for older/younger
  let ageModifier = 1.0;
  if (age < 21) {
    ageModifier = 0.6 + (age - 17) * 0.1; // 17yo = 0.6, 21yo = 1.0
  } else if (age > 28) {
    ageModifier = 1.0 - (age - 28) * 0.1; // 29yo = 0.9, 33yo = 0.5
  }

  return Math.round((baseValue * ageModifier) / 10000) * 10000; // Round to nearest 10k
}

// Develop a player (called each season - Brasfoot-style simple logic)
export function developPlayer(player: Player, seasonMinutes: number): Player {
  const updated = {
    ...player,
    attributes: { ...player.attributes },
    form: { ...player.form },
  };

  // Age the player
  updated.age += 1;

  const current = calculateOverall(updated);

  // Simple growth/decline based on age
  if (updated.age < 24 && current < updated.potential) {
    // Young players grow toward potential
    const minutesFactor = Math.min(1.0, seasonMinutes / 2000);
    const growth = Math.floor(
      (updated.potential - current) * 0.15 * minutesFactor,
    );
    distributeGrowth(updated.attributes, growth);
  } else if (updated.age >= 30) {
    // Older players decline (physical faster)
    const declineRate = (updated.age - 29) * 0.5;
    const decline = Math.floor(declineRate + random() * 2);
    distributeDecline(updated.attributes, decline);
  }
  // Age 24-29: stable, no change

  // Reset season stats
  updated.form = {
    ...updated.form,
    seasonGoals: 0,
    seasonAssists: 0,
    seasonMinutes: 0,
    seasonAvgRating: 0,
  };

  // Update market value and wage
  updated.marketValue = calculateMarketValue(
    calculateOverall(updated),
    updated.age,
  );
  updated.wage = calculateWage(calculateOverall(updated));

  return updated;
}

// Distribute growth points to random attributes
function distributeGrowth(attributes: PlayerAttributes, points: number): void {
  const attrs = Object.keys(attributes) as (keyof PlayerAttributes)[];
  for (let i = 0; i < points; i++) {
    const attr = randomFromArray(attrs);
    attributes[attr] = Math.min(99, attributes[attr] + 1);
  }
}

// Distribute decline points (physical attrs decline faster)
function distributeDecline(attributes: PlayerAttributes, points: number): void {
  const physicalAttrs: (keyof PlayerAttributes)[] = [
    'speed',
    'stamina',
    'strength',
  ];
  const otherAttrs = Object.keys(attributes).filter(
    (a) => !physicalAttrs.includes(a as keyof PlayerAttributes),
  ) as (keyof PlayerAttributes)[];

  for (let i = 0; i < points; i++) {
    const attr =
      random() < 0.6
        ? randomFromArray(physicalAttrs)
        : randomFromArray(otherAttrs);
    attributes[attr] = Math.max(1, attributes[attr] - 1);
  }
}

// Check if player should retire (simple version for backwards compatibility)
export function shouldRetire(player: Player): boolean {
  if (player.age < 33) return false;
  if (player.age >= 40) return true;

  // Probability increases with age
  const retirementChance = (player.age - 32) * 0.15;
  return random() < retirementChance;
}

/**
 * Calculate enhanced retirement chance based on multiple factors
 * Returns a probability between 0 and 1
 */
export function calculateRetirementChance(
  player: Player,
  seasonMinutes: number = 0,
): number {
  // Under 33: no retirement
  if (player.age < 33) return 0;

  // Age 40+: guaranteed retirement
  if (player.age >= 40) return 1;

  // Base chance increases with age (5% at 33 → 90% at 39)
  // Scale: 33=5%, 34=15%, 35=30%, 36=45%, 37=60%, 38=75%, 39=90%
  const ageChance = 0.05 + (player.age - 33) * 0.14;

  let additionalChance = 0;

  // Low playing time modifier (+20% chance if <500 minutes)
  if (seasonMinutes < 500) {
    additionalChance += 0.2;
  }

  // Poor form modifier (+15% chance if avg rating <5.5)
  if (player.form.seasonAvgRating > 0 && player.form.seasonAvgRating < 5.5) {
    additionalChance += 0.15;
  }

  // Significant decline modifier (+10% if overall < potential - 15)
  const currentOverall = calculateOverall(player);
  if (currentOverall < player.potential - 15) {
    additionalChance += 0.1;
  }

  // Cap total chance at 95% (always a small chance they continue)
  return Math.min(0.95, ageChance + additionalChance);
}

/**
 * Enhanced retirement check using multi-factor algorithm
 */
export function shouldRetireEnhanced(
  player: Player,
  seasonMinutes: number = 0,
): boolean {
  const chance = calculateRetirementChance(player, seasonMinutes);
  return random() < chance;
}

/**
 * Generate a youth player (age 16-19) to replace retiring players
 * Lower overall but higher potential
 */
export function generateYouthPlayer(options: {
  position?: Position;
  nationality?: string;
  teamReputation?: number; // 1-100, affects quality
}): Player {
  const {
    position = randomFromArray([
      'GK',
      'DEF',
      'DEF',
      'DEF',
      'DEF',
      'MID',
      'MID',
      'MID',
      'MID',
      'ATT',
      'ATT',
      'ATT',
    ] as Position[]),
    nationality = 'Brazil',
    teamReputation = 50,
  } = options;

  // Youth players are age 16-19
  const age = randomInt(16, 19);

  // Overall based on team reputation (better teams find better youth)
  // Base: 45-55, with reputation bonus up to +15
  const repBonus = Math.floor((teamReputation / 100) * 15);
  const baseOverall = randomInt(45, 55);
  const targetOverall = Math.min(70, baseOverall + repBonus);

  const { name, nickname } = generatePlayerName();
  const preferredFoot = getPreferredFoot();

  // Higher potential for youth (10-25 above current)
  const potentialBonus = randomInt(10, 25);
  const potential = Math.min(99, targetOverall + potentialBonus);

  // Generate unique ID using timestamp + multiple random components
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`;

  const player: Player = {
    id: `youth-${uniqueId}`,
    name,
    nickname,
    age,
    nationality,
    position,
    preferredFoot,
    attributes: generateAttributes(position, targetOverall),
    potential,
    morale: randomInt(70, 90), // Youth tend to be enthusiastic
    fitness: randomInt(90, 100), // Youth are fit
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2026 + randomInt(2, 4), // Longer contracts for youth
    wage: calculateWage(targetOverall) * 0.5, // Lower wages for youth
    marketValue: calculateMarketValue(targetOverall, age),
    status: 'active',
    form: createDefaultForm(),
  };

  return player;
}

/**
 * Process retirements and generate replacement youth players
 * Returns updated player list and info about retirements/additions
 */
export function processRetirements(
  players: Player[],
  _teamId: string,
  teamReputation: number = 50,
): {
  updatedPlayers: Player[];
  retiredPlayers: Player[];
  newYouthPlayers: Player[];
} {
  const retiredPlayers: Player[] = [];
  const remainingPlayers: Player[] = [];

  // Check each player for retirement
  for (const player of players) {
    if (shouldRetireEnhanced(player, player.form.seasonMinutes)) {
      retiredPlayers.push({ ...player, status: 'retiring' as const });
    } else {
      remainingPlayers.push(player);
    }
  }

  // Generate youth players to replace retirees and maintain squad size
  const newYouthPlayers: Player[] = [];
  const targetSquadSize = 25;
  const currentSize = remainingPlayers.length;
  const deficit = Math.max(0, targetSquadSize - currentSize);

  // Also add one youth for each retiree (minimum)
  const youthToGenerate = Math.max(retiredPlayers.length, deficit);

  // Count positions to balance replacements
  const positionCounts: Record<Position, number> = {
    GK: 0,
    DEF: 0,
    MID: 0,
    ATT: 0,
  };

  for (const p of remainingPlayers) {
    positionCounts[p.position]++;
  }

  // Target distribution: 3 GK, 8 DEF, 8 MID, 6 ATT
  const targetCounts: Record<Position, number> = {
    GK: 3,
    DEF: 8,
    MID: 8,
    ATT: 6,
  };

  for (let i = 0; i < youthToGenerate; i++) {
    // Find position with biggest deficit
    let position: Position = 'MID';
    let biggestDeficit = -999;

    for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
      const deficit = targetCounts[pos] - positionCounts[pos];
      if (deficit > biggestDeficit) {
        biggestDeficit = deficit;
        position = pos;
      }
    }

    const youth = generateYouthPlayer({
      position,
      teamReputation,
    });

    newYouthPlayers.push(youth);
    positionCounts[position]++;
  }

  return {
    updatedPlayers: [...remainingPlayers, ...newYouthPlayers],
    retiredPlayers,
    newYouthPlayers,
  };
}

// Update player form after a match
export function updatePlayerForm(
  player: Player,
  matchRating: number,
  goals: number = 0,
  assists: number = 0,
  minutes: number = 0,
): Player {
  const newRatings = [...player.form.lastFiveRatings, matchRating].slice(-5);
  const avgRecent = newRatings.reduce((a, b) => a + b, 0) / newRatings.length;

  // Form moves toward recent performance
  const newForm = Math.round(player.form.form * 0.7 + avgRecent * 10 * 0.3);

  const totalMinutes = player.form.seasonMinutes + minutes;
  const totalGoals = player.form.seasonGoals + goals;
  const totalAssists = player.form.seasonAssists + assists;

  // Recalculate season average rating
  const matchCount = newRatings.length;
  const prevTotal = player.form.seasonAvgRating * (matchCount - 1);
  const newAvg =
    matchCount > 0 ? (prevTotal + matchRating) / matchCount : matchRating;

  return {
    ...player,
    form: {
      form: Math.max(1, Math.min(100, newForm)),
      lastFiveRatings: newRatings,
      seasonGoals: totalGoals,
      seasonAssists: totalAssists,
      seasonMinutes: totalMinutes,
      seasonAvgRating: Math.round(newAvg * 10) / 10,
    },
  };
}

// ============================================================================
// IN-SEASON PLAYER PROGRESSION
// ============================================================================
// Players can grow/decline during the season based on match performance

// Apply growth/decline after a match based on age, potential, and performance
export function applyMatchGrowth(
  player: Player,
  minutesPlayed: number,
  matchRating: number,
): Player {
  // Only players who played can grow/decline
  if (minutesPlayed === 0) return player;

  const updated = {
    ...player,
    attributes: { ...player.attributes },
  };

  const minutesFactor = Math.min(1.0, minutesPlayed / 90);
  const performanceFactor = (matchRating - 5) / 10; // -0.5 to +0.5 based on 0-10 rating

  if (player.age < 24) {
    // Young players: grow toward potential
    const currentOvr = calculateOverall(player);
    const growthRoom = player.potential - currentOvr;

    if (growthRoom > 0) {
      // Base growth rate adjusted by minutes and performance
      const growthRate = 0.02 * minutesFactor * (1 + performanceFactor);
      const pointsToDistribute = growthRoom * growthRate;

      if (pointsToDistribute >= 0.5) {
        // Apply small growth to random attributes
        applyAttributeGrowthPoints(
          updated.attributes,
          Math.floor(pointsToDistribute),
        );
      }
    }
  } else if (player.age >= 30) {
    // Older players: slight decline risk after poor performances
    if (matchRating < 5.5) {
      const declineRate = (0.01 * minutesFactor * (player.age - 29)) / 5;

      if (random() < declineRate) {
        // Apply small decline to physical attributes
        applyAttributeDeclinePoints(updated.attributes, 1, 'physical');
      }
    }
  }
  // Prime (24-29): no automatic attribute change

  return updated;
}

// Apply growth points to random non-GK attributes (for outfield players)
function applyAttributeGrowthPoints(
  attributes: PlayerAttributes,
  points: number,
): void {
  const growableAttrs: (keyof PlayerAttributes)[] = [
    'speed',
    'strength',
    'stamina',
    'shooting',
    'passing',
    'dribbling',
    'heading',
    'tackling',
    'positioning',
    'vision',
    'composure',
  ];

  for (let i = 0; i < points; i++) {
    const attr = randomFromArray(growableAttrs);
    attributes[attr] = Math.min(99, attributes[attr] + 1);
  }
}

// Apply decline points (physical attributes decline faster)
function applyAttributeDeclinePoints(
  attributes: PlayerAttributes,
  points: number,
  focus: 'physical' | 'all' = 'all',
): void {
  const physicalAttrs: (keyof PlayerAttributes)[] = [
    'speed',
    'stamina',
    'strength',
  ];
  const allAttrs: (keyof PlayerAttributes)[] = [
    'speed',
    'strength',
    'stamina',
    'shooting',
    'passing',
    'dribbling',
    'heading',
    'tackling',
    'positioning',
    'vision',
    'composure',
  ];

  for (let i = 0; i < points; i++) {
    const attr =
      focus === 'physical' || random() < 0.6
        ? randomFromArray(physicalAttrs)
        : randomFromArray(allAttrs);
    attributes[attr] = Math.max(1, attributes[attr] - 1);
  }
}

// Calculate a match rating for a player based on their performance
export function calculateMatchRating(
  player: Player,
  minutesPlayed: number,
  goals: number,
  assists: number,
  isCleanSheet: boolean,
): number {
  // Base rating
  let rating = 6.0;

  // Minutes factor (full 90 = full weight)
  const minutesFactor = Math.min(1.0, minutesPlayed / 60);

  // Goal contributions
  rating += goals * 1.0;
  rating += assists * 0.5;

  // Position-specific bonuses
  if (player.position === 'GK' || player.position === 'DEF') {
    if (isCleanSheet) {
      rating += 0.5;
    }
  }

  // Random variance for realism
  rating += (random() - 0.5) * 1.0;

  // Scale by minutes played (sub appearances get lower ratings)
  rating = 6.0 + (rating - 6.0) * minutesFactor;

  // Clamp to 0-10 range
  return Math.max(0, Math.min(10, Math.round(rating * 10) / 10));
}

// Calculate form trend based on last five ratings
export function calculateFormTrend(
  ratings: number[],
): 'up' | 'down' | 'stable' {
  if (ratings.length < 3) return 'stable';

  const recent = ratings.slice(-2).reduce((a, b) => a + b, 0) / 2;
  const older =
    ratings.slice(0, -2).reduce((a, b) => a + b, 0) / (ratings.length - 2);

  if (recent > older + 0.5) return 'up';
  if (recent < older - 0.5) return 'down';
  return 'stable';
}
