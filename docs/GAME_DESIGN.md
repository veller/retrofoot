# RetroFoot Game Design Document

## Game Overview

**RetroFoot** is a nostalgic football management game for the browser. Players take on the role of a club manager, handling squad selection, tactics, transfers, and guiding their team through a competitive league season.

**Inspiration:** Elifoot 98, Brasfoot, classic Football Manager titles

**Target Audience:** Casual nostalgic players who enjoy football management without the complexity of modern simulators

## Core Gameplay Loop

```
┌─────────────────────────────────────────────────────────┐
│                    SEASON START                         │
│            Pick your club, set initial tactics          │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                    MATCH DAY                            │
│  1. Review upcoming fixture                             │
│  2. Check squad fitness/injuries                        │
│  3. Select lineup and formation                         │
│  4. Set tactical posture                                │
│  5. SIMULATE MATCH (minute-by-minute)                   │
│  6. Make in-match substitutions/tactical changes        │
│  7. Review result and updated standings                 │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                  BETWEEN MATCHES                        │
│  - Scout transfer market                                │
│  - Buy/sell players                                     │
│  - Review player development                            │
│  - Check finances                                       │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                    SEASON END                           │
│  - Final standings determine fate                       │
│  - Top 4: Success! Continue next season                 │
│  - Bottom 4: Relegated = FIRED, wait for new job        │
│  - Transfer window opens                                │
│  - Players age, develop, or retire                      │
│  - Regens appear                                        │
└─────────────────────────────────────────────────────────┘
```

## Match Simulation

### Real-Time Display

Matches are simulated minute-by-minute with events displayed as they happen:

```
┌────────────────────────────────────────────────────────┐
│  GALO FC  2 - 1  FLAMINGO FC          67'             │
├────────────────────────────────────────────────────────┤
│  23' ⚽ GOAL! Bunda scores for Galo FC                 │
│  34' 🟨 Yellow card for Gabigou (Flamingo)            │
│  45' 🕐 Half-time: Galo FC 1 - 0 Flamingo FC          │
│  52' ⚽ GOAL! Gabigou equalizes for Flamingo!         │
│  67' ⚽ GOAL! Maestro puts Galo ahead!               │
│  ▶ Match in progress...                               │
└────────────────────────────────────────────────────────┘
```

### Pausable

Players can pause at any time to:

- Make substitutions (up to 5 per match)
- Change formation
- Adjust tactical posture

### Event Types

| Event            | Description                     |
| ---------------- | ------------------------------- |
| `goal`           | Goal scored                     |
| `own_goal`       | Own goal                        |
| `penalty_scored` | Penalty converted               |
| `penalty_missed` | Penalty saved/missed            |
| `yellow_card`    | Yellow card shown               |
| `red_card`       | Red card, player sent off       |
| `injury`         | Player injured during match     |
| `substitution`   | Player substituted              |
| `chance_missed`  | Missed scoring opportunity      |
| `save`           | Goalkeeper save                 |
| `corner`         | Corner kick awarded             |
| `free_kick`      | Free kick in dangerous position |

## Player System

### Attributes (15 total)

**Physical:**

- `speed` (1-99) - Sprint speed and acceleration
- `strength` (1-99) - Physical power in duels
- `stamina` (1-99) - Endurance over 90 minutes

**Technical:**

- `shooting` (1-99) - Finishing ability
- `passing` (1-99) - Pass accuracy and vision
- `dribbling` (1-99) - Ball control and skill moves
- `heading` (1-99) - Aerial ability
- `tackling` (1-99) - Defensive interceptions

**Mental:**

- `positioning` (1-99) - Reading the game
- `vision` (1-99) - Spotting opportunities
- `composure` (1-99) - Performance under pressure
- `aggression` (1-99) - Intensity and pressing

**Goalkeeping:**

- `reflexes` (1-99) - Shot-stopping reactions
- `handling` (1-99) - Catching and parrying
- `diving` (1-99) - Reach and agility

### Overall Rating Calculation

