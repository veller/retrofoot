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

// Calculate team strength from lineup
function calculateTeamStrength(players: Player[], tactics: Tactics): number {
  const lineupPlayers = players.filter((p) => tactics.lineup.includes(p.id));
  if (lineupPlayers.length === 0) return 50;

  const totalOverall = lineupPlayers.reduce(
    (sum, p) => sum + calculateOverall(p),
    0,
  );
  const avgOverall = totalOverall / lineupPlayers.length;

  // Adjust for tactical posture
  const postureBonus =
    tactics.posture === 'attacking'
      ? 3
      : tactics.posture === 'defensive'
        ? -3
        : 0;

  return avgOverall + postureBonus;
}

// Calculate attack vs defense for a chance
function calculateChanceSuccess(
  attackingPlayers: Player[],
  defendingPlayers: Player[],
  attackingTactics: Tactics,
): number {
  const attackStrength = calculateTeamStrength(
    attackingPlayers,
    attackingTactics,
  );
  const defenseStrength = calculateTeamStrength(defendingPlayers, {
    ...attackingTactics,
    posture: 'defensive',
  });

  // Base chance modified by strength difference
  const strengthDiff = attackStrength - defenseStrength;
  const baseChance = 0.3 + (strengthDiff / 100) * 0.2;

  return Math.max(0.05, Math.min(0.6, baseChance));
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
    homeLineup: homeTeam.players.filter((p) =>
      homeTactics.lineup.includes(p.id),
    ),
    awayLineup: awayTeam.players.filter((p) =>
      awayTactics.lineup.includes(p.id),
    ),
    homeSubs: homeTeam.players.filter((p) =>
      homeTactics.substitutes.includes(p.id),
    ),
    awaySubs: awayTeam.players.filter((p) =>
      awayTactics.substitutes.includes(p.id),
    ),
    homeTactics,
    awayTactics,
    possession: 'home',
    phase: 'first_half',
    homeSubsUsed: 0,
    awaySubsUsed: 0,
    stoppageTime: randomInt(1, 5),
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
    description: `Substitution: ${playerIn.nickname || playerIn.name} replaces ${playerOut.nickname || playerOut.name}`,
  };

  state.events.push(event);

  return { success: true, event };
}

// Simulate a single minute
function simulateMinute(state: MatchState, config: MatchConfig): void {
  // Determine which team has possession
  const possessionRoll = random();
  const homeStrength = calculateTeamStrength(
    state.homeLineup,
    state.homeTactics,
  );
  const awayStrength = calculateTeamStrength(
    state.awayLineup,
    state.awayTactics,
  );
  const homePossChance = 0.5 + (homeStrength - awayStrength) / 200;

  state.possession = possessionRoll < homePossChance ? 'home' : 'away';

  // Chance of something happening this minute (~15% for any event)
  if (random() > 0.15) return;

  const attackingTeam = state.possession;
  const attackingPlayers =
    attackingTeam === 'home' ? state.homeLineup : state.awayLineup;
  const defendingPlayers =
    attackingTeam === 'home' ? state.awayLineup : state.homeLineup;
  const attackingTactics =
    attackingTeam === 'home' ? state.homeTactics : state.awayTactics;
  const teamObj = attackingTeam === 'home' ? config.homeTeam : config.awayTeam;

  // What kind of event?
  const eventRoll = random();

  if (eventRoll < 0.4) {
    // Attacking chance
    const successChance = calculateChanceSuccess(
      attackingPlayers,
      defendingPlayers,
      attackingTactics,
    );

    if (random() < successChance) {
      // GOAL! Determine the type
      const goalType = determineGoalType();
      const defendingTactics =
        attackingTeam === 'home' ? state.awayTactics : state.homeTactics;

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
        const scorer = pickScorer(attackingPlayers, attackingTactics);
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
  } else if (eventRoll < 0.55) {
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
  } else if (eventRoll < 0.58) {
    // Red card (rare)
    const allPlayers =
      attackingTeam === 'home' ? state.awayLineup : state.homeLineup;
    if (allPlayers.length === 0) return;
    const fouler = allPlayers[randomInt(0, allPlayers.length - 1)];
    state.events.push({
      minute: state.minute,
      type: 'red_card',
      team: attackingTeam === 'home' ? 'away' : 'home',
      playerId: fouler?.id,
      playerName: fouler?.nickname || fouler?.name || 'Unknown',
      description: `RED CARD! ${fouler?.nickname || fouler?.name} is sent off!`,
    });
  } else if (eventRoll < 0.65) {
    // Corner
    state.events.push({
      minute: state.minute,
      type: 'corner',
      team: attackingTeam,
      description: `Corner kick for ${teamObj.name}`,
    });
  } else if (eventRoll < 0.72) {
    // Free kick
    state.events.push({
      minute: state.minute,
      type: 'free_kick',
      team: attackingTeam,
      description: `Free kick in a dangerous position for ${teamObj.name}`,
    });
  } else if (eventRoll < 0.8) {
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
}

// Create live match states for all fixtures in a round
export function createMultiMatchState(config: MultiMatchConfig): {
  matches: LiveMatchState[];
  playerMatchIndex: number;
} {
  const { fixtures, teams, playerTeamId, playerTactics } = config;

  const matches: LiveMatchState[] = [];
  let playerMatchIndex = -1;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const homeTeam = teams.find((t) => t.id === fixture.homeTeamId);
    const awayTeam = teams.find((t) => t.id === fixture.awayTeamId);

    if (!homeTeam || !awayTeam) continue;

    const isPlayerMatch =
      fixture.homeTeamId === playerTeamId ||
      fixture.awayTeamId === playerTeamId;

    if (isPlayerMatch) {
      playerMatchIndex = matches.length;
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
