import { describe, expect, it } from 'vitest';
import type { Fixture, Player, Team, Tactics } from '../types';
import { createDefaultForm } from '../types';
import {
  createMultiMatchState,
  resumeFromHalfTime,
  simulateAllMatchesStep,
} from './index';

function makePlayer(
  id: string,
  position: Player['position'],
  energy: number,
  base: number,
): Player {
  return {
    id,
    name: id,
    age: 27,
    nationality: 'Brazil',
    position,
    preferredFoot: 'right',
    attributes: {
      speed: base,
      strength: base,
      stamina: base,
      shooting: base,
      passing: base,
      dribbling: base,
      heading: base,
      tackling: base,
      positioning: base,
      vision: base,
      composure: base,
      aggression: base,
      reflexes: base,
      handling: base,
      diving: base,
    },
    potential: 85,
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

function makeTeam(id: string, lowEnergyStarters: boolean): { team: Team; tactics: Tactics } {
  const starterEnergy = lowEnergyStarters ? 20 : 100;
  const starters = [
    makePlayer(`${id}-gk`, 'GK', 100, 72),
    makePlayer(`${id}-d1`, 'DEF', starterEnergy, 72),
    makePlayer(`${id}-d2`, 'DEF', starterEnergy, 71),
    makePlayer(`${id}-d3`, 'DEF', starterEnergy, 71),
    makePlayer(`${id}-d4`, 'DEF', starterEnergy, 70),
    makePlayer(`${id}-m1`, 'MID', starterEnergy, 73),
    makePlayer(`${id}-m2`, 'MID', starterEnergy, 72),
    makePlayer(`${id}-m3`, 'MID', starterEnergy, 72),
    makePlayer(`${id}-a1`, 'ATT', starterEnergy, 74),
    makePlayer(`${id}-a2`, 'ATT', starterEnergy, 74),
    makePlayer(`${id}-a3`, 'ATT', starterEnergy, 73),
  ];

  const bench = [
    makePlayer(`${id}-bd1`, 'DEF', 92, 76),
    makePlayer(`${id}-bd2`, 'DEF', 90, 75),
    makePlayer(`${id}-bm1`, 'MID', 92, 76),
    makePlayer(`${id}-bm2`, 'MID', 90, 75),
    makePlayer(`${id}-ba1`, 'ATT', 93, 77),
    makePlayer(`${id}-ba2`, 'ATT', 91, 76),
    makePlayer(`${id}-bgk`, 'GK', 95, 74),
  ];

  const team: Team = {
    id,
    name: id.toUpperCase(),
    shortName: id.toUpperCase(),
    primaryColor: '#fff',
    secondaryColor: '#000',
    stadium: 'Arena',
    capacity: 40000,
    reputation: 60,
    budget: 1_000_000,
    wageBudget: 200_000,
    players: [...starters, ...bench],
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

describe('live multi-match AI substitution behavior', () => {
  it('keeps player side manual while AI sides auto-manage fatigue', () => {
    const player = makeTeam('player', true);
    const aiA = makeTeam('aia', true);
    const aiB = makeTeam('aib', true);
    const aiC = makeTeam('aic', true);

    const fixtures: Fixture[] = [
      {
        id: 'fx-player',
        round: 1,
        homeTeamId: player.team.id,
        awayTeamId: aiA.team.id,
        date: '2026-08-01',
        played: false,
      },
      {
        id: 'fx-ai',
        round: 1,
        homeTeamId: aiB.team.id,
        awayTeamId: aiC.team.id,
        date: '2026-08-01',
        played: false,
      },
    ];

    const { matches, playerMatchIndex } = createMultiMatchState({
      fixtures,
      teams: [player.team, aiA.team, aiB.team, aiC.team],
      playerTeamId: player.team.id,
      playerTactics: player.tactics,
      currentRound: 1,
      totalRounds: 38,
    });

    expect(playerMatchIndex).toBeGreaterThanOrEqual(0);

    const playerMatch = matches[playerMatchIndex];
    const isPlayerHome = playerMatch.homeTeam.id === player.team.id;
    expect(isPlayerHome ? playerMatch.homeControl : playerMatch.awayControl).toBe('human');

    for (let i = 0; i < 80; i++) {
      simulateAllMatchesStep(matches);
      for (const match of matches) {
        if (match.state.phase === 'half_time') {
          resumeFromHalfTime(match.state);
        }
      }
    }

    const userSubsUsed = isPlayerHome
      ? playerMatch.state.homeSubsUsed
      : playerMatch.state.awaySubsUsed;
    expect(userSubsUsed).toBe(0);

    const aiOnlyMatch = matches.find((m) => m.fixtureId === 'fx-ai');
    expect(aiOnlyMatch).toBeDefined();
    const aiSubEvents = aiOnlyMatch!.state.events.filter((e) => e.type === 'substitution');
    expect(aiSubEvents.length).toBeGreaterThan(0);
  });
});
