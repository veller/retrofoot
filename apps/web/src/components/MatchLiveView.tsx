import { useState, useEffect, useMemo } from 'react';
import type { Team, Fixture } from '@retrofoot/core';
import { TeamShield } from './TeamShield';

/** Real ms between each game minute (1, 2, 3... human-like). */
const TICK_MS = 450;

type MatchPhase = '1st' | 'HT' | '2nd' | 'FT';

/** Display time as MM:00 (minutes only, zero-padded). */
function formatTime(minute: number): string {
  return `${String(minute).padStart(2, '0')}:00`;
}

function shuffle<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Returns random pairings of teams excluding the given IDs (e.g. user's match teams). */
function getRandomOtherMatches(
  teams: Team[],
  excludeTeamIds: string[],
): { homeTeam: Team; awayTeam: Team }[] {
  const exclude = new Set(excludeTeamIds);
  const rest = teams.filter((t) => !exclude.has(t.id));
  const shuffled = shuffle(rest);
  const pairs: { homeTeam: Team; awayTeam: Team }[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push({ homeTeam: shuffled[i], awayTeam: shuffled[i + 1] });
  }
  return pairs;
}

interface MatchLiveViewProps {
  fixture: Fixture;
  homeTeam: Team;
  awayTeam: Team;
  teams: Team[];
  onExit: () => void;
}

export function MatchLiveView({
  fixture,
  homeTeam,
  awayTeam,
  teams,
  onExit,
}: MatchLiveViewProps) {
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<MatchPhase>('1st');

  /** All matches: user's match first (highlighted), then random other pairings. */
  const allMatches = useMemo(() => {
    const others = getRandomOtherMatches(teams, [homeTeam.id, awayTeam.id]);
    return [
      { homeTeam, awayTeam, isUserMatch: true as const },
      ...others.map((pair) => ({ ...pair, isUserMatch: false as const })),
    ];
  }, [teams, homeTeam, awayTeam]);

  useEffect(() => {
    if (phase === 'FT' || phase === 'HT') return;

    const interval = setInterval(() => {
      setMinute((m) => {
        const next = m + 1;
        if (phase === '1st') {
          if (next >= 45) {
            setPhase('HT');
            return 45;
          }
          return next;
        }
        // phase === '2nd'
        if (next >= 90) {
          setPhase('FT');
          return 90;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [phase]);

  const phaseLabel =
    phase === '1st'
      ? '1st half'
      : phase === 'HT'
        ? 'Half time'
        : phase === '2nd'
          ? '2nd half'
          : 'Full time';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-900">
      {/* Minimal header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between shrink-0">
        <span className="text-slate-400 text-sm font-medium">
          Round {fixture.round} · {phase === 'FT' ? 'Full Time' : 'Live'}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-6">
        {/* Big timer at top */}
        <section className="flex flex-col items-center justify-center py-8 shrink-0">
          <span className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-1">
            {phase === '2nd' ? '2nd half' : phaseLabel}
          </span>
          <span className="text-6xl font-bold text-white font-mono tabular-nums">
            {formatTime(minute)}
          </span>
          {phase !== 'FT' && phase !== 'HT' && (
            <span className="mt-1 text-red-500 text-xs font-bold uppercase">
              Live
            </span>
          )}
          {phase === 'HT' && (
            <button
              type="button"
              onClick={() => setPhase('2nd')}
              className="mt-4 bg-pitch-600 hover:bg-pitch-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Play 2nd half
            </button>
          )}
        </section>

        {/* Full time: show exit button */}
        {phase === 'FT' && (
          <div className="flex flex-col items-center gap-4 py-2 shrink-0">
            <button
              type="button"
              onClick={onExit}
              className="bg-pitch-600 hover:bg-pitch-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Back to match day
            </button>
          </div>
        )}

        {/* All matches: user's row highlighted */}
        <section className="shrink-0">
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wide mb-3">
            Round {fixture.round}
          </h2>
          <ul className="grid gap-2">
            {allMatches.map(({ homeTeam: h, awayTeam: a, isUserMatch }, i) => (
              <li
                key={isUserMatch ? 'user' : `${h.id}-${a.id}-${i}`}
                className={`rounded-lg px-4 py-3 flex items-center justify-between ${
                  isUserMatch
                    ? 'bg-pitch-900/40 border-2 border-pitch-500'
                    : 'bg-slate-800 border border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <TeamShield team={h} />
                  <span className="text-white font-medium truncate">
                    {h.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 px-2">
                  <span className="text-slate-500 text-sm font-mono">
                    0 - 0
                  </span>
                </div>
                <div className="flex items-center gap-3 min-w-0 flex-1 justify-end">
                  <span className="text-white font-medium truncate">
                    {a.name}
                  </span>
                  <TeamShield team={a} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
