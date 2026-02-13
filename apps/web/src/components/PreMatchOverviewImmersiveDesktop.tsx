import { useMemo } from 'react';
import type { FormationType, Player, Team, Tactics } from '@retrofoot/core';
import { calculateOverall, selectBestLineup } from '@retrofoot/core';
import { PitchView } from './PitchView';
import { Stands } from './Stands';
import { TeamShield } from './TeamShield';

interface PreMatchOverviewImmersiveDesktopProps {
  homeTeam: Team;
  awayTeam: Team;
  isPlayerHome: boolean;
  playerTactics: Tactics;
  expectedAttendance: string;
}

interface TeamLineupData {
  lineup: Player[];
  bench: Player[];
  avgOverall: number;
  displayFormation: string;
}

const STARTING_XI_SIZE = 11;
const BENCH_SIZE = 7;

function parseExpectedAttendanceMidpoint(expectedAttendance: string): number {
  const values = expectedAttendance
    .split('-')
    .map((part) => Number.parseInt(part.replace(/[^\d]/g, ''), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const min = Math.min(values[0], values[1]);
  const max = Math.max(values[0], values[1]);
  return Math.round((min + max) / 2);
}

function resolveTeamLineup(
  team: Team,
  tactics?: Tactics,
  formation?: string,
): TeamLineupData {
  const displayFormation = formation || tactics?.formation || '4-3-3';
  const players = team.players || [];
  const playersById = new Map(players.map((player) => [player.id, player]));

  function playersFromIds(ids: string[], limit: number): Player[] {
    return ids
      .map((id) => playersById.get(id))
      .filter((player): player is Player => Boolean(player))
      .slice(0, limit);
  }

  let lineup: Player[] = [];
  let bench: Player[] = [];
  if (tactics?.lineup?.length) {
    lineup = playersFromIds(tactics.lineup, STARTING_XI_SIZE);
    if (tactics.substitutes?.length) {
      bench = playersFromIds(tactics.substitutes, BENCH_SIZE);
    }
  } else if (players.length >= 11) {
    const selected = selectBestLineup(team, displayFormation as FormationType);
    lineup = playersFromIds(selected.lineup, STARTING_XI_SIZE);
    bench = playersFromIds(selected.substitutes, BENCH_SIZE);
  } else {
    lineup = players.slice(0, STARTING_XI_SIZE);
  }

  if (bench.length === 0) {
    const lineupIds = new Set(lineup.map((player) => player.id));
    bench = players
      .filter((player) => !lineupIds.has(player.id))
      .slice(0, BENCH_SIZE);
  }

  const avgOverall =
    lineup.length > 0
      ? Math.round(
          lineup.reduce((acc, player) => acc + calculateOverall(player), 0) /
            lineup.length,
        )
      : 0;

  return { lineup, bench, avgOverall, displayFormation };
}

function ResultBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const colorByResult: Record<'W' | 'D' | 'L', string> = {
    W: 'bg-green-600',
    D: 'bg-yellow-500 text-slate-900',
    L: 'bg-red-600',
  };

  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold ${colorByResult[result]}`}
    >
      {result}
    </span>
  );
}

function LineupPlayerRow({
  player,
  ratingClassName,
}: {
  player: Player;
  ratingClassName: string;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-slate-800/70 px-2 py-1 text-xs">
      <span className="mr-2 w-8 shrink-0 text-slate-400">
        {player.position}
      </span>
      <span className="flex-1 truncate text-slate-100">
        {player.nickname || player.name}
      </span>
      <span className={`ml-2 shrink-0 ${ratingClassName}`}>
        {calculateOverall(player)}
      </span>
    </div>
  );
}

function BenchSection({
  bench,
  ratingClassName,
}: {
  bench: Player[];
  ratingClassName: string;
}) {
  return (
    <>
      <div className="mt-3 h-px bg-gradient-to-r from-transparent via-slate-600/70 to-transparent" />
      <div className="pt-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase text-slate-400">
          <span>Bench</span>
          <span className="text-slate-500">{bench.length}</span>
        </div>
        <div className="space-y-1">
          {bench.map((player) => (
            <div
              key={`bench-${player.id}`}
              className="flex items-center justify-between rounded bg-slate-800/45 px-2 py-1 text-xs"
            >
              <span className="mr-2 w-8 shrink-0 text-slate-500">
                {player.position}
              </span>
              <span className="flex-1 truncate text-slate-300">
                {player.nickname || player.name}
              </span>
              <span className={`ml-2 shrink-0 ${ratingClassName}`}>
                {calculateOverall(player)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function PreMatchOverviewImmersiveDesktop({
  homeTeam,
  awayTeam,
  isPlayerHome,
  playerTactics,
  expectedAttendance,
}: PreMatchOverviewImmersiveDesktopProps) {
  const homeData = useMemo(
    () =>
      resolveTeamLineup(
        homeTeam,
        isPlayerHome ? playerTactics : undefined,
        isPlayerHome ? playerTactics.formation : undefined,
      ),
    [homeTeam, isPlayerHome, playerTactics],
  );

  const awayData = useMemo(
    () =>
      resolveTeamLineup(
        awayTeam,
        !isPlayerHome ? playerTactics : undefined,
        !isPlayerHome ? playerTactics.formation : undefined,
      ),
    [awayTeam, isPlayerHome, playerTactics],
  );

  const homeLineupIds = useMemo(
    () => homeData.lineup.slice(0, STARTING_XI_SIZE).map((player) => player.id),
    [homeData.lineup],
  );
  const awayLineupIds = useMemo(
    () => awayData.lineup.slice(0, STARTING_XI_SIZE).map((player) => player.id),
    [awayData.lineup],
  );
  const pitchPlayersById = useMemo(() => {
    const allPlayers = [...homeTeam.players, ...awayTeam.players];
    return new Map(allPlayers.map((player) => [player.id, player] as const));
  }, [homeTeam.players, awayTeam.players]);

  const baseDelay = 1;
  const staggerSeconds = 0.1;
  const immersivePanelGradient =
    'linear-gradient(rgb(9 7 7 / 74%), rgb(27 32 53 / 90%))';
  const hostTeam = isPlayerHome ? homeTeam : awayTeam;
  const hostData = isPlayerHome ? homeData : awayData;
  const opponentData = isPlayerHome ? awayData : homeData;
  const hostLineupIds = isPlayerHome ? homeLineupIds : awayLineupIds;
  const opponentLineupIds = isPlayerHome ? awayLineupIds : homeLineupIds;
  const hostPrimaryColor = hostTeam.primaryColor;
  const playerPostureLabel = playerTactics.posture.replace(
    'attacking',
    'offensive',
  );
  const homeFormationLabel = isPlayerHome
    ? `${homeData.displayFormation} (${playerPostureLabel})`
    : homeData.displayFormation;
  const awayFormationLabel = isPlayerHome
    ? awayData.displayFormation
    : `${awayData.displayFormation} (${playerPostureLabel})`;
  const expectedAttendanceMidpoint = useMemo(
    () => parseExpectedAttendanceMidpoint(expectedAttendance),
    [expectedAttendance],
  );

  return (
    <main
      id="immersive-pre-match-desktop"
      className="hidden md:flex flex-1 min-h-0 flex-col"
    >
      <section
        id="immersive-stadium-section"
        className="flex-1 min-h-0 w-full max-w-none"
        style={{ background: immersivePanelGradient }}
      >
        <div
          id="immersive-stadium-frame"
          className="relative flex h-full w-full min-h-0 overflow-hidden"
        >
          <div
            id="immersive-scanlines-overlay"
            className="pointer-events-none absolute inset-0 scanlines opacity-25"
          />

          <div
            id="immersive-layout-grid"
            className="grid flex-1 min-h-0 grid-cols-[minmax(220px,1fr)_minmax(560px,2.2fr)_minmax(220px,1fr)] items-start gap-0"
          >
            <aside id="immersive-home-lineup-panel" className="p-3">
              <div
                id="immersive-home-team-header"
                className="mb-3 flex items-center justify-end gap-2"
              >
                <div
                  id="immersive-home-team-text"
                  className="min-w-0 text-right"
                >
                  <p
                    className="truncate text-sm font-pixel"
                    style={{ color: homeTeam.primaryColor }}
                  >
                    {homeTeam.shortName}
                  </p>
                  <p className="truncate text-sm text-white">{homeTeam.name}</p>
                </div>
                <TeamShield team={homeTeam} />
              </div>
              <div
                id="immersive-home-lineup-meta"
                className="mb-2 flex items-center justify-between text-[10px] uppercase text-slate-400"
              >
                <span>Home Lineup</span>
                <span className="text-white">{homeFormationLabel}</span>
              </div>
              <div className="space-y-1">
                {homeData.lineup.slice(0, STARTING_XI_SIZE).map((player) => (
                  <LineupPlayerRow
                    key={`home-lineup-${player.id}`}
                    player={player}
                    ratingClassName="text-cyan-300"
                  />
                ))}
              </div>
              <BenchSection
                bench={homeData.bench}
                ratingClassName="text-cyan-400/90"
              />
              {homeTeam.lastFiveResults?.length ? (
                <div className="mt-3 border-t border-slate-700 pt-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                    Previous Matches
                  </p>
                  <div className="flex gap-1">
                    {homeTeam.lastFiveResults
                      .slice(0, 5)
                      .map((result, index) => (
                        <ResultBadge key={`home-${index}`} result={result} />
                      ))}
                  </div>
                </div>
              ) : null}
            </aside>

            <div
              id="immersive-stadium-scene"
              className="relative min-h-[470px]"
            >
              <div id="immersive-stadium-bowl" className="absolute inset-0" />
              <div
                id="immersive-tv-scoreboard"
                className="absolute left-1/2 top-[7%] z-30 -translate-x-1/2 border-2 border-slate-300/70 bg-slate-950/95 px-5 py-2 shadow-[0_0_0_2px_rgba(15,23,42,0.9)]"
              >
                <div className="immersive-tv-scanline-overlay pointer-events-none absolute inset-0 opacity-30" />
                <div className="relative flex items-center gap-2 font-pixel text-sm text-pitch-300">
                  <span className="immersive-tv-zero-flicker">0</span>
                  <span className="text-slate-300">x</span>
                  <span className="immersive-tv-zero-flicker">0</span>
                </div>
              </div>

              <PitchView
                lineup={hostLineupIds}
                substitutes={[]}
                playersById={pitchPlayersById}
                formation={hostData.displayFormation as FormationType}
                opponentLineup={opponentLineupIds}
                opponentFormation={
                  opponentData.displayFormation as FormationType
                }
                posture={playerTactics.posture}
                hideBench
                hostPinBorderColor={hostPrimaryColor}
                hostPinTextColor="#ffffff"
                opponentPinBorderColor="#94a3b8"
                opponentPinTextColor="#ffffff"
                opponentPinOpacity={0}
                hostPinClassName="immersive-player-pop"
                opponentPinClassName="immersive-player-pop"
                offensiveMidfieldShiftX={5}
                staggerStartSeconds={baseDelay}
                staggerStepSeconds={staggerSeconds}
                rootClassName="relative z-10 h-full min-h-[470px]"
                pitchWrapperClassName="relative h-full min-h-[470px] w-full"
                pitchContainerClassName="absolute left-[2%] right-[2%] top-[14%] bottom-[10%] overflow-hidden rounded-xl border-2 border-white/80 immersive-pitch-enter"
                pitchStyle={{ aspectRatio: 'auto' }}
              />
              <Stands
                capacity={homeTeam.capacity}
                expectedAttendance={expectedAttendanceMidpoint}
                expectedAttendanceText={expectedAttendance}
                stadiumName={homeTeam.stadium}
                homePrimaryColor={homeTeam.primaryColor}
                awayPrimaryColor={awayTeam.primaryColor}
                homeFanRatio={0.9}
                awayFanRatio={0.1}
                rows={3}
                cols={20}
                homeLastFiveResults={homeTeam.lastFiveResults}
                homeFormation={homeData.displayFormation}
                homeLineup={homeData.lineup}
              />
            </div>

            <aside id="immersive-away-lineup-panel" className="p-3">
              <div
                id="immersive-opponent-team-header"
                className="mb-3 flex items-center justify-start gap-2"
              >
                <TeamShield team={awayTeam} />
                <div
                  id="immersive-opponent-team-text"
                  className="min-w-0 text-left"
                >
                  <p
                    className="truncate text-sm font-pixel"
                    style={{ color: awayTeam.primaryColor }}
                  >
                    {awayTeam.shortName}
                  </p>
                  <p className="truncate text-sm text-white">{awayTeam.name}</p>
                </div>
              </div>
              <div
                id="immersive-opponent-lineup-meta"
                className="mb-2 flex items-center justify-between text-[10px] uppercase text-slate-400"
              >
                <span>Away</span>
                <span className="text-white">{awayFormationLabel}</span>
              </div>
              <div className="space-y-1">
                {awayData.lineup.slice(0, STARTING_XI_SIZE).map((player) => (
                  <LineupPlayerRow
                    key={`away-lineup-${player.id}`}
                    player={player}
                    ratingClassName="text-amber-300"
                  />
                ))}
              </div>
              <BenchSection
                bench={awayData.bench}
                ratingClassName="text-amber-300/90"
              />
              {awayTeam.lastFiveResults?.length ? (
                <div className="mt-3 border-t border-slate-700 pt-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                    Previous Matches
                  </p>
                  <div className="flex gap-1">
                    {awayTeam.lastFiveResults
                      .slice(0, 5)
                      .map((result, index) => (
                        <ResultBadge key={`away-${index}`} result={result} />
                      ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>

          <div id="immersive-post-sequence-info" className="hidden" />
        </div>
      </section>
    </main>
  );
}
