---
phase: 05-render-system
plan: 21
subsystem: render
tags: [kingdom, render, camera, runner, post-battle, gap-closure]
gap_closure: true

# Dependency graph
requires:
  - phase: 04-kingdom-system
    provides: "`IZoneBattleSystem.hasActiveBattle`/`listActiveBattles` and the `tick()` rate decision (D-07/D-09)"
  - phase: 05-render-system
    provides: "`Camera.setBattleTarget` single-phase pull-back over `panFrames` = 24 (05-15), `ManualRunner` entry freeze and target policy (05-16/05-17), `Renderer.collectTargetPoints`/`collectBattleWeight` (05-07)"
provides:
  - "Post-battle 1x hold: 90 aftermath ticks + 24 pull-back ticks before the 24x peace rate"
  - "`ManualRunner` retains the finished battle's camera target for exactly 90 frames"
  - "`Renderer` last-focus cache keeps the battle layer and framing alive while the target id outlives the battle"
affects: [05-render-system, demo, 06-recording]

actuals:
  tokens: 9372
  tasks: 3
  commits: 4
plan_head_before: 36134a08611417bc640af92c78c94cdf281a1c0d

tech-stack:
  added: []
  patterns:
    - "Post-battle aftermath is a frame/tick budget, never a wall clock: the world spends it at 1x, the runner holds the camera target for the same window, and the renderer caches the last focus so the battle view survives the battle"
    - "A retained id is a render contract: consumers must tolerate an id that outlives its entity by falling back to a cache keyed on that same id, and must drop the cache on change or clear"

key-files:
  created: []
  modified:
    - src/kingdom/constants.ts
    - src/kingdom/KingdomWorld.ts
    - src/demo/runner.ts
    - src/render/Renderer.ts
    - tests/kingdom/time.test.ts
    - tests/demo/runner.test.ts
    - tests/kingdom/battle.test.ts
    - tests/kingdom/tracer.test.ts
    - tests/kingdom/city.test.ts

key-decisions:
  - "The world holds 1x for `POST_BATTLE_HOLD_TICKS + POST_BATTLE_PULLBACK_TICKS` (114) ticks after the last battle; the tick in which a battle ends does not consume the budget, so the aftermath is 114 full ticks after the battle is gone"
  - "The budget refreshes to full on every tick that still has an active battle, which is exactly the 'a new battle resets the hold' rule and keeps a live battle at 1x no matter how long it lasts"
  - "`finalRate` is computed before the countdown decrement, so the last aftermath tick still reports `minutesPerTick: 1` and the jump to 24 is observable on the very next call"
  - "The runner keeps the finished battle's target for 90 frames even when another battle is already active, then switches to it without an entry freeze — the plan's step 2 sequence, and the reason the aftermath is readable rather than a cut"
  - "The runner's hold counter is a missing-literal field (`number | undefined`) so 'not armed' and 'armed with 0 left' stay distinguishable without a second boolean (AGENTS §8)"
  - "The renderer caches points and weight together with the id that produced them instead of resolving the ended battle from the completed list: the completed list has no live unit reads, and the camera must keep the exact framing it had on the last active frame"

patterns-established:
  - "1x aftermath + pull-back + 24x is one counted timeline: 90 (hold) + 24 (pull-back) = 114 world ticks, and 90 runner frames + the 24-frame `Camera` exit"

requirements-completed: [REND-04, REND-05]

