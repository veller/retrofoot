# First Save Performance

This document covers how to measure and roll out improvements for first-save creation.

## What Changed

- `POST /api/save` now defaults to async setup and returns `202` quickly.
- `POST /api/save?mode=sync` is still available for baseline comparison.
- New endpoint: `GET /api/save/:id/setup-status`.
- `GET /api/save/:id` now returns `202` with setup progress when world generation is still running.
- Backend logs timing payloads for accepted/completed save setup.

## Baseline Measurement

Compare cold/warm latency between:

- Pages proxy: `https://retrofoot-web.pages.dev/api/save?mode=sync`
- Direct worker: `https://retrofoot-api.vellerbauer.workers.dev/api/save?mode=sync`

Use an authenticated session cookie copied from browser devtools:

```bash
node scripts/measure-save-latency.mjs \
  --cookie "__Secure-better-auth.session_token=<value>" \
  --team "retro-rangers" \
  --manager "Perf Tester"
```

The script performs:

- 2x sync calls against Pages (cold + warm)
- 2x sync calls against direct Worker (cold + warm)
- 1x async call against Pages (perceived UX latency)

## Key Rollout Metrics

- `POST /api/save` p50/p95 response time (`202` acceptance latency in async mode)
- Setup completion time (`save.create.async.completed` log)
- Time to first interactive screen after `START CAREER`
- Setup failure rate (count of `save.create.async.failed`)
- Completion success rate (ready status reached within 60s)

## Rollout Criteria

- p95 acceptance latency under 2s
- p95 background setup completion under 20s
- setup failure rate below 1%
- users can access interactive preparation screen immediately after create

## Operational Notes

- If background seeding fails, keep save in pending state and expose retry capability in a follow-up iteration.
- Keep sync mode temporarily for direct A/B verification and emergency fallback.
