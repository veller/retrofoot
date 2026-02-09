import { useMemo } from 'react';
import type { Team, Fixture, Tactics, Player } from '@retrofoot/core';
import { calculateOverall, selectBestLineup } from '@retrofoot/core';
import { TeamShield } from './TeamShield';

interface PreMatchOverviewProps {
  fixture: Fixture;
  homeTeam: Team;
  awayTeam: Team;
  playerTeamId: string;
  playerTactics: Tactics;
  onConfirm: () => void;
  onBack: () => void;
}

function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const colors = {
    W: 'bg-green-600',
    D: 'bg-yellow-500',
    L: 'bg-red-600',
  };

  return (
    <span
      className={`${colors[result]} text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded`}
    >
      {result}
    </span>
  );
}

// Small form badge for mobile
function FormBadgeSmall({ result }: { result: 'W' | 'D' | 'L' }) {
  const colors = {
    W: 'bg-green-600',
    D: 'bg-yellow-500',
    L: 'bg-red-600',
  };

  return (
    <span
      className={`${colors[result]} text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded`}
    >
      {result}
    </span>
  );
}

function useTeamLineup(team: Team, tactics?: Tactics, formation?: string) {
  const displayFormation = formation || tactics?.formation || '4-3-3';

  const lineup = useMemo(() => {
    const players = team.players || [];
    if (players.length === 0) return [];

    if (tactics?.lineup) {
      return tactics.lineup
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as Player[];
    }
    if (players.length >= 11) {
      const { lineup: lineupIds } = selectBestLineup(
        team,
        displayFormation as '4-3-3',
      );
      return lineupIds
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as Player[];
    }
    return players.slice(0, 11);
  }, [team, tactics, displayFormation]);

  const avgOverall = useMemo(() => {
    if (lineup.length === 0) return 0;
    const sum = lineup.reduce((acc, p) => acc + calculateOverall(p), 0);
    return Math.round(sum / lineup.length);
  }, [lineup]);

  return { lineup, avgOverall, displayFormation };
}

