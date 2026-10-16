---
phase: 02-physics-composite-units
plan: 02
subsystem: physics
tags: [rapier2d, wasm, composite-rig, revolute-joint, contact-events, deterministic, vitest, tracer]

# Dependency graph
requires:
  - phase: 02-physics-composite-units
    provides: "exact-pinned deterministic Rapier build + idempotent initPhysics() + single-source physics constants (plan 02-01)"
  - phase: 01-foundation-deterministic-sim-core
    provides: "headless fixed-step sim core, canonical snapshot/fingerprint primitives, Node-only Vitest determinism gate"
provides:
  - "PhysicsWorld: sync-constructed deterministic Rapier World + EventQueue; step(dt) captures PRE-STEP velocities before world.step (Δv source)"
  - "CompositeFactory: one body (ball + armor colliders) + separate CCD weapon body joined by an exactly-2-anchor revolute joint; direct angular swing drive; every collider registered into the part map"
  - "ContactBridge: colliderHandle → (entityId, part, armorSubtype) map with null-safe lookup; drain collision-enter → typed IContactEvent with pre-step Δv"
  - "extended core/events.ts: numeric PartKind/ArmorSubtype enums + IUnitPartRef + extended IContactEvent (partA/partB/armorA/armorB/dv)"
  - "tests/helpers/run-physics.ts: deterministic two-unit headless runner returning poseTrace + Rapier takeSnapshot hash + typed contacts"
  - "physics determinism gate (dual fingerprint + part-tagged weapon-vs-armor contact + anti-vacuous trace + swing visibility)"
affects: [02-03, 02-04, 02-05, phase-3-content-tables, phase-4-unit-ai, phase-5-render]

# Actuals (#2632) — pairs with the plan's `estimate` (30000 tokens / 1 task / confidence low).
actuals:
  tokens: 8602
  tasks: 1
  commits: 1
plan_head_before: 423d865d14986fa6e827d5717393b0a0150da631

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-step velocity capture: PhysicsWorld.step snapshots every body's linvel()/angvel() BEFORE world.step; contact Δv is computed from those (post-step manifold reads 0 — Pitfall 1)"
    - "Composite rig: one dynamic body carries body+armor colliders; the weapon is a separate dynamic body attached by a 2-anchor revolute joint (D-24)"
    - "Direct angular swing drive (setAngvel from a tick-derived phase) instead of a joint motor (D-25/D-36)"
    - "colliderHandle → IUnitPartRef map with null-safe lookup; drain returns early on null (T-02-01)"
    - "Ordered creation: EntityStore.ids() order drives Rapier arena order (Pitfall 3)"

key-files:
  created:
    - src/sim/world/physics-world.ts
    - src/sim/world/composite.ts
    - src/sim/world/contact.ts
    - tests/helpers/run-physics.ts
    - tests/determinism/physics-gate.test.ts
  modified:
    - src/sim/core/events.ts

key-decisions:
  - "Swing is driven by a direct angular velocity on the weapon body (θ' = amplitude·speed·cos(phase), phase = tick·speed·dt) — no joint motor tuning (D-25 / D-36), still producing independent weapon velocity for Δv"
  - "Same-unit parts do not collide: the weapon↔body revolute joint calls setContactsEnabled(false) (implements D-27's '同单位各部件互为无损' with one line; the general collision-group scheme stays deferred to 02-04)"
  - "ContactBridge.lookup returns null (never throws) for an unregistered handle; drain returns early when either side is untagged (T-02-01)"
  - "run-physics helper returns an extra weaponAngularSpeeds series beyond the plan's three fields so the D-25 'weapon actually moves' truth is assertable"
  - "IUnitPhysics is the per-entity physics-handle record (factory return type); plan 02-03 folds it into EntityStore's IUnitComponents"

patterns-established:
  - "Tracer slice: build the risky subsystem (PhysicsWorld/CompositeFactory/ContactBridge) directly, not yet through BattleSim, so the whole path is proven end-to-end before expansion"
  - "Δv = |(vA@P − vB@P)·n| with v_atP = linvel + ω×r, all read from the pre-step snapshot"

