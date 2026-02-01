import { useState } from 'react';
import type { MatchState } from '@retrofoot/core';
import { calculateOverall } from '@retrofoot/core';
import { PositionBadge } from './PositionBadge';

interface SubstitutionPanelProps {
  matchState: MatchState;
  isHome: boolean;
  onClose: () => void;
  onSubstitute: (playerOutId: string, playerInId: string) => void;
}

const MAX_SUBS = 5;

export function SubstitutionPanel({
  matchState,
  isHome,
  onClose,
  onSubstitute,
}: SubstitutionPanelProps) {
  const [selectedLineupPlayer, setSelectedLineupPlayer] = useState<
    string | null
  >(null);

  const subsUsed = isHome ? matchState.homeSubsUsed : matchState.awaySubsUsed;
  const subsRemaining = MAX_SUBS - subsUsed;

  const lineup = isHome ? matchState.homeLineup : matchState.awayLineup;
  const subs = isHome ? matchState.homeSubs : matchState.awaySubs;

  const lineupPlayers = lineup;
  const benchPlayers = subs;

  const handleLineupClick = (playerId: string) => {
    if (subsRemaining <= 0) return;
    setSelectedLineupPlayer(
      selectedLineupPlayer === playerId ? null : playerId,
    );
  };

  const handleBenchClick = (playerInId: string) => {
    if (!selectedLineupPlayer || subsRemaining <= 0) return;

    onSubstitute(selectedLineupPlayer, playerInId);
    setSelectedLineupPlayer(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-pixel text-lg text-pitch-400">SUBSTITUTIONS</h1>
          <p className="text-slate-400 text-sm">
            {subsRemaining} substitution{subsRemaining !== 1 ? 's' : ''}{' '}
            remaining
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
        >
          Done
        </button>
      </header>

      <main className="flex-1 p-6">
        <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* On the Pitch */}
          <div>
            <h2 className="text-white font-bold mb-4">
              On the Pitch
              <span className="text-slate-400 font-normal ml-2">
                (Click to substitute out)
              </span>
            </h2>
            <div className="space-y-2">
              {lineupPlayers.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleLineupClick(player.id)}
                  disabled={subsRemaining <= 0}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                    selectedLineupPlayer === player.id
                      ? 'bg-pitch-600 border-2 border-pitch-400'
                      : subsRemaining > 0
                        ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
                        : 'bg-slate-800 border border-slate-700 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <PositionBadge position={player.position} />
                    <span className="text-white">
                      {player.nickname || player.name}
                    </span>
                  </div>
                  <span className="text-pitch-400 font-medium">
                    {calculateOverall(player)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* On the Bench */}
          <div>
            <h2 className="text-white font-bold mb-4">
              On the Bench
              <span className="text-slate-400 font-normal ml-2">
                (Click to bring on)
              </span>
            </h2>
            <div className="space-y-2">
              {benchPlayers.length === 0 ? (
                <p className="text-slate-500 text-sm">No players on bench</p>
              ) : (
                benchPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handleBenchClick(player.id)}
                    disabled={!selectedLineupPlayer || subsRemaining <= 0}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                      selectedLineupPlayer && subsRemaining > 0
                        ? 'bg-slate-800 hover:bg-pitch-900/50 border border-slate-700 hover:border-pitch-500'
                        : 'bg-slate-800 border border-slate-700 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <PositionBadge position={player.position} />
                      <span className="text-white">
                        {player.nickname || player.name}
                      </span>
                    </div>
                    <span className="text-pitch-400 font-medium">
                      {calculateOverall(player)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        {selectedLineupPlayer && (
          <div className="mt-6 text-center">
            <p className="text-yellow-400">
              Select a player from the bench to bring on
            </p>
          </div>
        )}

        {subsRemaining <= 0 && (
          <div className="mt-6 text-center">
            <p className="text-red-400">You have used all your substitutions</p>
          </div>
        )}
      </main>
    </div>
  );
}
