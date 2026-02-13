// ============================================================================
// RETROFOOT - Protected Route Component
// ============================================================================

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks';
import { SeoHead } from './SeoHead';

/**
 * Layout route that redirects unauthenticated users to login.
 * Use as a parent route to protect child routes.
 */
export function ProtectedRoute(): ReactElement {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [redirectReady, setRedirectReady] = useState(false);

  useEffect(() => {
    if (isAuthenticated || isLoading) {
      setRedirectReady(false);
      return;
    }

    const redirectTimer = window.setTimeout(() => {
      setRedirectReady(true);
    }, 250);

    return () => {
      window.clearTimeout(redirectTimer);
    };
  }, [isAuthenticated, isLoading]);

  if (isLoading || (!isAuthenticated && !redirectReady)) {
    return (
      <>
        <SeoHead
          title="Loading | RetroFoot"
          description="Loading your RetroFoot session."
          noindex
        />
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-pitch-400 text-lg animate-pulse">Loading...</div>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <>
      <SeoHead
        title="RetroFoot App"
        description="Manage your club, squad, and matches in RetroFoot."
        noindex
      />
      <Outlet />
    </>
  );
}
