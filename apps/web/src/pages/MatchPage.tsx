import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  LiveMatchState,
  MatchResult,
  Tactics,
  Fixture,
  MatchEvent,
} from '@retrofoot/core';
import type { MatchFixture } from '../hooks';
import {
  createMultiMatchState,
  simulateAllMatchesStep,
  matchStateToResult,
  resumeFromHalfTime,
  selectBestLineup,
  makeSubstitution,
  formatCurrency,
  BASE_TICKET_PRICE,
  evaluateFormationEligibility,
} from '@retrofoot/core';
import { apiFetch } from '../lib/api';
import { useSaveMatchData, fetchTeamTactics, saveTeamTactics } from '../hooks';
import { PreMatchOverview } from '../components/PreMatchOverview';
import { MatchLiveView } from '../components/MatchLiveView';
import { SubstitutionPanel } from '../components/SubstitutionPanel';
import { useGameStore } from '../stores/gameStore';

type MatchPhase = 'pre_match' | 'live' | 'substitutions' | 'post_match';

// Event types that should be persisted to the database
const PERSISTENT_EVENT_TYPES = new Set([
  'goal',
  'own_goal',
  'penalty_scored',
  'penalty_missed',
  'yellow_card',
  'red_card',
  'substitution',
  'injury',
]);

// Tick interval - each tick advances some seconds, 10 ticks = 1 game minute
const SECONDS_PER_TICK = 6; // 6 seconds per tick
// Driver runs every DRIVER_INTERVAL_MS; we run N ticks based on elapsed real time so speed is
// consistent even when the timer is delayed (e.g. production or background tab).
const DRIVER_INTERVAL_MS = 50;
const MAX_CATCHUP_TICKS = 15; // Cap catch-up so we don't freeze after long background

/**
 * Compute lineupPlayerIds and substitutionMinutes for the API from match state.
 * Used to update player form/ratings after a match.
 */
function computeLineupForResult(
  match: LiveMatchState,
  playerTeamId: string,
): { lineupPlayerIds: string[]; substitutionMinutes: Record<string, number> } {
  const isHome = match.homeTeam.id === playerTeamId;
  const team: 'home' | 'away' = isHome ? 'home' : 'away';
  const lineup =
    team === 'home' ? match.state.homeLineup : match.state.awayLineup;

  // Final lineup (player IDs at full time)
  const finalLineupIds = lineup.map((p) => p.id);

  // Substitution events for this team
  const subs = match.state.events.filter(
    (e): e is MatchEvent & { playerId: string; assistPlayerId: string } =>
      e.type === 'substitution' &&
      e.team === team &&
      !!e.playerId &&
      !!e.assistPlayerId,
  );

  // Reconstruct initial lineup by undoing subs in reverse order
  let initialLineupIds = [...finalLineupIds];
  for (let i = subs.length - 1; i >= 0; i--) {
    const s = subs[i];
    const idx = initialLineupIds.indexOf(s.playerId);
    if (idx !== -1) {
      initialLineupIds = [
        ...initialLineupIds.slice(0, idx),
        s.assistPlayerId,
        ...initialLineupIds.slice(idx + 1),
      ];
    }
  }

  // Build substitutionMinutes: starter subbed off -> minute; sub who came on -> minute
  const substitutionMinutes: Record<string, number> = {};
  for (const s of subs) {
    substitutionMinutes[s.assistPlayerId] = s.minute; // starter came off
    substitutionMinutes[s.playerId] = s.minute; // sub came on
  }

  return {
    lineupPlayerIds: initialLineupIds,
    substitutionMinutes,
  };
}

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
    case 'injury':
      return <span className="text-red-400">🏥</span>;
    case 'substitution':
      return <span className="text-blue-400">🔄</span>;
    default:
      return null;
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

interface MatchEventsSummaryProps {
  events: MatchEvent[];
  homeTeamShortName: string;
  awayTeamShortName: string;
}

