# RetroFoot Code Conventions

## Overview

This document defines coding standards and patterns for RetroFoot. Following these conventions ensures consistency and makes the codebase easier to navigate for both humans and AI agents.

## TypeScript

### Strict Mode

All TypeScript code uses strict mode. No `any` types unless absolutely necessary.

```typescript
// Good
function getPlayer(id: string): Player | undefined

// Bad
function getPlayer(id: any): any
```

### Type Exports

Export types from index files for clean imports:

```typescript
// packages/core/src/types/index.ts
export type { Player, Team, Match } from './entities'

// Consuming code
import type { Player } from '@retrofoot/core/types'
```

### Prefer Interfaces for Objects

```typescript
// Good - extensible
interface PlayerAttributes {
  speed: number
  strength: number
}

// Acceptable for unions/aliases
type Position = 'GK' | 'CB' | 'ST'
```

### Use `const` Assertions for Literals

```typescript
const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2'] as const
type Formation = (typeof FORMATIONS)[number]
```

## File Organization

### Naming

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `match-engine.ts` |
| React components | PascalCase | `MatchPanel.tsx` |
| Types/Interfaces | PascalCase | `PlayerAttributes` |
| Functions | camelCase | `simulateMatch()` |
| Constants | SCREAMING_SNAKE | `MAX_PLAYERS` |
| Folders | kebab-case | `match-engine/` |

### File Structure

```
src/
├── index.ts          # Public exports only
├── types.ts          # Type definitions
├── constants.ts      # Constants and config
├── utils.ts          # Pure utility functions
└── feature/
    ├── index.ts      # Feature exports
    ├── feature.ts    # Main implementation
    └── feature.test.ts
```

## React Components

### Component Structure

```tsx
// 1. Imports
import { useState } from 'react'
import type { Player } from '@retrofoot/core/types'

// 2. Types (if component-specific)
interface PlayerCardProps {
  player: Player
  onSelect?: (id: string) => void
}

// 3. Component
export function PlayerCard({ player, onSelect }: PlayerCardProps) {
  // 3a. Hooks
  const [expanded, setExpanded] = useState(false)

  // 3b. Handlers
  function handleClick() {
    onSelect?.(player.id)
  }

  // 3c. Render
  return (
    <div onClick={handleClick}>
      {player.name}
    </div>
  )
}
```

### Component Guidelines

1. **Function components only** - No class components
2. **Named exports** - No default exports
3. **Props interface** - Always define props type
4. **Destructure props** - In function signature
5. **Hooks at top** - Before any logic
6. **Early returns** - For loading/error states

### State Management (Zustand)

```typescript
// stores/game-store.ts
import { create } from 'zustand'

interface GameState {
  currentSave: GameSave | null
  isLoading: boolean
  loadSave: (id: string) => Promise<void>
}

export const useGameStore = create<GameState>((set) => ({
  currentSave: null,
  isLoading: false,
  loadSave: async (id) => {
    set({ isLoading: true })
    const save = await api.getSave(id)
    set({ currentSave: save, isLoading: false })
  },
}))
```

## API Routes (Hono)

### Route Structure

```typescript
// routes/game.ts
import { Hono } from 'hono'
import type { Env } from '../index'

export const gameRoutes = new Hono<{ Bindings: Env }>()

// GET /api/game/state/:saveId
gameRoutes.get('/state/:saveId', async (c) => {
  const saveId = c.req.param('saveId')
  // ... implementation
  return c.json({ data })
})

// POST /api/game/match/simulate
gameRoutes.post('/match/simulate', async (c) => {
  const body = await c.req.json()
  // ... implementation
  return c.json({ result })
})
```

### Response Format

Always return consistent JSON structure:

```typescript
// Success
return c.json({
  data: result,
  message: 'Optional message',
})

// Error
return c.json({
  error: 'Error type',
  message: 'Human-readable message',
}, 400)
```

## Game Logic (packages/core)

### Pure Functions

