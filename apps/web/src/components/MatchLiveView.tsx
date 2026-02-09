import { useMemo, useState } from 'react';
import type { MatchEvent, LiveMatchState } from '@retrofoot/core';
import { TeamShield } from './TeamShield';
import { MatchEventsModal } from './MatchEventsModal';
import { EventIcon } from './EventIcon';
import { isSignificantEvent } from './matchEventUtils';

export type PlaybackSpeed = 1 | 2 | 3;

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
  playbackSpeed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  round: number;
}

function formatTime(minute: number, seconds: number): string {
  const m = String(minute).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  return `${m}:${s}`;
}

function getLatestSignificantEvent(
  events: MatchEvent[],
): MatchEvent | undefined {
  const significant = events.filter((e) => isSignificantEvent(e.type));
  return significant[significant.length - 1];
}

function getPhaseLabel(phase: MatchLiveViewProps['phase']): string {
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
}

function getEventLabel(type: MatchEvent['type']): string {
  switch (type) {
    case 'goal':
      return 'Goal';
    case 'own_goal':
      return 'Own Goal';
    case 'yellow_card':
      return 'Yellow Card';
    case 'red_card':
      return 'Red Card';
    case 'penalty_scored':
      return 'Penalty';
    case 'penalty_missed':
      return 'Penalty Missed';
    case 'injury':
      return 'Injury';
    case 'substitution':
      return 'Substitution';
    default:
      return '';
  }
}

// Icon Components for Mobile
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function SubstitutionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 7l5-5v3h4v4h-4v3L7 7z" />
      <path d="M17 17l-5 5v-3H8v-4h4v-3l5 5z" />
    </svg>
  );
}

interface MatchRowProps {
  match: LiveMatchState;
  isPlayerMatch: boolean;
  onClick: () => void;
}

