import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export interface SaveSummary {
  id: string;
  name: string;
  playerTeamId: string;
  managerName: string;
  currentSeason: string;
  currentRound: number;
  gameOver: boolean | null;
  gameOverReason: string | null;
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
  deleteSave: (saveId: string) => Promise<boolean>;
  isDeleting: boolean;
}

/**
 * Hook to fetch and manage user saves
 * For testing, we limit each user to a single save
 */
export function useSaves(): UseSavesResult {
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSaves = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch('/api/save');

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

  const deleteSave = useCallback(async (saveId: string): Promise<boolean> => {
    try {
      setIsDeleting(true);
      setError(null);

      const response = await apiFetch(`/api/save/${saveId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete save');
      }

      // Remove from local state
      setSaves((prev) => prev.filter((s) => s.id !== saveId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete save');
      return false;
    } finally {
      setIsDeleting(false);
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
    deleteSave,
    isDeleting,
  };
}

interface CreateSaveParams {
  name: string;
  teamId: string;
  managerName: string;
}

interface UseCreateSaveResult {
  createSave: (params: CreateSaveParams) => Promise<{
    saveId: string;
    setupStatus: 'pending' | 'ready';
    pollUrl?: string;
  } | null>;
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
    async (
      params: CreateSaveParams,
    ): Promise<{
      saveId: string;
      setupStatus: 'pending' | 'ready';
      pollUrl?: string;
    } | null> => {
      try {
        setIsCreating(true);
        setError(null);

        const response = await apiFetch('/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create save');
        }

        const data = await response.json();
        return {
          saveId: data.saveId,
          setupStatus: data.setupStatus === 'ready' ? 'ready' : 'pending',
          pollUrl:
            typeof data.pollUrl === 'string' && data.pollUrl.length > 0
              ? data.pollUrl
              : undefined,
        };
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
