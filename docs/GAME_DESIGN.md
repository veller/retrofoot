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

Progression is match-driven and conservative. Overall changes indirectly through attribute changes.

#### In-match growth formula

Growth is evaluated only for players who played (`minutesPlayed > 0`) and still have room to grow (`overall < potential`).

**Hard age gate:**

- Age `>= 40`: growth is disabled.

**Age multiplier (`ageMult`):**

- `<=21`: `1.00`
- `22-25`: `0.75`
- `26-29`: `0.45`
- `30-34`: `0.20`
- `35-39`: `0.05`
- `>=40`: `0.00`

**Match contribution inputs:**

- `minutesMult = clamp(minutesPlayed / 90, 0..1)`
- Team result score: win `+0.15`, draw `+0.03`, loss `-0.10`
- Role score:
  - ATT: `0.22*goals + 0.12*assists`
  - MID: `0.14*goals + 0.16*assists + 0.03*teamWin`
  - DEF: `0.08*goals + 0.08*assists + 0.14*cleanSheet - 0.04*goalsConceded`
  - GK: `0.20*cleanSheet - 0.06*goalsConceded`
- MVP-like bonus: `+0.15` when `rating >= 8.5` OR `goals >= 2` OR `(goals + assists) >= 3`

**Raw growth score:**

`growthScore = ageMult * minutesMult * clamp(0.40 + resultScore + roleScore + mvpBonus, 0..1.8)`

**Pacing and caps (per match):**

- Usually `+0` or `+1` attribute point.
- `+2` is only possible for exceptional young players (`age < 24`) with MVP-like output.
- If player is near potential (`growthRoom <= 2`), growth is capped to max `+1`.
- Growth points are distributed to position-biased attributes (GK grows GK stats more often, ATT grows attacking stats, etc.).

#### In-match decline

- Decline checks apply for older players (`age >= 30`) after poor performances.
- Physical attributes (`speed`, `stamina`, `strength`) are more likely to decline.

#### Season-end standout bonus

At season transition, a rare bonus pass runs before reset:

- Eligible profile (conservative): active, young (`<24`), meaningful minutes, and still below potential.
- Impact score uses season output (`seasonGoals`, `seasonAssists`, `seasonAvgRating`) plus team success.
- DEF/GK also get defensive credit from team goals conceded per game.
- Reward is at most `+1` attribute point.

This keeps growth realistic over a season while allowing true breakout campaigns to matter.

### Player energy

Each player has **energy** (1–100) representing match fatigue:

- **Start**: New game or season start sets energy to 100.
- **Drain**: Playing matches reduces energy. Drain scales with minutes played, tactical posture (attacking > balanced > defensive), age (older players drain faster), and position (goalkeepers drain less). Substitutes and partial minutes drain proportionally.
- **Recovery**: Between rounds, all players in the squad recover a fixed amount of energy (e.g. +12 per round), so one match per week roughly offsets one match’s drain.
- **Performance**: In-match performance is scaled by energy: 100 = full strength; lower energy applies a penalty to effective overall (e.g. 60 energy ≈ 10–15% off, very low energy = barely perform).
- **Opponents**: AI teams use a round-based effective energy (no per-team persistence): mid-season opponents are moderately fatigued, end-of-season more so, so the player doesn’t face “infinite energy” opponents every match.

Energy is shown on the lineup view (pitch and bench) so the manager can rotate the squad.

### Form (match ratings)

Match ratings (0–10) from the last five games are shown as a simple form indicator:

- **HOT** — Shown only when form is improving (last 2 games’ average is better than earlier games) **and** the latest game rating did not drop versus the previous one. One bad last game removes HOT so the rule is easy to understand.
- **No badge** — All other cases (not enough games, stable, or declining). There is no separate "cold" or "declining" badge; the UI is HOT or neutral only.

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
