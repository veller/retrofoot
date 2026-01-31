// ============================================================================
// RETROFOOT - Season System
// ============================================================================
// Season management, fixtures, standings, calendar

import type { Team, Season, Fixture, StandingEntry, MatchResult } from '../types'
import { simulateMatch } from '../match'
import { createDefaultTactics } from '../team'

// Generate round-robin fixtures for a league
export function generateFixtures(teams: Team[], seasonYear: string): Fixture[] {
  const n = teams.length
  const fixtures: Fixture[] = []

  // If odd number of teams, add a "bye" placeholder
  const teamIds = teams.map((t) => t.id)
  if (n % 2 !== 0) {
    teamIds.push('BYE')
  }

  const numTeams = teamIds.length
  const rounds = (numTeams - 1) * 2 // Home and away
  const matchesPerRound = numTeams / 2

  // Circle method for round-robin scheduling
  const fixed = teamIds[0]
  const rotating = teamIds.slice(1)

  for (let round = 0; round < rounds; round++) {
    const isSecondHalf = round >= numTeams - 1

    // Create rotation for this round
    const rotation = [fixed, ...rotating]

    for (let match = 0; match < matchesPerRound; match++) {
      const home = rotation[match]
      const away = rotation[numTeams - 1 - match]

      // Skip bye matches
      if (home === 'BYE' || away === 'BYE') continue

      // Swap home/away for second half of season
      const [homeTeam, awayTeam] = isSecondHalf ? [away, home] : [home, away]

      // Calculate date (one round per week, starting August)
      const startDate = new Date(`${seasonYear.split('/')[0]}-08-01`)
      startDate.setDate(startDate.getDate() + round * 7)

      fixtures.push({
        id: `fixture-${round + 1}-${match + 1}`,
        round: round + 1,
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        date: startDate.toISOString(),
        played: false,
      })
    }

    // Rotate teams (keep first fixed)
    const last = rotating.pop()!
    rotating.unshift(last)
  }

  return fixtures
}

// Initialize standings for a new season
export function initializeStandings(teams: Team[]): StandingEntry[] {
  return teams.map((team, index) => ({
    position: index + 1,
    teamId: team.id,
    teamName: team.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }))
}

// Update standings after a match
export function updateStandings(standings: StandingEntry[], result: MatchResult): StandingEntry[] {
  const updated = standings.map((entry) => ({ ...entry }))

  const homeEntry = updated.find((e) => e.teamId === result.homeTeamId)
  const awayEntry = updated.find((e) => e.teamId === result.awayTeamId)

  if (!homeEntry || !awayEntry) return standings

  // Update home team
  homeEntry.played += 1
  homeEntry.goalsFor += result.homeScore
  homeEntry.goalsAgainst += result.awayScore

  // Update away team
  awayEntry.played += 1
  awayEntry.goalsFor += result.awayScore
  awayEntry.goalsAgainst += result.homeScore

  // Determine winner
  if (result.homeScore > result.awayScore) {
    homeEntry.won += 1
    homeEntry.points += 3
    awayEntry.lost += 1
  } else if (result.homeScore < result.awayScore) {
    awayEntry.won += 1
    awayEntry.points += 3
    homeEntry.lost += 1
  } else {
    homeEntry.drawn += 1
    homeEntry.points += 1
    awayEntry.drawn += 1
    awayEntry.points += 1
  }

  // Update goal differences
  homeEntry.goalDifference = homeEntry.goalsFor - homeEntry.goalsAgainst
  awayEntry.goalDifference = awayEntry.goalsFor - awayEntry.goalsAgainst

  // Sort standings by: points, goal difference, goals for
  updated.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    return b.goalsFor - a.goalsFor
  })

  // Update positions
  updated.forEach((entry, index) => {
    entry.position = index + 1
  })

  return updated
}

// Simulate all matches in a round (for AI-controlled teams)
export function simulateRound(
  season: Season,
  teams: Team[],
  playerTeamId: string
): { season: Season; results: MatchResult[] } {
  const round = season.currentRound
  const roundFixtures = season.fixtures.filter(
    (f) => f.round === round && !f.played
  )

  const results: MatchResult[] = []
  let updatedStandings = [...season.standings]
  const updatedFixtures = [...season.fixtures]

  for (const fixture of roundFixtures) {
    // Skip player's match - they need to play it manually
    if (fixture.homeTeamId === playerTeamId || fixture.awayTeamId === playerTeamId) {
      continue
    }

    const homeTeam = teams.find((t) => t.id === fixture.homeTeamId)
    const awayTeam = teams.find((t) => t.id === fixture.awayTeamId)

    if (!homeTeam || !awayTeam) continue

    // Simulate the match
    const result = simulateMatch({
      homeTeam,
      awayTeam,
      homeTactics: createDefaultTactics(homeTeam),
      awayTactics: createDefaultTactics(awayTeam),
    })

    results.push(result)
    updatedStandings = updateStandings(updatedStandings, result)

    // Update fixture
    const fixtureIndex = updatedFixtures.findIndex((f) => f.id === fixture.id)
    if (fixtureIndex !== -1) {
      updatedFixtures[fixtureIndex] = {
        ...updatedFixtures[fixtureIndex],
        played: true,
        result,
      }
    }
  }

  return {
    season: {
      ...season,
      standings: updatedStandings,
      fixtures: updatedFixtures,
    },
    results,
  }
}

// Check if season is complete
export function isSeasonComplete(season: Season): boolean {
  return season.fixtures.every((f) => f.played)
}

// Get current round's fixtures
export function getCurrentRoundFixtures(season: Season): Fixture[] {
  return season.fixtures.filter((f) => f.round === season.currentRound)
}

// Advance to next round
export function advanceRound(season: Season): Season {
  const currentRoundFixtures = getCurrentRoundFixtures(season)
  const allPlayed = currentRoundFixtures.every((f) => f.played)

  if (!allPlayed) {
    throw new Error('Cannot advance: not all matches in current round are played')
  }

  return {
    ...season,
    currentRound: season.currentRound + 1,
  }
}

// Create a new season
export function createSeason(teams: Team[], year: string): Season {
  const fixtures = generateFixtures(teams, year)
  const totalRounds = Math.max(...fixtures.map((f) => f.round))

  return {
    year,
    currentRound: 1,
    totalRounds,
    standings: initializeStandings(teams),
    fixtures,
    transferWindowOpen: false,
  }
}

// Get promotion/relegation positions
export function getPromotionRelegationPositions(leagueSize: number): {
  promotion: number[]
  relegation: number[]
} {
  // Top 4 get promoted (or qualify for continental competition)
  const promotion = [1, 2, 3, 4]

  // Bottom 4 get relegated
  const relegation = Array.from(
    { length: 4 },
    (_, i) => leagueSize - i
  ).reverse()

  return { promotion, relegation }
}