coverage:
  - id: D1
    description: "After the last battle the world advances exactly 1 game minute per tick for 114 ticks, then 24"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/kingdom/time.test.ts#advances 1× for 114 ticks after the last battle, then 24×"
        status: pass
      - kind: unit
        ref: "tests/kingdom/tracer.test.ts#drives two armies into a unit-level battle and keeps ticking afterwards"
        status: pass
    human_judgment: false
  - id: D2
    description: "A new battle appearing during the aftermath resets the hold and keeps 1x"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/kingdom/time.test.ts#resets the hold when a new battle appears during the aftermath"
        status: pass
    human_judgment: false
  - id: D3
    description: "The camera target is retained for exactly 90 output frames after the battle disappears, then cleared (or switched) without an entry freeze"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/demo/runner.test.ts#keeps the finished battle for exactly 90 frames, then clears the target"
        status: pass
      - kind: unit
        ref: "tests/demo/runner.test.ts#does not freeze on battle-to-battle switches or on clearing the target"
        status: pass
      - kind: unit
        ref: "tests/demo/runner.test.ts#drops a pending hold on reset"
        status: pass
    human_judgment: false
  - id: D4
    description: "The entry freeze is unchanged and battle end never freezes the frame loop"
    requirement: REND-05
    verification:
      - kind: unit
        ref: "tests/demo/runner.test.ts#renders 24 panoramic frames with zero ticks, then sets the target and ticks"
        status: pass
      - kind: unit
        ref: "tests/demo/runner.test.ts#does not hold anything while the battle is still active"
        status: pass
    human_judgment: false
  - id: D5
    description: "The renderer keeps drawing the battle view during the hold by reusing the cached points/weight for the same target id"
    requirement: REND-04
    verification:
      - kind: typecheck
        ref: "`pnpm typecheck` — the cache rides the existing private `collectTargetPoints`/`collectBattleWeight` path"
        status: pass
      - kind: build
        ref: "`pnpm build` (vite) succeeds"
        status: pass
    human_judgment: true
    rationale: "`Renderer.ts` imports pixi.js and there is no headless renderer harness, so the cache path cannot be asserted automatically; only a human watching Chrome can confirm the battle view really persists for ~3 s after the fight ends and that the pull-back starts afterwards"

duration: 22min
completed: 2026-10-25
status: complete
---

# Phase 05 Plan 21: Post-battle aftermath hold

**The end of a battle no longer cuts straight to 24×: the world keeps advancing at 1× for 90+24 ticks, the runner holds the finished battle's camera target for exactly 90 frames, and the renderer keeps the battle view alive from a cache — so the viewer reads the result, then watches the single-phase pull-back, and only then does peace speed resume.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-10-25T13:52:00+08:00 (approx.)
- **Completed:** 2026-10-25T14:10:00+08:00 (approx.)
- **Tasks:** 3
- **Files modified:** 9
- **Commits:** 4 (measured from the plan ledger: `git rev-list --count 36134a0..HEAD` — 3 task commits + this plan-metadata commit)

## Accomplishments

- **No more 24× jump on the frame a battle ends.** `KingdomWorld.tick` now owns a `postBattleHoldTicks` budget. Any tick that still sees an active battle refreshes it to `POST_BATTLE_HOLD_TICKS + POST_BATTLE_PULLBACK_TICKS` (= 114); a battle-free tick decrements it and stays at `BATTLE_TICK_MINUTES`; only a zero budget returns to `PEACE_TICK_MINUTES`. The tick in which a battle ends does not consume the budget, so a finished fight is followed by 114 full 1× ticks. `time.getMinutesPerTick()` is set on the same predicate before *and* after the substep loop, so both the tick result and the HUD clock report the effective rate.
- **The camera does not snap away from the corpse.** `ManualRunner.updateTarget` now arms `postBattleHoldFrames = POST_BATTLE_HOLD_TICKS` on the first frame whose target is missing from `listActiveBattles()`, keeps the target while it burns down, and only on the frame that consumes the last hold frame clears the target (or switches to the battle that is still running). Nothing about the `undefined → number` entry freeze changed: it is still 24 frozen panorama frames *before* the target is written.
- **The battle layer survives the battle.** `Renderer` caches the last resolved fit points and battle weight together with the target id. When the id is still set but the battle has left the active list, both collectors return the cached values for that same id; a changed or cleared id drops the cache, and `reset()` drops it too. That keeps `unitLayer`/HUD in `BattleFocus` with a stable framing instead of re-fitting an empty point set and dropping to the panorama mid-hold.
- **The sequence the user asked for is now the shipped timeline:** 1× aftermath (90 ticks / ~3 s at 30 fps) → 1× pull-back (24 ticks / 0.8 s, the existing single-phase `Camera` exit) → 24× peace.
- **Timing stays counted.** Every number is a frame or tick count; nothing in the three changed files reads a clock.

## Task Commits

