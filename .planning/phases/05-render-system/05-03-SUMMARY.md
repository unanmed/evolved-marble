---
phase: 05-render-system
plan: 03
subsystem: render-camera
tags: [typescript, camera, percentile-fit, pure-functions, state-machine, shake, vitest]

# Dependency graph
requires:
  - phase: 05-render-system (plan 05-01)
    provides: the frozen ICamera/ICameraConfig/ICameraTransform/ICameraUpdateInput/IFitBox/IViewport contract and the CameraMode numeric enum
  - phase: 05-render-system (plan 05-02)
    provides: DEFAULT_RENDER_CONFIG.camera (coverage 0.9, minSpan 24 m, padding 48 px, min/max scale, smoothingFrames 10, switchFrames 90, shake 8 px / decay 0.86)
provides:
  - src/render/cameraMath.ts — lerp/smoothstep/easeInOutCubic, fitBox, fitTransform, strategicTransform, trackTransform, interpolateTransform, worldToScreen, screenToWorld (Pixi-free, Node-testable)
  - src/render/Camera.ts — Camera implements ICamera (two modes derived from the target, fixed-length transition, exponential tracking, capped/decayed shake, single permitted instant jump on reset)
  - tests/render/camera-math.test.ts — 23 tests (coverage table n = 1/2/16/100, outlier, guards, panoramic containment, fit clamping, no-teleport, transition endpoints, screen round-trip)
  - tests/render/camera.test.ts — 12 tests (reset, no-teleport target change, switchFrames-th landing, pull-back mode, unchanged target, shake clamp/decay/determinism, finite output)
affects: [05-07 Renderer (consumes camera.update/getTransform), 05-09 panel (canvas picking via screenToWorld), 05-10 Chrome UAT/calibration, Phase 6 sequential camera driving]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 13591
  tasks: 2
  commits: 2
  plan_head_before: 532cf869ad0b96e1667d8af72774bd4464a9d380

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Median-centre + percentile Chebyshev radius: the >=90% framing guarantee is a theorem (>= ceil(coverage*n) points inside), not a tuning hope (D-14/D-21)"
    - "Target composition vs current transform split: the fit transform always satisfies coverage while the transition/tracking path is allowed to lag, which is exactly what makes 'no teleport' and '>=90%' compatible (D-21)"
    - "Elapsed-frame transition timing: t = (duration - remaining) / (duration - 1) gives exactly t = 0 on the first update and t = 1 on the switchFrames-th, then a defensive component snap makes the landing bit-stable"
    - "Log-space scale interpolation for both tracking (alpha = 1 - exp(-1/smoothingFrames)) and transitions, so zoom feels uniform and never lands in one step"
    - "Effective minimum scale: Camera.minScale is clamped to min(config.minScale, panoramic scale), so a small viewport can never force over-zoom that breaks coverage (Pitfall 22)"
    - "Guarded pure geometry: every degenerate input (NaN point, empty set, zero viewport, zero scale, non-finite config) returns a finite fallback, never NaN/Infinity (T-05-13)"
    - "Unflipped world y: screen = viewportCentre + (world - centre) * scale + shake, so a physics angle is directly usable as a container rotation and picking only has to subtract shake (D-24)"
    - "Frame-counted shake: one irrational phase step per update, amplitude accumulated then clamped then decayed, no random source and no wall-clock (D-06/D-17)"

key-files:
  created:
    - src/render/cameraMath.ts
    - src/render/Camera.ts
    - tests/render/camera-math.test.ts
    - tests/render/camera.test.ts
  modified: []

