import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  calculateOverall,
  selectBestLineup,
  type FormationType,
  type TacticalPosture,
  type Position,
  type Team,
  type StandingEntry,
  type Tactics,
} from '@retrofoot/core';
import { PitchView, type PitchSlot } from '../components/PitchView';
import { PositionBadge } from '../components/PositionBadge';
import { useSaveData } from '../hooks';
import { useGameStore, useUpcomingFixture } from '../stores/gameStore';

type GameTab = 'squad' | 'table' | 'transfers' | 'finances';

const BENCH_LIMIT = 7;

const FORMATION_OPTIONS: FormationType[] = [
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '3-5-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
  '3-4-3',
];

const POSTURE_OPTIONS: { value: TacticalPosture; label: string }[] = [
  { value: 'defensive', label: 'Defensive' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'attacking', label: 'Attacking' },
];

const POSITION_ORDER: Record<Position, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  ATT: 3,
};

function getPositionOrder(position: Position): number {
  return POSITION_ORDER[position] ?? 4;
}

export function GamePage() {
  const { saveId } = useParams<{ saveId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useSaveData(saveId);

  const [activeTab, setActiveTab] = useState<GameTab>('squad');

  // Local tactics state - initialized when data loads
  const [tactics, setTactics] = useState<Tactics | null>(null);

  // Game store for match functionality
  const gameStoreTeams = useGameStore((s) => s.teams);
  const gameStoreTactics = useGameStore((s) => s.tactics);
  const initializeGame = useGameStore((s) => s.initializeGame);
  const setStoreTactics = useGameStore((s) => s.setTactics);
  const _hasHydrated = useGameStore((s) => s._hasHydrated);

  // Initialize game store if empty (for match functionality)
  useEffect(() => {
    if (_hasHydrated && gameStoreTeams.length === 0) {
      initializeGame();
    }
  }, [_hasHydrated, gameStoreTeams.length, initializeGame]);

  // Initialize tactics when team data loads
  const playerTeam = data?.playerTeam ?? null;

  // Check if there's an upcoming match using the game store
  const {
    fixture: upcomingFixture,
    homeTeam,
    awayTeam,
    isPlayerHome,
  } = useUpcomingFixture();

  const upcomingMatch = useMemo(() => {
    if (!upcomingFixture || upcomingFixture.played) return null;
    const opponent = isPlayerHome ? awayTeam : homeTeam;
    return { fixture: upcomingFixture, opponent, isHome: isPlayerHome };
  }, [upcomingFixture, homeTeam, awayTeam, isPlayerHome]);

  const handlePlayMatch = () => {
    // Sync tactics to game store before navigating
    if (tactics) {
      setStoreTactics(tactics);
    }
    navigate(`/game/${saveId}/match`);
  };

  // Initialize tactics on first load
  useEffect(() => {
    if (playerTeam && !tactics) {
      const { lineup, substitutes } = selectBestLineup(playerTeam, '4-3-3');
      setTactics({
        formation: '4-3-3',
        posture: 'balanced',
        lineup,
        substitutes,
      });
    }
  }, [playerTeam, tactics]);

  // Sync tactics to game store when they change
  useEffect(() => {
    if (tactics && gameStoreTactics !== tactics) {
      setStoreTactics(tactics);
    }
  }, [tactics, gameStoreTactics, setStoreTactics]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading game...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link
            to="/"
            className="text-pitch-400 hover:text-pitch-300 underline"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!data || !playerTeam) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Game data not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white">
            &larr; Menu
          </Link>
          <h1 className="font-pixel text-sm text-pitch-400">RETROFOOT</h1>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500">Club:</span>{' '}
            <span className="text-white font-medium">{playerTeam.name}</span>
          </div>
          <div>
            <span className="text-slate-500">Budget:</span>{' '}
            <span className="text-pitch-400 font-medium">
              R$ {playerTeam.budget.toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Season:</span>{' '}
            <span className="text-white">{data.currentSeason}</span>
          </div>
          <div>
            <span className="text-slate-500">Round:</span>{' '}
            <span className="text-white">{data.currentRound}</span>
          </div>
          {upcomingMatch && (
            <button
              onClick={handlePlayMatch}
              className="ml-4 px-4 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
            >
              <span>Play Match</span>
              <span className="text-pitch-200 text-xs">
                vs {upcomingMatch.opponent?.shortName || '???'}
                {upcomingMatch.isHome ? ' (H)' : ' (A)'}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="flex gap-1">
          {(['squad', 'table', 'transfers', 'finances'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium uppercase transition-colors ${
                activeTab === tab
                  ? 'text-pitch-400 border-b-2 border-pitch-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 w-full">
          {activeTab === 'squad' && tactics && (
            <SquadPanel
              playerTeam={playerTeam}
              tactics={tactics}
              setTactics={setTactics}
            />
          )}
          {activeTab === 'table' && <TablePanel standings={data.standings} />}
          {activeTab === 'transfers' && <TransfersPanel />}
          {activeTab === 'finances' && (
            <FinancesPanel playerTeam={playerTeam} />
          )}
        </div>
      </main>
    </div>
  );
}

interface SquadPanelProps {
  playerTeam: Team;
  tactics: Tactics;
  setTactics: React.Dispatch<React.SetStateAction<Tactics | null>>;
}

function SquadPanel({ playerTeam, tactics, setTactics }: SquadPanelProps) {
  const [selectedSlot, setSelectedSlot] = useState<PitchSlot | null>(null);

  const lineup = tactics.lineup;
  const substitutes = tactics.substitutes;
  const formation = tactics.formation;

  const setFormation = useCallback(
    (newFormation: FormationType) => {
      const { lineup: newLineup, substitutes: newSubs } = selectBestLineup(
        playerTeam,
        newFormation,
      );
      setTactics((prev) =>
        prev
          ? {
              ...prev,
              formation: newFormation,
              lineup: newLineup,
              substitutes: newSubs,
            }
          : null,
      );
    },
    [playerTeam, setTactics],
  );

  const setPosture = useCallback(
    (posture: TacticalPosture) => {
      setTactics((prev) => (prev ? { ...prev, posture } : null));
    },
    [setTactics],
  );

  const swapLineupWithBench = useCallback(
    (lineupIndex: number, benchIndex: number) => {
      setTactics((prev) => {
        if (!prev) return null;
        if (lineupIndex < 0 || lineupIndex >= prev.lineup.length) return prev;
        if (benchIndex < 0 || benchIndex >= prev.substitutes.length)
          return prev;

        const newLineup = [...prev.lineup];
        const newSubs = [...prev.substitutes];
        [newLineup[lineupIndex], newSubs[benchIndex]] = [
          newSubs[benchIndex],
          newLineup[lineupIndex],
        ];

        return { ...prev, lineup: newLineup, substitutes: newSubs };
      });
    },
    [setTactics],
  );

  const addToBench = useCallback(
    (playerId: string) => {
      setTactics((prev) => {
        if (!prev) return null;
        if (prev.substitutes.includes(playerId)) return prev;
        if (prev.substitutes.length >= BENCH_LIMIT) return prev;

        const lineupIndex = prev.lineup.indexOf(playerId);
        const newLineup = [...prev.lineup];
        const newSubs = [...prev.substitutes];

        if (lineupIndex >= 0) {
          newLineup.splice(lineupIndex, 1);
          newSubs.push(playerId);
          if (newSubs.length > 1) {
            const firstBench = newSubs.shift()!;
            newLineup.splice(lineupIndex, 0, firstBench);
          }
        } else {
          newSubs.push(playerId);
        }

        return { ...prev, lineup: newLineup, substitutes: newSubs };
      });
    },
    [setTactics],
  );

  const removeFromBench = useCallback(
    (playerId: string) => {
      setTactics((prev) => {
        if (!prev) return null;
        const newSubs = prev.substitutes.filter((id) => id !== playerId);
        return { ...prev, substitutes: newSubs };
      });
    },
    [setTactics],
  );

  const playersById = useMemo(
    () => new Map(playerTeam.players.map((p) => [p.id, p])),
    [playerTeam.players],
  );

  const lineupSet = useMemo(() => new Set(lineup), [lineup]);
  const substitutesSet = useMemo(() => new Set(substitutes), [substitutes]);

  const sortedPlayers = useMemo(() => {
    const players = [...playerTeam.players];
    function getTier(id: string): number {
      if (lineupSet.has(id)) return 0;
      if (substitutesSet.has(id)) return 1;
      return 2;
    }
    return players.sort((a, b) => {
      const aTier = getTier(a.id);
      const bTier = getTier(b.id);
      if (aTier !== bTier) return aTier - bTier;

      const aOrder = getPositionOrder(a.position);
      const bOrder = getPositionOrder(b.position);
      if (aOrder !== bOrder) return aOrder - bOrder;

      if (aTier === 0) return lineup.indexOf(a.id) - lineup.indexOf(b.id);
      if (aTier === 1)
        return substitutes.indexOf(a.id) - substitutes.indexOf(b.id);
      return calculateOverall(b) - calculateOverall(a);
    });
  }, [playerTeam.players, lineup, substitutes, lineupSet, substitutesSet]);

  const highlightPositions = useMemo((): Position[] | null => {
    if (!selectedSlot) return null;
    const playerId =
      selectedSlot.type === 'lineup'
        ? lineup[selectedSlot.index]
        : substitutes[selectedSlot.index];
    const player = playerId ? playersById.get(playerId) : undefined;
    if (!player) return null;
    return [player.position];
  }, [selectedSlot, lineup, substitutes, playersById]);

  function handlePlayerClick(slot: PitchSlot) {
    if (!selectedSlot) {
      setSelectedSlot(slot);
      return;
    }
    if (selectedSlot.type === slot.type && selectedSlot.index === slot.index) {
      setSelectedSlot(null);
      return;
    }
    if (selectedSlot.type === 'lineup' && slot.type === 'bench') {
      swapLineupWithBench(selectedSlot.index, slot.index);
    } else if (selectedSlot.type === 'bench' && slot.type === 'lineup') {
      swapLineupWithBench(slot.index, selectedSlot.index);
    }
    setSelectedSlot(null);
  }

  return (
    <div className="flex h-full">
      {/* Left: Squad list */}
      <div className="w-[36%] min-w-0 shrink-0 bg-slate-800 border-r border-slate-700 p-6 overflow-auto">
        <h2 className="text-xl font-bold text-white mb-4">Squad</h2>
        <p className="text-slate-400 text-sm mb-6">
          Your squad. Manage your players, set formations, and prepare for
          matches.
        </p>
        <div className="grid gap-2">
          {sortedPlayers.map((player) => {
            const inLineup = lineupSet.has(player.id);
            const onBench = substitutesSet.has(player.id);
            const canSendToBench =
              !inLineup && !onBench && substitutes.length < BENCH_LIMIT;

            let rowStyle = 'bg-slate-700';
            if (inLineup) {
              rowStyle = 'bg-pitch-900/30 border-l-4 border-pitch-500';
            } else if (onBench) {
              rowStyle = 'bg-slate-600/80 border-l-4 border-slate-500';
            }

            return (
              <div
                key={player.id}
                className={`${rowStyle} group relative px-4 py-3 flex justify-between items-center ${
                  canSendToBench ? 'cursor-pointer hover:bg-slate-600/50' : ''
                }`}
                onClick={() => canSendToBench && addToBench(player.id)}
                role={canSendToBench ? 'button' : undefined}
              >
                <div className="flex items-center gap-2">
                  <PositionBadge position={player.position} />
                  <span className="text-white">
                    {player.nickname ?? player.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {canSendToBench && (
                    <span className="text-xs font-medium bg-pitch-600 hover:bg-pitch-500 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                      Send to bench
                    </span>
                  )}
                  <span className="text-pitch-400 font-medium">
                    OVR {calculateOverall(player)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle: Pitch + bench */}
      <div className="w-[38%] min-w-0 shrink-0 flex flex-col">
        <div className="bg-slate-800 p-6 h-full overflow-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-white">Formation</h2>
            <div className="flex items-center gap-4 flex-wrap">
              <select
                value={formation}
                onChange={(e) => setFormation(e.target.value as FormationType)}
                className="select-chevron bg-slate-700 text-white text-sm px-3 py-1.5 rounded border border-slate-600"
              >
                {FORMATION_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm">Tactical posture</span>
                {POSTURE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPosture(value)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      tactics.posture === value
                        ? 'bg-pitch-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {selectedSlot && (
            <p className="text-xs text-yellow-400 mb-2">
              Click another player to swap
            </p>
          )}
          <PitchView
            lineup={lineup}
            substitutes={substitutes}
            playersById={playersById}
            formation={formation}
            posture={tactics.posture}
            onPlayerClick={(slot) => handlePlayerClick(slot)}
            selectedSlot={selectedSlot}
            highlightPositions={highlightPositions}
            onRemoveFromBench={removeFromBench}
            benchLimit={BENCH_LIMIT}
          />
        </div>
      </div>

      {/* Right: Team info */}
      <div className="w-[26%] min-w-[200px] shrink-0 p-4 flex flex-col">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">
            Team Info
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Stadium:</span>
              <span className="text-white">{playerTeam.stadium}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Capacity:</span>
              <span className="text-white">
                {playerTeam.capacity.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reputation:</span>
              <span className="text-white">{playerTeam.reputation}/100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Squad Size:</span>
              <span className="text-white">{playerTeam.players.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TablePanelProps {
  standings: StandingEntry[];
}

function TablePanel({ standings }: TablePanelProps) {
  if (standings.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h2 className="text-xl font-bold text-white mb-4">League Table</h2>
        <p className="text-slate-400">No standings data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">League Table</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-600">
            <th className="text-left py-2">#</th>
            <th className="text-left py-2">Team</th>
            <th className="text-center py-2">P</th>
            <th className="text-center py-2">W</th>
            <th className="text-center py-2">D</th>
            <th className="text-center py-2">L</th>
            <th className="text-center py-2">GF</th>
            <th className="text-center py-2">GA</th>
            <th className="text-center py-2">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((entry) => (
            <tr
              key={entry.teamId}
              className="border-b border-slate-700 text-white"
            >
              <td className="py-2">{entry.position}</td>
              <td className="py-2">{entry.teamName}</td>
              <td className="text-center py-2">{entry.played}</td>
              <td className="text-center py-2">{entry.won}</td>
              <td className="text-center py-2">{entry.drawn}</td>
              <td className="text-center py-2">{entry.lost}</td>
              <td className="text-center py-2">{entry.goalsFor}</td>
              <td className="text-center py-2">{entry.goalsAgainst}</td>
              <td className="text-center py-2 text-pitch-400 font-bold">
                {entry.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransfersPanel() {
  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Transfer Market</h2>
      <p className="text-slate-400">
        Search for players and make offers. The transfer window is open.
      </p>
    </div>
  );
}

interface FinancesPanelProps {
  playerTeam: Team;
}

function FinancesPanel({ playerTeam }: FinancesPanelProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Club Finances</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-700 p-4">
          <p className="text-slate-400 text-sm">Transfer Budget</p>
          <p className="text-2xl text-pitch-400 font-bold">
            R$ {playerTeam.budget.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="bg-slate-700 p-4">
          <p className="text-slate-400 text-sm">Wage Budget</p>
          <p className="text-2xl text-white font-bold">
            R$ {playerTeam.wageBudget.toLocaleString('pt-BR')}/mo
          </p>
        </div>
      </div>
    </div>
  );
}
