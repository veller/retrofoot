import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  calculateOverall,
  type FormationType,
  type TacticalPosture,
  type Position,
} from '@retrofoot/core'
import { PitchView, type PitchSlot } from '../components/PitchView'
import { PositionBadge } from '../components/PositionBadge'
import {
  useGameStore,
  useUpcomingFixture,
  BENCH_LIMIT,
} from '../stores/gameStore'

type GameTab = 'squad' | 'match' | 'table' | 'transfers' | 'finances'

const FORMATION_OPTIONS: FormationType[] = [
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '3-5-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
  '3-4-3',
]

const POSTURE_OPTIONS: { value: TacticalPosture; label: string }[] = [
  { value: 'defensive', label: 'Defensive' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'attacking', label: 'Attacking' },
]

const PLAY_STYLE_OPTIONS: { value: TacticalPosture; label: string }[] = [
  { value: 'defensive', label: 'Defensive' },
  { value: 'balanced', label: 'Neutral' },
  { value: 'attacking', label: 'Offensive' },
]

// Position groups for highlighting similar roles (GK, defenders, midfielders, attackers)
const POSITION_GROUPS: Record<string, Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'ST'],
}
const POSITION_TO_GROUP: Record<Position, string> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  CDM: 'MID',
  CM: 'MID',
  CAM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
}
function getSimilarPositions(position: Position): Position[] {
  return POSITION_GROUPS[POSITION_TO_GROUP[position]] ?? [position]
}

const POSITION_GROUP_ORDER: Record<string, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  ATT: 3,
}
function getPositionGroupOrder(position: Position): number {
  return POSITION_GROUP_ORDER[POSITION_TO_GROUP[position]] ?? 4
}

export function GamePage() {
  const [activeTab, setActiveTab] = useState<GameTab>('squad')

  const _hasHydrated = useGameStore((s) => s._hasHydrated)
  const initializeGame = useGameStore((s) => s.initializeGame)
  const teams = useGameStore((s) => s.teams)
  const playerTeamId = useGameStore((s) => s.playerTeamId)

  const playerTeam = useMemo(
    () => teams.find((t) => t.id === playerTeamId) ?? null,
    [teams, playerTeamId]
  )
  const season = useGameStore((s) => s.season)

  useEffect(() => {
    if (_hasHydrated && teams.length === 0) {
      initializeGame()
    }
  }, [_hasHydrated, teams.length, initializeGame])

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  if (!playerTeam || !season) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Initializing game...</p>
      </div>
    )
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
            <span className="text-white">{season.year}</span>
          </div>
          <button
            onClick={() => setActiveTab('match')}
            className="bg-pitch-600 hover:bg-pitch-500 text-white font-medium px-4 py-2 rounded text-sm transition-colors"
          >
            Go to match
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="flex gap-1">
          {(['squad', 'match', 'table', 'transfers', 'finances'] as const).map(
            (tab) => (
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
            )
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 w-full">
          {activeTab === 'squad' && <SquadPanel />}
          {activeTab === 'match' && <MatchPanel />}
          {activeTab === 'table' && <TablePanel />}
          {activeTab === 'transfers' && <TransfersPanel />}
          {activeTab === 'finances' && <FinancesPanel />}
        </div>
      </main>
    </div>
  )
}

