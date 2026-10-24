---
phase: 05-render-system
plan: 17
subsystem: render
tags: [pixi, camera, cinematography, manual-runner, battle-entry]

# Dependency graph
requires:
  - phase: 05-render-system
    provides: "05-12 two-phase entry + 05-15 single-phase exit and weight-aware follow"
  - phase: 05-render-system
    provides: "05-16 24-frame battle-entry simulation freeze (frame-counted)"
provides:
  - "Camera entry as one simultaneous centre+scale push-in over zoomFrames (6 frames)"
  - "ManualRunner freeze-before-target: the 24 frozen frames render the strategic panorama because the camera target stays undefined"
  - "Pending-target release on the frame after the freeze, with world.tick() resuming on that same frame"
affects: [06-recording, demo]

actuals:
  tokens: 5600
  tasks: 2
  commits: 3
plan_head_before: d1ec45dd9dd0cc0e2de59940b0bdc9aff0dafedb

tech-stack:
  added: []
  patterns:
    - "Freeze-before-target: the runner defers camera.setBattleTarget until the cinematic hold ends, so the renderer's existing target->layer mapping yields the strategic panorama for free"
    - "Single-segment transition: entry and exit each interpolate centre and scale together with progress (elapsed + 1) / frames"

key-files:
  created: []
  modified:
    - src/render/Camera.ts
    - src/render/types.ts
    - src/demo/runner.ts
    - tests/render/camera.test.ts
    - tests/demo/runner.test.ts

key-decisions:
  - "Entry push-in uses the exit's progress convention, (elapsed + 1) / zoomFrames, so the first entry frame already moves and the 6th lands exactly on the target — no dead frame and no two-phase boundary"
  - "The frozen panorama is achieved by NOT setting the camera target, not by adding a renderer mode: target undefined -> empty fit points -> CameraMode.Strategic -> strategicLayer, all existing behaviour"
  - "The pending battle id is released at the start of the frame after the 24th frozen render, so exactly 24 frozen frames are strategic and ticking resumes on the frame the target is set"
  - "Private panTransform/zoomTransform were deleted with the two-phase entry; no interface field was added, renamed, or reshaped"

patterns-established:
  - "Cinematic ownership split: the runner owns the hold length (BATTLE_ENTRY_FREEZE_FRAMES), the Camera owns the push-in length (zoomFrames)"
  - "Deferred state application: pendingBattleId + releasePendingTarget(world) re-checks battle liveness before writing the camera"

requirements-completed: [REND-04, REND-05]

coverage:
  - id: D1
    description: "Camera entry is a single simultaneous centre+scale push-in that starts moving on the first update and lands exactly on the battle transform on update zoomFrames (6)"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/render/camera.test.ts#lands exactly on the target on the zoomFrames-th update"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#moves centre and scale in the same frame, never in two phases"
        status: pass
      - kind: unit
        ref: "tests/render/camera.test.ts#never moves further in one frame than the remaining distance"
        status: pass
    human_judgment: false
  - id: D2
    description: "During the 24-frame battle-entry freeze the camera target stays undefined and the renderer is in Strategic mode; the target is set only at release and ticking resumes on that same frame"
    requirement: REND-05
    verification:
      - kind: unit
        ref: "tests/demo/runner.test.ts#renders 24 panoramic frames with zero ticks, then sets the target and ticks"
        status: pass
      - kind: unit
        ref: "tests/demo/runner.test.ts#renders exactly one frame without ticking per stepOnce while frozen"
        status: pass
      - kind: unit
        ref: "tests/demo/runner.test.ts#clears a pending freeze on reset"
        status: pass
    human_judgment: false
  - id: D3
    description: "panFrames/zoomFrames keep their names and types; only their JSDoc meaning sharpens (panFrames = exit, zoomFrames = entry)"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/render/types.test.ts (ICameraConfig literal still compiles unchanged)"
        status: pass
      - kind: other
        ref: "pnpm typecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "Battle entry reads on screen as: a frozen strategic panorama you can orient yourself in, then a 0.2 s push into the fight"
    verification: []
    human_judgment: true
    rationale: "Pacing and legibility of the hold/push-in beat are visual qualities; only watching the simulation in Chrome can confirm the fight is still 'intense and good-looking'."

duration: 12min
completed: 2026-10-24
status: complete
---

# Phase 05 Plan 17: Battle-entry cinematography — panoramic hold, then push in

**The 0.8 s battle-entry freeze now renders the strategic panorama (whole map, army and city markers) because the camera target stays undefined, and the target is released into a single 6-frame push-in only after the hold.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-24T23:50:00Z
- **Completed:** 2026-10-24T23:59:00Z
- **Tasks:** 2
- **Files modified:** 5 (+1 encoding repair)

## Accomplishments
- Camera entry collapsed from two phases (24-frame pan at snapshot scale + 6-frame zoom) to one simultaneous centre+scale interpolation over `zoomFrames`; the first entry frame already moves and the 6th lands bit-stably on the battle transform.
- `ManualRunner` now freezes **before** it owns a target: `pendingBattleId` is stored, `camera.setBattleTarget` is deferred, so the renderer's existing "no target → empty points → Strategic" path draws the panoramic layer for all 24 hold frames.
- Release happens on the frame after the hold: the target is applied, `world.tick()` runs on that same frame, and `updateTarget` then keeps the just-set target because it is still active.
- `ICameraConfig` semantics sharpened with no shape change: `panFrames` = exit pull-back, `zoomFrames` = entry push-in.
- `reset()`/`dispose()` drop a pending target; battle-to-battle switches, target clearing and auto-follow-off keep their no-freeze behaviour; the single-timer/no-leak guarantees are unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Camera entry becomes a single push-in** - `73acf49` (fix)
2. **Task 1 repair: UTF-8 restore of the camera tests** - `10f227c` (fix)
3. **Task 2: Freeze in panoramic, then set the target** - `f4385c7` (fix)

