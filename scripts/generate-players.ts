#!/usr/bin/env npx tsx
// ============================================================================
// RETROFOOT - Random Player Generator
// ============================================================================
// Generates 15 random players per team for development purposes
// Run: npx tsx scripts/generate-players.ts

import * as fs from 'fs';
import * as path from 'path';

// Brazilian first names
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
  'Thiago',
  'Leonardo',
  'Vinicius',
  'Anderson',
  'Rodrigo',
  'Diego',
  'Eduardo',
  'Fernando',
  'Henrique',
  'Igor',
  'Julio',
  'Kaio',
  'Leandro',
  'Marcos',
  'Nathan',
  'Oscar',
  'Pablo',
  'Ricardo',
  'Samuel',
  'Tiago',
  'Victor',
  'Wesley',
  'Yago',
  'Zeca',
  'Adriano',
  'Bernardo',
  'Caio',
  'Daniel',
  'Elias',
  'Fabio',
  'Guilherme',
  'Hugo',
  'Ivan',
  'Jefferson',
  'Kevin',
  'Luis',
  'Marcio',
  'Nelson',
  'Otavio',
  'Paulo',
  'Ramon',
  'Sergio',
  'Tomas',
  'Ubiratan',
  'Vagner',
  'Wallace',
  'Xande',
  'Yan',
  'Zico',
  'Alex',
  'Arthur',
  'Breno',
  'Caique',
  'Davi',
];

// Brazilian last names
const LAST_NAMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Rodrigues',
  'Ferreira',
  'Alves',
  'Pereira',
  'Lima',
  'Gomes',
  'Costa',
  'Ribeiro',
  'Martins',
  'Carvalho',
  'Almeida',
  'Lopes',
  'Soares',
  'Fernandes',
  'Vieira',
  'Barbosa',
  'Rocha',
  'Dias',
  'Nascimento',
  'Andrade',
  'Moreira',
  'Nunes',
  'Marques',
  'Machado',
  'Mendes',
  'Freitas',
  'Cardoso',
  'Ramos',
  'Gonçalves',
  'Santana',
  'Teixeira',
  'Moraes',
  'Pinto',
  'Correia',
  'Melo',
  'Araujo',
  'Batista',
  'Campos',
  'Castro',
  'Fonseca',
  'Guimarães',
  'Monteiro',
];

// Nicknames (optional, ~30% chance)
const NICKNAMES = [
  'Beto',
  'Cadu',
  'Deco',
  'Edu',
  'Fafa',
  'Guga',
  'Juca',
  'Kaka',
  'Lele',
  'Mano',
  'Nico',
  'Pato',
  'Rafa',
  'Sandro',
  'Teco',
  'Vava',
  'Xande',
  'Zé',
  'Dudu',
  'Luan',
  'Nino',
  'Roni',
  'Tche',
  'Biro',
  'Cris',
  'Dodô',
  'Fio',
  'Giu',
  'Hulk',
  'Japa',
  'Kiko',
  'Léo',
  'Mito',
  'Nando',
  'Otto',
  'Pepe',
  'Raí',
  'Seco',
  'Tuti',
  'Vini',
];

type Position = 'GK' | 'DEF' | 'MID' | 'ATT';

interface PlayerSeed {
  templateId: string;
  name: string;
  nickname?: string;
  realInspiration: string;
  teamId: string;
  position: Position;
  age: number;
  nationality: string;
  preferredFoot: 'left' | 'right' | 'both';
  attributes: {
    speed: number;
    strength: number;
    stamina: number;
    shooting: number;
    passing: number;
    dribbling: number;
    heading: number;
    tackling: number;
    positioning: number;
    vision: number;
    composure: number;
    aggression: number;
    reflexes: number;
    handling: number;
    diving: number;
  };
  potential: number;
  status: 'active';
  contractEndSeason: number;
  wage: number;
  marketValue: number;
  form: {
    form: number;
    lastFiveRatings: number[];
    seasonGoals: number;
    seasonAssists: number;
    seasonMinutes: number;
    seasonAvgRating: number;
  };
}

// Teams from data/teams.ts
const TEAMS = [
  { id: 'mengalvio', name: 'Mengalvio FC', reputation: 95 },
  { id: 'palestra', name: 'SE Palestra', reputation: 93 },
  { id: 'timao', name: 'Timão Paulista', reputation: 90 },
  { id: 'trikas', name: 'Trikas FC', reputation: 88 },
  { id: 'acmineiro', name: 'AC Mineiro', reputation: 86 },
  { id: 'putfire', name: 'Putfire', reputation: 84 },
  { id: 'flordelince', name: 'Flor de Lince', reputation: 82 },
  { id: 'colorado', name: 'CR Colorado', reputation: 80 },
  { id: 'gpa', name: 'Grupo Porto-Alegrense', reputation: 79 },
  { id: 'cabuloso', name: 'Cabuloso Estrelado', reputation: 78 },
  { id: 'tdcolina', name: 'Time da Colina CR', reputation: 76 },
  { id: 'baleia', name: 'CR Baleia', reputation: 75 },
  { id: 'esquadrao', name: 'Esquadrão DA', reputation: 72 },
  { id: 'paranaense', name: 'Paranaense', reputation: 70 },
  { id: 'massabruta', name: 'Massa Bruta SC', reputation: 68 },
  { id: 'leaodabarra', name: 'Leão da Barra', reputation: 66 },
  { id: 'coxaverde', name: 'Coxa-Verde EC', reputation: 62 },
  { id: 'chapaquente', name: 'SC Chapa Quente', reputation: 58 },
  { id: 'leaoazul', name: 'Leão Azul', reputation: 56 },
  { id: 'laranjamecanica', name: 'AS Laranja Mecânica', reputation: 55 },
];

