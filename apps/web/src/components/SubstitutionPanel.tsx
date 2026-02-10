import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactElement,
} from 'react';
import type {
  MatchState,
  Team,
  Tactics,
  TacticalPosture,
  FormationType,
} from '@retrofoot/core';
import {
  calculateOverall,
  FORMATION_OPTIONS,
  evaluateFormationEligibility,
  getHalfTimeHintsFromState,
  type FormationEligibility,
  type HalfTimeHints,
  type FormationMatchupHintKey,
} from '@retrofoot/core';
import { PositionBadge } from './PositionBadge';
import { TeamShield } from './TeamShield';

interface SubstitutionPanelProps {
  playerTeam: Team;
  opponentTeam: Team;
  currentTactics: Tactics;
  matchState: MatchState;
  isHome: boolean;
  onClose: () => void;
  onSubstitute: (playerOutId: string, playerInId: string) => void;
  onApplyTactics: (tactics: Tactics) => void;
}

const MAX_SUBS = 5;

const SITUATION_COPY: Record<HalfTimeHints['situation'], string> = {
  losing:
    "You're behind — a more attacking approach could create more chances.",
  winning: "You're ahead — a more defensive setup could help protect the lead.",
  drawing:
    'All square — choose a posture that fits how you want to play the second half.',
};

const POSTURE_LABEL: Record<TacticalPosture, string> = {
  defensive: 'Defensive',
  balanced: 'Balanced',
  attacking: 'Attacking',
};

const POSTURE_HINT_COPY: Record<
  'increases_creation' | 'increases_prevention' | 'neutral',
  string
> = {
  increases_creation: 'Increases your chance to create opportunities',
  increases_prevention: 'Makes you harder to break down',
  neutral: 'No strong tilt either way',
};

const FORMATION_MATCHUP_COPY: Record<FormationMatchupHintKey, string> = {
  attack_favourable: 'Your formation matches up well going forward',
  attack_under_pressure: 'Consider a formation that creates more up front',
  defence_favourable: 'Your formation is solid at the back',
  defence_under_pressure: 'Consider a formation that shores up defence',
  midfield_favourable: 'Your formation matches up well in midfield',
  midfield_under_pressure: 'Consider a formation that shores up midfield',
  neutral: 'Formation matchup is even',
};

const POSTURE_OPTIONS: readonly TacticalPosture[] = [
  'defensive',
  'balanced',
  'attacking',
];

function getLineupPlayerButtonClass(
  isSelected: boolean,
  subsRemaining: number,
): string {
  if (isSelected) {
    return 'bg-pitch-600 border-2 border-pitch-400';
  }
  if (subsRemaining > 0) {
    return 'bg-slate-800 hover:bg-slate-700 border border-slate-700';
  }
  return 'bg-slate-800 border border-slate-700 opacity-50 cursor-not-allowed';
}

function getBenchPlayerButtonClass(
  hasSelectedLineupPlayer: boolean,
  subsRemaining: number,
): string {
  if (hasSelectedLineupPlayer && subsRemaining > 0) {
    return 'bg-slate-800 hover:bg-pitch-900/50 border border-slate-700 hover:border-pitch-500';
  }
  return 'bg-slate-800 border border-slate-700 opacity-50 cursor-not-allowed';
}

function formatFormationUnavailable(info: FormationEligibility): string {
  const parts: string[] = [];
  for (const [pos, count] of Object.entries(info.missing)) {
    if (count <= 0) continue;
    const key = pos as keyof typeof info.required;
    parts.push(
      `need ${info.required[key]}, have ${info.available[key]} ${pos}`,
    );
  }
  return parts.join(' · ');
}