Core game logic should be pure (no side effects):

```typescript
// Good - pure function
function calculateOverall(player: Player): number {
  return weightedAverage(player.attributes, positionWeights[player.position])
}

// Bad - side effect
function calculateOverall(player: Player): number {
  player.cachedOverall = weightedAverage(...) // Mutation!
  return player.cachedOverall
}
```

### Immutable Updates

Return new objects instead of mutating:

```typescript
// Good
function developPlayer(player: Player): Player {
  return {
    ...player,
    age: player.age + 1,
    attributes: improveAttributes(player.attributes),
  }
}

// Bad
function developPlayer(player: Player): void {
  player.age += 1 // Mutation!
}
```

### Generator Functions for Live Simulation

Use generators for step-by-step simulation:

```typescript
function* simulateMatchLive(config: MatchConfig): Generator<MatchState> {
  for (let minute = 0; minute <= 90; minute++) {
    yield simulateMinute(state, minute)
  }
}
```

## Database (Drizzle)

### Schema Conventions

```typescript
// Use singular table names
export const player = sqliteTable('player', {
  id: text('id').primaryKey(),
  // Use snake_case for column names
  teamId: text('team_id').references(() => team.id),
  // Always include timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

### Query Patterns

```typescript
// Select with relations
const playerWithTeam = await db.query.player.findFirst({
  where: eq(player.id, playerId),
  with: { team: true },
})

// Insert with returning
const [newPlayer] = await db.insert(player).values(data).returning()
```

## Error Handling

### API Errors

```typescript
// Use Hono's built-in error handling
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

// Throw HTTPException for known errors
import { HTTPException } from 'hono/http-exception'

if (!save) {
  throw new HTTPException(404, { message: 'Save not found' })
}
```

### Client-Side Errors

```typescript
// Use try-catch with specific handling
try {
  await api.simulateMatch(data)
} catch (error) {
  if (error instanceof ApiError) {
    showToast(error.message)
  } else {
    showToast('An unexpected error occurred')
    console.error(error)
  }
}
```

## Testing

### Test File Location

Tests live next to source files:

```
src/
├── match/
│   ├── index.ts
│   └── index.test.ts
```

### Test Structure

```typescript
import { describe, it, expect } from 'vitest'
import { simulateMatch } from './index'

describe('simulateMatch', () => {
  it('should return a valid result', () => {
    const result = simulateMatch(mockConfig)
    expect(result.homeScore).toBeGreaterThanOrEqual(0)
  })

  it('should generate events', () => {
    const result = simulateMatch(mockConfig)
    expect(result.events.length).toBeGreaterThan(0)
  })
})
```

## Git Conventions

### Branch Names

- `feature/match-simulation`
- `fix/player-development-bug`
- `chore/update-dependencies`

### Commit Messages

```
type: short description

Longer explanation if needed.

Types: feat, fix, docs, style, refactor, test, chore
```

Examples:
- `feat: add match simulation engine`
- `fix: correct player overall calculation`
- `docs: update game design document`

## Comments

### When to Comment

1. **Why, not what** - Explain reasoning, not obvious code
2. **Complex algorithms** - Document the approach
3. **Workarounds** - Explain why it's needed
4. **TODO markers** - For planned improvements

```typescript
// Good - explains why
// Using weighted random instead of pure random to make
// stronger teams more likely to score, matching real football
const goalChance = calculateWeightedChance(attackStrength, defenseStrength)

// Bad - states the obvious
// Add one to the counter
counter += 1
```

### JSDoc for Public APIs

```typescript
/**
 * Simulates a complete football match minute by minute.
 *
 * @param config - Match configuration including teams and tactics
 * @returns Complete match result with all events
 *
 * @example
 * const result = simulateMatch({
 *   homeTeam,
 *   awayTeam,
 *   homeTactics,
 *   awayTactics,
 * })
 */
export function simulateMatch(config: MatchConfig): MatchResult
```