// Desktop Team Card (existing design)
function TeamOverview({
  team,
  tactics,
  isOpponent,
  formation,
}: {
  team: Team;
  tactics?: Tactics;
  isOpponent: boolean;
  formation?: string;
}) {
  const { lineup, avgOverall, displayFormation } = useTeamLineup(
    team,
    tactics,
    formation,
  );

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <TeamShield team={team} />
          <div>
            <h3 className="text-white font-bold text-lg">{team.name}</h3>
            <p className="text-slate-400 text-sm">
              {isOpponent ? 'Opponent' : 'Your Team'}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end">
          <span className="text-slate-500 text-[10px] uppercase font-medium mb-1">
            Avg overall
          </span>
          <div className="bg-pitch-900/60 border-2 border-pitch-500/50 rounded-lg px-3 py-1.5 min-w-[56px] text-center">
            <span className="text-pitch-400 font-bold text-2xl">
              {avgOverall}
            </span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="mb-4">
        <p className="text-slate-500 text-xs uppercase mb-1">Form</p>
        <div className="flex gap-1">
          {team.lastFiveResults && team.lastFiveResults.length > 0 ? (
            team.lastFiveResults.map((r, i) => <FormBadge key={i} result={r} />)
          ) : (
            <span className="text-slate-500 text-sm">No matches yet</span>
          )}
        </div>
      </div>

      {/* Lineup Preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-slate-500 text-xs uppercase">
            {isOpponent ? 'Predicted Lineup' : 'Your Lineup'}
          </p>
          <span className="text-pitch-400 text-xs font-medium bg-pitch-900/50 px-2 py-0.5 rounded">
            {displayFormation}
          </span>
        </div>
        <div className="grid gap-1">
          {lineup.length > 0 ? (
            lineup.slice(0, 11).map((player) => (
              <div
                key={player.id}
                className="flex justify-between items-center text-sm bg-slate-700/50 px-2 py-1 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 text-xs font-medium w-7 shrink-0">
                    {player.position}
                  </span>
                  <span className="text-white truncate">
                    {player.nickname || player.name}
                  </span>
                </div>
                <span className="text-pitch-400 font-medium shrink-0">
                  {calculateOverall(player)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-sm">No lineup data available</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Mobile Comparison View - keeps both teams side-by-side
function MobileComparisonView({
  homeTeam,
  awayTeam,
  isPlayerHome,
  playerTactics,
  venue,
}: {
  homeTeam: Team;
  awayTeam: Team;
  isPlayerHome: boolean;
  playerTactics: Tactics;
  venue: string;
}) {
  const homeData = useTeamLineup(
    homeTeam,
    isPlayerHome ? playerTactics : undefined,
    isPlayerHome ? playerTactics.formation : undefined,
  );
  const awayData = useTeamLineup(
    awayTeam,
    !isPlayerHome ? playerTactics : undefined,
    !isPlayerHome ? playerTactics.formation : undefined,
  );

  return (
    <div className="md:hidden flex flex-col flex-1 min-h-0 overflow-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {/* Match Header - Both teams side by side */}
      <div className="bg-slate-800 border-b border-slate-700 px-3 py-3 shrink-0">
        <div className="flex items-center justify-between">
          {/* Home Team */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamShield team={homeTeam} />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">
                {homeTeam.name}
              </p>
              {isPlayerHome && (
                <p className="text-pitch-400 text-[10px] uppercase">You</p>
              )}
            </div>
          </div>

          {/* VS */}
          <div className="px-3 text-slate-500 font-bold text-sm">vs</div>

          {/* Away Team */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-white font-bold text-sm truncate">
                {awayTeam.name}
              </p>
              {!isPlayerHome && (
                <p className="text-pitch-400 text-[10px] uppercase">You</p>
              )}
            </div>
            <TeamShield team={awayTeam} />
          </div>
        </div>

        {/* Venue */}
        <p className="text-slate-500 text-[10px] text-center mt-2">{venue}</p>
      </div>

      {/* Stats Comparison Row */}
      <div className="bg-slate-800/50 border-b border-slate-700 px-3 py-2 shrink-0">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center">
          {/* Formation */}
          <span className="text-pitch-400 text-xs font-medium">
            {homeData.displayFormation}
          </span>
          <span className="text-slate-500 text-[10px] uppercase px-2">
            Formation
          </span>
          <span className="text-pitch-400 text-xs font-medium">
            {awayData.displayFormation}
          </span>

          {/* Form */}
          <div className="flex gap-0.5 justify-center">
            {homeTeam.lastFiveResults
              ?.slice(0, 5)
              .map((r, i) => <FormBadgeSmall key={i} result={r} />) || (
              <span className="text-slate-500 text-[10px]">-</span>
            )}
          </div>
          <span className="text-slate-500 text-[10px] uppercase px-2">
            Form
          </span>
          <div className="flex gap-0.5 justify-center">
            {awayTeam.lastFiveResults
              ?.slice(0, 5)
              .map((r, i) => <FormBadgeSmall key={i} result={r} />) || (
              <span className="text-slate-500 text-[10px]">-</span>
            )}
          </div>
        </div>
      </div>

      {/* Lineups Side by Side */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        <div className="grid grid-cols-2 gap-2">
          {/* Home Lineup */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-500 text-[10px] uppercase">
                {isPlayerHome ? 'Your Lineup' : 'Predicted'}
              </p>
              <div className="bg-pitch-900/60 border border-pitch-500/50 rounded px-1.5 py-0.5">
                <span className="text-pitch-400 font-bold text-sm">
                  {homeData.avgOverall}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {homeData.lineup.slice(0, 11).map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-slate-700/50 px-1.5 py-1 rounded text-[11px]"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-slate-400 w-5 shrink-0">
                      {player.position}
                    </span>
                    <span className="text-white truncate">
                      {player.nickname || player.name.split(' ').pop()}
                    </span>
                  </div>
                  <span className="text-pitch-400 font-medium shrink-0 ml-1">
                    {calculateOverall(player)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Away Lineup */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-500 text-[10px] uppercase">
                {!isPlayerHome ? 'Your Lineup' : 'Predicted'}
              </p>
              <div className="bg-pitch-900/60 border border-pitch-500/50 rounded px-1.5 py-0.5">
                <span className="text-pitch-400 font-bold text-sm">
                  {awayData.avgOverall}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {awayData.lineup.slice(0, 11).map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-slate-700/50 px-1.5 py-1 rounded text-[11px]"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-slate-400 w-5 shrink-0">
                      {player.position}
                    </span>
                    <span className="text-white truncate">
                      {player.nickname || player.name.split(' ').pop()}
                    </span>
                  </div>
                  <span className="text-pitch-400 font-medium shrink-0 ml-1">
                    {calculateOverall(player)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mobile Control Bar
function MobileControlBar({
  onBack,
  onConfirm,
}: {
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-800 border-t border-slate-700 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-slate-700 active:bg-slate-600 text-white font-medium rounded-lg transition-colors"
        >
          Go Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 bg-pitch-600 active:bg-pitch-500 text-white font-bold rounded-lg transition-colors"
        >
          Play Match
        </button>
      </div>
    </div>
  );
}

export function PreMatchOverview({
  fixture,
  homeTeam,
  awayTeam,
  playerTeamId,
  playerTactics,
  onConfirm,
  onBack,
}: PreMatchOverviewProps) {
  const isPlayerHome = fixture.homeTeamId === playerTeamId;

  const expectedAttendance = useMemo(() => {
    const min = Math.floor(homeTeam.capacity * 0.5);
    const max = homeTeam.capacity;
    return `${min.toLocaleString()} - ${max.toLocaleString()}`;
  }, [homeTeam.capacity]);

  return (
    <div className="min-h-dvh md:min-h-screen bg-slate-900 flex flex-col">
      {/* Mobile Header */}
      <header className="md:hidden bg-slate-800 border-b border-slate-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-pixel text-xs text-pitch-400">MATCH DAY</h1>
            <p className="text-slate-400 text-[10px]">
              Round {fixture.round} · Série A
            </p>
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden md:block bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-pixel text-lg text-pitch-400">MATCH DAY</h1>
            <p className="text-slate-400 text-sm">
              Round {fixture.round} · Série A
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-bold rounded-lg transition-colors"
            >
              Play Match
            </button>
          </div>
        </div>
      </header>

      {/* Mobile View - Comparison Layout */}
      <MobileComparisonView
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        isPlayerHome={isPlayerHome}
        playerTactics={playerTactics}
        venue={`${homeTeam.stadium} · ${expectedAttendance}`}
      />

      {/* Desktop View */}
      <main className="hidden md:block flex-1 p-6">
        {/* Match Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-3">
              <TeamShield team={homeTeam} />
              <span className="text-white font-bold text-xl">
                {homeTeam.name}
              </span>
            </div>
            <span className="text-slate-500 text-2xl font-bold">vs</span>
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-xl">
                {awayTeam.name}
              </span>
              <TeamShield team={awayTeam} />
            </div>
          </div>

          <div className="mt-4 text-slate-400 text-sm">
            <p>
              {homeTeam.stadium} · Expected Attendance: {expectedAttendance}
            </p>
          </div>
        </div>

        {/* Team Comparison */}
        <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
          <TeamOverview
            team={homeTeam}
            tactics={isPlayerHome ? playerTactics : undefined}
            isOpponent={!isPlayerHome}
            formation={isPlayerHome ? playerTactics.formation : undefined}
          />
          <TeamOverview
            team={awayTeam}
            tactics={!isPlayerHome ? playerTactics : undefined}
            isOpponent={isPlayerHome}
            formation={!isPlayerHome ? playerTactics.formation : undefined}
          />
        </div>
      </main>

      {/* Mobile Control Bar */}
      <MobileControlBar onBack={onBack} onConfirm={onConfirm} />
    </div>
  );
}
