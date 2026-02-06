// ============================================================================
// RETROFOOT - Team System
// ============================================================================
// Team management, squad handling

import type { Team, Player, Tactics, FormationType, Position } from '../types';
import { calculateOverall } from '../types';
import { generatePlayer } from '../player';

export const FORMATION_OPTIONS: FormationType[] = [
  '4-4-2',
  '4-3-3',
  '3-5-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
  '3-4-3',
];

export const DEFAULT_FORMATION: FormationType = '4-3-3';
export const MIN_FITNESS_FOR_AVAILABILITY = 50;

export interface FormationAvailabilityCounts {
  GK: number;
  DEF: number;
  MID: number;
  ATT: number;
}

export interface FormationEligibility {
  eligible: boolean;
  required: FormationAvailabilityCounts;
  available: FormationAvailabilityCounts;
  missing: FormationAvailabilityCounts;
}

// Formation position mappings (simplified: GK, DEF, MID, ATT)
// The number after each position type indicates count needed
export const FORMATION_POSITIONS: Record<FormationType, Position[]> = {
  '4-4-2': [
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
  ],
  '4-3-3': [
    'GK',
    'DEF',
    'DEF',
    'DEF',
    'DEF',
    'MID',
    'MID',
    'MID',
    'ATT',
    'ATT',
    'ATT',
  ],
  '3-5-2': [
    'GK',
    'DEF',
    'DEF',
    'DEF',
    'MID',
    'MID',
    'MID',
    'MID',
    'MID',
    'ATT',
    'ATT',
  ],
  '4-5-1': [
    'GK',
    'DEF',
    'DEF',
    'DEF',
    'DEF',
    'MID',
    'MID',
    'MID',
    'MID',
    'MID',
    'ATT',
  ],
  '5-3-2': [
    'GK',
    'DEF',
    'DEF',
    'DEF',
    'DEF',
    'DEF',
    'MID',
    'MID',
    'MID',
    'ATT',
    'ATT',
  ],
  '5-4-1': [
    'GK',
    'DEF',
    'DEF',
    'DEF',
    'DEF',
    'DEF',
    'MID',
    'MID',
    'MID',
    'MID',
    'ATT',
  ],
  '3-4-3': [
    'GK',
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
  ],
};

export function normalizeFormation(
  formation: string | FormationType | null | undefined,
): FormationType {
  if (!formation) return DEFAULT_FORMATION;
  const normalized = String(formation).trim();
  if ((FORMATION_OPTIONS as string[]).includes(normalized)) {
    return normalized as FormationType;
  }
  const blocks = normalized.split('-');
  if (blocks.length !== 3) {
    return DEFAULT_FORMATION;
  }
  return DEFAULT_FORMATION;
}

function buildZeroCounts(): FormationAvailabilityCounts {
  return { GK: 0, DEF: 0, MID: 0, ATT: 0 };
}

function toAvailabilityCounts(
  positions: Position[],
): FormationAvailabilityCounts {
  const counts = buildZeroCounts();
  for (const position of positions) {
    counts[position] += 1;
  }
  return counts;
}

export function getFormationRequirements(
  formation: FormationType,
): FormationAvailabilityCounts {
  return toAvailabilityCounts(FORMATION_POSITIONS[formation]);
}

export function getAvailablePlayerCounts(
  players: Pick<Player, 'position' | 'injured' | 'fitness'>[],
): FormationAvailabilityCounts {
  const counts = buildZeroCounts();
  for (const player of players) {
    if (player.injured) continue;
    if ((player.fitness ?? 0) <= MIN_FITNESS_FOR_AVAILABILITY) continue;
    counts[player.position] += 1;
  }
  return counts;
}

export function evaluateFormationEligibility(
  formation: FormationType,
  players: Pick<Player, 'position' | 'injured' | 'fitness'>[],
): FormationEligibility {
  const required = getFormationRequirements(formation);
  const available = getAvailablePlayerCounts(players);
  const missing: FormationAvailabilityCounts = {
    GK: Math.max(0, required.GK - available.GK),
    DEF: Math.max(0, required.DEF - available.DEF),
    MID: Math.max(0, required.MID - available.MID),
    ATT: Math.max(0, required.ATT - available.ATT),
  };
  const eligible =
    missing.GK === 0 && missing.DEF === 0 && missing.MID === 0 && missing.ATT === 0;

  return { eligible, required, available, missing };
}

export function getEligibleFormations(team: Team): FormationType[] {
  return FORMATION_OPTIONS.filter(
    (formation) => evaluateFormationEligibility(formation, team.players).eligible,
  );
}