// Position distribution per team: 2 GK, 4 DEF, 5 MID, 4 ATT = 15
const POSITION_DISTRIBUTION: Position[] = [
  'GK',
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
  'ATT',
  'ATT',
  'ATT',
];

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateName(): string {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  // 30% chance of double last name
  if (Math.random() < 0.3) {
    const last2 = pick(LAST_NAMES.filter((l) => l !== last));
    return `${first} ${last} ${last2}`;
  }
  return `${first} ${last}`;
}

function generateNickname(): string | undefined {
  // 30% chance of having a nickname
  return Math.random() < 0.3 ? pick(NICKNAMES) : undefined;
}

function generateTemplateId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '-');
}

function generateAge(position: Position): number {
  // GK: typically older, DEF: mid, MID: varied, ATT: younger
  const ranges: Record<Position, [number, number]> = {
    GK: [22, 36],
    DEF: [20, 34],
    MID: [19, 33],
    ATT: [18, 32],
  };
  const [min, max] = ranges[position];
  return random(min, max);
}

function generateAttributes(
  position: Position,
  teamReputation: number,
  age: number,
): PlayerSeed['attributes'] {
  // Base attribute range based on team reputation (55-95 base → 40-80 actual range)
  const baseMin = Math.floor(teamReputation * 0.4) + 20;
  const baseMax = Math.floor(teamReputation * 0.5) + 40;

  // Slight age modifier (peak at 27-29)
  const ageFactor = age < 22 ? 0.9 : age > 31 ? 0.95 : 1.0;

  const attr = (min: number = baseMin, max: number = baseMax) =>
    Math.min(99, Math.max(1, Math.floor(random(min, max) * ageFactor)));

  // Position-specific boosts
  const isGK = position === 'GK';
  const isDEF = position === 'DEF';
  const isMID = position === 'MID';
  const isATT = position === 'ATT';

  return {
    speed: attr(isATT ? baseMin + 5 : baseMin, isATT ? baseMax + 10 : baseMax),
    strength: attr(
      isDEF ? baseMin + 5 : baseMin,
      isDEF ? baseMax + 5 : baseMax,
    ),
    stamina: attr(isMID ? baseMin + 5 : baseMin, isMID ? baseMax + 5 : baseMax),
    shooting: attr(
      isATT ? baseMin + 10 : baseMin - 10,
      isATT ? baseMax + 10 : baseMax,
    ),
    passing: attr(
      isMID ? baseMin + 5 : baseMin,
      isMID ? baseMax + 10 : baseMax,
    ),
    dribbling: attr(isATT || isMID ? baseMin + 5 : baseMin - 5, baseMax),
    heading: attr(isDEF ? baseMin + 5 : baseMin, isDEF ? baseMax + 5 : baseMax),
    tackling: attr(
      isDEF ? baseMin + 10 : baseMin - 10,
      isDEF ? baseMax + 10 : baseMax - 5,
    ),
    positioning: attr(baseMin, baseMax + 5),
    vision: attr(isMID ? baseMin + 5 : baseMin, isMID ? baseMax + 10 : baseMax),
    composure: attr(baseMin, baseMax),
    aggression: attr(baseMin - 10, baseMax),
    reflexes: attr(
      isGK ? baseMin + 15 : baseMin - 20,
      isGK ? baseMax + 15 : baseMax - 15,
    ),
    handling: attr(
      isGK ? baseMin + 15 : baseMin - 30,
      isGK ? baseMax + 15 : baseMax - 20,
    ),
    diving: attr(
      isGK ? baseMin + 15 : baseMin - 30,
      isGK ? baseMax + 15 : baseMax - 20,
    ),
  };
}

function generatePotential(age: number, avgAttr: number): number {
  // Young players have higher potential ceiling
  if (age <= 21) return Math.min(99, avgAttr + random(10, 25));
  if (age <= 25) return Math.min(99, avgAttr + random(5, 15));
  if (age <= 28) return Math.min(99, avgAttr + random(0, 8));
  return avgAttr; // Older players have reached potential
}

function generateWage(avgAttr: number, teamReputation: number): number {
  const baseWage = (avgAttr * teamReputation) / 100;
  return Math.floor(baseWage * random(800, 1200));
}

