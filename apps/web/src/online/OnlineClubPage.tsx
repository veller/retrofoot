import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  calculateOverall,
  evaluateFormationEligibility,
  FORMATION_OPTIONS,
  formatCurrency,
  getFormDisplayStatus,
  getRequiredPositionForSlot,
  selectBestLineup,
  selectMostReadyLineup,
  swapPlayersInTactics,
  type FormationType,
  type Player,
  type Position,
  type TacticalPosture,
  type Team,
  type Tactics,
} from '@retrofoot/core';
import { FormStatusBadge } from '@/components/FormStatusBadge';
import { PitchView, type PitchSlot } from '@/components/PitchView';
import { PositionBadge } from '@/components/PositionBadge';
import { RetrofootLogo } from '@/components/RetrofootLogo';
import { TeamShield } from '@/components/TeamShield';
import { useAuth, useIsAdmin, useTouchDrag } from '@/hooks';
import { apiFetch } from '@/lib/api';

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

function getSquadEnergyBarColor(energy: number): string {
  if (energy >= 70) return 'bg-emerald-500';
  if (energy >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function SquadEnergyDisplay({ energy }: { energy: number }) {
  const value = Math.max(0, Math.min(100, energy));
  return (
    <div
      className="flex flex-col items-end gap-0.5 flex-shrink-0 min-w-[44px]"
      title={`Energy ${Math.round(value)}%`}
    >
      <span className="text-slate-400 text-[10px] tabular-nums leading-none">
        {Math.round(value)}%
      </span>
      <div className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${getSquadEnergyBarColor(value)}`}
          style={{ width: `${value}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function FormTrendIcon({ player }: { player: Player }) {
  const status = getFormDisplayStatus(player.form.lastFiveRatings ?? []);
  if (status !== 'hot') return null;
  return <FormStatusBadge status="hot" title="Form improving" size="sm" />;
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

function slotsEqual(a: PitchSlot, b: PitchSlot): boolean {
  return a.type === b.type && a.index === b.index;
}

function parseSourceSlotFromDrop(
  e: React.DragEvent | undefined,
  fallback: PitchSlot | null,
): PitchSlot | null {
  if (!e?.dataTransfer) return fallback;
  const raw = e.dataTransfer.getData('application/json');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as PitchSlot;
    if (
      (parsed.type === 'lineup' || parsed.type === 'bench') &&
      typeof parsed.index === 'number'
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function applySwap(
  prev: Tactics,
  source: PitchSlot,
  target: PitchSlot,
): Tactics {
  if (source.type === 'lineup' && target.type === 'bench') {
    return swapPlayersInTactics(prev, source.index, target.index);
  }
  if (source.type === 'bench' && target.type === 'lineup') {
    return swapPlayersInTactics(prev, target.index, source.index);
  }
  if (source.type === 'lineup' && target.type === 'lineup') {
    const newLineup = [...prev.lineup];
    [newLineup[source.index], newLineup[target.index]] = [
      newLineup[target.index],
      newLineup[source.index],
    ];
    return { ...prev, lineup: newLineup };
  }
  if (source.type === 'bench' && target.type === 'bench') {
    const newSubs = [...prev.substitutes];
    [newSubs[source.index], newSubs[target.index]] = [
      newSubs[target.index],
      newSubs[source.index],
    ];
    return { ...prev, substitutes: newSubs };
  }
  return prev;
}

function isLeavingDragTarget(e: React.DragEvent): boolean {
  const related = e.relatedTarget as Node | null;
  return !e.currentTarget.contains(related);
}

type MobileSquadView = 'squad' | 'pitch' | 'info';

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

export function OnlineClubPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [tactics, setTactics] = useState<Tactics | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mobileView, setMobileView] = useState<MobileSquadView>('squad');
  const [draggedSlot, setDraggedSlot] = useState<PitchSlot | null>(null);
  const [dropTargetSlot, setDropTargetSlot] = useState<PitchSlot | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    async function run() {
      setLoadError(null);
      try {
        const lr = await apiFetch(`/api/online/leagues/${leagueId}`);
        if (!lr.ok) {
          if (!cancelled) setLoadError('Could not load league');
          return;
        }
        const lj = (await lr.json()) as { league: { status: string } };
        if (cancelled) return;
        if (lj.league.status === 'lobby') {
          navigate(`/online/league/${leagueId}`, { replace: true });
          return;
        }

        const [sr, tr] = await Promise.all([
          apiFetch(`/api/online/leagues/${leagueId}/me/squad`),
          apiFetch(`/api/online/leagues/${leagueId}/me/tactics`),
        ]);

        if (!sr.ok || !tr.ok) {
          if (!cancelled) {
            setLoadError(
              sr.status === 404 || tr.status === 404
                ? 'Your club is not ready yet.'
                : 'Could not load squad',
            );
          }
          return;
        }

        const sj = (await sr.json()) as { team: Team };
        const tj = (await tr.json()) as { tactics: Tactics };
        if (cancelled) return;
        setTeam(sj.team);
        setTactics(tj.tactics);
        setHydrated(true);
      } catch {
        if (!cancelled) setLoadError('Network error');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [leagueId, navigate]);

  useEffect(() => {
    if (!leagueId || !tactics || !hydrated) return;
    const t = window.setTimeout(() => {
      void apiFetch(`/api/online/leagues/${leagueId}/me/tactics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tactics),
      }).catch((err) => console.error('Online tactics save failed:', err));
    }, 300);
    return () => window.clearTimeout(t);
  }, [leagueId, tactics, hydrated]);

  const playersById = useMemo(
    () => (team ? new Map(team.players.map((p) => [p.id, p])) : null),
    [team],
  );

  const formationEligibility = useMemo(() => {
    if (!team) return [];
    return FORMATION_OPTIONS.map((candidate) => ({
      formation: candidate,
      info: evaluateFormationEligibility(candidate, team.players),
    }));
  }, [team]);

  const setFormation = useCallback(
    (newFormation: FormationType) => {
      if (!team) return;
      const eligibility = evaluateFormationEligibility(
        newFormation,
        team.players,
      );
      if (!eligibility.eligible) return;
      const { lineup: newLineup, substitutes: newSubs } = selectBestLineup(
        team,
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
    [team],
  );

  const setMostReadyLineup = useCallback(() => {
    if (!team || !tactics) return;
    const { lineup: newLineup, substitutes: newSubs } = selectMostReadyLineup(
      team,
      tactics.formation,
    );
    setTactics((prev) =>
      prev
        ? { ...prev, lineup: newLineup, substitutes: newSubs }
        : null,
    );
  }, [team, tactics]);

  useEffect(() => {
    if (!tactics || !formationEligibility.length) return;
    const current = formationEligibility.find(
      (e) => e.formation === tactics.formation,
    );
    if (current?.info.eligible) return;
    const nextEligible = formationEligibility.find((e) => e.info.eligible);
    if (!nextEligible) return;
    setFormation(nextEligible.formation);
  }, [formationEligibility, tactics, setFormation]);

  const setPosture = useCallback((posture: TacticalPosture) => {
    setTactics((prev) => (prev ? { ...prev, posture } : null));
  }, []);

  const addToBench = useCallback(
    (playerId: string) => {
      if (!team) return;
      setTactics((prev) => {
        if (!prev) return null;
        if (prev.substitutes.includes(playerId)) return prev;
        if (prev.substitutes.length >= BENCH_LIMIT) return prev;
        const player = playersById?.get(playerId);
        if (
          player?.status === 'suspended' ||
          (player?.suspensionMatchesRemaining ?? 0) > 0
        ) {
          return prev;
        }
        const lineupIndex = prev.lineup.indexOf(playerId);
        const newLineup = [...prev.lineup];
        const newSubs = [...prev.substitutes];
        if (lineupIndex >= 0) {
          const required = getRequiredPositionForSlot(
            prev.formation,
            lineupIndex,
          );
          const replacementIndex = prev.substitutes.findIndex((candidateId) => {
            const candidate = playersById?.get(candidateId);
            return !!candidate && candidate.position === required;
          });
          if (!required || replacementIndex < 0) return prev;
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
    [team, playersById],
  );

  const handleDrop = useCallback(
    (targetSlot: PitchSlot, e?: React.DragEvent) => {
      const sourceSlot = parseSourceSlotFromDrop(e, draggedSlot);
      if (!sourceSlot || !sourceSlot.type) {
        setDraggedSlot(null);
        setDropTargetSlot(null);
        return;
      }
      if (slotsEqual(sourceSlot, targetSlot)) {
        setDraggedSlot(null);
        setDropTargetSlot(null);
        return;
      }
      setTactics((prev) => {
        if (!prev) return null;
        return applySwap(prev, sourceSlot, targetSlot);
      });
      setDraggedSlot(null);
      setDropTargetSlot(null);
    },
    [draggedSlot],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedSlot(null);
    setDropTargetSlot(null);
  }, []);

  const touchDrag = useTouchDrag({
    onDragStart: setDraggedSlot,
    onDrop: (targetSlot) => handleDrop(targetSlot),
    onDragEnd: handleDragEnd,
    setDropTargetSlot,
  });

  const sortedPlayers = useMemo(() => {
    if (!team || !tactics) return [];
    const lineup = tactics.lineup;
    const substitutes = tactics.substitutes;
    const lineupSet = new Set(lineup);
    const substitutesSet = new Set(substitutes);
    const players = [...team.players];
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
  }, [team, tactics]);

  if (!leagueId) return null;

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 p-6 max-w-lg mx-auto">
        <p className="text-red-400 mb-4">{loadError}</p>
        <Link
          to={`/online/league/${leagueId}`}
          className="text-pitch-400 hover:underline"
        >
          ← Back to lobby
        </Link>
      </div>
    );
  }

  if (!team || !tactics || !playersById) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 animate-pulse">Loading squad…</p>
      </div>
    );
  }

  const lineup = tactics.lineup;
  const substitutes = tactics.substitutes;
  const formation = tactics.formation;
  const lineupSet = new Set(lineup);
  const substitutesSet = new Set(substitutes);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <RetrofootLogo />
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-white font-medium truncate text-sm sm:text-base">
            {team.name}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Link
            to={`/online/league/${leagueId}/season`}
            className="text-slate-400 hover:text-pitch-400"
          >
            Table
          </Link>
          <Link
            to={`/online/league/${leagueId}`}
            className="text-slate-400 hover:text-pitch-400"
          >
            Lobby
          </Link>
          <Link to="/online" className="text-slate-400 hover:text-pitch-400">
            Online
          </Link>
          {isAdmin && !isAdminLoading ? (
            <Link to="/admin" className="text-slate-400 hover:text-pitch-400">
              Admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-slate-400 hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="flex gap-1 overflow-x-auto">
          <span className="px-4 py-3 text-sm font-medium uppercase text-pitch-400 border-b-2 border-pitch-400">
            Squad
          </span>
          <Link
            to={`/online/league/${leagueId}/season`}
            className="px-4 py-3 text-sm font-medium uppercase text-slate-400 hover:text-white"
          >
            Table
          </Link>
          <span
            className="px-4 py-3 text-sm font-medium uppercase text-slate-600 cursor-not-allowed"
            title="Coming later"
          >
            Transfers
          </span>
        </div>
      </nav>

      <main className="flex-1 min-h-0 flex flex-col">
        <div className="lg:hidden bg-slate-800 border-b border-slate-700 px-4 flex-shrink-0">
          <div className="flex gap-1">
            {(['squad', 'pitch', 'info'] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setMobileView(view)}
                className={`px-4 py-2 text-xs font-bold uppercase flex-shrink-0 ${
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

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          <div
            className={`${mobileView === 'squad' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[36%] min-w-0 lg:shrink-0 bg-slate-800 border-r border-slate-700 p-4 lg:p-6 overflow-auto`}
          >
            <h2 className="text-lg font-bold text-white mb-2">Squad</h2>
            <p className="text-slate-400 text-xs mb-4">
              Formation, lineup and bench — same as career mode (saves when you
              change anything).
            </p>
            <div className="grid gap-2">
              {sortedPlayers.map((player) => {
                const inLineup = lineupSet.has(player.id);
                const onBench = substitutesSet.has(player.id);
                const suspensionMatches =
                  player.suspensionMatchesRemaining ?? 0;
                const isSuspended =
                  player.status === 'suspended' || suspensionMatches > 0;
                const rowStyle = getSquadRowStyle(inLineup, onBench);
                const playerDisplayName = player.nickname ?? player.name;
                const canDrag = (inLineup || onBench) && !isSuspended;
                const slot: PitchSlot = inLineup
                  ? { type: 'lineup', index: lineup.indexOf(player.id) }
                  : { type: 'bench', index: substitutes.indexOf(player.id) };
                const isDropTarget =
                  canDrag &&
                  dropTargetSlot != null &&
                  slotsEqual(dropTargetSlot, slot);
                const isDraggingThisSlot =
                  draggedSlot != null && slotsEqual(draggedSlot, slot);

                return (
                  <div
                    key={player.id}
                    data-pitch-slot={canDrag ? JSON.stringify(slot) : undefined}
                    className={`${rowStyle} px-3 py-2 ${
                      canDrag
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'cursor-default'
                    } hover:bg-slate-600/50 ${
                      isDraggingThisSlot ? 'opacity-50' : ''
                    } ${
                      isDropTarget
                        ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-800'
                        : ''
                    }`}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      if (!canDrag) return;
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify(slot),
                      );
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedSlot(slot);
                    }}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => {
                      if (!canDrag || !draggedSlot) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropTargetSlot(slot);
                    }}
                    onDragLeave={(e) => {
                      if (isLeavingDragTarget(e)) setDropTargetSlot(null);
                    }}
                    onDrop={(e) => {
                      if (!canDrag) return;
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(slot, e);
                    }}
                    onPointerDown={
                      canDrag ? touchDrag.getPointerDown(slot) : undefined
                    }
                    onPointerUp={canDrag ? touchDrag.getPointerUp() : undefined}
                    onPointerMove={
                      canDrag ? touchDrag.getPointerMove() : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex items-center gap-2 flex-1">
                        <PositionBadge position={player.position} />
                        <span
                          className={`text-white ${getNameSizeClass(playerDisplayName)} truncate`}
                        >
                          {playerDisplayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <FormTrendIcon player={player} />
                        <SquadEnergyDisplay energy={player.energy ?? 100} />
                        <span className="text-pitch-400 font-medium text-xs">
                          OVR {calculateOverall(player)}
                        </span>
                      </div>
                    </div>
                    {!inLineup && !onBench && !isSuspended && (
                      <button
                        type="button"
                        onClick={() => addToBench(player.id)}
                        disabled={substitutes.length >= BENCH_LIMIT}
                        className="mt-1 text-[10px] uppercase text-amber-400 hover:text-amber-300 disabled:opacity-40"
                      >
                        Add to bench
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={`${mobileView === 'pitch' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[38%] min-w-0 lg:shrink-0 bg-slate-800 p-4 lg:p-6 overflow-auto`}
          >
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold text-white">Formation</h2>
              <div className="w-full lg:w-auto grid grid-cols-1 sm:grid-cols-[minmax(170px,220px)_1fr] gap-2 items-stretch">
                <div className="flex flex-col gap-2">
                  <select
                    value={formation}
                    onChange={(e) =>
                      setFormation(e.target.value as FormationType)
                    }
                    className="select-chevron h-10 bg-slate-700 text-white text-sm px-3 rounded-lg border border-slate-600 font-medium"
                  >
                    {formationEligibility.map(({ formation: opt, info }) => (
                      <option key={opt} value={opt} disabled={!info.eligible}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={setMostReadyLineup}
                    className="h-9 px-3 rounded-lg text-xs font-semibold border bg-slate-700 text-pitch-200 border-slate-600 hover:bg-slate-600"
                  >
                    Most Ready XI
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {POSTURE_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPosture(value)}
                      className={`h-10 px-2 rounded-lg text-xs font-semibold border ${
                        tactics.posture === value
                          ? 'bg-pitch-600 text-white border-pitch-500'
                          : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <PitchView
              lineup={lineup}
              substitutes={substitutes}
              playersById={playersById}
              formation={formation}
              posture={tactics.posture}
              benchLimit={BENCH_LIMIT}
              draggedSlot={draggedSlot}
              dropTargetSlot={dropTargetSlot}
              onDragStart={(slot) => setDraggedSlot(slot)}
              onDragEnd={handleDragEnd}
              onDragOver={(slot) => setDropTargetSlot(slot)}
              onDragLeave={() => setDropTargetSlot(null)}
              onDrop={(targetSlot, e) => handleDrop(targetSlot, e)}
              touchDragHandlers={touchDrag}
            />
          </div>

          <div
            className={`${mobileView === 'info' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[26%] p-4 gap-4 overflow-auto`}
          >
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">
                Club
              </h3>
              <div className="mb-3 flex items-center gap-2">
                <TeamShield team={team} />
                <span className="text-white font-medium">{team.name}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Stadium</span>
                  <span className="text-white text-right">{team.stadium}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reputation</span>
                  <span className="text-white">{team.reputation}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Budget</span>
                  <span className="text-pitch-400">
                    {formatCurrency(team.budget)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Squad</span>
                  <span className="text-white">{team.players.length}</span>
                </div>
              </div>
            </div>
            <SquadLeaderboard
              title="Top scorers"
              players={team.players}
              statKey="goals"
            />
            <SquadLeaderboard
              title="Top assists"
              players={team.players}
              statKey="assists"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
