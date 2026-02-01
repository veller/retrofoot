// ============================================================================
// RETROFOOT - Auth Client (Better Auth React Client)
// ============================================================================

import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client for React
 *
 * In development, requests go through Vite proxy (/api -> localhost:8787)
 * In production, use the full API URL from environment
 */
export const authClient = createAuthClient({
  // Base URL for auth API - defaults to current origin in production
  baseURL: import.meta.env.VITE_API_URL || '',
});

// Export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession, getSession } = authClient;