requirements-completed: [PHYS-01, PHYS-02, PHYS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "A composite unit is one dynamic body carrying a ball (body) collider and an armor collider, plus a separate CCD weapon body attached by an exactly-2-anchor revolute joint; every collider is registered in a colliderHandle → (entityId, part[, armorSubtype]) map whose lookup resolves each part and returns null (never throws) for an unregistered handle."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/determinism/physics-gate.test.ts#ContactBridge.lookup resolves registered parts and returns null for unregistered handles (PHYS-01 / T-02-01)"
        status: pass
      - kind: integration
        ref: "tests/determinism/physics-gate.test.ts#same scenario double-run → identical pose trace AND identical Rapier snapshot hash (D-20)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A weapon-vs-armor collision-enter emits one typed IContactEvent whose partA/partB name the correct parts, with dv computed from PRE-STEP velocities (dv > 0)."
    requirement: "PHYS-02"
    verification:
      - kind: integration
        ref: "tests/determinism/physics-gate.test.ts#emits ≥1 typed part-tagged contact with dv > 0 (PHYS-02)"
        status: pass
      - kind: integration
        ref: "tests/determinism/physics-gate.test.ts#a weapon-vs-armor contact names the correct parts (PHYS-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two runs of the same fixed scenario produce identical per-tick sim pose traces AND identical Rapier takeSnapshot() hashes (same-machine only, D-17/D-20), on the exact-pinned deterministic build."
    requirement: "PHYS-03"
    verification:
      - kind: integration
        ref: "tests/determinism/physics-gate.test.ts#same scenario double-run → identical pose trace AND identical Rapier snapshot hash (D-20)"
        status: pass
      - kind: integration
        ref: "tests/determinism/physics-gate.test.ts#anti-vacuous: pose trace is not constant"
        status: pass
      - kind: unit
        ref: "tests/determinism/physics-gate.test.ts#version smoke: Rapier is exact-pinned (D-19)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The weapon swings continuously in a reciprocating arc driven by numeric constants (amplitude/angular speed), with no AI involvement (D-25) — it produces non-zero angular velocity over the run."
    requirement: "PHYS-02"
    verification:
      - kind: integration
        ref: "tests/determinism/physics-gate.test.ts#weapon swings: produces non-zero angular velocity over the run (D-25)"
        status: pass
    human_judgment: false

# Metrics
duration: 12 min
completed: 2026-10-16
status: complete
---

# Phase 2 Plan 02: Composite Unit Tracer Summary

**One end-to-end tracer slice: a composite unit (ball + armor colliders on one rigid body, a separate CCD weapon body jointed by a 2-anchor revolute joint) steps under Rapier, a weapon-vs-armor contact surfaces as a typed part-tagged `SimEventKind.Contact` carrying a PRE-STEP Δv > 0, and a same-scenario double-run stays deterministic on both the sim pose trace and the native `takeSnapshot()` hash.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-16T06:55:24Z
- **Completed:** 2026-10-16T07:07:34Z
- **Tasks:** 1 (single `type="tracer"` task)
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- Built `PhysicsWorld` (`src/sim/world/physics-world.ts`): synchronously constructs `new RAPIER.World({0,0})` + an auto-draining `EventQueue`; `step(dt)` **first** captures every rigid body's `linvel()`/`angvel()` into a pre-step snapshot, **then** calls `world.step(eventQueue)` — the pre-step velocities are the Δv source (post-step manifold reads are 0).
- Built `CompositeFactory` (`src/sim/world/composite.ts`): one dynamic body carrying a ball (`ColliderDesc.ball`) + an armor collider (`ColliderDesc.cuboid` at a local offset), plus a separate CCD-enabled dynamic weapon body (`ColliderDesc.capsule`) attached by an **exactly-2-anchor** `JointData.revolute`. Every collider is registered into the part map. Swing is driven by a direct angular velocity `θ' = SWING_AMPLITUDE · SWING_ANGULAR_SPEED · cos(tick·SWING_ANGULAR_SPEED·dt)` (D-25/D-36 — no joint motor).
- Built `ContactBridge` (`src/sim/world/contact.ts`): holds `colliderHandle → IUnitPartRef`; `lookup()` returns `null` (never throws) for unregistered handles; `drain(tick)` translates Rapier collision-enter events into typed `IContactEvent`s, computing `dv = |(vA@P − vB@P)·n|` (with `v_atP = linvel + ω×r`) from the pre-step snapshot.
- Extended `src/sim/core/events.ts` with numeric `PartKind`/`ArmorSubtype` enums, `IUnitPartRef`, and the extended `IContactEvent` (`partA`, `partB`, `armorA`, `armorB`, `dv`) — all with Chinese JSDoc.
- Added `tests/helpers/run-physics.ts` (deterministic two-unit runner → `poseTrace` + `rapierHash` + `contacts` + `weaponAngularSpeeds`) and `tests/determinism/physics-gate.test.ts` (the D-20 dual gate + PHYS-02 + anti-vacuous + D-25 + version smoke + `lookup` null-guard).

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: End-to-end composite unit — Rapier world → part-tagged bodies → typed contact → deterministic double-run** — `582b242` (feat)

**Plan metadata:** `(this commit)` (docs: complete plan)

## Files Created/Modified
- `src/sim/world/physics-world.ts` — `IPhysicsWorld`/`PhysicsWorld`: sync world + `EventQueue`, pre-step velocity capture in `step(dt)`, `preStepVelocity(handle)`, `takeSnapshot()`.
- `src/sim/world/composite.ts` — `ICompositeFactory`/`CompositeFactory` + `IWeaponSpec`/`IArmorSpec`/`ICompositeSpec`/`IUnitPhysics`/`RegisterCollider`; compound body assembly + 2-anchor revolute joint + direct swing drive.
- `src/sim/world/contact.ts` — `IContactBridge`/`ContactBridge`: part map, null-safe `lookup`, collision-enter drain → typed events with pre-step Δv.
- `src/sim/core/events.ts` — +`PartKind`/`ArmorSubtype` (numeric), +`IUnitPartRef`, extended `IContactEvent`.
- `tests/helpers/run-physics.ts` — deterministic headless two-unit runner (ordered `store.ids()` construction; no RNG).
- `tests/determinism/physics-gate.test.ts` — 7 tests: dual fingerprint, typed contact with Δv > 0, weapon-vs-armor parts, anti-vacuous trace, swing visibility, version smoke, lookup null-guard.

## Decisions Made
- **Direct angular swing drive (D-25 / D-36), not a joint motor:** the weapon body's angular velocity is set each tick from a step-count-derived phase. This yields independent weapon velocity for Δv with no motor-model/factor tuning; plan 02-04 may still attempt the D-24 motor before falling back.
- **`joint.setContactsEnabled(false)`:** one-line way to keep same-unit parts non-damaging (D-27) without introducing the deferred collision-group scheme (02-04). Without it the weapon body overlaps its own body/armor and the solver pushes it spuriously.
- **`weaponAngularSpeeds` added to the helper result:** the plan's three-field return (`poseTrace`/`rapierHash`/`contacts`) cannot express the D-25 "weapon actually moves" truth; the extra series makes it assertable.
- **`IUnitPhysics` is the per-entity physics-handle record** (factory return type), matching the plan's artifact list; plan 02-03 folds it into `EntityStore`'s `IUnitComponents`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Same-unit parts collided (weapon vs own body/armor)**
- **Found during:** Task 1 (composite assembly)
- **Issue:** The weapon is a separate rigid body pinned to the body center by a 2-anchor revolute joint; its capsule overlaps the body/armor colliders. With default joint contact settings the solver would have pushed the weapon apart each step, injecting spurious motion (and risking instability/NaN).
- **Fix:** `joint.setContactsEnabled(false)` on the weapon↔body joint, implementing D-27's "同一单位各部件互为无损". The general collision-group scheme remains deferred to 02-04.
- **Files modified:** `src/sim/world/composite.ts`
- **Verification:** physics gate green; double-run hashes identical; anti-vacuous trace confirms stable motion.
- **Committed in:** `582b242` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Plan's helper return shape could not assert the D-25 swing truth**
- **Found during:** Task 1 (test authoring)
- **Issue:** The plan specified `run-physics.ts` returns `{ poseTrace, rapierHash, contacts }`; acceptance criterion (d) requires proving the weapon actually moves (non-zero weapon angular velocity).
- **Fix:** Added `weaponAngularSpeeds: number[]` to the result.
- **Files modified:** `tests/helpers/run-physics.ts`, `tests/determinism/physics-gate.test.ts`
- **Verification:** the "weapon swings" test asserts `max|angvel| > 0`.
- **Committed in:** `582b242` (Task 1 commit)

**3. [Rule 2 - Missing Critical] Added a direct lookup null-guard test**
- **Found during:** Task 1 (acceptance-criteria verification)
- **Issue:** The must_have truth "`lookup(handle)` resolves each part and returns `null` (never throws) for an unregistered handle" (PHYS-01 / T-02-01) had no direct assertion (the hardening plan 02-05 adds one, but the truth is declared for this plan).
- **Fix:** Added a focused unit test that registers a part, round-trips `lookup`, and asserts `lookup(unregistered) === null`.
- **Files modified:** `tests/determinism/physics-gate.test.ts`
- **Verification:** test passes.
- **Committed in:** `582b242` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 × Rule 2 — missing critical functionality)
**Impact on plan:** All three are correctness/verifiability requirements (stable composite rig, assertable D-25 truth, T-02-01 guard coverage). No scope creep — no new abstraction layers, no content pipeline, no collision-group scheme (all deliberately left to later plans).

