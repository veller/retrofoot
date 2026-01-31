import { Hono } from 'hono'
import type { Env } from '../index'

// Game routes - core gameplay API
export const gameRoutes = new Hono<{ Bindings: Env }>()

// Get current game state
gameRoutes.get('/state/:saveId', async (c) => {
  const saveId = c.req.param('saveId')

  // TODO: Fetch game state from D1
  return c.json({
    saveId,
    season: '2024/25',
    club: {
      id: 'galo-fc',
      name: 'Galo FC',
      budget: 10_000_000,
    },
    currentRound: 1,
    message: 'Game state endpoint - implementation pending',
  })
})

// Simulate a match
gameRoutes.post('/match/simulate', async (c) => {
  const body = await c.req.json()

  // TODO: Use @retrofoot/core match engine
  return c.json({
    homeTeam: body.homeTeam || 'Galo FC',
    awayTeam: body.awayTeam || 'Flamingo FC',
    homeScore: Math.floor(Math.random() * 4),
    awayScore: Math.floor(Math.random() * 4),
    events: [
      { minute: 23, type: 'goal', team: 'home', player: 'Bunda' },
      { minute: 67, type: 'goal', team: 'away', player: 'Gabigou' },
    ],
    message: 'Match simulation - using placeholder logic',
  })
})

// Advance to next round
gameRoutes.post('/advance/:saveId', async (c) => {
  const saveId = c.req.param('saveId')

  // TODO: Process all matches, update standings
  return c.json({
    saveId,
    newRound: 2,
    message: 'Advance round endpoint - implementation pending',
  })
})

// Get league standings
gameRoutes.get('/standings/:saveId', async (c) => {
  const saveId = c.req.param('saveId')

  // TODO: Fetch from D1
  return c.json({
    saveId,
    league: 'Campeonato Brasileiro',
    standings: [
      { position: 1, team: 'Galo FC', played: 0, won: 0, drawn: 0, lost: 0, points: 0 },
      { position: 2, team: 'Flamingo FC', played: 0, won: 0, drawn: 0, lost: 0, points: 0 },
      { position: 3, team: 'Palmeiras FC', played: 0, won: 0, drawn: 0, lost: 0, points: 0 },
    ],
  })
})
