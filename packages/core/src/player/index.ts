// ============================================================================
// RETROFOOT - Player System
// ============================================================================
// Player creation, development, aging, retirement

import type { Player, PlayerAttributes, Position } from '../types'
import { calculateOverall } from '../types'

// Random helpers
function random(): number {
  return Math.random()
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function randomFromArray<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}

// Generate random attribute value within a range
function randomAttribute(base: number, variance: number = 15): number {
  const value = base + randomInt(-variance, variance)
  return Math.max(1, Math.min(99, value))
}

// Brazilian first names for regens (fictional but Brazilian-sounding)
const FIRST_NAMES = [
  'Pedro', 'Lucas', 'Gabriel', 'Matheus', 'Rafael', 'Bruno', 'Felipe',
  'Gustavo', 'Thiago', 'Leonardo', 'Ricardo', 'Eduardo', 'Marcos',
  'Vinicius', 'Joao', 'Carlos', 'Fernando', 'Diego', 'Andre', 'Rodrigo',
  'Henrique', 'Caio', 'Daniel', 'Igor', 'Leandro', 'Marcelo', 'Neymar',
  'Ronaldo', 'Romario', 'Zico', 'Kaka', 'Pele', 'Rivaldo', 'Adriano'
]

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Pereira', 'Almeida',
  'Ferreira', 'Rodrigues', 'Gomes', 'Martins', 'Rocha', 'Ribeiro',
  'Carvalho', 'Nascimento', 'Lima', 'Araujo', 'Barbosa', 'Moreira',
  'Melo', 'Cardoso', 'Nunes', 'Mendes', 'Freitas', 'Vieira', 'Monteiro'
]

const NICKNAMES = [
  'Bunda', 'Gigante', 'Maestro', 'Foguete', 'Tanque', 'Perninha',
  'Baixinho', 'Gordo', 'Magro', 'Cabecao', 'Pezao', 'Monstro',
  'Reizinho', 'Principe', 'Fenomeno', 'Bruxo', 'Camisa10', 'Matador',
  null, null, null, null, null, null, null // Many players have no nickname
]

// Generate a random player name
export function generatePlayerName(): { name: string; nickname?: string } {
  const firstName = randomFromArray(FIRST_NAMES)
  const lastName = randomFromArray(LAST_NAMES)
  const nickname = randomFromArray(NICKNAMES)

  return {
    name: `${firstName} ${lastName}`,
    nickname: nickname || undefined,
  }
}

