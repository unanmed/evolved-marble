---
phase: 05-render-system
plan: 20
subsystem: render
tags: [kingdom, render, vision, operator-panel, gap-closure]
gap_closure: true

# Dependency graph
requires:
  - phase: 04-kingdom-system
    provides: "D-05 empty-army identity retention (`pruneDeadUnits` keeps the army object and its city links)"
  - phase: 05-render-system
    provides: "`buildStrategicFrame` strategic markers (05-07) and `KingdomWorld.visionCircles`/`getVisibleArmies` (D-25)"
provides:
  - "Zero-roster armies are invisible: no strategic marker, no vision circle, no visible brief, no operator option"
  - "`tests/kingdom/vision.test.ts` pins the contract: empty enemy absent from opponent briefs, empty own army absent and granting no vision"
affects: [05-render-system, demo, 04-kingdom-system]

actuals:
  tokens: 1769
  tasks: 2
  commits: 3
plan_head_before: ed7ec20d837eb4e3feee5db666c3e3f44b147a7f

tech-stack:
  added: []
  patterns:
    - "Retention stays, observability filters: a zero-roster army keeps its identity for D-05/garrison training but is filtered at every read surface the player can observe"

key-files:
  created: []
  modified:
    - src/render/Renderer.ts
    - src/kingdom/KingdomWorld.ts
    - src/kingdom/types.ts
    - src/demo/panel.ts
    - tests/kingdom/vision.test.ts

key-decisions:
  - "Filter by `army.getUnitIds().length === 0` at four read surfaces (strategic frame, `getVisibleArmies`, `visionCircles`, panel dropdown) rather than deleting the army or clearing `City.getGarrisonArmyId()` — D-05 identity retention and garrison training/revival depend on the object surviving"
  - "Empty own armies are hidden too, not just enemies: an own-army brief or a `0` label next to its own arrow is the same ghost the player reported, and the operator cannot issue meaningful orders to a unitless army anyway (`applyCommanderOrder` already rejects an empty roster)"
  - "The renderer's marker-release loop is untouched: dropping the marker from `IStrategicFrame` makes the next `updateStrategic` call release the existing arrow and label through the already-tested path instead of needing a new teardown"
  - "Panel selection clearing needed no new code — `refreshArmyOptions` already compares `select.value` against the wanted id and resets `selectedArmyId` when the option disappeared, which now covers an army that just lost its last unit"

patterns-established:
  - "A hidden-but-retained entity is expressed as filters on observability functions, keeping the storage invariant (D-05) and the view contract independent"

requirements-completed: [REND-04]

coverage:
  - id: D1
    description: "No strategic marker (arrow or `0` label) is produced for a zero-roster army"
    requirement: REND-04
    verification:
      - kind: typecheck
        ref: "`buildStrategicFrame` compiles: the guard reuses the same `getUnitIds()` read that already produced `strength`"
        status: pass
      - kind: unit
        ref: "no headless harness for `buildStrategicFrame` (Renderer.ts imports pixi.js, there is no `IWorld` fake); guard verified by reading + typecheck + build"
        status: unknown
    human_judgment: true
    rationale: "The skip itself is a two-line structural guard, but only a human watching the panoramic view in Chrome can confirm no ghost arrow lingers with a `0` label after a wipe"
  - id: D2
    description: "An empty army provides no vision and appears in no visible-army brief"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/kingdom/vision.test.ts#hides an empty enemy army from its opponents briefs"
        status: pass
      - kind: unit
        ref: "tests/kingdom/vision.test.ts#grants no vision from an empty army, including to its own faction"
        status: pass
    human_judgment: false
  - id: D3
    description: "The operator army selector never lists a zero-unit army"
    requirement: REND-04
    verification:
      - kind: typecheck
        ref: "`appendFactionArmies` guard compiles against `IArmy.getUnitIds()`"
        status: pass
      - kind: build
        ref: "`pnpm build` (vite) succeeds"
        status: pass
    human_judgment: true
    rationale: "No DOM test harness exists for `OperatorPanel`; the dropdown behaviour is structural and was confirmed by typecheck/lint/build plus reading the existing selection-clearing logic"
  - id: D4
    description: "The empty army object and its faction membership survive (D-05 identity retention)"
    requirement: REND-04
    verification:
      - kind: unit
        ref: "tests/kingdom/vision.test.ts#hides an empty enemy army from its opponents briefs (asserts `getFaction(2).getArmyIds()` still contains 2)"
        status: pass
      - kind: unit
        ref: "tests/kingdom/vision.test.ts#grants no vision from an empty army (asserts faction 1 still owns army 1)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-25
