// ============================================================================
// RETROFOOT - Match Engine
// ============================================================================
// Simulates matches minute-by-minute with events

import type {
  Team,
  Player,
  Tactics,
  MatchEvent,
  MatchResult,
  Fixture,
} from '../types';
import { calculateOverall } from '../types';
import {
  EVENT_PROBABILITY_PER_MINUTE,
  BASE_GOAL_CONVERSION,
  MIN_GOAL_CONVERSION,
  MAX_GOAL_CONVERSION,
  HOME_POSSESSION_BONUS,
  HOME_CONVERSION_BONUS,
  PLAYER_FORM_WEIGHT,
  NEUTRAL_FORM,
  TEAM_MOMENTUM_WEIGHT,
  NEUTRAL_MOMENTUM,
  STRIKER_DROUGHT_THRESHOLD,
  STRIKER_DROUGHT_PENALTY,
  STRIKER_HOT_STREAK_BONUS,
  GK_CLEAN_SHEET_BONUS,
  FITNESS_THRESHOLD,
  FITNESS_PENALTY_FACTOR,
  LATE_GAME_FITNESS_MINUTE,
  ENERGY_PENALTY_CAP,
  SEASON_FATIGUE,
  CORNER_GOAL_RATE,
  FREE_KICK_GOAL_RATE,
  RED_CARD_STRENGTH_PENALTY,
  EVENT_THRESHOLD_ATTACKING_CHANCE,
  EVENT_THRESHOLD_YELLOW_CARD,
  EVENT_THRESHOLD_RED_CARD,
  EVENT_THRESHOLD_CORNER,
  EVENT_THRESHOLD_FREE_KICK,
  EVENT_THRESHOLD_SAVE,
} from './constants';
import {
  calculateFormationMatchupImpact,
  getPostureImpact,
  mergeTacticalImpacts,
  POSSESSION_CHANCE_MAX,
  POSSESSION_CHANCE_MIN,
  type TacticalImpact,
} from './tactical-constants';

// Match simulation configuration
export interface MatchConfig {
  homeTeam: Team;
  awayTeam: Team;
  homeTactics: Tactics;
  awayTactics: Tactics;
  neutralVenue?: boolean;
  fixtureId?: string;
}

// Match state exposed to UI
export interface MatchState {
  minute: number;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  homeLineup: Player[];
  awayLineup: Player[];
  homeSubs: Player[];
  awaySubs: Player[];
  homeTactics: Tactics;
  awayTactics: Tactics;
  possession: 'home' | 'away';
  phase: 'first_half' | 'half_time' | 'second_half' | 'full_time';
  homeSubsUsed: number;
  awaySubsUsed: number;
  stoppageTime: number;
  homeRedCards: number;
  awayRedCards: number;
  homeTacticalImpact: TacticalImpact;
  awayTacticalImpact: TacticalImpact;
}

// Live match state for a single match in multi-match simulation
export interface LiveMatchState {
  fixtureId: string;
  homeTeam: Team;
  awayTeam: Team;
  state: MatchState;
  attendance: number;
  latestEvent?: MatchEvent;
}

