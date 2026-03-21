import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SeoHead } from '@/components';
import { useAuth } from '@/hooks';
import { apiFetch } from '@/lib/api';
import { trackOnlineEvent } from '@/lib/analytics/online';
import { setPendingOnlineInvitePath } from '@/lib/pendingOnlineInvite';

/**
 * Shareable link: /online/join/:inviteCode
 * Public route so meta tags render for guests (social previews, bookmarks).
 * Logged-in users POST join and land in the league lobby.
 */
export function OnlineJoinInvitePage() {
  const { inviteCode: rawCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);

  const code = useMemo(
    () => (rawCode ?? '').trim().toUpperCase(),
    [rawCode],
  );
  const codeOk = code.length >= 4;
  const canonicalJoinPath = codeOk ? `/online/join/${code}` : location.pathname;

  const seoTitle = codeOk
    ? 'Join this league · RetroFoot'
    : 'League invite · RetroFoot';
  const seoDescription = codeOk
    ? "You've been invited to an online division in RetroFoot. Sign in or create a free account to accept the invite and manage your club with friends."
    : 'This RetroFoot league invite link is not valid. Ask your host for a new link.';

  useEffect(() => {
    if (authLoading || isAuthenticated || !codeOk) return;
    setPendingOnlineInvitePath(location.pathname + location.search);
  }, [
    authLoading,
    isAuthenticated,
    codeOk,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    if (!codeOk) {
      setStatus('error');
      setMessage('Invalid invite link.');
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const res = await apiFetch('/api/online/leagues/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteCode: code }),
        });

        if (cancelled) return;

        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          league?: { id: string; alreadyMember?: boolean };
        };

        if (!res.ok) {
          setStatus('error');
          setMessage(
            body.error ||
              (res.status === 404
                ? 'No lobby found for that code.'
                : res.status === 409
                  ? 'This lobby is full or the league has already started.'
                  : 'Could not join.'),
          );
          return;
        }

        const leagueId = body.league?.id;
        if (!leagueId) {
          setStatus('error');
          setMessage('Unexpected response from server.');
          return;
        }

        trackOnlineEvent('online_league_joined', {
          onlineLeagueId: leagueId,
          payload: {
            inviteCode: code,
            via: 'invite_link',
            alreadyMember: body.league?.alreadyMember === true,
          },
        });

        navigate(`/online/league/${leagueId}`, { replace: true });
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Network error. Try again.');
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, code, codeOk, navigate]);

  return (
    <>
      <SeoHead
        title={seoTitle}
        description={seoDescription}
        path={canonicalJoinPath}
        noindex
        ogImageAlt="RetroFoot — join an online football manager league."
      />
      <div className="min-h-screen bg-slate-900 text-slate-200 p-6 max-w-lg mx-auto flex flex-col items-center justify-center gap-6">
        {authLoading ? (
          <p className="font-pixel text-amber-400 text-lg animate-pulse">
            Loading…
          </p>
        ) : !isAuthenticated ? (
          <>
            {codeOk ? (
              <>
                <header className="text-center space-y-3">
                  <p className="font-pixel text-2xl text-amber-400 tracking-wide">
                    You&apos;re invited
                  </p>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Join this online league on RetroFoot — retro football
                    manager with friends. Sign in or create a free account to
                    jump in.
                  </p>
                  <p className="text-slate-500 text-xs font-mono">
                    Lobby code{' '}
                    <span className="text-slate-300">{code}</span>
                  </p>
                </header>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <Link
                    to="/login"
                    state={{ from: location }}
                    className="text-center w-full bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-3 px-6 border-2 border-pitch-400 transition-colors"
                  >
                    Sign in to join
                  </Link>
                  <Link
                    to="/register"
                    className="text-center w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-6 border-2 border-slate-600 transition-colors"
                  >
                    Create account
                  </Link>
                </div>
                <Link
                  to="/"
                  className="text-slate-500 text-sm hover:text-slate-300"
                >
                  Back to home
                </Link>
              </>
            ) : (
              <>
                <p className="text-red-400 text-center">
                  This invite link doesn&apos;t look valid.
                </p>
                <Link
                  to="/"
                  className="text-slate-500 text-sm hover:text-slate-300"
                >
                  Home
                </Link>
              </>
            )}
          </>
        ) : status === 'working' ? (
          <>
            <p className="font-pixel text-amber-400 text-lg animate-pulse">
              Joining lobby…
            </p>
            <p className="text-slate-500 text-sm text-center">
              Code:{' '}
              <span className="font-mono text-slate-300">{code}</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-red-400 text-center">{message}</p>
            <div className="flex flex-col gap-3 items-center">
              <Link
                to="/online"
                className="text-amber-400 hover:underline font-bold"
              >
                Back to online
              </Link>
              <Link
                to="/"
                className="text-slate-500 text-sm hover:text-slate-300"
              >
                Home
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
