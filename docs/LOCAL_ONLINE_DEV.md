# Local online (multiplayer) development

## Prerequisites

- **Local D1** has all migrations applied (including `online_*` tables).
- **API** and **web** run together; the Vite dev server proxies `/api` and WebSockets to the Worker.

## 1. Apply migrations (local D1)

From the repo root:

```bash
pnpm --filter @retrofoot/api db:migrate
```

This runs `wrangler d1 migrations apply retrofoot-db --local` using [`apps/api/wrangler.toml`](../apps/api/wrangler.toml). If you see `no such table: online_leagues`, migrations were not applied to the local database.

Lobby flows also need migration **`0013_online_lobby_pick_template`** (`lobby_pick_template_id` on `online_league_members`). Re-run the migrate command after pulling.

## 2. API: `wrangler dev`

```bash
pnpm --filter @retrofoot/api dev
```

Default port: **8787** (`[dev]` in `wrangler.toml`).

Create [`apps/api/.dev.vars`](../apps/api/.dev.vars) (gitignored) with at least:

```bash
BETTER_AUTH_SECRET=your-secret-at-least-32-characters-long
ENVIRONMENT=development
```

Optional (see below):

```bash
# Single-browser match room (sim + persist) — see Layer 2 in this doc
ONLINE_DEV_SINGLE_PLAYER_MATCH=1

# Companion member helper — see Layer 3
ONLINE_DEV_SECRET=your-long-random-local-only-secret
```

Production values in `wrangler.toml` `[vars]` are overridden by `.dev.vars` during `wrangler dev`.

## 3. Web: Vite

```bash
pnpm --filter @retrofoot/web dev
```

Default port **3000**; [`apps/web/vite.config.ts`](../apps/web/vite.config.ts) proxies `/api` to `http://localhost:8787` (including WebSocket upgrades).

Use the **same origin** the browser uses for the app (e.g. `http://localhost:3000`) so session cookies apply to proxied `/api` requests.

## 4. Full flow with two accounts (recommended)

The product expects **at least two real users** in D1 for:

- **Start league** — API requires two `online_league_members` before seeding.
- **Fixtures** — seeding with one club produces **no** round-robin fixtures (all pairings would be vs `BYE` and are skipped).
- **Live match room** — by default, **both** home and away managers must open the WebSocket.

**Setup:**

1. Register/login as **User A** → create lobby → you land on the league lobby.
2. Copy the **invite link** (`/online/join/…`) or code.
3. Open a **second browser profile** or **incognito** window.
4. Register/login as **User B** → open the invite link (or paste the code on `/online`).
5. As **User A (host)**, click **Start league** when ready.
6. For a **live match**, open the match room from **both** browsers (each side must be logged in as the manager of home or away).

## 5. Inspecting local D1

List users (for companion `userId` or debugging):

```bash
cd apps/api && pnpm exec wrangler d1 execute retrofoot-db --local \
  --command "SELECT id, email FROM users LIMIT 20"
```

## 6. Optional dev shortcuts

Documented in code and [`apps/api/src/lib/online-dev.ts`](../apps/api/src/lib/online-dev.ts):

| Mechanism | Purpose |
|-----------|---------|
| `ENVIRONMENT=development` + `ONLINE_DEV_SINGLE_PLAYER_MATCH=1` | One connected manager can start the DO sim and use a single **Continue** at half-time (not a multiplayer test). |
| `ENVIRONMENT=development` + `ONLINE_DEV_SECRET` + `POST /api/online/dev/leagues/:leagueId/add-companion` | Add a second **real** `users.id` as a lobby member without opening a second browser for the join step. |

Example (host session cookie required — use browser devtools or `curl` with your session cookie):

```bash
curl -sS -X POST "http://localhost:8787/api/online/dev/leagues/YOUR_LEAGUE_ID/add-companion" \
  -H "Content-Type: application/json" \
  -H "X-Online-Dev-Secret: $ONLINE_DEV_SECRET" \
  -H "Cookie: better-auth.session_token=..." \
  -d '{"companionUserId":"USER_ID_FROM_second_account"}'
```

**Security:** These paths are gated on `ENVIRONMENT === 'development'` and explicit secrets/flags. Never enable in production Workers.

## See also

- [MULTIPLAYER_MVP.md](./MULTIPLAYER_MVP.md) — product scope for online mode.
