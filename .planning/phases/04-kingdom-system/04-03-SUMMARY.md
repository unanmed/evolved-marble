---
phase: 04-kingdom-system
plan: 03
subsystem: frozen-folder-seams
tags: [typescript, healing, static-obstacles, rapier2d, ai-ownership, additive-seams, tdd]

# Dependency graph
requires:
  - phase: 04-kingdom-system
    plan: 01
    provides: approved G-1 IHealableUnit, G-2 IStaticObstacleSpec/IStaticObstacleWorld and G-5 IControlSystem.setUnitAI declarations
  - phase: 04-kingdom-system
    plan: 02
    provides: KingdomWorld that installs MarchAI/BattleAI/BrakeAI/IdleAI through setUnitAI (the consumer of G-5)
  - phase: 03-control-system
    provides: ControlSystem registerUnit/tick loop, IUnitAIProvider seam and the round-1 setUnitAI shim
  - phase: 02-physics-simulation
    provides: PhysicsWorld compound bodies, collider tag index and the tick event pipeline that obstacles must stay outside of
  - phase: 01-unit-system
    provides: Unit takeDamage/applyModifiers and spawnUnit that G-1 extends additively
provides:
  - Unit implements IHealableUnit with a guarded, clamped heal that cannot revive a corpse
  - spawnUnit returns IHealableUnit with no cast (C-2 decision)
  - PhysicsWorld implements IStaticObstacleWorld with fixed cuboids in the same Rapier world, silent to contact/damage events
  - complete ControlSystem.setUnitAI ownership via a providerOwned set (exactly-once release, injected instances never handed to the provider)
affects: [04-04-city-terrain-vision, 04-05-city-battles, 05-rendering, kingdom-healing-and-terrain]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 9093
  tasks: 3
  commits: 3
plan_head_before: abbd2fa1a805c9fd419ecb589a401de01284a538

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive seam implementation: frozen declarations untouched, only the implementing class changes"
    - "Guard-before-read: heal validates the amount and the dead state before touching the modifier-adjusted maximum"
    - "Silent geometry: Rapier fixed cuboids created without setActiveEvents and kept out of the collider tag index"
    - "Validate-before-mutate: static obstacle specs throw before any Rapier object exists, so ids are never consumed"
    - "Ownership follows creation: providerOwned set decides whether provider.destroy is the release path"

key-files:
  created:
    - tests/units/heal.test.ts
    - tests/physics/static-obstacles.test.ts
    - tests/control/set-unit-ai.test.ts
  modified:
    - src/units/Unit.ts
    - src/units/spawn.ts
    - src/physics/PhysicsWorld.ts
    - src/control/ControlSystem.ts

key-decisions:
  - "heal returns early when the unit is already dead, so healing can never revive a corpse (D-06 permanent death)"
  - "heal reads the modifier-adjusted MaxHealth through the same applyModifiers call takeDamage uses, so a flat/multiplicative MaxHealth buff moves the clamp too"
  - "spawnUnit's return type is IHealableUnit (C-2); Unit already implements it, so no cast or runtime probe exists anywhere"
  - "Static obstacles are fixed rigid bodies with one cuboid collider, deliberately without active collision events and without a tag-index entry; tick() therefore cannot emit them as a combatant"
  - "addStaticObstacle validates the whole spec before creating anything, so invalid input neither consumes an id nor leaves a half-built body"
  - "setUnitAI releases the predecessor only when providerOwned contains the id; injected instances are adopted by the control layer and merely dropped on replacement/unregister/dispose"
  - "A failed physics registration deletes the ownership record before rethrowing, so dispose cannot double-destroy that unit later"

patterns-established:
  - "TDD seam work: the failing suite is written and observed to fail for the missing method before the implementation lands"
  - "Frozen-contract regression gate: pnpm typecheck plus the unmodified tests/{units,physics,control,kingdom}/types.test.ts suites"
  - "Real-Rapier obstacle harness: force re-applied every step, wall at x=4.5, body radius 0.5, stop asserted at x≈3.5 then released past 4.6"

requirements-completed: [KING-03]

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "Unit.heal behind IHealableUnit: invalid inputs are no-ops, healing clamps to the modifier-adjusted maximum, a dead unit stays at zero, and spawnUnit returns the healable type with no cast"
    requirement: "KING-03"
    verification:
      - kind: unit
        ref: "tests/units/heal.test.ts (7 tests)"
        status: pass
      - kind: other
        ref: "pnpm typecheck (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PhysicsWorld.addStaticObstacle/removeStaticObstacle: fixed cuboids in the same Rapier world block units, emit no contact/damage events, use monotonic ids, no-op on unknown removal and reject invalid specs before mutation"
    requirement: "KING-05"
    verification:
      - kind: integration
        ref: "tests/physics/static-obstacles.test.ts (6 tests, real Rapier)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ControlSystem.setUnitAI ownership: replacement switches the decision source, a provider-owned predecessor is destroyed exactly once, injected instances are never handed to provider.destroy, unknown ids throw and no physics call occurs"
    requirement: "KING-03"
    verification:
      - kind: unit
        ref: "tests/control/set-unit-ai.test.ts (11 tests)"
        status: pass
      - kind: integration
        ref: "tests/control/loop.test.ts + tests/control/pluggable.test.ts (no Phase-3 regression)"
        status: pass
    human_judgment: false

# Metrics
duration: ~12min
completed: 2026-10-20
status: complete
---

# Phase 04 Plan 03: Frozen-folder seams (G-1/G-2/G-5) Summary

