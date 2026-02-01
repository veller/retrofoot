import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Team,
  Tactics,
  Season,
  Fixture,
  FormationType,
  TacticalPosture,
} from '@retrofoot/core';
import {
  generateSquad,
  selectBestLineup,
  createDefaultTactics,
  createSeason,
  getCurrentRoundFixtures,
} from '@retrofoot/core';

const LEAGUE_TEAM_NAMES = [
  { name: 'Galo FC', shortName: 'GAL' },
  { name: 'Flamingo FC', shortName: 'FLA' },
  { name: 'Palmeiras FC', shortName: 'PAL' },
  { name: 'Corinthians FC', shortName: 'COR' },
  { name: 'São Paulo FC', shortName: 'SAO' },
  { name: 'Santos FC', shortName: 'SAN' },
  { name: 'Cruzeiro FC', shortName: 'CRU' },
  { name: 'Internacional FC', shortName: 'INT' },
  { name: 'Grêmio FC', shortName: 'GRE' },
  { name: 'Fluminense FC', shortName: 'FLU' },
  { name: 'Botafogo FC', shortName: 'BOT' },
  { name: 'Atlético-PR', shortName: 'CAP' },
  { name: 'Bahia FC', shortName: 'BAH' },
  { name: 'Fortaleza FC', shortName: 'FOR' },
  { name: 'Ceará FC', shortName: 'CEA' },
  { name: 'Athletico MG', shortName: 'CAM' },
  { name: 'Goiás FC', shortName: 'GOI' },
  { name: 'Cuiabá FC', shortName: 'CUI' },
  { name: 'America MG', shortName: 'AME' },
  { name: 'Red Bull Bragantino', shortName: 'RBB' },
];

function generateLeagueTeams(): Team[] {
  return LEAGUE_TEAM_NAMES.map(({ name, shortName }, index) => {
    const reputation = 50 + Math.floor(Math.random() * 40);
    const players = generateSquad({
      teamReputation: reputation,
      budgetTier: index === 0 ? 'medium' : 'low',
    });
    return {
      id: shortName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name,
      shortName,
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      stadium: `${name} Arena`,
      capacity: 40000 + Math.floor(Math.random() * 30000),
      reputation,
      budget: 5_000_000 + Math.floor(Math.random() * 15_000_000),
      wagebudget: 300_000 + Math.floor(Math.random() * 200_000),
      players,
    };
  });
}

export interface GameState {
  playerTeamId: string | null;
  teams: Team[];
  tactics: Tactics | null;
  season: Season | null;
  _hasHydrated: boolean;

  setHasHydrated: (state: boolean) => void;
  initializeGame: () => void;
  setFormation: (formation: FormationType) => void;
  setPosture: (posture: TacticalPosture) => void;
  setTactics: (tactics: Tactics) => void;
  autoSelectLineup: () => void;
  swapLineupWithBench: (lineupIndex: number, benchIndex: number) => void;
  addToBench: (playerId: string) => void;
  removeFromBench: (playerId: string) => void;
}

export const BENCH_LIMIT = 7;

function getPlayerTeam(
  teams: Team[],
  playerTeamId: string | null,
): Team | null {
  if (!playerTeamId) return null;
  return teams.find((t) => t.id === playerTeamId) ?? null;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      playerTeamId: null,
      teams: [],
      tactics: null,
      season: null,
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      initializeGame: () => {
        const { teams, playerTeamId, season } = get();
        if (teams.length > 0 && playerTeamId && season) return;

        const newTeams = generateLeagueTeams();
        const playerTeam = newTeams[0];
        const newSeason = createSeason(newTeams, '2024/25');
        const tactics = createDefaultTactics(playerTeam);

        set({
          playerTeamId: playerTeam.id,
          teams: newTeams,
          tactics,
          season: newSeason,
        });
      },

      setFormation: (formation) => {
        const { teams, playerTeamId } = get();
        const team = getPlayerTeam(teams, playerTeamId);
        const tactics = get().tactics;
        if (!team || !tactics) return;

        const { lineup, substitutes } = selectBestLineup(team, formation);
        set({
          tactics: {
            ...tactics,
            formation,
            lineup,
            substitutes,
          },
        });
      },

      setPosture: (posture) => {
        const { tactics } = get();
        if (!tactics) return;
        set({ tactics: { ...tactics, posture } });
      },

      setTactics: (tactics) => set({ tactics }),

      autoSelectLineup: () => {
        const { teams, playerTeamId, tactics } = get();
        const team = getPlayerTeam(teams, playerTeamId);
        if (!team || !tactics) return;

        const { lineup, substitutes } = selectBestLineup(
          team,
          tactics.formation,
        );
        set({
          tactics: {
            ...tactics,
            lineup,
            substitutes,
          },
        });
      },

      swapLineupWithBench: (lineupIndex, benchIndex) => {
        const { tactics } = get();
        if (!tactics) return;
        if (lineupIndex < 0 || lineupIndex >= tactics.lineup.length) return;
        if (benchIndex < 0 || benchIndex >= tactics.substitutes.length) return;

        const lineup = [...tactics.lineup];
        const substitutes = [...tactics.substitutes];
        [lineup[lineupIndex], substitutes[benchIndex]] = [
          substitutes[benchIndex],
          lineup[lineupIndex],
        ];

        set({
          tactics: {
            ...tactics,
            lineup,
            substitutes,
          },
        });
      },

      addToBench: (playerId) => {
        const { tactics } = get();
        if (!tactics) return;
        if (tactics.substitutes.includes(playerId)) return;

        const lineupIndex = tactics.lineup.indexOf(playerId);
        const lineup = [...tactics.lineup];
        const substitutes = [...tactics.substitutes];

        if (lineupIndex >= 0) {
          lineup.splice(lineupIndex, 1);
          substitutes.push(playerId);
          if (substitutes.length > 1) {
            const firstBench = substitutes.shift()!;
            lineup.splice(lineupIndex, 0, firstBench);
          }
        } else {
          substitutes.push(playerId);
        }

        set({
          tactics: { ...tactics, lineup, substitutes },
        });
      },

      removeFromBench: (playerId) => {
        const { tactics } = get();
        if (!tactics) return;

        const substitutes = tactics.substitutes.filter((id) => id !== playerId);
        set({
          tactics: { ...tactics, substitutes },
        });
      },
    }),
    {
      name: 'retrofoot-game',
      partialize: (state) => ({
        playerTeamId: state.playerTeamId,
        teams: state.teams,
        tactics: state.tactics,
        season: state.season,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function useUpcomingFixture(): {
  fixture: Fixture | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  isPlayerHome: boolean;
} {
  const teams = useGameStore((s) => s.teams);
  const playerTeamId = useGameStore((s) => s.playerTeamId);
  const season = useGameStore((s) => s.season);

  if (!season || !playerTeamId) {
    return {
      fixture: null,
      homeTeam: null,
      awayTeam: null,
      isPlayerHome: false,
    };
  }

  const roundFixtures = getCurrentRoundFixtures(season);
  const fixture =
    roundFixtures.find(
      (f) => f.homeTeamId === playerTeamId || f.awayTeamId === playerTeamId,
    ) ?? null;

  if (!fixture) {
    return {
      fixture: null,
      homeTeam: null,
      awayTeam: null,
      isPlayerHome: false,
    };
  }

  const homeTeam = teams.find((t) => t.id === fixture.homeTeamId) ?? null;
  const awayTeam = teams.find((t) => t.id === fixture.awayTeamId) ?? null;
  const isPlayerHome = fixture.homeTeamId === playerTeamId;

  return { fixture, homeTeam, awayTeam, isPlayerHome };
}