status: complete
---

# Phase 05 Plan 20: Empty armies are invisible, not deleted

**A zero-roster army is now filtered at all four surfaces the player can observe — strategic markers, `getVisibleArmies`, `visionCircles` and the operator dropdown — while `KingdomWorld` keeps the army object, its faction membership and its city links exactly as D-05 requires.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-25T13:40:26Z
- **Completed:** 2026-10-25T13:44:30Z (approx.)
- **Tasks:** 2
- **Files modified:** 5
- **Commits:** 3 (measured from the plan ledger: `git rev-list --count ed7ec20..HEAD` — 2 task commits + this plan-metadata commit)

## Accomplishments

- **Ghost markers gone.** `buildStrategicFrame` skips an army whose roster is empty before projecting it, so `IStrategicFrame.armies` no longer contains an arrow at the dead army's last centre. `strength` now reuses the same `unitIds` read. The marker-release loop in `updateStrategic` (`Renderer.ts:573-582`) was deliberately left alone: the arrow that is already on screen leaves through that path on the next frame, which is the code path the existing panoramic tests exercise.
- **Ghost vision gone.** `visionCircles` no longer adds the 100 m army circle for an empty roster — "no units, no observer" — and `getVisibleArmies` skips empty rosters before the own/enemy test, so an empty army is absent from its own faction's briefs as well as its opponents'.
- **Ghost dropdown entry gone.** `OperatorPanel.appendFactionArmies` only appends armies with a positive roster. Selection clearing still works without new code: `refreshArmyOptions` assigns `select.value = String(selectedArmyId)` and resets `selectedArmyId` to `undefined` when the browser rejects the now-missing option.
- **Storage untouched.** No deletion, no roster purge, no `setGarrisonArmyId(null)`. `pruneDeadUnits` is unchanged, so a wiped army keeps its id, faction id, centre and garrison link — the state garrison training and revival depend on.
- **Contract made honest.** `IWorld.getVisibleArmies`' JSDoc now states that zero-roster armies are excluded, matching the behaviour that the D-25 visibility tests assert.

## Task Commits

1. **Task 1: Hide empty armies from markers, vision and visible briefs** — `b052351` (fix)
2. **Task 2: Hide empty armies from the operator army selector** — `14c4e83` (fix)
3. **Plan metadata: complete summary** — this commit (docs)

## Files Created/Modified

- `src/render/Renderer.ts` — `buildStrategicFrame` reads `army.getUnitIds()` once, `continue`s on an empty roster, and reuses that array for `strength`; the function JSDoc records why an empty army produces no marker and points at the release path.
- `src/kingdom/KingdomWorld.ts` — `getVisibleArmies` skips empty rosters before the own/enemy branch; `visionCircles` skips empty-roster armies when building the union. JSDoc on both states the rule and the D-05 retention.
- `src/kingdom/types.ts` — one-line JSDoc update on `IWorld.getVisibleArmies` ("名册为空的军队被排除").
- `src/demo/panel.ts` — `appendFactionArmies` requires `army.getUnitIds().length > 0` in addition to `army !== null`.
- `tests/kingdom/vision.test.ts` — two new cases on the real Rapier fixture (see Verification).

## Decisions Made

- **Filter, never delete.** The bug report and the D-05 decision point in opposite directions; the resolution is to keep storage and filter only observability. Every change in this plan is a `continue`/`&&` guard on a read function — nothing mutates world state.
- **Own empty armies are hidden as well.** The playbook only called out an enemy ghost, but a friendly `0`-labelled arrow and a friendly brief are the same artefact. Nothing is lost: `applyCommanderOrder` already rejects an empty roster (`KingdomWorld.ts:787`), and `resolveOrders` clears orders on one, so an empty own army is not actionable anyway.
- **Reuse the empty-roster predicate instead of adding a helper.** `getUnitIds().length === 0` is already the idiom at `KingdomWorld.ts:787/865/1079/1132` and `Commander.ts:46`; a new `isEmptyArmy()` on `IArmy` would be a public member the frozen type contract did not ask for (AGENTS §5/§11).
- **Do not touch the panel's selection logic.** The existing `select.value !== wanted` reset already handles a vanished army, so hiding the option is sufficient — a "helpful" extra reset would be dead code.

## Verification