export function SubstitutionPanel({
  playerTeam,
  opponentTeam,
  currentTactics,
  matchState,
  isHome,
  onClose,
  onSubstitute,
  onApplyTactics,
}: SubstitutionPanelProps): ReactElement {
  const [selectedLineupPlayer, setSelectedLineupPlayer] = useState<
    string | null
  >(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationType>(
    currentTactics.formation,
  );
  const [selectedPosture, setSelectedPosture] = useState<TacticalPosture>(
    currentTactics.posture,
  );

  const subsUsed = isHome ? matchState.homeSubsUsed : matchState.awaySubsUsed;
  const subsRemaining = MAX_SUBS - subsUsed;

  const lineup = isHome ? matchState.homeLineup : matchState.awayLineup;
  const bench = isHome ? matchState.homeSubs : matchState.awaySubs;
  const formationAvailability = FORMATION_OPTIONS.map((formation) => ({
    formation,
    info: evaluateFormationEligibility(formation, playerTeam.players),
  }));
  const selectedFormationInfo = formationAvailability.find(
    (item) => item.formation === selectedFormation,
  );
  const selectedFormationEligible =
    selectedFormationInfo?.info.eligible ?? false;

  const selectedTactics: Tactics = useMemo(
    () => ({
      ...currentTactics,
      formation: selectedFormation,
      posture: selectedPosture,
    }),
    [currentTactics, selectedFormation, selectedPosture],
  );

  const hints: HalfTimeHints = useMemo(
    () =>
      getHalfTimeHintsFromState(
        matchState.homeScore,
        matchState.awayScore,
        matchState.homeTactics,
        matchState.awayTactics,
        isHome,
        selectedTactics,
      ),
    [
      matchState.homeScore,
      matchState.awayScore,
      matchState.homeTactics,
      matchState.awayTactics,
      isHome,
      selectedTactics,
    ],
  );

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

  const handleDone = useCallback(() => {
    if (selectedFormationEligible) {
      onApplyTactics({
        ...currentTactics,
        formation: selectedFormation,
        posture: selectedPosture,
      });
    }
    onClose();
  }, [
    selectedFormationEligible,
    selectedFormation,
    selectedPosture,
    currentTactics,
    onApplyTactics,
    onClose,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDone();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDone]);

  const scoreLabel = isHome
    ? `${matchState.homeScore} – ${matchState.awayScore}`
    : `${matchState.awayScore} – ${matchState.homeScore}`;

  const nonNeutralFormationHints = hints.formationMatchupHints.filter(
    (k) => k !== 'neutral',
  );
  const formationMatchupLines =
    nonNeutralFormationHints.length > 0
      ? nonNeutralFormationHints.map((k) => FORMATION_MATCHUP_COPY[k])
      : [FORMATION_MATCHUP_COPY.neutral];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-pixel text-lg text-pitch-400">TEAM CHANGES</h1>
          <p className="text-slate-400 text-sm">
            {subsRemaining} substitution{subsRemaining !== 1 ? 's' : ''}{' '}
            remaining
          </p>
        </div>
        <button
          onClick={handleDone}
          className="px-4 py-2 bg-pitch-600 hover:bg-pitch-500 text-white font-medium rounded-lg transition-colors"
        >
          Done
        </button>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
          {/* Left: Match summary + hints */}
          <aside className="lg:w-72 shrink-0 space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h2 className="text-slate-400 text-xs uppercase mb-2">
                Half-time
              </h2>
              <div className="flex items-center justify-center gap-3">
                <TeamShield team={playerTeam} />
                <p className="text-white font-bold text-4xl">{scoreLabel}</p>
                <TeamShield team={opponentTeam} />
              </div>
              <p className="text-slate-500 text-sm mt-2 text-center">
                {isHome ? 'You’re at home' : 'You’re away'}
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h2 className="text-slate-400 text-xs uppercase mb-2">Hints</h2>
              <p className="text-pitch-200 text-sm mb-3">
                {SITUATION_COPY[hints.situation]}
              </p>
              <p className="text-slate-400 text-xs uppercase mb-2">Posture</p>
              <ul className="space-y-1.5 text-sm text-slate-300">
                {POSTURE_OPTIONS.map((posture) => (
                  <li key={posture}>
                    <span className="font-medium text-white">
                      {POSTURE_LABEL[posture]}:
                    </span>{' '}
                    {POSTURE_HINT_COPY[hints.postureHints[posture]]}
                  </li>
                ))}
              </ul>
              <p className="text-slate-400 text-xs uppercase mt-3 mb-2">
                Formation
              </p>
              <ul className="space-y-1 text-sm text-slate-300">
                {formationMatchupLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Right: Formation, posture, substitutions */}
          <div className="flex-1 min-w-0 space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-white font-bold mb-4">Formation & Posture</h2>
              <div className="flex flex-row gap-6 items-end flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-400 text-xs uppercase mb-2">
                    Formation
                  </p>
                  <select
                    value={selectedFormation}
                    onChange={(e) =>
                      setSelectedFormation(e.target.value as FormationType)
                    }
                    className="w-full h-10 bg-slate-700 border border-slate-600 rounded pl-3 pr-8 text-white appearance-none bg-no-repeat bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    }}
                  >
                    {formationAvailability.map(({ formation, info }) => (
                      <option
                        key={formation}
                        value={formation}
                        disabled={!info.eligible}
                      >
                        {formation}
                      </option>
                    ))}
                  </select>
                  {!selectedFormationEligible && selectedFormationInfo && (
                    <p className="text-xs text-amber-400 mt-2">
                      Unavailable:{' '}
                      {formatFormationUnavailable(selectedFormationInfo.info)}
                    </p>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-slate-400 text-xs uppercase mb-2">
                    Posture
                  </p>
                  <div className="flex flex-wrap gap-2 h-10 items-center">
                    {POSTURE_OPTIONS.map((posture) => {
                      const isSelected = selectedPosture === posture;
                      return (
                        <button
                          key={posture}
                          onClick={() => setSelectedPosture(posture)}
                          className={
                            isSelected
                              ? 'h-10 px-3 rounded text-sm font-medium bg-pitch-600 text-white'
                              : 'h-10 px-3 rounded text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }
                        >
                          {POSTURE_LABEL[posture]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h2 className="text-white font-bold mb-4">
                  On the pitch
                  <span className="text-slate-400 font-normal ml-2 text-sm">
                    (Click to substitute out)
                  </span>
                </h2>
                <div className="space-y-2">
                  {lineup.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => handleLineupClick(player.id)}
                      disabled={subsRemaining <= 0}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${getLineupPlayerButtonClass(
                        selectedLineupPlayer === player.id,
                        subsRemaining,
                      )}`}
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

              <div>
                <h2 className="text-white font-bold mb-4">
                  On the bench
                  <span className="text-slate-400 font-normal ml-2 text-sm">
                    (Click to bring on)
                  </span>
                </h2>
                <div className="space-y-2">
                  {bench.length === 0 ? (
                    <p className="text-slate-500 text-sm">
                      No players on bench
                    </p>
                  ) : (
                    bench.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => handleBenchClick(player.id)}
                        disabled={!selectedLineupPlayer || subsRemaining <= 0}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${getBenchPlayerButtonClass(
                          !!selectedLineupPlayer,
                          subsRemaining,
                        )}`}
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

            {selectedLineupPlayer && (
              <p className="text-yellow-400 text-sm text-center sm:text-left">
                Select a player from the bench to bring on
              </p>
            )}

            {subsRemaining <= 0 && (
              <p className="text-red-400 text-sm text-center sm:text-left">
                You have used all your substitutions
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
