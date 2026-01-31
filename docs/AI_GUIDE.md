# AI Agent Guide for RetroFoot

## Overview

This guide helps AI coding agents (Claude, GPT, Copilot, etc.) understand and work on the RetroFoot codebase effectively.

## Quick Reference

### Project Structure

```
retrofoot/
├── apps/web/          # React frontend (Vite)
├── apps/api/          # Hono backend (Cloudflare Workers)
├── packages/core/     # Game logic (pure TypeScript)
├── packages/db/       # Database schemas (Drizzle)
└── docs/              # Documentation (you are here)
```

### Key Commands

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm --filter @retrofoot/web dev    # Frontend: localhost:3000
pnpm --filter @retrofoot/api dev    # API: localhost:8787

# Type checking
pnpm --filter @retrofoot/core typecheck
pnpm --filter @retrofoot/web typecheck
pnpm --filter @retrofoot/api typecheck

# Run tests
pnpm --filter @retrofoot/core test

# Database migrations
pnpm --filter @retrofoot/api db:generate
pnpm --filter @retrofoot/api db:migrate
```

### Package Dependencies

```
@retrofoot/web
  └── depends on @retrofoot/core (game types, utilities)

@retrofoot/api
  ├── depends on @retrofoot/core (game logic)
  └── depends on @retrofoot/db (database operations)

@retrofoot/core
  └── no internal dependencies (pure TypeScript)

@retrofoot/db
  └── no internal dependencies