| Check | Result |
| --- | --- |
| `pnpm vitest run tests/kingdom/vision.test.ts` | 1 file, 10 tests passed |
| `pnpm test` | 46 files, 529 tests passed |
| `pnpm typecheck` (`tsc --noEmit`) | exit 0, no diagnostics |
| `pnpm lint` (`eslint .`) | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` (out of scope) |
| `pnpm build` (`vite build`) | built successfully (pre-existing large-chunk notice) |
| Diff scope | `git diff --stat ed7ec20..HEAD` → `Renderer.ts`, `KingdomWorld.ts`, `types.ts`, `panel.ts`, `tests/kingdom/vision.test.ts` only |
| Deletions | none (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty on both task commits) |

New test detail (`tests/kingdom/vision.test.ts`):

- **`hides an empty enemy army from its opponents briefs`** — own army at (500, 500) with 2 units, enemy army at (570, 500) with 1 unit: baseline `visibleArmyIds(1) === [1, 2]`. After `(enemy as IMutableArmy).setUnitIds([])`, the faction still owns the army id (`getFaction(2).getArmyIds()` contains 2) and its roster reads `[]`, yet `visibleArmyIds(1) === [1]`. Without the `getVisibleArmies` guard this returns `[1, 2]` because the enemy centre sits 70 m inside the own army's circle.
- **`grants no vision from an empty army, including to its own faction`** — same rig with the enemy at (599, 500), i.e. 99 m from the own centre: baseline `visibleArmyIds(1) === [1, 2]`. After clearing the **own** roster, `visibleArmyIds(1) === []` and `visibleCityIds(1) === [1]`. This fails under the old code in two independent ways (own army still included; enemy still seen through the retained circle), and the enemy's own unit at 603 m is 103 m out, so the unit-level fallback cannot mask the missing circle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan named a test file that does not exist**
- **Found during:** Task 1 (`<read_first>` and `<files>` both list `tests/kingdom/sensing.test.ts`)
- **Issue:** There is no `tests/kingdom/sensing.test.ts`. The kingdom-level visibility suite is `tests/kingdom/vision.test.ts` (the only other `sensing.test.ts` is `tests/control/sensing.test.ts`, which covers `KingdomSensingWorld`, an unrelated AI-perception seam).
- **Fix:** Added the two new cases to `tests/kingdom/vision.test.ts`, which already owns the `getVisibleArmies`/`visionCircles` conventions and the real-Rapier fixture they need.
- **Files modified:** `tests/kingdom/vision.test.ts`
- **Commit:** `b052351`

**2. [Rule 2 - Missing critical documentation] Stale contract JSDoc**
- **Found during:** Task 1
- **Issue:** `IWorld.getVisibleArmies` documented "含己方" with no mention of the new exclusion, which would leave the interface description contradicting the implementation (AGENTS §4 requires accurate member JSDoc).
- **Fix:** One-line JSDoc amendment to "含己方；名册为空的军队被排除".
- **Files modified:** `src/kingdom/types.ts`
- **Commit:** `b052351`

## Issues Encountered

None. No retries, no failed commands.

## Known Stubs

None.

## Verification Gaps

- `buildStrategicFrame` has no automated test: `Renderer.ts` imports `pixi.js` and the render test folder has no `IWorld` fake, so adding one would mean building a large fake object solely to assert a `continue`. The guard is proven by typecheck/build and by reading, and its on-screen consequence is a manual panoramic check.
- `OperatorPanel` has no DOM test harness in this repo; the dropdown guard is likewise structural. Both are recorded as `human_judgment: true` in `coverage` above.

## Threat Flags

None — no new network, auth, file-access or trust-boundary surface. The change only removes entries from lists that were already produced.

## User Setup Required

None.

## Next Phase Readiness

- The four observable surfaces now agree that an empty army does not exist, while the kingdom still stores it; a later garrison-training or revival path can reuse the retained object without any of these filters needing to know about it.
- Manual check available any time: start the dev server (`pnpm dev`), let a battle wipe an army, and confirm in Chrome that its arrow/`0` label disappears, that it no longer reveals enemies as it lingers, and that the operator dropdown skips its id.

---

*Phase: 05-render-system*
*Completed: 2026-10-25*

## Self-Check: PASSED

- FOUND: .planning/phases/05-render-system/05-20-SUMMARY.md
- FOUND: b052351 (Task 1)
- FOUND: 14c4e83 (Task 2)
- FOUND: src/render/Renderer.ts
- FOUND: src/kingdom/KingdomWorld.ts
- FOUND: src/demo/panel.ts
- FOUND: tests/kingdom/vision.test.ts
- `pnpm test` 529 passed / 46 files · `pnpm typecheck` exit 0 · `pnpm lint` 0 errors (2 pre-existing `no-console` warnings in `src/main.ts`) · `pnpm build` ok
