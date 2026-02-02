// ============================================================================
// RETROFOOT - Auth Client (Better Auth React Client)
// ============================================================================

import { createAuthClient } from 'better-auth/react';
import { API_BASE_URL } from './api';

/**
 * Better Auth client for React
 *
 * In development, requests go through Vite proxy (/api -> localhost:8787)
 * In production, use the full API URL from environment
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  fetchOptions: {
    credentials: 'include',
  },
});

// Export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession, getSession } = authClient;
