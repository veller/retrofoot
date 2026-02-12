import { describe, expect, it, vi } from 'vitest';
import type { Player, PlayerAttributes, Position } from '../types';
import { createDefaultForm } from '../types';
import { applyMatchGrowth } from './index';

function makeAttributes(base: number): PlayerAttributes {
  return {
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
  };
}

function makePlayer(options: {
  age: number;
  position: Position;
  potential?: number;
  baseAttr?: number;
}): Player {
  const { age, position, potential = 95, baseAttr = 70 } = options;
  return {
    id: `p-${age}-${position}`,
    name: 'Test Player',
    age,
    nationality: 'Brazil',
    position,
    preferredFoot: 'right',
    attributes: makeAttributes(baseAttr),
    potential,
    morale: 70,
    fitness: 100,
    energy: 100,
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2030,
    wage: 1000,
    marketValue: 1_000_000,
    status: 'active',
    form: createDefaultForm(),
  };
}

function sumAttributes(player: Player): number {
  return Object.values(player.attributes).reduce((sum, value) => sum + value, 0);
}

describe('applyMatchGrowth', () => {
  it('disables growth at age 40+ even with elite match output', () => {
    const player = makePlayer({ age: 40, position: 'ATT' });
    const before = sumAttributes(player);

    const after = applyMatchGrowth(player, 90, 9.0, {
      teamResult: 'win',
      goals: 2,
      assists: 1,
      goalsConceded: 0,
      cleanSheet: true,
    });

    expect(sumAttributes(after)).toBe(before);
  });

  it('grows younger players faster than older players for same performance', () => {
    const young = makePlayer({ age: 20, position: 'ATT' });
    const older = makePlayer({ age: 33, position: 'ATT' });
    const context = {
      teamResult: 'win' as const,
      goals: 2,
      assists: 1,
      goalsConceded: 0,
      cleanSheet: true,
    };

    const youngAfter = applyMatchGrowth(young, 90, 9.0, context);
    const olderAfter = applyMatchGrowth(older, 90, 9.0, context);

    expect(sumAttributes(youngAfter)).toBeGreaterThan(sumAttributes(young));
    expect(sumAttributes(olderAfter)).toBe(sumAttributes(older));
  });

  it('uses role-specific defensive context for keepers', () => {
    const keeper = makePlayer({ age: 21, position: 'GK' });

    const cleanSheetAfter = applyMatchGrowth(keeper, 90, 8.8, {
      teamResult: 'win',
      goals: 0,
      assists: 0,
      goalsConceded: 0,
      cleanSheet: true,
    });

    const heavyConcedeAfter = applyMatchGrowth(keeper, 90, 6.0, {
      teamResult: 'loss',
      goals: 0,
      assists: 0,
      goalsConceded: 4,
      cleanSheet: false,
    });

    expect(sumAttributes(cleanSheetAfter)).toBeGreaterThan(sumAttributes(keeper));
    expect(sumAttributes(heavyConcedeAfter)).toBe(sumAttributes(keeper));
  });

  it('caps exceptional young-player growth at +2 points', () => {
    const player = makePlayer({ age: 20, position: 'ATT' });
    const before = sumAttributes(player);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const after = applyMatchGrowth(player, 90, 9.5, {
        teamResult: 'win',
        goals: 4,
        assists: 2,
        goalsConceded: 0,
        cleanSheet: true,
      });

      expect(sumAttributes(after) - before).toBe(2);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
