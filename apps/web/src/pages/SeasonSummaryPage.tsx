import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSeasonSummary, useAdvanceSeason } from '../hooks';

export function SeasonSummaryPage() {
  const { saveId } = useParams<{ saveId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useSeasonSummary(saveId);
  const {
    advance,
    isAdvancing,
    error: advanceError,
  } = useAdvanceSeason(saveId);

  const handleAdvanceSeason = async () => {
    const result = await advance();
    if (result.success) {
      // Navigate back to game page for new season
      navigate(`/game/${saveId}`);
    } else if (result.gameOver) {
      // Stay on page, show game over state
      // The data will reflect relegation
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pitch-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading season summary...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">
            {error || 'Failed to load season summary'}
          </p>
          <Link
            to={`/game/${saveId}`}
            className="text-pitch-400 hover:text-pitch-300 underline"
          >
            Return to Game
          </Link>
        </div>
      </div>
    );
  }

  const isRelegated = data.playerTeam.isRelegated;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="font-pixel text-lg text-pitch-400">RETROFOOT</h1>
          <span className="text-slate-400">Season {data.season}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Season Complete
          </h2>
          <p className="text-slate-400">
            The {data.season} season has come to an end
          </p>
        </div>

        {/* Champion Section */}
        {data.champion && (
          <div className="bg-gradient-to-br from-amber-600/20 to-amber-900/20 border border-amber-500/50 rounded-xl p-6 mb-6 text-center">
            <div className="text-amber-400 text-sm uppercase tracking-wider mb-2">
              League Champion
            </div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="text-4xl">🏆</span>
              <h3 className="text-3xl font-bold text-white">
                {data.champion.name}
              </h3>
              <span className="text-4xl">🏆</span>
            </div>
            <p className="text-amber-300">{data.champion.points} points</p>
          </div>
        )}

        {/* Awards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Star Player */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">⭐</div>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
              Star Player
            </div>
            {data.starPlayer ? (
              <>
                <h4 className="text-lg font-bold text-white">
                  {data.starPlayer.name}
                </h4>
                <p className="text-slate-400 text-sm">
                  {data.starPlayer.teamName}
                </p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">No winner</p>
            )}
          </div>

          {/* Top Scorer */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">⚽</div>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
              Golden Boot
            </div>
            {data.topScorer ? (
              <>
                <h4 className="text-lg font-bold text-white">
                  {data.topScorer.name}
                </h4>
                <p className="text-slate-400 text-sm">
                  {data.topScorer.teamName}
                </p>
                <p className="text-pitch-400 font-bold">
                  {data.topScorer.goals} goals
                </p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">No winner</p>
            )}
          </div>

          {/* Top Assister */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">🎯</div>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
              Playmaker Award
            </div>
            {data.topAssister ? (
              <>
                <h4 className="text-lg font-bold text-white">
                  {data.topAssister.name}
                </h4>
                <p className="text-slate-400 text-sm">
                  {data.topAssister.teamName}
                </p>
                <p className="text-pitch-400 font-bold">
                  {data.topAssister.assists} assists
                </p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">No winner</p>
            )}
          </div>
        </div>

        {/* Your Season Result */}
        <div
          className={`border rounded-xl p-6 mb-6 ${
            isRelegated
              ? 'bg-red-900/20 border-red-500/50'
              : data.playerTeam.position === 1
                ? 'bg-amber-900/20 border-amber-500/50'
                : data.playerTeam.position <= 4
                  ? 'bg-pitch-900/20 border-pitch-500/50'
                  : 'bg-slate-800 border-slate-700'
          }`}
        >
          <h3 className="text-lg font-bold text-white mb-4 text-center">
            Your Season
          </h3>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="text-slate-400 text-xs uppercase tracking-wider">
                Team
              </div>
              <div className="text-xl font-bold text-white">
                {data.playerTeam.name}
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs uppercase tracking-wider">
                Position
              </div>
              <div
                className={`text-3xl font-bold ${
                  isRelegated
                    ? 'text-red-400'
                    : data.playerTeam.position === 1
                      ? 'text-amber-400'
                      : data.playerTeam.position <= 4
                        ? 'text-pitch-400'
                        : 'text-white'
                }`}
              >
                {data.playerTeam.position}
                <span className="text-lg text-slate-400">
                  {data.playerTeam.position === 1
                    ? 'st'
                    : data.playerTeam.position === 2
                      ? 'nd'
                      : data.playerTeam.position === 3
                        ? 'rd'
                        : 'th'}
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-xs uppercase tracking-wider">
                Points
              </div>
              <div className="text-xl font-bold text-white">
                {data.playerTeam.points}
              </div>
            </div>
          </div>

          {isRelegated && (
            <div className="mt-4 text-center">
              <span className="inline-block px-3 py-1 bg-red-500/30 text-red-400 font-bold rounded">
                RELEGATED
              </span>
            </div>
          )}

          {data.playerTeam.position === 1 && (
            <div className="mt-4 text-center">
              <span className="inline-block px-3 py-1 bg-amber-500/30 text-amber-400 font-bold rounded">
                🏆 CHAMPION 🏆
              </span>
            </div>
          )}
        </div>

        {/* Relegated Teams */}
        {data.relegatedTeams.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
              Relegated Teams
            </h3>
            <div className="flex flex-wrap gap-2">
              {data.relegatedTeams.map((team) => (
                <span
                  key={team.id}
                  className={`px-3 py-1 rounded ${
                    team.id === data.playerTeam.id
                      ? 'bg-red-500/30 text-red-400 font-bold'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {team.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 mt-8">
          {isRelegated ? (
            <>
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-6 text-center max-w-md">
                <h3 className="text-xl font-bold text-red-400 mb-2">
                  Game Over
                </h3>
                <p className="text-slate-300 mb-4">
                  Your team has been relegated from the league. Your managerial
                  journey ends here.
                </p>
                <Link
                  to="/"
                  className="inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                >
                  Return to Menu
                </Link>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleAdvanceSeason}
                disabled={isAdvancing}
                className="px-8 py-4 bg-pitch-600 hover:bg-pitch-500 disabled:bg-slate-600 text-white font-bold text-lg rounded-lg transition-colors flex items-center gap-2"
              >
                {isAdvancing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    Processing...
                  </>
                ) : (
                  <>
                    Continue to Next Season
                    <span className="text-pitch-200">→</span>
                  </>
                )}
              </button>
              {advanceError && (
                <p className="text-red-400 text-sm">{advanceError}</p>
              )}
              <Link
                to={`/game/${saveId}`}
                className="text-slate-400 hover:text-white text-sm underline"
              >
                Back to Game
              </Link>
            </>
          )}
        </div>

        {/* Final Standings (Collapsible) */}
        <details className="mt-8 bg-slate-800 border border-slate-700 rounded-lg">
          <summary className="px-4 py-3 cursor-pointer text-white font-bold hover:bg-slate-700/50">
            View Final Standings
          </summary>
          <div className="p-4 pt-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-600">
                  <th className="text-center py-2 w-10">#</th>
                  <th className="text-left py-2">Team</th>
                  <th className="text-center py-2 w-10">P</th>
                  <th className="text-center py-2 w-10">W</th>
                  <th className="text-center py-2 w-10">D</th>
                  <th className="text-center py-2 w-10">L</th>
                  <th className="text-center py-2 w-10">GD</th>
                  <th className="text-center py-2 w-12">Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((entry) => {
                  const isPlayerTeam = entry.teamId === data.playerTeam.id;
                  const isRelegatedTeam = entry.position >= 17;

                  return (
                    <tr
                      key={entry.teamId}
                      className={`border-b border-slate-700 text-white ${
                        isPlayerTeam
                          ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500'
                          : isRelegatedTeam
                            ? 'bg-red-900/20'
                            : ''
                      }`}
                    >
                      <td className="text-center py-2 text-slate-400">
                        {entry.position}
                      </td>
                      <td className="py-2">{entry.teamName}</td>
                      <td className="text-center py-2 text-slate-300">
                        {entry.played}
                      </td>
                      <td className="text-center py-2">{entry.won}</td>
                      <td className="text-center py-2">{entry.drawn}</td>
                      <td className="text-center py-2">{entry.lost}</td>
                      <td
                        className={`text-center py-2 ${
                          entry.goalDifference > 0
                            ? 'text-green-400'
                            : entry.goalDifference < 0
                              ? 'text-red-400'
                              : ''
                        }`}
                      >
                        {entry.goalDifference > 0 ? '+' : ''}
                        {entry.goalDifference}
                      </td>
                      <td className="text-center py-2 text-pitch-400 font-bold">
                        {entry.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </main>
    </div>
  );
}
