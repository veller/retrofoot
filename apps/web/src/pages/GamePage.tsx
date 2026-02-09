import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  calculateOverall,
  selectBestLineup,
  FORMATION_OPTIONS,
  DEFAULT_FORMATION,
  evaluateFormationEligibility,
  getEligibleFormations,
  getRequiredPositionForSlot,
  normalizeFormation,
  calculateRoundSponsorship,
  calculateStadiumMaintenance,
  calculateOperatingCosts,
  formatCurrency,
  calculateFormTrend,
  type FormationType,
  type TacticalPosture,
  type Position,
  type Team,
  type StandingEntry,
  type Tactics,
  type Player,
} from '@retrofoot/core';
import { PitchView } from '../components/PitchView';
import { PlayerActionModal } from '../components/PlayerActionModal';
import { PositionBadge } from '../components/PositionBadge';
import { TransferMarketPanel } from '../components/TransferMarket';
import {
  useSaveData,
  useSaveMatchData,
  useTransactions,
  useLeaderboards,
  useTeamListings,
  useTeamOffers,
  useSeasonHistory,
  fetchTeamTactics,
  saveTeamTactics,
  listPlayerForSale,
  removePlayerListing,
  type LeaderboardEntry,
  type SeasonHistoryEntry,
} from '../hooks';
import { useGameStore } from '../stores/gameStore';

type GameTab = 'squad' | 'table' | 'transfers' | 'finances' | 'history';
type MobileSquadView = 'squad' | 'pitch' | 'info';

const BENCH_LIMIT = 7;

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
  return POSITION_ORDER[position];
}

function getGoalDifferenceStyle(gd: number): string {
  if (gd > 0) return 'text-green-400';
  if (gd < 0) return 'text-red-400';
  return '';
}

