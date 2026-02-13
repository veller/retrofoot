import { useMemo, useEffect } from 'react';
import type { MatchEvent, LiveMatchState } from '@retrofoot/core';
import { TeamShield } from './TeamShield';
import { EventIcon } from './EventIcon';
import { isSignificantEvent } from './matchEventUtils';

const MATCH_PHASE_EVENTS: MatchEvent['type'][] = [
  'kickoff',
  'half_time',
  'full_time',
];

function getEventAccentClass(type: MatchEvent['type']): string {
  switch (type) {
    case 'own_goal':
      return 'text-red-300';
    case 'penalty_scored':
      return 'text-amber-200';
    case 'penalty_missed':
      return 'text-red-300';
    default:
      return 'text-white';
  }
}

interface MatchEventsModalProps {
  match: LiveMatchState;
  onClose: () => void;
}

function EventRow({
  event,
  homeTeam,
  awayTeam,
}: {
  event: MatchEvent;
  homeTeam: LiveMatchState['homeTeam'];
  awayTeam: LiveMatchState['awayTeam'];
}) {
  const isSignificant = isSignificantEvent(event.type);
  const isHomeEvent = event.team === 'home';
  const isMatchPhaseEvent = MATCH_PHASE_EVENTS.includes(event.type);

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
        isSignificant ? 'bg-slate-700/50' : 'opacity-60'
      }`}
    >
      <span className="text-slate-400 font-mono text-sm w-10 flex-shrink-0">
        {event.minute}'
      </span>

      {isMatchPhaseEvent ? (
        <div className="w-2 flex-shrink-0" />
      ) : (
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: isHomeEvent
              ? homeTeam.primaryColor
              : awayTeam.primaryColor,
          }}
        />
      )}

      {isSignificant && (
        <span className="text-lg flex-shrink-0 w-6 text-center">
          <EventIcon type={event.type} />
        </span>
      )}

      {event.type === 'own_goal' && (
        <span className="text-red-400 text-xs font-bold flex-shrink-0">OG</span>
      )}
      {event.type === 'penalty_scored' && (
        <span className="text-amber-300 text-xs font-bold flex-shrink-0">PEN</span>
      )}
      {event.type === 'penalty_missed' && (
        <span className="text-red-400 text-xs font-bold flex-shrink-0">PEN</span>
      )}

      <div className="flex-1 min-w-0">
        {isSignificant && event.playerName ? (
          <>
            <span className={`font-medium ${getEventAccentClass(event.type)}`}>
              {event.playerName}
            </span>
            {event.type === 'goal' && event.assistPlayerName && (
              <span className="text-slate-400 text-sm ml-2">
                (ast: {event.assistPlayerName})
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-400 text-sm">{event.description}</span>
        )}
      </div>

      <span className="text-slate-500 text-xs flex-shrink-0 hidden sm:block">
        {isHomeEvent ? homeTeam.shortName : awayTeam.shortName}
      </span>
    </div>
  );
}

function getPhaseLabel(phase: string, minute: number): string {
  if (phase === 'full_time') {
    return 'Full Time';
  }
  return `${minute}'`;
}

export function MatchEventsModal({ match, onClose }: MatchEventsModalProps) {
  const { homeTeam, awayTeam, state, attendance } = match;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sortedEvents = useMemo(
    () => [...state.events].sort((a, b) => b.minute - a.minute),
    [state.events],
  );

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-900/50 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                <span className="text-white font-medium truncate">
                  {homeTeam.name}
                </span>
                <div className="flex-shrink-0">
                  <TeamShield team={homeTeam} />
                </div>
              </div>

              <div className="text-center px-2 flex-shrink-0">
                <span className="text-white font-bold text-2xl font-mono whitespace-nowrap">
                  {state.homeScore} - {state.awayScore}
                </span>
                <div className="text-slate-400 text-xs mt-1 uppercase">
                  {getPhaseLabel(state.phase, state.minute)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <TeamShield team={awayTeam} />
                </div>
                <span className="text-white font-medium truncate">
                  {awayTeam.name}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="ml-4 text-slate-400 hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Events Timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          {sortedEvents.length === 0 ? (
            <div className="text-center text-slate-400 py-8">No events yet</div>
          ) : (
            <div className="space-y-2">
              {sortedEvents.map((event, index) => (
                <EventRow
                  key={`${event.minute}-${event.type}-${index}`}
                  event={event}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-900/50 rounded-b-xl">
          <div className="flex justify-between text-xs text-slate-400">
            <span>📍 {homeTeam.stadium}</span>
            <span>👥 {attendance.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
