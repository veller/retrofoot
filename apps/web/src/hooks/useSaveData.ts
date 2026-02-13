import { useState, useEffect, useCallback } from 'react';
import type {
  Team,
  Player,
  PlayerAttributes,
  PlayerForm,
  Position,
  StandingEntry,
  Tactics,
  TacticalPosture,
  FormationType,
} from '@retrofoot/core';
import { normalizeFormation } from '@retrofoot/core';
import { apiFetch } from '../lib/api';

// API response types (from database)
interface ApiSaveResponse {
  save: {
    id: string;
    name: string;
    managerName: string;
    managerReputation: number;
    currentSeason: string;
    currentRound: number;
    createdAt: string;
    updatedAt: string;
  };
  playerTeam: {
    id: string;
    saveId: string;
    name: string;
    shortName: string;
    badgeUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    stadium: string;
    capacity: number;
    reputation: number;
    budget: number;
    wageBudget: number;
    momentum: number;
    lastFiveResults: ('W' | 'D' | 'L')[];
    // Financial fields
    balance: number | null;
    roundWages: number | null;
    seasonRevenue: number | null;
    seasonExpenses: number | null;
  } | null;
  teamCount: number;
  playerCount: number;
}

interface ApiPlayerResponse {
  id: string;
  name: string;
  nickname?: string;
  age: number;
  position: string;
  nationality: string;
  attributes: PlayerAttributes;
  potential: number;
  morale: number;
  fitness: number;
  energy?: number;
  injured: boolean;
  form: number;
  wage: number;
  marketValue: number;
  // Season stats
  lastFiveRatings?: number[];
  seasonGoals?: number;
  seasonAssists?: number;
  seasonMinutes?: number;
  seasonAvgRating?: number;
}

