---
phase: 05-render-system
plan: 12
subsystem: render-camera
tags:
    [
        typescript,
        camera,
        two-phase-transition,
        pan-then-zoom,
        shake-off,
        battle-framing,
        uat-gap-closure
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-03)
      provides: ICamera two-mode state machine, cameraMath pure helpers (lerp, easeInOutCubic, interpolateTransform, fitTransform, strategicTransform, trackTransform), elapsed-frame transition convention
    - phase: 05-render-system (plan 05-05)
      provides: computeShakeImpulsePx — still feeds ICameraUpdateInput.shakeImpulsePx; its output is now multiplied by a zero amplitude cap
provides:
    - src/render/types.ts - ICameraConfig.panFrames + zoomFrames (user-approved replacement of switchFrames)
    - src/render/Camera.ts - two-phase pan-then-zoom transition (panTransform / zoomTransform) with no teleport and an exact landing
    - src/render/constants.ts - DEFAULT_RENDER_CONFIG.camera = panFrames 24, zoomFrames 6, shakeAmplitudePx 0, minSpanMeters 12
    - tests/render/camera.test.ts - constant-scale-during-pan, zoom-only-after-pan, exact-landing, phase-boundary continuity, pull-back proofs
    - tests/render/import-boundary.test.ts - Camera.ts must stay wall-clock free (frame-counted timing)
