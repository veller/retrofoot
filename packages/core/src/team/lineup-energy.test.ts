import { describe, expect, it } from 'vitest';
import type { Player, Team } from '../types';
import { createDefaultForm } from '../types';
import { isLineupCompatibleWithFormation, selectBestLineup } from './index';

function makePlayer(
  id: string,
  position: Player['position'],
  overallSeed: number,
  energy: number,
): Player {
  const base = overallSeed;
  return {
    id,
    name: id,
    age: 26,
    nationality: 'Brazil',
    position,
    preferredFoot: 'right',
    attributes: {
      speed: base,
      strength: base,
      stamina: base,
      shooting: base,
      passing: base,
      dribbling: base,
      heading: base,
      tackling: base,
      positioning: base,
      vision: base,
      composure: base,
      aggression: base,
      reflexes: base,
      handling: base,
      diving: base,
    },
    potential: Math.min(99, base + 5),
    morale: 70,
    fitness: 100,
    energy,
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2030,
    wage: 1000,
    marketValue: 1_000_000,
    status: 'active',
    form: createDefaultForm(),
  };
}

function makeBaseSquad(): Player[] {
  return [
    makePlayer('gk-1', 'GK', 72, 100),
    makePlayer('gk-2', 'GK', 69, 95),
    makePlayer('d-1', 'DEF', 74, 100),
    makePlayer('d-2', 'DEF', 73, 100),
    makePlayer('d-3', 'DEF', 72, 100),
    makePlayer('d-4', 'DEF', 71, 100),
    makePlayer('d-5', 'DEF', 70, 94),
    makePlayer('m-1', 'MID', 76, 100),
    makePlayer('m-2', 'MID', 75, 100),
    makePlayer('m-3', 'MID', 74, 100),
    makePlayer('m-4', 'MID', 73, 90),
    makePlayer('a-1', 'ATT', 86, 20),
    makePlayer('a-2', 'ATT', 78, 89),
    makePlayer('a-3', 'ATT', 77, 90),
    makePlayer('a-4', 'ATT', 75, 88),
  ];
}

function makeTeam(players: Player[]): Team {
  return {
    id: 't1',
    name: 'T1',
    shortName: 'T1',
    primaryColor: '#fff',
    secondaryColor: '#000',
    stadium: 'Arena',
    capacity: 40000,
    reputation: 65,
    budget: 1_000_000,
    wageBudget: 200_000,
    players,
    momentum: 50,
    lastFiveResults: [],
  };
}

describe('selectBestLineup energy policy', () => {
  it('benches exhausted high-overall player when role replacement is available', () => {
    const team = makeTeam(makeBaseSquad());
    const result = selectBestLineup(team, '4-3-3');

    expect(result.lineup).not.toContain('a-1');
    expect(result.lineup).toContain('a-2');
    expect(result.lineup).toContain('a-3');
    expect(result.lineup).toContain('a-4');
  });

  it('keeps exhausted starter when no in-role replacement exists', () => {
    const players = makeBaseSquad().filter(
      (p) => p.id !== 'a-2' && p.id !== 'a-3' && p.id !== 'a-4',
    );
    const team = makeTeam(players);
    const result = selectBestLineup(team, '4-5-1');

    expect(result.lineup).toContain('a-1');
  });

  it('always returns lineup compatible with formation roles', () => {
    const team = makeTeam(makeBaseSquad());
    const result = selectBestLineup(team, '4-3-3');

    expect(isLineupCompatibleWithFormation(team, '4-3-3', result.lineup)).toBe(true);
  });
});