// Random number generator (can be seeded for deterministic results)
function random(): number {
  return Math.random();
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function weightedRandom(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// Goal type distribution based on real-world stats:
// ~73% assisted, ~24% unassisted, ~3% own goals
type GoalType = 'assisted' | 'unassisted' | 'own_goal';

function determineGoalType(): GoalType {
  const roll = random();
  if (roll < 0.03) return 'own_goal'; // 3% own goals
  if (roll < 0.27) return 'unassisted'; // 24% unassisted (penalties, solo, deflection)
  return 'assisted'; // 73% have assists
}

// Pick an assist player (not the scorer, weighted by passing + vision)
function pickAssister(
  players: Player[],
  tactics: Tactics,
  scorerId: string,
): Player | undefined {
  const lineupPlayers = players.filter(
    (p) =>
      tactics.lineup.includes(p.id) && p.id !== scorerId && p.position !== 'GK',
  );

  if (lineupPlayers.length === 0) return undefined;

  // Weight by passing and vision
  const weights = lineupPlayers.map(
    (p) => p.attributes.passing + p.attributes.vision,
  );
  const idx = weightedRandom(weights);
  return lineupPlayers[idx];
}

// Pick a defender for own goal (weighted by lower composure = higher chance of OG)
function pickOwnGoalPlayer(
  players: Player[],
  tactics: Tactics,
): Player | undefined {
  const lineupPlayers = players.filter(
    (p) =>
      tactics.lineup.includes(p.id) &&
      (p.position === 'DEF' || p.position === 'GK'),
  );

  if (lineupPlayers.length === 0) {
    // Fallback to any outfield player
    const outfield = players.filter(
      (p) => tactics.lineup.includes(p.id) && p.position !== 'GK',
    );
    if (outfield.length === 0) return undefined;
    return outfield[randomInt(0, outfield.length - 1)];
  }

  // Weight inversely by composure (lower composure = more likely OG)
  const weights = lineupPlayers.map((p) => 100 - p.attributes.composure);
  const idx = weightedRandom(weights);
  return lineupPlayers[idx];
}

// Calculate form modifier: ±15% based on player form (70 = neutral)
function calculateFormModifier(form: number): number {
  // Form ranges 1-100, neutral is 70
  // Returns -0.15 to +0.15
  return ((form - NEUTRAL_FORM) / 100) * PLAYER_FORM_WEIGHT * 1.5;
}

// Calculate momentum modifier: ±8% based on team momentum (50 = neutral)
function calculateMomentumModifier(momentum: number): number {
  // Momentum ranges 1-100, neutral is 50
  // Returns -0.08 to +0.08
  return ((momentum - NEUTRAL_MOMENTUM) / 100) * TEAM_MOMENTUM_WEIGHT * 2;
}

// Calculate fitness modifier: 0-30% penalty for low fitness, worse after minute 60
function calculateFitnessModifier(fitness: number, minute: number): number {
  if (fitness >= FITNESS_THRESHOLD) return 0;

  // Base penalty for low fitness
  let penalty = (FITNESS_THRESHOLD - fitness) * FITNESS_PENALTY_FACTOR;

  // Increased penalty in late game (after minute 60)
  if (minute > LATE_GAME_FITNESS_MINUTE) {
    const lateGameFactor = 1 + (minute - LATE_GAME_FITNESS_MINUTE) / 60;
    penalty *= lateGameFactor;
  }

  // Cap at 30% penalty
  return Math.min(0.3, penalty);
}

// Energy modifier: 0% penalty at 100 energy, up to ENERGY_PENALTY_CAP at 0 energy
export function calculateEnergyModifier(energy: number): number {
  const e = Math.max(0, Math.min(100, energy));
  return ((100 - e) / 100) * ENERGY_PENALTY_CAP;
}

// Round-based effective energy for opponent (AI) teams; no DB persistence
export function getOpponentEffectiveEnergy(
  round: number,
  totalRounds: number,
): number {
  if (totalRounds <= 0) return 100;
  const progress = Math.max(0, Math.min(1, round / totalRounds));
  const effective = 100 - SEASON_FATIGUE * progress;
  return Math.max(1, Math.min(100, Math.round(effective)));
}

// Calculate striker streak modifier based on recent performance
function calculateStrikerStreakModifier(player: Player): number {
  const ratings = player.form?.lastFiveRatings || [];
  if (ratings.length === 0) return 0;

  // Count matches without goals (assuming rating < 6.5 indicates no goal contribution)
  const lowRatings = ratings.filter((r) => r < 6.5).length;

  // Drought: 5+ low-rated matches = penalty
  if (lowRatings >= STRIKER_DROUGHT_THRESHOLD) {
    return (
      -STRIKER_DROUGHT_PENALTY *
      (1 + (lowRatings - STRIKER_DROUGHT_THRESHOLD) * 0.5)
    );
  }

  // Hot streak: high average rating = bonus
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  if (avgRating >= 7.5 && ratings.length >= 3) {
    return STRIKER_HOT_STREAK_BONUS;
  }

  return 0;
}

// Calculate GK streak modifier: penalty against in-form GK
function calculateGKStreakModifier(gk: Player | undefined): number {
  if (!gk || gk.position !== 'GK') return 0;

  const ratings = gk.form?.lastFiveRatings || [];
  if (ratings.length < 3) return 0;

  // High average rating indicates clean sheets / good performances
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  if (avgRating >= 7.0) {
    return -GK_CLEAN_SHEET_BONUS;
  }

  return 0;
}

// Calculate red card penalty: -8 strength for first, +5 per additional
function calculateRedCardPenalty(redCards: number): number {
  if (redCards <= 0) return 0;
  return RED_CARD_STRENGTH_PENALTY + (redCards - 1) * 5;
}

// Options for calculateTeamStrength
interface TeamStrengthOptions {
  team?: Team;
  redCards?: number;
  minute?: number;
}

// Calculate team strength from lineup
function calculateTeamStrength(
  players: Player[],
  tactics: Tactics,
  options?: TeamStrengthOptions,
): number {
  const lineupPlayers = players.filter((p) => tactics.lineup.includes(p.id));
  if (lineupPlayers.length === 0) return 50;

  const minute = options?.minute ?? 0;

  // Calculate individual player strength with form and fitness modifiers
  let totalStrength = 0;
  for (const player of lineupPlayers) {
    let playerStrength = calculateOverall(player);

    // Apply form modifier (±15%)
    const formMod = calculateFormModifier(player.form?.form ?? NEUTRAL_FORM);
    playerStrength *= 1 + formMod;

    // Apply fitness penalty (0-30%)
    const fitnessPenalty = calculateFitnessModifier(
      player.fitness ?? 100,
      minute,
    );
    playerStrength *= 1 - fitnessPenalty;

    // Apply energy penalty (0-60%): low energy = exhausted
    const energyPenalty = calculateEnergyModifier(player.energy ?? 100);
    playerStrength *= 1 - energyPenalty;

    totalStrength += playerStrength;
  }

  let avgStrength = totalStrength / lineupPlayers.length;

  // Apply team momentum modifier (±8%)
  if (options?.team?.momentum !== undefined) {
    const momentumMod = calculateMomentumModifier(options.team.momentum);
    avgStrength *= 1 + momentumMod;
  }

  // Apply red card penalty
  if (options?.redCards && options.redCards > 0) {
    avgStrength -= calculateRedCardPenalty(options.redCards);
  }

  return avgStrength;
}

// Options for calculateChanceSuccess
interface ChanceSuccessOptions {
  isHome?: boolean;
  isNeutralVenue?: boolean;
  attackingTeam?: Team;
  defendingTeam?: Team;
  homeRedCards?: number;
  awayRedCards?: number;
  minute?: number;
  scorer?: Player;
  attackingImpact?: TacticalImpact;
  defendingImpact?: TacticalImpact;
}

// Calculate attack vs defense for a chance
function calculateChanceSuccess(
  attackingPlayers: Player[],
  defendingPlayers: Player[],
  attackingTactics: Tactics,
  defendingTactics?: Tactics,
  options?: ChanceSuccessOptions,
): number {
  const isHome = options?.isHome ?? false;
  const isNeutralVenue = options?.isNeutralVenue ?? false;
  const minute = options?.minute ?? 0;

  // Calculate attacking team strength
  const attackStrength = calculateTeamStrength(
    attackingPlayers,
    attackingTactics,
    {
      team: options?.attackingTeam,
      redCards: isHome ? options?.homeRedCards : options?.awayRedCards,
      minute,
    },
  );

  // Calculate defending team strength
  const defTactics = defendingTactics ?? {
    ...attackingTactics,
    posture: 'defensive' as const,
  };
  const defenseStrength = calculateTeamStrength(defendingPlayers, defTactics, {
    team: options?.defendingTeam,
    redCards: isHome ? options?.awayRedCards : options?.homeRedCards,
    minute,
  });

  // Base chance modified by strength difference
  const strengthDiff = attackStrength - defenseStrength;
  let baseChance = BASE_GOAL_CONVERSION + (strengthDiff / 100) * 0.2;

  const attackingImpact = options?.attackingImpact;
  const defendingImpact = options?.defendingImpact;
  if (attackingImpact || defendingImpact) {
    const attackingCreation = attackingImpact?.creation ?? 0;
    const defendingPrevention = defendingImpact?.prevention ?? 0;
    baseChance += (attackingCreation - defendingPrevention) * 0.35;
  }

  // Home conversion bonus (+5% if home and not neutral venue)
  if (isHome && !isNeutralVenue) {
    baseChance += HOME_CONVERSION_BONUS;
  }

  // Striker streak modifier
  if (options?.scorer) {
    baseChance += calculateStrikerStreakModifier(options.scorer);
  }

  // GK streak modifier (penalty against in-form GK)
  const defendingGK = defendingPlayers.find((p) => p.position === 'GK');
  baseChance += calculateGKStreakModifier(defendingGK);

  return Math.max(
    MIN_GOAL_CONVERSION,
    Math.min(MAX_GOAL_CONVERSION, baseChance),
  );
}

// Pick a random player from lineup (weighted by relevant attribute)
function pickScorer(players: Player[], tactics: Tactics): Player | undefined {
  const lineupPlayers = players.filter((p) => tactics.lineup.includes(p.id));
  // Attackers and midfielders can score
  const attackers = lineupPlayers.filter((p) =>
    ['ATT', 'MID'].includes(p.position),
  );
  if (attackers.length === 0) return lineupPlayers[0];

  const weights = attackers.map(
    (p) => p.attributes.shooting + p.attributes.positioning,
  );
  const idx = weightedRandom(weights);
  return attackers[idx];
}

// Create initial match state
export function createMatchState(config: MatchConfig): MatchState {
  const { homeTeam, awayTeam, homeTactics, awayTactics } = config;

  return {
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    events: [],
    homeLineup: homeTactics.lineup
      .map((id) => homeTeam.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined),
    awayLineup: awayTactics.lineup
      .map((id) => awayTeam.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined),
    homeSubs: homeTactics.substitutes
      .map((id) => homeTeam.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined),
    awaySubs: awayTactics.substitutes
      .map((id) => awayTeam.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined),
    homeTactics,
    awayTactics,
    possession: 'home',
    phase: 'first_half',
    homeSubsUsed: 0,
    awaySubsUsed: 0,
    stoppageTime: randomInt(1, 5),
    homeRedCards: 0,
    awayRedCards: 0,
    homeTacticalImpact: { possession: 0, creation: 0, prevention: 0 },
    awayTacticalImpact: { possession: 0, creation: 0, prevention: 0 },
  };
}

// Make a substitution
export function makeSubstitution(
  state: MatchState,
  team: 'home' | 'away',
  playerOutId: string,
  playerInId: string,
): { success: boolean; event?: MatchEvent } {
  const MAX_SUBS = 5;
  const subsUsed = team === 'home' ? state.homeSubsUsed : state.awaySubsUsed;

  if (subsUsed >= MAX_SUBS) {
    return { success: false };
  }

  const lineup = team === 'home' ? state.homeLineup : state.awayLineup;
  const subs = team === 'home' ? state.homeSubs : state.awaySubs;
  const tactics = team === 'home' ? state.homeTactics : state.awayTactics;

  const playerOutIndex = lineup.findIndex((p) => p.id === playerOutId);
  const playerIn = subs.find((p) => p.id === playerInId);

  if (playerOutIndex === -1 || !playerIn) {
    return { success: false };
  }

  const playerOut = lineup[playerOutIndex];

  // Swap players
  lineup[playerOutIndex] = playerIn;
  const subIndex = subs.findIndex((p) => p.id === playerInId);
  subs.splice(subIndex, 1);

  // Update tactics lineup
  const lineupIndex = tactics.lineup.indexOf(playerOutId);
  if (lineupIndex !== -1) {
    tactics.lineup[lineupIndex] = playerInId;
  }

  // Increment subs used
  if (team === 'home') {
    state.homeSubsUsed++;
  } else {
    state.awaySubsUsed++;
  }

  const event: MatchEvent = {
    minute: state.minute,
    type: 'substitution',
    team,
    playerId: playerInId,
    playerName: playerIn.nickname || playerIn.name,
    assistPlayerId: playerOutId,
    assistPlayerName: playerOut.nickname || playerOut.name,
    description: `Substitution: ${playerIn.nickname || playerIn.name} replaces ${playerOut.nickname || playerOut.name}`,
  };

  state.events.push(event);

  return { success: true, event };
}

// Pick a set piece scorer (weighted by heading + positioning for corners, shooting for free kicks)
function pickSetPieceScorer(
  players: Player[],
  tactics: Tactics,
  isCorner: boolean,
): Player | undefined {
  const lineupPlayers = players.filter((p) => tactics.lineup.includes(p.id));
  const outfield = lineupPlayers.filter((p) => p.position !== 'GK');
  if (outfield.length === 0) return lineupPlayers[0];

  // For corners, weight by heading + positioning; for free kicks, by shooting
  const weights = outfield.map((p) =>
    isCorner
      ? p.attributes.heading + p.attributes.positioning
      : p.attributes.shooting + p.attributes.composure,
  );
  const idx = weightedRandom(weights);
  return outfield[idx];
}

// Simulate a single minute
function simulateMinute(state: MatchState, config: MatchConfig): void {
  const homeFormationImpact = calculateFormationMatchupImpact(
    state.homeTactics.formation,
    state.awayTactics.formation,
  );
  const awayFormationImpact = calculateFormationMatchupImpact(
    state.awayTactics.formation,
    state.homeTactics.formation,
  );
  const homePostureImpact = getPostureImpact(state.homeTactics.posture);
  const awayPostureImpact = getPostureImpact(state.awayTactics.posture);

  state.homeTacticalImpact = mergeTacticalImpacts(
    homeFormationImpact,
    homePostureImpact,
  );
  state.awayTacticalImpact = mergeTacticalImpacts(
    awayFormationImpact,
    awayPostureImpact,
  );

  // Calculate team strengths with all modifiers
  const homeStrength = calculateTeamStrength(
    state.homeLineup,
    state.homeTactics,
    {
      team: config.homeTeam,
      redCards: state.homeRedCards,
      minute: state.minute,
    },
  );
  const awayStrength = calculateTeamStrength(
    state.awayLineup,
    state.awayTactics,
    {
      team: config.awayTeam,
      redCards: state.awayRedCards,
      minute: state.minute,
    },
  );

  // Determine which team has possession
  const possessionRoll = random();
  let homePossChance = 0.5 + (homeStrength - awayStrength) / 200;
  homePossChance +=
    state.homeTacticalImpact.possession - state.awayTacticalImpact.possession;

  // Home possession bonus (if not neutral venue)
  if (!config.neutralVenue) {
    homePossChance += HOME_POSSESSION_BONUS;
  }
  homePossChance = Math.max(
    POSSESSION_CHANCE_MIN,
    Math.min(POSSESSION_CHANCE_MAX, homePossChance),
  );

  state.possession = possessionRoll < homePossChance ? 'home' : 'away';

  const attackingTeam = state.possession;
  const attackingPlayers =
    attackingTeam === 'home' ? state.homeLineup : state.awayLineup;
  const defendingPlayers =
    attackingTeam === 'home' ? state.awayLineup : state.homeLineup;
  const attackingTactics =
    attackingTeam === 'home' ? state.homeTactics : state.awayTactics;
  const defendingTactics =
    attackingTeam === 'home' ? state.awayTactics : state.homeTactics;
  const teamObj = attackingTeam === 'home' ? config.homeTeam : config.awayTeam;
  const defendingTeamObj =
    attackingTeam === 'home' ? config.awayTeam : config.homeTeam;
  const attackingImpact =
    attackingTeam === 'home'
      ? state.homeTacticalImpact
      : state.awayTacticalImpact;
  const defendingImpact =
    attackingTeam === 'home'
      ? state.awayTacticalImpact
      : state.homeTacticalImpact;

  const eventProbability = Math.max(
    0.05,
    Math.min(
      0.35,
      EVENT_PROBABILITY_PER_MINUTE +
        attackingImpact.creation * 0.2 -
        defendingImpact.prevention * 0.1,
    ),
  );

  // Chance of something happening this minute
  if (random() > eventProbability) return;

  // What kind of event?
  const eventRoll = random();

  if (eventRoll < EVENT_THRESHOLD_ATTACKING_CHANCE) {
    // Attacking chance - pick scorer first to factor into success calculation
    const scorer = pickScorer(attackingPlayers, attackingTactics);

    const successChance = calculateChanceSuccess(
      attackingPlayers,
      defendingPlayers,
      attackingTactics,
      defendingTactics,
      {
        isHome: attackingTeam === 'home',
        isNeutralVenue: config.neutralVenue,
        attackingTeam: teamObj,
        defendingTeam: defendingTeamObj,
        homeRedCards: state.homeRedCards,
        awayRedCards: state.awayRedCards,
        minute: state.minute,
        scorer,
        attackingImpact,
        defendingImpact,
      },
    );

    if (random() < successChance) {
      // GOAL! Determine the type
      const goalType = determineGoalType();

      if (goalType === 'own_goal') {
        // Own goal by defending team
        const ownGoalPlayer = pickOwnGoalPlayer(
          defendingPlayers,
          defendingTactics,
        );
        if (attackingTeam === 'home') {
          state.homeScore++;
        } else {
          state.awayScore++;
        }

        state.events.push({
          minute: state.minute,
          type: 'own_goal',
          team: attackingTeam, // Credit goes to attacking team
          playerId: ownGoalPlayer?.id,
          playerName:
            ownGoalPlayer?.nickname || ownGoalPlayer?.name || 'Defender',
          description: `OWN GOAL! ${ownGoalPlayer?.nickname || ownGoalPlayer?.name} puts the ball into their own net!`,
        });
      } else {
        // Regular goal (assisted or unassisted)
        if (attackingTeam === 'home') {
          state.homeScore++;
        } else {
          state.awayScore++;
        }

        // Pick assister for assisted goals
        let assistPlayer: Player | undefined;
        if (goalType === 'assisted' && scorer) {
          assistPlayer = pickAssister(
            attackingPlayers,
            attackingTactics,
            scorer.id,
          );
        }

        const scorerName = scorer?.nickname || scorer?.name || 'Unknown';
        let description = `GOAL! ${scorerName} scores for ${teamObj.name}!`;
        if (assistPlayer) {
          const assisterName =
            assistPlayer.nickname || assistPlayer.name || 'Unknown';
          description = `GOAL! ${scorerName} scores for ${teamObj.name}! Assist: ${assisterName}`;
        }

        state.events.push({
          minute: state.minute,
          type: 'goal',
          team: attackingTeam,
          playerId: scorer?.id,
          playerName: scorerName,
          assistPlayerId: assistPlayer?.id,
          assistPlayerName: assistPlayer?.nickname || assistPlayer?.name,
          description,
        });
      }
    } else {
      // Chance missed
      const shooter = pickScorer(attackingPlayers, attackingTactics);
      state.events.push({
        minute: state.minute,
        type: 'chance_missed',
        team: attackingTeam,
        playerId: shooter?.id,
        playerName: shooter?.nickname || shooter?.name || 'Unknown',
        description: `${shooter?.nickname || shooter?.name} misses a chance!`,
      });
    }
  } else if (eventRoll < EVENT_THRESHOLD_YELLOW_CARD) {
    // Yellow card
    const allPlayers =
      attackingTeam === 'home' ? state.awayLineup : state.homeLineup;
    if (allPlayers.length === 0) return;
    const fouler = allPlayers[randomInt(0, allPlayers.length - 1)];
    state.events.push({
      minute: state.minute,
      type: 'yellow_card',
      team: attackingTeam === 'home' ? 'away' : 'home',
      playerId: fouler?.id,
      playerName: fouler?.nickname || fouler?.name || 'Unknown',
      description: `Yellow card for ${fouler?.nickname || fouler?.name}`,
    });
  } else if (eventRoll < EVENT_THRESHOLD_RED_CARD) {
    // Red card (rare)
    const foulingTeam = attackingTeam === 'home' ? 'away' : 'home';
    const allPlayers =
      attackingTeam === 'home' ? state.awayLineup : state.homeLineup;
    if (allPlayers.length === 0) return;
    const fouler = allPlayers[randomInt(0, allPlayers.length - 1)];

    // Increment red card counter
    if (foulingTeam === 'home') {
      state.homeRedCards++;
    } else {
      state.awayRedCards++;
    }

    state.events.push({
      minute: state.minute,
      type: 'red_card',
      team: foulingTeam,
      playerId: fouler?.id,
      playerName: fouler?.nickname || fouler?.name || 'Unknown',
      description: `RED CARD! ${fouler?.nickname || fouler?.name} is sent off!`,
    });
  } else if (eventRoll < EVENT_THRESHOLD_CORNER) {
    // Corner with goal chance
    state.events.push({
      minute: state.minute,
      type: 'corner',
      team: attackingTeam,
      description: `Corner kick for ${teamObj.name}`,
    });

    // Set piece goal chance from corner
    if (random() < CORNER_GOAL_RATE) {
      const scorer = pickSetPieceScorer(
        attackingPlayers,
        attackingTactics,
        true,
      );
      if (attackingTeam === 'home') {
        state.homeScore++;
      } else {
        state.awayScore++;
      }

      const scorerName = scorer?.nickname || scorer?.name || 'Unknown';
      state.events.push({
        minute: state.minute,
        type: 'goal',
        team: attackingTeam,
        playerId: scorer?.id,
        playerName: scorerName,
        description: `GOAL! ${scorerName} heads in from the corner for ${teamObj.name}!`,
      });
    }
  } else if (eventRoll < EVENT_THRESHOLD_FREE_KICK) {
    // Free kick with goal chance
    state.events.push({
      minute: state.minute,
      type: 'free_kick',
      team: attackingTeam,
      description: `Free kick in a dangerous position for ${teamObj.name}`,
    });

    // Set piece goal chance from free kick
    if (random() < FREE_KICK_GOAL_RATE) {
      const scorer = pickSetPieceScorer(
        attackingPlayers,
        attackingTactics,
        false,
      );
      if (attackingTeam === 'home') {
        state.homeScore++;
      } else {
        state.awayScore++;
      }

      const scorerName = scorer?.nickname || scorer?.name || 'Unknown';
      state.events.push({
        minute: state.minute,
        type: 'goal',
        team: attackingTeam,
        playerId: scorer?.id,
        playerName: scorerName,
        description: `GOAL! ${scorerName} scores directly from the free kick for ${teamObj.name}!`,
      });
    }
  } else if (eventRoll < EVENT_THRESHOLD_SAVE) {
    // Save by goalkeeper
    const gk = defendingPlayers.find((p) => p.position === 'GK');
    state.events.push({
      minute: state.minute,
      type: 'save',
      team: attackingTeam === 'home' ? 'away' : 'home',
      playerId: gk?.id,
      playerName: gk?.nickname || gk?.name || 'Goalkeeper',
      description: `Great save by ${gk?.nickname || gk?.name}!`,
    });
  }
  // Otherwise, nothing notable happened
}

// Main match simulation function (instant, complete simulation)
export function simulateMatch(config: MatchConfig): MatchResult {
  const { homeTeam, awayTeam } = config;

  const state = createMatchState(config);
  const totalMinutes = 90 + state.stoppageTime;

  // Kickoff event
  state.events.push({
    minute: 0,
    type: 'kickoff',
    team: 'home',
    description: 'Kickoff! The match begins.',
  });

  for (let minute = 1; minute <= totalMinutes; minute++) {
    state.minute = minute;

    // Half-time
    if (minute === 46 && state.phase === 'first_half') {
      state.phase = 'second_half';
      state.events.push({
        minute: 45,
        type: 'half_time',
        team: 'home',
        description: `Half-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
      });
    }

    simulateMinute(state, config);
  }

  // Full-time event
  state.phase = 'full_time';
  state.events.push({
    minute: totalMinutes,
    type: 'full_time',
    team: 'home',
    description: `Full-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
  });

  return {
    id: config.fixtureId || `match-${Date.now()}`,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    events: state.events,
    attendance: randomInt(
      Math.floor(homeTeam.capacity * 0.5),
      homeTeam.capacity,
    ),
    date: new Date().toISOString(),
  };
}

// Live simulation step - advances match by one minute
export function simulateMatchStep(
  state: MatchState,
  config: MatchConfig,
): MatchEvent | undefined {
  const { homeTeam, awayTeam } = config;
  const totalMinutes = 90 + state.stoppageTime;

  // Handle phase transitions
  if (state.minute === 0 && state.events.length === 0) {
    const kickoffEvent: MatchEvent = {
      minute: 0,
      type: 'kickoff',
      team: 'home',
      description: 'Kickoff! The match begins.',
    };
    state.events.push(kickoffEvent);
    return kickoffEvent;
  }

  // Advance minute
  state.minute++;

  // Half-time at minute 45
  if (state.minute === 45 && state.phase === 'first_half') {
    state.phase = 'half_time';
    const htEvent: MatchEvent = {
      minute: 45,
      type: 'half_time',
      team: 'home',
      description: `Half-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
    };
    state.events.push(htEvent);
    return htEvent;
  }

  // Full-time
  if (state.minute > totalMinutes) {
    state.phase = 'full_time';
    const ftEvent: MatchEvent = {
      minute: state.minute,
      type: 'full_time',
      team: 'home',
      description: `Full-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
    };
    state.events.push(ftEvent);
    return ftEvent;
  }

  // Simulate the minute
  const eventsBefore = state.events.length;
  simulateMinute(state, config);

  return state.events.length > eventsBefore
    ? state.events[state.events.length - 1]
    : undefined;
}

// Resume from half-time
export function resumeFromHalfTime(state: MatchState): void {
  if (state.phase === 'half_time') {
    state.phase = 'second_half';
    state.minute = 45;
  }
}

// Export helper to stream events (for live simulation in UI)
export function* simulateMatchLive(
  config: MatchConfig,
): Generator<{ minute: number; state: MatchState; event?: MatchEvent }> {
  const { homeTeam, awayTeam } = config;
  const state = createMatchState(config);
  const totalMinutes = 90 + state.stoppageTime;

  // Kickoff
  const kickoffEvent: MatchEvent = {
    minute: 0,
    type: 'kickoff',
    team: 'home',
    description: 'Kickoff! The match begins.',
  };
  state.events.push(kickoffEvent);
  yield { minute: 0, state: { ...state }, event: kickoffEvent };

  for (let minute = 1; minute <= totalMinutes; minute++) {
    state.minute = minute;

    // Half-time at minute 45
    if (minute === 45) {
      state.phase = 'half_time';
      const htEvent: MatchEvent = {
        minute: 45,
        type: 'half_time',
        team: 'home',
        description: `Half-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
      };
      state.events.push(htEvent);
      yield { minute, state: { ...state }, event: htEvent };
      continue;
    }

    // Resume second half
    if (minute === 46 && state.phase === 'half_time') {
      state.phase = 'second_half';
    }

    const eventsBefore = state.events.length;
    simulateMinute(state, config);

    const newEvent =
      state.events.length > eventsBefore
        ? state.events[state.events.length - 1]
        : undefined;

    yield { minute, state: { ...state }, event: newEvent };
  }

  // Full-time
  state.phase = 'full_time';
  const ftEvent: MatchEvent = {
    minute: totalMinutes,
    type: 'full_time',
    team: 'home',
    description: `Full-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
  };
  state.events.push(ftEvent);
  yield { minute: totalMinutes, state: { ...state }, event: ftEvent };
}

// Multi-match simulation configuration
export interface MultiMatchConfig {
  fixtures: Fixture[];
  teams: Team[];
  playerTeamId: string;
  playerTactics: Tactics;
  /** Current round (1-based); used for opponent effective energy. If omitted, opponents use 100. */
  currentRound?: number;
  /** Total rounds in season (e.g. 38); used with currentRound for opponent fatigue. */
  totalRounds?: number;
}

// Create live match states for all fixtures in a round
export function createMultiMatchState(config: MultiMatchConfig): {
  matches: LiveMatchState[];
  playerMatchIndex: number;
} {
  const {
    fixtures,
    teams,
    playerTeamId,
    playerTactics,
    currentRound = 1,
    totalRounds = 38,
  } = config;

  const matches: LiveMatchState[] = [];
  let playerMatchIndex = -1;
  const opponentEnergy =
    totalRounds > 0
      ? getOpponentEffectiveEnergy(currentRound, totalRounds)
      : 100;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    let homeTeam = teams.find((t) => t.id === fixture.homeTeamId);
    let awayTeam = teams.find((t) => t.id === fixture.awayTeamId);

    if (!homeTeam || !awayTeam) continue;

    const isPlayerMatch =
      fixture.homeTeamId === playerTeamId ||
      fixture.awayTeamId === playerTeamId;

    // Apply round-based effective energy to opponent team (so they are not always 100%)
    if (isPlayerMatch) {
      playerMatchIndex = matches.length;
      if (fixture.homeTeamId !== playerTeamId) {
        homeTeam = {
          ...homeTeam,
          players: homeTeam.players.map((p) => ({ ...p, energy: opponentEnergy })),
        };
      }
      if (fixture.awayTeamId !== playerTeamId) {
        awayTeam = {
          ...awayTeam,
          players: awayTeam.players.map((p) => ({ ...p, energy: opponentEnergy })),
        };
      }
    }

    // Use player tactics for their match, generate defaults for others
    const homeTactics =
      fixture.homeTeamId === playerTeamId
        ? playerTactics
        : createDefaultTactics(homeTeam);

    const awayTactics =
      fixture.awayTeamId === playerTeamId
        ? playerTactics
        : createDefaultTactics(awayTeam);

    const matchConfig: MatchConfig = {
      homeTeam,
      awayTeam,
      homeTactics,
      awayTactics,
      fixtureId: fixture.id,
    };

    const state = createMatchState(matchConfig);

    matches.push({
      fixtureId: fixture.id,
      homeTeam,
      awayTeam,
      state,
      attendance: randomInt(
        Math.floor(homeTeam.capacity * 0.5),
        homeTeam.capacity,
      ),
    });
  }

  return { matches, playerMatchIndex };
}

// Simulate one minute for all matches
export function simulateAllMatchesStep(matches: LiveMatchState[]): {
  finished: boolean;
  events: Array<{ matchIndex: number; event: MatchEvent }>;
} {
  const events: Array<{ matchIndex: number; event: MatchEvent }> = [];
  let allFinished = true;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const { state, homeTeam, awayTeam } = match;

    // Skip finished matches
    if (state.phase === 'full_time') continue;

    // Skip half-time (need to be resumed manually for player's match)
    if (state.phase === 'half_time') {
      allFinished = false;
      continue;
    }

    allFinished = false;

    const config: MatchConfig = {
      homeTeam,
      awayTeam,
      homeTactics: state.homeTactics,
      awayTactics: state.awayTactics,
      fixtureId: match.fixtureId,
    };

    const event = simulateMatchStep(state, config);

    if (event) {
      match.latestEvent = event;
      events.push({ matchIndex: i, event });
    }
  }

  return { finished: allFinished, events };
}

// Convert match state to result
export function matchStateToResult(match: LiveMatchState): MatchResult {
  return {
    id: match.fixtureId,
    homeTeamId: match.homeTeam.id,
    awayTeamId: match.awayTeam.id,
    homeScore: match.state.homeScore,
    awayScore: match.state.awayScore,
    events: match.state.events,
    attendance: match.attendance,
    date: new Date().toISOString(),
  };
}

// Helper to create default tactics for AI teams
function createDefaultTactics(team: Team): Tactics {
  // Simple best 11 selection
  const sorted = [...team.players].sort(
    (a, b) => calculateOverall(b) - calculateOverall(a),
  );
  const lineup = sorted.slice(0, 11).map((p) => p.id);
  const substitutes = sorted.slice(11, 18).map((p) => p.id);

  return {
    formation: '4-3-3',
    posture: 'balanced',
    lineup,
    substitutes,
  };
}
