---
phase: 02-physics-simulation
plan: 04
subsystem: physics
tags: [rapier, compound-body, collider-handle-index, fixed-step, per-collider-mass, d03, d04, d05, d07, d10, phys-01, phys-05]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "frozen WeaponKind/ArmorKind/IWeaponDef/IArmorDef, per-class mass, and the @/ path alias"
  - phase: 02-physics-simulation (wave 0, 02-01)
    provides: "exact-pinned @dimforge/rapier2d-compat@0.21.0 + tests/physics/ Vitest harness (RAPIER.init pattern)"
  - phase: 02-physics-simulation (wave 1, 02-02)
    provides: "frozen src/physics/types.ts contract (ColliderPart, IUnitPhysicsSpec, IUnitState, IPhysicsConfig, IPhysicsWorld)"
provides:
  - "src/physics/constants.ts — the single calibration surface: DT (1/60) + DEFAULT_GEOMETRY (body/weapon/armor dims + weapon x-offset)"
  - "src/physics/PhysicsWorld.ts — class PhysicsWorld implements IPhysicsWorld: compound registration, collider-handle→part index, lifecycle, state readout, force/torque actuators, one-step fixed driver"
  - "tests/physics/compound.test.ts — compound mass, lifecycle + re-registration, state readout (unknown→null), and fixed-step advance"
affects: [02-physics-simulation 02-05 (contact events), 02-physics-simulation 02-06 (damage pipeline), 03-control, 05-rendering]

# Actuals (#2632) — pairs with the plan's `estimate` (tokens: 45000, tasks: 3).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 3543
  tasks: 3
  commits: 3
plan_head_before: 8439727e0026c1d6c03b7f66ae6f7cce8641d4be

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "interface-first class: PhysicsWorld implements IPhysicsWorld; zero public members outside the interface (AGENTS §5), no getters/setters"
    - "compound body = ONE RigidBody + N Colliders at fixed local offsets with PER-COLLIDER setMass; Rapier sums the parts into the body mass (D-03/D-05)"
    - "part identity via collider-handle→{unitId, part[, weaponKind][, armorKind]} Map — collision groups NEVER used per unit (D-04)"
    - "lifecycle: removeUnit deletes the unit's index entries BEFORE freeing its colliders, defensively against Rapier handle reuse (Pitfall 3)"
    - "fixed-step driver: tick() performs exactly one world.step at the f32 timestep, never reading a wall-clock; per-tick forces/torques cleared after the step (D-10/PHYS-05)"
    - "single calibration surface: DT + DEFAULT_GEOMETRY as JSDoc'd top-level consts (AGENTS §6, D-06)"

key-files:
  created:
    - src/physics/constants.ts
    - src/physics/PhysicsWorld.ts
    - tests/physics/compound.test.ts
  modified: []

key-decisions:
  - "Body collider mass = spec.mass; weapon/armor colliders carry their own def mass (WEAPON_DEFS/ARMOR_DEFS) — Rapier sums them into the parent body mass (D-05)."
  - "The armor circle (armorRadius 0.55) is concentric with and encloses the body circle (0.5): an armor strike may also touch the body in the same step; the 02-06 per-(attackerId, defenderId) damage-exclusivity guard — not a geometry change — suppresses the body damage event."
  - "tick() returns { contacts: [], damages: [] } deliberately: this plan establishes PHYS-05's fixed-step semantics; the contact pipeline lands in 02-05 and the damage pipeline in 02-06."
  - "Force applied before tick() is consumed by exactly that step then cleared (resetForces/resetTorques after step) — matches the per-tick control cadence Phase 3 needs."

patterns-established:
  - "PhysicsWorld is the D-07 module boundary Phase 3 (forces) and Phase 5 (readout) will import; it holds ids/numbers only and never references Unit."
  - "Handle-index hygiene: every collider handle is tagged on creation and purged on removal so a reused handle cannot resolve to a stale tag."

