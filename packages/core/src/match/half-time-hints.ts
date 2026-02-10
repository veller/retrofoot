// ============================================================================
// RETROFOOT - Half-time hints (qualitative only, no algorithm leak)
// ============================================================================

import type { FormationType, TacticalPosture, Tactics } from '../types';
import { calculateFormationMatchupImpact } from './tactical-constants';

const BUCKET_THRESHOLD = 0.02;

export type MatchSituation = 'winning' | 'drawing' | 'losing';

export type PostureHintKey =
  | 'increases_creation'
  | 'increases_prevention'
  | 'neutral';

export type FormationMatchupHintKey =
  | 'attack_favourable'
  | 'attack_under_pressure'
  | 'defence_favourable'
  | 'defence_under_pressure'
  | 'midfield_favourable'
  | 'midfield_under_pressure'
  | 'neutral';

export interface HalfTimeHints {
  situation: MatchSituation;
  goalDifference: number;
  postureHints: Record<TacticalPosture, PostureHintKey>;
  formationMatchupHints: FormationMatchupHintKey[];
}

export interface GetHalfTimeHintsParams {
  playerScore: number;
  opponentScore: number;
  playerFormation: FormationType;
  playerPosture: TacticalPosture;
  opponentFormation: FormationType;
  opponentPosture: TacticalPosture;
  isHome: boolean;
}

function bucket(value: number): 'high' | 'neutral' | 'low' {
  if (value >= BUCKET_THRESHOLD) return 'high';
  if (value <= -BUCKET_THRESHOLD) return 'low';
  return 'neutral';
}

/**
 * Returns qualitative hints for the half-time team changes screen.
 * Uses tactical logic internally but only exposes human-readable hint keys.
 */
export function getHalfTimeHints(
  params: GetHalfTimeHintsParams,
): HalfTimeHints {
  const { playerScore, opponentScore, playerFormation, opponentFormation } =
    params;

  const goalDifference = playerScore - opponentScore;
  let situation: MatchSituation;
  if (goalDifference > 0) {
    situation = 'winning';
  } else if (goalDifference < 0) {
    situation = 'losing';
  } else {
    situation = 'drawing';
  }

  const postureHints: Record<TacticalPosture, PostureHintKey> = {
    defensive: 'increases_prevention',
    balanced: 'neutral',
    attacking: 'increases_creation',
  };

  const formationImpact = calculateFormationMatchupImpact(
    playerFormation,
    opponentFormation,
  );

  const creationBucket = bucket(formationImpact.creation);
  const preventionBucket = bucket(formationImpact.prevention);
  const possessionBucket = bucket(formationImpact.possession);

  const formationMatchupHints: FormationMatchupHintKey[] = [];

  if (creationBucket === 'high')
    formationMatchupHints.push('attack_favourable');
  else if (creationBucket === 'low')
    formationMatchupHints.push('attack_under_pressure');

  if (preventionBucket === 'high')
    formationMatchupHints.push('defence_favourable');
  else if (preventionBucket === 'low')
    formationMatchupHints.push('defence_under_pressure');

  if (possessionBucket === 'high')
    formationMatchupHints.push('midfield_favourable');
  else if (possessionBucket === 'low')
    formationMatchupHints.push('midfield_under_pressure');

  if (formationMatchupHints.length === 0) formationMatchupHints.push('neutral');

  return {
    situation,
    goalDifference: Math.abs(goalDifference),
    postureHints,
    formationMatchupHints,
  };
}

/**
 * Convenience: derive hint params from match state and current/selected tactics.
 */
export function getHalfTimeHintsFromState(
  homeScore: number,
  awayScore: number,
  homeTactics: Tactics,
  awayTactics: Tactics,
  isPlayerHome: boolean,
  selectedTactics?: Tactics | null,
): HalfTimeHints {
  const tactics = selectedTactics ?? (isPlayerHome ? homeTactics : awayTactics);
  const opponentTactics = isPlayerHome ? awayTactics : homeTactics;
  const playerScore = isPlayerHome ? homeScore : awayScore;
  const opponentScore = isPlayerHome ? awayScore : homeScore;

  return getHalfTimeHints({
    playerScore,
    opponentScore,
    playerFormation: tactics.formation,
    playerPosture: tactics.posture,
    opponentFormation: opponentTactics.formation,
    opponentPosture: opponentTactics.posture,
    isHome: isPlayerHome,
  });
}