key-decisions:
  - "fitBox uses the median as the centre (not IBattle.getCenter(), which is level-weighted and can be dragged) and the coverage-th percentile Chebyshev radius as the half-span, so an outlier can only ever occupy the excluded tail (D-14/D-21)"
  - "fitTransform clamps into [minScale, maxScale] where maxScale only ever shrinks the box on screen, so capping never breaks coverage; Camera additionally lowers minScale to the panoramic fit (Pitfall 22)"
  - "interpolateTransform has exact endpoints (t = 0 returns `from`, t = 1 returns `to`), making 'first update == start' and 'switchFrames-th update == target' assertable properties rather than floating-point coincidences"
  - "Camera.update recomputes the target composition every frame during a transition, so the switch slides toward the live framing of a moving battle instead of a stale snapshot"
  - "Mode is never set outside setBattleTarget/reset/transition completion: a pull-back keeps BattleFocus (units must not vanish while the camera is still zooming out) and only the completing update flips to Strategic"
  - "The transition snap on completion copies centerX/centerY/scale from the target so the landing is stable even if log-space interpolation drifts in the last bits"
  - "Shake uses a single shared irrational phase step for both axes (x = cos, y = sin), so the emitted vector magnitude equals the current amplitude exactly — the cap and the monotone decay are then properties, not approximations"
  - "No private state beyond the eight declared fields and only the two declared private helpers (effectiveMinScale, resolveTarget); shake math is inline in update() to keep the class surface exactly ICamera + constructor"

patterns-established:
  - "Pure geometry module shape: guarded helpers first (clampFinite/finiteOr/positiveOr/medianSorted/interpolateScale), then the ten exported functions in dependency order, each with JSDoc naming the decision it implements"
  - "Camera state-machine shape: private declared fields with JSDoc, public members exactly the implemented interface, all geometry delegated to the pure module"
  - "Camera test shape: makeConfig() spreads DEFAULT_RENDER_CONFIG.camera with switchFrames 10 / smoothing 4 / shake 8 / decay 0.5, makeInput() builds the frame, and expectedBattleTransform() recomputes the same effective-minScale口径 so the landing assertion is exact"

requirements-completed: [REND-04]

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "fitBox guarantees at least ceil(coverage × n) points inside a square box centred on the median, so n = 16 keeps 15 and n = 100 keeps 90 inside (a proven >=90%, D-14/D-21), and one outlier 400 m away cannot expand the box"
    requirement: "REND-04"
    verification:
      - kind: unit
        ref: "tests/render/camera-math.test.ts#keeps ceil(coverage x n) points inside for n = 1, 2, 16 and 100"
        status: pass
      - kind: unit
        ref: "tests/render/camera-math.test.ts#does not let a single outlier drag the composition"
        status: pass
      - kind: unit
        ref: "tests/render/camera-math.test.ts#gives a single point the minimum span instead of an unbounded zoom"
        status: pass
    human_judgment: false
  - id: D2
    description: "strategicTransform shows the whole map (all four corners inside the padded viewport, centred on the map, scale 0.984 for 1000x1000 at 1920x1080 and 0.264 at 640x360) and fitTransform zooms into a battle while never dropping below the panoramic scale for in-map points and honouring maxScale"
    requirement: "REND-04"
    verification:
      - kind: unit
        ref: "tests/render/camera-math.test.ts#centres the map and keeps all four corners inside the padded viewport"
        status: pass
      - kind: unit
        ref: "tests/render/camera-math.test.ts#still contains all four corners on a small viewport"
        status: pass
      - kind: unit
        ref: "tests/render/camera-math.test.ts#zooms in above the panoramic scale for a small battle"
        status: pass
      - kind: unit
        ref: "tests/render/camera-math.test.ts#never fits a full-map point set below the panoramic scale"
        status: pass
      - kind: unit
        ref: "tests/render/camera-math.test.ts#caps a single-point battle at maxScale"
        status: pass
    human_judgment: false
  - id: D3
    description: "Camera implements exactly the six ICamera methods: reset returns the panoramic composition and reports Strategic; setBattleTarget never moves the current transform and an unchanged target does not restart the transition; a target change evaluates exactly t = 0 on the first update and lands on the battle fitTransform on the switchFrames-th update; a pull-back keeps BattleFocus until completion"
    requirement: "REND-04"
    verification:
      - kind: unit
        ref: "tests/render/camera.test.ts#returns the panoramic composition and reports Strategic"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#leaves the current transform untouched when a target is set"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#lands exactly on the target on the switchFrames-th update"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#never moves further in one frame than the remaining distance"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#does not restart the transition for an unchanged target"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#stays BattleFocus until the pull-back completes"
        status: pass
    human_judgment: false
  - id: D4
    description: "Shake flows only through ICameraUpdateInput.shakeImpulsePx: a 1000 px impulse is clamped to shakeAmplitudePx, the emitted offset decays monotonically once impulses stop, and two cameras fed identical frames return identical transforms (no random source, no wall-clock); every degenerate input (NaN points, zero viewport, empty points) still yields a finite positive transform"
    requirement: "REND-04"
    verification:
      - kind: unit
        ref: "tests/render/camera.test.ts#clamps an oversized impulse to the configured amplitude"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#decays monotonically once impulses stop"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#returns identical transforms for identical frame sequences"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#emits finite transforms for NaN points, zero viewport and empty points"
        status: pass
      - kind: other
        ref: "node presence check over src/render/Camera.ts → RENDER_CAMERA_OK"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both modules stay Node-testable: cameraMath.ts and Camera.ts import only @/render/types, @/kingdom/types and each other (no Pixi, no Rapier, no Math.random, no performance.now), and the whole suite, typecheck and lint are green"
    requirement: "REND-04"
    verification:
      - kind: integration
        ref: "pnpm test — 38 files / 407 tests passed (baseline 36 / 372 + 2 files / 35 tests)"
        status: pass
      - kind: other
        ref: "node presence check over src/render/cameraMath.ts → CAMERA_MATH_OK"
        status: pass
      - kind: other
        ref: "pnpm typecheck exit 0 and pnpm lint exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: ~11min