## Issues Encountered
None. `pnpm run typecheck` (both tsconfigs), `pnpm run lint`, `pnpm gate`, and `pnpm test` are all green. Prettier-reported formatting was corrected with `eslint --fix` before commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The composite-rig + typed-contact architecture is proven end-to-end and deterministic; later plans build out from these committed seams rather than throwaway scaffolding.
- `run-physics.ts` is the contract 02-03/02-04 extend: build `PhysicsWorld` + `CompositeFactory` + `ContactBridge` directly, spawn composites in `store.ids()` order, drive the swing each tick, `physics.step(dt)`, `bridge.drain(tick)`.
- **For 02-03:** `IUnitPhysics` (body handle + weapon handles) is the per-entity physics component to fold into `EntityStore`; `PhysicsWorld.step`'s pre-step snapshot is the Δv source; `IContactEvent` is the typed event downstream combat consumes.
- **For 02-04:** collision groups (general unit-level filtering) and lifecycle/CCD-scope hardening are still open; the direct swing drive is a candidate to revisit against the D-24 motor.
- Same-machine determinism tier only (D-17): the gate is Node-only, no cross-machine golden gate, no CI.

## Tracer Feedback Gate
Auto mode inactive; `human_verify_mode=end-of-phase`; the tracer `<verify>` is automated-only → the verify was re-run end-to-end (`pnpm run typecheck; pnpm vitest run tests/determinism/physics-gate.test.ts` → 7 passed) and passed. `⚡ Tracer verified end-to-end — expanding` (no expansion tasks in this plan; no checkpoint synthesized).

## Self-Check: PASSED

- Created files verified on disk: `src/sim/world/physics-world.ts`, `src/sim/world/composite.ts`, `src/sim/world/contact.ts`, `tests/helpers/run-physics.ts`, `tests/determinism/physics-gate.test.ts`, `02-02-SUMMARY.md`.
- Modified file verified: `src/sim/core/events.ts`.
- Commit verified: `582b242` (Task 1). `commits=1` measured from `plan_head_before=423d865…`.
- `pnpm run typecheck` (both tsconfigs) exit 0; `pnpm run lint` exit 0; `pnpm gate` 14 passed; `pnpm test` 66 passed.
- Grep confirmations: no `capsuleRounded`; `JointData.revolute(...)` carries exactly 2 anchors; `.setCcdEnabled(true)` on the weapon body.

---
*Phase: 02-physics-composite-units*
*Completed: 2026-10-16*
