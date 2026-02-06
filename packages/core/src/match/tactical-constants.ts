import type { FormationType, TacticalPosture } from '../types';

export interface TacticalImpact {
  possession: number;
  creation: number;
  prevention: number;
}

interface FormationLines {
  DEF: number;
  MID: number;
  ATT: number;
}

export const TACTICAL_IMPACT_MIN = -0.2;
export const TACTICAL_IMPACT_MAX = 0.2;
export const POSSESSION_CHANCE_MIN = 0.2;
export const POSSESSION_CHANCE_MAX = 0.8;

const FORMATION_LINES: Record<FormationType, FormationLines> = {
  '4-4-2': { DEF: 4, MID: 4, ATT: 2 },
  '4-3-3': { DEF: 4, MID: 3, ATT: 3 },
  '3-5-2': { DEF: 3, MID: 5, ATT: 2 },
  '4-5-1': { DEF: 4, MID: 5, ATT: 1 },
  '5-3-2': { DEF: 5, MID: 3, ATT: 2 },
  '5-4-1': { DEF: 5, MID: 4, ATT: 1 },
  '3-4-3': { DEF: 3, MID: 4, ATT: 3 },
};

const POSTURE_IMPACT: Record<TacticalPosture, TacticalImpact> = {
  defensive: { possession: -0.03, creation: -0.06, prevention: 0.08 },
  balanced: { possession: 0, creation: 0, prevention: 0 },
  attacking: { possession: 0.03, creation: 0.08, prevention: -0.06 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getPostureImpact(posture: TacticalPosture): TacticalImpact {
  return POSTURE_IMPACT[posture];
}

export function calculateFormationMatchupImpact(
  formation: FormationType,
  opponentFormation: FormationType,
): TacticalImpact {
  const own = FORMATION_LINES[formation];
  const opp = FORMATION_LINES[opponentFormation];

  const possession =
    (own.MID - opp.MID) * 0.012 +
    (own.DEF - opp.ATT) * 0.006 +
    (own.ATT - opp.DEF) * 0.004;
  const creation =
    (own.ATT - opp.DEF) * 0.018 + (own.MID - opp.MID) * 0.008;
  const prevention =
    (own.DEF - opp.ATT) * 0.018 + (own.MID - opp.MID) * 0.006;

  return {
    possession: clamp(possession, TACTICAL_IMPACT_MIN, TACTICAL_IMPACT_MAX),
    creation: clamp(creation, TACTICAL_IMPACT_MIN, TACTICAL_IMPACT_MAX),
    prevention: clamp(prevention, TACTICAL_IMPACT_MIN, TACTICAL_IMPACT_MAX),
  };
}

export function mergeTacticalImpacts(...impacts: TacticalImpact[]): TacticalImpact {
  const merged = impacts.reduce(
    (acc, impact) => ({
      possession: acc.possession + impact.possession,
      creation: acc.creation + impact.creation,
      prevention: acc.prevention + impact.prevention,
    }),
    { possession: 0, creation: 0, prevention: 0 },
  );

  return {
    possession: clamp(merged.possession, TACTICAL_IMPACT_MIN, TACTICAL_IMPACT_MAX),
    creation: clamp(merged.creation, TACTICAL_IMPACT_MIN, TACTICAL_IMPACT_MAX),
    prevention: clamp(merged.prevention, TACTICAL_IMPACT_MIN, TACTICAL_IMPACT_MAX),
  };
}
