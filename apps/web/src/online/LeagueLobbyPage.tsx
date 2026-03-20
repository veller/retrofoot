import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

type LeagueDetail = {
  id: string;
  inviteCode: string;
  status: string;
  maxMembers: number;
  currentRound: number;
  hostUserId: string;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type MemberRow = {
  userId: string;
  role: string;
  onlineTeamId: string | null;
  teamName: string | null;
  teamShortName: string | null;
  displayName: string;
  joinedAt: string;
};

export function LeagueLobbyPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leagueId) return;
    setError(null);
    try {
      const [lr, mr] = await Promise.all([
        apiFetch(`/api/online/leagues/${leagueId}`),
        apiFetch(`/api/online/leagues/${leagueId}/members`),
      ]);
      if (!lr.ok) {
        setError(lr.status === 403 ? 'Not a member' : 'Not found');
        return;
      }
      if (!mr.ok) {
        setError('Could not load members');
        return;
      }
      const lJson = (await lr.json()) as { league: LeagueDetail };
      const mJson = (await mr.json()) as { members: MemberRow[] };
      setLeague(lJson.league);
      setMembers(mJson.members);
    } catch {
      setError('Failed to load lobby');
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isHost = useMemo(
    () => Boolean(user?.id && league?.hostUserId === user.id),
    [user?.id, league?.hostUserId],
  );

  const canStart = useMemo(() => {
    if (!league || league.status !== 'lobby' || !isHost) return false;
    return (members?.length ?? 0) >= 2;
  }, [league, isHost, members?.length]);

  const inviteJoinUrl =
    league?.status === 'lobby'
      ? `${window.location.origin}/online/join/${league.inviteCode}`
      : null;

  const copyInviteLink = async () => {
    if (!inviteJoinUrl) return;
    setCopyHint(null);
    try {
      await navigator.clipboard.writeText(inviteJoinUrl);
      setCopyHint('Link copied');
      window.setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint('Could not copy — select the link and copy manually');
      window.setTimeout(() => setCopyHint(null), 4000);
    }
  };

  const handleStart = async () => {
    if (!leagueId || !canStart || starting) return;
    setStartError(null);
    setStarting(true);
    try {
      const res = await apiFetch(`/api/online/leagues/${leagueId}/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStartError(body.error || 'Could not start league');
        return;
      }
      await load();
    } catch {
      setStartError('Could not start league');
    } finally {
      setStarting(false);
    }
  };

  if (!leagueId) {
    return null;
  }

  const seasonLabel =
    league?.settings && typeof league.settings.seasonLabel === 'string'
      ? league.settings.seasonLabel
      : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8">
        <Link
          to="/online"
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          ← Online
        </Link>
        <Link
          to="/"
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          Home
        </Link>
      </div>

      {error ? (
        <p className="text-red-400 mb-4">{error}</p>
      ) : !league ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <h1 className="font-pixel text-xl text-amber-400 mb-2">
            {league.status === 'lobby' ? 'LOBBY' : 'LEAGUE'}
          </h1>

          {league.status === 'lobby' ? (
            <>
              <p className="text-slate-400 text-sm mb-4">
                Share this code with friends:
              </p>
              <div className="bg-slate-800 border-2 border-amber-600/50 p-4 mb-4 text-center">
                <span className="font-mono text-3xl tracking-widest text-amber-300">
                  {league.inviteCode}
                </span>
              </div>
              <div className="mb-6 space-y-2">
                <p className="text-slate-500 text-xs uppercase tracking-wide">
                  Invite link (friends must be signed in)
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={inviteJoinUrl ?? ''}
                    className="flex-1 bg-slate-950 border border-slate-600 px-3 py-2 text-xs text-slate-300 font-mono truncate"
                    aria-label="Invite link"
                  />
                  <button
                    type="button"
                    onClick={() => void copyInviteLink()}
                    className="shrink-0 bg-slate-700 hover:bg-slate-600 font-bold px-4 py-2 text-sm border border-slate-500"
                  >
                    Copy link
                  </button>
                </div>
                {copyHint ? (
                  <p className="text-pitch-400 text-xs">{copyHint}</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-slate-400 text-sm mb-4">
              Invite code{' '}
              <span className="font-mono text-amber-300">{league.inviteCode}</span>
              {seasonLabel ? (
                <>
                  {' '}
                  · Season <span className="text-slate-300">{seasonLabel}</span>
                </>
              ) : null}
            </p>
          )}

          <div className="text-xs text-slate-500 mb-6 space-y-1">
            <p>Status: {league.status}</p>
            <p>Max players: {league.maxMembers}</p>
          </div>

          <h2 className="font-pixel text-sm text-slate-500 mb-2">PLAYERS</h2>
          {members === null ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="bg-slate-800 border border-slate-600 px-3 py-2 flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-center sm:gap-2"
                >
                  <div>
                    <span>{m.displayName}</span>
                    {m.teamName ? (
                      <p className="text-pitch-400 text-sm font-medium">
                        {m.teamName}
                        {m.teamShortName ? ` (${m.teamShortName})` : ''}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-slate-500 text-sm shrink-0">
                    {m.role === 'host' ? 'Host' : 'Player'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {league.status === 'lobby' && isHost ? (
            <div className="mt-8 border-t border-slate-700 pt-4 space-y-3">
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!canStart || starting}
                className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold py-3 px-4 border-2 border-amber-500"
              >
                {starting ? 'STARTING…' : 'START LEAGUE'}
              </button>
              {(members?.length ?? 0) < 2 ? (
                <p className="text-slate-500 text-sm">
                  At least two players must be in the lobby before you can
                  start.
                </p>
              ) : (
                <p className="text-slate-500 text-sm">
                  Random clubs from the RetroFoot universe are assigned to each
                  player. Fixtures are generated as a full round-robin (home
                  and away).
                </p>
              )}
              {startError ? (
                <p className="text-red-400 text-sm">{startError}</p>
              ) : null}
            </div>
          ) : null}

          {league.status === 'active' ? (
            <div className="mt-8 border-t border-slate-700 pt-4 space-y-3">
              <Link
                to={`/online/league/${leagueId}/season`}
                className="inline-block bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold py-3 px-4 border-2 border-amber-700/50"
              >
                TABLE &amp; FIXTURES
              </Link>
              <p className="text-slate-500 text-sm">
                Full schedule and standings. Live matches and kickoff scheduling
                come next.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
