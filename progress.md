Original prompt: Build a release-to-free-market feature for both human and AI clubs, with a realistic dynamic release compensation model (can be zero), UI actions in Squad modal and Transfers > My Transfers, no negotiation flow, and immediate free-agent state updates after release.

Feature work (formation persistence + live tactics + eligibility + tactical engine):
- Added core formation helpers in `packages/core/src/team/index.ts`:
  - shared `FORMATION_OPTIONS`, `DEFAULT_FORMATION`, formation normalization,
  - availability/eligibility checks by position,
  - fallback to first eligible formation for default tactics.
- Added tactical constants module `packages/core/src/match/tactical-constants.ts` and integrated it in match simulation:
  - formation matchup and posture now influence possession, event rate, and chance conversion.
  - tactical impact recalculated each minute from current match tactics (supports live changes).
- Added tactics persistence API in `apps/api/src/routes/save.ts`:
  - `GET /api/save/:id/tactics/:teamId`
  - `PUT /api/save/:id/tactics/:teamId`
  - includes validation (posture, formation normalization, roster eligibility) and upsert behavior.
- Added unique DB index for save+team tactics:
  - schema update in `packages/db/src/schema/index.ts`
  - migration `packages/db/migrations/0006_tactics_unique.sql`.
- Added web tactics API helpers in `apps/web/src/hooks/useSaveData.ts` and exported via `apps/web/src/hooks/index.ts`.
- GamePage now hydrates tactics from API (not hardcoded 4-3-3), persists updates, and disables ineligible formations with missing-position feedback.
- Match live UI now has tactical controls:
  - new `MatchTacticsPanel` component.
  - `MatchPage` can apply formation/posture changes during paused/half-time and apply them to live state immediately.

Validation:
- Typecheck passed:
  - `pnpm -C apps/web exec tsc --noEmit`
  - `pnpm -C apps/api exec tsc --noEmit`
  - `pnpm -C packages/core exec tsc --noEmit`

Next:
- Run full Playwright game loop flow, inspect screenshots, and fix any UX/logic regressions found.

Playwright verification update:
- Ran skill client loop against web app (`output/playwright/shot-*.png`), then executed focused Playwright probes to validate the implemented tactics features end-to-end.
- Verified via screenshots:
  - `output/playwright/tactics-squad-before.png`
  - `output/playwright/tactics-squad-changed.png`
  - `output/playwright/tactics-squad-reload.png`
  - `output/playwright/match-tactics-panel.png`
  - `output/playwright/match-live-after-tactics.png`
- Confirmed behavior from captures:
  - formation/posture changes in Squad are persisted after reload (e.g. 3-4-3 + attacking remains selected).
  - live match now exposes `Tactics` button while paused and opens tactical panel.
  - live tactical apply flow returns to match view with updated controls/state.
- Confirmed API traffic during flow showed tactics upsert and reads succeeding (`GET/PUT /api/save/:id/tactics/:teamId`).

Remaining note:
- Existing generic desktop table probe script can still time out if no continue link is present in that specific branch of the flow; this does not block the new tactics validations above, which completed successfully.

UI polish + strict skill loop follow-up:
- Removed 4-2-3-1 globally from core formation types/options/mappings:
  - `packages/core/src/types/index.ts`
  - `packages/core/src/team/index.ts`
  - `packages/core/src/pitch/index.ts`
  - `packages/core/src/match/tactical-constants.ts`
- Improved pre-match squad controls alignment and sizing in `apps/web/src/pages/GamePage.tsx`:
  - formation select and posture buttons now consistent height and width rhythm on mobile/desktop.
- Replaced low-visibility posture arrows with clear high-contrast tactical badges in `apps/web/src/components/PitchView.tsx`.

Strict skill validation:
- Ran `command -v npx` prerequisite check (present).
- Ran `$WEB_GAME_CLIENT` loop against `http://localhost:5173` with screenshots.
- Ran focused Playwright validation for updated squad UI and formation options.
- Verified from output screenshots:
  - `output/playwright/squad-ui-mobile-updated.png`
  - `output/playwright/squad-ui-mobile-defensive.png`
- Confirmed options now exclude 4-2-3-1.

Note:
- Playwright wrapper script from `$playwright` skill currently points to a missing `playwright-cli` binary in this env (`sh: playwright-cli: command not found`). I validated using the local Playwright runtime and the required `$WEB_GAME_CLIENT` loop instead.

