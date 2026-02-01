# RetroFoot

A nostalgic browser-based football management game inspired by Elifoot and Brasfoot.

## Overview

RetroFoot is a football manager game where you take control of a club, manage your squad, set tactics, and compete in league competition. Built with modern web technologies but designed with a retro aesthetic.

## Tech Stack

- **Monorepo:** Nx + pnpm
- **Frontend:** React 19 + Vite + Tailwind CSS
- **Backend:** Hono (Cloudflare Workers)
- **Database:** Cloudflare D1 (SQLite)
- **Auth:** Better Auth

## Project Structure

```
retrofoot/
├── apps/
│   ├── web/           # React frontend
│   └── api/           # Hono API
├── packages/
│   ├── core/          # Game engine (pure TypeScript)
│   └── db/            # Database schemas (Drizzle)
└── docs/              # Documentation
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

```bash
# Install dependencies
pnpm install
```

### Development

```bash
# Start frontend (localhost:3000)
pnpm --filter @retrofoot/web dev

# Start API (localhost:8787)
pnpm --filter @retrofoot/api dev
```

### Type Checking

```bash
# All packages
pnpm -r typecheck

# Specific package
pnpm --filter @retrofoot/core typecheck
```

### Testing

```bash
# Run tests
pnpm --filter @retrofoot/core test
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - Technical design and stack
- [Game Design](docs/GAME_DESIGN.md) - Gameplay mechanics and rules
- [Data Models](docs/DATA_MODELS.md) - Type definitions and schemas
- [Conventions](docs/CONVENTIONS.md) - Code style and patterns
- [MVP Scope](docs/MVP_SCOPE.md) - Feature roadmap
- [AI Guide](docs/AI_GUIDE.md) - Guide for AI coding agents

## Deployment

Deployed on Cloudflare:

- **Frontend:** Cloudflare Pages
- **API:** Cloudflare Workers
- **Database:** Cloudflare D1

Push to `main` triggers automatic deployment.

## License

MIT
