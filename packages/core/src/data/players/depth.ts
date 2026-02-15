// ============================================================================
// RETROFOOT - Roster Depth Players
// ============================================================================

import type { PlayerSeed } from './types';

type Position = PlayerSeed['position'];
type PreferredFoot = PlayerSeed['preferredFoot'];

const TEAM_IDS = [
  'mengalvio',
  'palestra',
  'timao',
  'trikas',
  'acmineiro',
  'putfire',
  'flordelince',
  'colorado',
  'gpa',
  'cabuloso',
  'tdcolina',
  'baleia',
  'esquadrao',
  'paranaense',
  'massabruta',
  'leaodabarra',
  'coxaverde',
  'chapaquente',
  'leaoazul',
  'laranjamecanica',
] as const;

const FRIEND_PLAYERS: Array<{
  name: string;
  teamId: (typeof TEAM_IDS)[number];
  position: Position;
  nickname?: string;
}> = [
  { name: 'Jean Baura', teamId: 'mengalvio', position: 'MID' },
  { name: 'Pancho Baura', teamId: 'paranaense', position: 'ATT' },
  { name: 'Dogao', teamId: 'acmineiro', position: 'DEF', nickname: 'Doga' },
  { name: 'Gil Zeferino', teamId: 'colorado', position: 'MID' },
  { name: 'Jozefa', teamId: 'flordelince', position: 'ATT' },
  { name: 'James Castro', teamId: 'gpa', position: 'DEF' },
  {
    name: 'Pisculi',
    teamId: 'cabuloso',
    position: 'MID',
    nickname: 'Mato',
  },
  { name: 'Zanata', teamId: 'leaoazul', position: 'ATT' },
];

const FIRST_NAMES = [
  'Rafael',
  'Caio',
  'Bruno',
  'Leandro',
  'Diego',
  'Thiago',
  'Andre',
  'Lucas',
  'Vinicius',
  'Matheus',
] as const;

const LAST_NAMES = [
  'Souza',
  'Nogueira',
  'Almeida',
  'Pereira',
  'Lopes',
  'Rezende',
  'Cardoso',
  'Farias',
  'Moura',
  'Barbosa',
] as const;

function toTemplateId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hash(value: string): number {
  let acc = 0;
  for (let i = 0; i < value.length; i += 1) {
    acc = (acc * 31 + value.charCodeAt(i)) >>> 0;
  }
  return acc;
}

function vary(base: number, spread: number, seed: number, min = 25, max = 95): number {
  const offset = (seed % (spread * 2 + 1)) - spread;
  const value = base + offset;
  return Math.max(min, Math.min(max, value));
}

function buildAttributes(position: Position, seed: number): PlayerSeed['attributes'] {
  const baseByPosition: Record<Position, PlayerSeed['attributes']> = {
    GK: {
      speed: 50,
      strength: 62,
      stamina: 56,
      shooting: 38,
      passing: 58,
      dribbling: 42,
      heading: 58,
      tackling: 46,
      positioning: 70,
      vision: 62,
      composure: 66,
      aggression: 52,
      reflexes: 76,
      handling: 74,
      diving: 75,
    },
    DEF: {
      speed: 66,
      strength: 72,
      stamina: 70,
      shooting: 50,
      passing: 61,
      dribbling: 54,
      heading: 72,
      tackling: 74,
      positioning: 69,
      vision: 58,
      composure: 63,
      aggression: 68,
      reflexes: 38,
      handling: 34,
      diving: 35,
    },
    MID: {
      speed: 69,
      strength: 63,
      stamina: 74,
      shooting: 63,
      passing: 72,
      dribbling: 70,
      heading: 57,
      tackling: 62,
      positioning: 67,
      vision: 73,
      composure: 68,
      aggression: 60,
      reflexes: 36,
      handling: 33,
      diving: 34,
    },
    ATT: {
      speed: 74,
      strength: 66,
      stamina: 68,
      shooting: 76,
      passing: 64,
      dribbling: 74,
      heading: 67,
      tackling: 42,
      positioning: 75,
      vision: 64,
      composure: 71,
      aggression: 57,
      reflexes: 35,
      handling: 30,
      diving: 31,
    },
  };

  const base = baseByPosition[position];
  return {
    speed: vary(base.speed, 8, seed + 1),
    strength: vary(base.strength, 8, seed + 2),
    stamina: vary(base.stamina, 8, seed + 3),
    shooting: vary(base.shooting, 8, seed + 4),
    passing: vary(base.passing, 8, seed + 5),
    dribbling: vary(base.dribbling, 8, seed + 6),
    heading: vary(base.heading, 8, seed + 7),
    tackling: vary(base.tackling, 8, seed + 8),
    positioning: vary(base.positioning, 8, seed + 9),
    vision: vary(base.vision, 8, seed + 10),
    composure: vary(base.composure, 8, seed + 11),
    aggression: vary(base.aggression, 8, seed + 12),
    reflexes: vary(base.reflexes, 8, seed + 13),
    handling: vary(base.handling, 8, seed + 14),
    diving: vary(base.diving, 8, seed + 15),
  };
}

