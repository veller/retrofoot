import { useEffect, useMemo, useState } from 'react';
import type { AiTraceEvent, LiveMatchState, MatchEvent, Player } from '@retrofoot/core';
import { useAiTraceStore } from '../lib/aiTraceStore';

type TeamSide = 'home' | 'away';

type TeamTypeCounts = Record<MatchEvent['type'], number>;

const SUMMARY_TYPES: MatchEvent['type'][] = [
  'goal',
  'own_goal',
  'penalty_scored',
  'penalty_missed',
  'chance_missed',
  'yellow_card',
  'red_card',
  'substitution',
  'injury',
  'save',
  'corner',
  'free_kick',
];

const SIGNIFICANT_EVENT_TYPES = new Set<MatchEvent['type']>(SUMMARY_TYPES);

function formatEventLabel(type: MatchEvent['type']): string {
  switch (type) {
    case 'goal':
      return 'Goal';
    case 'own_goal':
      return 'Own Goal';
    case 'penalty_scored':
      return 'Penalty Scored';
    case 'penalty_missed':
      return 'Penalty Missed';
    case 'chance_missed':
      return 'Chance Missed';
    case 'yellow_card':
      return 'Yellow Card';
    case 'red_card':
      return 'Red Card';
    case 'substitution':
      return 'Substitution';
    case 'injury':
      return 'Injury';
    case 'save':
      return 'Save';
    case 'corner':
      return 'Corner';
    case 'free_kick':
      return 'Free Kick';
    default:
      return type;
  }
}

function energyClass(energy: number): string {
  if (energy >= 70) return 'text-emerald-300';
  if (energy >= 45) return 'text-amber-300';
  return 'text-red-300';
}

function emptyCounts(): TeamTypeCounts {
  return {
    goal: 0,
    own_goal: 0,
    penalty_scored: 0,
    penalty_missed: 0,
    chance_missed: 0,
    yellow_card: 0,
    red_card: 0,
    substitution: 0,
    injury: 0,
    save: 0,
    corner: 0,
    free_kick: 0,
    offside: 0,
    kickoff: 0,
    half_time: 0,
    full_time: 0,
  };
}

function parseSubReason(description: string | undefined): string | null {
  if (!description) return null;
  const match = description.match(/\[ai_reason:([^\]]+)\]/);
  if (!match) return null;
  const raw = match[1];
  if (raw === 'fatigue') return 'AI saw low energy in that role and made a replacement.';
  if (raw === 'protect_lead') return 'AI changed players to protect the lead.';
  if (raw === 'tactical') return 'AI selected a stronger same-position replacement.';
  return `AI reason: ${raw}`;
}

function findTrace(
  traces: AiTraceEvent[],
  minute: number,
  team: TeamSide,
  type: AiTraceEvent['type'],
): AiTraceEvent | undefined {
  return traces.find(
    (trace) =>
      trace.type === type &&
      trace.minute === minute &&
      (trace.team === team || trace.team === undefined),
  );
}

function teamName(match: LiveMatchState, side: TeamSide): string {
  return side === 'home' ? match.homeTeam.name : match.awayTeam.name;
}