interface ApiStandingResponse {
  position: number;
  teamId: string;
  teamName: string;
  teamShortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface SaveData {
  saveId: string;
  saveName: string;
  managerName: string;
  managerReputation: number;
  currentSeason: string;
  currentRound: number;
  playerTeam: Team | null;
  standings: StandingEntry[];
  teams?: Team[];
}

interface UseSaveDataResult {
  data: SaveData | null;
  isLoading: boolean;
  error: string | null;
  isSetupPending: boolean;
  setupStage: string | null;
  setupProgress: number;
  refetch: () => Promise<void>;
}

interface ApiTacticsResponse {
  tactics: {
    formation: string;
    posture: TacticalPosture;
    lineup: string[];
    substitutes: string[];
  };
}

/**
 * Transform API player response to core Player type
 */
function transformPlayer(apiPlayer: ApiPlayerResponse): Player {
  return {
    id: apiPlayer.id,
    name: apiPlayer.name,
    nickname: apiPlayer.nickname,
    age: apiPlayer.age,
    nationality: apiPlayer.nationality,
    position: apiPlayer.position as Position,
    preferredFoot: 'right', // Default - API doesn't return this yet
    attributes: apiPlayer.attributes,
    potential: apiPlayer.potential,
    morale: apiPlayer.morale ?? 70,
    fitness: apiPlayer.fitness ?? 100,
    energy: apiPlayer.energy ?? 100,
    injured: apiPlayer.injured ?? false,
    injuryWeeks: 0,
    contractEndSeason: 2028, // Default - API doesn't return this in squad endpoint
    wage: apiPlayer.wage,
    marketValue: apiPlayer.marketValue,
    status: 'active',
    form: {
      form: apiPlayer.form ?? 70,
      lastFiveRatings: (apiPlayer.lastFiveRatings as number[]) ?? [],
      seasonGoals: apiPlayer.seasonGoals ?? 0,
      seasonAssists: apiPlayer.seasonAssists ?? 0,
      seasonMinutes: apiPlayer.seasonMinutes ?? 0,
      seasonAvgRating: apiPlayer.seasonAvgRating ?? 0,
    } as PlayerForm,
  };
}

// ============================================================================
// Match Data Types (for match simulation)
// ============================================================================

interface ApiFixtureResponse {
  id: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: ApiTeamWithPlayersResponse | null;
  awayTeam: ApiTeamWithPlayersResponse | null;
}

interface ApiTeamWithPlayersResponse {
  id: string;
  name: string;
  shortName: string;
  badgeUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  stadium: string;
  capacity: number;
  reputation: number;
  budget: number;
  wageBudget: number;
  momentum: number;
  lastFiveResults: ('W' | 'D' | 'L')[];
  players: ApiMatchPlayerResponse[];
}

interface ApiMatchPlayerResponse {
  id: string;
  name: string;
  nickname?: string;
  age: number;
  nationality: string;
  position: string;
  preferredFoot: string;
  attributes: PlayerAttributes;
  potential: number;
  morale: number;
  fitness: number;
  energy?: number;
  injured: boolean;
  injuryWeeks: number;
  contractEndSeason: number;
  wage: number;
  marketValue: number;
  status: string;
  form: {
    form: number;
    lastFiveRatings: number[];
    seasonGoals: number;
    seasonAssists: number;
    seasonMinutes: number;
    seasonAvgRating: number;
  };
}

interface ApiMatchDataResponse {
  currentRound: number;
  currentSeason: string;
  playerTeamId: string;
  fixtures: ApiFixtureResponse[];
  teams: ApiTeamWithPlayersResponse[];
}

export interface MatchFixture {
  id: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

export interface MatchData {
  saveId: string;
  currentRound: number;
  currentSeason: string;
  playerTeamId: string;
  fixtures: MatchFixture[];
  teams: Team[];
}

interface UseSaveMatchDataResult {
  data: MatchData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Transform API match player to core Player type
 */
function transformMatchPlayer(apiPlayer: ApiMatchPlayerResponse): Player {
  return {
    id: apiPlayer.id,
    name: apiPlayer.name,
    nickname: apiPlayer.nickname,
    age: apiPlayer.age,
    nationality: apiPlayer.nationality,
    position: apiPlayer.position as Position,
    preferredFoot:
      (apiPlayer.preferredFoot as 'left' | 'right' | 'both') || 'right',
    attributes: apiPlayer.attributes,
    potential: apiPlayer.potential,
    morale: apiPlayer.morale ?? 70,
    fitness: apiPlayer.fitness ?? 100,
    energy: apiPlayer.energy ?? 100,
    injured: apiPlayer.injured ?? false,
    injuryWeeks: apiPlayer.injuryWeeks ?? 0,
    contractEndSeason: apiPlayer.contractEndSeason ?? 2028,
    wage: apiPlayer.wage,
    marketValue: apiPlayer.marketValue,
    status:
      (apiPlayer.status as
        | 'active'
        | 'retiring'
        | 'retired'
        | 'deceased'
        | 'suspended') ?? 'active',
    form: {
      form: apiPlayer.form?.form ?? 70,
      lastFiveRatings: apiPlayer.form?.lastFiveRatings ?? [],
      seasonGoals: apiPlayer.form?.seasonGoals ?? 0,
      seasonAssists: apiPlayer.form?.seasonAssists ?? 0,
      seasonMinutes: apiPlayer.form?.seasonMinutes ?? 0,
      seasonAvgRating: apiPlayer.form?.seasonAvgRating ?? 0,
    },
  };
}

/**
 * Transform API team with players to core Team type
 */
function transformTeamWithPlayers(apiTeam: ApiTeamWithPlayersResponse): Team {
  return {
    id: apiTeam.id,
    name: apiTeam.name,
    shortName: apiTeam.shortName,
    badgeUrl: apiTeam.badgeUrl,
    primaryColor: apiTeam.primaryColor,
    secondaryColor: apiTeam.secondaryColor,
    stadium: apiTeam.stadium,
    capacity: apiTeam.capacity,
    reputation: apiTeam.reputation,
    budget: apiTeam.budget,
    wageBudget: apiTeam.wageBudget,
    momentum: apiTeam.momentum ?? 50,
    lastFiveResults: apiTeam.lastFiveResults ?? [],
    players: (apiTeam.players ?? []).map(transformMatchPlayer),
  };
}

/**
 * Hook to fetch match data (fixtures, teams with players) for match simulation
 */
export function useSaveMatchData(
  saveId: string | undefined,
): UseSaveMatchDataResult {
  const [data, setData] = useState<MatchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!saveId) {
      setIsLoading(false);
      setError('No save ID provided');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch match fixtures with teams and players
      const response = await apiFetch(`/api/match/${saveId}/fixtures`);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 403) {
          throw new Error('Access denied');
        }
        if (response.status === 404) {
          throw new Error('Save not found');
        }
        throw new Error('Failed to fetch match data');
      }