_Commit count is measured from the plan ledger: `git rev-list --count d1ec45d..HEAD` = 3._

## Files Created/Modified
- `src/render/Camera.ts` - Entry branch is now a single `entryTransform` over `zoomFrames`; `panTransform`/`zoomTransform` removed; the class/`update()` JSDoc describes two single-segment transitions.
- `src/render/types.ts` - `ICameraConfig.panFrames` / `zoomFrames` JSDoc only (exit duration / entry duration). No field added, renamed or retyped.
- `src/demo/runner.ts` - `pendingBattleId` field, `releasePendingTarget(world)`, write-order `release → tick → updateTarget → render`, pending cleared in `reset()`/`dispose()`, freeze doc rewritten.
- `tests/render/camera.test.ts` - Entry tests rewritten for a 6-frame push-in (first frame moves, 6th lands, centre+scale move together); exit/weight/shake tests untouched in substance.
- `tests/demo/runner.test.ts` - Freeze tests assert `getBattleTarget() === undefined` and `CameraMode.Strategic` throughout the hold, then `BattleFocus` plus resumed ticking at release; `reset`, `stepOnce`, auto-follow-off and re-arm cases updated.

## Decisions Made
- **Progress convention for the entry.** `entryTransform` uses `(elapsed + 1) / zoomFrames`, the same convention as the exit, so all 6 frames do work and frame 6 lands exactly on the target. The plan's phrase "first update t=0" is read as the elapsed counter starting at 0, not as a zero-progress frame — its own test guidance ("scale changes on the first frame, lands on the 6th") requires movement on frame 1.
- **No new renderer mode.** The panoramic hold reuses the target→layer mapping (`undefined` target ⇒ empty fit points ⇒ `CameraMode.Strategic` ⇒ `strategicLayer`), so no new state can disagree with the camera.
- **Release one frame after the hold.** Releasing at the end of the 24th frozen frame would have rendered only 23 strategic frames; releasing at the start of the next frame keeps the hold exactly `BATTLE_ENTRY_FREEZE_FRAMES` and satisfies "ticking resumes on the same frame the target is set".
- **Liveness re-check at release.** If the pending battle ended during the hold, the pending id is discarded and the picture stays panoramic; `updateTarget` then picks the next battle normally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Self-inflicted UTF-8 corruption of `tests/render/camera.test.ts`**
- **Found during:** Task 1 verification (`pnpm lint` reported an unused `battle` variable that appeared to be used)
- **Issue:** A whole-file `TRANSITION_FRAMES → ENTRY_FRAMES` replacement was done with a PowerShell `Get-Content -Raw | Set-Content` round-trip, which decoded UTF-8 as ANSI and re-encoded it. Chinese comments were mangled and one comment swallowed the following `expect(...)` line, silently dropping an assertion.
- **Fix:** Restored the pristine file from `d1ec45d` and re-applied every Task 1 test edit with the UTF-8-safe edit tool; the rewritten assertions are identical to the intended ones and none were weakened.
- **Files modified:** `tests/render/camera.test.ts`
- **Verification:** `pnpm vitest run tests/render/camera.test.ts` (20 passed), `pnpm lint` clean (only the two pre-existing `no-console` warnings in `src/main.ts`), and the file reads back with intact Chinese JSDoc.
- **Committed in:** `10f227c` (separate repair commit, no history rewrite)

**2. [Rule 1 - Bug] Dead identity branch in the first draft of the release path**
- **Found during:** Task 2 implementation
- **Issue:** Calling `releasePendingTarget` unconditionally on ordinary frames required a guard; the first draft cleared `pendingBattleId` before checking liveness, which would have dropped an id that `updateTarget` had just armed in the same frame ordering.
- **Fix:** Final ordering is `getWorld → releasePendingTarget (only when pending is set, checks liveness before applying) → world.tick() → updateTarget(world)`, so the freeze is armed after the release check and can never be consumed in the frame it was armed.
- **Files modified:** `src/demo/runner.ts`
- **Verification:** `tests/demo/runner.test.ts` (16 passed), full suite 523 passed.
- **Committed in:** `f4385c7` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both were execution defects, not scope changes. The plan's 5-file surface, its no-shape-change prohibition and its freeze/push-in timings are all honoured exactly.

## Issues Encountered
- PowerShell 5.1's `Set-Content` defaults to the ANSI code page, so it must never be used to rewrite files containing Chinese text in this repo. All subsequent edits used the edit tool.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entry choreography is now: 24 frozen strategic frames → 6-frame push-in → normal ticking; exit remains the 24-frame single pull-back.
- Visual acceptance of the beat (D4) still needs a human pass in Chrome via the existing demo page; no code change is expected from it unless the hold feels too long.

---
*Phase: 05-render-system*
*Completed: 2026-10-24*

## Self-Check: PASSED

- FOUND: .planning/phases/05-render-system/05-17-SUMMARY.md
- FOUND: 73acf49 (Task 1)
- FOUND: 10f227c (Task 1 encoding repair)
- FOUND: f4385c7 (Task 2)
- FOUND: src/render/Camera.ts, src/render/types.ts, src/demo/runner.ts, tests/render/camera.test.ts, tests/demo/runner.test.ts
- `pnpm test` 523 passed / 46 files · `pnpm typecheck` exit 0 · `pnpm lint` exit 0 (2 pre-existing `no-console` warnings in `src/main.ts`)
