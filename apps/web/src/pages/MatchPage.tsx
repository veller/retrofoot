import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  LiveMatchState,
  MatchResult,
  Tactics,
  Fixture,
} from '@retrofoot/core';
import type { MatchFixture } from '../hooks';
import {
  createMultiMatchState,
  simulateAllMatchesStep,
  matchStateToResult,
  resumeFromHalfTime,
  selectBestLineup,
  makeSubstitution,
} from '@retrofoot/core';
import { useSaveMatchData } from '../hooks';
import { PreMatchOverview } from '../components/PreMatchOverview';
import { MatchLiveView } from '../components/MatchLiveView';
import { SubstitutionPanel } from '../components/SubstitutionPanel';

type MatchPhase = 'pre_match' | 'live' | 'substitutions' | 'post_match';

// Tick interval in ms - each tick advances some seconds, 10 ticks = 1 game minute
const SECONDS_PER_TICK = 6; // 6 seconds per tick
const TICK_INTERVAL_MS = 100; // 100ms between ticks = 10 ticks per second real time
// Result: 1 game minute = ~1 second real time (10 ticks * 100ms, each tick = 6s)

function toCoreFigure(f: MatchFixture): Fixture {
  return {
    id: f.id,
    round: f.round,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    date: f.date,
    played: f.played,
    result: undefined,
  };
}