function MatchEventsSummary({
  events,
  homeTeamShortName,
  awayTeamShortName,
}: MatchEventsSummaryProps) {
  // Filter to significant events only
  const significantTypes = [
    'goal',
    'own_goal',
    'penalty_scored',
    'penalty_missed',
    'yellow_card',
    'red_card',
    'injury',
    'substitution',
  ];

  const significantEvents = events.filter((e) =>
    significantTypes.includes(e.type),
  );

  if (significantEvents.length === 0) {
    return null;
  }

  // Group events by category
  const goals = significantEvents.filter((e) =>
    ['goal', 'own_goal', 'penalty_scored', 'penalty_missed'].includes(e.type),
  );
  const cards = significantEvents.filter((e) =>
    ['yellow_card', 'red_card'].includes(e.type),
  );
  const other = significantEvents.filter((e) =>
    ['injury', 'substitution'].includes(e.type),
  );

  return (
    <div className="mb-6 text-left space-y-4">
      {/* Goals */}
      {goals.length > 0 && (
        <div>
          <h3 className="text-slate-400 text-sm uppercase mb-2">Goals</h3>
          <div className="space-y-1">
            {goals.map((e, i) => (
              <div
                key={i}
                className="text-white text-sm flex items-center gap-2"
              >
                <span className="text-slate-400 w-8">{e.minute}'</span>
                <EventIcon type={e.type} />
                <span className="flex-1">
                  {e.playerName}
                  {e.type === 'own_goal' && (
                    <span className="text-red-400 text-xs ml-1">(OG)</span>
                  )}
                  {e.type === 'penalty_scored' && (
                    <span className="text-green-400 text-xs ml-1">(P)</span>
                  )}
                  {e.type === 'penalty_missed' && (
                    <span className="text-red-400 text-xs ml-1">
                      (P missed)
                    </span>
                  )}
                  {e.type === 'goal' && e.assistPlayerName && (
                    <span className="text-slate-400 text-xs ml-1">
                      (ast: {e.assistPlayerName})
                    </span>
                  )}
                </span>
                <span className="text-slate-500 text-xs">
                  {e.team === 'home' ? homeTeamShortName : awayTeamShortName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards */}
      {cards.length > 0 && (
        <div>
          <h3 className="text-slate-400 text-sm uppercase mb-2">Cards</h3>
          <div className="space-y-1">
            {cards.map((e, i) => (
              <div
                key={i}
                className="text-white text-sm flex items-center gap-2"
              >
                <span className="text-slate-400 w-8">{e.minute}'</span>
                <EventIcon type={e.type} />
                <span className="flex-1">{e.playerName}</span>
                <span className="text-slate-500 text-xs">
                  {e.team === 'home' ? homeTeamShortName : awayTeamShortName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other events (injuries, substitutions) */}
      {other.length > 0 && (
        <div>
          <h3 className="text-slate-400 text-sm uppercase mb-2">Other</h3>
          <div className="space-y-1">
            {other.map((e, i) => (
              <div
                key={i}
                className="text-white text-sm flex items-center gap-2"
              >
                <span className="text-slate-400 w-8">{e.minute}'</span>
                <EventIcon type={e.type} />
                <span className="flex-1">
                  {e.playerName}
                  <span className="text-slate-400 text-xs ml-1">
                    ({getEventLabel(e.type)})
                  </span>
                </span>
                <span className="text-slate-500 text-xs">
                  {e.team === 'home' ? homeTeamShortName : awayTeamShortName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 3>(() => {
    try {
      const stored = localStorage.getItem('retrofoot/matchPlaybackSpeed');
      const n = stored ? parseInt(stored, 10) : 1;
      return n === 1 || n === 2 || n === 3 ? n : 1;
    } catch {
      return 1;
    }
  });

  // Persist playback speed to localStorage for next match
  useEffect(() => {
    try {
      localStorage.setItem(
        'retrofoot/matchPlaybackSpeed',
        String(playbackSpeed),
      );
    } catch {
      // Ignore quota/private mode errors
    }
  }, [playbackSpeed]);

  const intervalRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const pendingGameSecondsRef = useRef<number>(0);

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

  // Get tactics from game store (set by GamePage)
  const gameStoreTactics = useGameStore((s) => s.tactics);

  // Initialize player tactics when data loads - prefer gameStore tactics
  useEffect(() => {
    let cancelled = false;

    async function hydrateMatchTactics() {
      if (!matchData || playerTactics) return;
      const playerTeam = matchData.teams.find(
        (team) => team.id === matchData.playerTeamId,
      );
      if (!playerTeam || playerTeam.players.length < 11) return;
      const playerIds = new Set(playerTeam.players.map((player) => player.id));

      // First, try game store tactics.
      if (gameStoreTactics && gameStoreTactics.lineup.length >= 11) {
        const lineupValid = gameStoreTactics.lineup.every((id) =>
          playerIds.has(id),
        );
        if (lineupValid && !cancelled) {
          setPlayerTactics(gameStoreTactics);
          return;
        }
      }

      if (saveId) {
        try {
          const persisted = await fetchTeamTactics(
            saveId,
            matchData.playerTeamId,
          );
          if (persisted && persisted.lineup.length >= 11 && !cancelled) {
            setPlayerTactics(persisted);
            return;
          }
        } catch (error) {
          console.error('Failed to load persisted tactics for match:', error);
        }
      }

      // Last fallback: auto-select.
      const { lineup, substitutes } = selectBestLineup(playerTeam, '4-3-3');
      if (!cancelled) {
        setPlayerTactics({
          formation: '4-3-3',
          posture: 'balanced',
          lineup,
          substitutes,
        });
      }
    }

    void hydrateMatchTactics();
    return () => {
      cancelled = true;
    };
  }, [matchData, playerTactics, gameStoreTactics, saveId]);

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
        currentRound: matchData.currentRound ?? 1,
        totalRounds: 38,
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

              // Convert to results, with lineup data for player's match (for form/ratings)
              const matchResults = prevMatches.map((m, i) => {
                const result = matchStateToResult(m);
                if (
                  i === playerMatchIndex &&
                  matchData?.playerTeamId &&
                  (m.homeTeam.id === matchData.playerTeamId ||
                    m.awayTeam.id === matchData.playerTeamId)
                ) {
                  const { lineupPlayerIds, substitutionMinutes } =
                    computeLineupForResult(m, matchData.playerTeamId);
                  return { ...result, lineupPlayerIds, substitutionMinutes };
                }
                return result;
              });
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
  }, [playerMatchIndex, matchData?.playerTeamId]);

  // Start/stop simulation. Driver runs at a fixed rate and runs N ticks based on elapsed real time
  // so playback speed is consistent even when the timer is delayed (e.g. production or background tab).
  useEffect(() => {
    if (phase !== 'live' || isPaused) {
      return;
    }

    lastTickTimeRef.current = performance.now();
    pendingGameSecondsRef.current = 0;

    function driver(): void {
      const now = performance.now();
      const elapsed =
        lastTickTimeRef.current > 0
          ? now - lastTickTimeRef.current
          : DRIVER_INTERVAL_MS;
      lastTickTimeRef.current = now;

      pendingGameSecondsRef.current +=
        (elapsed / 1000) * 60 * playbackSpeed;
      const numTicks = Math.min(
        Math.floor(pendingGameSecondsRef.current / SECONDS_PER_TICK),
        MAX_CATCHUP_TICKS,
      );
      pendingGameSecondsRef.current -=
        numTicks * SECONDS_PER_TICK;

      for (let i = 0; i < numTicks; i++) {
        setTimeout(tick, 0);
      }
    }

    intervalRef.current = window.setInterval(
      driver,
      DRIVER_INTERVAL_MS,
    );

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, isPaused, tick, playbackSpeed]);

  const handlePause = () => {
    setIsPaused(true);
  };

  function startSecondHalf(): void {
    setMatches((prev) => {
      prev.forEach((m) => resumeFromHalfTime(m.state));
      return prev.map((m) => ({
        ...m,
        state: { ...m.state, events: [...m.state.events] },
      }));
    });
    setCurrentSeconds(0);
    setIsPaused(false);
  }

  const handleResume = () => {
    const playerMatch = matches[playerMatchIndex];
    if (playerMatch?.state.phase === 'half_time') {
      startSecondHalf();
    } else {
      setCurrentSeconds(0);
      setIsPaused(false);
    }
  };

  const handleOpenSubstitutions = () => {
    setPhase('substitutions');
  };

  const handleCloseSubstitutions = () => {
    const playerMatch = matches[playerMatchIndex];
    if (playerMatch?.state.phase === 'half_time') {
      startSecondHalf();
    }
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

  const handleApplyLiveTactics = useCallback(
    (nextTactics: Tactics) => {
      if (!matchData || !playerTactics) return;
      const playerTeam = matchData.teams.find(
        (team) => team.id === matchData.playerTeamId,
      );
      if (!playerTeam) return;

      const normalizedFormation = nextTactics.formation;
      const eligibility = evaluateFormationEligibility(
        normalizedFormation,
        playerTeam.players,
      );
      if (!eligibility.eligible) return;

      const autoSelection = selectBestLineup(playerTeam, normalizedFormation);
      const updatedTactics: Tactics = {
        ...playerTactics,
        ...nextTactics,
        formation: normalizedFormation,
        lineup: autoSelection.lineup,
        substitutes: autoSelection.substitutes,
      };

      setPlayerTactics(updatedTactics);

      setMatches((prev) => {
        if (playerMatchIndex < 0 || !prev[playerMatchIndex]) return prev;
        const updated = [...prev];
        const match = updated[playerMatchIndex];
        const isHome = match.homeTeam.id === matchData.playerTeamId;

        if (isHome) {
          match.state.homeTactics = { ...updatedTactics };
          match.state.homeLineup = updatedTactics.lineup
            .map((id) =>
              match.homeTeam.players.find((player) => player.id === id),
            )
            .filter((player) => player !== undefined);
          match.state.homeSubs = updatedTactics.substitutes
            .map((id) =>
              match.homeTeam.players.find((player) => player.id === id),
            )
            .filter((player) => player !== undefined);
        } else {
          match.state.awayTactics = { ...updatedTactics };
          match.state.awayLineup = updatedTactics.lineup
            .map((id) =>
              match.awayTeam.players.find((player) => player.id === id),
            )
            .filter((player) => player !== undefined);
          match.state.awaySubs = updatedTactics.substitutes
            .map((id) =>
              match.awayTeam.players.find((player) => player.id === id),
            )
            .filter((player) => player !== undefined);
        }

        return updated.map((item) => ({
          ...item,
          state: {
            ...item.state,
            homeLineup: [...item.state.homeLineup],
            awayLineup: [...item.state.awayLineup],
            homeSubs: [...item.state.homeSubs],
            awaySubs: [...item.state.awaySubs],
          },
        }));
      });

      if (saveId) {
        void saveTeamTactics(
          saveId,
          matchData.playerTeamId,
          updatedTactics,
        ).catch((error) => {
          console.error('Failed to persist live tactics:', error);
        });
      }
      setPhase('live');
    },
    [matchData, playerMatchIndex, playerTactics, saveId],
  );

  const handleFinish = useCallback(async () => {
    if (!saveId || results.length === 0) return;

    setIsSaving(true);

    try {
      const response = await apiFetch(`/api/match/${saveId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: results.map((r) => {
            const payload: Record<string, unknown> = {
              fixtureId: r.id,
              homeScore: r.homeScore,
              awayScore: r.awayScore,
              attendance: r.attendance,
              events: r.events
                .filter((e) => PERSISTENT_EVENT_TYPES.has(e.type))
                .map((e) => ({
                  minute: e.minute,
                  type: e.type,
                  team: e.team,
                  playerId: e.playerId,
                  playerName: e.playerName,
                  assistPlayerId: e.assistPlayerId,
                  assistPlayerName: e.assistPlayerName,
                  description: e.description,
                })),
            };
            if ('lineupPlayerIds' in r && Array.isArray(r.lineupPlayerIds)) {
              payload.lineupPlayerIds = r.lineupPlayerIds;
            }
            if (
              'substitutionMinutes' in r &&
              r.substitutionMinutes &&
              typeof r.substitutionMinutes === 'object'
            ) {
              payload.substitutionMinutes = r.substitutionMinutes;
            }
            return payload;
          }),
        }),
      });

      if (!response.ok) {
        setIsSaving(false);
        return;
      }

      const responseData = await response.json();

      // Check if season is complete - redirect to season summary
      if (responseData.seasonComplete) {
        navigate(`/game/${saveId}/season-summary`);
      } else {
        // Navigate back to game page for next round
        navigate(`/game/${saveId}`);
      }
    } catch (err) {
      console.error('Error saving match results:', err);
      setIsSaving(false);
      return; // Don't navigate on failure
    }
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
    const opponentTeam = isHome ? playerMatch.awayTeam : playerMatch.homeTeam;
    const playerTeam =
      matchData.teams.find((team) => team.id === matchData.playerTeamId) ??
      null;

    if (playerTeam && playerTactics) {
      return (
        <SubstitutionPanel
          playerTeam={playerTeam}
          opponentTeam={opponentTeam}
          currentTactics={playerTactics}
          matchState={playerMatch.state}
          isHome={isHome}
          onClose={handleCloseSubstitutions}
          onSubstitute={handleSubstitute}
          onApplyTactics={handleApplyLiveTactics}
        />
      );
    }
  }

  // Post-match phase
  if (phase === 'post_match') {
    const playerResult = results.find(
      (r) =>
        r.homeTeamId === matchData.playerTeamId ||
        r.awayTeamId === matchData.playerTeamId,
    );

    // Check if player's team was home (only home team gets match day revenue)
    const isPlayerHome = playerResult?.homeTeamId === matchData.playerTeamId;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 max-w-lg w-full text-center">
          <h1 className="font-pixel text-lg text-pitch-400 mb-4">FULL TIME</h1>

          {playerResult && (
            <div className="mb-6">
              <div className="text-white text-2xl sm:text-3xl font-bold mb-2 whitespace-nowrap">
                {playerHomeTeam.shortName} {playerResult.homeScore} -{' '}
                {playerResult.awayScore} {playerAwayTeam.shortName}
              </div>
              <div className="text-slate-400 text-sm mb-2">
                {playerHomeTeam.name} vs {playerAwayTeam.name}
              </div>
              <div className="flex justify-center gap-6 text-sm">
                <p className="text-slate-400">
                  Attendance: {playerResult.attendance.toLocaleString()}
                </p>
                {isPlayerHome && (
                  <p className="text-pitch-400">
                    Gate Revenue:{' '}
                    {formatCurrency(
                      (playerResult?.attendance ?? 0) * BASE_TICKET_PRICE,
                    )}
                  </p>
                )}
                {!isPlayerHome && (
                  <p className="text-slate-500 text-xs">
                    (Away game - no gate revenue)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Match Events Summary */}
          {playerResult && (
            <MatchEventsSummary
              events={playerResult.events}
              homeTeamShortName={playerHomeTeam.shortName}
              awayTeamShortName={playerAwayTeam.shortName}
            />
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
      playbackSpeed={playbackSpeed}
      onSpeedChange={setPlaybackSpeed}
      round={matchData.currentRound}
    />
  );
}
