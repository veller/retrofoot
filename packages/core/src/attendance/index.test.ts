import { describe, expect, it } from 'vitest';
import { TEAMS } from '../data/teams';
import {
  calculateAttendanceExpectation,
  calculateAttendanceRange,
  sampleAttendance,
} from './index';

describe('attendance model', () => {
  it('returns zero attendance for zero-capacity stadiums', () => {
    const expectation = calculateAttendanceExpectation(
      { reputation: 80, momentum: 60 },
      { reputation: 80 },
      0,
      { round: 10, totalRounds: 38 },
    );
    const range = calculateAttendanceRange(
      { reputation: 80, momentum: 60 },
      { reputation: 80 },
      0,
      { round: 10, totalRounds: 38 },
    );

    expect(expectation).toBe(0);
    expect(range).toEqual({ min: 0, max: 0, expected: 0 });
  });

  it('increases expectation for higher home reputation when other factors are equal', () => {
    const lowerRep = calculateAttendanceExpectation(
      { reputation: 60, momentum: 60 },
      { reputation: 75 },
      40_000,
      { round: 10, totalRounds: 38 },
    );
    const higherRep = calculateAttendanceExpectation(
      { reputation: 90, momentum: 60 },
      { reputation: 75 },
      40_000,
      { round: 10, totalRounds: 38 },
    );

    expect(higherRep).toBeGreaterThan(lowerRep);
  });

  it('builds a bounded range that contains the expectation', () => {
    const range = calculateAttendanceRange(
      { reputation: 78, momentum: 54 },
      { reputation: 82 },
      50_000,
      { round: 12, totalRounds: 38 },
    );

    expect(range.min).toBeGreaterThanOrEqual(0);
    expect(range.max).toBeLessThanOrEqual(50_000);
    expect(range.min).toBeLessThanOrEqual(range.expected);
    expect(range.max).toBeGreaterThanOrEqual(range.expected);
  });

  it('samples attendance within the computed range bounds', () => {
    const input = {
      homeTeam: { reputation: 74, momentum: 49 },
      awayTeam: { reputation: 86 },
      capacity: 42_000,
      options: { round: 18, totalRounds: 38 },
    };
    const range = calculateAttendanceRange(
      input.homeTeam,
      input.awayTeam,
      input.capacity,
      input.options,
    );

    const lowSample = sampleAttendance(
      input.homeTeam,
      input.awayTeam,
      input.capacity,
      { ...input.options, random: () => 0 },
    );
    const highSample = sampleAttendance(
      input.homeTeam,
      input.awayTeam,
      input.capacity,
      { ...input.options, random: () => 1 },
    );

    expect(lowSample).toBe(range.min);
    expect(highSample).toBe(range.max);
  });

  it('produces plausible attendance levels for low and elite clubs', () => {
    const lowClub = TEAMS.find((team) => team.id === 'laranjamecanica');
    const eliteClub = TEAMS.find((team) => team.id === 'mengalvio');
    const awayClub = TEAMS.find((team) => team.id === 'palestra');

    expect(lowClub).toBeDefined();
    expect(eliteClub).toBeDefined();
    expect(awayClub).toBeDefined();

    const lowRange = calculateAttendanceRange(
      { reputation: lowClub!.reputation, momentum: 50 },
      { reputation: awayClub!.reputation },
      lowClub!.capacity,
      { round: 30, totalRounds: 38 },
    );
    const eliteRange = calculateAttendanceRange(
      { reputation: eliteClub!.reputation, momentum: 50 },
      { reputation: awayClub!.reputation },
      eliteClub!.capacity,
      { round: 30, totalRounds: 38 },
    );

    expect(lowRange.max / lowClub!.capacity).toBeLessThan(0.96);
    expect(lowRange.min / lowClub!.capacity).toBeGreaterThan(0.45);

    expect(eliteRange.max / eliteClub!.capacity).toBeLessThanOrEqual(1);
    expect(eliteRange.min / eliteClub!.capacity).toBeGreaterThan(0.6);
  });
});
