import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

type FixtureDetailResponse = {
  fixture: {
    id: string;
    round: number;
    homeName: string;
    awayName: string;
    played: boolean;
  };
};

type WsTick = {
  type: 'tick';
  minute: number;
  phase: string;
  homeScore: number;
  awayScore: number;
  possession: 'home' | 'away';
  event?: { type: string; description?: string; minute?: number };
  devMode?: boolean;
};

function formatWsLine(raw: string): string {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const t = o.type;
    if (t === 'welcome') {
      const dev = o.devMode === true ? ' [dev: single-manager match]' : '';
      if (o.resumed) return `↺ Reconnected to live match.${dev}`;
      if (o.waiting) return `Waiting for both managers to join…${dev}`;
      return `Connected.${dev}`;
    }
    if (t === 'match_started') return 'Kickoff sequence started.';
    if (t === 'tick') {
      const tick = o as unknown as WsTick;
      const ev = tick.event;
      const score = `${tick.homeScore}–${tick.awayScore}`;
      const base = `${tick.minute}' · ${tick.phase.replace('_', ' ')} · ${score} · ball ${tick.possession}`;
      if (ev?.description) return `${base} — ${ev.description}`;
      return base;
    }
    if (t === 'half_time_wait') {
      return typeof o.message === 'string'
        ? o.message
        : 'Half-time — both managers must continue.';
    }
    if (t === 'half_ready_ack') return 'Ready signal received.';
    if (t === 'second_half') return 'Second half underway.';
    if (t === 'full_time') {
      const hs = o.homeScore;
      const as = o.awayScore;
      return `Full time — ${String(hs)}–${String(as)}`;
    }
    if (t === 'error') {
      return `Error: ${typeof o.message === 'string' ? o.message : 'unknown'}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

export function OnlineMatchRoomPage() {
  const { leagueId, fixtureId } = useParams<{
    leagueId: string;
    fixtureId: string;
  }>();
  const [title, setTitle] = useState<string>('Match room');
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<
    'idle' | 'connecting' | 'open' | 'error' | 'closed'
  >('idle');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [tick, setTick] = useState<WsTick | null>(null);
  const [needsHalfContinue, setNeedsHalfContinue] = useState(false);
  const [matchFinished, setMatchFinished] = useState(false);
  const [serverDevSingleManagerMatch, setServerDevSingleManagerMatch] =
    useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadFixture = useCallback(async () => {
    if (!leagueId || !fixtureId) return;
    setFixtureError(null);
    try {
      const res = await apiFetch(
        `/api/online/leagues/${leagueId}/fixtures/${fixtureId}`,
      );
      if (!res.ok) {
        setFixtureError(
          res.status === 404 ? 'Fixture not found' : 'Could not load fixture',
        );
        return;
      }
      const data = (await res.json()) as FixtureDetailResponse;
      const { homeName, awayName, round, played } = data.fixture;
      setTitle(`R${round}: ${homeName} vs ${awayName}`);
      if (played) {
        setFixtureError('This fixture is already finished.');
      }
    } catch {
      setFixtureError('Could not load fixture');
    }
  }, [leagueId, fixtureId]);

  useEffect(() => {
    void loadFixture();
  }, [loadFixture]);

  useEffect(() => {
    if (!leagueId || !fixtureId) return;

    let cancelled = false;

    async function connect() {
      setSessionError(null);
      setWsStatus('connecting');
      setLogLines([]);
      setTick(null);
      setNeedsHalfContinue(false);
      setMatchFinished(false);
      setServerDevSingleManagerMatch(false);

      const sessionRes = await apiFetch(
        `/api/online/leagues/${leagueId}/fixtures/${fixtureId}/session`,
        { method: 'POST' },
      );

      if (cancelled) return;

      if (!sessionRes.ok) {
        const body = (await sessionRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setSessionError(
          body.error || `Could not start session (${sessionRes.status})`,
        );
        setWsStatus('error');
        return;
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/api/online/match/${fixtureId}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setWsStatus('open');
      };
      ws.onmessage = (ev) => {
        if (cancelled) return;
        const raw = String(ev.data);
        setLogLines((m) => [...m, formatWsLine(raw)]);

        try {
          const o = JSON.parse(raw) as { type?: string; devMode?: boolean };
          if (o.devMode === true) {
            setServerDevSingleManagerMatch(true);
          }
          if (o.type === 'tick') {
            setTick(o as WsTick);
          }
          if (o.type === 'half_time_wait') {
            setNeedsHalfContinue(true);
          }
          if (o.type === 'second_half') {
            setNeedsHalfContinue(false);
          }
          if (o.type === 'full_time') {
            setMatchFinished(true);
            setNeedsHalfContinue(false);
          }
          if (o.type === 'welcome' && (o as { waitingHalf?: boolean }).waitingHalf) {
            setNeedsHalfContinue(true);
          }
          if (o.type === 'error') {
            setSessionError(
              typeof (o as { message?: string }).message === 'string'
                ? (o as { message: string }).message
                : 'Match room error',
            );
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        if (!cancelled) {
          setWsStatus('error');
          setLogLines((m) => [...m, '[WebSocket error]']);
        }
      };
      ws.onclose = () => {
        if (!cancelled) setWsStatus('closed');
        wsRef.current = null;
      };
    }

    void connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [leagueId, fixtureId]);

  const sendHalfReady = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'half_ready' }));
  };

  if (!leagueId || !fixtureId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 max-w-lg mx-auto flex flex-col gap-4">
      <div className="flex justify-between gap-4 text-sm">
        <Link
          to={`/online/league/${leagueId}/season`}
          className="text-slate-400 hover:text-pitch-400"
        >
          ← Season
        </Link>
        <Link to="/online" className="text-slate-400 hover:text-pitch-400">
          Online
        </Link>
      </div>

      <h1 className="font-pixel text-lg text-amber-400 leading-tight">{title}</h1>

      {fixtureError ? (
        <p className="text-red-400 text-sm">{fixtureError}</p>
      ) : null}
      {sessionError ? (
        <p className="text-red-400 text-sm">{sessionError}</p>
      ) : null}

      <p className="text-slate-500 text-xs">
        Live room · WebSocket{' '}
        <span className="text-slate-400 font-mono">{wsStatus}</span>
      </p>

      {serverDevSingleManagerMatch ? (
        <p className="text-amber-200/90 text-xs bg-amber-950/50 border border-amber-800/60 px-3 py-2">
          Dev mode: server allows one connected manager to run the match and
          continue after half-time — not a multiplayer test.
        </p>
      ) : null}

      {tick ? (
        <div className="bg-slate-800 border border-slate-600 p-4 space-y-1 text-sm">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-slate-400 text-xs uppercase tracking-wide">
              Score
            </span>
            <span className="font-pixel text-xl text-amber-300 tabular-nums">
              {tick.homeScore} – {tick.awayScore}
            </span>
          </div>
          <div className="text-slate-400 text-xs">
            {tick.minute}&apos; · {tick.phase.replace(/_/g, ' ')} · ball{' '}
            {tick.possession}
          </div>
          {tick.event?.description ? (
            <p className="text-slate-300 text-sm pt-1 border-t border-slate-700 mt-2">
              {tick.event.description}
            </p>
          ) : null}
        </div>
      ) : null}

      {matchFinished ? (
        <p className="text-emerald-400 text-sm font-medium">
          Match saved — return to the season hub for standings.
        </p>
      ) : null}

      {needsHalfContinue && !matchFinished ? (
        <div className="flex flex-col gap-2 bg-slate-800/80 border border-amber-700/50 p-3">
          <p className="text-amber-200/90 text-sm">
            Half-time — both managers must press continue.
          </p>
          <button
            type="button"
            onClick={sendHalfReady}
            disabled={wsStatus !== 'open'}
            className="bg-amber-700 hover:bg-amber-600 disabled:opacity-40 px-4 py-2 text-sm font-bold border border-amber-500"
          >
            Continue second half
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-[160px] max-h-[40vh] overflow-y-auto bg-slate-800 border border-slate-600 p-3 font-mono text-xs space-y-1">
        {logLines.length === 0 ? (
          <span className="text-slate-500">Feed will appear here…</span>
        ) : (
          logLines.map((m, i) => (
            <div key={i} className="text-slate-300 break-words">
              {m}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
