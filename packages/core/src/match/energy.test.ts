import { describe, expect, it } from 'vitest';
import type { MatchConfig, MatchState } from './index';
import {
  calculateEnergyModifier,
  calculateLiveEnergyDrainPerMinute,
  createMatchState,
  makeSubstitution,
  simulateMatchStep,
} from './index';
import { createDefaultForm, type Player, type Team, type Tactics } from '../types';

function makePlayer(id: string, position: Player['position'], energy: number): Player {
  return {
    id,
    name: id,
    age: 27,
    nationality: 'Brazil',
    position,
    preferredFoot: 'right',
    attributes: {
      speed: 70,
      strength: 70,
      stamina: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      heading: 70,
      tackling: 70,
      positioning: 70,
      vision: 70,
      composure: 70,
      aggression: 70,
      reflexes: 70,
      handling: 70,
      diving: 70,
    },
    potential: 80,
    morale: 70,
    fitness: 100,
    energy,
    injured: false,
    injuryWeeks: 0,
    contractEndSeason: 2030,
    wage: 1000,
    marketValue: 1_000_000,
    status: 'active',
    form: createDefaultForm(),
  };
}

function makeTeam(prefix: string): { team: Team; tactics: Tactics } {
  const starters = [
    makePlayer(`${prefix}-gk`, 'GK', 100),
    makePlayer(`${prefix}-d1`, 'DEF', 100),
    makePlayer(`${prefix}-d2`, 'DEF', 100),
    makePlayer(`${prefix}-d3`, 'DEF', 100),
    makePlayer(`${prefix}-d4`, 'DEF', 100),
    makePlayer(`${prefix}-m1`, 'MID', 100),
    makePlayer(`${prefix}-m2`, 'MID', 100),
    makePlayer(`${prefix}-m3`, 'MID', 100),
    makePlayer(`${prefix}-a1`, 'ATT', 100),
    makePlayer(`${prefix}-a2`, 'ATT', 100),
    makePlayer(`${prefix}-a3`, 'ATT', 100),
  ];
  const bench = [makePlayer(`${prefix}-b1`, 'MID', 88)];
  const players = [...starters, ...bench];

  const team: Team = {
    id: `${prefix}-team`,
    name: `${prefix.toUpperCase()} FC`,
    shortName: prefix.toUpperCase(),
    primaryColor: '#ffffff',
    secondaryColor: '#000000',
    stadium: 'Arena',
    capacity: 40000,
    reputation: 60,
    budget: 1_000_000,
    wageBudget: 200_000,
    players,
    momentum: 50,
    lastFiveResults: [],
  };

  const tactics: Tactics = {
    formation: '4-3-3',
    posture: 'balanced',
    lineup: starters.map((p) => p.id),
    substitutes: bench.map((p) => p.id),
  };

  return { team, tactics };
}

function setupMatch(): { config: MatchConfig; state: MatchState } {
  const home = makeTeam('h');
  const away = makeTeam('a');
  const config: MatchConfig = {
    homeTeam: home.team,
    awayTeam: away.team,
    homeTactics: home.tactics,
    awayTactics: away.tactics,
  };
  return { config, state: createMatchState(config) };
}

describe('energy match behavior', () => {
  it('uses stronger live drain multipliers', () => {
    const young = makePlayer('young', 'MID', 100);
    young.age = 26;
    young.attributes.stamina = 82;
    const old = makePlayer('old', 'MID', 100);
    old.age = 36;
    old.attributes.stamina = 60;

    const youngDrain = calculateLiveEnergyDrainPerMinute(young, 'balanced');
    const oldDrain = calculateLiveEnergyDrainPerMinute(old, 'attacking');

    expect(youngDrain).toBeGreaterThan(0.1);
    expect(oldDrain).toBeGreaterThan(youngDrain);
  });

  it('uses threshold penalty curve breakpoints', () => {
    expect(calculateEnergyModifier(85)).toBeCloseTo(0);
    expect(calculateEnergyModifier(70)).toBeCloseTo(0.06);
    expect(calculateEnergyModifier(55)).toBeCloseTo(0.16);
    expect(calculateEnergyModifier(40)).toBeCloseTo(0.28);
    expect(calculateEnergyModifier(0)).toBeCloseTo(0.4);
    expect(calculateEnergyModifier(77.5)).toBeCloseTo(0.03);
  });

  it('depletes only on-pitch players each simulated minute', () => {
    const { config, state } = setupMatch();

    const starterId = state.homeLineup[0].id;
    const benchId = state.homeSubs[0].id;
    const starterBefore = state.homeLiveEnergy[starterId];
    const benchBefore = state.homeLiveEnergy[benchId];

    simulateMatchStep(state, config); // kickoff
    simulateMatchStep(state, config); // minute 1

    expect(state.homeLiveEnergy[starterId]).toBeLessThan(starterBefore);
    expect(state.homeLiveEnergy[benchId]).toBe(benchBefore);
  });

  it('starts draining a substitute only after coming on', () => {
    const { config, state } = setupMatch();

    const outgoingId = state.homeLineup[10].id;
    const incomingId = state.homeSubs[0].id;

    simulateMatchStep(state, config); // kickoff
    simulateMatchStep(state, config); // minute 1

    const incomingBeforeSub = state.homeLiveEnergy[incomingId];
    const outgoingAtSub = state.homeLiveEnergy[outgoingId];

    const result = makeSubstitution(state, 'home', outgoingId, incomingId);
    expect(result.success).toBe(true);

    simulateMatchStep(state, config); // minute 2

    expect(state.homeLiveEnergy[incomingId]).toBeLessThan(incomingBeforeSub);
    expect(state.homeLiveEnergy[outgoingId]).toBe(outgoingAtSub);
  });
});
