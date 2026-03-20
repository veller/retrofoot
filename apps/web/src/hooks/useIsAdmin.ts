import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { apiFetch } from '@/lib/api';

/**
 * Server-driven admin flag; allowlist never lives in the web bundle.
 */
export function useIsAdmin(): {
  isAdmin: boolean;
  isLoading: boolean;
} {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [probeDone, setProbeDone] = useState(false);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setIsAdmin(false);
      setProbeDone(true);
      return;
    }

    let cancelled = false;
    setProbeDone(false);

    void (async () => {
      try {
        const response = await apiFetch('/api/admin/me');
        if (cancelled) return;
        if (!response.ok) {
          setIsAdmin(false);
          setProbeDone(true);
          return;
        }
        const data = (await response.json()) as { isAdmin?: boolean };
        setIsAdmin(Boolean(data.isAdmin));
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setProbeDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  return {
    isAdmin,
    isLoading: authLoading || (isAuthenticated && !probeDone),
  };
}
