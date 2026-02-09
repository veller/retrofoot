# RetroFoot Data Models

## Overview

This document describes all data structures used in RetroFoot. Types are defined in `packages/core/src/types/` and database schemas in `packages/db/src/schema/`.

## Player

Represents a football player in the game.

```typescript
interface Player {
  id: string;
  name: string;
  nickname?: string; // e.g., "Bunda" for Hulk-inspired player
  age: number; // 17-45
  nationality: string; // e.g., "Brazil"
  position: Position; // GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST
  preferredFoot: 'left' | 'right' | 'both';
  attributes: PlayerAttributes;
  potential: number; // 1-99, max possible overall
  developmentRate: number; // 0.5-1.5, how fast they develop
  morale: number; // 1-100
  fitness: number; // 1-100
  energy: number; // 1-100, match fatigue; drains when playing, recovers between rounds
  injured: boolean;
  injuryWeeks: number;
  contractEndSeason: number; // e.g., 2026
  wage: number; // Weekly wage
  marketValue: number; // Transfer value
}
```

### PlayerAttributes

```typescript
interface PlayerAttributes {
  // Physical (3)
  speed: number; // 1-99
  strength: number; // 1-99
  stamina: number; // 1-99

  // Technical (5)
  shooting: number; // 1-99
  passing: number; // 1-99
  dribbling: number; // 1-99
  heading: number; // 1-99
  tackling: number; // 1-99

  // Mental (4)
  positioning: number; // 1-99
  vision: number; // 1-99
  composure: number; // 1-99
  aggression: number; // 1-99

  // Goalkeeping (3)
  reflexes: number; // 1-99
  handling: number; // 1-99
  diving: number; // 1-99
}
```

### Position

```typescript
type Position =
  | 'GK' // Goalkeeper
  | 'CB' // Center Back
  | 'LB' // Left Back
  | 'RB' // Right Back
  | 'CDM' // Defensive Midfielder
  | 'CM' // Central Midfielder
  | 'CAM' // Attacking Midfielder
  | 'LM' // Left Midfielder
  | 'RM' // Right Midfielder
  | 'LW' // Left Winger
  | 'RW' // Right Winger
  | 'ST'; // Striker
```

## Team

Represents a football club.

```typescript
interface Team {
  id: string;
  name: string; // Full name, e.g., "Galo FC"
  shortName: string; // 3-letter code, e.g., "GAL"
  badgeUrl?: string; // Pixel art badge image
  primaryColor: string; // Hex color, e.g., "#000000"
  secondaryColor: string;
  stadium: string; // Stadium name
  capacity: number; // Stadium capacity
  reputation: number; // 1-100, affects transfers
  budget: number; // Transfer budget
  wageBudget: number; // Weekly wage budget
  players: Player[]; // Squad
}
```

## Tactics

Team tactics for a match.

```typescript
interface Tactics {
  formation: FormationType;
  posture: TacticalPosture;
  lineup: string[]; // Player IDs in formation order (11)
  substitutes: string[]; // Player IDs on bench (7)
}

type FormationType =
  | '4-4-2'
  | '4-3-3'
  | '4-2-3-1'
  | '3-5-2'
  | '4-5-1'
  | '5-3-2'
  | '5-4-1'
  | '3-4-3';

type TacticalPosture = 'defensive' | 'balanced' | 'attacking';
```

## Match

### MatchEvent

Single event during a match.

```typescript
interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  description?: string; // Human-readable description
}

type MatchEventType =
  | 'goal'
  | 'own_goal'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'yellow_card'
  | 'red_card'
  | 'injury'
  | 'substitution'
  | 'chance_missed'
  | 'save'
  | 'corner'
  | 'free_kick'
  | 'offside';
```

### MatchResult

Complete result of a played match.

```typescript
interface MatchResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  attendance: number;
  date: string; // ISO date string
}
```

## Season

### Fixture

A scheduled match in the calendar.

```typescript
interface Fixture {
  id: string;
  round: number; // 1-38 for 20-team league
  homeTeamId: string;
  awayTeamId: string;
  date: string; // ISO date string
  played: boolean;
  result?: MatchResult;
}
```

### StandingEntry

Single row in the league table.

```typescript
interface StandingEntry {
  position: number; // 1-20
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
```

### Season

Complete season state.

```typescript
interface Season {
  year: string; // e.g., "2024/25"
  currentRound: number;
  totalRounds: number;
  standings: StandingEntry[];
  fixtures: Fixture[];
  transferWindowOpen: boolean;
}
```

## Game Save

Complete saved game state.

```typescript
interface GameSave {
  id: string;
  userId: string;
  name: string; // User-chosen save name
  createdAt: string;
  updatedAt: string;
  playerTeamId: string; // Team the player manages
  currentSeason: Season;
  managerName: string;
  managerReputation: number; // 1-100
}
```

## Transfers

```typescript
interface TransferOffer {
  id: string;
  playerId: string;
  fromTeamId: string;
  toTeamId: string;
  offerAmount: number;
  wage: number;
  contractYears: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}
```

## Database Schema

The database schema (Drizzle/D1) mirrors these types with relational structure:

### Tables

| Table          | Description                       |
| -------------- | --------------------------------- |
| `users`        | User accounts                     |
| `sessions`     | Auth sessions                     |
| `accounts`     | OAuth providers                   |
| `saves`        | Game saves (one per user for MVP) |
| `teams`        | Teams within a save               |
| `players`      | Players within a save             |
| `standings`    | League standings                  |
| `fixtures`     | Scheduled matches                 |
| `match_events` | Events from played matches        |
| `transfers`    | Transfer history                  |
| `tactics`      | Saved tactics per team            |

### Relationships

```
users
  └── saves (1:many)
        ├── teams (1:many)
        │     └── players (1:many)
        ├── standings (1:many)
        ├── fixtures (1:many)
        │     └── match_events (1:many)
        ├── transfers (1:many)
        └── tactics (1:many)
```

## JSON Fields

Some fields store JSON for flexibility:

- `players.attributes` - PlayerAttributes object
- `tactics.lineup` - Array of player IDs
- `tactics.substitutes` - Array of player IDs

## ID Generation

All IDs use the format: `{entity}-{timestamp}-{random}`

Example: `player-1706745600000-4829`

This ensures:

- Uniqueness across distributed systems
- Sortability by creation time
- Human-readability for debugging
