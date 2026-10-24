---
phase: 05-render-system
plan: 15
subsystem: render-camera
tags:
    [
        typescript,
        pixi-free-camera,
        exit-transition,
        battle-weight,
        uat-gap-closure,
        camera-test
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-03)
      provides: two-phase pan/zoom Camera + cameraMath (fitBox/fitTransform/trackTransform/interpolateTransform) + camera tests
    - phase: 05-render-system (plan 05-01)
      provides: ICamera / ICameraUpdateInput / ICameraConfig contract with the shake writer
    - phase: 05-render-system (plan 05-05)
      provides: frameModel pure-projection seam (resolveUnitVisualSpec / resolveTargetPoints / isUnitVisible) that resolveBattleWeight joins
    - phase: 05-render-system (plan 05-07)
      provides: Renderer.renderFrame services plumbing and collectTargetPoints
    - phase: 01-unit-system
      provides: IUnit.getAttribute(AttributeKind.Level) and IUnit.isAlive
    - phase: 04-kingdom-armies
      provides: IBattle.getMemberUnitIds and IBattleSystem.listActiveBattles
provides:
    - src/render/Camera.ts - single-phase exit (centre + scale interpolate together) and weight-aware steady-state tracking
    - src/render/frameModel.ts - resolveBattleWeight(battle, getUnit) pure helper
    - src/render/Renderer.ts - collectBattleWeight, so camera.update receives the real weight every frame
    - src/render/types.ts - ICameraUpdateInput.battleWeight, ICameraConfig.weightScale (the only interface additions)
    - src/render/constants.ts - CAMERA.weightScale = 20 plus validateRenderConfig coverage