completed: 2026-10-23
status: complete
---

# Phase 5 Plan 03: 自动镜头（拟合数学与两态状态机）Summary

**The ≥90% framing guarantee became a proven property of a pure fit box (median centre + coverage-percentile Chebyshev radius) and the "no teleport" promise became a bit-exact fixed-length transition, so REND-04 is now covered by 35 automated Node tests instead of manual-only verification.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-10-23T23:07:07Z
- **Completed:** 2026-10-23T23:17:00Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- `src/render/cameraMath.ts` implements the whole camera geometry as ten guarded pure functions: `lerp`/`smoothstep`/`easeInOutCubic`, `fitBox`, `fitTransform`, `strategicTransform`, `trackTransform`, `interpolateTransform`, `worldToScreen`, `screenToWorld`. It imports only `@/render/types` and `@/kingdom/types`, declares no class and no state, so the hardest maths in Phase 5 runs in the Node/Vitest environment.
- `fitBox` is the D-21 centrepiece: the centre is the **median** of the finite points and the half-span is the `coverage`-th percentile **Chebyshev** radius, which makes "at least `ceil(coverage × n)` points inside" a theorem. The tests pin it at n = 1 (minimum span), 2, 16 (15 inside = 93.75%) and 100 (90 inside), and prove that one point 400 m away cannot drag the composition (17 points → 16 inside, `maxX < 900`).
- `strategicTransform` shows the entire map: for 1000×1000 at 1920×1080 the scale is exactly 984/1000 = 0.984 with the camera on (500, 500) and all four corners inside the 48 px padding; a 640×360 viewport still contains all four corners (scale 0.264). `fitTransform` zooms a 40 m battle to 24.6 px/m and honours `maxScale`.
- `Camera implements ICamera` with exactly the six interface members plus the constructor. `reset` is the only permitted instant jump (returns the panoramic composition and reports `Strategic`); `setBattleTarget` snapshots `current`, restarts the fixed-length transition only on a real change, and never touches the transform; `getMode()` stays `BattleFocus` until a pull-back completes.
- The transition timing is expressed as an **elapsed-frame fraction** (`t = (duration − remaining) / (duration − 1)`) with exact interpolation endpoints and a defensive component snap on the final frame — so the first update is exactly `t = 0` (no jump) and the `switchFrames`-th update is exactly `t = 1` (lands on `fitTransform`). The test asserts the 9th update is still visibly short of the target and the 10th matches it.
- The effective minimum scale handed to battle fitting is `min(config.minScale, panoramic scale)`, so a small viewport can never force an over-zoom that would break the ≥90% guarantee (Pitfall 22); the test recomputes the same 口径 for its expected transform.
- Shake is frame-counted and deterministic: the impulse is coerced finite and non-negative, clamped per call and after accumulation to `shakeAmplitudePx`, emitted from the camera's own `frameIndex`, and decayed by `shakeDecayPerFrame` once per update. Two cameras fed identical frames produce identical transforms, and a 1000 px impulse never exceeds the cap.
- Every degenerate path is guarded: empty/all-NaN point sets return `null` → panoramic, zero-size viewports and zero scales fall back to finite values, and no emitted `ICameraTransform` can contain NaN or Infinity (T-05-13/T-05-14).

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
| ---- | ---- | ------ | ---- |
| 1 | Add pure camera math with percentile fit box | `4fb2da5` | feat |
| 2 | Implement Camera as a two-mode state machine | `b98a034` | feat |