function SquadPanel() {
  const [selectedSlot, setSelectedSlot] = useState<PitchSlot | null>(null)

  const playerTeam = useGameStore((s) => {
    const teams = s.teams
    const playerTeamId = s.playerTeamId
    return teams.find((t) => t.id === playerTeamId) ?? null
  })
  const tactics = useGameStore((s) => s.tactics)
  const setFormation = useGameStore((s) => s.setFormation)
  const setPosture = useGameStore((s) => s.setPosture)
  const swapLineupWithBench = useGameStore((s) => s.swapLineupWithBench)
  const addToBench = useGameStore((s) => s.addToBench)
  const removeFromBench = useGameStore((s) => s.removeFromBench)

  const playersById = useMemo(
    () => new Map(playerTeam?.players.map((p) => [p.id, p]) ?? []),
    [playerTeam?.players]
  )

  if (!playerTeam || !tactics) return null

  const { lineup, substitutes, formation } = tactics

  const lineupSet = useMemo(() => new Set(lineup), [lineup])
  const substitutesSet = useMemo(() => new Set(substitutes), [substitutes])

  const sortedPlayers = useMemo(() => {
    const players = [...playerTeam.players]
    const getTier = (id: string) =>
      lineupSet.has(id) ? 0 : substitutesSet.has(id) ? 1 : 2
    return players.sort((a, b) => {
      const aTier = getTier(a.id)
      const bTier = getTier(b.id)
      if (aTier !== bTier) return aTier - bTier

      const aGroupOrder = getPositionGroupOrder(a.position)
      const bGroupOrder = getPositionGroupOrder(b.position)
      if (aGroupOrder !== bGroupOrder) return aGroupOrder - bGroupOrder

      if (aTier === 0) return lineup.indexOf(a.id) - lineup.indexOf(b.id)
      if (aTier === 1) return substitutes.indexOf(a.id) - substitutes.indexOf(b.id)
      return calculateOverall(b) - calculateOverall(a)
    })
  }, [playerTeam.players, lineup, substitutes, lineupSet, substitutesSet])

  const highlightPositions = useMemo((): Position[] | null => {
    if (!selectedSlot) return null
    const playerId =
      selectedSlot.type === 'lineup'
        ? lineup[selectedSlot.index]
        : substitutes[selectedSlot.index]
    const player = playerId ? playersById.get(playerId) : undefined
    if (!player) return null
    return getSimilarPositions(player.position)
  }, [selectedSlot, lineup, substitutes, playersById])

  function handlePlayerClick(slot: PitchSlot) {
    if (!selectedSlot) {
      setSelectedSlot(slot)
      return
    }
    if (selectedSlot.type === slot.type && selectedSlot.index === slot.index) {
      setSelectedSlot(null)
      return
    }
    if (selectedSlot.type === 'lineup' && slot.type === 'bench') {
      swapLineupWithBench(selectedSlot.index, slot.index)
    } else if (selectedSlot.type === 'bench' && slot.type === 'lineup') {
      swapLineupWithBench(slot.index, selectedSlot.index)
    }
    setSelectedSlot(null)
  }

  return (
    <div className="flex h-full">
      {/* Left: Squad list - 50% */}
      <div className="w-1/2 min-w-0 bg-slate-800 border-r border-slate-700 p-6 overflow-auto">
        <h2 className="text-xl font-bold text-white mb-4">Squad</h2>
        <p className="text-slate-400 text-sm mb-6">
          Your squad. Manage your players, set formations, and prepare for
          matches.
        </p>
        <div className="grid gap-2">
          {sortedPlayers.map((player) => {
            const inLineup = lineupSet.has(player.id)
            const onBench = substitutesSet.has(player.id)
            const canSendToBench = !inLineup && !onBench
            const rowStyle = inLineup
              ? 'bg-pitch-900/30 border-l-4 border-pitch-500'
              : onBench
                ? 'bg-slate-600/80 border-l-4 border-slate-500'
                : 'bg-slate-700'

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
            )
          })}
        </div>
      </div>

      {/* Right: Pitch + bench - 50% */}
      <div className="w-1/2 min-w-0 flex flex-col">
        <div className="bg-slate-800 p-6 h-full overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Formation</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <select
                  value={formation}
                  onChange={(e) =>
                    setFormation(e.target.value as FormationType)
                  }
                  className="select-chevron bg-slate-700 text-white text-sm pl-3 py-1.5 rounded border border-slate-600"
                >
                  {FORMATION_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm">Play style</span>
                <select
                  value={tactics.posture}
                  onChange={(e) =>
                    setPosture(e.target.value as TacticalPosture)
                  }
                  className="select-chevron bg-slate-700 text-white text-sm pl-3 py-1.5 rounded border border-slate-600"
                >
                  {PLAY_STYLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
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
            onPlayerClick={(slot) => handlePlayerClick(slot)}
            selectedSlot={selectedSlot}
            highlightPositions={highlightPositions}
            onRemoveFromBench={removeFromBench}
            benchLimit={BENCH_LIMIT}
          />
        </div>
      </div>
    </div>
  )
}

function MatchPanel() {
  const { fixture, homeTeam, awayTeam } = useUpcomingFixture()
  const tactics = useGameStore((s) => s.tactics)
  const setPosture = useGameStore((s) => s.setPosture)
  const season = useGameStore((s) => s.season)

  if (!fixture || !homeTeam || !awayTeam || !season) {
    return (
      <div className="bg-slate-800 border border-slate-700 p-6">
        <h2 className="text-xl font-bold text-white mb-4">Next Match</h2>
        <p className="text-slate-400">No upcoming fixture.</p>
      </div>
    )
  }

  const fixtureDate = new Date(fixture.date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Next Match</h2>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Fixture card */}
        <div className="flex-1 text-center py-8">
          <div className="flex items-center justify-center gap-8 text-2xl flex-wrap">
            <span className="text-white font-medium">{homeTeam.name}</span>
            <span className="text-slate-500">vs</span>
            <span className="text-white font-medium">{awayTeam.name}</span>
          </div>
          <p className="text-slate-400 mt-4">
            Campeonato Brasileiro - Round {fixture.round}
          </p>
          <p className="text-slate-500 text-sm mt-1">{fixtureDate}</p>

          {/* Tactical posture */}
          <div className="mt-6">
            <p className="text-slate-400 text-sm mb-2">Tactical posture</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {POSTURE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setPosture(value)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    tactics?.posture === value
                      ? 'bg-pitch-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button className="mt-6 bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-3 px-8 transition-colors">
            SIMULATE MATCH
          </button>
        </div>

        {/* Lineup summary */}
        <div className="w-64 shrink-0 bg-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400 text-sm mb-2">Your lineup</p>
          <p className="text-white font-medium">
            {tactics?.formation ?? '—'} formation
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {tactics?.lineup.length ?? 0} starters, {tactics?.substitutes.length ?? 0}{' '}
            on bench
          </p>
          <p className="text-slate-400 text-xs mt-2">
            Posture: {tactics?.posture ?? 'balanced'}
          </p>
        </div>
      </div>
    </div>
  )
}

function TablePanel() {
  const season = useGameStore((s) => s.season)

  if (!season) return null

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
            <th className="text-center py-2">Pts</th>
          </tr>
        </thead>
        <tbody>
          {season.standings.map((entry) => (
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
              <td className="text-center py-2 text-pitch-400 font-bold">
                {entry.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TransfersPanel() {
  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Transfer Market</h2>
      <p className="text-slate-400">
        Search for players and make offers. The transfer window is open.
      </p>
    </div>
  )
}

function FinancesPanel() {
  const playerTeam = useGameStore((s) => {
    const teams = s.teams
    const playerTeamId = s.playerTeamId
    return teams.find((t) => t.id === playerTeamId) ?? null
  })

  if (!playerTeam) return null

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
            R$ {playerTeam.wagebudget.toLocaleString('pt-BR')}/mo
          </p>
        </div>
      </div>
    </div>
  )
}