// Auto-select best lineup for a formation
export function selectBestLineup(
  team: Team,
  formation: FormationType,
): { lineup: string[]; substitutes: string[] } {
  const safeFormation = normalizeFormation(formation);
  const positions = FORMATION_POSITIONS[safeFormation];
  const availablePlayers = team.players.filter(
    (p) => !p.injured && p.fitness > MIN_FITNESS_FOR_AVAILABILITY,
  );
  const usedPlayerIds = new Set<string>();
  const lineup: string[] = [];

  // For each position in formation, find best available player
  for (const position of positions) {
    const candidates = availablePlayers
      .filter((p) => !usedPlayerIds.has(p.id))
      .map((p) => ({
        player: p,
        score: getPositionScore(p, position),
      }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      lineup.push(candidates[0].player.id);
      usedPlayerIds.add(candidates[0].player.id);
    }
  }

  // Substitutes are next best players not in lineup
  const substitutes = availablePlayers
    .filter((p) => !usedPlayerIds.has(p.id))
    .sort((a, b) => calculateOverall(b) - calculateOverall(a))
    .slice(0, 7) // 7 subs on bench
    .map((p) => p.id);

  return { lineup, substitutes };
}

// Calculate how well a player fits a position (simplified 4 positions)
function getPositionScore(player: Player, targetPosition: Position): number {
  const overall = calculateOverall(player);

  // Perfect position match
  if (player.position === targetPosition) {
    return overall + 10;
  }

  // GK is unique - can't play other positions well
  if (targetPosition === 'GK' || player.position === 'GK') {
    return overall - 30;
  }

  // Adjacent positions have small penalty
  const adjacentPositions: Record<Position, Position[]> = {
    GK: [],
    DEF: ['MID'],
    MID: ['DEF', 'ATT'],
    ATT: ['MID'],
  };

  if (adjacentPositions[targetPosition]?.includes(player.position)) {
    return overall - 5;
  }

  // DEF playing ATT or vice versa - bigger penalty
  return overall - 15;
}

/**
 * Swap a lineup player with a bench player. Returns new Tactics.
 */
export function swapPlayersInTactics(
  tactics: Tactics,
  lineupIndex: number,
  benchIndex: number,
): Tactics {
  if (lineupIndex < 0 || lineupIndex >= tactics.lineup.length) return tactics;
  if (benchIndex < 0 || benchIndex >= tactics.substitutes.length)
    return tactics;

  const lineup = [...tactics.lineup];
  const substitutes = [...tactics.substitutes];
  [lineup[lineupIndex], substitutes[benchIndex]] = [
    substitutes[benchIndex],
    lineup[lineupIndex],
  ];

  return {
    ...tactics,
    lineup,
    substitutes,
  };
}

// Create default tactics for a team
export function createDefaultTactics(team: Team): Tactics {
  const firstEligible = getEligibleFormations(team)[0];
  const formation = firstEligible ?? DEFAULT_FORMATION;
  const { lineup, substitutes } = selectBestLineup(team, formation);

  return {
    formation,
    posture: 'balanced',
    lineup,
    substitutes,
  };
}

// Generate a full squad for a team (simplified positions)
export function generateSquad(options: {
  teamReputation: number; // 1-100
  budgetTier: 'low' | 'medium' | 'high';
}): Player[] {
  const { teamReputation } = options;

  // Overall ranges based on team reputation
  const baseOverall = 40 + Math.floor(teamReputation * 0.4); // 40-80 range
  const variance = 15;

  const overallRange: [number, number] = [
    Math.max(45, baseOverall - variance),
    Math.min(92, baseOverall + variance),
  ];

  // Standard squad composition (~25 players)
  const positions: { position: Position; count: number }[] = [
    { position: 'GK', count: 3 },
    { position: 'DEF', count: 8 },
    { position: 'MID', count: 8 },
    { position: 'ATT', count: 6 },
  ];

  const players: Player[] = [];

  for (const { position, count } of positions) {
    for (let i = 0; i < count; i++) {
      players.push(
        generatePlayer({
          position,
          overallRange,
          ageRange: [18, 34],
        }),
      );
    }
  }

  return players;
}

// Calculate team's total wage bill
export function calculateWageBill(team: Team): number {
  return team.players.reduce((total, player) => total + player.wage, 0);
}

// Calculate team's average overall rating
export function calculateTeamOverall(team: Team): number {
  if (team.players.length === 0) return 0;
  const total = team.players.reduce((sum, p) => sum + calculateOverall(p), 0);
  return Math.round(total / team.players.length);
}

// Get team statistics
export function getTeamStats(team: Team) {
  const players = team.players;

  return {
    squadSize: players.length,
    averageAge:
      players.length > 0
        ? Math.round(
            (players.reduce((sum, p) => sum + p.age, 0) / players.length) * 10,
          ) / 10
        : 0,
    averageOverall: calculateTeamOverall(team),
    bestPlayer:
      players.length > 0
        ? players.reduce((best, p) =>
            calculateOverall(p) > calculateOverall(best) ? p : best,
          )
        : null,
    totalWageBill: calculateWageBill(team),
    totalSquadValue: players.reduce((sum, p) => sum + p.marketValue, 0),
    injuredPlayers: players.filter((p) => p.injured).length,
    positionCounts: {
      GK: players.filter((p) => p.position === 'GK').length,
      DEF: players.filter((p) => p.position === 'DEF').length,
      MID: players.filter((p) => p.position === 'MID').length,
      ATT: players.filter((p) => p.position === 'ATT').length,
    },
    momentum: team.momentum,
    recentForm: team.lastFiveResults.join(''),
  };
}

// Update team momentum after a match result
export function updateTeamMomentum(team: Team, result: 'W' | 'D' | 'L'): Team {
  const results = [...team.lastFiveResults, result].slice(-5);
  const points = results.reduce(
    (sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0),
    0,
  );
  // 7.5 is average (1.5 ppg * 5 games)
  const momentum = Math.round(50 + (points - 7.5) * 5);

  return {
    ...team,
    momentum: Math.max(1, Math.min(100, momentum)),
    lastFiveResults: results,
  };
}

// Create a team with default values
export function createDefaultTeam(partial: Partial<Team>): Team {
  return {
    id: partial.id ?? `team-${Date.now()}`,
    name: partial.name ?? 'New Team',
    shortName: partial.shortName ?? 'NEW',
    badgeUrl: partial.badgeUrl,
    primaryColor: partial.primaryColor ?? '#000000',
    secondaryColor: partial.secondaryColor ?? '#FFFFFF',
    stadium: partial.stadium ?? 'Stadium',
    capacity: partial.capacity ?? 30000,
    reputation: partial.reputation ?? 50,
    budget: partial.budget ?? 10000000,
    wageBudget: partial.wageBudget ?? 500000,
    players: partial.players ?? [],
    momentum: partial.momentum ?? 50,
    lastFiveResults: partial.lastFiveResults ?? [],
  };
}
