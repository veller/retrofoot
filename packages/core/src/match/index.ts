// ============================================================================
// RETROFOOT - Match Engine
// ============================================================================
// Simulates matches minute-by-minute with events

import type { Team, Player, Tactics, MatchEvent, MatchResult } from '../types';
import { calculateOverall } from '../types';

// Match simulation configuration
export interface MatchConfig {
  homeTeam: Team;
  awayTeam: Team;
  homeTactics: Tactics;
  awayTactics: Tactics;
  neutralVenue?: boolean;
}

// Internal match state during simulation
interface MatchState {
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
  const attackers = lineupPlayers.filter((p) =>
    ['ST', 'LW', 'RW', 'CAM', 'CM'].includes(p.position),
  );
  if (attackers.length === 0) return lineupPlayers[0];

  const weights = attackers.map(
    (p) => p.attributes.shooting + p.attributes.positioning,
  );
  const idx = weightedRandom(weights);
  return attackers[idx];
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
      // GOAL!
      const scorer = pickScorer(attackingPlayers, attackingTactics);
      if (attackingTeam === 'home') {
        state.homeScore++;
      } else {
        state.awayScore++;
      }

      state.events.push({
        minute: state.minute,
        type: 'goal',
        team: attackingTeam,
        playerId: scorer?.id,
        playerName: scorer?.nickname || scorer?.name || 'Unknown',
        description: `GOAL! ${scorer?.nickname || scorer?.name} scores for ${teamObj.name}!`,
      });
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

// Main match simulation function
export function simulateMatch(config: MatchConfig): MatchResult {
  const { homeTeam, awayTeam, homeTactics, awayTactics } = config;

  // Initialize state
  const state: MatchState = {
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
  };

  // Kickoff event
  state.events.push({
    minute: 0,
    type: 'free_kick', // Using as kickoff placeholder
    team: 'home',
    description: 'Kickoff! The match begins.',
  });

  // Simulate 90 minutes + stoppage time
  const stoppageTime = randomInt(1, 5);
  const totalMinutes = 90 + stoppageTime;

  for (let minute = 1; minute <= totalMinutes; minute++) {
    state.minute = minute;

    // Half-time
    if (minute === 45) {
      state.events.push({
        minute: 45,
        type: 'free_kick', // Placeholder
        team: 'home',
        description: `Half-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
      });
    }

    simulateMinute(state, config);
  }

  // Full-time event
  state.events.push({
    minute: totalMinutes,
    type: 'free_kick', // Placeholder
    team: 'home',
    description: `Full-time: ${homeTeam.name} ${state.homeScore} - ${state.awayScore} ${awayTeam.name}`,
  });

  return {
    id: `match-${Date.now()}`,
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

// Export helper to stream events (for live simulation in UI)
export function* simulateMatchLive(
  config: MatchConfig,
): Generator<{ minute: number; state: MatchState; event?: MatchEvent }> {
  const { homeTeam, awayTeam, homeTactics, awayTactics } = config;

  const state: MatchState = {
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
  };

  const stoppageTime = randomInt(1, 5);
  const totalMinutes = 90 + stoppageTime;

  for (let minute = 0; minute <= totalMinutes; minute++) {
    state.minute = minute;
    const eventsBefore = state.events.length;

    if (minute > 0) {
      simulateMinute(state, config);
    }

    const newEvent =
      state.events.length > eventsBefore
        ? state.events[state.events.length - 1]
        : undefined;

    yield { minute, state: { ...state }, event: newEvent };
  }
}
