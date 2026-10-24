---
phase: 05-render-system
plan: 16
subsystem: demo-runner
tags:
    [
        typescript,
        frame-loop,
        battle-entry-freeze,
        camera-choreography,
        uat-gap-closure,
        fake-timers
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-01)
      provides: ICamera / IRunnerDeps / IRunnerWorld / IRunnerRenderer contracts and the frozen Camera transform writer
    - phase: 05-render-system (plan 05-03)
      provides: two-phase entry transition in Camera (panFrames = 24 hold-zoom pan, then zoomFrames = 6 push-in)
    - phase: 05-render-system (plan 05-15)
      provides: single-phase pull-back; battle-to-battle switches no longer travel through the map centre
    - phase: 04-kingdom-armies
      provides: IBattleSystem.listActiveBattles / IBattle.getId (the auto-follow target source)
provides:
    - src/demo/runner.ts - BATTLE_ENTRY_FREEZE_FRAMES = 24 plus the freeze counter; frozen frames render only
    - tests/demo/runner.test.ts - fake-timer proof of 24 render-only frames with 0 ticks, then tick resume
affects:
    [
        Phase 6 recording (entry cuts now hold a still battlefield for 24 output frames before units move),
        Any later battle-entry pacing (freeze is a single exported frame constant, not a wall-clock delay),
        Future runner work (freeze is cleared by reset/dispose, so session lifetime semantics stay uniform)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 3233
    tasks: 1
    commits: 1
    plan_head_before: b4ef853f2d17da236e2bc785da6b79aacb0bf0c7

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'The runner keeps a frame counter, not a timer, for the entry freeze: duration is independent of the operator frame delay and identical under stepOnce'
        - 'A frozen frame renders but skips both world.tick() and updateTarget(), so the frozen scene cannot re-resolve its target mid-pan'
        - 'Entry choreography is split by ownership: the runner freezes the simulation for panFrames, Camera performs the pan then the push-in, so neither side duplicates the other''s timing'

key-files:
    created: []
    modified:
        - src/demo/runner.ts
        - tests/demo/runner.test.ts

key-decisions:
    - 'BATTLE_ENTRY_FREEZE_FRAMES = 24 equals Camera.panFrames in DEFAULT_RENDER_CONFIG, so the simulation is frozen for exactly the pan segment (0.8 s at 30 fps) and resumes as the 6-frame push-in starts.'
    - 'The freeze is armed inside updateTarget only on an undefined -> defined target while autoFollow is on; battle-to-battle switches, exiting to panorama, and auto-follow-off never freeze, so every pre-existing targeting test keeps its meaning.'
    - 'Frozen frames still call renderer.renderFrame() and still increment frameCount, but skip getWorld()/world.tick() and skip target re-resolution, so the frozen scene stays put while the camera interpolates.'
    - 'The counter is cleared by reset() and dispose() alongside pause(), so no freeze can outlive a session or a disposed runner.'
    - 'No new interface member was added: the runner is still the only loop owner and the renderer still schedules nothing (REND-05 prohibition held).'

patterns-established:
    - 'Frame-counted gate inside the single setTimeout loop: `if (freezeFramesRemaining > 0) { decrement } else { tick + target }` then one unconditional renderFrame().'
    - 'Runner tests drain the entry freeze with an explicit drainEntryFreeze helper (24 stepOnce calls) before asserting steady-state targeting, instead of hiding the window behind a mock.'

requirements-completed: [REND-04, REND-05]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
    - id: D1
      description: 'On battle entry the runner outputs exactly 24 frames that call renderFrame() and zero frames that call world.tick(), then resumes one tick per frame.'
      requirement: REND-05
      verification:
          - kind: unit
            ref: 'tests/demo/runner.test.ts#renders 24 frames with zero ticks on battle entry, then resumes ticking'
            status: pass
      human_judgment: false
    - id: D2
      description: 'The freeze is scoped: only undefined -> defined under auto-follow, one render-only frame per stepOnce while frozen, cleared by reset(), never armed with auto-follow off, and re-armed on re-entry.'
      requirement: REND-04
      verification:
          - kind: unit
            ref: 'tests/demo/runner.test.ts#renders exactly one frame without ticking per stepOnce while frozen'
            status: pass
          - kind: unit
            ref: 'tests/demo/runner.test.ts#clears a pending freeze on reset'
            status: pass
          - kind: unit
            ref: 'tests/demo/runner.test.ts#never freezes while auto-follow is off'
            status: pass
          - kind: unit
            ref: 'tests/demo/runner.test.ts#does not freeze on battle-to-battle switches or on clearing the target'
            status: pass
          - kind: unit
            ref: 'tests/demo/runner.test.ts#re-arms the freeze when a target reappears after clearing'
            status: pass
      human_judgment: false
    - id: D3
      description: 'Battle entry reads as a held battlefield during a 0.8 s camera pan followed by a 0.2 s push-in, with no unit motion during the pan.'
      requirement: REND-05
      verification: []
      human_judgment: true
      rationale: 'Whether the entry beat looks good (still battlefield under a pan, then a push-in that does not feel like a lurch) is a visual pacing judgement; no unit test can assert perceived smoothness.'

# Metrics
duration: 7min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 16: Battle-Entry Simulation Freeze Summary

**The runner now holds the battlefield still for 24 output frames (0.8 s at 30 fps) when auto-follow enters a battle, rendering every frame while calling no `world.tick()`, then resumes ticking exactly as the camera begins its 6-frame push-in.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-24T22:09:10+08:00
- **Completed:** 2026-10-24T22:15:45+08:00
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- `BATTLE_ENTRY_FREEZE_FRAMES = 24` (exported, JSDoc'd) is the entry beat length; it matches `Camera.panFrames` in `DEFAULT_RENDER_CONFIG`, so the freeze covers the pan segment exactly and releases on the frame the push-in starts.
- `ManualRunner.runOneFrame` branches on a single private `freezeFramesRemaining` counter: frozen frames skip `world.tick()` and skip target re-resolution but still call `renderer.renderFrame()` and still increment `frameCount`; ordinary frames keep the previous tick → updateTarget → render order.
- The freeze is armed only on an `undefined → defined` target inside `updateTarget` while auto-follow is on. Battle-to-battle switches, pull-backs to panorama, and auto-follow-off never freeze.
- `reset()` and `dispose()` clear the counter, so no freeze survives a session reset or a disposed runner; `stepOnce()` while frozen advances exactly one render-only frame.
- Six new fake-timer tests pin the frame accounting: 24 renders / 0 ticks then tick resume, one render-only `stepOnce` frame, reset clearing, auto-follow-off never freezing, no freeze on switch/exit, and re-arming on re-entry.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the battle-entry freeze** - `218b4d0` (feat)

**Plan metadata:** see the docs commit that carries this SUMMARY.

## Files Created/Modified

- `src/demo/runner.ts` - adds `BATTLE_ENTRY_FREEZE_FRAMES`, the `freezeFramesRemaining` counter, the frozen branch in `runOneFrame`, the arm-on-entry rule in `updateTarget`, and counter clearing in `reset()`/`dispose()`.
- `tests/demo/runner.test.ts` - adds `drainEntryFreeze`, the `battle-entry freeze (REND-05)` suite, and drains the freeze in the three pre-existing targeting tests so they still assert the steady-state policy.

## Freeze Test Assertions

The core proof (`renders 24 frames with zero ticks on battle entry, then resumes ticking`) asserts, after one normal frame and one detection frame:

- `probe.ticks` unchanged across `vi.advanceTimersByTime(DELAY_MS * 24)` while `probe.renders` grows by exactly 24;
- `runner.getFrameCount()` grows by the same 24 (frozen frames are real output frames);
- `vi.getTimerCount()` stays at 1 throughout the freeze (single-timer discipline preserved);
- the next frame ticks once and renders once, i.e. ticking resumes one-per-frame;
- `dispose()` leaves `vi.getTimerCount() === 0`.

## Decisions Made

- **24, not a wall-clock 0.8 s.** The freeze is counted in output frames, so it behaves identically at any operator frame delay and under `stepOnce`; it also matches the camera's `panFrames` so both sides of the choreography end on the same frame.
- **Skip target re-resolution while frozen, not just ticking.** Otherwise a battle ending mid-pan would retarget the camera and break the held composition the freeze exists to create.
- **Arm the freeze on the detection frame's `updateTarget`, not on `start()`.** The detection frame still ticks (the battle is discovered by that tick) and the 24 frozen frames follow it, which is what the tests and the user-visible beat describe.
- **No interface change.** `IManualRunner` is untouched; the freeze is internal state, so no consumer (operator panel, composition root) needs updating.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing targeting tests fell inside the new freeze window**

- **Found during:** Task 1 (Add the battle-entry freeze)
- **Issue:** `updateTarget` now arms a 24-frame freeze on the first battle. The three existing auto-follow tests called `stepOnce()` again immediately after the detection frame, expecting a tick and a re-resolved target — under the new semantics those calls are frozen render-only frames, so the target assertions failed.
- **Fix:** Added a `drainEntryFreeze(fixture)` helper (24 `stepOnce()` calls) and invoked it after each detection frame in those three tests. Their intents (selection, operator panorama, explicit selection) are unchanged and now assert steady-state behaviour rather than accidentally asserting inside the entry beat.
- **Files modified:** `tests/demo/runner.test.ts`
- **Verification:** `pnpm vitest run tests/demo/runner.test.ts` → 16/16 pass; `pnpm test` → 525/525 pass.
- **Committed in:** `218b4d0` (part of the task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Contained to the test file; the production change is exactly what the plan specified. No scope creep.

## Issues Encountered

None. `pnpm lint` reports two pre-existing `no-console` warnings in `src/main.ts` (unrelated to this plan's files, out of scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Battle entry now has its intended 0.8 s hold + 0.2 s push-in; the visual pacing of that beat (D3) still needs a human viewing pass during verify-work.
- The remaining gap-closure plan in this phase is `05-10-PLAN.md`.

---

*Phase: 05-render-system*
*Completed: 2026-10-24*

## Self-Check: PASSED

- src/demo/runner.ts ? FOUND
- tests/demo/runner.test.ts ? FOUND
- commit 218b4d0 ? FOUND (2 files, 179 insertions, 15 deletions)