function buildWhyText(
  match: LiveMatchState,
  event: MatchEvent,
  traces: AiTraceEvent[],
): string {
  const eventTrace = findTrace(traces, event.minute, event.team, 'event_probability');
  const chanceTrace = findTrace(traces, event.minute, event.team, 'chance_evaluation');

  if (event.type === 'substitution') {
    const subTrace = traces.find(
      (trace) =>
        trace.type === 'sub_executed' &&
        trace.minute === event.minute &&
        trace.team === event.team &&
        String(trace.inputs.incomingPlayerId ?? '') === String(event.playerId ?? ''),
    );

    const reason = parseSubReason(event.description);
    const outgoingEnergy = subTrace?.inputs.outgoingEnergy;
    const incomingEnergy = subTrace?.inputs.incomingEnergy;
    const energyPart =
      typeof outgoingEnergy === 'number' && typeof incomingEnergy === 'number'
        ? ` Outgoing energy ${Math.round(outgoingEnergy)} -> incoming ${Math.round(incomingEnergy)}.`
        : '';

    return `${
      reason ??
      'AI compares outgoing and incoming same-position options and only performs the change when selection logic accepts it.'
    }${energyPart}`;
  }

  if (
    event.type === 'chance_missed' ||
    event.type === 'goal' ||
    event.type === 'own_goal' ||
    event.type === 'penalty_scored' ||
    event.type === 'penalty_missed'
  ) {
    const trigger = Number(eventTrace?.computed?.clampedProbability ?? NaN);
    const conversion = Number(chanceTrace?.computed?.successChance ?? NaN);

    const pieces: string[] = [];
    if (!Number.isNaN(trigger)) {
      pieces.push(
        `Event Trigger ${Math.round(trigger * 100)}%: probability that this minute produced any notable event at all.`,
      );
    }
    if (!Number.isNaN(conversion)) {
      const miss = Math.max(0, 100 - Math.round(conversion * 100));
      pieces.push(
        `Goal Conversion ${Math.round(conversion * 100)}%: probability this attacking chance ends in a goal (${miss}% not scoring).`,
      );
    }

    return (
      pieces.join(' ') ||
      `This attacking sequence came from possession + tactical context for ${teamName(match, event.team)} in that minute.`
    );
  }

  if (event.type === 'yellow_card' || event.type === 'red_card') {
    const teamPlayers = event.team === 'home' ? match.homeTeam.players : match.awayTeam.players;
    const player = teamPlayers.find((p) => p.id === event.playerId);
    const bookings =
      event.team === 'home'
        ? match.state.homeBookings[event.playerId ?? ''] ?? 0
        : match.state.awayBookings[event.playerId ?? ''] ?? 0;
    const liveEnergy =
      event.team === 'home'
        ? match.state.homeLiveEnergy[event.playerId ?? '']
        : match.state.awayLiveEnergy[event.playerId ?? ''];

    return [
      `Defensive phase means ${teamName(match, event.team)} was without possession (defending) when foul/card logic ran.`,
      `Fouler selection is weighted by aggression, low composure, fatigue, existing bookings, and match minute.`,
      player
        ? `Current factors for ${player.nickname || player.name}: aggression ${player.attributes.aggression}, composure ${player.attributes.composure}, bookings ${bookings}${typeof liveEnergy === 'number' ? `, energy ${Math.round(liveEnergy)}` : ''}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (event.type === 'corner' || event.type === 'free_kick' || event.type === 'save') {
    return 'This event type was selected as the minute outcome after attacking pressure and event-roll resolution.';
  }

  return 'This event came from the minute-by-minute simulation state and random roll for that minute.';
}

function StatusBadges({
  bookings,
  sentOff,
  incoming,
  outgoing,
}: {
  bookings: number;
  sentOff: boolean;
  incoming?: boolean;
  outgoing?: boolean;
}) {
  return (
    <>
      {incoming && (
        <span className="rounded border border-sky-500/40 bg-sky-900/30 px-1 text-[10px] text-sky-200">IN</span>
      )}
      {outgoing && (
        <span className="rounded border border-purple-500/40 bg-purple-900/30 px-1 text-[10px] text-purple-200">OUT</span>
      )}
      {bookings > 0 && (
        <span className="rounded border border-yellow-500/40 bg-yellow-900/30 px-1 text-[10px] text-yellow-200">Y:{bookings}</span>
      )}
      {sentOff && (
        <span className="rounded border border-red-500/40 bg-red-900/30 px-1 text-[10px] text-red-200">R</span>
      )}
    </>
  );
}

function TeamPanel({
  match,
  side,
  incomingSet,
  outgoingSet,
}: {
  match: LiveMatchState;
  side: TeamSide;
  incomingSet: Set<string>;
  outgoingSet: Set<string>;
}) {
  const team = side === 'home' ? match.homeTeam : match.awayTeam;
  const tactics = side === 'home' ? match.state.homeTactics : match.state.awayTactics;
  const lineupIds = tactics.lineup;
  const playersById = new Map(team.players.map((player) => [player.id, player]));

  const liveEnergy = side === 'home' ? match.state.homeLiveEnergy : match.state.awayLiveEnergy;
  const bookings = side === 'home' ? match.state.homeBookings : match.state.awayBookings;
  const sentOff = side === 'home' ? match.state.homeSentOff : match.state.awaySentOff;

  const lineup = lineupIds
    .map((id) => playersById.get(id))
    .filter((player): player is Player => Boolean(player));

  const bench = (side === 'home' ? match.state.homeSubs : match.state.awaySubs)
    .map((player) => playersById.get(player.id) ?? player)
    .filter((player): player is Player => Boolean(player));

  const subbedOut = team.players.filter((player) => outgoingSet.has(player.id));

  return (
    <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
        {team.shortName} · Starting XI (Live)
      </p>

      <div className="space-y-1">
        {lineup.map((player, index) => {
          const energy = liveEnergy[player.id] ?? player.energy ?? 100;
          const yc = bookings[player.id] ?? 0;
          const rc = Boolean(sentOff[player.id]);
          return (
            <div key={player.id} className="grid grid-cols-[24px_30px_1fr_auto] items-center gap-2 text-xs">
              <span className="font-mono text-slate-500">{index + 1}</span>
              <span className="text-slate-400">{player.position}</span>
              <div className="min-w-0 flex items-center gap-1 overflow-hidden">
                <span className="truncate text-slate-200">{player.nickname || player.name}</span>
                <StatusBadges
                  bookings={yc}
                  sentOff={rc}
                  incoming={incomingSet.has(player.id)}
                />
              </div>
              <span className={`font-mono ${energyClass(energy)}`}>{Math.round(energy)}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 mb-1 text-[11px] uppercase tracking-wide text-slate-500">Bench (Live)</p>
      <div className="space-y-1">
        {bench.length === 0 && <p className="text-xs text-slate-500">No bench players available.</p>}
        {bench.map((player) => {
          const energy = liveEnergy[player.id] ?? player.energy ?? 100;
          const yc = bookings[player.id] ?? 0;
          const rc = Boolean(sentOff[player.id]);
          return (
            <div key={player.id} className="grid grid-cols-[30px_1fr_auto] items-center gap-2 text-xs">
              <span className="text-slate-400">{player.position}</span>
              <div className="min-w-0 flex items-center gap-1 overflow-hidden">
                <span className="truncate text-slate-300">{player.nickname || player.name}</span>
                <StatusBadges bookings={yc} sentOff={rc} />
              </div>
              <span className={`font-mono ${energyClass(energy)}`}>{Math.round(energy)}</span>
            </div>
          );
        })}
      </div>

      {subbedOut.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-[11px] uppercase tracking-wide text-slate-500">Subbed Out</p>
          <div className="space-y-1">
            {subbedOut.map((player) => {
              const energy = liveEnergy[player.id] ?? player.energy ?? 100;
              const yc = bookings[player.id] ?? 0;
              const rc = Boolean(sentOff[player.id]);
              return (
                <div key={player.id} className="grid grid-cols-[30px_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-slate-400">{player.position}</span>
                  <div className="min-w-0 flex items-center gap-1 overflow-hidden">
                    <span className="truncate text-slate-300">{player.nickname || player.name}</span>
                    <StatusBadges
                      bookings={yc}
                      sentOff={rc}
                      outgoing
                    />
                  </div>
                  <span className={`font-mono ${energyClass(energy)}`}>{Math.round(energy)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function EventSummary({
  match,
  traces,
}: {
  match: LiveMatchState;
  traces: AiTraceEvent[];
}) {
  const home = emptyCounts();
  const away = emptyCounts();

  for (const event of match.state.events) {
    if (event.team !== 'home' && event.team !== 'away') continue;
    if (!SUMMARY_TYPES.includes(event.type)) continue;
    if (event.team === 'home') home[event.type] += 1;
    if (event.team === 'away') away[event.type] += 1;
  }

  const homeChances = home.goal + home.own_goal + home.penalty_scored + home.penalty_missed + home.chance_missed;
  const awayChances = away.goal + away.own_goal + away.penalty_scored + away.penalty_missed + away.chance_missed;

  let homePoss = 0;
  let awayPoss = 0;
  for (const trace of traces) {
    if (trace.type !== 'event_probability') continue;
    const poss = String(trace.outcome.possession ?? '');
    if (poss === 'home') homePoss += 1;
    if (poss === 'away') awayPoss += 1;
  }
  const possTotal = homePoss + awayPoss;
  const homePossPct = possTotal > 0 ? Math.round((homePoss / possTotal) * 100) : 50;
  const awayPossPct = possTotal > 0 ? Math.round((awayPoss / possTotal) * 100) : 50;

  return (
    <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Event Summary (Player Match, Live)</p>
      <div className="grid grid-cols-[140px_1fr_1fr] gap-2 text-xs">
        <span className="text-slate-400">Metric</span>
        <span className="font-semibold text-slate-200">{match.homeTeam.shortName}</span>
        <span className="font-semibold text-slate-200">{match.awayTeam.shortName}</span>

        <span className="text-slate-400">Scoring Chances</span>
        <span className="font-mono">{homeChances}</span>
        <span className="font-mono">{awayChances}</span>

        <span className="text-slate-400">Goals</span>
        <span className="font-mono">{home.goal + home.own_goal + home.penalty_scored}</span>
        <span className="font-mono">{away.goal + away.own_goal + away.penalty_scored}</span>

        <span className="text-slate-400">Chances Missed</span>
        <span className="font-mono">{home.chance_missed + home.penalty_missed}</span>
        <span className="font-mono">{away.chance_missed + away.penalty_missed}</span>

        <span className="text-slate-400">Yellow Cards</span>
        <span className="font-mono">{home.yellow_card}</span>
        <span className="font-mono">{away.yellow_card}</span>

        <span className="text-slate-400">Red Cards</span>
        <span className="font-mono">{home.red_card}</span>
        <span className="font-mono">{away.red_card}</span>

        <span className="text-slate-400">Substitutions</span>
        <span className="font-mono">{home.substitution}</span>
        <span className="font-mono">{away.substitution}</span>

        <span className="text-slate-400">Corners</span>
        <span className="font-mono">{home.corner}</span>
        <span className="font-mono">{away.corner}</span>

        <span className="text-slate-400">Free Kicks</span>
        <span className="font-mono">{home.free_kick}</span>
        <span className="font-mono">{away.free_kick}</span>

        <span className="text-slate-400">Saves</span>
        <span className="font-mono">{home.save}</span>
        <span className="font-mono">{away.save}</span>

        <span className="text-slate-400">Current Possession</span>
        <span className="font-mono">{match.state.possession === 'home' ? 'Now' : '-'}</span>
        <span className="font-mono">{match.state.possession === 'away' ? 'Now' : '-'}</span>

        <span className="text-slate-400">Cumulative Possession (so far)</span>
        <span className="font-mono">{homePossPct}%</span>
        <span className="font-mono">{awayPossPct}%</span>
      </div>
    </div>
  );
}

export function AiDecisionDevDrawer({
  playerMatch,
}: {
  playerMatch: LiveMatchState | null;
}) {
  if (!import.meta.env.DEV) return null;

  const [open, setOpen] = useState(false);
  const traces = useAiTraceStore((state) => state.events);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentMinute = playerMatch?.state.minute ?? 0;

  const incomingByTeam = useMemo(() => {
    const map = { home: new Set<string>(), away: new Set<string>() };
    if (!playerMatch) return map;
    for (const event of playerMatch.state.events) {
      if (event.type === 'substitution' && event.playerId) {
        map[event.team].add(event.playerId);
      }
    }
    return map;
  }, [playerMatch]);

  const outgoingByTeam = useMemo(() => {
    const map = { home: new Set<string>(), away: new Set<string>() };
    if (!playerMatch) return map;
    for (const event of playerMatch.state.events) {
      if (event.type === 'substitution' && event.assistPlayerId) {
        map[event.team].add(event.assistPlayerId);
      }
    }
    return map;
  }, [playerMatch]);

  const significantEvents = useMemo(() => {
    if (!playerMatch) return [];
    return playerMatch.state.events.filter((event) => SIGNIFICANT_EVENT_TYPES.has(event.type));
  }, [playerMatch]);

  const eventCards = useMemo(() => {
    if (!playerMatch) return [];
    return [...significantEvents].reverse().map((event, index) => ({
      key: `${event.minute}-${event.type}-${index}`,
      event,
      why: buildWhyText(playerMatch, event, traces),
    }));
  }, [playerMatch, significantEvents, traces]);

  return (
    <div className="fixed bottom-4 right-4 z-[90] max-w-[min(96vw,1180px)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mb-2 rounded border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-100 shadow-lg hover:bg-slate-800"
      >
        AI Observatory {open ? 'Hide' : 'Show'}
      </button>

      {open && (
        <div className="grid h-[min(82vh,760px)] w-[min(96vw,1180px)] grid-cols-1 gap-2 rounded border border-slate-700 bg-slate-900/95 p-2 text-slate-100 shadow-2xl md:grid-cols-[minmax(430px,1fr)_minmax(430px,1fr)]">
          <div className="flex min-h-0 flex-col rounded border border-slate-700 bg-slate-900">
            <div className="border-b border-slate-700 p-2">
              <p className="text-xs uppercase tracking-wide text-slate-300">Player Match Events and Why</p>
              <p className="text-xs text-slate-400 break-words">
                Minute {currentMinute} · {playerMatch ? `${playerMatch.homeTeam.shortName} ${playerMatch.state.homeScore} - ${playerMatch.state.awayScore} ${playerMatch.awayTeam.shortName}` : 'No active player match'}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="space-y-2 pr-1">
                {eventCards.length === 0 && (
                  <p className="text-xs text-slate-400">No significant events yet.</p>
                )}
                {eventCards.map(({ key, event, why }) => (
                  <div key={key} className="rounded border border-slate-700 p-2 text-xs">
                    <p className="font-mono text-slate-400 break-words">
                      {event.minute}' · {formatEventLabel(event.type)} · {event.team}
                    </p>
                    <p className="mt-1 text-slate-200 break-words">
                      <span className="text-slate-400">Why: </span>
                      {why}
                    </p>
                    <p className="mt-1 text-slate-200 break-words">
                      <span className="text-slate-400">Conclusion: </span>
                      {event.description ?? formatEventLabel(event.type)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 rounded border border-slate-700 bg-slate-900 p-2">
            {playerMatch ? (
              <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
                <EventSummary match={playerMatch} traces={traces} />
                <TeamPanel
                  match={playerMatch}
                  side="home"
                  incomingSet={incomingByTeam.home}
                  outgoingSet={outgoingByTeam.home}
                />
                <TeamPanel
                  match={playerMatch}
                  side="away"
                  incomingSet={incomingByTeam.away}
                  outgoingSet={outgoingByTeam.away}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Start a live player match to see lineup, energy, cards, substitutions, and event summary.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