_Measured via the plan ledger: `git rev-list --count 532cf86..HEAD` = 2 task commits at SUMMARY write time (`plan_head_before: 532cf86`)._

## Files Created/Modified

- `src/render/cameraMath.ts` (created, 417 lines) — guarded helpers (`clampFinite`, `finiteOr`, `positiveOr`, `medianSorted`, `interpolateScale`) plus `lerp`, `smoothstep`, `easeInOutCubic`, `fitBox`, `fitTransform`, `strategicTransform`, `trackTransform`, `interpolateTransform`, `worldToScreen`, `screenToWorld`; y deliberately unflipped; no Pixi, no random, no wall-clock.
- `src/render/Camera.ts` (created, 264 lines) — `Camera implements ICamera`; eight JSDoc'd private fields, two JSDoc'd private helpers (`resolveTarget`, `effectiveMinScale`), one phase-step constant for frame-counted shake.
- `tests/render/camera-math.test.ts` (created, 534 lines) — 23 tests: the coverage table, outlier robustness, null/finite guards, coverage clamping, panoramic containment (1920×1080 and 640×360), battle-fit zoom and `maxScale`, tracking no-teleport, transition endpoints/monotonic scale, interpolation helpers, screen round-trip/shake separation/y-axis orientation, degenerate fallbacks.
- `tests/render/camera.test.ts` (created, 332 lines) — 12 tests: reset composition and pre-update finiteness, target change with no movement, `switchFrames`-th landing plus per-frame movement bound, unchanged-target no-restart, pull-back mode timing, empty-point composition, shake cap/decay/determinism, finite transforms for degenerate input.

## Decisions Made