**`Unit.heal` behind `IHealableUnit`, silent fixed-cuboid terrain in `PhysicsWorld`, and exactly-once AI ownership in `setUnitAI` — all implemented against untouched frozen contracts**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-20T22:09:00+08:00
- **Completed:** 2026-10-20T22:20:36+08:00
- **Tasks:** 3
- **Files modified:** 4 implementation files + 3 new test files

## Accomplishments

- `Unit implements IHealableUnit`: `heal(amount)` mirrors `takeDamage`'s guards, clamps to the modifier-adjusted `MaxHealth`, and never revives a dead unit (D-06). `spawnUnit` now returns `IHealableUnit` with no cast (C-2), so the kingdom layer can heal without a type probe.
- `PhysicsWorld implements IPhysicsWorld, IStaticObstacleWorld`: fixed cuboids live in the same Rapier world as units, block them, return monotonic ids, never enter the collider tag index and never emit contact/damage events. Invalid specs throw before any Rapier mutation.
- `ControlSystem.setUnitAI` is complete: a `providerOwned` set separates provider-created from injected instances, so replacement destroys exactly one predecessor, injected instances are dropped rather than destroyed, unknown ids throw and no physics/team/registration/held-action state is touched.
- Full suite is green at 272 tests (248 pre-existing + 24 new), with `pnpm typecheck` and `pnpm lint` both exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: G-1 — Unit implements IHealableUnit and spawnUnit returns it** — `adf8bd3` (feat)
2. **Task 2: G-2 — PhysicsWorld implements IStaticObstacleWorld** — `0023152` (feat)
3. **Task 3: G-5 — complete setUnitAI ownership** — `db66915` (feat)

**Plan metadata:** the docs commit created after this SUMMARY (recorded in the orchestrator's log).

## Files Created/Modified

- `src/units/Unit.ts` — `implements IHealableUnit` + guarded `heal(amount)`; `takeDamage`, level-up and every other member untouched
- `src/units/spawn.ts` — return type `IHealableUnit`, JSDoc records the C-2 decision; rolls and name counter byte-identical
- `src/physics/PhysicsWorld.ts` — `implements IStaticObstacleWorld`; `obstacles` registry, `nextObstacleId`, `addStaticObstacle`, `removeStaticObstacle`, `dispose()` clears the registry
- `src/control/ControlSystem.ts` — `providerOwned` set wired through `registerUnit`, `setUnitAI`, `removeRegisteredUnit` and `dispose`
- `tests/units/heal.test.ts` — 7 cases: increment, exact, clamp, modifier-adjusted clamp, four no-op inputs, no-revive, compile-time `IHealableUnit` proof from `spawnUnit`
- `tests/physics/static-obstacles.test.ts` — 6 real-Rapier cases: blocking, event silence, monotonic ids, unknown-id no-op, pass-after-removal, invalid specs, idempotent dispose
- `tests/control/set-unit-ai.test.ts` — 11 cases: decision-source switch, destroy accounting, injected-instance ownership, unknown-id throw, zero physics calls, held-action continuity, unchanged catalog, double replacement, failed-registration cleanup

## Decisions Made

- `heal` checks `isAlive()` after validating the amount, so `heal(NaN)` on a corpse and `heal(100)` on a corpse both leave health at 0 without ever reading the maximum.
- Static obstacles are validated in full before `createRigidBody`/`createCollider`, which keeps ids collision-free as well as bodies leak-free on bad input.
- The ownership set is the single source of truth for release: `providerOwned.has(id)` decides every `provider.destroy` call in `setUnitAI`, `removeRegisteredUnit` and `dispose`.
- `requirements-completed` lists KING-03 only. KING-03's remaining healing wiring and KING-05's city behaviour (garrison cap, training, 2/h healing) are Round-3 work: this plan supplies the unit-level and physics-level seams they need, not the world wiring.

## Deviations from Plan

None - plan executed exactly as written. Two small additions stayed inside the plan's own acceptance criteria:

- The `tests/control/set-unit-ai.test.ts` suite includes an explicit "failed registration leaves no ownership record" case (an acceptance criterion of Task 3 that the eight listed behaviours did not spell out), verified by `dispose()` not re-destroying the failed unit.
- The static-obstacle suite asserts that an invalid spec does not consume an id (`addStaticObstacle` returns 1 afterwards), pinning the "throw before any world mutation" wording.

## Issues Encountered

None. Prettier required reformatting of the new test files (`pnpm lint` catches it via `eslint-plugin-prettier`); formatting was applied with the repo's own prettier config before each task commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-04 can now call `IHealableUnit.heal` on units returned by `spawnUnit`, map `ITerrainRect` field-by-field into `addStaticObstacle`, and rely on `setUnitAI` to swap March/Battle/Brake/Idle instances without leaking or double-freeing them.
- Frozen contracts are byte-identical across `src/units/types.ts`, `src/physics/types.ts`, `src/control/types.ts` and `src/kingdom/types.ts` (`git diff` over the plan range is empty), and no dependency was added or upgraded.
- Remaining kingdom work (city training/garrison, 100m/150m vision union, boundary walls, city battles, placeholder commander) stays in 04-04/04-05.

---

*Phase: 04-kingdom-system*
*Completed: 2026-10-20*

## Self-Check: PASSED

- All three task commits exist (`adf8bd3`, `0023152`, `db66915`)
- All three new suites and the full 272-test suite pass; typecheck and lint exit 0
- Frozen type files untouched; no dependency change
