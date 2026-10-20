---
phase: 04-kingdom-system
plan: 04
subsystem: kingdom-garrison-training-vision-terrain
tags: [typescript, kingdom, garrison, training, healing, vision, terrain, rapier2d, tdd]

# Dependency graph
requires:
  - phase: 04-kingdom-system
    plan: 02
    provides: KingdomWorld orchestrator, game clock, army/city models, BattleSystem and SensingWorld
  - phase: 04-kingdom-system
    plan: 03
    provides: IHealableUnit.heal and IStaticObstacleWorld fixed cuboids
  - phase: 03-control-system
    provides: ControlSystem.registerUnit/getTeam/setUnitAI and the 64-ray sensing seam
  - phase: 02-physics-simulation
    provides: PhysicsWorld persistent bodies and the tick event pipeline obstacles stay outside of
provides:
  - Garrison order resolution with one-city-one-garrison symmetry and release on MoveTo/Hold
  - Game-minute training at 96 h (normal) / 72 h (capital) with a hard cap, battle pause and preserved remainder
  - March 1/h and garrison 2/h healing through IHealableUnit.heal, zero while fighting
  - Stateless 100 m army / 150 m city vision union with reduced briefs and unit-level fallback
  - Scenario terrain and four boundary walls as real Rapier static obstacles, cleaned up on dispose
affects: [04-05-city-battles, 05-rendering, 07-ai-commander]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 17007
  tasks: 3
  commits: 3
plan_head_before: c41d1b9eedcbfb9592e2b99ece338708061db5c4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Arrival resolution before movement: orders settle against the current centre, then advanceArmyCenter sees the garrison link and freezes the centre"
    - "One-city-one-garrison resolution through the army map: a live holder wins, a dangling link is cleared, the arriving army is refused without touching the city"
    - "Training is world-owned and city-data-only: progress lives in IMutableCity, production lives in KingdomWorld"
    - "Healing through IHealableUnit per unit per substep, with the battle exclusion asked per unit rather than through the reserved ArmyState.InBattle"
    - "Stateless vision union: circles are rebuilt per query, squared distances only, briefs built field-by-field"
    - "Static geometry ownership: terrain ids and wall ids tracked separately, removed only in dispose, walls never enter getTerrain"
    - "Force-driven real-Rapier tests apply a velocity-damped force every control tick, bypassing world AI"

key-files:
  created:
    - tests/kingdom/city.test.ts
    - tests/kingdom/vision.test.ts
    - tests/kingdom/terrain.test.ts
  modified:
    - src/kingdom/KingdomWorld.ts
    - tests/kingdom/harness.ts
    - tests/kingdom/march.test.ts

key-decisions:
  - "Garrison order resolution is idempotent for the same army, refuses a different live holder by clearing only the arriving army's order, and clears a dangling city link before linking"
  - "A satisfied Garrison order is kept as a standing state; the centre freezes because a garrisoned army resolves a null movement target"
  - "Any non-Garrison order (or a Garrison to another city) releases both links immediately in issueOrder, so a garrisoned army never keeps a stale link"
  - "Training accumulates one game minute per substep only while below the cap and outside Engaging; production is at most one unit per substep and subtracts the threshold, preserving the remainder"
  - "The produced unit is spawned with the city's training class, registered through ControlSystem with teamId = factionId and a monotonic id, then written to the unit/army maps and roster last"
  - "Healing skips units whose getBattleForUnit is non-null; ArmyState.InBattle remains a reserved value that nothing assigns or branches on"
  - "Vision never caches: own entities are always included, enemy armies use centre-or-any-unit, enemy cities/units use their own point, and unknown factions return empty arrays"
  - "The physics parameter is typed IPhysicsWorld & IStaticObstacleWorld so terrain and walls enter through the G-2 seam without changing IPhysicsWorld"
  - "Boundary walls sit outside the map, are tracked separately from terrain and are absent from getTerrain and the ray fan"

patterns-established:
  - "TDD per task: the failing suite is written and observed to fail for the missing behaviour before the world implementation lands"
  - "Garrison symmetry pinned on both sides (army.getGarrisonedCityId ↔ city.getGarrisonArmyId) plus a second-arrival refusal case"
  - "Fast threshold tests: full 96 h / 72 h runs where affordable, seeded progress via the declared IMutableCity view for remainder/cap cases"
  - "Reduced-brief assertions enumerate exact key sets so no internal field can leak through vision"

