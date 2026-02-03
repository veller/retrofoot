import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

// Season Summary Types
export interface SeasonSummaryAward {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
}

export interface SeasonSummaryTopScorer extends SeasonSummaryAward {
  goals: number;
}

export interface SeasonSummaryTopAssister extends SeasonSummaryAward {
  assists: number;
}

export interface SeasonSummaryStarPlayer extends SeasonSummaryAward {
  score: number;
}

export interface SeasonSummaryChampion {
  id: string;
  name: string;
  shortName: string;
  points: number;
}

export interface SeasonSummaryRelegatedTeam {
  id: string;
  name: string;
  shortName: string;
}

export interface SeasonSummaryPlayerTeam {
  id: string;
  name: string;
  shortName: string;
  position: number;
  points: number;
  isRelegated: boolean;
}

export interface SeasonSummaryStanding {
  position: number;
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface SeasonSummary {
  season: string;
  champion: SeasonSummaryChampion | null;
  starPlayer: SeasonSummaryStarPlayer | null;
  topScorer: SeasonSummaryTopScorer | null;
  topAssister: SeasonSummaryTopAssister | null;
  relegatedTeams: SeasonSummaryRelegatedTeam[];
  playerTeam: SeasonSummaryPlayerTeam;
  standings: SeasonSummaryStanding[];
}

interface UseSeasonSummaryResult {
  data: SeasonSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch season summary after round 38
 */
export function useSeasonSummary(
  saveId: string | undefined,
): UseSeasonSummaryResult {
  const [data, setData] = useState<SeasonSummary | null>(null);
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

      const response = await apiFetch(`/api/season/${saveId}/summary`);

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
        throw new Error('Failed to fetch season summary');
      }

      const summaryData: SeasonSummary = await response.json();
      setData(summaryData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load season summary',
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

// Advance Season Types
interface AdvanceSeasonResponse {
  success: boolean;
  gameOver?: boolean;
  reason?: string;
  message?: string;
  newSeason?: string;
  retirements?: number;
  youthPlayersAdded?: number;
  newAchievements?: string[];
}

interface UseAdvanceSeasonResult {
  advance: () => Promise<AdvanceSeasonResponse>;
  isAdvancing: boolean;
  error: string | null;
}

/**
 * Hook to advance to the next season
 */
export function useAdvanceSeason(
  saveId: string | undefined,
): UseAdvanceSeasonResult {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = useCallback(async (): Promise<AdvanceSeasonResponse> => {
    if (!saveId) {
      return { success: false, message: 'No save ID provided' };
    }

    try {
      setIsAdvancing(true);
      setError(null);

      const response = await apiFetch(`/api/season/${saveId}/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to advance season');
      }

      const result: AdvanceSeasonResponse = await response.json();
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to advance season';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsAdvancing(false);
    }
  }, [saveId]);

  return {
    advance,
    isAdvancing,
    error,
  };
}

// Season History Types
export interface SeasonHistoryEntry {
  seasonYear: string;
  champion: {
    teamId: string;
    teamName: string;
  };
  starPlayer: {
    playerId: string;
    playerName: string;
  };
  topScorer: {
    playerId: string;
    playerName: string;
    goals: number;
  };
  topAssister: {
    playerId: string;
    playerName: string;
    assists: number;
  };
  playerTeam: {
    teamId: string;
    position: number;
    points: number;
    relegated: boolean;
  };
  relegatedTeamIds: string[];
  completedAt: string;
}

interface UseSeasonHistoryResult {
  data: SeasonHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch season history (lazy loaded)
 */
export function useSeasonHistory(
  saveId: string | undefined,
): UseSeasonHistoryResult {
  const [data, setData] = useState<SeasonHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!saveId) {
      setData([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch(`/api/season/${saveId}/history`);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 403) {
          throw new Error('Access denied');
        }
        throw new Error('Failed to fetch season history');
      }

      const result = await response.json();
      setData(result.history || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load season history',
      );
      setData([]);
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
