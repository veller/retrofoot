import { useState, useEffect, useCallback } from 'react';
import type {
  Team,
  Player,
  PlayerAttributes,
  PlayerForm,
  Position,
  StandingEntry,
} from '@retrofoot/core';

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
  injured: boolean;
  form: number;
  wage: number;
  marketValue: number;
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
}

interface UseSaveDataResult {
  data: SaveData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
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
    injured: apiPlayer.injured ?? false,
    injuryWeeks: 0,
    contractEndSeason: 2028, // Default - API doesn't return this in squad endpoint
    wage: apiPlayer.wage,
    marketValue: apiPlayer.marketValue,
    status: 'active',
    form: {
      form: apiPlayer.form ?? 70,
      lastFiveRatings: [],
      seasonGoals: 0,
      seasonAssists: 0,
      seasonMinutes: 0,
      seasonAvgRating: 0,
    } as PlayerForm,
  };
}

/**
 * Hook to fetch complete save data including team and players
 */
export function useSaveData(saveId: string | undefined): UseSaveDataResult {
  const [data, setData] = useState<SaveData | null>(null);
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

      // Fetch save details
      const saveResponse = await fetch(`/api/save/${saveId}`, {
        credentials: 'include',
      });

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
      const squadResponse = await fetch(
        `/api/save/${saveId}/team/${saveData.playerTeam.id}/squad`,
        { credentials: 'include' },
      );

      if (!squadResponse.ok) {
        throw new Error('Failed to fetch squad');
      }

      const squadData: { squad: ApiPlayerResponse[] } =
        await squadResponse.json();

      // Fetch standings
      const standingsResponse = await fetch(`/api/save/${saveId}/standings`, {
        credentials: 'include',
      });

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
    refetch: fetchData,
  };
}