requirements-completed: [PHYS-01, PHYS-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "src/physics/constants.ts declares DT (= 1/60) and DEFAULT_GEOMETRY (bodyRadius, weaponHalfLength, weaponRadius, weaponOffsetX, armorRadius) as JSDoc'd top-level consts — the single calibratable surface (D-06/D-10)"
    requirement: PHYS-05
    verification:
      - kind: other
        ref: "node presence check over constants.ts (DT/DEFAULT_GEOMETRY/all five geometry fields/IPhysicsGeometry) -> CONSTANTS_OK"
        status: pass
      - kind: other
        ref: "pnpm typecheck -> exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "class PhysicsWorld implements IPhysicsWorld: registerUnit creates one compound RigidBody with body/weapon/armor colliders (per-collider mass, weapon x-offset), indexes every handle with {unitId, part[, weaponKind][, armorKind]}, and exposes lifecycle, kinematic readout and force/torque actuators"
    requirement: PHYS-01
    verification:
      - kind: other
        ref: "node presence check over PhysicsWorld.ts (implements IPhysicsWorld/all 8 contract methods/EventQueue/COLLISION_EVENTS/removeRigidBody) -> WORLD_OK"
        status: pass
      - kind: unit
        ref: "tests/physics/compound.test.ts#registers a unit, reports hasUnit, and reads finite spawn state (unknown id → null)"
        status: pass
      - kind: unit
        ref: "tests/physics/compound.test.ts#sums per-collider masses: the equipped unit accelerates less under the same force"
        status: pass
      - kind: integration
        ref: "pnpm test -- tests/physics/compound.test.ts (1 file, 4 tests) green; pnpm test (12 files, 101 tests) green"
        status: pass
    human_judgment: false
  - id: D3
    description: "removeUnit purges the collider-handle index entries before removing the rigid body, so re-registering the same id at a new position yields the new state (no stale mapping from a reused handle)"
    requirement: PHYS-01
    verification:
      - kind: unit
        ref: "tests/physics/compound.test.ts#removeUnit purges state + handle index, so re-registration at a new position is clean"
        status: pass
    human_judgment: false
  - id: D4
    description: "tick() establishes the fixed-step, render-decoupled driver (PHYS-05): one world.step per call, no wall-clock; a unit at rest under zero gravity stays still, a forced tick moves it a tiny finite amount, and repeated forcing advances motion monotonically"
    requirement: PHYS-05
    verification:
      - kind: unit
        ref: "tests/physics/compound.test.ts#tick advances exactly one fixed step: still without force, tiny move with force, then monotonic"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-10-19
status: complete
---

# Phase 2 Plan 04: PhysicsWorld Compound Body + Fixed-Step Driver Summary

**`PhysicsWorld` — one Rapier compound `RigidBody` per unit with per-collider-mass body/weapon/armor colliders, a collider-handle→part index, lifecycle, kinematic readout, force/torque actuators, and `tick()` advancing exactly one 1/60 s step with no wall-clock — the numbers-only module boundary (D-07) for Phase 3/5.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-19T05:49:42Z
- **Completed:** 2026-10-19T05:56:52Z
- **Tasks:** 3
- **Files modified:** 3 (all created: 415 lines, 14,172 chars)

## Accomplishments

- **`src/physics/constants.ts`** — the single calibration surface (D-06/D-10): `DT = 1/60` (JSDoc notes the f32 round-trip so tests assert approximate equality, Pitfall 5) and `DEFAULT_GEOMETRY` (`bodyRadius` 0.5, `weaponHalfLength` 0.4, `weaponRadius` 0.05, `weaponOffsetX` 0.7, `armorRadius` 0.55). The `armorRadius` JSDoc records that the armor circle is concentric with and encloses the body circle, so a single strike can contact both colliders — expected; the 02-06 per-pair damage-exclusivity guard suppresses the body event, not a geometry change here.
- **`src/physics/PhysicsWorld.ts`** — `class PhysicsWorld implements IPhysicsWorld`. One dynamic `RigidBody` per unit with a body `ball` collider (`setMass(spec.mass)`), a weapon `capsule` at local x-offset `weaponOffsetX` (`setMass(weapon.mass)`), and one `ball` collider per equipped armor (`setMass(armor.mass)`), all with `ActiveEvents.COLLISION_EVENTS`. Every created collider's `handle` is indexed in `#index` with `{unitId, part}` and, where applicable, `weaponKind`/`armorKind` (D-04/D-13). `removeUnit` deletes the unit's index entries **before** `removeRigidBody` frees the colliders (Pitfall 3). `getUnitState` returns `null` for an unknown id and finite values otherwise; `applyForce`/`applyTorque` drive the body; `tick()` does exactly one `world.step` then clears per-tick forces/torques; `dispose()` frees the `World` and `EventQueue`.
- **`tests/physics/compound.test.ts`** — 4 integration tests after `await RAPIER.init()` in `beforeAll`, each world disposed in `afterEach`: (1) register/`hasUnit`/finite state + `getUnitState(unknown) === null`; (2) comparative per-collider mass (bare 70 vs armed 70+25+8 accelerates more under the same force); (3) `removeUnit` + re-registration of the same id at a new position (no stale handle mapping); (4) fixed-step behavior (still at rest, tiny forced move, then monotonic advance).
- Physics holds ids/numbers only — no `Unit` import anywhere (D-07). The frozen `src/physics/types.ts` and `src/physics/damage.ts` were not modified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create `src/physics/constants.ts` — fixed dt + calibratable geometry** - `47b99f7` (feat)
2. **Task 2: Create `src/physics/PhysicsWorld.ts` — compound assembly, lifecycle, state, actuators, fixed-step tick** - `c6ac5be` (feat)
3. **Task 3: Add `tests/physics/compound.test.ts` — mass, lifecycle, state, one-step advance** - `2489e1b` (test)

**Plan metadata:** this docs commit (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

- `src/physics/constants.ts` (new, 34 lines) - `DT` + `DEFAULT_GEOMETRY`, JSDoc'd top-level consts; type-only import of `IPhysicsGeometry`
- `src/physics/PhysicsWorld.ts` (new, 201 lines) - `class PhysicsWorld implements IPhysicsWorld`; imports Rapier default + contract types + `WeaponKind`/`ArmorKind` types + `IRng`; private `#` fields all JSDoc'd; no public member outside the interface
- `tests/physics/compound.test.ts` (new, 180 lines) - 4 tests; imports `WEAPON_DEFS`/`ARMOR_DEFS` from `@/units/data` and `mulberry32` from `../helpers/rng`; no `Unit` import (D-07)

## Decisions Made

- Body collider mass is exactly `spec.mass`; the weapon/armor colliders carry their def masses — the parent body mass is Rapier's sum (verified behaviorally by the comparative test).
- `tick()` returns `{ contacts: [], damages: [] }` on purpose: this plan fixes PHYS-05's one-step semantics; contacts arrive in 02-05, damages in 02-06.
- Per-tick actuator clearing (`resetForces(false)`/`resetTorques(false)` after the step) makes a pre-`tick()` force a one-step impulse — the per-tick control cadence Phase 3 consumes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Did not store the private `#rng` field (constructor parameter kept as `_rng`)**
- **Found during:** Task 2 (`PhysicsWorld`)
- **Issue:** The plan's Task-2 action says the constructor should store both `#config` and `#rng`. ESLint's `no-unused-private-class-members` (an **error** via `eslint:recommended`) flags any private field that is written but never read. `#rng` has no consumer in this plan (damage jitter is 02-06), so storing it would fail `pnpm lint` — a phase success criterion.
- **Fix:** Kept the constructor signature `(config: IPhysicsConfig, _rng: IRng)` (so the call shape is forward-compatible) but did not materialise a write-only `#rng` field; JSDoc records that `_rng` is reserved for the 02-06 damage-jitter pipeline. The `^_` unused-args ignore pattern keeps it lint-clean.
- **Files modified:** `src/physics/PhysicsWorld.ts`
- **Verification:** `pnpm lint` exits 0; `pnpm typecheck` exits 0.
- **Committed in:** `c6ac5be` (Task 2 commit)

**2. [Rule 3 - Blocking] Omitted unused `DT`/`DEFAULT_GEOMETRY` imports from `PhysicsWorld.ts`**
- **Found during:** Task 2 (`PhysicsWorld`)
- **Issue:** The plan's key-links suggest `PhysicsWorld.ts` reads `DT`/`DEFAULT_GEOMETRY` from `@/physics/constants`. The class actually reads `config.dt` and `config.geometry` (the constructor-injected config), so importing the constants would leave unused bindings → `@typescript-eslint/no-unused-vars` error.
- **Fix:** Import only what the class uses (`RAPIER`, contract types, `WeaponKind`/`ArmorKind`, `IRng`); the geometry is consumed via `#config.geometry`. `constants.ts` remains the single calibration surface consumed by the caller/tests.
- **Files modified:** `src/physics/PhysicsWorld.ts`
- **Verification:** `pnpm lint` exits 0; Task-2 presence check prints `WORLD_OK`.
- **Committed in:** `c6ac5be` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — both forced by the project's lint gate, no behavioral scope change)
**Impact on plan:** Both keep the frozen `IPhysicsWorld` contract and all planned behavior intact; neither weakens the design. `#rng` storage is deferred to 02-06 where it gains a real consumer.

## Issues Encountered

None functional. All gates green: `pnpm test -- tests/physics/compound.test.ts` (1 file / 4 tests), `pnpm test` (12 files / 101 tests), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), Task-1 presence check prints `CONSTANTS_OK`, Task-2 presence check prints `WORLD_OK`.
Environment note: `master` is the project's protected default branch, but `branching_strategy: none` and the sequential main-tree execution directive make main-tree commits the intended mode (all prior plan commits are on `master`); commits used normal hooks (no `--no-verify`).

## Known Stubs

- `#preVelocities: Map<number, { vx, vy }>` in `PhysicsWorld.ts` is declared as the per-unit pre-step velocity snapshot placeholder and is only kept in sync on `removeUnit` (`.delete`); it is **populated** by the 02-06 damage pipeline (D-08 Δv source). Intentional and documented in the plan; does not prevent this plan's goal (the fixed-step driver + compound layer).
- `tick()` returns empty `contacts`/`damages` arrays by design — the contact pipeline is 02-05 and the damage pipeline is 02-06 (plan-02-06 adds the per-`(attackerId, defenderId)` exclusivity guard noted in `DEFAULT_GEOMETRY`'s JSDoc). Intentional, not an unimplemented gap for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **02-05 (contact events)** can now drain `drainCollisionEvents` after `tick()` and resolve handles through `#index`; `tick()` already calls `world.step(this.#eventQueue)` with `ActiveEvents.COLLISION_EVENTS` set on every collider.
- **02-06 (damage pipeline)** can snapshot pre-step velocities into `#preVelocities`, compute Δv via `world.contactPair(...)`, reuse `src/physics/damage.ts`, emit `IDamageEvent`s, and add the per-`(attackerId, defenderId)` per-tick exclusivity guard — and should add the stored `#rng` field (currently `_rng`) at that point.
- Phase 3 (control) drives the world via `applyForce`/`applyTorque`; Phase 5 (render) reads `getUnitState`. The D-07 boundary is stable.
- No blockers.

## Threat Flags

None - the module adds no network, auth, file, or trust-boundary surface. The threat register mitigations are implemented: T-02-09 (index purged before collider free; re-registration test), T-02-10/T-02-12 (`dispose()` frees World+EventQueue; `beforeAll` awaits `RAPIER.init()`), T-02-11 (state readout returns finite values; per-collider mass asserted behaviorally).

---
*Phase: 02-physics-simulation*
*Completed: 2026-10-19*

## Self-Check: PASSED

All declared files exist (`src/physics/constants.ts`, `src/physics/PhysicsWorld.ts`, `tests/physics/compound.test.ts`, `02-04-SUMMARY.md`); all three task commits (`47b99f7`, `c6ac5be`, `2489e1b`) are present in git history. `pnpm test -- tests/physics/compound.test.ts` (4 tests), `pnpm test` (12 files / 101 tests), `pnpm typecheck` (exit 0) and `pnpm lint` (exit 0) all pass; the Task-1 presence check prints `CONSTANTS_OK` and the Task-2 presence check prints `WORLD_OK`.
