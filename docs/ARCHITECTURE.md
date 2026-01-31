# RetroFoot Architecture

## Overview

RetroFoot is a browser-based football management game inspired by classic titles like Elifoot and Brasfoot. It's built as a modern web application using a TypeScript-first stack deployed on Cloudflare's edge infrastructure.

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Monorepo** | Nx + pnpm | Project organization, build orchestration |
| **Frontend** | React 19 + Vite | Single-page application |
| **Styling** | Tailwind CSS | Utility-first CSS with pixel art accents |
| **Backend** | Hono | Lightweight API framework on Cloudflare Workers |
| **Database** | Cloudflare D1 (SQLite) | Edge database for game saves |
| **ORM** | Drizzle | Type-safe database queries |
| **Auth** | Better Auth | User authentication |
| **Deployment** | Cloudflare Pages + Workers | Edge hosting |

## Project Structure

```
retrofoot/
├── apps/
│   ├── web/                 # React frontend (→ Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── features/    # Feature-specific modules
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # Utilities, API client
│   │   │   └── pages/       # Route components
│   │   ├── public/          # Static assets
│   │   └── index.html
│   │
│   └── api/                 # Hono API (→ Cloudflare Workers)
│       ├── src/
│       │   ├── routes/      # API route handlers
│       │   ├── services/    # Business logic services
│       │   └── middleware/  # Hono middleware
│       └── wrangler.toml    # Cloudflare Worker config
│
├── packages/
│   ├── core/                # Game engine (pure TypeScript)
│   │   └── src/
│   │       ├── match/       # Match simulation engine
│   │       ├── player/      # Player system (stats, development)
│   │       ├── team/        # Team management
│   │       ├── season/      # Season, fixtures, standings
│   │       └── types/       # Shared type definitions
│   │
│   └── db/                  # Database layer
│       ├── src/
│       │   └── schema/      # Drizzle schema definitions
│       └── migrations/      # D1 migrations
│
└── docs/                    # Documentation
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React App (apps/web)                                     │  │
│  │  - UI Components                                          │  │
│  │  - Zustand state management                               │  │
│  │  - Hono RPC client (type-safe API calls)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Hono API (apps/api)                                      │  │
│  │  - Authentication (Better Auth)                           │  │
│  │  - Game state management                                  │  │
│  │  - Uses @retrofoot/core for game logic                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Cloudflare D1 (SQLite)                                   │  │
│  │  - User accounts                                          │  │
│  │  - Game saves                                             │  │
│  │  - Teams, players, fixtures                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Pure TypeScript Game Engine (`packages/core`)

The game logic is completely separated from infrastructure:
- **No runtime dependencies** - Pure TypeScript functions
- **Deterministic** - Same inputs produce same outputs
- **Testable** - Can be unit tested without mocking
- **Portable** - Can run on frontend, backend, or in tests

### 2. Edge-First Architecture

Everything runs on Cloudflare's edge network:
- **Low latency** - Data processed close to users
- **Cost effective** - Free tier covers significant usage
- **Scalable** - Automatic scaling with no configuration
- **Simple** - No servers to manage

### 3. Save-Per-User Model

Each user's game save is stored in the shared D1 database:
- One free save per user (MVP)
- Future: Multiple saves with payment tier

### 4. Offline Considerations

While the game is online-first (browser-based):
- Game logic in `@retrofoot/core` could support offline play
- Future: Service worker caching for assets

## Deployment

### Development

```bash
# Install dependencies
pnpm install

# Start frontend dev server (localhost:3000)
pnpm --filter @retrofoot/web dev

# Start API dev server (localhost:8787)
pnpm --filter @retrofoot/api dev
```

### Production

Push to `main` branch triggers:
1. **Cloudflare Pages** builds and deploys `apps/web`
2. **Cloudflare Workers** deploys `apps/api`

Configured via GitHub integration (not GitHub Actions).

## Environment Variables

### API (apps/api)

Set via `wrangler secret put`:
- `BETTER_AUTH_SECRET` - Auth session encryption key

### Frontend (apps/web)

Build-time environment (in `.env`):
- `VITE_API_URL` - API base URL (defaults to `/api` for same-origin)

## Future Considerations

1. **Multiplayer** - WebSocket via Cloudflare Durable Objects
2. **Multiple leagues** - Additional D1 databases or tables
3. **Mobile app** - React Native sharing `@retrofoot/core`
4. **Mod support** - Custom team/player data import
