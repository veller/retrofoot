import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { trackOnlineEvent } from '../lib/analytics/online';

/**
 * Shareable link: /online/join/:inviteCode
 * Logged-in users POST join and land in the league lobby.
 */
export function OnlineJoinInvitePage() {
  const { inviteCode: rawCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const code = (rawCode ?? '').trim().toUpperCase();
    if (code.length < 4) {
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
  }, [rawCode, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 max-w-lg mx-auto flex flex-col items-center justify-center gap-6">
      {status === 'working' ? (
        <>
          <p className="font-pixel text-amber-400 text-lg animate-pulse">
            Joining lobby…
          </p>
          <p className="text-slate-500 text-sm text-center">
            Code:{' '}
            <span className="font-mono text-slate-300">
              {(rawCode ?? '').toUpperCase()}
            </span>
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
            <Link to="/" className="text-slate-500 text-sm hover:text-slate-300">
              Home
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