function buildSeed(args: {
  name: string;
  teamId: (typeof TEAM_IDS)[number];
  position: Position;
  nickname?: string;
}): PlayerSeed {
  const seed = hash(`${args.teamId}:${args.name}:${args.position}`);
  const feet: PreferredFoot[] = ['right', 'left', 'both'];
  const preferredFoot = feet[seed % feet.length] as PreferredFoot;

  return {
    templateId: `${toTemplateId(args.name)}-${args.teamId}`,
    name: args.name,
    nickname: args.nickname,
    realInspiration: 'Community',
    teamId: args.teamId,
    position: args.position,
    age: 19 + (seed % 13),
    nationality: 'Brazil',
    preferredFoot,
    attributes: buildAttributes(args.position, seed),
    potential: 62 + (seed % 17),
    status: 'active',
    contractEndSeason: 2027 + (seed % 5),
    wage: 32000 + (seed % 26000),
    marketValue: 900000 + (seed % 3200000),
    form: {
      form: 58 + (seed % 23),
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 0,
      seasonAvgRating: 0,
    },
  };
}

const generatedByTeam = new Map<
  (typeof TEAM_IDS)[number],
  Array<{
    name: string;
    position: Position;
  }>
>();

for (const teamId of TEAM_IDS) {
  generatedByTeam.set(teamId, []);
}

for (const friend of FRIEND_PLAYERS) {
  generatedByTeam.get(friend.teamId)?.push({
    name: friend.name,
    position: friend.position,
  });
}

for (const teamId of TEAM_IDS) {
  const teamPlayers = generatedByTeam.get(teamId);
  if (!teamPlayers) {
    continue;
  }

  let fillIndex = 0;
  while (teamPlayers.length < 2) {
    const first = FIRST_NAMES[(hash(`${teamId}:first:${fillIndex}`) + fillIndex) % FIRST_NAMES.length];
    const last = LAST_NAMES[(hash(`${teamId}:last:${fillIndex}`) + fillIndex) % LAST_NAMES.length];
    const fullName = `${first} ${last}`;

    const positionPattern: Position[] = ['DEF', 'MID', 'ATT', 'MID'];
    const position = positionPattern[(hash(`${teamId}:pos:${fillIndex}`) + fillIndex) % positionPattern.length];

    if (!teamPlayers.some((player) => player.name === fullName)) {
      teamPlayers.push({ name: fullName, position });
    }

    fillIndex += 1;
  }
}

export const DEPTH_PLAYERS: PlayerSeed[] = TEAM_IDS.flatMap((teamId) => {
  const teamPlayers = generatedByTeam.get(teamId) ?? [];
  return teamPlayers.slice(0, 2).map((player) =>
    buildSeed({
      name: player.name,
      teamId,
      position: player.position,
      nickname:
        FRIEND_PLAYERS.find(
          (friend) => friend.name === player.name && friend.teamId === teamId,
        )?.nickname ?? undefined,
    }),
  );
});
