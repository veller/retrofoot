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

/**
 * Executes an auth action and refreshes the session cache on success.
 * This ensures ProtectedRoute sees the authenticated state immediately.
 */
async function withSessionRefresh<T>(
  authAction: () => Promise<{ error?: { message?: string } | null; data?: T }>,
): Promise<{ error: { message?: string } | null; data: T | null }> {
  const result = await authAction();

  if (result.error) {
    return { error: result.error, data: null };
  }

  await getSession({ fetchOptions: { cache: 'no-store' } });
  return { error: null, data: result.data ?? null };
}

/** Sign in and refresh session cache */
export function signInAndRefresh(credentials: {
  email: string;
  password: string;
}) {
  return withSessionRefresh(() => signIn.email(credentials));
}

/** Sign up and refresh session cache (Better Auth auto-signs in after registration) */
export function signUpAndRefresh(credentials: {
  name: string;
  email: string;
  password: string;
}) {
  return withSessionRefresh(() => signUp.email(credentials));
}