      const matchData: ApiMatchDataResponse = await response.json();

      // Transform teams
      const teams = matchData.teams.map(transformTeamWithPlayers);

      // Transform fixtures
      const fixtures: MatchFixture[] = matchData.fixtures.map((f) => ({
        id: f.id,
        round: f.round,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        date: f.date,
        played: f.played,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
      }));

      setData({
        saveId,
        currentRound: matchData.currentRound ?? 1,
        currentSeason: matchData.currentSeason,
        playerTeamId: matchData.playerTeamId,
        fixtures,
        teams,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load match data',
      );
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [saveId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}

/**
 * Hook to fetch complete save data including team and players
 */
export function useSaveData(saveId: string | undefined): UseSaveDataResult {
  const [data, setData] = useState<SaveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSetupPending, setIsSetupPending] = useState(false);
  const [setupStage, setSetupStage] = useState<string | null>(null);
  const [setupProgress, setSetupProgress] = useState(0);

  const fetchData = useCallback(async () => {
    if (!saveId) {
      setIsLoading(false);
      setError('No save ID provided');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setIsSetupPending(false);
      setSetupStage(null);
      setSetupProgress(0);

      // Fetch save details
      const saveResponse = await apiFetch(`/api/save/${saveId}`);

      if (saveResponse.status === 202) {
        const pendingData: {
          stage?: string;
          progress?: number;
        } = await saveResponse.json();
        setData(null);
        setIsSetupPending(true);
        setSetupStage(pendingData.stage ?? 'initializing');
        setSetupProgress(
          typeof pendingData.progress === 'number'
            ? Math.max(0, Math.min(1, pendingData.progress))
            : 0,
        );
        return;
      }

      if (!saveResponse.ok) {
        if (saveResponse.status === 401) {
          throw new Error('Unauthorized');
        }
        if (saveResponse.status === 404) {
          throw new Error('Save not found');
        }
        throw new Error('Failed to fetch save');
      }

      const saveData: ApiSaveResponse = await saveResponse.json();

      if (!saveData.playerTeam) {
        throw new Error('Player team not found');
      }

      // Fetch player squad
      const squadResponse = await apiFetch(
        `/api/save/${saveId}/team/${saveData.playerTeam.id}/squad`,
      );

      if (!squadResponse.ok) {
        throw new Error('Failed to fetch squad');
      }

      const squadData: { squad: ApiPlayerResponse[] } =
        await squadResponse.json();

      // Fetch standings
      const standingsResponse = await apiFetch(`/api/save/${saveId}/standings`);

      let standings: StandingEntry[] = [];
      if (standingsResponse.ok) {
        const standingsData: { standings: ApiStandingResponse[] } =
          await standingsResponse.json();
        standings = standingsData.standings.map((s) => ({
          position: s.position,
          teamId: s.teamId,
          teamName: s.teamName,
          played: s.played ?? 0,
          won: s.won ?? 0,
          drawn: s.drawn ?? 0,
          lost: s.lost ?? 0,
          goalsFor: s.goalsFor ?? 0,
          goalsAgainst: s.goalsAgainst ?? 0,
          goalDifference: (s.goalsFor ?? 0) - (s.goalsAgainst ?? 0),
          points: s.points ?? 0,
        }));
      }

      // Transform players
      const players: Player[] = squadData.squad.map(transformPlayer);

      // Build team with players
      const playerTeam: Team = {
        id: saveData.playerTeam.id,
        name: saveData.playerTeam.name,
        shortName: saveData.playerTeam.shortName,
        badgeUrl: saveData.playerTeam.badgeUrl,
        primaryColor: saveData.playerTeam.primaryColor,
        secondaryColor: saveData.playerTeam.secondaryColor,
        stadium: saveData.playerTeam.stadium,
        capacity: saveData.playerTeam.capacity,
        reputation: saveData.playerTeam.reputation,
        budget: saveData.playerTeam.budget,
        wageBudget: saveData.playerTeam.wageBudget,
        players,
        momentum: saveData.playerTeam.momentum ?? 50,
        lastFiveResults: saveData.playerTeam.lastFiveResults ?? [],
        // Financial fields
        balance: saveData.playerTeam.balance ?? 0,
        roundWages: saveData.playerTeam.roundWages ?? 0,
        seasonRevenue: saveData.playerTeam.seasonRevenue ?? 0,
        seasonExpenses: saveData.playerTeam.seasonExpenses ?? 0,
      };

      setData({
        saveId: saveData.save.id,
        saveName: saveData.save.name,
        managerName: saveData.save.managerName,
        managerReputation: saveData.save.managerReputation ?? 50,
        currentSeason: saveData.save.currentSeason,
        currentRound: saveData.save.currentRound ?? 1,
        playerTeam,
        standings,
      });
      setIsSetupPending(false);
      setSetupStage(null);
      setSetupProgress(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load save data');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [saveId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    isSetupPending,
    setupStage,
    setupProgress,
    refetch: fetchData,
  };
}

export async function fetchSaveSetupStatus(saveId: string): Promise<{
  setupStatus: 'pending' | 'ready';
  stage: string;
  progress: number;
}> {
  const response = await apiFetch(`/api/save/${saveId}/setup-status`);
  if (!response.ok) {
    throw new Error('Failed to fetch save setup status');
  }
  const payload: {
    setupStatus?: string;
    stage?: string;
    progress?: number;
  } = await response.json();
  return {
    setupStatus: payload.setupStatus === 'ready' ? 'ready' : 'pending',
    stage: payload.stage ?? 'initializing',
    progress:
      typeof payload.progress === 'number'
        ? Math.max(0, Math.min(1, payload.progress))
        : 0,
  };
}

export async function fetchTeamTactics(
  saveId: string,
  teamId: string,
): Promise<Tactics | null> {
  const response = await apiFetch(`/api/save/${saveId}/tactics/${teamId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error('Failed to fetch tactics');
  }

  const payload: ApiTacticsResponse = await response.json();
  return {
    formation: normalizeFormation(payload.tactics.formation),
    posture: payload.tactics.posture,
    lineup: payload.tactics.lineup ?? [],
    substitutes: payload.tactics.substitutes ?? [],
  };
}

export async function saveTeamTactics(
  saveId: string,
  teamId: string,
  tactics: Tactics,
): Promise<Tactics> {
  const response = await apiFetch(`/api/save/${saveId}/tactics/${teamId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      formation: tactics.formation,
      posture: tactics.posture,
      lineup: tactics.lineup,
      substitutes: tactics.substitutes,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save tactics');
  }

  const payload: ApiTacticsResponse = await response.json();
  return {
    formation: normalizeFormation(payload.tactics.formation) as FormationType,
    posture: payload.tactics.posture as TacticalPosture,
    lineup: payload.tactics.lineup ?? [],
    substitutes: payload.tactics.substitutes ?? [],
  };
}

// ============================================================================
// Transactions Data Hook
// ============================================================================

export interface RoundTransaction {
  round: number;
  income: { category: string; amount: number; description: string | null }[];
  expenses: { category: string; amount: number; description: string | null }[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

interface UseTransactionsResult {
  transactions: RoundTransaction[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch transaction history for a save
 */
export function useTransactions(saveId?: string): UseTransactionsResult {
  const [transactions, setTransactions] = useState<RoundTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!saveId) {
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/save/${saveId}/transactions`);

      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load transactions',
      );
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [saveId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    transactions,
    isLoading,
    error,
    refetch: fetchData,
  };
}
