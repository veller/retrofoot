import { describe, expect, it, vi } from 'vitest';
import type { MatchConfig, MatchState } from './index';
import {
  calculateChanceSuccessForTesting,
  calculatePenaltyConversionForTesting,
  calculateEnergyModifier,
  calculateLiveEnergyDrainPerMinute,
  createMatchState,
  makeSubstitution,
  pickPenaltyTakerForTesting,
  simulateMatchStep,
} from './index';
import { createDefaultForm, type Player, type Team, type Tactics } from '../types';
import {
  EVENT_THRESHOLD_RED_CARD,
  EVENT_THRESHOLD_YELLOW_CARD,
} from './constants';

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

  it('selects the best penalty taker from the current lineup', () => {
    const { config } = setupMatch();
    const striker = config.homeTeam.players.find((p) => p.id === 'h-a1');
    const midfielder = config.homeTeam.players.find((p) => p.id === 'h-m1');
    expect(striker).toBeDefined();
    expect(midfielder).toBeDefined();
    if (!striker || !midfielder) return;

    striker.attributes.shooting = 95;
    striker.attributes.composure = 93;
    striker.attributes.positioning = 92;
    midfielder.attributes.shooting = 60;
    midfielder.attributes.composure = 61;
    midfielder.attributes.positioning = 62;

    const taker = pickPenaltyTakerForTesting(
      config.homeTeam.players,
      config.homeTactics,
    );
    expect(taker?.id).toBe(striker.id);
  });

  it('raises conversion for elite taker versus weak goalkeeper', () => {
    const eliteTaker = makePlayer('elite', 'ATT', 100);
    eliteTaker.attributes.shooting = 95;
    eliteTaker.attributes.composure = 94;
    eliteTaker.attributes.positioning = 91;

    const weakGK = makePlayer('weak-gk', 'GK', 100);
    weakGK.attributes.reflexes = 58;
    weakGK.attributes.diving = 57;
    weakGK.attributes.handling = 56;

    const strongGK = makePlayer('strong-gk', 'GK', 100);
    strongGK.attributes.reflexes = 92;
    strongGK.attributes.diving = 90;
    strongGK.attributes.handling = 89;

    const easierPenalty = calculatePenaltyConversionForTesting(eliteTaker, weakGK);
    const harderPenalty = calculatePenaltyConversionForTesting(eliteTaker, strongGK);

    expect(easierPenalty).toBeGreaterThan(harderPenalty);
    expect(easierPenalty).toBeGreaterThan(0.78);
    expect(harderPenalty).toBeLessThan(0.9);
  });

  it('does not emit traces when tracing is disabled', () => {
    const traces: Array<{ type: string }> = [];
    const { config, state } = setupMatch();
    config.trace = {
      enabled: false,
      sink: (event) => traces.push({ type: event.type }),
    };

    simulateMatchStep(state, config); // kickoff
    simulateMatchStep(state, config); // minute 1

    expect(traces).toHaveLength(0);
  });

  it('emits structured probability and minute traces when tracing is enabled', () => {
    const traces: Array<{ type: string }> = [];
    const { config, state } = setupMatch();
    config.trace = {
      enabled: true,
      sink: (event) => traces.push({ type: event.type }),
    };

    simulateMatchStep(state, config); // kickoff
    simulateMatchStep(state, config); // minute 1

    const traceTypes = new Set(traces.map((trace) => trace.type));
    expect(traceTypes.has('energy_tick')).toBe(true);
    expect(traceTypes.has('minute_context')).toBe(true);
    expect(traceTypes.has('event_probability')).toBe(true);
  });

  it('captures substitution reasoning in structured trace payload', () => {
    const traces: Array<{
      type: string;
      outcome: Record<string, unknown>;
      inputs: Record<string, unknown>;
    }> = [];
    const home = makeDeepBenchTeam('htrace-sub');
    const away = makeTeam('atrace-sub');
    const config: MatchConfig = {
      homeTeam: home.team,
      awayTeam: away.team,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
      homeControl: 'ai',
      awayControl: 'ai',
      trace: {
        enabled: true,
        sink: (event) =>
          traces.push({
            type: event.type,
            outcome: event.outcome,
            inputs: event.inputs,
          }),
      },
    };
    const state = createMatchState(config);

    simulateMatchStep(state, config); // kickoff
    for (let minute = 1; minute <= 46; minute++) {
      simulateMatchStep(state, config);
    }

    const executed = traces.find((trace) => trace.type === 'sub_executed');
    expect(executed).toBeDefined();
    expect(executed?.outcome.success).toBe(true);
    expect(['fatigue', 'tactical', 'protect_lead']).toContain(
      String(executed?.outcome.reason),
    );
    expect(executed?.inputs.outgoingPlayerId).toBeTruthy();
    expect(executed?.inputs.incomingPlayerId).toBeTruthy();
  });

  it('emits posture adjustment trace when a red card changes posture', () => {
    const traces: Array<{ type: string; outcome: Record<string, unknown> }> = [];
    const { config, state } = setupMatch();
    config.trace = {
      enabled: true,
      sink: (event) =>
        traces.push({
          type: event.type,
          outcome: event.outcome,
        }),
    };

    const redCardRoll =
      (EVENT_THRESHOLD_YELLOW_CARD + EVENT_THRESHOLD_RED_CARD) / 2;
    const randomSpy = vi.spyOn(Math, 'random');
    let idx = 0;
    const scripted = [0.5, 0.0, redCardRoll, 0.2];
    randomSpy.mockImplementation(() => scripted[idx++] ?? 0.01);

    try {
      simulateMatchStep(state, config); // kickoff
      simulateMatchStep(state, config); // minute 1 => force red card path
    } finally {
      randomSpy.mockRestore();
    }

    const postureTrace = traces.find(
      (trace) => trace.type === 'posture_adjustment',
    );
    expect(postureTrace).toBeDefined();
    expect(['balanced', 'defensive']).toContain(
      String(postureTrace?.outcome.nextPosture),
    );
  });
});