```

## When Working on Features

### Frontend (apps/web)

**Location:** `apps/web/src/`

**Key files:**
- `App.tsx` - Router setup
- `pages/*.tsx` - Route components
- `components/*.tsx` - Reusable UI
- `hooks/*.ts` - Custom React hooks
- `lib/api.ts` - API client (when created)

**Patterns:**
- Use functional components with hooks
- Use Zustand for state management
- Use Tailwind CSS for styling
- Import types from `@retrofoot/core/types`

**Example task:** "Add a player detail modal"
1. Create `components/PlayerModal.tsx`
2. Import `Player` type from `@retrofoot/core/types`
3. Use Tailwind for styling
4. Add state management in relevant page component

### Backend (apps/api)

**Location:** `apps/api/src/`

**Key files:**
- `index.ts` - Hono app setup, middleware
- `routes/*.ts` - API route handlers
- `services/*.ts` - Business logic

**Patterns:**
- Use Hono's typed context for environment
- Use `@retrofoot/db` for database operations
- Use `@retrofoot/core` for game logic
- Return consistent JSON responses

**Example task:** "Add endpoint to get player by ID"
1. Add route in `routes/game.ts`
2. Use Drizzle query from `@retrofoot/db`
3. Return typed response

### Game Logic (packages/core)

**Location:** `packages/core/src/`

**Key modules:**
- `types/` - All shared types
- `match/` - Match simulation engine
- `player/` - Player generation, development
- `team/` - Team management, tactics
- `season/` - Season, fixtures, standings

**Patterns:**
- Pure functions (no side effects)
- Immutable data (return new objects)
- No external dependencies
- Export from `index.ts` files

**Example task:** "Add injury probability to match simulation"
1. Modify `match/index.ts`
2. Add injury event generation in `simulateMinute()`
3. Update `MatchEventType` in `types/index.ts` if needed
4. Keep function pure (deterministic for same inputs)

### Database (packages/db)

**Location:** `packages/db/src/`

**Key files:**
- `schema/index.ts` - All table definitions
- `index.ts` - Database client export

**Patterns:**
- Use Drizzle ORM syntax
- SQLite/D1 compatible types
- Export types with `$inferSelect`/`$inferInsert`

**Example task:** "Add player injury tracking table"
1. Add table definition in `schema/index.ts`
2. Export types
3. Run `pnpm --filter @retrofoot/db generate` for migration

## Common Tasks

### Adding a New API Endpoint

```typescript
// apps/api/src/routes/game.ts

// 1. Add the route handler
gameRoutes.get('/player/:id', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DB)

  // 2. Query database
  const player = await db.query.players.findFirst({
    where: eq(players.id, id),
  })

  // 3. Handle not found
  if (!player) {
    return c.json({ error: 'Player not found' }, 404)
  }

  // 4. Return response
  return c.json({ data: player })
})
```

### Adding a New React Component

```tsx
// apps/web/src/components/PlayerCard.tsx

import type { Player } from '@retrofoot/core/types'
import { calculateOverall } from '@retrofoot/core'

interface PlayerCardProps {
  player: Player
  onClick?: () => void
}

export function PlayerCard({ player, onClick }: PlayerCardProps) {
  const overall = calculateOverall(player)

  return (
    <div
      onClick={onClick}
      className="bg-slate-800 p-4 border border-slate-700 cursor-pointer hover:border-pitch-500"
    >
      <div className="flex justify-between">
        <span className="text-white font-medium">
          {player.nickname || player.name}
        </span>
        <span className="text-pitch-400">{overall}</span>
      </div>
      <div className="text-slate-400 text-sm">
        {player.position} | Age {player.age}
      </div>
    </div>
  )
}
```

### Adding Game Logic

```typescript
// packages/core/src/player/index.ts

// Pure function - no side effects
export function calculateInjuryRisk(player: Player): number {
  // Base risk increases with age
  let risk = Math.max(0, (player.age - 28) * 0.02)

  // Lower fitness increases risk
  risk += (100 - player.fitness) * 0.001

  // Previous injuries increase risk
  if (player.injuryWeeks > 0) {
    risk += 0.05
  }

  return Math.min(0.3, risk) // Cap at 30%
}
```

### Adding a Database Table

```typescript
// packages/db/src/schema/index.ts

export const injuries = sqliteTable('injuries', {
  id: text('id').primaryKey(),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'muscle', 'ligament', etc.
  weeksRemaining: integer('weeks_remaining').notNull(),
  occurredAt: text('occurred_at').notNull(), // Match ID or date
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type Injury = typeof injuries.$inferSelect
export type NewInjury = typeof injuries.$inferInsert
```

## Testing Guidance

### Unit Tests (packages/core)

```typescript
// packages/core/src/player/index.test.ts
import { describe, it, expect } from 'vitest'
import { generatePlayer, developPlayer } from './index'

describe('generatePlayer', () => {
  it('generates player with valid attributes', () => {
    const player = generatePlayer({ position: 'ST' })

    expect(player.position).toBe('ST')
    expect(player.age).toBeGreaterThanOrEqual(17)
    expect(player.age).toBeLessThanOrEqual(35)
    expect(player.attributes.shooting).toBeGreaterThanOrEqual(1)
    expect(player.attributes.shooting).toBeLessThanOrEqual(99)
  })
})
```

### Integration Tests (apps/api)

```typescript
// Test API endpoints using Hono's test client
import { testClient } from 'hono/testing'
import app from '../src/index'

describe('GET /api/health', () => {
  it('returns healthy status', async () => {
    const res = await testClient(app).api.health.$get()
    expect(res.status).toBe(200)
  })
})
```

## Debugging Tips

### Check Type Errors

```bash
# Run typecheck across all packages
pnpm -r typecheck
```

### Verify Database Schema

```bash
# Generate migration without applying
pnpm --filter @retrofoot/db generate
# Review the generated SQL in packages/db/migrations/
```

### Test Game Logic

```bash
# Run core package tests
pnpm --filter @retrofoot/core test
```

## Important Constraints

1. **No real team/player names** - Use fictional names only
2. **No emojis in code** - Unless explicitly requested
3. **Cloudflare Workers limits** - 10ms CPU time, 128MB memory
4. **D1 limits** - 5GB storage, 5M reads/day on free tier
5. **Keep core pure** - No I/O, no async in `@retrofoot/core`

## File Templates

### New React Page

```tsx
// apps/web/src/pages/NewPage.tsx
export function NewPage() {
  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <h1 className="text-2xl font-bold text-white">Page Title</h1>
      {/* Content */}
    </div>
  )
}
```

### New API Route File

```typescript
// apps/api/src/routes/new-route.ts
import { Hono } from 'hono'
import type { Env } from '../index'

export const newRoutes = new Hono<{ Bindings: Env }>()

newRoutes.get('/', async (c) => {
  return c.json({ message: 'Hello' })
})
```

### New Core Module

```typescript
// packages/core/src/new-module/index.ts
import type { SomeType } from '../types'

export function newFunction(input: SomeType): SomeType {
  // Implementation
  return input
}
```

## Questions to Ask

When requirements are unclear, ask about:

1. **Data flow** - Where does this data come from/go to?
2. **Error cases** - What should happen if X fails?
3. **UI behavior** - Should this block interaction or run in background?
4. **Persistence** - Should this be saved to database or just state?
5. **Scope** - Is this for MVP or future enhancement?
