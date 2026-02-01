// ============================================================================
// RETROFOOT - useAuth Hook
// ============================================================================

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, signOut as authSignOut } from '@/lib/auth';

/**
 * Custom hook for authentication state and actions
 *
 * Wraps Better Auth's useSession with additional convenience methods
 */
export function useAuth() {
  const session = useSession();
  const navigate = useNavigate();

  // Sign out and redirect to login
  const signOut = useCallback(async () => {
    await authSignOut();
    navigate('/login');
  }, [navigate]);

  return {
    // Session data
    user: session.data?.user ?? null,
    session: session.data?.session ?? null,

    // Loading state
    isLoading: session.isPending,

    // Auth state helpers
    isAuthenticated: !!session.data?.user,

    // Actions
    signOut,

    // Refresh session
    refetch: session.refetch,
  };
}