Overall is calculated based on position-weighted attributes:

| Position | Key Attributes                            |
| -------- | ----------------------------------------- |
| GK       | reflexes, handling, diving, positioning   |
| CB       | tackling, heading, strength, positioning  |
| LB/RB    | tackling, speed, stamina, passing         |
| CDM      | tackling, positioning, passing, strength  |
| CM       | passing, vision, stamina, positioning     |
| CAM      | passing, vision, dribbling, shooting      |
| LW/RW    | speed, dribbling, shooting, passing       |
| ST       | shooting, positioning, heading, composure |

### Player Development

Players improve or decline each season based on:

**Growth factors (age < 30):**

- `age` - Younger players develop faster
- `potential` - Maximum possible overall
- `developmentRate` - Individual growth speed (0.5-1.5)
- `minutesPlayed` - More game time = faster development

**Decline factors (age >= 30):**

- Physical attributes decline faster than mental
- Rate increases with age (30=slight, 35+=significant)

### Retirement

Players may retire based on:

- Age 33-35: 15% chance per season
- Age 35-38: 30% chance per season
- Age 38+: 50% chance per season
- Very low overall: Increased chance

### Regens

When players retire, new youth players appear:

- In club's youth academy (if your team)
- In transfer market
- Random names, positions, and attributes
- Potential based on league reputation

## Team Management

### Formations

| Formation | Style                     |
| --------- | ------------------------- |
| 4-4-2     | Balanced, classic         |
| 4-3-3     | Attacking, wing play      |
| 4-2-3-1   | Control, single striker   |
| 3-5-2     | Midfield dominance        |
| 4-5-1     | Defensive, counter-attack |
| 5-3-2     | Very defensive            |
| 5-4-1     | Park the bus              |
| 3-4-3     | All-out attack            |

### Tactical Posture

| Posture   | Effect                                         |
| --------- | ---------------------------------------------- |
| Defensive | +10% defense, -10% attack, less goals conceded |
| Balanced  | Standard performance                           |
| Attacking | +10% attack, -10% defense, more goals scored   |

### Squad Size

- Minimum: 18 players
- Maximum: 30 players
- Matchday squad: 11 starters + 7 substitutes

## Financial System (MVP)

### Transfer Budget

- Each club has a `budget` for transfers
- Buying players deducts from budget
- Selling players adds to budget
- Budget resets each season based on league position

### Player Valuation

```
baseValue = (overall / 50)^4 * 1,000,000

ageModifier:
  - Under 21: 0.6 to 1.0 (increasing)
  - 21-28: 1.0 (peak)
  - Over 28: 0.9 to 0.5 (decreasing)

marketValue = baseValue * ageModifier
```

### Wages (Future Enhancement)

Currently simplified. Future:

- Weekly wage budget
- Wage bill affects profitability
- Player demands based on quality

## Season Structure

### League Format

- **Série A:** 20 teams
- **Format:** Double round-robin (38 matches)
- **Points:** Win=3, Draw=1, Loss=0

### Calendar

- Season starts August
- One match per week
- Transfer window: Between seasons only (MVP)

### Relegation

- Bottom 4 teams relegated
- If player's team relegated = Manager FIRED
- Must wait for job offers from other clubs

## Progression & Meta

### Manager Reputation

- Starts at 50
- Increases with wins, titles
- Decreases with losses, relegation
- Affects job offers and player interest

### Job Offers

When fired or seeking new challenge:

- Clubs with vacancies may offer job
- Offers based on manager reputation
- Better reputation = bigger clubs interested

## MVP Scope (v0.1)

### Included

- Brasil Série A (20 teams, fictional names)
- Single season gameplay
- Match simulation with live events
- Basic formations and tactics
- Player attributes and overall
- League standings
- Transfer market (buy/sell)
- One save per account

### Not Included (Future)

- Multiple leagues/countries
- Cup competitions
- Youth academy management
- Detailed finances
- Player morale system
- Training
- Staff (coaches, scouts)
- Stadium upgrades
- Multiplayer