1. **Task 1: World-side post-battle 1× hold** — `4ead703` (fix)
2. **Task 2: Runner retains the target during the aftermath** — `2b12ac3` (fix)
3. **Task 3: Renderer last-focus cache during the hold** — `8208246` (fix)
4. **Plan metadata: complete summary** — this commit (docs)

## Files Created/Modified

- `src/kingdom/constants.ts` — `POST_BATTLE_HOLD_TICKS = 90` and `POST_BATTLE_PULLBACK_TICKS = 24`, both JSDoc'd (tick counts, 30 fps reading, calibration note tying the second to `Camera.panFrames`).
- `src/kingdom/KingdomWorld.ts` — private `postBattleHoldTicks`, `refreshPostBattleHold()`, `resolveTickRate()`, and a rewritten `tick()` that captures `battleAtStart`, refreshes before and after the substep loop, and decrements only on a battle-free tick.
- `src/demo/runner.ts` — private `postBattleHoldFrames` (`number | undefined`), aftermath-aware `updateTarget`, and counter resets in `reset()`, `dispose()` and `setAutoFollow(false)`.
- `src/render/Renderer.ts` — private `focusCacheId` / `focusCachePoints` / `focusCacheWeight`, a shared `findTargetBattle()`, a `resetFocusCache()`, and cache-aware `collectTargetPoints` / `collectBattleWeight`; `reset()` clears the cache.
- `tests/kingdom/time.test.ts` — two real-Rapier cases (114-tick hold; new battle resets it) plus their scenarios/helpers.
- `tests/demo/runner.test.ts` — a `drainAftermathHold` helper, three new hold cases, and reworked clear/switch expectations; the fixture's `resetSession` now mirrors production (`camera.reset`).
- `tests/kingdom/battle.test.ts` — the end-of-battle rate test asserts the 114-tick 1× hold and the following 24× tick (renamed accordingly).
- `tests/kingdom/tracer.test.ts` — end-to-end tracer asserts the same hold before peace speed returns.
- `tests/kingdom/city.test.ts` — the garrison re-arrival bound now covers the 114-tick hold the march runs through.

## Decisions Made

- **The hold budget is refreshed by presence, not by a start event.** `refreshPostBattleHold()` runs whenever `hasActiveBattle()` is true, before and after the substeps. This is what makes "a new battle resets the hold" true for free, and it means a battle that runs for 10 000 ticks never lets a stale countdown leak into its aftermath.
- **The ending tick does not spend the budget.** `battleAtStart` is captured before the substeps, so the tick whose substep killed the last member is still a battle tick. The 114 1× ticks are therefore all *after* the battle is gone, matching the runner's "90 frames after the battle disappears".
- **`finalRate` is written before the decrement.** The last aftermath tick still returns `minutesPerTick: 1` while advancing one minute; the first peace tick returns 24 for both fields. This makes the boundary observable and keeps `getMinutesPerTick()` honest for the HUD.
- **The runner holds before switching between battles.** Plan step 2 is explicit, and it reads well cinematically: finish the fight you were watching (3 s), then cut to the next one. No entry freeze is armed for that switch — only `undefined → number` freezes.
- **The renderer caches by target id, not by battle.** The completed-battle list has no live unit reads, so re-resolving the ended battle would either drop the point set or freeze a stale one from a different code path. Caching the last active frame's points/weight keeps the exact framing that was on screen.
- **`postBattleHoldFrames` uses `undefined` for "not armed".** A plain `0` cannot distinguish "never armed" from "just expired", and AGENTS §8 reserves `undefined` for missing literals (AGENTS §11 forbids getters as an alternative encoding).

## Verification