function MatchRow({ match, isPlayerMatch, onClick }: MatchRowProps) {
  const { homeTeam, awayTeam, state, attendance } = match;

  const latestEvent = useMemo(
    () => getLatestSignificantEvent(state.events),
    [state.events],
  );

  const rowClassName = isPlayerMatch
    ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500 hover:bg-pitch-900/60'
    : 'bg-slate-800 hover:bg-slate-700';

  return (
    <div
      onClick={onClick}
      className={`hidden md:grid grid-cols-[160px_1.2fr_80px_1.2fr_minmax(220px,1fr)] items-center gap-2 px-4 py-3 border-b border-slate-700 transition-colors cursor-pointer ${rowClassName}`}
    >
      <div className="text-slate-400 text-xs">
        <div className="font-mono text-white">
          {attendance.toLocaleString()}
        </div>
        <div>{homeTeam.stadium}</div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <span className="text-white font-medium">{homeTeam.name}</span>
        <TeamShield team={homeTeam} />
      </div>

      <div className="text-center">
        <span className="text-white font-bold text-xl font-mono">
          {state.homeScore} x {state.awayScore}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <TeamShield team={awayTeam} />
        <span className="text-white font-medium">{awayTeam.name}</span>
      </div>

      <div className="text-sm">
        {latestEvent && (
          <span className="flex items-center gap-1">
            <span className="text-slate-400 font-mono">
              {latestEvent.minute}'
            </span>
            <EventIcon type={latestEvent.type} variant="colored" />
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

// Mobile Match Card Component
interface MobileMatchCardProps {
  match: LiveMatchState;
  isPlayerMatch: boolean;
  onClick: () => void;
}

function MobileMatchCard({
  match,
  isPlayerMatch,
  onClick,
}: MobileMatchCardProps) {
  const { homeTeam, awayTeam, state } = match;

  const latestEvent = useMemo(
    () => getLatestSignificantEvent(state.events),
    [state.events],
  );

  const cardClassName = isPlayerMatch
    ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500'
    : 'bg-slate-800';

  return (
    <div
      onClick={onClick}
      className={`md:hidden h-14 flex items-center px-3 border-b border-slate-700 cursor-pointer active:bg-slate-700 transition-colors ${cardClassName}`}
    >
      {/* Home Team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <TeamShield team={homeTeam} />
        <span className="text-white font-medium text-xs">
          {homeTeam.shortName}
        </span>
      </div>

      {/* Score + Event */}
      <div className="flex flex-col items-center px-2 min-w-[116px] shrink-0">
        <span className="text-white font-bold text-base font-mono leading-tight">
          {state.homeScore} - {state.awayScore}
        </span>
        {latestEvent && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400 leading-tight">
            <span className="font-mono">{latestEvent.minute}'</span>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor:
                  latestEvent.team === 'home'
                    ? homeTeam.primaryColor
                    : awayTeam.primaryColor,
              }}
            />
            <EventIcon type={latestEvent.type} variant="colored" />
            {latestEvent.type === 'own_goal' && (
              <span className="text-red-400 font-bold">OG</span>
            )}
            <span
              className={
                latestEvent.type === 'own_goal' ? 'text-red-300' : undefined
              }
            >
              {getEventLabel(latestEvent.type)}
            </span>
          </div>
        )}
      </div>

      {/* Away Team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className="text-white font-medium text-xs">
          {awayTeam.shortName}
        </span>
        <TeamShield team={awayTeam} />
      </div>
    </div>
  );
}

interface LiveIndicatorProps {
  isLive: boolean;
  isPaused: boolean;
}

function LiveIndicator({ isLive, isPaused }: LiveIndicatorProps) {
  if (isPaused) {
    return (
      <div className="text-yellow-500 text-xs font-bold uppercase">PAUSED</div>
    );
  }
  if (isLive) {
    return (
      <div className="text-red-500 text-xs font-bold uppercase animate-pulse">
        LIVE
      </div>
    );
  }
  return null;
}

interface ControlButtonsProps {
  phase: MatchLiveViewProps['phase'];
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSubstitutions: () => void;
  playbackSpeed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

function ControlButtons({
  phase,
  isPaused,
  onPause,
  onResume,
  onSubstitutions,
  playbackSpeed,
  onSpeedChange,
}: ControlButtonsProps) {
  const isLive = phase === 'first_half' || phase === 'second_half';
  const canSubstitute = phase === 'half_time' || isPaused;

  return (
    <div className="flex items-center gap-3">
      {isLive && (
        <button
          onClick={() =>
            onSpeedChange(playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 3 : 1)
          }
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-sm"
        >
          Game speed: {playbackSpeed}x
        </button>
      )}
      {isLive && !isPaused && (
        <button
          onClick={onPause}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
        >
          Pause
        </button>
      )}

      {isLive && isPaused && (
        <button
          onClick={onResume}
          className="px-4 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-medium rounded-lg transition-colors"
        >
          Resume
        </button>
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
          Team Changes
        </button>
      )}
    </div>
  );
}

// Mobile Control Bar Component
interface MobileControlBarProps {
  phase: MatchLiveViewProps['phase'];
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onSubstitutions: () => void;
  playbackSpeed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

function MobileControlBar({
  phase,
  isPaused,
  onPause,
  onResume,
  onSubstitutions,
  playbackSpeed,
  onSpeedChange,
}: MobileControlBarProps) {
  const isLive = phase === 'first_half' || phase === 'second_half';
  const canSubstitute = phase === 'half_time' || isPaused;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-center gap-3">
        {isLive && (
          <button
            onClick={() =>
              onSpeedChange(
                playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 3 : 1,
              )
            }
            className="shrink-0 px-4 py-2 bg-slate-700 active:bg-slate-600 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Game speed: {playbackSpeed}x
          </button>
        )}
        {isLive && !isPaused && (
          <button
            onClick={onPause}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-700 active:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            <PauseIcon className="w-5 h-5" />
            <span>Pause</span>
          </button>
        )}

        {isLive && isPaused && (
          <button
            onClick={onResume}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-pitch-600 active:bg-pitch-500 text-white font-medium rounded-lg transition-colors"
          >
            <PlayIcon className="w-5 h-5" />
            <span>Resume</span>
          </button>
        )}

        {phase === 'half_time' && (
          <button
            onClick={onResume}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-pitch-600 active:bg-pitch-500 text-white font-medium rounded-lg transition-colors"
          >
            <PlayIcon className="w-5 h-5" />
            <span>Play 2nd Half</span>
          </button>
        )}

        {canSubstitute && (
          <button
            onClick={onSubstitutions}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-700 active:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            <SubstitutionIcon className="w-5 h-5" />
            <span>Team Changes</span>
          </button>
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
  playbackSpeed,
  onSpeedChange,
  round,
}: MatchLiveViewProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const selectedMatch = selectedMatchId
    ? (matches.find((m) => m.fixtureId === selectedMatchId) ?? null)
    : null;

  const phaseLabel = getPhaseLabel(phase);
  const isLive = phase === 'first_half' || phase === 'second_half';

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Mobile Header */}
      <header className="md:hidden bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-pixel text-xs text-pitch-400">SÉRIE A</h1>
          <p className="text-slate-400 text-xs">Round {round}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-slate-400 text-xs uppercase">{phaseLabel}</div>
            <LiveIndicator isLive={isLive} isPaused={isPaused} />
          </div>
          <div className="text-white font-mono text-xl font-bold">
            {formatTime(currentMinute, currentSeconds)}
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden md:flex bg-slate-800 border-b border-slate-700 px-6 py-3 items-center justify-between">
        <div>
          <h1 className="font-pixel text-sm text-pitch-400">SÉRIE A</h1>
          <p className="text-slate-400 text-sm">Round {round}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-slate-400 text-xs uppercase">{phaseLabel}</div>
            <div className="text-white font-mono text-3xl font-bold">
              {formatTime(currentMinute, currentSeconds)}
            </div>
            <LiveIndicator isLive={isLive} isPaused={isPaused} />
          </div>
        </div>

        <ControlButtons
          phase={phase}
          isPaused={isPaused}
          onPause={onPause}
          onResume={onResume}
          onSubstitutions={onSubstitutions}
          playbackSpeed={playbackSpeed}
          onSpeedChange={onSpeedChange}
        />
      </header>

      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="border border-slate-700 rounded-lg m-4 overflow-hidden">
          {/* Desktop Column Headers */}
          <div className="hidden md:grid grid-cols-[160px_1.2fr_80px_1.2fr_minmax(220px,1fr)] gap-2 px-4 py-2 bg-slate-700/50 text-slate-400 text-xs uppercase font-medium">
            <div>Attendance</div>
            <div className="text-right">Home</div>
            <div className="text-center">Score</div>
            <div>Away</div>
            <div>Latest Event</div>
          </div>

          {matches.map((match, index) => (
            <div key={match.fixtureId}>
              {/* Desktop Row */}
              <MatchRow
                match={match}
                isPlayerMatch={index === playerMatchIndex}
                onClick={() => setSelectedMatchId(match.fixtureId)}
              />
              {/* Mobile Card */}
              <MobileMatchCard
                match={match}
                isPlayerMatch={index === playerMatchIndex}
                onClick={() => setSelectedMatchId(match.fixtureId)}
              />
            </div>
          ))}
        </div>
      </main>

      {/* Mobile Control Bar */}
      <MobileControlBar
        phase={phase}
        isPaused={isPaused}
        onPause={onPause}
        onResume={onResume}
        onSubstitutions={onSubstitutions}
        playbackSpeed={playbackSpeed}
        onSpeedChange={onSpeedChange}
      />

      {selectedMatch && (
        <MatchEventsModal
          match={selectedMatch}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </div>
  );
}
