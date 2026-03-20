import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { trackOnlineEvent } from '../lib/analytics/online';

type MyLeagueRow = {
  id: string;
  inviteCode: string;
  status: string;
  maxMembers: number;
  currentRound?: number;
  hostUserId: string;
  role: string;
  createdAt: string;
};

export function OnlineHomePage() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<MyLeagueRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch('/api/online/leagues/mine');
      if (!res.ok) {
        setLoadError('Could not load online leagues');
        setLeagues([]);
        return;
      }
      const data = (await res.json()) as { leagues: MyLeagueRow[] };
      setLeagues(data.leagues);
    } catch {
      setLoadError('Could not load online leagues');
      setLeagues([]);
    }
  }, []);

  useEffect(() => {
    void loadMine();
    trackOnlineEvent('online_lobby_viewed');
  }, [loadMine]);

  const handleCreate = async () => {
    setCreating(true);
    setJoinError(null);
    try {
      const res = await apiFetch('/api/online/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMembers: 8 }),
      });
      if (!res.ok) {
        setJoinError('Failed to create lobby');
        return;
      }
      const data = (await res.json()) as {
        league: { id: string; inviteCode: string };
      };
      trackOnlineEvent('online_lobby_created', {
        onlineLeagueId: data.league.id,
        payload: { inviteCode: data.league.inviteCode },
      });
      navigate(`/online/league/${data.league.id}`);
      void loadMine();
    } catch {
      setJoinError('Failed to create lobby');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await apiFetch('/api/online/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setJoinError(err.error || 'Could not join');
        return;
      }
      const data = (await res.json()) as { league: { id: string } };
      trackOnlineEvent('online_league_joined', {
        onlineLeagueId: data.league.id,
        payload: { inviteCode: code, via: 'code_field' },
      });
      setJoinCode('');
      navigate(`/online/league/${data.league.id}`);
      void loadMine();
    } catch {
      setJoinError('Could not join');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="font-pixel text-2xl text-amber-400">ONLINE</h1>
        <Link
          to="/"
          className="text-sm text-slate-400 hover:text-pitch-400 transition-colors"
        >
          Home
        </Link>
      </div>

      <p className="text-slate-400 text-sm mb-6">
        Create a lobby and you&apos;ll land in the waiting room. Share the
        invite link or code with friends (they need to be signed in). When
        everyone&apos;s ready, the host starts the league.
      </p>

      <div className="flex flex-col gap-3 mb-8">
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 font-bold py-3 px-4 border-2 border-amber-500"
        >
          {creating ? 'CREATING…' : 'CREATE LOBBY'}
        </button>

        <form onSubmit={handleJoin} className="flex flex-col gap-2">
          <label className="text-xs text-slate-500 uppercase tracking-wide">
            Join with invite code
          </label>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={12}
              className="flex-1 bg-slate-800 border border-slate-600 px-3 py-2 font-mono uppercase"
            />
            <button
              type="submit"
              disabled={joining || joinCode.trim().length < 4}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 font-bold px-4 border-2 border-slate-500"
            >
              {joining ? '…' : 'JOIN'}
            </button>
          </div>
        </form>
      </div>

      {joinError ? (
        <p className="text-red-400 text-sm mb-4">{joinError}</p>
      ) : null}
      {loadError ? (
        <p className="text-red-400 text-sm mb-4">{loadError}</p>
      ) : null}

      <h2 className="font-pixel text-sm text-slate-500 mb-3">YOUR LOBBIES</h2>
      {leagues === null ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : leagues.length === 0 ? (
        <p className="text-slate-500 text-sm">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li key={l.id}>
              <div className="bg-slate-800 border border-slate-600 p-3 hover:border-amber-600/60 transition-colors">
                <div className="flex justify-between items-center gap-2">
                  <Link
                    to={`/online/league/${l.id}`}
                    className="font-mono text-amber-300 hover:underline"
                  >
                    {l.inviteCode}
                  </Link>
                  <span className="text-xs uppercase text-slate-500">
                    {l.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to={`/online/league/${l.id}`}
                    className="hover:text-slate-300"
                  >
                    {l.role === 'host' ? 'Host' : 'Player'} · max {l.maxMembers}
                  </Link>
                  {l.status === 'active' ? (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        to={`/online/league/${l.id}/season`}
                        className="text-pitch-400 hover:underline"
                      >
                        Table &amp; fixtures
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