affects:
    [
        Phase 6 recording (the same transition is what gets filmed),
        any future camera tuning (durations now live in two fields, not one),
        UAT re-run of the battle focus look
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 5823
    tasks: 2
    commits: 2
    plan_head_before: 51f93b694d424c5e1a034e6dfe949fc138b61630

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Two-phase camera move: a pan segment that returns `scale: from.scale` verbatim (no log-space round-trip), followed by a zoom segment built by feeding interpolateTransform a synthetic start at the target centre'
        - 'Transition timing stays an elapsed-update counter (the k-th update() reads elapsed = k - 1), so the first update of each phase is its own start state'
        - 'Disabling a feature by zeroing its amplitude cap, not by deleting the code path (shake stays reversible by one constant)'

key-files:
    created: []
    modified:
        - src/render/types.ts
        - src/render/Camera.ts
        - src/render/constants.ts
        - tests/render/camera.test.ts
        - tests/render/constants.test.ts
        - tests/render/import-boundary.test.ts
        - tests/render/types.test.ts

key-decisions:
    - 'ICameraConfig.switchFrames was replaced by panFrames + zoomFrames (type change pre-approved by the user on 2026-10-24). No other interface was touched; the rest of the contract is byte-identical.'
    - 'The pan segment returns the literal snapshot scale instead of interpolating scale towards itself: Math.exp(Math.log(s)) is not bit-exact, and the plan requires the scale to be *exactly* frozen during the pan.'
    - 'The zoom segment reuses the already-exported interpolateTransform by synthesising its start at (target centre, snapshot scale). That keeps cameraMath untouched and still gives exact t=0 / t=1 endpoints.'
    - 'Landing index is panFrames + zoomFrames - 1 (29 updates for 24 + 6). Together with the "first update is t=0" convention this is one fewer update than the sum, which is why the plan''s "30 frames total" and its own landing-index formula differ by one; the landing-index formula (restated as a hard constraint) was honoured.'
    - 'Shake is disabled by setting shakeAmplitudePx to 0, not by removing the accumulation/decay code: hudModel.computeShakeImpulsePx and Renderer''s impulse plumbing stay untouched and the effect can be restored with one constant.'

patterns-established:
    - 'Prove a "frozen during phase 1" property with `toBe` (Object.is) on the raw number, not toBeCloseTo — approximations hide creeping zoom'
    - 'Prove a phase boundary is continuous by comparing the last frame of phase 1 with the first frame of phase 2 field by field'

requirements-completed: [REND-04, REND-05]

# Coverage metadata (#1602)
coverage:
    - id: D1
      description: 'Entering battle focus is two-phase: the centre pans for panFrames at the frozen snapshot scale, then the scale zooms over zoomFrames, landing exactly on the fitted target at update panFrames + zoomFrames - 1, with no teleport on the first update of either phase'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/render/camera.test.ts#holds the snapshot scale for every frame of the pan phase'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#changes scale only after the pan, never during it'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#lands exactly on the target on the (panFrames + zoomFrames - 1)-th update'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#hands the zoom phase over without a teleport at the boundary'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#never moves further in one frame than the remaining distance'
            status: pass
      human_judgment: false
    - id: D2
      description: 'Pulling back to strategic uses the same two-phase shape (pan at constant scale, then zoom out) and CameraMode stays BattleFocus until the pull-back completes'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/render/camera.test.ts#pans back at a constant scale before zooming out'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#stays BattleFocus until the pull-back completes'
            status: pass
      human_judgment: false
    - id: D3
      description: 'Hit shake is off in the shipped config (shakeAmplitudePx 0) while the amplitude/decay/impulse code path remains intact and reversible'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/render/camera.test.ts#emits no offset at all under the shipped default config'
            status: pass
          - kind: unit
            ref: 'tests/render/constants.test.ts#ships a 24 + 6 frame two-phase transition with shake switched off'
            status: pass
          - kind: unit
            ref: 'tests/render/camera.test.ts#clamps an oversized impulse to the configured amplitude'
            status: pass
      human_judgment: false
    - id: D4
      description: 'Battle framing is tighter (minSpanMeters 12) so a small fight fills more of the 1920x1080 frame, while coverage stays 0.9 and hud.screenScaleAt > hud.worldScaleAt'
      requirement: 'REND-05'
      verification:
          - kind: unit
            ref: 'tests/render/constants.test.ts#pins the decision-critical camera, HUD and effects values'
            status: pass
          - kind: unit
            ref: 'tests/render/camera-math.test.ts#keeps ceil(coverage x n) points inside for n = 1, 2, 16 and 100'
            status: pass
      human_judgment: false
    - id: D5
      description: 'The new move actually reads better on screen: the pan telegraphs where the camera is going, the late push-in keeps the impact, and units are large enough to watch'
      verification: []
      human_judgment: true
      rationale: 'Watchability and perceived unit size are visual judgements on a running Chrome capture; the tests only pin timing, scale monotonicity and framing numbers, not whether the shot looks good.'

# Metrics
duration: 12min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 12: Camera Two-Phase Move / Shake Off / Tighter Framing Summary

**Battle focus now pans to the fight at a frozen zoom for 24 frames and only then pushes in over 6, with hit shake switched off by a zero amplitude cap and the minimum fit span tightened from 24 m to 12 m**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-24T11:17:00Z
- **Completed:** 2026-10-24T11:31:00Z
- **Tasks:** 2
- **Files modified:** 7 (0 created, 7 modified)

## Accomplishments

- `ICameraConfig.switchFrames` is gone, replaced by `panFrames` and `zoomFrames` — the only interface change, pre-approved by the user. Every other field in `types.ts` is untouched, so the frozen contract anchors still hold.
- `Camera` now runs a real two-phase transition. `panTransform` interpolates only the centre and returns the snapshot `scale` verbatim; `zoomTransform` fixes the centre at the target and eases the scale in log space. The transition lands exactly on `fitTransform` at update `panFrames + zoomFrames - 1` and clears on that same update, flipping `CameraMode` from the target id (Strategic only when the target is `undefined`).
- The pan is genuinely frozen: the test asserts `next.scale === start.scale` with `toBe` (Object.is) for all 10 pan frames of the test config, so a log-space round-trip that returned `4.999999999999999` for `5` would fail.
- Phase hand-over is continuous: the last pan frame already sits on the target centre at the snapshot scale, and the first zoom frame is byte-identical to it (`beta = 0` → `interpolateTransform` returns its start exactly). No teleport at the boundary, and none at the start (`alpha = 0` at `elapsed = 0`).
- Pull-back to strategic uses the same shape: `pans back at a constant scale before zooming out` walks the pull-back pan frame by frame and then checks that the zoom-out lands on `strategicTransform`, with `CameraMode` staying `BattleFocus` until the final update.
- Shake is off by value, not by deletion: `shakeAmplitudePx: 0` with the impulse/accumulate/clamp/decay code intact. `computeShakeImpulsePx` and `Renderer`'s impulse plumbing were not touched; `emits no offset at all under the shipped default config` proves a 1000 px impulse yields a zero offset, and the existing clamp/decay tests still exercise the path with a test-only amplitude of 8.
- Battle framing tightened: `minSpanMeters` 24 → 12 (a single-unit fight now fills roughly twice the frame), `coverage` still 0.9, `hud.screenScaleAt` (20) still strictly above `hud.worldScaleAt` (10). `validateRenderConfig` now asserts `camera.panFrames` and `camera.zoomFrames` instead of `camera.switchFrames`, and the rejection table gained cases for `panFrames: 0` and `zoomFrames: 0`.
- `Camera.ts` remains Pixi-free and wall-clock free — the import-boundary suite gained an explicit `WALL_CLOCK` guard so frame-counted timing (the basis of "the k-th update lands here") cannot regress silently.

## Verification

| Command | Result |
| --- | --- |
| `pnpm vitest run tests/render/camera.test.ts tests/render/constants.test.ts tests/render/types.test.ts` | 48 passed |
| `pnpm test` | 46 files / 507 tests passed |
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` |
| `pnpm build` | built in 635 ms (only the pre-existing >500 kB chunk advisory) |
| `tests/render/import-boundary.test.ts` | 17 passed — `Camera.ts` still Pixi-free and now wall-clock-free |

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ICameraConfig and rework Camera transitions** - `77a5e46` (feat)
2. **Task 2: Verify the whole suite and the import boundary** - `dbc7a3c` (test)

**Plan metadata:** see the docs commit below (docs: complete plan)

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/render/types.ts` — `ICameraConfig.switchFrames` → `panFrames` + `zoomFrames`, each with JSDoc. Nothing else changed.
- `src/render/Camera.ts` — `transitionTotal`/`transitionRemaining` replaced by a single `transitionElapsed` counter; `update()` branches pan/zoom; new private `panTransform` and `zoomTransform` helpers; `setBattleTarget`/`reset` reset the counter.
- `src/render/constants.ts` — `CAMERA.panFrames: 24`, `zoomFrames: 6`, `shakeAmplitudePx: 0`, `minSpanMeters: 12`; validation switched to the new field names.
- `tests/render/camera.test.ts` — test overrides are now `panFrames: 10` / `zoomFrames: 4` with a derived `TRANSITION_FRAMES = 13`; five new assertions (constant pan scale, scale change only after the pan, exact landing, boundary continuity, pull-back constant scale) plus the zero-shake default test.
- `tests/render/constants.test.ts` — pins 24 / 6 / 0 / 12, the 0.8 s + 0.2 s durations, and adds `panFrames`/`zoomFrames` rejection cases.
- `tests/render/import-boundary.test.ts` — new `WALL_CLOCK` pattern and a `Camera.ts` guard.
- `tests/render/types.test.ts` — the `ICameraConfig` literal now uses `panFrames: 20` / `zoomFrames: 10`.

## Decisions Made

- **Frozen pan scale is a literal, not an interpolation.** `interpolateScale` is private to `cameraMath` and `Math.exp(Math.log(s))` can be off by one ULP, so `panTransform` returns `scale: from.scale`. This makes "the scale never moves during the pan" an exact property rather than a tolerance.
- **The zoom segment reuses `interpolateTransform` against a synthetic start.** Building `{centerX: target.centerX, centerY: target.centerY, scale: from.scale}` keeps `cameraMath.ts` untouched (it is not in this plan's file list) while preserving exact `t = 0` / `t = 1` endpoints.
- **Landing index honoured over the plan's "30 frames total" sentence.** At 30 fps, 24 + 6 frames of *duration* would need 31 updates to satisfy an elapsed-fraction schedule; the "first update is t = 0" convention makes the landing arrive at update `panFrames + zoomFrames - 1` = 29. The hard constraint (`panFrames + zoomFrames - 1`) is what the code and tests implement; `constants.test.ts` pins 29 and the 0.8 s / 0.2 s phase durations, and the SUMMARY records the one-update wording gap instead of hiding it.
- **`panFrames = 1` / `zoomFrames = 1` degenerate to a single-frame step.** `update()` clamps both to `>= 1` and the JSDoc states that a one-frame phase is an instantaneous change; the shipped config and the tests use 24 / 6 and 10 / 4, where the no-teleport property holds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tests/render/types.test.ts` had to be updated for the type change**
- **Found during:** Task 1 (Extend ICameraConfig and rework Camera transitions)
- **Issue:** `makeCameraConfig()` in `tests/render/types.test.ts` builds a complete `ICameraConfig` literal with `switchFrames: 30`. After the approved field replacement, `pnpm typecheck` fails on that excess property, and the file is not in the plan's `files_modified` list.
- **Fix:** Replaced the single line with `panFrames: 20` / `zoomFrames: 10`. No assertion was weakened or removed.
- **Files modified:** `tests/render/types.test.ts`
- **Verification:** `pnpm typecheck` clean; `pnpm test` 506/506.
- **Committed in:** `77a5e46` (part of task commit)

**2. [Rule 2 - Missing Critical] Wall-clock guard for `Camera.ts`**
- **Found during:** Task 2 (Verify the whole suite and the import boundary)
- **Issue:** The plan's acceptance criteria rest on frame-counted timing ("the first update is t = 0", "lands on update `panFrames + zoomFrames - 1`"), but nothing prevented a future `Date.now()`/`setTimeout` from breaking that invariant, and Task 2 otherwise had no code delta.
- **Fix:** Added a `WALL_CLOCK` pattern plus one assertion to `tests/render/import-boundary.test.ts` (the file Task 2 lists). It reads source text only, so the boundary test itself stays Pixi- and DOM-free.
- **Files modified:** `tests/render/import-boundary.test.ts`
- **Verification:** 17/17 boundary tests pass; `pnpm lint` and `pnpm typecheck` clean.
- **Committed in:** `dbc7a3c` (task commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both are one-file, no-behaviour-change additions required by the approved type change and by the frame-counted invariant. `Renderer.ts`, `Hud.ts`, `hudModel.ts`, `cameraMath.ts` and every Phase 1–4 file are untouched.

## Issues Encountered

- `Math.cos(phase) * 0` yields `-0`, so the first zero-shake assertion with `toBe(0)` failed under `Object.is`. The test now asserts `Math.abs(shakeX) === 0`; the production value is still a legitimate zero offset.
- The plan's `must_haves` says "24 pan + 6 zoom = 30 frames total" while its own body says the transition lands at update `panFrames + zoomFrames - 1`. Both cannot hold under a `t = 0` first-update schedule; see the third Decision above for how the conflict was resolved.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. Every value added here is wired: the transition reads `panFrames`/`zoomFrames` from the config, the framing reads `minSpanMeters`, and shake reads `shakeAmplitudePx` (now 0) through the existing code path.

## Next Phase Readiness

- The camera work from UAT item 1–3 is complete and self-contained; 05-13 can proceed without touching `Camera.ts` again unless its UAT pass asks for different durations (then only `panFrames`/`zoomFrames` change).
- Human follow-up still outstanding for D5: watch a capture in Chrome and judge whether 0.8 s pan + 0.2 s push-in reads better than the old single 3 s eased move, and whether units are now large enough.

## Self-Check: PASSED

- `src/render/types.ts` — FOUND
- `src/render/Camera.ts` — FOUND
- `src/render/constants.ts` — FOUND
- `tests/render/camera.test.ts` — FOUND
- `tests/render/constants.test.ts` — FOUND
- `tests/render/import-boundary.test.ts` — FOUND
- commit `77a5e46` — FOUND
- commit `dbc7a3c` — FOUND

---

*Phase: 05-render-system*
*Completed: 2026-10-24*
