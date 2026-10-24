---
phase: 05-render-system
plan: 11
subsystem: control-ai
tags:
    [
        typescript,
        melee-ai,
        stall-detection,
        determinism,
        rapier2d,
        real-physics-regression,
        uat-gap-closure
    ]

# Dependency graph
requires:
    - phase: 03-control-system (plans 03-02/03-03)
      provides: IUnitObservation (tick, unitId, motion, enemies), IUnitAction, DefaultUnitAI behaviour tree, control tuning constants
    - phase: 02-physics-system
      provides: PhysicsWorld started-only contact drain (damage requires a *new* contact) and the frozen damage formula
    - phase: 04-kingdom-system
      provides: real unit spawn path (spawnUnit + Unit) used by the regression fixtures
provides:
    - src/control/DefaultUnitAI.ts — deterministic stall → disengage → charge cycle inside the existing decision function
    - src/control/constants.ts — five new typed/JSDoc'd constants for stall threshold, stall decisions, disengage ticks/speed/lateral weight
    - tests/control/stalemate.test.ts — real-Rapier proof that melee damage recurs instead of freezing after the opening contact
affects:
    [
        05-12 (other UAT gaps: the same AI is the only decision maker),
        05-13,
        Phase 6 recording (fights must keep producing damage to be worth filming),
        future AI plugin work (the cycle is internal to DefaultUnitAI, no contract change)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 5792
    tasks: 2
    commits: 2
    plan_head_before: d03cff60b74c08c45729c8e527ff576ec136d6fa

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Stall detection by distance差分: the AI measures the per-decision shrink rate of the tracked target distance instead of projecting its own velocity, because IUnitBrief carries no target velocity and absolute projection never dips while both units translate'
        - 'Disengage window is tick-counted instance state (disengageUntilTick) compared against observation.tick — no wall clock, no RNG'
        - 'Lateral back-off sign is unitId parity (±1), chosen once per cycle, so a given unit always peels off to the same side'
        - 'Real-physics regression fixtures keep the AI as the only variable: the provider returns DefaultUnitAI per unit while PhysicsWorld, Sensor and the damaged sink stay real'

key-files:
    created:
        - tests/control/stalemate.test.ts
    modified:
        - src/control/DefaultUnitAI.ts
        - src/control/constants.ts
        - tests/control/default-ai.test.ts

key-decisions:
    - 'Closing speed is measured as (previousDistance − distance) / (elapsedTicks · DT) rather than v·toward: with only self velocity available, a jammed pair that slides together keeps a large projection and the stall never fires (observed: damage froze at tick 79); the distance差分 fires on both a static shove and a mutual-chase orbit'
    - 'Back-off direction is away-from-target plus 0.6 × lateral so the unit peels off to the side instead of grinding straight backwards into whatever is behind it'
    - 'Low-health retreat stays above stall/disengage in the priority chain, and no-enemy plus skill-intent behaviour are byte-identical to before'
    - 'The 4-attacker fixture uses a purpose-built defender (4000 HP, attack 1, mass 200) so low-health retreat cannot end the fight before the assertion window; retreat priority is intentionally untouched by this plan'
    - 'Tests live in a dedicated stalemate.test.ts instead of growing the 1700-line loop.test.ts (explicitly allowed by the task action)'

patterns-established:
    - 'Gap-closure regression proof: run the new test against the pre-fix file (git show <plan-head>:path) to record the failing numbers, then restore and show green'
    - 'AI tuning entry stays constants.ts: behaviour parameters are typed consts with JSDoc, never inline magic numbers'

requirements-completed: [CTRL-02, CTRL-03]

# Coverage metadata (#1602)
coverage:
    - id: D1
      description: 'A melee unit stopped by a blocked push disengages for a fixed tick window, then charges again, so fresh high-Δv contacts keep being created'
      requirement: 'CTRL-03'
      verification:
          - kind: unit
            ref: 'tests/control/default-ai.test.ts#triggers a back-off after DEFAULT_AI_STALL_DECISIONS blocked decisions'
            status: pass
          - kind: unit
            ref: 'tests/control/default-ai.test.ts#resumes the normal charge once the disengage window ends'
            status: pass
          - kind: integration
            ref: 'tests/control/stalemate.test.ts#lands a second duel hit at least 60 ticks after the opening impact'
            status: pass
      human_judgment: false
    - id: D2
      description: 'Stall/disengage is deterministic: no RNG, no wall clock, lateral side fixed by unitId parity, low-health retreat unchanged'
      requirement: 'CTRL-02'
      verification:
          - kind: unit
            ref: 'tests/control/default-ai.test.ts#picks the lateral sign deterministically from unitId parity'
            status: pass
          - kind: unit
            ref: 'tests/control/default-ai.test.ts#lets low health retreat win over the armed stall logic'
            status: pass
      human_judgment: false
    - id: D3
      description: 'A surrounded defender keeps taking damage long past the observed freeze point instead of freezing after one opening impact'
      requirement: 'CTRL-02'
      verification:
          - kind: integration
            ref: 'tests/control/stalemate.test.ts#keeps damaging a surrounded defender past the observed freeze point'
            status: pass
      human_judgment: false
    - id: D4
      description: 'Looks right on screen: fights keep producing visible hits instead of a silent shoving match'
      verification: []
      human_judgment: true
      rationale: 'Automated tests prove damage events recur, but whether the disengage/charge rhythm actually reads as an intense melee in Chrome is a visual judgement for the operator.'

# Metrics
duration: 14min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 11: Melee Stall Gap Closure Summary

**Melee stalemates now break themselves: `DefaultUnitAI` detects a blocked push from the per-decision shrink rate of the target distance, backs off for 30 ticks with a unitId-parity lateral peel, and re-charges — proven by real-Rapier regressions that fail on the old AI (one opening hit) and pass now (hits to tick 1798)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-24T10:56:01Z
- **Completed:** 2026-10-24T11:10:04Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `DefaultUnitAI` gained a deterministic stall → disengage → charge cycle. Damage in this project only comes from physics `started` contacts, so a unit that keeps pressing into a blocked direction can never damage again; it now peels out and re-rams, creating fresh high-Δv contacts.
- Five new tuning constants in `src/control/constants.ts` (`DEFAULT_AI_STALL_SPEED_THRESHOLD` 0.5 m/s, `DEFAULT_AI_STALL_DECISIONS` 4, `DEFAULT_AI_DISENGAGE_TICKS` 30, `DEFAULT_AI_DISENGAGE_SPEED` 8 m/s, `DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT` 0.6), all typed with JSDoc — the AI has no inline magic numbers.
- Six new AI unit tests cover: charge continues while the distance still shrinks, back-off triggers exactly on the 4th blocked decision, lateral mixing keeps the back-off off-axis, the lateral sign is stable per `unitId`, the charge resumes after the window, and low-health retreat still wins.
- `tests/control/stalemate.test.ts` adds two real-Rapier regressions (1v1 knight duel and 4-attackers-around-1-defender). Both were measured against the pre-fix AI file and fail there; both pass on the fix.
- `src/physics/**`, `src/control/types.ts`, collider geometry, collision groups and the damage formula are untouched — the user's chosen AI-only fix was honoured.

## Observed regression numbers (pre-fix → post-fix)

| Scenario | Pre-fix AI | Post-fix AI |
| --- | --- | --- |
| 1v1 knight duel, defender's damaging hits | 1 hit (tick 6, 99.3 dmg) — nothing for 894 more ticks | 2 hits on the defender (tick 6 → 99.3, tick 110 → 144.1); 110 − 6 = 104 ticks ≥ 60 |
| 4 attackers vs defender, defender's damaging hits | 3 hits by tick 32 (14.4 / 19.0 / 0), then silent to tick 1800 | 30+ hits, last at tick 1798; HP 4000 → 2412 |

The pre-fix row was produced by temporarily restoring `git show d03cff6:src/control/DefaultUnitAI.ts`, running `tests/control/stalemate.test.ts` (both tests failed: `expected 1 to be greater than or equal to 2`, and `expected false to be true` for the tick-193 assertion), then restoring the fixed file.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deterministic stall detection + disengage/charge to DefaultUnitAI** - `f1f8975` (feat)
2. **Task 2: Prove repeated melee damage with real physics** - `e42fe35` (test)

**Plan metadata:** see the docs commit below (docs: complete plan)

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/control/DefaultUnitAI.ts` — stall state (`stalledDecisions`, `disengageUntilTick`, `lateralSign`, distance baseline), `measureClosingSpeed`, `noteStall`, `beginDisengage`, `buildDisengageAction`; decision priority is now no-enemy → low health → disengage window → charge (stall-checked) → chase.
- `src/control/constants.ts` — the five new stall/disengage constants.
- `tests/control/default-ai.test.ts` — new `describe('DefaultUnitAI — stall detection and disengage cycle')` block (6 tests).
- `tests/control/stalemate.test.ts` — new real-Rapier regression file (2 tests, no physics mocks).

## Decisions Made

- **Stall metric = distance shrink rate, not velocity projection.** The plan's sketch was `vx·towardX + vy·towardY`. In a real shoving scrum both bodies translate at 6-9 m/s, so the projection rarely drops below 0.5 and the stall never fired (verified: damage still froze at tick 79 with that version). `IUnitBrief` has no target velocity, so the only deterministic relative measure is the change in tracked distance between decisions; that fires on both the static jam and the mutual-chase orbit.
- **Lateral sign from `unitId` parity, chosen at trigger time.** Even → +1, odd → −1; stable across cycles for a given unit, no RNG.
- **Disengage aims away-with-lateral, including the torque.** `buildAction` already derives torque from the returned direction, so the unit turns away during the window and turns back when the charge resumes — matching the plan's note.
- **Retreat priority untouched.** The low-health branch returns before the stall bookkeeping decision and is covered by an explicit test.
- **Regression fixture isolates retreat.** A stock defender drops below 25% HP (or dies) before tick 193, which ends the fight for reasons this plan deliberately does not change; the 4v1 fixture therefore uses a high-HP, low-attack, heavy defender. The 1v1 duel uses two knights because a swordsman-vs-swordsman opening hit takes 88% of the defender's HP.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stall detector could not detect a real stall**
- **Found during:** Task 1 (real-physics measurement with a scratch probe before writing the regression)
- **Issue:** The planned closing speed `vx·towardX + vy·towardY` uses only self velocity. In the 4v1 scrum the AI read 5-9 m/s of "closing" every decision while the actual distance stayed at 1.0-1.6 m, so the counter kept resetting; damage stopped at tick 79 even with the cycle implemented.
- **Fix:** Replaced the projection with `(previousDistance − distance) / (elapsedTicks · DT)` — the true rate at which the tracked target distance shrinks. Baseline state (`lastTargetId`, `lastDistance`, `lastDecisionTick`) is refreshed on every decision, target switches clear it, and a missing baseline counts as "no stall reading" (counter reset).
- **Files modified:** `src/control/DefaultUnitAI.ts`
- **Verification:** same 4v1 fixture went from "last hit tick 79" to "last hit tick 1798"; the 1v1 duel from 1 hit to 2 hits 104 ticks apart; both committed as the Task 2 regression and additionally checked against the pre-fix file.
- **Committed in:** `f1f8975` (Task 1 commit)

**2. [Rule 3 - Blocking] Regression test placed in a new file**
- **Found during:** Task 2
- **Issue:** `loop.test.ts` is already ~1700 lines of fake-world execution semantics; appending real-Rapier stall fixtures there would bury them.
- **Fix:** Created `tests/control/stalemate.test.ts` — the plan's action explicitly allows "or a new tests/control/stalemate.test.ts".
- **Files modified:** `tests/control/stalemate.test.ts` (new)
- **Verification:** file runs standalone (`pnpm vitest run tests/control/stalemate.test.ts`) and in the full suite.
- **Committed in:** `e42fe35` (Task 2 commit)

**3. [Rule 2 - Missing Critical] 4v1 fixture had to isolate low-health retreat**
- **Found during:** Task 2 (fixture calibration)
- **Issue:** With a normally spawned defender, the defender falls under 25% HP at tick ~162 and retreats at 7 m/s while pursuers approach at 6 m/s — the fight ends by design, so "a damage event later than tick 193" could not be asserted for reasons unrelated to the stall fix.
- **Fix:** The 4v1 fixture builds its defender explicitly (`new Unit(Swordsman, { maxHp: 4000, attack: 1, mass: 200, ... })`): too much HP to retreat inside 1800 ticks, too little attack to kill the attackers, heavy enough to stay a stable scrum.
- **Files modified:** `tests/control/stalemate.test.ts`
- **Verification:** post-fix damage recurs to tick 1798; pre-fix nothing after tick 32.
- **Committed in:** `e42fe35` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical fixture isolation, 1 blocking placement)
**Impact on plan:** The Rule 1 fix was required for the plan's own success criterion — the sketched metric simply does not fire under this physics. The other two are test-fixture/placement choices explicitly allowed by the task text. No production scope creep: physics, damage formula, contracts and retreat priority are untouched.

## Issues Encountered

- One full-suite run had two unrelated files time out at the 5 s default (`tests/kingdom/tracer.test.ts`, `tests/units/spawn-normal.test.ts`) under parallel worker load; both pass in isolation and the next full run was green (46 files / 500 tests). Pre-existing flakiness, not caused by this plan.
- PowerShell 5.1 mangled inline `node -e` string replacements containing quotes; switched to the edit tool for those edits.
- `state advance-plan` advanced 9 → 10 and then refused the second advance ("phase-complete declined: 05-10, 05-12, 05-13 have no SUMMARY"), because the phase's plan counter had not been told about the gap plans. `roadmap.update-plan-progress 5` re-derived the real counts (10/13 plans, 30/33 summaries) in ROADMAP.md, and the CLI wrote `stopped_at`, `last_activity_desc`, `state_head` and progress counts in STATE.md. The one derived body line (`Plan: 10 of 10`) was corrected by hand to `11 of 13` so the position matches disk; no other STATE content was hand-edited.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Melee damage now recurs whenever units are in contact-range scrums; 05-12/05-13 can build on a fight that does not silently freeze.
- Still true and worth watching in Chrome UAT: a unit whose target flees faster than `DEFAULT_AI_APPROACH_SPEED` (6 m/s) can never catch up, and a pursuer outside `DEFAULT_AI_ATTACK_RANGE` cannot reach a target moving faster than 6 m/s. The stall/disengage cycle does not address that (out of this plan's scope); if the operator sees runners escaping, that is the next tuning knob.
- `pnpm test` 500 passed, `pnpm typecheck` clean, `pnpm lint` 0 errors (2 pre-existing `no-console` warnings in `src/main.ts`).

## Self-Check: PASSED

- `src/control/DefaultUnitAI.ts` — FOUND
- `src/control/constants.ts` — FOUND
- `tests/control/default-ai.test.ts` — FOUND
- `tests/control/stalemate.test.ts` — FOUND
- commit `f1f8975` — FOUND
- commit `e42fe35` — FOUND
- `src/physics/**` and `src/control/types.ts` unmodified — confirmed via `git diff --name-only d03cff6..HEAD`

---

*Phase: 05-render-system*
*Completed: 2026-10-24*
