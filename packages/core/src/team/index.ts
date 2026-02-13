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
const AI_STARTER_HARD_FLOOR = 35;

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

export function getRequiredPositionForSlot(
  formation: FormationType,
  slotIndex: number,
): Position | null {
  const positions = FORMATION_POSITIONS[formation];
  if (slotIndex < 0 || slotIndex >= positions.length) return null;
  return positions[slotIndex];
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
    missing.GK === 0 &&
    missing.DEF === 0 &&
    missing.MID === 0 &&
    missing.ATT === 0;

  return { eligible, required, available, missing };
}

export function getEligibleFormations(team: Team): FormationType[] {
  return FORMATION_OPTIONS.filter(
    (formation) =>
      evaluateFormationEligibility(formation, team.players).eligible,
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

  // For each position in formation, find best available player in the same role.
  for (const position of positions) {
    const roleCandidates = availablePlayers.filter(
      (p) => !usedPlayerIds.has(p.id) && p.position === position,
    );
    const hasReadyRoleAlternative = roleCandidates.some(
      (p) => (p.energy ?? 100) >= AI_STARTER_HARD_FLOOR,
    );
    const candidatesForSelection = roleCandidates.filter(
      (p) =>
        !hasReadyRoleAlternative || (p.energy ?? 100) >= AI_STARTER_HARD_FLOOR,
    );
    const candidates = (candidatesForSelection.length > 0
      ? candidatesForSelection
      : roleCandidates)
      .map((p) => ({
        player: p,
        score:
          calculateOverall(p) * (1 - calculateSelectionEnergyPenalty(p.energy ?? 100)),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.player.id.localeCompare(b.player.id);
      });

    if (candidates.length > 0) {
      lineup.push(candidates[0].player.id);
      usedPlayerIds.add(candidates[0].player.id);
    }
  }

  // Substitutes are next best players not in lineup, with baseline role coverage when possible.
  const remainingPlayers = availablePlayers
    .filter((p) => !usedPlayerIds.has(p.id))
    .map((p) => ({
      player: p,
      score:
        calculateOverall(p) * (1 - calculateSelectionEnergyPenalty(p.energy ?? 100)),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.player.id.localeCompare(b.player.id);
    });

  const bench: string[] = [];
  const benchSet = new Set<string>();
  const ensureCoverageOrder: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
  for (const position of ensureCoverageOrder) {
    const candidate = remainingPlayers.find(
      ({ player }) => player.position === position && !benchSet.has(player.id),
    );
    if (!candidate) continue;
    bench.push(candidate.player.id);
    benchSet.add(candidate.player.id);
    if (bench.length >= 7) break;
  }

  for (const { player } of remainingPlayers) {
    if (bench.length >= 7) break;
    if (benchSet.has(player.id)) continue;
    bench.push(player.id);
    benchSet.add(player.id);
  }

  return { lineup, substitutes: bench };
}

// Auto-select lineup prioritizing readiness (energy) while still respecting role fit.
export function selectMostReadyLineup(
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

  for (const position of positions) {
    const candidates = availablePlayers
      .filter((p) => !usedPlayerIds.has(p.id) && p.position === position)
      .map((p) => ({
        player: p,
        score: p.energy ?? 100,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const overallDelta = calculateOverall(b.player) - calculateOverall(a.player);
        if (overallDelta !== 0) return overallDelta;
        return a.player.id.localeCompare(b.player.id);
      });

    if (candidates.length > 0) {
      lineup.push(candidates[0].player.id);
      usedPlayerIds.add(candidates[0].player.id);
    }
  }

  const substitutes = availablePlayers
    .filter((p) => !usedPlayerIds.has(p.id))
    .sort((a, b) => (b.energy ?? 100) - (a.energy ?? 100))
    .slice(0, 7)
    .map((p) => p.id);

  return { lineup, substitutes };
}

export function isLineupCompatibleWithFormation(
  team: Team,
  formation: FormationType,
  lineup: string[],
): boolean {
  const safeFormation = normalizeFormation(formation);
  const requiredPositions = FORMATION_POSITIONS[safeFormation];
  if (lineup.length !== requiredPositions.length) return false;
  if (new Set(lineup).size !== lineup.length) return false;

  const playersById = new Map(team.players.map((player) => [player.id, player]));

  for (let index = 0; index < requiredPositions.length; index++) {
    const playerId = lineup[index];
    const player = playersById.get(playerId);
    const requiredPosition = requiredPositions[index];
    if (!player) return false;
    if (player.injured) return false;
    if (player.position !== requiredPosition) return false;
  }

  return true;
}

function calculateSelectionEnergyPenalty(energy: number): number {
  const e = Math.max(0, Math.min(100, energy));
  if (e >= 70) return 0;
  if (e >= 65) return ((70 - e) / 5) * 0.05;
  if (e >= 50) return 0.05 + ((65 - e) / 15) * 0.19;
  if (e >= 35) return 0.24 + ((50 - e) / 15) * 0.16;
  return Math.min(0.48, 0.4 + ((35 - e) / 35) * 0.08);
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