function formatGoalDifference(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

export function GamePage() {
  const { saveId } = useParams<{ saveId: string }>();
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    error,
    refetch: refetchSaveData,
  } = useSaveData(saveId);

  const [activeTab, setActiveTab] = useState<GameTab>('squad');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Local tactics state - initialized when data loads
  const [tactics, setTactics] = useState<Tactics | null>(null);
  const [isTacticsHydrated, setIsTacticsHydrated] = useState(false);

  // Game store for match functionality
  const gameStoreTeams = useGameStore((s) => s.teams);
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

  // Fetch offers for badge notification
  const { incoming: incomingOffers } = useTeamOffers(saveId, playerTeam?.id);
  const pendingIncomingOffers = useMemo(
    () => incomingOffers?.filter((o) => o.status === 'pending').length || 0,
    [incomingOffers],
  );

  // Fetch match data from database for upcoming fixture
  const { data: matchData } = useSaveMatchData(saveId);

  // Compute upcoming match from database match data
  const upcomingMatch = useMemo(() => {
    if (!matchData) return null;

    // Find unplayed fixture for player's team
    const playerFixture = matchData.fixtures.find(
      (f) =>
        !f.played &&
        (f.homeTeamId === matchData.playerTeamId ||
          f.awayTeamId === matchData.playerTeamId),
    );

    if (!playerFixture) return null;

    const isHome = playerFixture.homeTeamId === matchData.playerTeamId;
    const opponentId = isHome
      ? playerFixture.awayTeamId
      : playerFixture.homeTeamId;
    const opponent = matchData.teams.find((t) => t.id === opponentId);

    return { fixture: playerFixture, opponent, isHome };
  }, [matchData]);

  const handlePlayMatch = () => {
    // Sync tactics to game store before navigating
    if (tactics) {
      setStoreTactics(tactics);
    }
    navigate(`/game/${saveId}/match`);
  };

  // Initialize tactics from persisted API state.
  useEffect(() => {
    let cancelled = false;

    async function hydrateTactics() {
      if (!saveId || !playerTeam) return;
      setIsTacticsHydrated(false);

      try {
        const persisted = await fetchTeamTactics(saveId, playerTeam.id);
        const eligibleFormations = getEligibleFormations(playerTeam);
        const fallbackFormation = eligibleFormations[0] ?? DEFAULT_FORMATION;

        if (!persisted) {
          const fallbackLineup = selectBestLineup(
            playerTeam,
            fallbackFormation,
          );
          const defaults: Tactics = {
            formation: fallbackFormation,
            posture: 'balanced',
            lineup: fallbackLineup.lineup,
            substitutes: fallbackLineup.substitutes,
          };
          if (!cancelled) {
            setTactics(defaults);
            setStoreTactics(defaults);
            setIsTacticsHydrated(true);
          }
          await saveTeamTactics(saveId, playerTeam.id, defaults);
          return;
        }

        const normalizedFormation = normalizeFormation(persisted.formation);
        const formationEligibility = evaluateFormationEligibility(
          normalizedFormation,
          playerTeam.players,
        );
        const selectedFormation = formationEligibility.eligible
          ? normalizedFormation
          : fallbackFormation;
        const playerIds = new Set(
          playerTeam.players.map((player) => player.id),
        );
        const lineup = persisted.lineup.filter((id) => playerIds.has(id));
        const substitutes = persisted.substitutes.filter((id) =>
          playerIds.has(id),
        );
        const rebuilt = selectBestLineup(playerTeam, selectedFormation);
        const hydrated: Tactics = {
          formation: selectedFormation,
          posture: persisted.posture,
          lineup: lineup.length >= 11 ? lineup : rebuilt.lineup,
          substitutes:
            substitutes.length > 0 ? substitutes : rebuilt.substitutes,
        };
        if (!cancelled) {
          setTactics(hydrated);
          setStoreTactics(hydrated);
          setIsTacticsHydrated(true);
        }
      } catch (err) {
        const fallbackLineup = selectBestLineup(playerTeam, DEFAULT_FORMATION);
        const fallback: Tactics = {
          formation: DEFAULT_FORMATION,
          posture: 'balanced',
          lineup: fallbackLineup.lineup,
          substitutes: fallbackLineup.substitutes,
        };
        if (!cancelled) {
          console.error('Failed to hydrate tactics:', err);
          setTactics(fallback);
          setStoreTactics(fallback);
          setIsTacticsHydrated(true);
        }
      }
    }

    void hydrateTactics();
    return () => {
      cancelled = true;
    };
  }, [saveId, playerTeam, setStoreTactics]);

  // Sync tactics to game store when local tactics change
  // We only sync when tactics is non-null (after initialization)
  useEffect(() => {
    if (tactics) {
      setStoreTactics(tactics);
    }
  }, [tactics, setStoreTactics]);

  useEffect(() => {
    if (!saveId || !playerTeam || !tactics || !isTacticsHydrated) return;

    const timeoutId = window.setTimeout(() => {
      void saveTeamTactics(saveId, playerTeam.id, tactics).catch((err) => {
        console.error('Failed to persist tactics:', err);
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveId, playerTeam, tactics, isTacticsHydrated]);

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

        {/* Desktop header items */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500">Club:</span>{' '}
            <span className="text-white font-medium">{playerTeam.name}</span>
          </div>
          <div title="Cash available for player transfers">
            <span className="text-slate-500">Transfers:</span>{' '}
            <span className="text-pitch-400 font-medium">
              {formatCurrency(playerTeam.budget)}
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
          {!upcomingMatch && data.currentRound >= 38 && (
            <button
              onClick={() => navigate(`/game/${saveId}/season-summary`)}
              className="ml-4 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors"
            >
              View Season Summary
            </button>
          )}
        </div>

        {/* Mobile header items */}
        <div className="flex md:hidden items-center gap-3">
          {upcomingMatch && (
            <button
              onClick={handlePlayMatch}
              className="px-3 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-bold rounded-lg transition-colors text-sm"
            >
              Play
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-slate-400 hover:text-white"
            aria-label="Open menu"
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
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-slate-800 border-l border-slate-700 shadow-xl">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-white font-bold">Game Info</h2>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
                aria-label="Close menu"
              >
                <svg
                  className="w-5 h-5"
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
            <div className="p-4 space-y-4">
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <span className="text-slate-500 text-xs uppercase">Club</span>
                <p className="text-white font-medium">{playerTeam.name}</p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <span className="text-slate-500 text-xs uppercase">
                  Transfer Budget
                </span>
                <p className="text-pitch-400 font-medium">
                  {formatCurrency(playerTeam.budget)}
                </p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <span className="text-slate-500 text-xs uppercase">Season</span>
                <p className="text-white">{data.currentSeason}</p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <span className="text-slate-500 text-xs uppercase">Round</span>
                <p className="text-white">{data.currentRound}</p>
              </div>
              {upcomingMatch && (
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <span className="text-slate-500 text-xs uppercase">
                    Next Match
                  </span>
                  <p className="text-white">
                    vs {upcomingMatch.opponent?.shortName || '???'}
                    {upcomingMatch.isHome ? ' (H)' : ' (A)'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {(
            ['squad', 'table', 'transfers', 'finances', 'history'] as const
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 md:px-6 py-3 text-sm font-medium uppercase transition-colors flex-shrink-0 flex items-center gap-2 ${
                activeTab === tab
                  ? 'text-pitch-400 border-b-2 border-pitch-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
              {tab === 'transfers' && pendingIncomingOffers > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-amber-600 text-white rounded-full font-bold">
                  {pendingIncomingOffers}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 w-full">
          {activeTab === 'squad' && tactics && saveId && (
            <SquadPanel
              playerTeam={playerTeam}
              tactics={tactics}
              setTactics={setTactics}
              saveId={saveId}
            />
          )}
          {activeTab === 'table' && (
            <TablePanel
              standings={data.standings}
              playerTeamId={playerTeam.id}
              teams={matchData?.teams}
              saveId={saveId}
            />
          )}
          {activeTab === 'transfers' && saveId && (
            <TransfersPanel
              saveId={saveId}
              playerTeam={playerTeam}
              currentRound={data.currentRound}
              onTransferComplete={refetchSaveData}
            />
          )}
          {activeTab === 'finances' && (
            <FinancesPanel
              playerTeam={playerTeam}
              currentRound={data.currentRound}
              saveId={saveId}
            />
          )}
          {activeTab === 'history' && saveId && (
            <HistoryPanel saveId={saveId} playerTeamId={playerTeam.id} />
          )}
        </div>
      </main>
    </div>
  );
}

const FORM_TREND_CONFIG = {
  up: {
    className: 'bg-red-500/20 text-red-400 border-red-500/50',
    label: 'HOT',
    title: 'Form improving',
  },
  down: {
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    label: 'COLD',
    title: 'Form declining',
  },
} as const;

function FormTrendIcon({ player }: { player: Player }) {
  const trend = calculateFormTrend(player.form.lastFiveRatings);
  if (trend === 'stable') return null;

  const config = FORM_TREND_CONFIG[trend];
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${config.className}`}
      title={config.title}
    >
      {config.label}
    </span>
  );
}

function getNameSizeClass(name: string): string {
  if (name.length > 20) return 'text-[10px]';
  if (name.length > 15) return 'text-xs';
  return 'text-sm';
}

function getSquadRowStyle(inLineup: boolean, onBench: boolean): string {
  if (inLineup) return 'bg-pitch-900/30 border-l-4 border-pitch-500';
  if (onBench) return 'bg-slate-600/80 border-l-4 border-slate-500';
  return 'bg-slate-700';
}

interface SquadPanelProps {
  playerTeam: Team;
  tactics: Tactics;
  setTactics: React.Dispatch<React.SetStateAction<Tactics | null>>;
  saveId: string;
}

function SquadPanel({
  playerTeam,
  tactics,
  setTactics,
  saveId,
}: SquadPanelProps) {
  const [mobileView, setMobileView] = useState<MobileSquadView>('squad');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch team's current listings to know which players are already listed
  const { listings, refetch: refetchListings } = useTeamListings(
    saveId,
    playerTeam.id,
  );
  const listedPlayerIds = useMemo(
    () => new Set(listings.map((l) => l.playerId)),
    [listings],
  );

  const lineup = tactics.lineup;
  const substitutes = tactics.substitutes;
  const formation = tactics.formation;
  const playersById = useMemo(
    () => new Map(playerTeam.players.map((p) => [p.id, p])),
    [playerTeam.players],
  );
  const formationEligibility = useMemo(
    () =>
      FORMATION_OPTIONS.map((candidate) => ({
        formation: candidate,
        info: evaluateFormationEligibility(candidate, playerTeam.players),
      })),
    [playerTeam.players],
  );

  const setFormation = useCallback(
    (newFormation: FormationType) => {
      const eligibility = evaluateFormationEligibility(
        newFormation,
        playerTeam.players,
      );
      if (!eligibility.eligible) return;
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

  useEffect(() => {
    const current = formationEligibility.find((e) => e.formation === formation);
    if (current?.info.eligible) return;
    const nextEligible = formationEligibility.find((e) => e.info.eligible);
    if (!nextEligible) return;
    setFormation(nextEligible.formation);
  }, [formationEligibility, formation, setFormation]);

  const setPosture = useCallback(
    (posture: TacticalPosture) => {
      setTactics((prev) => (prev ? { ...prev, posture } : null));
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
          const required = getRequiredPositionForSlot(
            prev.formation,
            lineupIndex,
          );
          const replacementIndex = prev.substitutes.findIndex((candidateId) => {
            const candidate = playersById.get(candidateId);
            return !!candidate && candidate.position === required;
          });
          if (!required || replacementIndex < 0) {
            return prev;
          }

          newLineup.splice(lineupIndex, 1);
          newSubs.push(playerId);
          const [replacement] = newSubs.splice(replacementIndex, 1);
          newLineup.splice(lineupIndex, 0, replacement);
        } else {
          newSubs.push(playerId);
        }

        return { ...prev, lineup: newLineup, substitutes: newSubs };
      });
    },
    [playersById, setTactics],
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

  // Get the selected player for the modal
  const selectedPlayer = selectedPlayerId
    ? playersById.get(selectedPlayerId)
    : undefined;

  const handleListForSale = async (askingPrice?: number) => {
    if (!selectedPlayerId) return;
    setIsSubmitting(true);
    try {
      const result = await listPlayerForSale(
        saveId,
        selectedPlayerId,
        askingPrice,
      );
      if (!result.success) {
        throw new Error(result.error || 'Failed to list player');
      }
      refetchListings();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveListing = async () => {
    if (!selectedPlayerId) return;
    setIsSubmitting(true);
    try {
      const result = await removePlayerListing(saveId, selectedPlayerId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to remove listing');
      }
      refetchListings();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {/* Player Action Modal */}
      {selectedPlayer && (
        <PlayerActionModal
          player={selectedPlayer}
          isListed={listedPlayerIds.has(selectedPlayer.id)}
          isInLineup={lineupSet.has(selectedPlayer.id)}
          isOnBench={substitutesSet.has(selectedPlayer.id)}
          canAddToBench={
            !lineupSet.has(selectedPlayer.id) &&
            !substitutesSet.has(selectedPlayer.id) &&
            substitutes.length < BENCH_LIMIT
          }
          onClose={() => setSelectedPlayerId(null)}
          onListForSale={handleListForSale}
          onRemoveListing={handleRemoveListing}
          onAddToBench={() => addToBench(selectedPlayer.id)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Mobile Sub-tabs */}
      <div className="lg:hidden bg-slate-800 border-b border-slate-700 px-4 flex-shrink-0">
        <div className="flex gap-1">
          {(['squad', 'pitch', 'info'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setMobileView(view)}
              className={`px-4 py-2 text-xs font-bold uppercase transition-colors flex-shrink-0 ${
                mobileView === view
                  ? 'text-pitch-400 border-b-2 border-pitch-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Left: Squad list */}
      <div
        className={`${mobileView === 'squad' ? 'flex flex-col flex-1 min-h-0' : 'hidden'} lg:flex lg:flex-col w-full lg:w-[36%] min-w-0 lg:shrink-0 bg-slate-800 border-r border-slate-700 p-4 lg:p-6 overflow-auto`}
      >
        <h2 className="text-lg lg:text-xl font-bold text-white mb-3 lg:mb-4">
          Squad
        </h2>
        <p className="text-slate-400 text-xs lg:text-sm mb-4 lg:mb-6">
          Your squad. Manage your players, set formations, and prepare for
          matches.
        </p>
        <div className="grid gap-2">
          {sortedPlayers.map((player) => {
            const inLineup = lineupSet.has(player.id);
            const onBench = substitutesSet.has(player.id);
            const canSendToBench =
              !inLineup && !onBench && substitutes.length < BENCH_LIMIT;
            const rowStyle = getSquadRowStyle(inLineup, onBench);
            const playerDisplayName = player.nickname ?? player.name;
            const isListed = listedPlayerIds.has(player.id);

            return (
              <div
                key={player.id}
                className={`${rowStyle} group relative px-3 lg:px-4 py-2 lg:py-3 flex justify-between items-center cursor-pointer hover:bg-slate-600/50`}
                onClick={() => setSelectedPlayerId(player.id)}
                role="button"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PositionBadge position={player.position} />
                  <span
                    className={`text-white ${getNameSizeClass(playerDisplayName)} truncate`}
                  >
                    {playerDisplayName}
                  </span>
                  <span className="text-slate-400 text-xs flex-shrink-0">
                    {player.age}y
                  </span>
                  {isListed && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-600/30 text-amber-400 border border-amber-500/50 flex-shrink-0">
                      LISTED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                  {canSendToBench && (
                    <span className="hidden lg:inline text-xs font-medium bg-pitch-600 hover:bg-pitch-500 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                      Tap for actions
                    </span>
                  )}
                  {/* Form trend indicator */}
                  <FormTrendIcon player={player} />
                  <span className="text-amber-400 text-xs lg:text-sm hidden sm:inline">
                    {formatCurrency(player.wage)}
                  </span>
                  <span className="text-pitch-400 font-medium text-xs lg:text-sm">
                    OVR {calculateOverall(player)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle: Pitch + bench */}
      <div
        className={`${mobileView === 'pitch' ? 'flex flex-col flex-1 min-h-0' : 'hidden'} lg:flex lg:flex-col w-full lg:w-[38%] min-w-0 lg:shrink-0`}
      >
        <div className="bg-slate-800 p-4 lg:p-6 flex-1 min-h-0 overflow-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg lg:text-xl font-bold text-white">
              Formation
            </h2>
            <div className="w-full lg:w-auto grid grid-cols-1 sm:grid-cols-[minmax(120px,160px)_1fr] gap-2 lg:gap-3 items-stretch">
              <select
                value={formation}
                onChange={(e) => setFormation(e.target.value as FormationType)}
                className="select-chevron h-10 bg-slate-700 text-white text-sm px-3 rounded-lg border border-slate-600 font-medium"
              >
                {formationEligibility.map(({ formation: option, info }) => (
                  <option key={option} value={option} disabled={!info.eligible}>
                    {option}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                {POSTURE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setPosture(value)}
                    className={`h-10 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors border ${
                      tactics.posture === value
                        ? 'bg-pitch-600 text-white border-pitch-500'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {(() => {
            const selected = formationEligibility.find(
              (entry) => entry.formation === formation,
            );
            if (!selected || selected.info.eligible) return null;
            const missing = Object.entries(selected.info.missing).filter(
              ([, value]) => value > 0,
            );
            return (
              <p className="text-xs text-amber-400 mb-2">
                Unavailable:{' '}
                {missing
                  .map(([position]) => {
                    const key = position as Position;
                    return `need ${selected.info.required[key]}, have ${selected.info.available[key]} ${position}`;
                  })
                  .join(' · ')}
              </p>
            );
          })()}
          <PitchView
            lineup={lineup}
            substitutes={substitutes}
            playersById={playersById}
            formation={formation}
            posture={tactics.posture}
            benchLimit={BENCH_LIMIT}
          />
        </div>
      </div>

      {/* Right: Team info + Leaderboards */}
      <div
        className={`${mobileView === 'info' ? 'flex flex-col flex-1 min-h-0' : 'hidden'} lg:flex lg:flex-col w-full lg:w-[26%] lg:min-w-[200px] lg:shrink-0 p-4 gap-4 overflow-auto`}
      >
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

        {/* Top Scorers */}
        <SquadLeaderboard
          title="Top Scorers"
          players={playerTeam.players}
          statKey="goals"
        />

        {/* Top Assists */}
        <SquadLeaderboard
          title="Top Assists"
          players={playerTeam.players}
          statKey="assists"
        />
      </div>
    </div>
  );
}

// Squad leaderboard component for top scorers/assists
// Get rank badge styling based on position (1st = gold, 2nd = silver, 3rd = bronze)
function getRankBadgeStyle(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-amber-500 text-slate-900';
    case 2:
      return 'bg-slate-400 text-slate-900';
    case 3:
      return 'bg-amber-700 text-white';
    default:
      return 'bg-slate-600 text-slate-300';
  }
}

function getPlayerStat(player: Player, statKey: 'goals' | 'assists'): number {
  return statKey === 'goals'
    ? player.form.seasonGoals
    : player.form.seasonAssists;
}

function SquadLeaderboard({
  title,
  players,
  statKey,
}: {
  title: string;
  players: Player[];
  statKey: 'goals' | 'assists';
}) {
  const sortedPlayers = useMemo(() => {
    return [...players]
      .filter((p) => getPlayerStat(p, statKey) > 0)
      .sort((a, b) => getPlayerStat(b, statKey) - getPlayerStat(a, statKey))
      .slice(0, 5);
  }, [players, statKey]);

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">
        {title}
      </h3>
      {sortedPlayers.length === 0 ? (
        <p className="text-slate-500 text-xs">No stats yet</p>
      ) : (
        <div className="space-y-2">
          {sortedPlayers.map((player, index) => {
            const rank = index + 1;
            const value = getPlayerStat(player, statKey);
            const playerDisplayName = player.nickname ?? player.name;

            return (
              <div
                key={player.id}
                className="flex items-center justify-between text-sm gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold ${getRankBadgeStyle(rank)}`}
                  >
                    {rank}
                  </span>
                  <span
                    className={`text-white truncate ${getNameSizeClass(playerDisplayName)}`}
                  >
                    {playerDisplayName}
                  </span>
                </div>
                <span className="text-pitch-400 font-bold flex-shrink-0">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TablePanelProps {
  standings: StandingEntry[];
  playerTeamId: string;
  teams?: Team[];
  saveId?: string;
}

const FORM_BADGE_COLORS = {
  W: 'bg-green-600',
  D: 'bg-yellow-500',
  L: 'bg-red-600',
} as const;

function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  return (
    <span
      className={`${FORM_BADGE_COLORS[result]} text-white text-[10px] md:text-xs font-bold w-4 h-4 md:w-5 md:h-5 flex items-center justify-center rounded`}
    >
      {result}
    </span>
  );
}

function TablePanel({
  standings,
  playerTeamId,
  teams,
  saveId,
}: TablePanelProps) {
  const { data: leaderboardsData, isLoading: leaderboardsLoading } =
    useLeaderboards(saveId);

  // Create a lookup map for team form data
  const teamFormMap = useMemo(() => {
    if (!teams) return new Map<string, ('W' | 'D' | 'L')[]>();
    return new Map(teams.map((t) => [t.id, t.lastFiveResults || []]));
  }, [teams]);

  if (standings.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h2 className="text-xl font-bold text-white mb-4">League Table</h2>
        <p className="text-slate-400">No standings data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-3 md:p-4">
      <div className="bg-slate-800 border border-slate-700 p-3 md:p-6">
        <h2 className="text-lg md:text-xl font-bold text-white mb-3 md:mb-4">
          League Table
        </h2>

        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-600">
                <th className="text-center py-2 w-8 md:w-10 pl-1 md:pl-3">#</th>
                <th className="text-left py-2">Club</th>
                <th className="text-center py-2 w-7 md:w-10">P</th>
                <th className="text-center py-2 w-7 md:w-10 hidden sm:table-cell">
                  W
                </th>
                <th className="text-center py-2 w-7 md:w-10 hidden sm:table-cell">
                  D
                </th>
                <th className="text-center py-2 w-7 md:w-10 hidden sm:table-cell">
                  L
                </th>
                <th className="text-center py-2 w-7 md:w-10 hidden lg:table-cell">
                  GF
                </th>
                <th className="text-center py-2 w-7 md:w-10 hidden lg:table-cell">
                  GA
                </th>
                <th className="text-center py-2 w-8 md:w-10">GD</th>
                <th className="text-center py-2 w-8 md:w-12 font-bold">Pts</th>
                <th className="text-center py-2 w-28 hidden md:table-cell">
                  Form
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((entry) => {
                const isPlayerTeam = entry.teamId === playerTeamId;
                const teamForm = teamFormMap.get(entry.teamId) || [];
                const goalDifference = entry.goalsFor - entry.goalsAgainst;

                return (
                  <tr
                    key={entry.teamId}
                    className={`border-b border-slate-700 text-white ${
                      isPlayerTeam
                        ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500'
                        : ''
                    }`}
                  >
                    <td className="text-center py-2 pl-1 md:pl-3 text-slate-400">
                      {entry.position}
                    </td>
                    <td className="py-2">
                      <span className="block max-w-[140px] sm:max-w-none">
                        {entry.teamName}
                      </span>
                    </td>
                    <td className="text-center py-2 text-slate-300">
                      {entry.played}
                    </td>
                    <td className="text-center py-2 hidden sm:table-cell">
                      {entry.won}
                    </td>
                    <td className="text-center py-2 hidden sm:table-cell">
                      {entry.drawn}
                    </td>
                    <td className="text-center py-2 hidden sm:table-cell">
                      {entry.lost}
                    </td>
                    <td className="text-center py-2 hidden lg:table-cell">
                      {entry.goalsFor}
                    </td>
                    <td className="text-center py-2 hidden lg:table-cell">
                      {entry.goalsAgainst}
                    </td>
                    <td
                      className={`text-center py-2 ${getGoalDifferenceStyle(goalDifference)}`}
                    >
                      {formatGoalDifference(goalDifference)}
                    </td>
                    <td className="text-center py-2 text-pitch-400 font-bold">
                      {entry.points}
                    </td>
                    <td className="py-2 hidden md:table-cell">
                      <div className="flex gap-1 justify-center">
                        {teamForm.length > 0 ? (
                          teamForm.map((r, i) => (
                            <FormBadge key={i} result={r} />
                          ))
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* League Leaderboards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <LeaderboardCard
          title="Top Scorers"
          entries={leaderboardsData?.topScorers || []}
          isLoading={leaderboardsLoading}
          emptyMessage="No goals scored yet this season"
          playerTeamId={playerTeamId}
        />
        <LeaderboardCard
          title="Top Assists"
          entries={leaderboardsData?.topAssists || []}
          isLoading={leaderboardsLoading}
          emptyMessage="No assists recorded yet this season"
          playerTeamId={playerTeamId}
        />
      </div>
    </div>
  );
}

interface LeaderboardCardProps {
  title: string;
  entries: LeaderboardEntry[];
  isLoading: boolean;
  emptyMessage: string;
  playerTeamId: string;
}

function LeaderboardCard({
  title,
  entries,
  isLoading,
  emptyMessage,
  playerTeamId,
}: LeaderboardCardProps) {
  function renderContent() {
    if (isLoading) {
      return <p className="text-slate-400 text-sm">Loading...</p>;
    }
    if (entries.length === 0) {
      return <p className="text-slate-500 text-sm">{emptyMessage}</p>;
    }
    return (
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <LeaderboardRow
            key={entry.playerId}
            entry={entry}
            rank={index + 1}
            isPlayerTeam={entry.teamId === playerTeamId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 p-4 md:p-6">
      <h3 className="text-base md:text-lg font-bold text-white mb-3 md:mb-4">
        {title}
      </h3>
      {renderContent()}
    </div>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  rank: number;
  isPlayerTeam: boolean;
}

function LeaderboardRow({ entry, rank, isPlayerTeam }: LeaderboardRowProps) {
  const rowStyle = isPlayerTeam
    ? 'bg-pitch-900/40 border-l-4 border-l-pitch-500'
    : 'bg-slate-700/50';
  const playerDisplayName = entry.playerNickname ?? entry.playerName;

  return (
    <div
      className={`flex items-center justify-between py-1.5 md:py-2 px-2 md:px-3 rounded ${rowStyle}`}
    >
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <span
          className={`w-5 h-5 md:w-6 md:h-6 flex-shrink-0 flex items-center justify-center rounded-full text-[10px] md:text-xs font-bold ${getRankBadgeStyle(rank)}`}
        >
          {rank}
        </span>
        <PositionBadge position={entry.position as Position} />
        <div className="flex flex-col min-w-0">
          <span
            className={`text-white truncate ${getNameSizeClass(playerDisplayName)}`}
          >
            {playerDisplayName}
          </span>
          <span className="text-slate-400 text-[10px] md:text-xs">
            {entry.teamShortName}
          </span>
        </div>
      </div>
      <span className="text-pitch-400 font-bold text-base md:text-lg flex-shrink-0">
        {entry.count}
      </span>
    </div>
  );
}

function TransfersPanel({
  saveId,
  playerTeam,
  currentRound,
  onTransferComplete,
}: {
  saveId: string;
  playerTeam: Team;
  currentRound: number;
  onTransferComplete?: () => void;
}) {
  return (
    <TransferMarketPanel
      saveId={saveId}
      playerTeam={playerTeam}
      currentRound={currentRound}
      onTransferComplete={onTransferComplete}
    />
  );
}

interface FinancesPanelProps {
  playerTeam: Team;
  currentRound?: number;
  saveId?: string;
}

function formatCategory(category: string): string {
  const labels: Record<string, string> = {
    match_day: 'Match Day',
    sponsorship: 'Sponsorship',
    tv_rights: 'TV Rights',
    wages: 'Player Wages',
    stadium: 'Stadium Maintenance',
    operations: 'Operating Costs',
    transfer: 'Transfer',
    player_buy: 'Player Purchase',
    player_sale: 'Player Sale',
  };
  return labels[category] || category;
}

function FinancesPanel({
  playerTeam,
  currentRound = 1,
  saveId,
}: FinancesPanelProps) {
  const { transactions, isLoading: txLoading } = useTransactions(saveId);
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  function toggleRound(round: number) {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) {
        next.delete(round);
      } else {
        next.add(round);
      }
      return next;
    });
  }
  const balance = playerTeam.balance ?? 0;
  const roundWages = playerTeam.roundWages ?? 0;
  const seasonRevenue = playerTeam.seasonRevenue ?? 0;
  const seasonExpenses = playerTeam.seasonExpenses ?? 0;
  const netResult = seasonRevenue - seasonExpenses;

  // Project end-of-season balance
  const roundsPlayed = currentRound - 1;
  const totalRounds = 38;
  const remainingRounds = totalRounds - roundsPlayed;
  const avgNetPerRound = roundsPlayed > 0 ? netResult / roundsPlayed : 0;
  const projectedEndBalance = balance + avgNetPerRound * remainingRounds;

  // Calculate estimated category breakdown based on formulas (for per-round display)
  const estSponsorshipPerRound = calculateRoundSponsorship(
    playerTeam.reputation,
  );
  const estStadiumPerRound = calculateStadiumMaintenance(playerTeam.capacity);
  const estOperationsPerRound = calculateOperatingCosts(playerTeam.reputation);

  // Helper to sum transaction amounts by category
  const sumByCategory = (
    type: 'income' | 'expenses',
    category: string,
  ): number =>
    transactions
      .flatMap((round) => round[type])
      .filter((t) => t.category === category)
      .reduce((sum, t) => sum + t.amount, 0);

  // Use actual transaction data if available, otherwise fall back to estimates
  const hasTransactionData = transactions.length > 0;

  const matchDayIncome = hasTransactionData
    ? sumByCategory('income', 'match_day')
    : 0;
  const tvRightsIncome = hasTransactionData
    ? sumByCategory('income', 'tv_rights')
    : 0;
  const sponsorshipIncome = hasTransactionData
    ? sumByCategory('income', 'sponsorship')
    : estSponsorshipPerRound * roundsPlayed;
  const wagesExpense = hasTransactionData
    ? sumByCategory('expenses', 'wages')
    : roundWages * roundsPlayed;
  const stadiumExpense = hasTransactionData
    ? sumByCategory('expenses', 'stadium')
    : estStadiumPerRound * roundsPlayed;
  const operationsExpense = hasTransactionData
    ? sumByCategory('expenses', 'operations')
    : estOperationsPerRound * roundsPlayed;

  return (
    <div className="space-y-6 p-4">
      {/* Main Balance */}
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h2 className="text-xl font-bold text-white mb-6">Club Finances</h2>

        {/* Current Balance - Large Display */}
        <div className="bg-slate-900 border border-slate-600 p-6 mb-6 text-center">
          <p className="text-slate-400 text-sm uppercase tracking-wide mb-1">
            Operating Balance
          </p>
          <p className="text-slate-500 text-xs mb-2">
            Cash for daily operations (wages, maintenance, etc.)
          </p>
          <p
            className={`text-4xl font-bold ${balance >= 0 ? 'text-pitch-400' : 'text-red-400'}`}
          >
            {formatCurrency(balance)}
          </p>
        </div>

        {/* Budget Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-700 p-4 rounded">
            <p className="text-slate-400 text-sm">Transfer Budget</p>
            <p className="text-slate-500 text-xs">For buying/selling players</p>
            <p className="text-2xl text-pitch-400 font-bold">
              {formatCurrency(playerTeam.budget)}
            </p>
          </div>
          <div className="bg-slate-700 p-4 rounded">
            <p className="text-slate-400 text-sm">Wage Bill (Per Round)</p>
            <p className="text-slate-500 text-xs">
              Paid every round to players
            </p>
            <p className="text-2xl text-amber-400 font-bold">
              {formatCurrency(roundWages)}
            </p>
          </div>
        </div>
      </div>

      {/* Season Summary */}
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Season Financial Summary
        </h3>

        <div className="space-y-4">
          {/* Income */}
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-pitch-400">▲</span>
              <span className="text-slate-300">Total Revenue</span>
            </div>
            <span className="text-pitch-400 font-bold">
              {formatCurrency(seasonRevenue)}
            </span>
          </div>

          {/* Expenses */}
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-red-400">▼</span>
              <span className="text-slate-300">Total Expenses</span>
            </div>
            <span className="text-red-400 font-bold">
              {formatCurrency(seasonExpenses)}
            </span>
          </div>

          {/* Net Result */}
          <div className="flex justify-between items-center py-2 bg-slate-700 px-3 rounded">
            <span className="text-white font-medium">Net Result</span>
            <span
              className={`font-bold ${netResult >= 0 ? 'text-pitch-400' : 'text-red-400'}`}
            >
              {netResult >= 0 ? '+' : ''}
              {formatCurrency(netResult)}
            </span>
          </div>
        </div>

        {/* Revenue Breakdown */}
        {roundsPlayed > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-bold text-slate-400 uppercase mb-3">
              Revenue Breakdown{hasTransactionData ? '' : ' (Estimated)'}
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-start py-1 text-sm">
                <div>
                  <span className="text-slate-300">Sponsorship</span>
                  <p className="text-slate-500 text-xs">
                    {formatCurrency(estSponsorshipPerRound)}/round based on
                    reputation ({playerTeam.reputation})
                  </p>
                </div>
                <span className="text-pitch-400">
                  {formatCurrency(sponsorshipIncome)}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 text-sm">
                <div>
                  <span className="text-slate-300">TV Rights</span>
                  <p className="text-slate-500 text-xs">
                    Varies by league position
                  </p>
                </div>
                <span className="text-pitch-400">
                  {formatCurrency(tvRightsIncome)}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 text-sm">
                <div>
                  <span className="text-slate-300">Match Day</span>
                  <p className="text-slate-500 text-xs">
                    Home games only: $50/ticket × attendance
                  </p>
                </div>
                <span className="text-pitch-400">
                  {formatCurrency(matchDayIncome)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Expense Breakdown */}
        {roundsPlayed > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-bold text-slate-400 uppercase mb-3">
              Expense Breakdown{hasTransactionData ? '' : ' (Estimated)'}
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-start py-1 text-sm">
                <div>
                  <span className="text-slate-300">Player Wages</span>
                  <p className="text-slate-500 text-xs">
                    {formatCurrency(roundWages)}/round for{' '}
                    {playerTeam.players.length} players
                  </p>
                </div>
                <span className="text-red-400">
                  {formatCurrency(wagesExpense)}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 text-sm">
                <div>
                  <span className="text-slate-300">Stadium Maintenance</span>
                  <p className="text-slate-500 text-xs">
                    $0.50/seat × {playerTeam.capacity.toLocaleString()} capacity
                  </p>
                </div>
                <span className="text-red-400">
                  {formatCurrency(stadiumExpense)}
                </span>
              </div>
              <div className="flex justify-between items-start py-1 text-sm">
                <div>
                  <span className="text-slate-300">Operating Costs</span>
                  <p className="text-slate-500 text-xs">
                    {formatCurrency(estOperationsPerRound)}/round based on
                    reputation
                  </p>
                </div>
                <span className="text-red-400">
                  {formatCurrency(operationsExpense)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Projection */}
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Season Projection</h3>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-slate-400 text-xs uppercase">Rounds Played</p>
            <p className="text-xl text-white font-bold">
              {roundsPlayed} / {totalRounds}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase">Avg Net/Round</p>
            <p
              className={`text-xl font-bold ${avgNetPerRound >= 0 ? 'text-pitch-400' : 'text-red-400'}`}
            >
              {avgNetPerRound >= 0 ? '+' : ''}
              {formatCurrency(Math.round(avgNetPerRound))}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase">
              Projected End Balance
            </p>
            <p
              className={`text-xl font-bold ${projectedEndBalance >= 0 ? 'text-pitch-400' : 'text-red-400'}`}
            >
              {formatCurrency(Math.round(projectedEndBalance))}
            </p>
          </div>
        </div>

        {projectedEndBalance < 0 && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
            ⚠️ Warning: At current spending rate, you may end the season in
            debt. Consider selling players or reducing wages.
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-white mb-4">
          Transaction History
        </h3>

        {txLoading && (
          <p className="text-slate-400 text-sm">Loading transactions...</p>
        )}

        {!txLoading && transactions.length === 0 && (
          <div className="text-slate-400 text-sm">
            <p>No transactions recorded yet.</p>
            {roundsPlayed > 0 && (
              <p className="text-slate-500 text-xs mt-2">
                Note: Transaction tracking was recently added. Existing games
                will start recording from the next round onwards.
              </p>
            )}
          </div>
        )}

        {!txLoading && transactions.length > 0 && (
          <div className="space-y-2">
            {transactions.map((txn) => (
              <div key={txn.round} className="border border-slate-600 rounded">
                <button
                  onClick={() => toggleRound(txn.round)}
                  className="w-full flex justify-between items-center p-3 text-left hover:bg-slate-700/50 transition-colors"
                >
                  <span className="text-white font-medium">
                    Round {txn.round}
                  </span>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-sm font-medium ${txn.net >= 0 ? 'text-pitch-400' : 'text-red-400'}`}
                    >
                      {txn.net >= 0 ? '+' : ''}
                      {formatCurrency(txn.net)}
                    </span>
                    <span className="text-slate-400 text-sm">
                      {expandedRounds.has(txn.round) ? '▼' : '▶'}
                    </span>
                  </div>
                </button>

                {expandedRounds.has(txn.round) && (
                  <div className="p-3 pt-0 border-t border-slate-600 space-y-2">
                    {/* Income items */}
                    {txn.income.map((item, i) => (
                      <div
                        key={`income-${i}`}
                        className="flex justify-between items-center text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-pitch-400">+</span>
                          <span className="text-slate-300">
                            {formatCategory(item.category)}
                          </span>
                          {item.description && (
                            <span className="text-slate-500 text-xs">
                              ({item.description})
                            </span>
                          )}
                        </div>
                        <span className="text-pitch-400">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}

                    {/* Expense items */}
                    {txn.expenses.map((item, i) => (
                      <div
                        key={`expense-${i}`}
                        className="flex justify-between items-center text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-red-400">-</span>
                          <span className="text-slate-300">
                            {formatCategory(item.category)}
                          </span>
                          {item.description && (
                            <span className="text-slate-500 text-xs">
                              ({item.description})
                            </span>
                          )}
                        </div>
                        <span className="text-red-400">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}

                    {/* Round totals */}
                    <div className="pt-2 mt-2 border-t border-slate-700 flex justify-between text-sm">
                      <span className="text-slate-400">Net this round</span>
                      <span
                        className={`font-medium ${txn.net >= 0 ? 'text-pitch-400' : 'text-red-400'}`}
                      >
                        {txn.net >= 0 ? '+' : ''}
                        {formatCurrency(txn.net)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// History Panel - Season History (Lazy Loaded)
// ============================================================================

interface HistoryPanelProps {
  saveId: string;
  playerTeamId: string;
}

function HistoryPanel({ saveId, playerTeamId }: HistoryPanelProps) {
  const { data: history, isLoading, error } = useSeasonHistory(saveId);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch-400 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <h3 className="text-lg font-bold text-white mb-2">No History Yet</h3>
          <p className="text-slate-400">
            Complete your first season to see your history here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-6">Season History</h2>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-700/50 p-4 rounded text-center">
            <p className="text-slate-400 text-xs uppercase tracking-wider">
              Seasons
            </p>
            <p className="text-2xl font-bold text-white">{history.length}</p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded text-center">
            <p className="text-slate-400 text-xs uppercase tracking-wider">
              Titles
            </p>
            <p className="text-2xl font-bold text-amber-400">
              {history.filter((h) => h.playerTeam.position === 1).length}
            </p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded text-center">
            <p className="text-slate-400 text-xs uppercase tracking-wider">
              Best Finish
            </p>
            <p className="text-2xl font-bold text-pitch-400">
              {Math.min(...history.map((h) => h.playerTeam.position))}
              <span className="text-sm text-slate-400">
                {Math.min(...history.map((h) => h.playerTeam.position)) === 1
                  ? 'st'
                  : Math.min(...history.map((h) => h.playerTeam.position)) === 2
                    ? 'nd'
                    : Math.min(...history.map((h) => h.playerTeam.position)) ===
                        3
                      ? 'rd'
                      : 'th'}
              </span>
            </p>
          </div>
          <div className="bg-slate-700/50 p-4 rounded text-center">
            <p className="text-slate-400 text-xs uppercase tracking-wider">
              Avg Position
            </p>
            <p className="text-2xl font-bold text-white">
              {(
                history.reduce((sum, h) => sum + h.playerTeam.position, 0) /
                history.length
              ).toFixed(1)}
            </p>
          </div>
        </div>

        {/* Season List */}
        <div className="space-y-3">
          {history.map((season) => (
            <SeasonHistoryCard
              key={season.seasonYear}
              season={season}
              playerTeamId={playerTeamId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SeasonHistoryCard({
  season,
}: {
  season: SeasonHistoryEntry;
  playerTeamId: string;
}) {
  const isChampion = season.playerTeam.position === 1;
  const isTopFour = season.playerTeam.position <= 4;

  return (
    <div
      className={`border rounded-lg p-4 ${
        isChampion
          ? 'bg-amber-900/20 border-amber-500/50'
          : isTopFour
            ? 'bg-pitch-900/20 border-pitch-500/50'
            : 'bg-slate-700/50 border-slate-600'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Season & Position */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-slate-400 text-xs uppercase">Season</p>
            <p className="text-lg font-bold text-white">{season.seasonYear}</p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-xs uppercase">Position</p>
            <p
              className={`text-2xl font-bold ${
                isChampion
                  ? 'text-amber-400'
                  : isTopFour
                    ? 'text-pitch-400'
                    : 'text-white'
              }`}
            >
              {season.playerTeam.position}
              <span className="text-sm text-slate-400">
                {season.playerTeam.position === 1
                  ? 'st'
                  : season.playerTeam.position === 2
                    ? 'nd'
                    : season.playerTeam.position === 3
                      ? 'rd'
                      : 'th'}
              </span>
            </p>
          </div>
          <div className="text-center">
            <p className="text-slate-400 text-xs uppercase">Points</p>
            <p className="text-lg font-bold text-white">
              {season.playerTeam.points}
            </p>
          </div>
          {isChampion && <span className="text-2xl">🏆</span>}
        </div>

        {/* Awards */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">🏆</span>
            <span className="text-slate-400">Champion:</span>
            <span className="text-white">{season.champion.teamName}</span>
          </div>
          {season.topScorer.goals > 0 && (
            <div className="flex items-center gap-2">
              <span>⚽</span>
              <span className="text-slate-400">Top Scorer:</span>
              <span className="text-white">
                {season.topScorer.playerName} ({season.topScorer.goals})
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
