
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