- **Median centre, not `IBattle.getCenter()`.** The battle centre is level-weighted and can be pulled by one high-level unit; the median is outlier-robust, which is what makes the tail-exclusion proof meaningful.
- **`maxScale` only ever shrinks.** Capping the zoom can only make the box smaller on screen, so the coverage guarantee survives the clamp; the risk is the opposite direction, which is why `Camera` lowers `minScale` instead of raising it.
- **Exact interpolation endpoints plus a completion snap.** Endpoints make the transition assertions exact; the snap protects the landing against last-bit log-space drift.
- **Shake shares one phase step between the axes.** With `x = cos(phase)`, `y = sin(phase)` the emitted magnitude equals the amplitude exactly, so "capped" and "monotonically decaying" hold for the vector, not just per component (see Deviations).
- **No extra private helpers.** Shake accumulation/emission/decay stays inline in `update()` so the class surface is exactly the interface plus constructor, as the frozen contract requires (AGENTS §5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `fitBox` initially measured distances against independently sorted axes**
- **Found during:** Task 1, first run of the coverage table
- **Issue:** the first draft sorted `xs` and `ys` separately and then paired them by index when computing Chebyshev distances, which mixes different points and under-counted the box (n = 100 kept 87 instead of 90).
- **Fix:** keep the finite points as pairs and compute each distance from its own `(x, y)` while the medians still come from the sorted coordinate arrays. The coverage table then proved 90/100.
- **Files modified:** `src/render/cameraMath.ts`
- **Commit:** `4fb2da5` (fixed before the task commit)

### Intentional refinement

**Shake emission uses one shared phase step rather than the plan's two example multipliers.** The plan suggested `cos(frame * 2.399963)` and `sin(frame * 3.113117)` scaled by the amplitude; with two different phases the *vector* magnitude can reach `√2 × amplitude` and cannot decay monotonically when the amplitude halves. `Camera` therefore advances one irrational phase per output frame (`SHAKE_PHASE_STEP = 2.399963`) and emits `x = cos(phase) · amplitude`, `y = sin(phase) · amplitude`, so the vector magnitude equals the amplitude exactly. No interface, config field or caller changed; the cap (T-05-14) and the monotone-decay assertion are now provable.

No other deviation: no file outside the plan's `files_modified` was touched, and `src/render/types.ts` is byte-identical to the approved contract.

## Issues Encountered

- The paired-coordinate bug above was caught by the plan's own coverage table before any commit — evidence that the ≥90% property is genuinely tested rather than asserted.
- `IMapBounds`/`IVec2` are not re-exported by `@/render/types` (it imports them for its own declarations); both modules and both tests therefore import those two upstream shapes from `@/kingdom/types`, which is the frozen owner. No contract change.
- `git` reported the usual LF→CRLF warning on the new files (repo default on Windows); no content change and no hook failure.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/render/camera-math.test.ts` | 1 file / 23 tests passed |
| `pnpm vitest run tests/render/camera.test.ts` | 1 file / 12 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 38 files / 407 tests passed |
| `node` presence check over `src/render/cameraMath.ts` | `CAMERA_MATH_OK` |
| `node` presence check over `src/render/Camera.ts` | `RENDER_CAMERA_OK` |
| `git diff --stat 532cf86..HEAD` | only the 4 plan files (all added) |
| `src/render/types.ts` | untouched (absent from the diff) |
| Phase 1–4 source dirs | untouched (absent from the diff) |

## Known Stubs

None. Both modules are complete implementations: every function later plans consume (`Camera` for 05-07's per-frame update, `worldToScreen`/`screenToWorld` for 05-07's markers and 05-09's picking, `smoothstep` for 05-05's HUD hybrid scale) is exported, tested and wired to the shipped `DEFAULT_RENDER_CONFIG.camera`.

## Threat Flags

None beyond the plan's `<threat_model>`. T-05-13 is implemented and tested (non-finite points dropped, empty sets return `null` → panoramic, zero/negative spans and viewports replaced, every emitted component finite); T-05-14 is implemented and tested (impulse coerced finite/non-negative, clamped per call and after accumulation, decayed every frame, vector magnitude ≤ amplitude). T-05-15/T-05-16 are the accepted decisions (no centre clamping, no battle scoring). No dependency was added (T-05-SC), and neither module performs I/O, network access or DOM access.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready:** wave 3/4 consumers can now call `camera.update({ viewport, bounds, points, shakeImpulsePx })` once per output frame and use `getTransform()` for unit placement, HUD scaling and canvas picking; `screenToWorld` already subtracts shake so 05-09's `MoveTo` picking is a one-line call.
- **Contract discipline held:** `src/render/types.ts` was not modified, so Round-2 plans continue against the frozen, user-approved contract.
- **Phase 5 remains IN PROGRESS:** frame model, HUD model, unit views, Renderer/Hud, demo runner/panel and Chrome UAT are still pending (05-04..05-10). Do not advance to Phase 6.
- **Calibration hook:** `switchFrames`/`smoothingFrames`/`shakeAmplitudePx`/`shakeDecayPerFrame` are all read from `DEFAULT_RENDER_CONFIG.camera`, so 05-10 can retune the feel without touching this code.

## Self-Check: PASSED

- FOUND: `src/render/cameraMath.ts`
- FOUND: `src/render/Camera.ts`
- FOUND: `tests/render/camera-math.test.ts`
- FOUND: `tests/render/camera.test.ts`
- FOUND: commit `4fb2da5` (feat: pure camera math with percentile fit box)
- FOUND: commit `b98a034` (feat: Camera two-mode state machine)