affects:
    [
        Phase 6 recording (pull-backs no longer sweep across the map centre, so recorded cuts are shorter and cleaner),
        Phase 7 AI (no coupling: the weight is read-only rendering data),
        Any later camera tuning (weightScale is the single knob for catch-up speed)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 8644
    tasks: 3
    commits: 3
    plan_head_before: c3cc6ce9026e2530200944bc224f88dc5f8debf0

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'A camera transition carries its direction: entry keeps the two-phase pan-then-zoom, exit is one simultaneous centre+scale interpolation over panFrames'
        - 'Exit progress is (elapsed + 1) / panFrames, so the very first exit frame already moves while the last exit frame (elapsed = panFrames - 1) still lands exactly on the target'
        - 'Continuous "how big is this fight" data enters the renderer as one pure scalar (summed living member levels) and only ever shortens the steady-state smoothing constant'
        - 'Weight-bearing knobs are expressed as a halving scale (weightScale) rather than a speed multiplier, so the formula stays bounded: effective = clamp(round(smoothingFrames × weightScale / (weightScale + W)), 1, smoothingFrames)'

key-files:
    created: []
    modified:
        - src/render/types.ts
        - src/render/constants.ts
        - src/render/frameModel.ts
        - src/render/Camera.ts
        - src/render/Renderer.ts
        - tests/render/camera.test.ts
        - tests/render/constants.test.ts
        - tests/render/frame-model.test.ts
        - tests/render/types.test.ts

key-decisions:
    - 'Pulling back is a single phase over panFrames: centre and scale interpolate together, so the camera never travels to the map centre at battle zoom before shrinking. With the shipped config the pull-back is 24 output frames (0.8 s) instead of the old 29 (0.97 s).'
    - 'Exit progress is (elapsed + 1) / panFrames rather than elapsed / (panFrames - 1). Both land at elapsed = panFrames - 1, but the first makes the scale start shrinking on the very first exit frame (the UAT symptom) while the second would hold a stationary t = 0 frame. Ease-in-out keeps that first step visually invisible (≈0.03 % of the distance).'
    - 'Battle weight W = sum of living member levels, resolved through the real unit catalog. It only shortens steady-state tracking inside BattleFocus: effective smoothing = clamp(round(smoothingFrames × weightScale / (weightScale + W)), 1, smoothingFrames). Entry and exit timing read no weight at all.'
    - 'resolveBattleWeight lives in frameModel.ts as a pure function and returns 0 for no battle, no resolvable member, or all-dead membership, so the camera never sees NaN and the strategic path is unchanged.'
    - 'Only two interface fields were added (ICameraUpdateInput.battleWeight, ICameraConfig.weightScale); nothing else in types.ts changed and no upstream (kingdom/control) contract was touched.'

patterns-established:
    - 'Fight size is rendering-side data: derived per frame from IBattle + IUnitCatalog, passed as a scalar, never stored on the camera.'
    - 'A transition-timing test asserts on the geometry signature ("scale must have moved on frame 1" / "centre and scale are both between the endpoints at the midpoint"), not on private state.'

requirements-completed: [REND-04]

# Coverage metadata (#1602)
coverage:
    - id: D1
      description: 'Returning to the panorama is one motion: on every exit frame the scale is already shrinking while the centre is still travelling, and the camera lands exactly on the strategic composition in panFrames frames with no "pan at battle zoom, then shrink" phase'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/render/camera.test.ts#shrinks from the first exit frame and lands on the panorama in panFrames frames'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#moves centre and scale in the same frame, never in two phases'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#stays BattleFocus until the single-phase pull-back lands'
            status: pass
      human_judgment: false
    - id: D2
      description: 'Steady-state in-battle tracking is weight-aware: a larger summed participant level converges to a moved battle centre faster, weight 0 reproduces the configured smoothing exactly, and the entry/exit timelines are bit-identical regardless of weight'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/render/camera.test.ts#converges to a moving battle centre faster with a larger weight'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#keeps the configured smoothing at weight 0'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#leaves the entry timeline untouched by battle weight'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#ignores battle weight during the exit transition'
            status: pass
      human_judgment: false
    - id: D3
      description: 'resolveBattleWeight is a pure frameModel helper that sums living member levels, skips null/dead/non-finite/negative values, returns 0 when nothing resolves, and is order- and call-deterministic'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/render/frame-model.test.ts#sums the levels of the living members'
            status: pass
          - kind: unit
            ref: 'tests/render/frame-model.test.ts#skips missing, dead, non-finite and negative levels'
            status: pass
          - kind: unit
            ref: 'tests/render/frame-model.test.ts#returns 0 for an empty battle or when no member resolves'
            status: pass
          - kind: unit
            ref: 'tests/render/frame-model.test.ts#keeps the sum deterministic across member order and repeated calls'
            status: pass
      human_judgment: false
    - id: D4
      description: 'The renderer supplies the weight every frame: collectBattleWeight resolves the current target battle like collectTargetPoints and returns 0 when there is no target or the battle is gone'
      requirement: 'REND-04'
      verification:
          - kind: integration
            ref: 'pnpm test (46 files / 519 tests, includes tests/render/import-boundary.test.ts)'
            status: pass
          - kind: integration
            ref: 'pnpm typecheck && pnpm lint && pnpm build'
            status: pass
      human_judgment: false
    - id: D5
      description: 'In Chrome, ending a battle now reads as a straight pull-back and a growing melee settles instead of jittering'
      requirement: 'REND-04'
      verification: []
      human_judgment: true
      rationale: 'The geometry and the timing are pinned by tests, but whether the resulting motion is smooth and 激烈好看 (Core Value) is a live Chrome UAT judgement — no automated assertion can score how a pull-back feels.'

# Metrics
duration: 17min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 15: Direct Pull-Back and Weight-Aware Follow Summary

**The camera now pulls straight back to the panorama in one simultaneous centre+scale interpolation over `panFrames` (no more panning to the map centre at battle zoom before shrinking), and in-battle follow is weighted by the summed living member levels — `weightScale = 20` halves the smoothing time at W = 20 — while entry/exit choreography stays bit-identical to before**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-24T21:40:54Z
- **Completed:** 2026-10-24T21:57:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 9 (0 created, 9 modified)

## Accomplishments

- **Exit is one phase.** `Camera.update` now branches on transition direction: a numeric new target keeps the old two-phase pan-then-zoom, while `undefined` runs `exitTransform` — one `interpolateTransform(from, target, easeInOutCubic(alpha))` over `panFrames`, so centre and scale move together. The landing frame snaps to the strategic transform and only then does `getMode()` flip to `Strategic`. With the shipped `panFrames = 24`, the pull-back is 24 output frames (0.8 s) rather than the old 29.
- **Why the old code looked like a detour.** Entry and exit shared `panTransform` → `zoomTransform`, so the exit first held the battle scale for `panFrames` while sliding to the map centre and only then shrank. The UAT report ("it goes back to the middle and then zooms out") was exactly that signature.
- **Exit progress is `(elapsed + 1) / panFrames`.** Both this and `elapsed / (panFrames - 1)` land on `elapsed = panFrames - 1`, but only the former moves on the first exit frame, which is what the plan's own acceptance bullet asks for ("exit changes scale on the FIRST exit frame"). Ease-in-out makes that first step ≈0.03 % of the distance, so there is no visible jump.
- **Weight-aware follow.** `resolveBattleWeight(battle, getUnit)` (pure, in `frameModel.ts`) sums `AttributeKind.Level` over living members, skipping `null`, dead, non-finite and negative values, and returns 0 when nothing resolves. `Camera.trackingConfig` turns that into `effective = clamp(round(smoothingFrames × weightScale / (weightScale + W)), 1, smoothingFrames)` and only applies it on the steady-state `trackTransform` path inside a battle. At W = 0 the config object is returned untouched, so the shipped behaviour is unchanged for tiny fights; at W = 20 the smoothing constant halves; at W ≥ 100 it collapses to 1 frame (exponential catch-up, never a teleport).
- **Weight never touches transitions.** The value is read only in the `else` (no-transition) branch, and the tests prove it: entry frames for W = 0 vs W = 5000 are `toEqual`-identical, and exit frames likewise.
- **Renderer plumbing.** New private `collectBattleWeight(services)` resolves the target battle with the same `listActiveBattles().find(...)` lookup as `collectTargetPoints` (which is untouched) and passes `unitId => services.catalog.getUnit(unitId)`; no target or an ended battle yields 0. `renderFrame` now passes `battleWeight` into `camera.update({...})` every frame.
- **Contract stayed minimal.** Exactly two fields were added — `ICameraUpdateInput.battleWeight` and `ICameraConfig.weightScale` (validated `> 0` via `assertAbove('camera.weightScale', …)`, shipped value 20). `src/kingdom/**` and `src/control/**` were not touched.

## Verification

| Command | Result |
| --- | --- |
| pnpm vitest run tests/render/frame-model.test.ts tests/render/types.test.ts tests/render/constants.test.ts | 3 files / 52 tests passed |
| pnpm vitest run tests/render/camera.test.ts | 22 tests passed |
| pnpm test | 46 files / 519 tests passed |
| pnpm typecheck | clean |
| pnpm lint | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` |
| pnpm build | built in 1.19 s (only the pre-existing >500 kB chunk warning) |

Key assertions now pinned by tests:

| Behaviour | Assertion |
| --- | --- |
| Exit starts shrinking immediately | `frames[0].scale < battle.scale` and the scale is strictly decreasing every exit frame |
| Exit lands exactly | last exit frame centre/scale `toBeCloseTo(panoramic …, 6)`; `getMode()` is `Strategic`; `getTransform()` equals that frame |
| No phased exit | at the midpoint the centre is strictly between battle and panoramic **and** the scale is strictly between them |
| Exit mode honesty | `BattleFocus` for the first `panFrames - 1` exit frames, `Strategic` on the landing frame |
| Weight speeds up tracking | error to a moved battle centre after 3 frames is strictly smaller for W = 200 than W = 0 with identical config |
| Weight 0 = shipped behaviour | one follow step at W = 0 equals `trackTransform(steady, target, config)` to 9 decimals |
| Weight is transition-free | entry and exit frame sequences are `toEqual` for W = 0 vs W = 5000 |
| Weight helper purity | living-only sum, skips missing/dead/NaN/∞/−2, 0 for empty, identical across member order and repeated calls |

## Task Commits

Each task was committed atomically:

1. **Task 1: Add battleWeight / weightScale and the pure weight helper** - `79391c5` (feat)
2. **Task 2: Single-phase exit + weight-aware tracking in Camera** - `8673ea6` (feat)
3. **Task 3: Pass battle weight from Renderer each frame** - `3be418a` (feat)

**Plan metadata:** committed after this SUMMARY (docs: complete plan).

## Files Created/Modified

- `src/render/types.ts` - `ICameraUpdateInput.battleWeight`, `ICameraConfig.weightScale` (plus the `smoothingFrames` JSDoc now naming the weight rule)
- `src/render/constants.ts` - `CAMERA.weightScale = 20` and its `assertAbove` validation
- `src/render/frameModel.ts` - `resolveBattleWeight` pure helper and the header/JSDoc reflecting its new job
- `src/render/Camera.ts` - `exitTransform` (single-phase), `landingTransform`, `trackingConfig` (weight → effective smoothing), direction-aware `update` branch
- `src/render/Renderer.ts` - `collectBattleWeight` plus the `battleWeight` field in the per-frame camera input
- `tests/render/frame-model.test.ts` - `FakeUnit` fixture and four `resolveBattleWeight` tests
- `tests/render/camera.test.ts` - single-phase exit suite, weight-only-tracking suite, exit-timing rewrite of the old "pan then zoom out" test
- `tests/render/types.test.ts` - `battleWeight` / `weightScale` type pins and updated literals
- `tests/render/constants.test.ts` - `weightScale = 20` pin and the `weightScale 0` rejection case

## Decisions Made

- **Exit direction is derived, not stored.** `targetBattleId === undefined` during a transition *is* the exit signal, so no extra state field (and no new type) was needed — which also kept the "only two interface fields" constraint intact.
- **`(elapsed + 1) / panFrames` for the exit.** Chosen so the first exit frame already moves while the landing frame stays at `elapsed = panFrames - 1`; documented in the `exitTransform` JSDoc.
- **Weight as a halving scale (`weightScale`) rather than a speed multiplier.** The formula is bounded by `[1, smoothingFrames]` for any W ≥ 0, so an absurd level sum cannot produce `smoothingFrames ≤ 0` (which would make `trackTransform`'s `alpha` degenerate).
- **`resolveBattleWeight` returns 0 rather than `null`.** It is a numeric magnitude, not a missing object; 0 is the neutral value the formula expects (AGENTS §8: missing literal → `undefined`, but here there is no absence — an empty fight has weight zero).
- **Renderer keeps its own lookup instead of refactoring `collectTargetPoints`.** The plan required the target-points logic to stay unchanged; the five-line duplicate lookup is cheaper than touching a verified path for a gap-closure fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renderer call site needed the new required field in Task 1's commit**
- **Found during:** Task 1 (`pnpm typecheck`)
- **Issue:** `ICameraUpdateInput.battleWeight` is required, and `pnpm typecheck` compiles the whole project, so Task 1 could not be green while `Renderer.renderFrame` omitted the field — the type-first ripple lands outside Task 1's file list.
- **Fix:** Task 1 passed `battleWeight: 0` (a compile-only placeholder, no behaviour change) at the single production call site; Task 3 replaced it with `this.collectBattleWeight(services)`. Task boundaries and commit atomicity were preserved.
- **Files modified:** `src/render/Renderer.ts`
- **Verification:** Task 1 `pnpm typecheck` clean, full suite green; Task 3 `pnpm test` / `typecheck` / `build` clean.
- **Committed in:** `79391c5` (stopgap), superseded in `3be418a` (real weight).

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The stopgap was a direct consequence of adding a required interface field in a task whose file list excludes its consumer; end state matches the plan exactly.

## Issues Encountered

- One edit accidentally consumed a `it(...)` opening line while inserting the new `resolveBattleWeight` describe block; recovered by re-inserting the whole block in a single edit. No effect on the committed content (verified by the passing suite).
- Out of scope, recorded in `deferred-items.md`: `tests/units/spawn-normal.test.ts` (pre-existing randomly-seeded statistical tolerances) produced one transient tolerance miss in a full run and met tolerance on the immediate re-run and on two other full runs. Untouched — it is not render code.

## Known Stubs

None — `resolveBattleWeight` is wired end-to-end (`Renderer` → `camera.update` → `trackingConfig`), and no placeholder or hardcoded value feeds a rendering path. The weight path has no unit test at the `Renderer` level because `Renderer` requires a live Pixi application; the proof is the pure helper + camera suites plus the full-suite and import-boundary runs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready:** the camera no longer needs babysitting around battle exits, and `weightScale` is the single knob if large fights still feel sluggish on a live run. `battleWeight` is derived per frame from `IBattle` + `IUnitCatalog`, so Phase 6 recording inherits the behaviour with zero wiring.
- **Open (UAT):** watch a live battle in Chrome and confirm two things by eye — (1) ending a battle pulls straight back with no centre detour, (2) a growing melee settles instead of jittering. Both are recorded as `D5` with `human_judgment: true`.
- **Note for Phase 6:** the pull-back is now 24 output frames (0.8 s) instead of 29 (~0.97 s); any recorded segment boundary that assumed the old length should use `camera.getMode()` rather than a frame count.

---

*Phase: 05-render-system*
*Completed: 2026-10-24*

## Self-Check: PASSED

- All three task commits exist (`79391c5`, `8673ea6`, `3be418a`).
- All nine modified source/test files and this SUMMARY exist on disk.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` all green after Task 3.
