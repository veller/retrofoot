import { useState } from 'react'
import { Link } from 'react-router-dom'

type GameTab = 'squad' | 'match' | 'table' | 'transfers' | 'finances'

export function GamePage() {
  const [activeTab, setActiveTab] = useState<GameTab>('squad')

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
            <span className="text-white font-medium">Galo FC</span>
          </div>
          <div>
            <span className="text-slate-500">Budget:</span>{' '}
            <span className="text-pitch-400 font-medium">R$ 10.000.000</span>
          </div>
          <div>
            <span className="text-slate-500">Season:</span>{' '}
            <span className="text-white">2024/25</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="flex gap-1">
          {(['squad', 'match', 'table', 'transfers', 'finances'] as const).map((tab) => (
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
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
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
  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Squad</h2>
      <p className="text-slate-400">Your squad will appear here. Manage your players, set formations, and prepare for matches.</p>
      <div className="mt-6 grid gap-2">
        {/* Placeholder players */}
        {['GK - Everton', 'DF - Gustavo', 'MF - Otavio', 'FW - Bunda'].map((player, i) => (
          <div key={i} className="bg-slate-700 px-4 py-3 flex justify-between items-center">
            <span className="text-white">{player}</span>
            <span className="text-pitch-400">OVR 78</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatchPanel() {
  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Next Match</h2>
      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-8 text-2xl">
          <span className="text-white">Galo FC</span>
          <span className="text-slate-500">vs</span>
          <span className="text-white">Flamingo FC</span>
        </div>
        <p className="text-slate-400 mt-4">Campeonato Brasileiro - Round 1</p>
        <button className="mt-6 bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-3 px-8 transition-colors">
          SIMULATE MATCH
        </button>
      </div>
    </div>
  )
}

function TablePanel() {
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
          {[
            { pos: 1, name: 'Galo FC', p: 0, w: 0, d: 0, l: 0, pts: 0 },
            { pos: 2, name: 'Flamingo FC', p: 0, w: 0, d: 0, l: 0, pts: 0 },
            { pos: 3, name: 'Palmeiras FC', p: 0, w: 0, d: 0, l: 0, pts: 0 },
          ].map((team) => (
            <tr key={team.pos} className="border-b border-slate-700 text-white">
              <td className="py-2">{team.pos}</td>
              <td className="py-2">{team.name}</td>
              <td className="text-center py-2">{team.p}</td>
              <td className="text-center py-2">{team.w}</td>
              <td className="text-center py-2">{team.d}</td>
              <td className="text-center py-2">{team.l}</td>
              <td className="text-center py-2 text-pitch-400 font-bold">{team.pts}</td>
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
      <p className="text-slate-400">Search for players and make offers. The transfer window is open.</p>
    </div>
  )
}

function FinancesPanel() {
  return (
    <div className="bg-slate-800 border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-4">Club Finances</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-700 p-4">
          <p className="text-slate-400 text-sm">Transfer Budget</p>
          <p className="text-2xl text-pitch-400 font-bold">R$ 10.000.000</p>
        </div>
        <div className="bg-slate-700 p-4">
          <p className="text-slate-400 text-sm">Wage Budget</p>
          <p className="text-2xl text-white font-bold">R$ 500.000/mo</p>
        </div>
      </div>
    </div>
  )
}
