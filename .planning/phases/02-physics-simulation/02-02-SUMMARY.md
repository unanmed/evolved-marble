---
phase: 02-physics-simulation
plan: 02
subsystem: physics
tags: [rapier, physics, types, numeric-enum, type-first-gate, collider-part, damage-event, alias-resolution]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "frozen WeaponKind/ArmorKind/IWeaponDef/IArmorDef declarations and the @/ path alias"
  - phase: 02-physics-simulation (wave 0, 02-01)
    provides: "exact-pinned @dimforge/rapier2d-compat@0.21.0 + tests/physics/ Vitest harness"
provides:
  - "src/physics/types.ts — the complete physics-system type contract: numeric ColliderPart enum + 8 I* interfaces (IUnitPhysicsSpec, IUnitState, IContactEvent, IDamageEvent, IPhysicsTickResult, IPhysicsGeometry, IPhysicsConfig, IPhysicsWorld)"
  - "tests/physics/types.test.ts pinning the ColliderPart ordinals (Body=0/Weapon=1/Armor=2) and proving @/physics/types alias resolution"
  - "the blocking-human type-design gate resolved (APPROVED) — round-2 implementation planning is unblocked"
affects: [02-physics-simulation round-2 implementation plans, 03-control, 05-rendering]

# Actuals (#2632) — pairs with the plan's `estimate` (tokens: 30000, tasks: 3).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 2259
  tasks: 3
  commits: 2
plan_head_before: 9a56b25d7099db663eb326cd7cffd544b65d8d45

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "declaration-only types module: numeric enums + JSDoc'd I* interfaces, no class/function/top-level const/arithmetic"
    - "type-only import of the frozen Phase-1 equipment defs (IWeaponDef/IArmorDef) — physics never references the Unit class (D-07)"
    - "absent OBJECT → null (IUnitPhysicsSpec.weapon, getUnitState result); absent LITERAL → optional/undefined (IDamageEvent.weaponKind?/armorKind?); absent COLLECTION → empty array (IUnitPhysicsSpec.armors) — AGENTS §8"
    - "numeric enum pinned by explicit member assertions (no Object.values reverse mapping — research Pitfall 8)"

key-files:
  created:
    - src/physics/types.ts
    - tests/physics/types.test.ts
  modified: []

key-decisions:
  - "ColliderPart is a numeric enum { Body=0, Weapon=1, Armor=2 } — the part tag for the collider-handle→{unitId, part} map; string enums forbidden (AGENTS §3, D-04)."
  - "IPhysicsWorld exposes the force/torque actuators (applyForce/applyTorque) NOW rather than deferring them to Phase 3 — physics is control's only actuator, and a world that cannot be driven is an incomplete system contract."
  - "IUnitPhysicsSpec is numbers-only and reuses the Phase-1 IWeaponDef/IArmorDef via a type-only import (accepted type-only coupling), keeping the Unit class out of the physics boundary (D-07)."
  - "tick() returns a structured IPhysicsTickResult { contacts, damages } rather than one flat discriminator-tagged array — two well-typed event families."
  - "Scope boundary is intentional (not a gap): the phase-level contract is IPhysicsWorld; no IBattleSim/battle-settlement type exists in Phase 2 (that is Phase 4, 王国系统)."
  - "IDamageEvent carries FINAL numbers (deltaV, damageMean, damage, damageReduced) — the physics layer computes and emits; applying to a Unit is the caller's job (D-09/D-14)."
  - "requirements-completed intentionally left empty: this plan is round 1 (type declarations only) and stops at the review gate, so no PHYS-01..05 behavior is actually satisfied yet — marking them complete would be false."

patterns-established:
  - "Physics type-first contract: declarations only, JSDoc on every interface member, no runtime logic — the C-Phase gate artifact for Phases 3/5"