requirements-completed: [KING-03, KING-04, KING-05]

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "Garrison order resolution: symmetric links, frozen centre, refusal of a second arrival without overwriting, release on MoveTo/Hold"
    requirement: "KING-05"
    verification:
      - kind: integration
        ref: "tests/kingdom/city.test.ts (3 garrison cases, real Rapier)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Game-time training: one unit after 96 h / 72 h, cap pause, battle pause, preserved remainder, physics/control registration with faction team and monotonic id"
    requirement: "KING-05"
    verification:
      - kind: integration
        ref: "tests/kingdom/city.test.ts (4 training cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Healing on game time: marching ≈1/h, garrison ≈2/h, zero in battle, never above maximum, all through IHealableUnit.heal"
    requirement: "KING-03"
    verification:
      - kind: integration
        ref: "tests/kingdom/march.test.ts (2 healing cases) + tests/kingdom/city.test.ts (garrison heal)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Vision union: own always visible, 99/101 m army boundary, centre-outside-unit-inside fallback, 149/151 m city boundary, per-unit ids, immediate disappearance, reduced brief key sets, unknown faction"
    requirement: "KING-04"
    verification:
      - kind: integration
        ref: "tests/kingdom/vision.test.ts (8 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Terrain and boundary walls: movement blocked at the face, gap passable, map edges walled, ray stop at the face, getTerrain copy without walls, dispose removes only own obstacles, no cross-world id leak"
    requirement: "KING-05"
    verification:
      - kind: integration
        ref: "tests/kingdom/terrain.test.ts (7 cases, real Rapier)"
        status: pass
    human_judgment: false

# Metrics
duration: ~35min
completed: 2026-10-20
status: complete
---

# Phase 04 Plan 04: Garrison, training, vision and terrain Summary

**Armies can garrison a city under a strict one-city-one-garrison rule, cities grow units on 96 h/72 h game time under a hard cap while leftover progress survives, marching units heal 1/h and garrisoned units 2/h only when not fighting, vision answers a stateless 100 m/150 m union with reduced briefs, and scenario terrain plus four boundary walls are real Rapier obstacles that clean up on dispose.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 6 (1 implementation, 5 test/harness)
- **Diff:** 1,759 insertions, 31 deletions

## Accomplishments

- `KingdomWorld.resolveOrders` now settles orders before movement: `Garrison` links both sides symmetrically, keeps the order as a standing state and freezes the centre; a second army arriving at an already-held city is refused (order cleared, no link, still marching); `MoveTo` clears its order on arrival; issuing `MoveTo`/`Hold` on a garrisoned army releases both links immediately.
- `applyTraining` runs once per substep after `control.tick`: it pauses at the garrison cap, while the garrison is `Engaging`, and at the global `MAX_SCENARIO_UNITS` ceiling; it produces at most one unit per substep at the normal/capital threshold, subtracts the threshold (keeping the remainder), spawns with `spawnUnit(city.getTrainingClass(), rng)`, and registers through `ControlSystem` with `teamId = factionId` and a monotonic id before mutating the roster.
- `applyHealing` heals each living, non-fighting unit once per substep through `IHealableUnit.heal`: `GARRISON_HEAL_PER_HOUR / 60` when garrisoned, `MARCH_HEAL_PER_HOUR / 60` otherwise. The exclusion is per-unit (`getBattleForUnit`); `ArmyState.InBattle` stays reserved and unread.
- Vision is now the full D-25 union: own armies/cities/units always visible; enemy armies by centre or any unit position; enemy cities and units by their own point; briefs rebuilt field-by-field as fresh reduced objects; no cache, timestamp or last-seen map; unknown faction ids return empty arrays.
- Terrain and walls are physical: every scenario rect maps into `addStaticObstacle`, exactly four boundary walls of `BOUNDARY_WALL_THICKNESS` sit outside the map, walls stay out of `getTerrain()` and the 64-ray fan, and `dispose()` removes only the world's own obstacles while physics/control stay alive.
- Four suites cover the plan's observable predicates on real Rapier: garrison symmetry/refusal/release, 96 h/72 h production, cap and battle pauses, remainder preservation, 1/h and 2/h healing, 99/101 m and 149/151 m boundaries, unit-level fallback, no-memory vision, blocking/gap movement, wall containment, ray stops and dispose cleanup.

## Task Commits

Each task was committed atomically:

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Garrison orders, game-time training and healing | `5b9e880` (feat) |
| 2 | Stateless 100 m/150 m vision union | `084620b` (feat) |
| 3 | Terrain obstacles and four map boundary walls | `84f4eb2` (feat) |