export function MatchPage() {
  const navigate = useNavigate();
  const { saveId } = useParams<{ saveId: string }>();

  // Fetch match data from API
  const { data: matchData, isLoading, error } = useSaveMatchData(saveId);

  const [phase, setPhase] = useState<MatchPhase>('pre_match');
  const [matches, setMatches] = useState<LiveMatchState[]>([]);
  const [playerMatchIndex, setPlayerMatchIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [playerTactics, setPlayerTactics] = useState<Tactics | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const intervalRef = useRef<number | null>(null);

  // Find the player's fixture and teams
  const { playerFixture, playerHomeTeam, playerAwayTeam } = useMemo(() => {
    if (!matchData) {
      return {
        playerFixture: null,
        playerHomeTeam: null,
        playerAwayTeam: null,
      };
    }

    const fixture = matchData.fixtures.find(
      (f) =>
        !f.played &&
        (f.homeTeamId === matchData.playerTeamId ||
          f.awayTeamId === matchData.playerTeamId),
    );

    if (!fixture) {
      return {
        playerFixture: null,
        playerHomeTeam: null,
        playerAwayTeam: null,
      };
    }

    const homeTeam =
      matchData.teams.find((t) => t.id === fixture.homeTeamId) ?? null;
    const awayTeam =
      matchData.teams.find((t) => t.id === fixture.awayTeamId) ?? null;

    return {
      playerFixture: fixture,
      playerHomeTeam: homeTeam,
      playerAwayTeam: awayTeam,
    };
  }, [matchData]);

  // Initialize player tactics when data loads
  useEffect(() => {
    if (matchData && !playerTactics) {
      const playerTeam = matchData.teams.find(
        (t) => t.id === matchData.playerTeamId,
      );
      if (playerTeam && playerTeam.players.length >= 11) {
        const { lineup, substitutes } = selectBestLineup(playerTeam, '4-3-3');
        setPlayerTactics({
          formation: '4-3-3',
          posture: 'balanced',
          lineup,
          substitutes,
        });
      }
    }
  }, [matchData, playerTactics]);

  // Initialize match states when confirmed
  const handleConfirmMatch = useCallback(() => {
    if (!matchData || !playerTactics) return;

    const unplayedFixtures = matchData.fixtures.filter((f) => !f.played);
    const coreFixtures = unplayedFixtures.map(toCoreFigure);

    const { matches: matchStates, playerMatchIndex: pmi } =
      createMultiMatchState({
        fixtures: coreFixtures,
        teams: matchData.teams,
        playerTeamId: matchData.playerTeamId,
        playerTactics,
      });

    setMatches(matchStates);
    setPlayerMatchIndex(pmi);
    setPhase('live');
    setCurrentMinute(0);
    setCurrentSeconds(0);
    setIsPaused(false);
  }, [matchData, playerTactics]);

  // Simulation tick - advances time by SECONDS_PER_TICK seconds
  const tick = useCallback(() => {
    setCurrentSeconds((prevSeconds) => {
      const newSeconds = prevSeconds + SECONDS_PER_TICK;

      if (newSeconds >= 60) {
        // Minute complete - advance match simulation
        setMatches((prevMatches) => {
          if (prevMatches.length === 0) return prevMatches;

          // Advance all matches by one minute
          simulateAllMatchesStep(prevMatches);

          // Update current minute from player's match
          const playerMatch = prevMatches[playerMatchIndex];
          if (playerMatch) {
            setCurrentMinute(playerMatch.state.minute);

            // Check for half-time
            if (playerMatch.state.phase === 'half_time') {
              setIsPaused(true);
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
            }

            // Check for full-time
            if (playerMatch.state.phase === 'full_time') {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }

              // Convert to results
              const matchResults = prevMatches.map(matchStateToResult);
              setResults(matchResults);
              setPhase('post_match');
            }
          }

          // Deep clone to trigger re-render (fix event visibility issue)
          return prevMatches.map((m) => ({
            ...m,
            state: {
              ...m.state,
              events: [...m.state.events],
              homeLineup: [...m.state.homeLineup],
              awayLineup: [...m.state.awayLineup],
              homeSubs: [...m.state.homeSubs],
              awaySubs: [...m.state.awaySubs],
            },
          }));
        });

        return 0; // Reset seconds
      }

      return newSeconds;
    });
  }, [playerMatchIndex]);

  // Start/stop simulation
  useEffect(() => {
    if (phase === 'live' && !isPaused) {
      intervalRef.current = window.setInterval(tick, TICK_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, isPaused, tick]);

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    // If at half-time, resume all matches from half-time
    const playerMatch = matches[playerMatchIndex];
    if (playerMatch && playerMatch.state.phase === 'half_time') {
      setMatches((prev) => {
        prev.forEach((m) => resumeFromHalfTime(m.state));
        // Deep clone
        return prev.map((m) => ({
          ...m,
          state: { ...m.state, events: [...m.state.events] },
        }));
      });
    }
    setCurrentSeconds(0);
    setIsPaused(false);
  };

  const handleOpenSubstitutions = () => {
    setPhase('substitutions');
  };

  const handleCloseSubstitutions = () => {
    setPhase('live');
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleSubstitute = useCallback(
    (playerOutId: string, playerInId: string) => {
      setMatches((prev) => {
        if (playerMatchIndex < 0 || !prev[playerMatchIndex]) return prev;

        const match = prev[playerMatchIndex];
        const isHome = match.homeTeam.id === matchData?.playerTeamId;
        const team = isHome ? 'home' : 'away';

        makeSubstitution(match.state, team, playerOutId, playerInId);

        // Deep clone to trigger re-render
        return prev.map((m, i) => {
          if (i === playerMatchIndex) {
            return {
              ...m,
              state: {
                ...m.state,
                homeLineup: [...m.state.homeLineup],
                awayLineup: [...m.state.awayLineup],
                homeSubs: [...m.state.homeSubs],
                awaySubs: [...m.state.awaySubs],
                events: [...m.state.events],
              },
            };
          }
          return m;
        });
      });
    },
    [playerMatchIndex, matchData?.playerTeamId],
  );

  const handleFinish = useCallback(async () => {
    if (!saveId || results.length === 0) return;

    setIsSaving(true);

    try {
      // Send results to API
      const response = await fetch(`/api/match/${saveId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          results: results.map((r) => ({
            fixtureId: r.id,
            homeScore: r.homeScore,
            awayScore: r.awayScore,
            attendance: r.attendance,
            events: r.events.map((e) => ({
              minute: e.minute,
              type: e.type,
              team: e.team,
              playerId: e.playerId,
              playerName: e.playerName,
              description: e.description,
            })),
          })),
        }),
      });

      if (!response.ok) {
        console.error('Failed to save match results');
      }
    } catch (err) {
      console.error('Error saving match results:', err);
    } finally {
      setIsSaving(false);
    }

    // Navigate back to game page using saveId
    navigate(`/game/${saveId}`);
  }, [results, saveId, navigate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Loading match data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="text-pitch-400 hover:text-pitch-300 underline"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Guard: No fixture available
  if (
    !matchData ||
    !playerFixture ||
    !playerHomeTeam ||
    !playerAwayTeam ||
    !playerTactics
  ) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No upcoming match available.</p>
          <button
            onClick={handleBack}
            className="text-pitch-400 hover:text-pitch-300 underline"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Pre-match phase
  if (phase === 'pre_match') {
    return (
      <PreMatchOverview
        fixture={toCoreFigure(playerFixture)}
        homeTeam={playerHomeTeam}
        awayTeam={playerAwayTeam}
        playerTeamId={matchData.playerTeamId}
        playerTactics={playerTactics}
        onConfirm={handleConfirmMatch}
        onBack={handleBack}
      />
    );
  }

  // Substitutions panel
  if (phase === 'substitutions' && matches[playerMatchIndex]) {
    const playerMatch = matches[playerMatchIndex];
    const isHome = playerMatch.homeTeam.id === matchData.playerTeamId;

    return (
      <SubstitutionPanel
        matchState={playerMatch.state}
        isHome={isHome}
        onClose={handleCloseSubstitutions}
        onSubstitute={handleSubstitute}
      />
    );
  }

  // Post-match phase
  if (phase === 'post_match') {
    const playerResult = results.find(
      (r) =>
        r.homeTeamId === matchData.playerTeamId ||
        r.awayTeamId === matchData.playerTeamId,
    );

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-lg w-full text-center">
          <h1 className="font-pixel text-lg text-pitch-400 mb-4">FULL TIME</h1>

          {playerResult && (
            <div className="mb-6">
              <div className="text-white text-3xl font-bold mb-2">
                {playerHomeTeam.name} {playerResult.homeScore} -{' '}
                {playerResult.awayScore} {playerAwayTeam.name}
              </div>
              <p className="text-slate-400">
                Attendance: {playerResult.attendance.toLocaleString()}
              </p>
            </div>
          )}

          {/* Goals Summary */}
          {playerResult &&
            playerResult.events.filter((e) => e.type === 'goal').length > 0 && (
              <div className="mb-6 text-left">
                <h3 className="text-slate-400 text-sm uppercase mb-2">Goals</h3>
                <div className="space-y-1">
                  {playerResult.events
                    .filter((e) => e.type === 'goal')
                    .map((e, i) => (
                      <div key={i} className="text-white text-sm">
                        <span className="text-slate-400">{e.minute}'</span>{' '}
                        <span className="text-yellow-400">⚽</span>{' '}
                        {e.playerName}{' '}
                        <span className="text-slate-500">
                          (
                          {e.team === 'home'
                            ? playerHomeTeam.shortName
                            : playerAwayTeam.shortName}
                          )
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

          <button
            onClick={handleFinish}
            disabled={isSaving}
            className="px-8 py-3 bg-pitch-600 hover:bg-pitch-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // Live match phase
  const playerMatchPhase =
    matches[playerMatchIndex]?.state.phase || 'first_half';

  return (
    <MatchLiveView
      matches={matches}
      playerMatchIndex={playerMatchIndex}
      currentMinute={currentMinute}
      currentSeconds={currentSeconds}
      phase={playerMatchPhase}
      isPaused={isPaused}
      onPause={handlePause}
      onResume={handleResume}
      onSubstitutions={handleOpenSubstitutions}
      round={matchData.currentRound}
    />
  );
}
