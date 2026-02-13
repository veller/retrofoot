import { describe, expect, it } from 'vitest';
import type { MatchConfig, MatchState } from './index';
import {
  calculateChanceSuccessForTesting,
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
  const bench = [
    makePlayer(`${prefix}-b1`, 'MID', 88),
    makePlayer(`${prefix}-b2`, 'ATT', 89),
  ];
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

function makeDeepBenchTeam(prefix: string): { team: Team; tactics: Tactics } {
  const starters = [
    makePlayer(`${prefix}-gk`, 'GK', 100),
    makePlayer(`${prefix}-d1`, 'DEF', 18),
    makePlayer(`${prefix}-d2`, 'DEF', 19),
    makePlayer(`${prefix}-d3`, 'DEF', 20),
    makePlayer(`${prefix}-d4`, 'DEF', 21),
    makePlayer(`${prefix}-m1`, 'MID', 20),
    makePlayer(`${prefix}-m2`, 'MID', 19),
    makePlayer(`${prefix}-m3`, 'MID', 21),
    makePlayer(`${prefix}-a1`, 'ATT', 20),
    makePlayer(`${prefix}-a2`, 'ATT', 22),
    makePlayer(`${prefix}-a3`, 'ATT', 23),
  ];
  const bench = [
    makePlayer(`${prefix}-bd1`, 'DEF', 90),
    makePlayer(`${prefix}-bd2`, 'DEF', 88),
    makePlayer(`${prefix}-bm1`, 'MID', 90),
    makePlayer(`${prefix}-bm2`, 'MID', 88),
    makePlayer(`${prefix}-ba1`, 'ATT', 91),
    makePlayer(`${prefix}-ba2`, 'ATT', 89),
    makePlayer(`${prefix}-bgk`, 'GK', 90),
  ];
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

    const outgoingId = state.homeLineup.find((p) => p.position === 'ATT')!.id;
    const incomingId = state.homeSubs.find((p) => p.position === 'ATT')!.id;

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

  it('reduces chance conversion when attacking side is fatigued', () => {
    const home = makeTeam('ha');
    const away = makeTeam('aa');

    const highEnergyAttack = calculateChanceSuccessForTesting(
      home.team.players,
      away.team.players,
      home.tactics,
      away.tactics,
      {
        isHome: true,
        isNeutralVenue: true,
        attackingTeam: home.team,
        defendingTeam: away.team,
        attackingLiveEnergyByPlayerId: Object.fromEntries(
          home.team.players.map((p) => [p.id, 100]),
        ),
        defendingLiveEnergyByPlayerId: Object.fromEntries(
          away.team.players.map((p) => [p.id, 100]),
        ),
      },
    );

    const lowEnergyAttack = calculateChanceSuccessForTesting(
      home.team.players,
      away.team.players,
      home.tactics,
      away.tactics,
      {
        isHome: true,
        isNeutralVenue: true,
        attackingTeam: home.team,
        defendingTeam: away.team,
        attackingLiveEnergyByPlayerId: Object.fromEntries(
          home.team.players.map((p) => [p.id, 28]),
        ),
        defendingLiveEnergyByPlayerId: Object.fromEntries(
          away.team.players.map((p) => [p.id, 100]),
        ),
      },
    );

    expect(lowEnergyAttack).toBeLessThan(highEnergyAttack);
  });

  it('increases chance conversion when defending side is fatigued', () => {
    const home = makeTeam('hb');
    const away = makeTeam('ab');

    const freshDefense = calculateChanceSuccessForTesting(
      home.team.players,
      away.team.players,
      home.tactics,
      away.tactics,
      {
        isHome: true,
        isNeutralVenue: true,
        attackingTeam: home.team,
        defendingTeam: away.team,
        attackingLiveEnergyByPlayerId: Object.fromEntries(
          home.team.players.map((p) => [p.id, 100]),
        ),
        defendingLiveEnergyByPlayerId: Object.fromEntries(
          away.team.players.map((p) => [p.id, 100]),
        ),
      },
    );

    const tiredDefense = calculateChanceSuccessForTesting(
      home.team.players,
      away.team.players,
      home.tactics,
      away.tactics,
      {
        isHome: true,
        isNeutralVenue: true,
        attackingTeam: home.team,
        defendingTeam: away.team,
        attackingLiveEnergyByPlayerId: Object.fromEntries(
          home.team.players.map((p) => [p.id, 100]),
        ),
        defendingLiveEnergyByPlayerId: Object.fromEntries(
          away.team.players.map((p) => [p.id, 28]),
        ),
      },
    );

    expect(tiredDefense).toBeGreaterThan(freshDefense);
  });

  it('does not auto-sub tired AI players before half-time, but does after', () => {
    const home = makeDeepBenchTeam('hsub');
    const away = makeTeam('asub');
    const config: MatchConfig = {
      homeTeam: home.team,
      awayTeam: away.team,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
      homeControl: 'ai',
      awayControl: 'ai',
    };
    const state = createMatchState(config);

    simulateMatchStep(state, config); // kickoff
    for (let minute = 1; minute <= 45; minute++) {
      simulateMatchStep(state, config);
    }

    const firstHalfSub = state.events.find(
      (e) => e.type === 'substitution' && e.team === 'home' && e.minute <= 45,
    );
    expect(firstHalfSub).toBeUndefined();

    // Move into second half and allow AI substitution logic.
    simulateMatchStep(state, config); // minute 46

    const subEvent = state.events.find((e) => e.type === 'substitution' && e.team === 'home');
    expect(subEvent).toBeDefined();
    expect(subEvent?.description).toContain('[ai_reason:fatigue]');
    expect(state.homeSubsUsed).toBeGreaterThan(0);
  });

  it('can perform multiple AI substitutions in the same minute window', () => {
    const home = makeDeepBenchTeam('hmulti');
    const away = makeTeam('amulti');
    const config: MatchConfig = {
      homeTeam: home.team,
      awayTeam: away.team,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
      homeControl: 'ai',
      awayControl: 'ai',
    };
    const state = createMatchState(config);

    simulateMatchStep(state, config); // kickoff
    for (let minute = 1; minute <= 46; minute++) {
      simulateMatchStep(state, config);
    }

    const minute46Subs = state.events.filter(
      (e) => e.type === 'substitution' && e.team === 'home' && e.minute === 46,
    );
    expect(minute46Subs.length).toBeGreaterThanOrEqual(2);
  });

  it('never exceeds 5 automatic substitutions for AI team', () => {
    const home = makeDeepBenchTeam('hcap');
    const away = makeDeepBenchTeam('acap');
    const config: MatchConfig = {
      homeTeam: home.team,
      awayTeam: away.team,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
      homeControl: 'ai',
      awayControl: 'ai',
    };
    const state = createMatchState(config);

    simulateMatchStep(state, config); // kickoff
    for (let i = 0; i < 120; i++) {
      simulateMatchStep(state, config);
    }

    expect(state.homeSubsUsed).toBeLessThanOrEqual(5);
    expect(state.awaySubsUsed).toBeLessThanOrEqual(5);
  });

  it('does not auto-substitute for human-controlled side', () => {
    const home = makeDeepBenchTeam('hhuman');
    const away = makeTeam('ahuman');
    const config: MatchConfig = {
      homeTeam: home.team,
      awayTeam: away.team,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
      homeControl: 'human',
      awayControl: 'ai',
    };
    const state = createMatchState(config);

    simulateMatchStep(state, config); // kickoff
    simulateMatchStep(state, config); // minute 1

    expect(state.homeSubsUsed).toBe(0);
  });

  it('rejects substitution when incoming player is a different position', () => {
    const { state } = setupMatch();
    const homeOutAttackerId = state.homeLineup.find((p) => p.position === 'ATT')?.id;
    const homeInMidId = state.homeSubs.find((p) => p.position === 'MID')?.id;
    expect(homeOutAttackerId).toBeDefined();
    expect(homeInMidId).toBeDefined();

    const result = makeSubstitution(
      state,
      'home',
      homeOutAttackerId as string,
      homeInMidId as string,
    );
    expect(result.success).toBe(false);
  });

  it('rejects substitution when outgoing player was sent off', () => {
    const { state } = setupMatch();
    const homeOutId = state.homeLineup.find((p) => p.position === 'MID')?.id;
    const homeInId = state.homeSubs.find((p) => p.position === 'MID')?.id;
    expect(homeOutId).toBeDefined();
    expect(homeInId).toBeDefined();
    state.homeSentOff[homeOutId as string] = true;

    const result = makeSubstitution(
      state,
      'home',
      homeOutId as string,
      homeInId as string,
    );
    expect(result.success).toBe(false);
  });

  it('initializes booking and sent-off maps', () => {
    const { state } = setupMatch();
    expect(state.homeBookings).toEqual({});
    expect(state.awayBookings).toEqual({});
    expect(state.homeSentOff).toEqual({});
    expect(state.awaySentOff).toEqual({});
  });
});