function generateMarketValue(
  avgAttr: number,
  age: number,
  potential: number,
): number {
  let value = avgAttr * 50000;

  // Age modifier
  if (age <= 23) value *= 1.5;
  else if (age <= 27) value *= 1.2;
  else if (age >= 32) value *= 0.5;
  else if (age >= 30) value *= 0.7;

  // Potential modifier
  value *= potential / avgAttr;

  return Math.floor(value / 10000) * 10000; // Round to 10k
}

function generatePlayer(
  teamId: string,
  position: Position,
  teamReputation: number,
  usedNames: Set<string>,
): PlayerSeed {
  let name: string;
  do {
    name = generateName();
  } while (usedNames.has(name));
  usedNames.add(name);

  const age = generateAge(position);
  const attributes = generateAttributes(position, teamReputation, age);

  // Calculate average attribute for overall calculations
  const attrValues = Object.values(attributes);
  const avgAttr = Math.floor(
    attrValues.reduce((a, b) => a + b, 0) / attrValues.length,
  );

  const potential = generatePotential(age, avgAttr);

  return {
    templateId: generateTemplateId(name),
    name,
    nickname: generateNickname(),
    realInspiration: 'Generated',
    teamId,
    position,
    age,
    nationality: 'Brazil',
    preferredFoot:
      Math.random() < 0.75 ? 'right' : Math.random() < 0.9 ? 'left' : 'both',
    attributes,
    potential,
    status: 'active',
    contractEndSeason: 2026 + random(1, 4),
    wage: generateWage(avgAttr, teamReputation),
    marketValue: generateMarketValue(avgAttr, age, potential),
    form: {
      form: random(60, 80),
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 0,
      seasonAvgRating: 0,
    },
  };
}

function generateTeamPlayers(team: (typeof TEAMS)[0]): PlayerSeed[] {
  const usedNames = new Set<string>();
  const players: PlayerSeed[] = [];

  for (const position of POSITION_DISTRIBUTION) {
    players.push(generatePlayer(team.id, position, team.reputation, usedNames));
  }

  return players;
}

function toConstName(id: string): string {
  return id.toUpperCase().replace(/-/g, '_') + '_PLAYERS';
}

function generatePlayerFile(
  team: (typeof TEAMS)[0],
  players: PlayerSeed[],
): string {
  const constName = toConstName(team.id);

  return `// ============================================================================
// RETROFOOT - ${team.name} Players
// ============================================================================
// Generated randomly for development - replace with AI-researched players

import type { PlayerSeed } from './types';

export const ${constName}: PlayerSeed[] = ${JSON.stringify(players, null, 2).replace(/"([^"]+)":/g, '$1:')};
`;
}

function generateTypesFile(): string {
  return `// ============================================================================
// RETROFOOT - Player Seed Types
// ============================================================================

import type { Player } from '../../types';

/**
 * Seed data extends Player with template metadata
 */
export interface PlayerSeed
  extends Omit<Player, 'id' | 'morale' | 'fitness' | 'injured' | 'injuryWeeks'> {
  templateId: string;
  realInspiration: string;
  teamId: string;
}
`;
}

function generateIndexFile(): string {
  const imports = TEAMS.map(
    (t) => `import { ${toConstName(t.id)} } from './${t.id}';`,
  ).join('\n');

  const exports = TEAMS.map((t) => toConstName(t.id)).join(',\n  ');

  const allPlayers = TEAMS.map((t) => `  ...${toConstName(t.id)},`).join('\n');

  return `// ============================================================================
// RETROFOOT - Player Seed Data Index
// ============================================================================

export type { PlayerSeed } from './types';

${imports}

export {
  ${exports}
};

/** All players from all teams */
export const ALL_PLAYERS = [
${allPlayers}
];
`;
}

// Main execution
const playersDir = path.join(__dirname, '../packages/core/src/data/players');

// Ensure directory exists
if (!fs.existsSync(playersDir)) {
  fs.mkdirSync(playersDir, { recursive: true });
}

// Generate types file
fs.writeFileSync(path.join(playersDir, 'types.ts'), generateTypesFile());
console.log('✓ Generated types.ts');

// Generate players for each team
for (const team of TEAMS) {
  const players = generateTeamPlayers(team);
  const content = generatePlayerFile(team, players);
  fs.writeFileSync(path.join(playersDir, `${team.id}.ts`), content);
  console.log(`✓ Generated ${team.id}.ts (${players.length} players)`);
}

// Generate index file
fs.writeFileSync(path.join(playersDir, 'index.ts'), generateIndexFile());
console.log('✓ Generated index.ts');

// Update main data index
const mainIndexContent = `// ============================================================================
// RETROFOOT - Seed Data
// ============================================================================
// Template data for teams and players, used when creating a new game

export * from './teams';
export * from './players';
`;

fs.writeFileSync(
  path.join(__dirname, '../packages/core/src/data/index.ts'),
  mainIndexContent,
);
console.log('✓ Updated data/index.ts');

console.log(
  `\n✅ Generated ${TEAMS.length * 15} players across ${TEAMS.length} teams!`,
);
