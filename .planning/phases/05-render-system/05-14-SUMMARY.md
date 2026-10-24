---
phase: 05-render-system
plan: 14
subsystem: kingdom-battle
tags:
    [
        typescript,
        battle-system,
        faction-balanced-centre,
        end-debounce,
        uat-gap-closure,
        regression-test
    ]

# Dependency graph
requires:
    - phase: 04-kingdom-armies (plan 04-02)
      provides: BattleSystem membership/centre/end pipeline (join, exit hysteresis, pair locks, everJoinedTeams)
    - phase: 05-render-system (plan 05-11)
      provides: DefaultUnitAI stall-detection + disengage cycle that must keep working after the retreat branch is deleted
provides:
    - src/kingdom/BattleSystem.ts - faction-balanced centre (mean of per-faction weighted centroids) and a per-battle one-sided end streak
    - src/kingdom/constants.ts - BATTLE_END_DEBOUNCE_TICKS = 10
    - src/control/DefaultUnitAI.ts - no health-based retreat; attack / charge / stall-disengage only
    - tests/kingdom/battle.test.ts - 120-tick army-meeting regression (8v8 + 4v4) plus centre-stability and debounce unit tests
affects:
    [
        Phase 6 recording (battle duration now spans many more frames, so a recorded fight is a real fight),
        Phase 7 AI (any replacement controller inherits "no retreat on HP" as the baseline contract)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 5615
    tasks: 3
    commits: 3
    plan_head_before: 1f9797c0634764f10fb87a938b902f01cf328acd

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'A battle centre that must not drift is computed per faction and then averaged: each side anchors the midpoint, so one boundary casualty can only move its own centroid'
        - 'Any "one side remains" ending driven by a stale membership snapshot is debounced with a consecutive-tick streak that any two-team tick resets; annihilation endings stay immediate'
        - 'A regression for a duration bug asserts on the *integration* observable (battle still active, both factions inside, zero completed battles after 120 ticks), not on an internal counter'

key-files:
    created: []
    modified:
        - src/kingdom/BattleSystem.ts
        - src/kingdom/constants.ts
        - src/kingdom/types.ts
        - src/control/DefaultUnitAI.ts
        - src/control/constants.ts
        - tests/kingdom/battle.test.ts
        - tests/kingdom/city.test.ts
        - tests/control/default-ai.test.ts

key-decisions:
    - 'The centre is the equal-weight mean of each faction''s own weighted centroid rather than the weighted centroid of all members. With two factions that is exactly the midpoint of the two faction centroids; with one faction it degrades to that faction''s centroid. A faction id that cannot be resolved forms its own bucket, so no member silently loses its vote.'
    - 'The debounce counts *consecutive* one-sided battle ticks and is only applied to the all-expected-joined path. living === 0 / members.length === 0 endings stay immediate, and the join-grace path (a side that never showed up) is untouched, so a ghost trigger still clears after BATTLE_JOIN_GRACE_TICKS.'
    - 'A retreat-free DefaultUnitAI keeps the stall/disengage cycle intact: the disengage branch already covers "back off, then charge again", so deleting the HP check removes fleeing without removing the anti-stuck behaviour 05-11 added.'
    - 'The regression uses real Rapier kingdom scenarios (8v8 at 300 m and 4v4 at 340 m initial separation, driven across each other) and asserts zero completed battles plus both factions alive in the active battle at +120 battle ticks — the exact pre-fix failure mode (battle finished 2 and 30 ticks after contact with 8+8 and 4+4 units alive).'

patterns-established:
    - 'Battle-square drift is a feedback loop: any centre rule that can be pulled by the side currently inside will eventually exclude the other side. Anchor on both sides or accept the collapse.'
    - 'End conditions driven by a per-tick snapshot need debouncing; end conditions driven by irreversible facts (everyone dead, everyone left) do not.'

requirements-completed: [CTRL-02, CTRL-04]

# Coverage metadata (#1602)
coverage:
    - id: D1
      description: 'The battle square centre is faction-balanced: midpoint of the two factions'' weighted centroids when both are present, the single faction''s centroid when only one is, and unchanged when no member position resolves'
      requirement: 'CTRL-02'
      verification:
          - kind: unit
            ref: 'tests/kingdom/battle.test.ts#uses the injected weight inside a faction and clamps a throwing weight to 1'
            status: pass
          - kind: unit
            ref: 'tests/kingdom/battle.test.ts#moves the centre only slightly when one faction loses a boundary unit'
            status: pass
          - kind: integration
            ref: 'tests/kingdom/battle.test.ts#triggers only inside 80 m, joins members, weights the centre and pins the transition tick'
            status: pass
      human_judgment: false
    - id: D2
      description: 'A one-sided battle (both expected factions have joined) must hold one-sided for BATTLE_END_DEBOUNCE_TICKS consecutive battle ticks before it finishes; any tick with two factions resets the streak; zero-living endings stay immediate'
      requirement: 'CTRL-04'
      verification:
          - kind: unit
            ref: 'tests/kingdom/battle.test.ts#survives a single one-sided tick but ends after the debounce window'
            status: pass
          - kind: unit
            ref: 'tests/kingdom/battle.test.ts#ends when one faction remains and locks the pair until it separates beyond 80 m'
            status: pass
          - kind: integration
            ref: 'tests/kingdom/city.test.ts#does not retrigger the army-city pair until the centres separate beyond 80 m'
            status: pass
      human_judgment: false
    - id: D3
      description: 'Low-health retreat is gone from the default AI: a unit never runs because of HP, and the stall/disengage/skill behaviour is unchanged'
      requirement: 'CTRL-04'
      verification:
          - kind: unit
            ref: 'tests/control/default-ai.test.ts#keeps attacking a low-health unit instead of retreating'
            status: pass
          - kind: unit
            ref: 'tests/control/default-ai.test.ts#lets low health keep the armed stall/disengage cycle instead of fleeing'
            status: pass
          - kind: unit
            ref: 'tests/control/stalemate.test.ts'
            status: pass
      human_judgment: false
    - id: D4
      description: 'Two armies meeting on a real Rapier map keep fighting: after 120 battle ticks exactly one battle is active, both factions have living members inside it, both armies still have living units, and no battle has completed'
      requirement: 'CTRL-02'
      verification:
          - kind: integration
            ref: 'tests/kingdom/battle.test.ts#keeps an army-vs-army meeting alive for 120 battle ticks with both factions represented'
            status: pass
      human_judgment: false
    - id: D5
      description: 'A recorded fight now reads as a fight: the melee lasts long enough to film and the losing side no longer melts away in the first seconds'
      requirement: 'CTRL-02'
      verification: []
      human_judgment: true
      rationale: 'Duration and membership are pinned by tests, but whether the resulting melee is 激烈好看 (Core Value) is a Chrome UAT judgement on a live 8v8/16v16 run — no automated assertion can score spectacle.'

# Metrics
duration: 27min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 14: Battles That Actually Last Summary

**Battle membership is now anchored on both factions at once (the square centre is the midpoint of each faction's own weighted centroid) and a one-sided finish must hold for ten consecutive battle ticks, while the default AI no longer flees on low HP — two armies that meet now fight for hundreds of ticks instead of "ending" two ticks after contact with everyone still alive**

## Performance

- **Duration:** 27 min
- **Started:** 2026-10-24T20:56:00Z (approx.)
- **Completed:** 2026-10-24T21:22:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 8 (0 created, 8 modified)

## Accomplishments

- **Faction-balanced centre.** `BattleSystem.recomputeWeightedCenters` no longer takes the weighted centroid of whatever members happen to be inside. It buckets members by team (unresolvable team ids get their own bucket), computes one weighted centroid per faction with the same injected `unitWeight` / clamp-to-1 safety, then writes the **equal-weight mean of those faction centroids**. Two factions → the midpoint of the two faction centroids; one faction → that faction's centroid; no resolvable position → the centre is left untouched. Join/exit radii, weights and the 80 m trigger are unchanged, and `IBattle.getCenter`'s JSDoc now states the rule.
- **Why the centre mattered.** The old rule was a positive-feedback loop: the trigger fires at 80 m while the membership square is only 80 m wide, so only part of each army joins; recomputing the centre on the partial membership slid the square toward the side that had joined, which excluded more of the other side, which slid it further. Measured on a real 8v8 meeting (armies at x=350/650, seed 31): the battle triggered on tick 27 and was gone on tick 29 — two battle ticks, 8+8 units alive. With the faction-balanced centre the same run is still one active battle at +120 ticks with 6 vs 7 living members inside and **zero** completed battles.
- **One-sided end debounce.** Added `BATTLE_END_DEBOUNCE_TICKS = 10` (battle substeps; one substep is one battle game-minute) and a per-battle `oneSidedTicks` streak. In `endBattles`, `teams.size > 1` clears the streak, the all-expected-joined one-sided branch increments it and only calls `finishBattle(battle, true)` once it reaches the window. The streak map is cleaned on create, on merge absorption and in `finishBattle`. `living === 0` / `members.length === 0` endings and the join-grace `endUnsettled` path are untouched and still immediate.
- **Low-health retreat removed.** `DefaultUnitAI.decide` no longer short-circuits into a pure reverse run when HP is low; `isLowHealth` is deleted and `DEFAULT_AI_LOW_HEALTH_RATIO` / `DEFAULT_AI_RETREAT_SPEED` are removed from `src/control/constants.ts` (no other importer existed). Charge / Spin / ArrowStorm / bow intents and the 05-11 stall → disengage → re-charge cycle are unchanged. A low-health unit now keeps ramming, and if it is being pinned it still performs the lateral-peel disengage instead of a straight flee.
- **Regression that fails on the old behaviour.** `keeps an army-vs-army meeting alive for 120 battle ticks with both factions represented` runs two real Rapier meetings (8v8 at 300 m separation, 4v4 at 340 m) and asserts, after 120 battle ticks: exactly one active battle, no completed battles, both factions present among its living members, and both armies still holding living units. Pre-fix measurements: 8v8 ended 2 ticks after trigger; 4v4 ended 30 ticks after trigger; both with every unit still alive. Post-fix: both survive the full window with `completed === 0`.
- **Centre-stability unit test.** The stub-physics suite now kills a faction's outermost member and asserts the centre moves to the exact new midpoint (177.5 from 175) — half the drift the raw weighted centroid would produce (183.3) — and that nobody else is dropped.

## Verification

| Command | Result |
| --- | --- |
| `pnpm vitest run tests/kingdom/battle.test.ts tests/control/default-ai.test.ts` | 39 passed |
| `pnpm vitest run tests/control/default-ai.test.ts tests/control/stalemate.test.ts` | 21 passed |
| `pnpm vitest run tests/kingdom/city.test.ts` | 19 passed |
| `pnpm test` | 46 files / 510 tests passed |
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` |
| `git diff --name-only` (all three task commits) | 8 files, all under `src/kingdom`, `src/control`, `tests/kingdom`, `tests/control` — `src/render/**` untouched |

Battle-duration evidence (real Rapier, 1 game-minute per battle tick):

| Scenario | Pre-fix | Post-fix |
| --- | --- | --- |
| 8v8, armies 300 m apart, seed 31 | triggered tick 27, ended tick 29 (2 battle ticks), 8+8 alive | still active at +120, 6 vs 7 members, 0 completed |
| 4v4, armies 340 m apart, seed 32 | triggered tick 32, ended tick 62 (30 battle ticks), 4+4 alive | still active at +120, 3 vs 3 members, 0 completed |
| 8v8, 80 m spawn separation (sep 100/140/180/220 sweep) | ended 15 battle ticks after trigger (join-grace path, one side never entered) | unchanged by design — one side never joined, so the pair re-arms after the grace (recorded as a known remaining pathology, see Deviations) |

Manual UAT still open (Chrome): watch a live 8v8/16v16 melee and judge whether the duration now reads as 战斗激烈好看.

## Task Commits

Each task was committed atomically:

1. **Task 3: Remove low-health retreat** - `55f7be0` (fix)
2. **Task 1: Faction-balanced battle centre** - `e88fde2` (fix)
3. **Task 2: Debounce one-sided battle endings** - `f7d4c04` (fix)

**Plan metadata:** the docs commit that follows this SUMMARY.

_Note: no TDD tasks in this plan. Task 3 was committed first because it is the only one that touches no shared file, which let Tasks 1 and 2 stay atomic on their shared `BattleSystem.ts` / `battle.test.ts` changes; each of the three commits was verified green (`pnpm test`, `pnpm typecheck`, `pnpm lint`) in isolation before committing._

## Files Created/Modified

- `src/kingdom/BattleSystem.ts` — `recomputeWeightedCenters` rewritten as per-faction weighted centroids averaged per faction; new `oneSidedTicks` map plus its lifecycle (create / merge / finish); `endBattles` streak gate; matching JSDoc on `endBattles` and the recompute pass.
- `src/kingdom/constants.ts` — new `BATTLE_END_DEBOUNCE_TICKS = 10` with JSDoc explaining the consecutive-tick rule and its exclusion of annihilation endings.
- `src/kingdom/types.ts` — `IBattle.getCenter` JSDoc only: documents the faction-balanced rule (no shape change).
- `src/control/DefaultUnitAI.ts` — removed the `isLowHealth` branch and method, dropped the two retreat constants from the import list, updated the class and `decide` priority JSDoc (idle → disengage window → ram/stall → pursue).
- `src/control/constants.ts` — deleted `DEFAULT_AI_RETREAT_SPEED` and `DEFAULT_AI_LOW_HEALTH_RATIO`.
- `tests/kingdom/battle.test.ts` — faction-midpoint assertions in the weighted-centre test, new `meetingScenario` / `driveAcross` / `livingCount` / `livingTeamsOf` helpers, new 120-tick meeting regression, rewritten stub weight test (weight now probed *within* a faction), new centre-stability test, new one-sided-debounce test, and the two existing end tests updated to wait out the window.
- `tests/kingdom/city.test.ts` — the army–city retrigger test now waits out the debounce window (`tickUntilNoBattle(kingdom, BATTLE_END_DEBOUNCE_TICKS + 5)`) instead of asserting an immediate finish.
- `tests/control/default-ai.test.ts` — the two retreat tests replaced with "low health keeps attacking" and "low health keeps the armed stall/disengage cycle".

## Decisions Made

- **Equal-weight mean of faction centroids, not midpoint-only special-casing.** Writing the two-team case as "midpoint of two centroids" would need a separate branch for three-plus factions (possible after merges). Averaging one centroid per faction answers both at once and keeps a single code path; with two factions it is exactly the documented midpoint.
- **Unknown team ids get their own bucket.** `teamOf` may return `undefined` for an unregistered unit. Skipping those members outright would have silently changed the old `hasPosition` guarantee, so they accumulate under an `undefined` key and still contribute one centroid.
- **Debounce only the all-expected-joined path.** The zero-living branch already represents an irreversible fact, and the join-grace branch handles "a side never showed up"; putting either behind a timer would leave ghost battles pinned at 1×.
- **Task commits ordered 3 → 1 → 2.** `src/control/**` shares nothing with the battle work, so committing it first kept the two battle commits clean. For those two, the shared file was brought to the Task-1-only state, verified green, committed, then the debounce state was restored and verified green again — no partially-tested commit exists in history.
- **Test the integration observable, not a counter.** The regression asserts `listActiveBattles()`/`listCompletedBattles()`/living membership rather than `tickCounter` arithmetic, so it keeps its meaning if the debounce value is retuned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing one-sided end tests asserted the pre-fix immediate finish**
- **Found during:** Task 2 (debounce)
- **Issue:** Three tests encoded "battle ends on the first one-sided tick" (`ends when one faction remains…`, `does not settle a one-sided battle before the other side joins`, and `city.test.ts#does not retrigger the army-city pair…`). The debounce deliberately changes that behaviour, so they failed.
- **Fix:** Each now ticks through the window before asserting the end (and asserts the battle is still active *inside* the window, which is the new guarantee). The city test uses the existing `tickUntilNoBattle` helper with a bound of `BATTLE_END_DEBOUNCE_TICKS + 5`.
- **Files modified:** `tests/kingdom/battle.test.ts`, `tests/kingdom/city.test.ts`
- **Verification:** `pnpm vitest run tests/kingdom/battle.test.ts tests/kingdom/city.test.ts` green; full suite 510/510.
- **Committed in:** `f7d4c04` (Task 2 commit)

**2. [Rule 3 - Blocking] Stub weight test could no longer observe the weight**
- **Found during:** Task 1 (centre)
- **Issue:** The test had one unit per faction, so under the faction-balanced rule each faction centroid equals its single member and the weight cancels out — the test would have passed while proving nothing about weighting.
- **Fix:** Gave faction 1 two members at different weights (160 w1, 190 w3) and faction 2 one member (210), so the expected midpoint is 196.25 only if the weight is honoured (and 192.5 when every weight clamps to 1 for the throwing case).
- **Files modified:** `tests/kingdom/battle.test.ts`
- **Verification:** `pnpm vitest run tests/kingdom/battle.test.ts` green.
- **Committed in:** `e88fde2` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were consequences of the planned behaviour change landing on tests written for the old behaviour. No scope creep: no production file outside the plan's `files_modified` was touched.

## Issues Encountered

- **A second, unchanged pathology surfaced while measuring.** When armies spawn already inside the 80 m trigger but entirely on one side of the initial square (my sweep at 100–220 m separation), the battle is one-sided from birth: only one team ever joins, `allExpectedJoined` is false, so the join-grace `endUnsettled` path ends it after 15 ticks and the pair re-arms and re-triggers — an endless one-sided loop pinned at 1×. This is **not** the reported bug and is deliberately out of scope for this plan (the fix would be a centre/join rule change, not a debounce). Recorded as `.planning/WINDOWS.md` entry #3 (`unmet-truth`) so the next UAT round can decide whether a "never joined" battle should instead widen/relocate the square or simply be suppressed until the armies are genuinely overlapping.
- **A one-tick off-by-one in the debounce test.** The killed member's tick already counts as streak tick 1, so `for (tick = 0; tick < DEBOUNCE - 1)` ended the battle one iteration early. Rewritten as `for (tick = 1; tick < DEBOUNCE)` to express "the window is DEBOUNCE ticks including the first one-sided tick".

## User Setup Required

None — no external service configuration required. Start the dev server yourself (`pnpm dev`) when you want to watch a fight.

## Known Stubs

None. Every behaviour asserted here is wired to real code paths: the centre comes from live physics positions, the debounce counts real battle ticks, and the AI changes are exercised through `DefaultUnitAI.decide` directly.

## Threat Surface Scan

No new network, auth, filesystem or schema surface. The only new input path is the private per-battle streak map, which is bounded by the number of active battles and cleaned in all three removal paths (create, merge absorption, finish).

## Next Phase Readiness

- Combat duration is now a property of the battle layer, not of luck: 05-15/05-16 can rely on a meeting producing a multi-hundred-tick fight.
- Any future AI (Phase 7 pluggable controllers) inherits "no HP retreat" as the baseline; if a replacement controller reintroduces fleeing, battles will stall again — worth a note in the AI contract.
- `src/render/**` untouched by this plan; the 05-10/05-13 render work is unaffected.
- Outstanding human follow-up: the Chrome UAT pass on how a long fight looks and films (D5, `human_judgment: true`), plus the one-sided-from-birth loop recorded under Issues Encountered.

## Self-Check: PASSED

- `src/kingdom/BattleSystem.ts` — FOUND
- `src/kingdom/constants.ts` — FOUND
- `src/kingdom/types.ts` — FOUND
- `src/control/DefaultUnitAI.ts` — FOUND
- `src/control/constants.ts` — FOUND
- `tests/kingdom/battle.test.ts` — FOUND
- `tests/kingdom/city.test.ts` — FOUND
- `tests/control/default-ai.test.ts` — FOUND
- commit `55f7be0` — FOUND
- commit `e88fde2` — FOUND
- commit `f7d4c04` — FOUND

---

*Phase: 05-render-system*
*Completed: 2026-10-24*