**Plan metadata:** the docs commit created after this SUMMARY (recorded in the orchestrator's log).

## Files Created/Modified

- `src/kingdom/KingdomWorld.ts` — order resolution (garrison/MoveTo, one-garrison rule, release on issue), `applyHealing`, `applyTraining`, `produceGarrisonUnit`, vision union helpers, terrain/wall obstacle creation and disposal; physics typed as `IPhysicsWorld & IStaticObstacleWorld`
- `tests/kingdom/city.test.ts` — 9 cases: garrison linking/freezing, second-arrival refusal, release on MoveTo/Hold, normal 96 h and capital 72 h production, remainder, cap pause, battle pause, garrison heal 2/h and max clamp
- `tests/kingdom/march.test.ts` — 2 new healing cases: marching ≈1/h over 72 game minutes and zero healing in an active battle
- `tests/kingdom/vision.test.ts` — 8 cases: own-side always visible, unknown faction, 99/101 m, centre-outside/unit-inside, per-unit ids, 149/151 m city, disappearance/reappearance, exact brief key sets and fresh arrays
- `tests/kingdom/terrain.test.ts` — 7 cases: terrain face stop, gap pass, boundary containment, ray stops, getTerrain copy, dispose cleanup and physics survival, no cross-world id leak
- `tests/kingdom/harness.ts` — `disposeKingdom` (world before physics) and `physics: PhysicsWorld` so the same instance satisfies both seams

`src/kingdom/City.ts` needed no change: `IMutableCity` already exposed the training-progress getter/setter, and all accumulation/production logic lives in the World so the city stays a data model.

## Decisions Made

- A satisfied `Garrison` order is not cleared; it is a standing state. The centre freeze comes from `resolveOrderTarget` returning `null` for a linked army, so the order remains available for future garrison-follow behaviour.
- The one-garrison rule resolves the holder through the army map, not just the city id: a live holder that points back at the city wins, while an undefined/dangling/one-way link is cleared before the arriving army links. This keeps both sides symmetric without ever stealing a garrison.
- Any order other than a `Garrison` to the same city releases both links at `issueOrder` time, so the commander cannot accidentally leave a stale garrison behind.
- Training pauses by `ArmyState.Engaging` (the single fighting state) and checks the cap before accumulating, so progress is frozen rather than capped at the threshold.
- Production writes the unit/army maps and the roster only after `ControlSystem.registerUnit` succeeds; a registration failure therefore rethrows with no half-registered roster entry.
- Vision circles are rebuilt per query and only squared distances are compared; `getVisibleUnitIds` reads enemy positions from `physics.getUnitState` and skips units without a reading.
- The four walls are centred outside each edge with half extents that cover the full edge plus corners; their ids live in a separate array so `dispose()` can never remove them as terrain.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Test calibration] Battle-pause case uses four enemy units at 40 m**

- **Found during:** Task 1 (city training pause)
- **Issue:** with a single enemy unit, the weighted battle centre shifts toward it after joining, pushing that unit outside the 41 m exit limit on the next substep; the battle then ends before the pause assertion.
- **Fix:** the test places a symmetric four-unit enemy at 40 m, so both sides stay inside the square and `Engaging` persists. No production code changed.
- **Files:** `tests/kingdom/city.test.ts`

**2. [Test adjustment] Unit-level vision fallback needs a repositioned unit**

- **Found during:** Task 2 (centre-outside / unit-inside case)
- **Issue:** `IPhysicsWorld` has no set-position and spawned units sit within 4 m of their army centre, so a 120 m centre keeps every unit outside the 100 m circle.
- **Fix:** the test unregisters and re-registers the enemy unit at 99 m with the same id and team (the same technique the 04-02 battle suite uses for teleporting). Test-only.
- **Files:** `tests/kingdom/vision.test.ts`

**3. [Test adjustment] Re-garrison after a release needs two ticks**

- **Found during:** Task 1 (release on MoveTo/Hold)
- **Issue:** after one tick of movement the centre is ~4 m off the city point; the first re-garrison tick ends at a floating-point distance just above the one-minute arrival tolerance.
- **Fix:** the re-garrison assertion ticks twice, which pins the tolerance semantics without changing production behaviour.
- **Files:** `tests/kingdom/city.test.ts`

**Total deviations:** 3 test-only adjustments. No production deviation, no frozen type change, no dependency change.

## Issues Encountered

None in production code. The training-pause calibration above exposed an emergent BattleSystem property (weighted-centre drift can eject the lone opposing unit) that is already documented in the 04-02 summary; the tests now avoid it by using symmetric armies.

## User Setup Required

None — no external service or secret is involved.

## Next Phase Readiness

- 04-05 can settle city battles against a real garrison link, select garrison survivors with the frozen `GarrisonSelector` seam, transfer city ownership with `setFactionId`, and rely on `issueOrder` releasing links when a winning army re-plans.
- The commander/vision contract is ready: `getVisibleArmies`/`getVisibleCities`/`getVisibleUnitIds` expose exactly the reduced briefs, and no enemy roster/order/training/garrison field is reachable.
- Terrain and boundary walls are real for both movement and rays; disposing the world leaves the composition root's physics/control instances intact.
- Frozen declarations (`src/kingdom/types.ts`, `src/control/types.ts`, `src/units/types.ts`, `src/physics/types.ts`) and `package.json`/lockfile are byte-identical across the plan range.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/kingdom/{city,march,vision,terrain}.test.ts` | 4 suites / 44 tests passed |
| `pnpm test` | 31 files / 298 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `git diff plan-head..HEAD -- src/kingdom/types.ts src/control/types.ts src/units/types.ts src/physics/types.ts package.json pnpm-lock.yaml` | empty |

## Threat Flags

None beyond the plan's `<threat_model>`. Training is bounded by the cap, the one-per-substep rule and `MAX_SCENARIO_UNITS`; vision exposes only the frozen briefs; dispose removes only ids the world created; no network, persistence, secret or new package was introduced.

## Self-Check: PASSED

- FOUND: `tests/kingdom/city.test.ts`, `tests/kingdom/vision.test.ts`, `tests/kingdom/terrain.test.ts`
- FOUND: commits `5b9e880`, `084620b`, `84f4eb2`
- VERIFIED: frozen type files and dependency manifests unchanged
- VERIFIED: `pnpm typecheck`, `pnpm lint` and `pnpm test` (298 tests) pass