| Check | Result |
| --- | --- |
| `pnpm vitest run tests/kingdom/time.test.ts` | 1 file, 19 tests passed |
| `pnpm vitest run tests/demo/runner.test.ts` | 1 file, 20 tests passed |
| `pnpm vitest run tests/kingdom/battle.test.ts tests/kingdom/tracer.test.ts` | 2 files, 21 tests passed |
| `pnpm vitest run tests/kingdom/city.test.ts` | 1 file, 19 tests passed |
| `pnpm test` | 46 files, 534 tests passed |
| `pnpm typecheck` (`tsc --noEmit`) | exit 0, no diagnostics |
| `pnpm lint` (`eslint .`) | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` (out of scope) |
| `pnpm build` (`vite build`) | built successfully (pre-existing large-chunk notice) |
| Diff scope | `git diff --numstat 36134a0..HEAD` → the 9 files listed above only |
| Deletions | none (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty on all three task commits) |

Proof detail for the two acceptance criteria:

- **1× for 114 then 24×** (`tests/kingdom/time.test.ts#advances 1× for 114 ticks after the last battle, then 24×`) — one Swordsman per side, centres 5 m apart so the battle starts on the first tick; `killRoster(2)` then ticks until no battle is active. From there 114 calls each return `gameMinutes === 1` and `minutesPerTick === 1`, `getGameMinutes()` grows by exactly 114, and the 115th call returns `gameMinutes === 24` and `minutesPerTick === 24` (also asserted through `getMinutesPerTick()`/`getSubstepsPerTick()`).
- **New battle resets the hold** (`… #resets the hold when a new battle appears during the aftermath`) — armies 3 and 4 start 90 m apart (trigger is < 80 m) with `MoveTo` orders; they close 1/3 m per tick because the aftermath is 1×, and the second battle triggers `burned > 1` ticks into the hold. That battle is then killed too and the following 114 ticks are all 1× — an unrefreshed budget would have run out ~30 ticks early and returned 24.
- **Exactly 90 frames of retention** (`tests/demo/runner.test.ts#keeps the finished battle for exactly 90 frames, then clears the target`) — after the target is established, the battle is removed from the fake active list. The first aftermath frame arms the hold and keeps the target; frames 2–90 keep it while `probe.ticks` advances by exactly 90 (no frozen frames); frame 91 clears it with `getMode() === BattleFocus`, i.e. the exit transition has begun and has not landed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing tests asserted the old immediate 24× return**
- **Found during:** Task 1 (`pnpm test` after the world change)
- **Issue:** `tests/kingdom/battle.test.ts#finishes a battle … keeps ticking at peace rate` asserted `minutesPerTick === 24` three ticks after the battle ended, and `tests/kingdom/tracer.test.ts` asserted 24× for 10 ticks right after `Ended`. Both encoded the behaviour this plan deliberately replaces.
- **Fix:** Both now walk the 90+24 ticks at 1× and assert the 24× tick that follows; the battle test was renamed to say what it now proves.
- **Files modified:** `tests/kingdom/battle.test.ts`, `tests/kingdom/tracer.test.ts`
- **Verification:** `pnpm vitest run tests/kingdom/battle.test.ts tests/kingdom/tracer.test.ts` → 21 passed.
- **Committed in:** `4ead703` (Task 1 commit)

**2. [Rule 3 - Blocking] City garrison re-arrival test ran out of ticks**
- **Found during:** Task 2 (`pnpm test`)
- **Issue:** `tests/kingdom/city.test.ts` (first city-battle case) re-ordered army 1 to garrison and allowed only 40 ticks for arrival. With the new aftermath the world is at 1× for 114 ticks, so the army walks 1/6 m per tick instead of 4 m and never arrives inside the bound.
- **Fix:** The bound is now `POST_BATTLE_HOLD_TICKS + POST_BATTLE_PULLBACK_TICKS + 40` (154), documented in-place; the loop still exits as soon as the order clears.
- **Files modified:** `tests/kingdom/city.test.ts`
- **Verification:** `pnpm vitest run tests/kingdom/city.test.ts` → 19 passed.
- **Committed in:** `2b12ac3` (Task 2 commit)

**3. [Rule 2 - Missing critical test seam] Runner fixture reset did not mirror production**
- **Found during:** Task 2 (writing `#drops a pending hold on reset`)
- **Issue:** The fixture's `resetSession` only counted calls, while production's reset calls `renderer.reset()` (which resets the camera to the panorama). Without that, a reset could only be observed as "target still set", so the plan's "reset clears a pending hold" was unassertable and the fake diverged from the real contract.
- **Fix:** The fixture's `resetSession` now calls `camera.reset(BOUNDS, VIEWPORT)` after counting, mirroring `src/main.ts`.
- **Files modified:** `tests/demo/runner.test.ts`
- **Verification:** all 20 runner tests pass, including the pre-existing `#clears a pending freeze on reset`.
- **Committed in:** `2b12ac3` (Task 2 commit)

