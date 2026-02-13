import { describe, expect, it } from 'vitest';
import type { Player } from '../types';
import { calculateReleaseCompensation } from './index';

function buildPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Player',
    age: 27,
    nationality: 'Brazil',
    position: 'MID',
    preferredFoot: 'right',
    attributes: {
      speed: 68,
      strength: 65,
      stamina: 70,
      shooting: 66,
      passing: 72,
      dribbling: 69,
      heading: 61,
      tackling: 64,
      positioning: 70,
      vision: 73,
      composure: 68,
      aggression: 60,
      reflexes: 20,
      handling: 20,
      diving: 20,
    },
    potential: 74,
    morale: 70,
    fitness: 100,
    energy: 100,
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2029,
    wage: 22_000,
    marketValue: 2_200_000,
    status: 'active',
    form: {
      form: 70,
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 800,
      seasonAvgRating: 6.8,
    },
    ...overrides,
  };
}

describe('calculateReleaseCompensation', () => {
  it('returns zero when no years remain', () => {
    const result = calculateReleaseCompensation({
      player: buildPlayer({ contractEndSeason: 2026 }),
      currentSeason: 2026,
      currentRound: 20,
    });

    expect(result.fee).toBe(0);
    expect(result.hasFee).toBe(false);
  });

  it('charges more for older low-rated players with little market outlook', () => {
    const oldLowRated = calculateReleaseCompensation({
      player: buildPlayer({
        age: 36,
        wage: 28_000,
        attributes: { ...buildPlayer().attributes, passing: 55, vision: 54 },
        form: { ...buildPlayer().form, seasonMinutes: 200 },
      }),
      currentSeason: 2026,
      currentRound: 26,
    });
    const youngUnderused = calculateReleaseCompensation({
      player: buildPlayer({
        age: 21,
        wage: 28_000,
        form: { ...buildPlayer().form, seasonMinutes: 150 },
      }),
      currentSeason: 2026,
      currentRound: 26,
    });

    expect(oldLowRated.fee).toBeGreaterThan(youngUnderused.fee);
  });

  it('can reach mutual termination for young underused players', () => {
    const result = calculateReleaseCompensation({
      player: buildPlayer({
        age: 22,
        contractEndSeason: 2027,
        wage: 10_000,
        form: { ...buildPlayer().form, seasonMinutes: 80 },
      }),
      currentSeason: 2026,
      currentRound: 30,
    });

    expect(result.fee).toBe(0);
    expect(result.hasFee).toBe(false);
  });
});
