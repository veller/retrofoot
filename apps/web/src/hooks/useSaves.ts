import { useState, useEffect, useCallback } from 'react';

export interface SaveSummary {
  id: string;
  name: string;
  playerTeamId: string;
  managerName: string;
  currentSeason: string;
  currentRound: number;
  createdAt: string;
  updatedAt: string;
}

interface UseSavesResult {
  saves: SaveSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  currentSave: SaveSummary | null;
  hasSave: boolean;
}

/**
 * Hook to fetch and manage user saves
 * For testing, we limit each user to a single save
 */
export function useSaves(): UseSavesResult {
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSaves = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/save', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not logged in, no saves
          setSaves([]);
          return;
        }
        throw new Error('Failed to fetch saves');
      }

      const data = await response.json();
      setSaves(data.saves || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saves');
      setSaves([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSaves();
  }, [fetchSaves]);

  // For testing: limit to single save - return first save if exists
  const currentSave = saves.length > 0 ? saves[0] : null;
  const hasSave = saves.length > 0;

  return {
    saves,
    isLoading,
    error,
    refetch: fetchSaves,
    currentSave,
    hasSave,
  };
}

interface CreateSaveParams {
  name: string;
  teamId: string;
  managerName: string;
}

interface UseCreateSaveResult {
  createSave: (params: CreateSaveParams) => Promise<{ saveId: string } | null>;
  isCreating: boolean;
  error: string | null;
}

/**
 * Hook to create a new save
 */
export function useCreateSave(): UseCreateSaveResult {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSave = useCallback(
    async (params: CreateSaveParams): Promise<{ saveId: string } | null> => {
      try {
        setIsCreating(true);
        setError(null);

        const response = await fetch('/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create save');
        }

        const data = await response.json();
        return { saveId: data.saveId };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create save');
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  return {
    createSave,
    isCreating,
    error,
  };
}