// Generate attributes based on position and overall target
function generateAttributes(position: Position, targetOverall: number): PlayerAttributes {
  const base = targetOverall

  // Position-specific attribute generation
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
      }

    case 'CB':
      return {
        speed: randomAttribute(base - 10, 10),
        strength: randomAttribute(base + 5, 10),
        stamina: randomAttribute(base, 10),
        shooting: randomAttribute(base - 25, 10),
        passing: randomAttribute(base - 10, 10),
        dribbling: randomAttribute(base - 15, 10),
        heading: randomAttribute(base + 5, 10),
        tackling: randomAttribute(base + 10, 10),
        positioning: randomAttribute(base + 5, 10),
        vision: randomAttribute(base - 15, 10),
        composure: randomAttribute(base, 10),
        aggression: randomAttribute(base + 5, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

    case 'LB':
    case 'RB':
      return {
        speed: randomAttribute(base + 5, 10),
        strength: randomAttribute(base - 5, 10),
        stamina: randomAttribute(base + 5, 10),
        shooting: randomAttribute(base - 15, 10),
        passing: randomAttribute(base, 10),
        dribbling: randomAttribute(base, 10),
        heading: randomAttribute(base - 10, 10),
        tackling: randomAttribute(base + 5, 10),
        positioning: randomAttribute(base, 10),
        vision: randomAttribute(base - 5, 10),
        composure: randomAttribute(base - 5, 10),
        aggression: randomAttribute(base, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

    case 'CDM':
      return {
        speed: randomAttribute(base - 5, 10),
        strength: randomAttribute(base + 5, 10),
        stamina: randomAttribute(base + 5, 10),
        shooting: randomAttribute(base - 10, 10),
        passing: randomAttribute(base + 5, 10),
        dribbling: randomAttribute(base - 5, 10),
        heading: randomAttribute(base, 10),
        tackling: randomAttribute(base + 10, 10),
        positioning: randomAttribute(base + 5, 10),
        vision: randomAttribute(base, 10),
        composure: randomAttribute(base + 5, 10),
        aggression: randomAttribute(base + 5, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

    case 'CM':
      return {
        speed: randomAttribute(base - 5, 10),
        strength: randomAttribute(base - 5, 10),
        stamina: randomAttribute(base + 5, 10),
        shooting: randomAttribute(base, 10),
        passing: randomAttribute(base + 10, 10),
        dribbling: randomAttribute(base, 10),
        heading: randomAttribute(base - 10, 10),
        tackling: randomAttribute(base, 10),
        positioning: randomAttribute(base + 5, 10),
        vision: randomAttribute(base + 5, 10),
        composure: randomAttribute(base + 5, 10),
        aggression: randomAttribute(base - 5, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

    case 'CAM':
      return {
        speed: randomAttribute(base, 10),
        strength: randomAttribute(base - 10, 10),
        stamina: randomAttribute(base, 10),
        shooting: randomAttribute(base + 5, 10),
        passing: randomAttribute(base + 10, 10),
        dribbling: randomAttribute(base + 5, 10),
        heading: randomAttribute(base - 15, 10),
        tackling: randomAttribute(base - 15, 10),
        positioning: randomAttribute(base + 5, 10),
        vision: randomAttribute(base + 10, 10),
        composure: randomAttribute(base + 5, 10),
        aggression: randomAttribute(base - 10, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

    case 'LM':
    case 'RM':
    case 'LW':
    case 'RW':
      return {
        speed: randomAttribute(base + 10, 10),
        strength: randomAttribute(base - 10, 10),
        stamina: randomAttribute(base + 5, 10),
        shooting: randomAttribute(base + 5, 10),
        passing: randomAttribute(base, 10),
        dribbling: randomAttribute(base + 10, 10),
        heading: randomAttribute(base - 15, 10),
        tackling: randomAttribute(base - 15, 10),
        positioning: randomAttribute(base, 10),
        vision: randomAttribute(base, 10),
        composure: randomAttribute(base, 10),
        aggression: randomAttribute(base - 10, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

    case 'ST':
      return {
        speed: randomAttribute(base + 5, 10),
        strength: randomAttribute(base, 10),
        stamina: randomAttribute(base, 10),
        shooting: randomAttribute(base + 15, 10),
        passing: randomAttribute(base - 10, 10),
        dribbling: randomAttribute(base + 5, 10),
        heading: randomAttribute(base + 5, 10),
        tackling: randomAttribute(base - 25, 10),
        positioning: randomAttribute(base + 10, 10),
        vision: randomAttribute(base - 5, 10),
        composure: randomAttribute(base + 10, 10),
        aggression: randomAttribute(base, 10),
        reflexes: randomAttribute(base - 30, 5),
        handling: randomAttribute(base - 40, 5),
        diving: randomAttribute(base - 40, 5),
      }

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
      }
  }
}

// Generate a new player (for regens, youth academy, etc.)
export function generatePlayer(options: {
  position?: Position
  ageRange?: [number, number]
  overallRange?: [number, number]
  nationality?: string
}): Player {
  const {
    position = randomFromArray(['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'] as Position[]),
    ageRange = [17, 35],
    overallRange = [55, 85],
    nationality = 'Brazil',
  } = options

  const age = randomInt(ageRange[0], ageRange[1])
  const targetOverall = randomInt(overallRange[0], overallRange[1])
  const { name, nickname } = generatePlayerName()

  // Potential is higher for younger players
  const ageFactor = Math.max(0, (30 - age) / 13) // 17yo = 1.0, 30yo = 0.0
  const potentialBonus = Math.floor(ageFactor * 15)
  const potential = Math.min(99, targetOverall + randomInt(5, 15) + potentialBonus)

  // Development rate is random but younger players tend to develop faster
  const developmentRate = 0.7 + random() * 0.6 + (ageFactor * 0.2)

  const player: Player = {
    id: `player-${Date.now()}-${randomInt(1000, 9999)}`,
    name,
    nickname,
    age,
    nationality,
    position,
    preferredFoot: random() < 0.7 ? 'right' : random() < 0.9 ? 'left' : 'both',
    attributes: generateAttributes(position, targetOverall),
    potential,
    developmentRate: Math.round(developmentRate * 100) / 100,
    morale: randomInt(60, 90),
    fitness: randomInt(80, 100),
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2024 + randomInt(1, 4),
    wage: calculateWage(targetOverall),
    marketValue: calculateMarketValue(targetOverall, age),
  }

  return player
}

// Calculate weekly wage based on overall
function calculateWage(overall: number): number {
  // Base wage curve: exponential growth
  const baseWage = Math.pow(overall / 50, 3) * 10000
  return Math.round(baseWage / 100) * 100 // Round to nearest 100
}

// Calculate market value based on overall and age
function calculateMarketValue(overall: number, age: number): number {
  const baseValue = Math.pow(overall / 50, 4) * 1_000_000

  // Age modifier: peak at 25-28, decreases for older/younger
  let ageModifier = 1.0
  if (age < 21) {
    ageModifier = 0.6 + (age - 17) * 0.1 // 17yo = 0.6, 21yo = 1.0
  } else if (age > 28) {
    ageModifier = 1.0 - (age - 28) * 0.1 // 29yo = 0.9, 33yo = 0.5
  }

  return Math.round((baseValue * ageModifier) / 10000) * 10000 // Round to nearest 10k
}

// Develop a player (called each season or periodically)
export function developPlayer(player: Player, minutesPlayed: number): Player {
  const updated = { ...player }

  // Age the player
  updated.age += 1

  // Check for retirement (based on age and randomness)
  if (updated.age >= 35 && random() < 0.3) {
    // Player retires - this should be handled by the caller
    return updated
  }
  if (updated.age >= 38) {
    // Very old players have higher retirement chance
    // Handled by caller
    return updated
  }

  // Development logic
  const current = calculateOverall(updated)
  const gap = updated.potential - current

  if (gap > 0 && updated.age < 30) {
    // Player can still improve
    const minutesFactor = Math.min(1.0, minutesPlayed / 2000) // Full development at 2000+ minutes
    const developmentPoints = Math.floor(gap * 0.1 * updated.developmentRate * minutesFactor)

    // Distribute development points to random attributes
    const attrs = Object.keys(updated.attributes) as (keyof PlayerAttributes)[]
    for (let i = 0; i < developmentPoints; i++) {
      const attr = randomFromArray(attrs)
      updated.attributes[attr] = Math.min(99, updated.attributes[attr] + 1)
    }
  } else if (updated.age >= 30) {
    // Player starts declining
    const declineRate = (updated.age - 29) * 0.5 // 30yo = 0.5, 35yo = 3.0
    const declinePoints = Math.floor(declineRate + random() * 2)

    // Physical attributes decline faster
    const physicalAttrs: (keyof PlayerAttributes)[] = ['speed', 'stamina', 'strength']
    const otherAttrs = Object.keys(updated.attributes).filter(
      (a) => !physicalAttrs.includes(a as keyof PlayerAttributes)
    ) as (keyof PlayerAttributes)[]

    for (let i = 0; i < declinePoints; i++) {
      const attr = random() < 0.6
        ? randomFromArray(physicalAttrs)
        : randomFromArray(otherAttrs)
      updated.attributes[attr] = Math.max(1, updated.attributes[attr] - 1)
    }
  }

  // Update market value
  updated.marketValue = calculateMarketValue(calculateOverall(updated), updated.age)
  updated.wage = calculateWage(calculateOverall(updated))

  return updated
}

// Check if player should retire
export function shouldRetire(player: Player): boolean {
  if (player.age < 33) return false
  if (player.age >= 40) return true

  // Probability increases with age
  const retirementChance = (player.age - 32) * 0.15
  return random() < retirementChance
}
