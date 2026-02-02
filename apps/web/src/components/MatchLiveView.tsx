import { useMemo } from 'react';
import type { MatchEvent, LiveMatchState } from '@retrofoot/core';
import { TeamShield } from './TeamShield';

interface MatchLiveViewProps {
  matches: LiveMatchState[];
  playerMatchIndex: number;
  currentMinute: number;
  currentSeconds: number;
  phase: 'first_half' | 'half_time' | 'second_half' | 'full_time';
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSubstitutions: () => void;
  round: number;
}

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  switch (type) {
    case 'goal':
      return <span className="text-yellow-400">⚽</span>;
    case 'own_goal':
      return <span className="text-red-400">⚽</span>;
    case 'yellow_card':
      return <span className="text-yellow-400">🟨</span>;
    case 'red_card':
      return <span className="text-red-600">🟥</span>;
    case 'penalty_scored':
      return <span className="text-green-400">⚽</span>;
    case 'penalty_missed':
      return <span className="text-red-400">❌</span>;
    default:
      return null;
  }
}

function formatTime(minute: number, seconds: number): string {
  return `${String(minute).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getLatestSignificantEvent(
  events: MatchEvent[],
): MatchEvent | undefined {
  // Only show goals and cards as significant events in the ticker
  const significant = events.filter((e) =>
    ['goal', 'own_goal', 'penalty_scored', 'yellow_card', 'red_card'].includes(
      e.type,
    ),
  );
  return significant[significant.length - 1];
}

interface MatchRowProps {
  match: LiveMatchState;
  isPlayerMatch: boolean;
}

function MatchRow({ match, isPlayerMatch }: MatchRowProps) {
  const { homeTeam, awayTeam, state, attendance } = match;

  const latestEvent = useMemo(
    () => getLatestSignificantEvent(state.events),
    [state.events],
  );

  return (
    <div
      className={`grid grid-cols-[160px_1fr_80px_1fr_minmax(280px,1fr)] items-center gap-2 px-4 py-3 border-b border-slate-700 transition-colors ${
        isPlayerMatch
          ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500'
          : 'bg-slate-800 hover:bg-slate-750'
      }`}
    >
      {/* Attendance + Stadium */}
      <div className="text-slate-400 text-xs">
        <div className="font-mono text-white">
          {attendance.toLocaleString()}
        </div>
        <div>{homeTeam.stadium}</div>
      </div>

      {/* Home Team */}
      <div className="flex items-center gap-2 justify-end">
        <span className="text-white font-medium truncate">{homeTeam.name}</span>
        <TeamShield team={homeTeam} />
      </div>

      {/* Score */}
      <div className="text-center">
        <span className="text-white font-bold text-xl font-mono">
          {state.homeScore} x {state.awayScore}
        </span>
      </div>

      {/* Away Team */}
      <div className="flex items-center gap-2">
        <TeamShield team={awayTeam} />
        <span className="text-white font-medium truncate">{awayTeam.name}</span>
      </div>

      {/* Latest Event */}
      <div className="text-sm">
        {latestEvent && (
          <span className="flex items-center gap-1">
            <span className="text-slate-400 font-mono">
              {latestEvent.minute}'
            </span>
            <EventIcon type={latestEvent.type} />
            {latestEvent.type === 'own_goal' && (
              <span className="text-red-400 text-xs font-bold">OG</span>
            )}
            <span
              className={
                latestEvent.type === 'own_goal' ? 'text-red-300' : 'text-white'
              }
            >
              {latestEvent.playerName}
            </span>
            {latestEvent.type === 'goal' && latestEvent.assistPlayerName && (
              <span className="text-slate-400 text-xs">
                (ast: {latestEvent.assistPlayerName})
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function MatchLiveView({
  matches,
  playerMatchIndex,
  currentMinute,
  currentSeconds,
  phase,
  isPaused,
  onPause,
  onResume,
  onSubstitutions,
  round,
}: MatchLiveViewProps) {
  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'first_half':
        return '1st Half';
      case 'half_time':
        return 'Half Time';
      case 'second_half':
        return '2nd Half';
      case 'full_time':
        return 'Full Time';
    }
  }, [phase]);

  const isLive = phase === 'first_half' || phase === 'second_half';
  const canSubstitute = phase === 'half_time' || isPaused;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-pixel text-sm text-pitch-400">SÉRIE A</h1>
          <p className="text-slate-400 text-sm">Round {round}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Timer */}
          <div className="text-center">
            <div className="text-slate-400 text-xs uppercase">{phaseLabel}</div>
            <div className="text-white font-mono text-3xl font-bold">
              {formatTime(currentMinute, currentSeconds)}
            </div>
            {isLive && !isPaused && (
              <div className="text-red-500 text-xs font-bold uppercase animate-pulse">
                LIVE
              </div>
            )}
            {isPaused && (
              <div className="text-yellow-500 text-xs font-bold uppercase">
                PAUSED
              </div>
            )}
          </div>
        </div>
        {/* Controls */}
        <div className="flex items-center gap-3">
          {isLive && (
            <>
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="px-4 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-medium rounded-lg transition-colors"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                >
                  Pause
                </button>
              )}
            </>
          )}

          {phase === 'half_time' && (
            <button
              onClick={onResume}
              className="px-4 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-medium rounded-lg transition-colors"
            >
              Play 2nd Half
            </button>
          )}

          {canSubstitute && (
            <button
              onClick={onSubstitutions}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Substitutions
            </button>
          )}
        </div>
      </header>

      {/* Match List */}
      <main className="flex-1 overflow-auto">
        <div className="border border-slate-700 rounded-lg m-4 overflow-hidden">
          {/* Column Headers */}
          <div className="grid grid-cols-[160px_1fr_80px_1fr_minmax(280px,1fr)] gap-2 px-4 py-2 bg-slate-700/50 text-slate-400 text-xs uppercase font-medium">
            <div>Attendance</div>
            <div className="text-right">Home</div>
            <div className="text-center">Score</div>
            <div>Away</div>
            <div>Latest Event</div>
          </div>

          {/* Match Rows */}
          {matches.map((match, index) => (
            <MatchRow
              key={match.fixtureId}
              match={match}
              isPlayerMatch={index === playerMatchIndex}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
