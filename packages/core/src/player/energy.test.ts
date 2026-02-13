import { describe, expect, it } from 'vitest';
import { calculateEnergyDrain } from './index';

describe('calculateEnergyDrain', () => {
  it('increases with minutes played', () => {
    const short = calculateEnergyDrain({
      minutesPlayed: 30,
      posture: 'balanced',
      age: 26,
      stamina: 70,
      position: 'MID',
    });
    const full = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 26,
      stamina: 70,
      position: 'MID',
    });

    expect(full).toBeGreaterThan(short);
  });

  it('penalizes older players and lower stamina players', () => {
    const youngHighStamina = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 24,
      stamina: 85,
      position: 'MID',
    });
    const oldLowStamina = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 34,
      stamina: 50,
      position: 'MID',
    });

    expect(oldLowStamina).toBeGreaterThan(youngHighStamina);
  });

  it('is notably harsher for 35+ players after two hard games', () => {
    const age34 = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 34,
      stamina: 65,
      position: 'MID',
    });
    const age35 = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 35,
      stamina: 65,
      position: 'MID',
    });

    expect(age35).toBeGreaterThan(age34);
    expect(age35 * 2).toBeGreaterThanOrEqual(24);
  });

  it('drains more in attacking posture than defensive', () => {
    const defensive = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'defensive',
      age: 27,
      stamina: 70,
      position: 'ATT',
    });
    const attacking = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'attacking',
      age: 27,
      stamina: 70,
      position: 'ATT',
    });

    expect(attacking).toBeGreaterThan(defensive);
  });

  it('applies goalkeeper drain discount', () => {
    const outfield = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 27,
      stamina: 70,
      position: 'DEF',
    });
    const gk = calculateEnergyDrain({
      minutesPlayed: 90,
      posture: 'balanced',
      age: 27,
      stamina: 70,
      position: 'GK',
    });

    expect(gk).toBeLessThan(outfield);
  });

  it('caps to valid range', () => {
    const extreme = calculateEnergyDrain({
      minutesPlayed: 120,
      posture: 'attacking',
      age: 45,
      stamina: 1,
      position: 'ATT',
    });

    expect(extreme).toBeGreaterThanOrEqual(0);
    expect(extreme).toBeLessThanOrEqual(100);
  });
});
