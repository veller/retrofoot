// ============================================================================
// RETROFOOT - Team System
// ============================================================================
// Team management, squad handling

import type { Team, Player, Tactics, FormationType, Position } from '../types'
import { calculateOverall } from '../types'
import { generatePlayer } from '../player'

// Formation position mappings
const FORMATION_POSITIONS: Record<FormationType, Position[]> = {
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CDM', 'RM', 'CAM', 'LM', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'RM', 'CM', 'CDM', 'CM', 'LM', 'ST', 'ST'],
  '4-5-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CDM', 'CM', 'LM', 'ST'],
  '5-3-2': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CDM', 'CM', 'ST', 'ST'],
  '5-4-1': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST'],
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'RM', 'CM', 'CM', 'LM', 'RW', 'ST', 'LW'],
}

// Auto-select best lineup for a formation
export function selectBestLineup(team: Team, formation: FormationType): { lineup: string[]; substitutes: string[] } {
  const positions = FORMATION_POSITIONS[formation]
  const availablePlayers = team.players.filter((p) => !p.injured && p.fitness > 50)
  const usedPlayerIds = new Set<string>()
  const lineup: string[] = []

  // For each position in formation, find best available player
  for (const position of positions) {
    const candidates = availablePlayers
      .filter((p) => !usedPlayerIds.has(p.id))
      .map((p) => ({
        player: p,
        score: getPositionScore(p, position),
      }))
      .sort((a, b) => b.score - a.score)

    if (candidates.length > 0) {
      lineup.push(candidates[0].player.id)
      usedPlayerIds.add(candidates[0].player.id)
    }
  }

  // Substitutes are next best players not in lineup
  const substitutes = availablePlayers
    .filter((p) => !usedPlayerIds.has(p.id))
    .sort((a, b) => calculateOverall(b) - calculateOverall(a))
    .slice(0, 7) // 7 subs on bench
    .map((p) => p.id)

  return { lineup, substitutes }
}

// Calculate how well a player fits a position
function getPositionScore(player: Player, targetPosition: Position): number {
  const overall = calculateOverall(player)

  // Perfect position match
  if (player.position === targetPosition) {
    return overall + 10
  }

  // Similar positions get partial bonus
  const similarPositions: Record<Position, Position[]> = {
    GK: [],
    CB: ['CDM'],
    LB: ['LM', 'LW'],
    RB: ['RM', 'RW'],
    CDM: ['CB', 'CM'],
    CM: ['CDM', 'CAM'],
    CAM: ['CM', 'LM', 'RM'],
    LM: ['LW', 'LB', 'CAM'],
    RM: ['RW', 'RB', 'CAM'],
    LW: ['LM', 'ST'],
    RW: ['RM', 'ST'],
    ST: ['CAM', 'LW', 'RW'],
  }

  if (similarPositions[targetPosition]?.includes(player.position)) {
    return overall // No penalty for similar positions
  }

  // Wrong position penalty
  return overall - 15
}

/**
 * Swap a lineup player with a bench player. Returns new Tactics.
 */
export function swapPlayersInTactics(
  tactics: Tactics,
  lineupIndex: number,
  benchIndex: number
): Tactics {
  if (lineupIndex < 0 || lineupIndex >= tactics.lineup.length) return tactics
  if (benchIndex < 0 || benchIndex >= tactics.substitutes.length) return tactics

  const lineup = [...tactics.lineup]
  const substitutes = [...tactics.substitutes]
  ;[lineup[lineupIndex], substitutes[benchIndex]] = [
    substitutes[benchIndex],
    lineup[lineupIndex],
  ]

  return {
    ...tactics,
    lineup,
    substitutes,
  }
}

// Create default tactics for a team
export function createDefaultTactics(team: Team): Tactics {
  const formation: FormationType = '4-3-3'
  const { lineup, substitutes } = selectBestLineup(team, formation)

  return {
    formation,
    posture: 'balanced',
    lineup,
    substitutes,
  }
}

// Generate a full squad for a team
export function generateSquad(options: {
  teamReputation: number // 1-100
  budgetTier: 'low' | 'medium' | 'high'
}): Player[] {
  const { teamReputation } = options

  // Overall ranges based on team reputation
  const baseOverall = 40 + Math.floor(teamReputation * 0.4) // 40-80 range
  const variance = 15

  const overallRange: [number, number] = [
    Math.max(45, baseOverall - variance),
    Math.min(92, baseOverall + variance),
  ]

  // Standard squad composition
  const positions: { position: Position; count: number }[] = [
    { position: 'GK', count: 3 },
    { position: 'CB', count: 4 },
    { position: 'LB', count: 2 },
    { position: 'RB', count: 2 },
    { position: 'CDM', count: 2 },
    { position: 'CM', count: 3 },
    { position: 'CAM', count: 2 },
    { position: 'LM', count: 2 },
    { position: 'RM', count: 2 },
    { position: 'LW', count: 2 },
    { position: 'RW', count: 2 },
    { position: 'ST', count: 3 },
  ]

  const players: Player[] = []

  for (const { position, count } of positions) {
    for (let i = 0; i < count; i++) {
      players.push(
        generatePlayer({
          position,
          overallRange,
          ageRange: [18, 34],
        })
      )
    }
  }

  return players
}

// Calculate team's total wage bill
export function calculateWageBill(team: Team): number {
  return team.players.reduce((total, player) => total + player.wage, 0)
}

// Calculate team's average overall rating
export function calculateTeamOverall(team: Team): number {
  if (team.players.length === 0) return 0
  const total = team.players.reduce((sum, p) => sum + calculateOverall(p), 0)
  return Math.round(total / team.players.length)
}

// Get team statistics
export function getTeamStats(team: Team) {
  const players = team.players

  return {
    squadSize: players.length,
    averageAge: Math.round(players.reduce((sum, p) => sum + p.age, 0) / players.length * 10) / 10,
    averageOverall: calculateTeamOverall(team),
    bestPlayer: players.reduce((best, p) =>
      calculateOverall(p) > calculateOverall(best) ? p : best
    ),
    totalWageBill: calculateWageBill(team),
    totalSquadValue: players.reduce((sum, p) => sum + p.marketValue, 0),
    injuredPlayers: players.filter((p) => p.injured).length,
    positionCounts: {
      GK: players.filter((p) => p.position === 'GK').length,
      DEF: players.filter((p) => ['CB', 'LB', 'RB'].includes(p.position)).length,
      MID: players.filter((p) => ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p.position)).length,
      ATT: players.filter((p) => ['LW', 'RW', 'ST'].includes(p.position)).length,
    },
  }
}