requirements-completed: []

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "src/physics/types.ts declares the complete physics-system type contract (numeric ColliderPart enum + 8 JSDoc'd I* interfaces) as declarations only — no class, function, top-level const, Rapier import, or arithmetic"
    requirement: PHYS-01
    verification:
      - kind: other
        ref: "node presence check (required enum/interface/member/anchor tokens) -> PHYS_TYPES_OK"
        status: pass
      - kind: other
        ref: "pnpm typecheck -> exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "ColliderPart ordinals are pinned to the integers Body=0, Weapon=1, Armor=2 via explicit numeric assertions"
    requirement: PHYS-01
    verification:
      - kind: unit
        ref: "tests/physics/types.test.ts#physics-system types — numeric ColliderPart enum"
        status: pass
      - kind: integration
        ref: "pnpm test -- tests/physics/types.test.ts (1 file, 4 tests) green"
        status: pass
    human_judgment: false
  - id: D3
    description: "The @/physics/types alias resolves (import pulls @/units/types transitively) — 10-file / 86-test suite green"
    verification:
      - kind: integration
        ref: "pnpm test (10 files, 86 tests) green"
        status: pass
    human_judgment: false
  - id: D4
    description: "The blocking-human type-design review gate is presented and resolved (APPROVED) before any Wave-2 implementation is planned"
    verification: []
    human_judgment: true
    rationale: "A design-approval gate is inherently a human judgment: only the user can confirm the contract shape (part taxonomy, IPhysicsWorld surface, event shapes, null/undefined split, IPhysicsWorld scope boundary) is right before it becomes expensive to change (CONTEXT D-01/D-07 rated costly)."

# Metrics
duration: 9min
completed: 2026-10-18
status: complete
---

# Phase 2 Plan 02: Physics System Type Contract (Round 1) Summary

**The complete, approved physics-system type contract — numeric `ColliderPart` enum plus 8 JSDoc'd `I*` interfaces with `registerUnit`/`tick`/`applyForce` and typed part-tagged contact/damage events — declared as declarations-only and gated by human design approval before any Wave-2 implementation.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-18T18:51:47+08:00 (after 02-01 completion)
- **Completed:** 2026-10-18T18:59:35+08:00 (last task commit; gate resolved after)
- **Tasks:** 3 (2 executed + 1 approved blocking-human gate)
- **Files modified:** 2

## Accomplishments
- `src/physics/types.ts` now carries the phase's highest-value design artifact: the stable contract Phase 3 (control: forces/torque) and Phase 5 (render: unit state) will consume. It is a pure declaration module — numeric `ColliderPart` enum + `IUnitPhysicsSpec`, `IUnitState`, `IContactEvent`, `IDamageEvent`, `IPhysicsTickResult`, `IPhysicsGeometry`, `IPhysicsConfig`, `IPhysicsWorld` — with no class, function, top-level `const`, Rapier import, or arithmetic.
- The compound-body model from the locked decisions is expressed in types: one rigid body per unit with body/weapon/armor colliders carrying their own masses (D-03/D-05); part identity is the `collider handle → {unitId, part}` map, never per-unit collision-group bits (D-04); the contract exposes primitives/ids/parts only and never references `Unit` (D-07).
- Absent-value convention encoded exactly (AGENTS §8): `IUnitPhysicsSpec.weapon: IWeaponDef | null` and `getUnitState(): IUnitState | null` (absent objects → `null`); `IDamageEvent.weaponKind?`/`armorKind?` optional literals (absent → `undefined`, never a literal union with `null`); `IUnitPhysicsSpec.armors` a readonly array (empty when unarmored).
- `tests/physics/types.test.ts` pins `Body === 0`, `Weapon === 1`, `Armor === 2` with explicit integer assertions (no `Object.values` reverse mapping) and, as a side effect of the import, proves `@/physics/types` resolves transitively through `@/units/types`.
- The **scope boundary is deliberate and confirmed at the gate**: the phase-level contract is `IPhysicsWorld`; no `IBattleSim`/battle-settlement type is created in Phase 2 — battle triggering, armies, and post-battle settlement belong to Phase 4 (王国系统).

### Approved contract — shape summary

