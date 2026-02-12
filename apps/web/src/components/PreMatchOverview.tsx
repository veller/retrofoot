import { useMemo } from 'react';
import type { Team, Fixture, Tactics, Player } from '@retrofoot/core';
import { calculateOverall, selectBestLineup } from '@retrofoot/core';
import { TeamShield } from './TeamShield';
import { PreMatchOverviewImmersiveDesktop } from './PreMatchOverviewImmersiveDesktop';

interface PreMatchOverviewProps {
  fixture: Fixture;
  homeTeam: Team;
  awayTeam: Team;
  playerTeamId: string;
  playerTactics: Tactics;
  onConfirm: () => void;
  onBack: () => void;
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
          className="cta-play-shiny flex-1 py-3 bg-pitch-600 active:bg-pitch-500 text-white font-bold rounded-lg transition-colors"
        >
          <span className="relative z-10">Play Match</span>
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
    <div
      className="min-h-dvh md:min-h-screen flex flex-col"
      style={{
        background:
          'linear-gradient(to bottom, rgb(100 116 139), rgb(30 41 59) 45%, rgb(2 6 23))',
      }}
    >
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
        <div className="grid grid-cols-3 items-center">
          <div className="flex justify-start">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
          <div className="text-center">
            <h1 className="font-pixel text-lg text-pitch-400">MATCH DAY</h1>
            <p className="text-slate-400 text-sm">
              Round {fixture.round} · Série A
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={onConfirm}
              className="cta-play-shiny px-6 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-bold rounded-lg transition-colors"
            >
              <span className="relative z-10">Play Match</span>
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

      <PreMatchOverviewImmersiveDesktop
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        isPlayerHome={isPlayerHome}
        playerTactics={playerTactics}
        expectedAttendance={expectedAttendance}
      />

      {/* Mobile Control Bar */}
      <MobileControlBar onBack={onBack} onConfirm={onConfirm} />
    </div>
  );
}
