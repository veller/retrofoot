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
  avgOverall: number;
  displayFormation: string;
}

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

  function lineupFromIds(ids: string[]): Player[] {
    return ids
      .map((id) => playersById.get(id))
      .filter((player): player is Player => Boolean(player))
      .slice(0, 11);
  }

  let lineup: Player[] = [];
  if (tactics?.lineup?.length) {
    lineup = lineupFromIds(tactics.lineup);
  } else if (players.length >= 11) {
    const selected = selectBestLineup(team, displayFormation as FormationType);
    lineup = lineupFromIds(selected.lineup);
  } else {
    lineup = players.slice(0, 11);
  }

  const avgOverall =
    lineup.length > 0
      ? Math.round(
          lineup.reduce((acc, player) => acc + calculateOverall(player), 0) /
            lineup.length,
        )
      : 0;

  return { lineup, avgOverall, displayFormation };
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
    () => homeData.lineup.slice(0, 11).map((player) => player.id),
    [homeData.lineup],
  );
  const awayLineupIds = useMemo(
    () => awayData.lineup.slice(0, 11).map((player) => player.id),
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
  const homePrimaryColor = homeTeam.primaryColor;
  const awayPrimaryColor = awayTeam.primaryColor;
  const hostPostureLabel = (
    isPlayerHome ? playerTactics.posture : 'balanced'
  ).replace('attacking', 'offensive');
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
                    style={{ color: homePrimaryColor }}
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
                <span>Host Lineup</span>
                <span className="text-white">
                  {homeData.displayFormation} ({hostPostureLabel})
                </span>
              </div>
              <div className="space-y-1">
                {homeData.lineup.slice(0, 11).map((player) => (
                  <div
                    key={`home-lineup-${player.id}`}
                    className="flex items-center justify-between rounded bg-slate-800/70 px-2 py-1 text-xs"
                  >
                    <span className="mr-2 w-8 shrink-0 text-slate-400">
                      {player.position}
                    </span>
                    <span className="flex-1 truncate text-slate-100">
                      {player.nickname || player.name}
                    </span>
                    <span className="ml-2 shrink-0 text-cyan-300">
                      {calculateOverall(player)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-700 pt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                  Previous Matches
                </p>
                <div className="flex gap-1">
                  {homeTeam.lastFiveResults?.length ? (
                    homeTeam.lastFiveResults
                      .slice(0, 5)
                      .map((result, index) => (
                        <ResultBadge key={`home-${index}`} result={result} />
                      ))
                  ) : (
                    <span className="text-xs text-slate-500">No data</span>
                  )}
                </div>
              </div>
            </aside>

            <div
              id="immersive-stadium-scene"
              className="relative min-h-[470px] immersive-stadium-enter"
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
                lineup={homeLineupIds}
                substitutes={[]}
                playersById={pitchPlayersById}
                formation={homeData.displayFormation as FormationType}
                opponentLineup={awayLineupIds}
                opponentFormation={awayData.displayFormation as FormationType}
                hideBench
                hostPinBorderColor={homePrimaryColor}
                hostPinTextColor="#ffffff"
                opponentPinBorderColor="#94a3b8"
                opponentPinTextColor="#ffffff"
                opponentPinOpacity={0.75}
                hostPinClassName="immersive-player-pop"
                opponentPinClassName="immersive-player-pop"
                offensiveMidfieldShiftX={5}
                staggerStartSeconds={baseDelay}
                staggerStepSeconds={staggerSeconds}
                rootClassName="relative z-10 h-full min-h-[470px]"
                pitchWrapperClassName="relative h-full min-h-[470px] w-full"
                pitchContainerClassName="absolute left-[2%] right-[2%] top-[14%] bottom-[10%] overflow-hidden rounded-xl border-2 border-white/80"
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
                    style={{ color: awayPrimaryColor }}
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
                <span>Opponent</span>
                <span className="text-white">{awayData.displayFormation}</span>
              </div>
              <div className="space-y-1">
                {awayData.lineup.slice(0, 11).map((player) => (
                  <div
                    key={`away-lineup-${player.id}`}
                    className="flex items-center justify-between rounded bg-slate-800/70 px-2 py-1 text-xs"
                  >
                    <span className="mr-2 w-8 shrink-0 text-slate-400">
                      {player.position}
                    </span>
                    <span className="flex-1 truncate text-slate-100">
                      {player.nickname || player.name}
                    </span>
                    <span className="ml-2 shrink-0 text-amber-300">
                      {calculateOverall(player)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-700 pt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                  Previous Matches
                </p>
                <div className="flex gap-1">
                  {awayTeam.lastFiveResults?.length ? (
                    awayTeam.lastFiveResults
                      .slice(0, 5)
                      .map((result, index) => (
                        <ResultBadge key={`away-${index}`} result={result} />
                      ))
                  ) : (
                    <span className="text-xs text-slate-500">No data</span>
                  )}
                </div>
              </div>
            </aside>
          </div>

          <div id="immersive-post-sequence-info" className="hidden" />
        </div>
      </section>
    </main>
  );
}
