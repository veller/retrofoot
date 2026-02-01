import { useMemo } from 'react';
import type { Team, Fixture, Tactics } from '@retrofoot/core';
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
  const displayFormation = formation || tactics?.formation || '4-3-3';

  const lineup = useMemo(() => {
    const players = team.players || [];
    if (players.length === 0) return [];

    if (tactics?.lineup) {
      // Use the exact order from tactics (as selected by user)
      return tactics.lineup
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean);
    }
    // Generate predicted lineup for opponent
    if (players.length >= 11) {
      const { lineup: lineupIds } = selectBestLineup(
        team,
        displayFormation as '4-3-3',
      );
      return lineupIds
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean);
    }
    return players.slice(0, 11);
  }, [team, tactics, displayFormation]);

  const avgOverall = useMemo(() => {
    if (lineup.length === 0) return 0;
    const sum = lineup.reduce((acc, p) => acc + calculateOverall(p!), 0);
    return Math.round(sum / lineup.length);
  }, [lineup]);

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center gap-3 mb-4">
        <TeamShield team={team} />
        <div>
          <h3 className="text-white font-bold text-lg">{team.name}</h3>
          <p className="text-slate-400 text-sm">
            {isOpponent ? 'Opponent' : 'Your Team'}
          </p>
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

      {/* Stadium */}
      <div className="mb-4 text-sm">
        <p className="text-slate-500">Stadium</p>
        <p className="text-white">
          {team.stadium} ({team.capacity.toLocaleString()})
        </p>
      </div>

      {/* Average Overall */}
      <div className="mb-4 text-sm">
        <p className="text-slate-500">Avg. Overall</p>
        <p className="text-pitch-400 font-bold text-xl">{avgOverall}</p>
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
                key={player!.id}
                className="flex justify-between items-center text-sm bg-slate-700/50 px-2 py-1 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 text-xs font-medium w-7 shrink-0">
                    {player!.position}
                  </span>
                  <span className="text-white truncate">
                    {player!.nickname || player!.name}
                  </span>
                </div>
                <span className="text-pitch-400 font-medium shrink-0">
                  {calculateOverall(player!)}
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
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-pixel text-lg text-pitch-400">MATCH DAY</h1>
            <p className="text-slate-400 text-sm">
              Round {fixture.round} · Série A
            </p>
          </div>
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-white transition-colors"
          >
            &larr; Back
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
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

          {/* Venue Info */}
          <div className="mt-4 text-slate-400 text-sm">
            <p>
              {homeTeam.stadium} · Expected Attendance: {expectedAttendance}
            </p>
          </div>
        </div>

        {/* Team Comparison - Home team first, Away team second */}
        <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto mb-8">
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

        {/* Confirmation */}
        <div className="text-center">
          <p className="text-slate-400 mb-4">
            Are you ready to play this match?
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={onBack}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={onConfirm}
              className="px-8 py-3 bg-pitch-600 hover:bg-pitch-500 text-white font-bold rounded-lg transition-colors"
            >
              Play Match
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
