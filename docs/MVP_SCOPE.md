# RetroFoot MVP Scope

## Version Roadmap

### v0.1 - Playable Core (MVP)

**Goal:** A complete, playable football manager experience for one season

#### Features

**Authentication**
- [x] User registration with email
- [x] Login/logout
- [x] Session management

**Game Saves**
- [ ] Create new game (pick team, name manager)
- [ ] Load existing save
- [ ] Auto-save after each action
- [ ] One save per user (free tier)

**Teams & Players**
- [ ] Brasil Série A (20 teams, fictional names)
- [ ] ~25 players per team
- [ ] Player attributes (15 stats)
- [ ] Player positions
- [ ] Overall rating calculation

**Match Simulation**
- [ ] Minute-by-minute simulation
- [ ] Live event display (goals, cards, etc.)
- [ ] Pause/resume during match
- [ ] Substitutions (up to 5)
- [ ] Formation changes mid-match
- [ ] Tactical posture changes

**Tactics**
- [ ] 8 formations (4-4-2, 4-3-3, etc.)
- [ ] 3 tactical postures (defensive, balanced, attacking)
- [ ] Auto-select best lineup
- [ ] Manual lineup selection

**Season**
- [ ] 38-round league calendar
- [ ] Live standings table
- [ ] Fixture list
- [ ] Round advancement
- [ ] Season end handling

**Transfers**
- [ ] View transfer market
- [ ] Buy players (budget permitting)
- [ ] Sell players
- [ ] Basic valuation system

**UI/UX**
- [ ] Home screen (new game, load game)
- [ ] Main game view with tabs
- [ ] Squad management screen
- [ ] Match day screen
- [ ] League table screen
- [ ] Transfer market screen
- [ ] Pixel art aesthetic touches

#### Not in v0.1

- Multiple leagues/countries
- Cup competitions
- Youth academy
- Training
- Detailed finances (wages, sponsorships)
- Player morale deep system
- Staff management
- Stadium management
- Multiplayer
- Multiple saves per user
- Mobile-optimized UI

---

### v0.2 - Player Development

**Goal:** Make seasons feel meaningful with player growth

#### Features

- [ ] Player development over season
- [ ] Age-based progression/decline
- [ ] Potential system
- [ ] Player retirement
- [ ] Regen generation
- [ ] Contract expiry system

---

### v0.3 - Career Progression

**Goal:** Multi-season career experience

#### Features

- [ ] Manager reputation system
- [ ] Job offers from other clubs
- [ ] Relegation = fired
- [ ] Promotion/relegation working
- [ ] Série B (second division)
- [ ] Transfer history

---

### v0.4 - Enhanced Gameplay

**Goal:** More depth and polish

#### Features

- [ ] Cup competition (Copa do Brasil style)
- [ ] Player morale system
- [ ] Injury system (duration, recovery)
- [ ] Match tactics (press intensity, etc.)
- [ ] Better AI team decisions

---

### v0.5 - Monetization & Scale

**Goal:** Sustainable free-to-play model

#### Features

- [ ] Multiple saves (paid feature)
- [ ] Additional leagues (paid)
- [ ] Custom team creation
- [ ] Import/export save data
- [ ] Achievement system

---

## Technical Milestones

### Phase 1: Foundation (Current)

- [x] Monorepo setup (Nx + pnpm)
- [x] Frontend scaffolding (React + Vite)
- [x] Backend scaffolding (Hono)
- [x] Database schema (Drizzle + D1)
- [x] Core game engine types
- [x] Match simulation engine
- [x] Player generation system
- [x] Season/fixture generation

### Phase 2: Integration

- [ ] Connect frontend to API
- [ ] Implement auth flow
- [ ] Save game CRUD operations
- [ ] Load initial team data
- [ ] Database migrations deployed

### Phase 3: Gameplay

- [ ] Implement match UI
- [ ] Implement squad management UI
- [ ] Implement standings UI
- [ ] Implement transfer market UI
- [ ] Wire up all game actions

### Phase 4: Polish

- [ ] Add pixel art badges
- [ ] Sound effects (optional)
- [ ] Loading states
- [ ] Error handling
- [ ] Mobile responsiveness

### Phase 5: Launch

- [ ] Production deployment
- [ ] Domain setup
- [ ] Analytics integration
- [ ] Error monitoring

---

## Task Breakdown (v0.1)

### High Priority

1. **Create Brasil Série A team data**
   - 20 teams with fictional names
   - Pixel-inspired badges
   - Initial player rosters

2. **Implement new game flow**
   - Team selection screen
   - Manager name input
   - Initialize save in database

3. **Build match day UI**
   - Pre-match: lineup selection
   - During: live event ticker
   - Post-match: result summary

4. **Connect API to frontend**
   - Set up Hono RPC client
   - Implement API hooks
   - Handle loading/error states

### Medium Priority

5. **Implement squad management**
   - View all players
   - Sort/filter by position
   - View player details

6. **Build standings table**
   - Current league position
   - Points, goal difference
   - Highlight player's team

7. **Implement season progression**
   - "Play next match" action
   - Simulate other matches
   - Update standings

### Lower Priority

8. **Transfer market basics**
   - List available players
   - Make purchase offer
   - Sell own players

9. **Save/load reliability**
   - Ensure auto-save works
   - Handle edge cases
   - Conflict resolution

10. **Visual polish**
    - Consistent styling
    - Animations/transitions
    - Responsive layout

---

## Definition of Done (MVP)

MVP is complete when a user can:

1. Create an account
2. Start a new game with a chosen team
3. View their squad and set lineup
4. Play a match and see live events
5. View updated standings
6. Progress through multiple rounds
7. Buy/sell players in transfer market
8. Complete a full season
9. See season-end summary (position, stats)

All without encountering blocking bugs or data loss.