| Symbol | Kind | Purpose |
|--------|------|---------|
| `ColliderPart` | numeric enum | `Body=0`, `Weapon=1`, `Armor=2` — the part tag in the collider-handle map (D-04) |
| `IUnitPhysicsSpec` | interface | numbers-only registration input (unitId, x/y, mass, attack/weaponRatio/defense/armorRatio, `weapon: IWeaponDef \| null`, `armors: readonly IArmorDef[]`) — no `Unit` (D-07) |
| `IUnitState` | interface | kinematic readout for Phase 3/5 (x, y, angle, vx, vy, angularVelocity) |
| `IContactEvent` | interface | unordered part-tagged pair (unitAId, partA, unitBId, partB) (PHYS-02) |
| `IDamageEvent` | interface | FINAL numbers (attacker/defender ids+parts, optional `weaponKind?`/`armorKind?`, deltaV, damageMean, damage, damageReduced) (D-09/D-14) |
| `IPhysicsTickResult` | interface | `{ contacts, damages }` returned by one tick (PHYS-02/03) |
| `IPhysicsGeometry` | interface | calibratable shape numbers (bodyRadius, weaponHalfLength, weaponRadius, weaponOffsetX, armorRadius) (D-06) |
| `IPhysicsConfig` | interface | `{ dt, geometry }` — `dt` fixed at 1/60 (D-10) |
| `IPhysicsWorld` | interface | `registerUnit`, `removeUnit`, `hasUnit`, `applyForce`, `applyTorque`, `getUnitState`, `tick`, `dispose` (D-07) |

## Task Commits

Each task was committed atomically:

1. **Task 1: Write `src/physics/types.ts` — numeric enums + `I*` interfaces** - `1d8b54c` (feat)
2. **Task 2: Add `tests/physics/types.test.ts` pinning ordinals + alias** - `5e60439` (test)
3. **Task 3: blocking-human type-design review gate** — APPROVED by the user (no commit; nothing is written by a gate).

**Plan metadata:** this docs commit (SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `src/physics/types.ts` - the complete physics-system type contract; declaration-only (183 lines of enums + JSDoc'd interfaces), only a type-only import from `@/units/types`
- `tests/physics/types.test.ts` - numeric-enum value pinning (Body=0/Weapon=1/Armor=2, integer + distinctness checks) and `@/physics/types` alias-resolution proof; no interface import (erased at runtime), no Rapier call

## Decisions Made
- Kept the force/torque actuators on `IPhysicsWorld` now — physics is control's only actuator, so shipping a world that cannot be driven would be an incomplete system contract.
- Chose a structured `IPhysicsTickResult { contacts, damages }` over a single flat discriminator-tagged event array.
- Accepted the type-only coupling to `IWeaponDef`/`IArmorDef` (vs. physics-local thin specs) — the equipment numbers are already frozen Phase-1 contracts.
- Left `requirements-completed: []` — this plan is round 1 (declarations only) and stops at the gate, so no PHYS-* behavior is satisfied yet.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. All three gates are green: `pnpm test` (10 files / 86 tests), `pnpm test -- tests/physics/types.test.ts` (1 file / 4 tests), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), and the Task-1 presence check prints `PHYS_TYPES_OK`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The type-first gate is APPROVED: round 2 (Wave-2 implementation plans — compound-body registration, contact→event pipeline, damage/armor formulas, fixed-tick driver) can now be authored against `src/physics/types.ts` as written.
- The contract is stable for Phases 3 (control) and 5 (render); OQ-1 is confirmed at the gate (`B_A = 破甲比率`, sign-consistent, D-11).
- No blockers. No implementation code exists in this plan by design (round 1 = type declarations only).

---
*Phase: 02-physics-simulation*
*Completed: 2026-10-18*

## Self-Check: PASSED

All declared files exist (`src/physics/types.ts`, `tests/physics/types.test.ts`, `02-02-SUMMARY.md`); both task commits (`1d8b54c`, `5e60439`) are present in git history. `pnpm test` (10 files / 86 tests), `pnpm test -- tests/physics/types.test.ts` (4 tests), `pnpm typecheck` (exit 0), and `pnpm lint` (exit 0) all pass; the Task-1 presence check prints `PHYS_TYPES_OK`.