**4. [Rule 1 - Bug] Mixed line endings in `tests/kingdom/time.test.ts`**
- **Found during:** Task 2 (`pnpm lint`, `prettier/prettier` errors)
- **Issue:** That file was CRLF in the working tree while the rest of the repo is LF; appending with LF-only edits left it mixed, and `endOfLine: "auto"` then demanded CRLF everywhere (381 errors).
- **Fix:** Normalised the file to CRLF (its first line's ending) and ran `eslint --fix`; the follow-up `time.test.ts` formatting diff was committed with Task 2.
- **Files modified:** `tests/kingdom/time.test.ts`
- **Verification:** `pnpm lint` → 0 errors.
- **Committed in:** `2b12ac3` (formatting carry-over)

---

**Total deviations:** 4 auto-fixed (2 Rule 1, 1 Rule 2, 1 Rule 3)
**Impact on plan:** All four are consequences of the intended behaviour change or test-harness fidelity; no production scope creep, and no battle membership/centre logic was touched.

## Issues Encountered

- **Off-by-one in the runner hold.** The first implementation armed 90 and kept the target while the *pre-decrement* counter was positive, which retained it for 91 frames. Fixed by decrementing first and returning only when the remaining count is still positive, so the frame that consumes the last hold frame clears the target. The dedicated 90-frame test pins it.

## Known Stubs

None.

## Verification Gaps

- **The renderer cache has no automated test.** `Renderer.ts` imports `pixi.js` and the render suite has no headless `Renderer`/`IWorld` fake, so `collectTargetPoints`/`collectBattleWeight` cannot be exercised without building a large fake Pixi app. The behaviour is recorded as `human_judgment: true` in `coverage` (D5) and is proven structurally by typecheck/build plus reading.
- **The 3 s / 0.8 s feel is a live judgement.** The tick and frame counts are pinned by tests, but whether the aftermath actually reads as "time to take in the result" (and whether holding through a battle-to-battle switch is pleasant) is a Chrome UAT call.

## Threat Flags

None — no new network, auth, file-access or trust-boundary surface. The changes only hold existing state for longer and reuse it.

## User Setup Required

None.

## Next Phase Readiness

- **Phase 6 recording:** the battle-end cut is now 90 frames of held framing + 24 frames of pull-back instead of a single-frame jump. Any segment boundary that assumed the old immediate 24× should use `camera.getMode()` (flips to `Strategic` when the pull-back lands), not a frame count.
- **Calibration knobs:** `POST_BATTLE_HOLD_TICKS` (world + runner) and `POST_BATTLE_PULLBACK_TICKS` (world) in `src/kingdom/constants.ts`; the 24 must stay in step with `DEFAULT_RENDER_CONFIG.camera.panFrames`. Raising the hold requires no other change; changing the pull-back count requires both.
- **Manual check:** run `pnpm dev`, let a battle finish in Chrome, and confirm ~3 s of 1× battle view, a 0.8 s pull-back, and only then the sped-up panorama.

---

*Phase: 05-render-system*
*Completed: 2026-10-25*

## Self-Check: PASSED

- FOUND: .planning/phases/05-render-system/05-21-SUMMARY.md
- FOUND: 4ead703 (Task 1)
- FOUND: 2b12ac3 (Task 2)
- FOUND: 8208246 (Task 3)
- FOUND: src/kingdom/constants.ts
- FOUND: src/kingdom/KingdomWorld.ts
- FOUND: src/demo/runner.ts
- FOUND: src/render/Renderer.ts
- FOUND: tests/kingdom/time.test.ts
- FOUND: tests/demo/runner.test.ts
- `pnpm test` 534 passed / 46 files · `pnpm typecheck` exit 0 · `pnpm lint` 0 errors (2 pre-existing `no-console` warnings in `src/main.ts`) · `pnpm build` ok