Matchup lanes pivot (current chunk):
- Added core tactical preview model in `packages/core/src/match/tactical-ui-model.ts` and exported it from core index.
- Added `apps/web/src/components/TacticalImpactStrip.tsx` (possession/creation/prevention + lane deltas).
- Removed redundant posture badge and per-player posture arrows from `PitchView` to improve readability.
- Wired TacticalImpactStrip into `GamePage` squad pitch view (with opponent preview fallback) and into live `SubstitutionPanel` tactics tab.
- Updated unavailable-formation feedback to concise `need X / have Y` messages.

Matchup lanes pivot verification:
- Ran typechecks: `pnpm -C packages/core exec tsc --noEmit`, `pnpm -C apps/web exec tsc --noEmit` (pass).
- Ran `$WEB_GAME_CLIENT` loop (`shot-0/1/2.png`).
- Built and ran focused Playwright probe (`apps/web/.tmp-matchup-verify.mjs`) through desktop + mobile squad pitch and live match tactics panel.
- Verified from fresh screenshots:
  - no posture badge and no tiny arrows on pitch.
  - tactical strip shown with possession/creation/prevention + lane deltas.
  - 4-2-3-1 absent from selectable formations (probe logs formation options explicitly).
  - live match `Team Changes` -> `Formation & Posture` includes tactical strip and apply flow works.
- Key artifacts:
  - `output/playwright/matchup-squad-desktop.png`
  - `output/playwright/matchup-squad-343-desktop.png`
  - `output/playwright/matchup-live-tactics-desktop.png`
  - `output/playwright/matchup-live-after-apply-desktop.png`
  - `output/playwright/matchup-squad-mobile.png`
  - `output/playwright/matchup-squad-343-mobile.png`

Posture UX simplification pass:
- Removed Tactical Impact UI from squad pitch and from live Team Changes tactical tab.
- Removed helper artifacts created only for that panel:
  - deleted `apps/web/src/components/TacticalImpactStrip.tsx`
  - deleted `packages/core/src/match/tactical-ui-model.ts`
  - removed export from `packages/core/src/index.ts`
- Restored posture as subtle visual-only cue in pitch:
  - `PitchView` now accepts posture and applies small line shifts by role (DEF/MID/ATT) without badges/arrows/text.
- Re-validated: no "Tactical Impact" text present (`TACTICAL_IMPACT_COUNT 0` in probe output), screenshots show clean defensive vs attacking posture visuals.

Release-to-free-market feature (in progress):
- Added shared release compensation model in `packages/core/src/transfer/index.ts` via `calculateReleaseCompensation(...)`.
  - Inputs include current season/round, contract years remaining, weekly wage, age/overall profile, and season minutes utilization.
  - Supports mutual termination (fee = 0) for underused younger players under specific conditions.
- Added unit coverage in `packages/core/src/transfer/release-compensation.test.ts`.
- Added backend release service methods in `apps/api/src/services/transfer.service.ts`:
  - `getReleaseFeeQuote(...)`
  - `releasePlayerToFreeAgency(...)`
  - Includes listing/offer cleanup, player team removal, optional compensation expense transaction, and wage-cache adjustment.
- Added transfer API endpoints in `apps/api/src/routes/transfer.ts`:
  - `GET /api/transfer/release-fee/:saveId/:playerId`
  - `POST /api/transfer/release/:saveId`
- Extended AI transfer cycle in `apps/api/src/services/ai-transfer.service.ts`:
  - New `processAIReleases(...)` runs each round and can release fringe/underused players when compensation is financially sensible.
- Frontend wiring started:
  - `PlayerActionModal` now supports release action and confirmation.
  - `GamePage` squad flow now computes preview fee and calls release endpoint.
  - `TransferMarketPanel` now includes release actions in `My Transfers` for both listed and listable players.
- Also fixed squad API payload to include `contractEndSeason` and save scoping (`apps/api/src/routes/save.ts`), and mapped it in `apps/web/src/hooks/useSaveData.ts`.

TODO:
- Run typecheck and resolve any compile errors from new imports/types.
- Execute targeted Playwright verification for Squad modal + Transfers tab release flows.
- Tune AI release thresholds if behavior is too aggressive or too passive.

Release feature verification update:
- Typechecks now pass:
  - `pnpm -C packages/core exec tsc --noEmit`
  - `pnpm -C apps/api exec tsc --noEmit`
  - `pnpm -C apps/web exec tsc --noEmit`
- Unit tests added and passing:
  - `pnpm -C packages/core exec vitest run src/transfer/release-compensation.test.ts`
