import type { Team } from '../types';

export interface AttendanceModelOptions {
  round?: number;
  totalRounds?: number;
}

export interface AttendanceRange {
  min: number;
  max: number;
  expected: number;
}

interface AttendanceSamplingOptions extends AttendanceModelOptions {
  random?: () => number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRoundProgress(round?: number, totalRounds?: number): number {
  if (!round || !totalRounds || totalRounds <= 1) return 0;
  return clamp((round - 1) / (totalRounds - 1), 0, 1);
}

/**
 * Deterministic central estimate for home attendance.
 */
export function calculateAttendanceExpectation(
  homeTeam: Pick<Team, 'reputation' | 'momentum'>,
  awayTeam: Pick<Team, 'reputation'>,
  stadiumCapacity: number,
  options: AttendanceModelOptions = {},
): number {
  const safeCapacity = Math.max(0, Math.floor(stadiumCapacity));
  if (safeCapacity === 0) return 0;

  const homeReputation = clamp(homeTeam.reputation, 1, 100);
  const awayReputation = clamp(awayTeam.reputation, 1, 100);
  const homeMomentum = clamp(homeTeam.momentum, 1, 100);
  const roundProgress = normalizeRoundProgress(
    options.round,
    options.totalRounds,
  );

  const baseFillRate = 0.35 + homeReputation * 0.004;
  const opponentAttraction = awayReputation * 0.0018;
  const momentumEffect = ((homeMomentum - 50) / 50) * 0.06;

  const reputationGap = Math.abs(homeReputation - awayReputation);
  const balancedFixtureFactor = clamp(1 - reputationGap / 40, 0, 1);
  const qualityFactor = (homeReputation + awayReputation) / 200;
  const fixturePrestigeBoost = balancedFixtureFactor * qualityFactor * 0.03;

  // Slight late-season uplift from 0 to +4%.
  const roundImportanceBoost = roundProgress * 0.04;

  const fillRate = clamp(
    baseFillRate +
      opponentAttraction +
      momentumEffect +
      fixturePrestigeBoost +
      roundImportanceBoost,
    0.35,
    0.98,
  );

  return Math.round(safeCapacity * fillRate);
}

/**
 * Narrow confidence range around the deterministic expectation.
 */
export function calculateAttendanceRange(
  homeTeam: Pick<Team, 'reputation' | 'momentum'>,
  awayTeam: Pick<Team, 'reputation'>,
  stadiumCapacity: number,
  options: AttendanceModelOptions = {},
): AttendanceRange {
  const safeCapacity = Math.max(0, Math.floor(stadiumCapacity));
  if (safeCapacity === 0) {
    return { min: 0, max: 0, expected: 0 };
  }

  const expected = calculateAttendanceExpectation(
    homeTeam,
    awayTeam,
    safeCapacity,
    options,
  );

  const homeReputation = clamp(homeTeam.reputation, 1, 100);
  const roundProgress = normalizeRoundProgress(
    options.round,
    options.totalRounds,
  );

  // Typical uncertainty is ~6-10%, slightly wider for lower-reputation clubs.
  const uncertainty = clamp(
    0.08 + ((100 - homeReputation) / 100) * 0.02 - roundProgress * 0.02,
    0.06,
    0.1,
  );

  const min = clamp(Math.round(expected * (1 - uncertainty)), 0, safeCapacity);
  const max = clamp(Math.round(expected * (1 + uncertainty)), 0, safeCapacity);

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    expected,
  };
}

/**
 * Sample actual attendance in a bounded way around expectation.
 */
export function sampleAttendance(
  homeTeam: Pick<Team, 'reputation' | 'momentum'>,
  awayTeam: Pick<Team, 'reputation'>,
  stadiumCapacity: number,
  options: AttendanceSamplingOptions = {},
): number {
  const { random = Math.random, ...modelOptions } = options;
  const { min, max } = calculateAttendanceRange(
    homeTeam,
    awayTeam,
    stadiumCapacity,
    modelOptions,
  );

  if (min >= max) return min;

  // Averaging two draws creates a center-weighted distribution.
  const centered = clamp((random() + random()) / 2, 0, 1);
  return Math.round(min + centered * (max - min));
}
