import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  playerNickname: string | null;
  position: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  count: number;
}

export interface LeaderboardsData {
  topScorers: LeaderboardEntry[];
  topAssists: LeaderboardEntry[];
}

interface UseLeaderboardsResult {
  data: LeaderboardsData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLeaderboards(saveId?: string): UseLeaderboardsResult {
  const [data, setData] = useState<LeaderboardsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!saveId) {
      setData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/save/${saveId}/leaderboards`);

      if (!response.ok) {
        const errorMessages: Record<number, string> = {
          401: 'Unauthorized',
          403: 'Access denied',
        };
        throw new Error(
          errorMessages[response.status] ?? 'Failed to fetch leaderboards',
        );
      }

      const result = await response.json();
      setData({
        topScorers: result.topScorers ?? [],
        topAssists: result.topAssists ?? [],
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load leaderboards',
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