- Ran the `$WEB_GAME_CLIENT` loop command once against `http://localhost:5173`; command exited successfully, but no fresh screenshot artifacts were produced in `output/playwright`, so targeted visual verification for the new release UI still needs a focused headed probe.

Transfer UX follow-up fixes:
- `My Transfers` tab badge now counts only actionable incoming bids (`pending`/`counter`) and no longer includes listed-player count.
- Incoming filter tightened to actionable statuses only (`pending`, `counter`) to prevent stale/terminal statuses from inflating counts.
- Counter-offer completion no longer force-closes modal from parent; modal now remains and shows its built-in completion state before the user closes it.
- Added explicit parent-level feedback when AI rejects a counter: "Counter offer rejected. The buyer walked away."
- Validation: `pnpm -C apps/web exec tsc --noEmit` passes.

Full badge/offer-lifecycle consistency pass:
- Unified top-level GamePage transfer badge count to actionable incoming offers (`pending` + `counter`) instead of only `pending`.
- Added CounterOfferModal `onStateChange` callback and wired parent refresh so every successful negotiation transition triggers refresh of:
  - panel offers list, and
  - parent-level badge hook state.
- Ensured parent refresh callback runs on reject/accept flows from `TransferMarketPanel` offer actions, not only on completed transfers.
- Ensured AI walk-away (counter rejected) path also refreshes parent counters and shows explicit message.
- Unified TransferMarket alert banner count/text to actionable incoming negotiations to avoid mismatched numbers across widgets.
- Validation: `pnpm -C apps/web exec tsc --noEmit` passes.

Counter-thread regression fix:
- Root cause: counter negotiation state changes were calling `onTransferComplete` (heavy parent refresh via `refetchSaveData`) which could remount/reset transfers panel state to default tab.
- Fix: separated callbacks in transfer UI:
  - `onOffersChanged` for badge/counter refresh only (lightweight).
  - `onTransferComplete` reserved for real squad/finance transfer completion.
- Updated GamePage transfer badge to actionable incoming statuses (`pending` + `counter`) for consistency.
- Updated TransferMarket panel lifecycle handlers so counter state transitions/walk-away refresh only offers/badges and keep negotiation thread in place.
- Added CounterOfferModal `onStateChange` callback to push parent offer refresh on each successful negotiation transition.
- Typecheck pass: `pnpm -C apps/web exec tsc --noEmit`.
- Playwright run:
  - Started local dev server on `http://127.0.0.1:5173`.
  - Ran Playwright smoke script (elevated due sandbox browser restriction), reached page title: `Sign In | RetroFoot`.
  - Transfer-flow E2E from this environment is currently gated by auth/session context.

Penalty event feature (current chunk):
- Implemented real penalty events in match engine (`packages/core/src/match/index.ts`):
  - Added dedicated event branch emitting `penalty_scored` / `penalty_missed` (previously typed in UI but never generated).
  - Added best-available penalty taker selection from lineup (shooting/composure/positioning with form/energy adjustments).
  - Added penalty conversion model with base 0.78 and taker-vs-GK, form, momentum, and fatigue modifiers.
- Tuned event thresholds and constants in `packages/core/src/match/constants.ts`:
  - Inserted penalty slot (`EVENT_THRESHOLD_PENALTY`) targeting ~0.28 awards per match.
  - Added penalty conversion bounds (`PENALTY_BASE_CONVERSION`, min/max).
- Updated stats aggregation so scored penalties count as goals:
  - `apps/api/src/routes/match.ts`
  - `apps/api/src/services/player-stats.service.ts`
- Updated match UI styling to make penalties visually distinct (similar emphasis to own goals):
  - `apps/web/src/components/MatchLiveView.tsx`
  - `apps/web/src/components/MatchEventsModal.tsx`
  - `apps/web/src/components/EventIcon.tsx`
  - `apps/web/src/pages/MatchPage.tsx`
- Added core tests for penalty taker and conversion behavior in `packages/core/src/match/energy.test.ts`.

Validation:
- `pnpm -C packages/core exec vitest run src/match/energy.test.ts` passed.
- Typechecks passed:
  - `pnpm -C packages/core exec tsc --noEmit`
  - `pnpm -C apps/api exec tsc --noEmit`
  - `pnpm -C apps/web exec tsc --noEmit`

TODO:
- Run a headed Playwright pass through live match timeline and post-match summary to visually verify penalty accenting in real flow screenshots.

Playwright note:
- Attempted `$WEB_GAME_CLIENT` run for this chunk; browser launch required escalation and then run failed because `http://127.0.0.1:5173` was not running (`ERR_CONNECTION_REFUSED`).
