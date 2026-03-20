# Multiplayer MVP

Scope for **online / friends** mode. Single-player roadmap stays in [MVP_SCOPE.md](./MVP_SCOPE.md).

## Goals (v1)

- Friends create a **lobby**, share an **invite code**, join, and see each other in the lobby.
- **Scheduled kickoff** + **live** synchronized match + **half-time** lineup change (server-coordinated) — see architecture plan in the repo (Durable Object + D1).
- **Separate data** from offline saves: `online_*` tables, not `saves`.

## Implemented so far

- D1 schema + migrations `0011_online_mode`, `0012_online_leagues_current_round` (`current_round` on `online_leagues`, default `1`).
- API: lobby + `POST .../start` as before; plus `GET .../standings`, `GET .../fixtures?round=`, `GET .../fixtures/:fixtureId`, `GET .../me`, `POST .../fixtures/:fixtureId/session`, WebSocket `.../match/:fixtureId/ws` → **MatchRoom** DO (member + participant checks).
- **Start league**: seeds `N` random clubs from core `TEAMS` (`N` = lobby size), full squads from `ALL_PLAYERS`, round-robin `online_fixtures` (home/away), `online_standings`, random assignment of one club per member. League status → `active`; `settings.seasonLabel` + `settings.startedAt`; `current_round` set to `1`.
- Web: `/online`, `/online/league/:id` (lobby + **Start league** for host when ≥2), `/online/league/:id/season` (table + fixtures), **Play online** on home; active leagues also link to season from the online list.
- **Analytics split**: offline → `analytics_events` + `/api/analytics/events`; online → `online_analytics_events` + `/api/analytics/online/events` (`trackOnlineEvent` in `apps/web/src/lib/analytics/online.ts`). Server logs `online_league_started` when the host starts (not client-postable).

## Next steps

1. **MatchRoom DO**: drive **@retrofoot/core** ticks, half-time gate, persist to D1 (`online_fixtures`, `online_match_events`, standings).
2. Optional: `docs/ONLINE_MODE.md` for state machine and DO protocol.

## Match room (beta)

- **Wrangler**: `MATCH_ROOM` binding + migration `online-match-room-v1` (`new_sqlite_classes = ["MatchRoom"]`). Deploy API so the migration runs before relying on WS in prod.
- **API**: `POST /api/online/leagues/:leagueId/fixtures/:fixtureId/session` (participants only) ensures `online_match_sessions`; WebSocket at `GET /api/online/match/:fixtureId/ws` (same auth).
- **Web**: `/online/league/:leagueId/match/:fixtureId` — connect + echo UI; **Live room** link on season page for unplayed fixtures where you’re home or away.
- **Dev**: Vite `/api` proxy has `ws: true` for local WebSocket upgrades.

**Local setup (migrations, two-account flow, optional solo-dev flags):** [LOCAL_ONLINE_DEV.md](./LOCAL_ONLINE_DEV.md).

## Out of scope (early MVP)

- Random public matchmaking / full 20-team auto leagues.
- Importing an offline `save` into an online league (possible later).

## Event catalogs (online analytics)

Allowlisted client events (see `CLIENT_POSTABLE_ONLINE_ANALYTICS_EVENTS` in API):

- `online_lobby_created`
- `online_league_joined`
- `online_lobby_viewed`

Server-only (same table, not via browser POST):

- `online_league_started`

Offline events are unchanged (`CLIENT_POSTABLE_ANALYTICS_EVENTS`).
