---
phase: 02-physics-composite-units
plan: 03
subsystem: physics
tags: [rapier2d, wasm, snapshot-v3, determinism, pose-mirror, impulses, safety-belt, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-physics-composite-units
    provides: "exact-pinned deterministic Rapier build + initPhysics() + single-source physics constants (02-01)"
  - phase: 02-physics-composite-units
    provides: "verified tracer: PhysicsWorld/CompositeFactory/ContactBridge + typed part-tagged IContactEvent (02-02)"
  - phase: 01-foundation-deterministic-sim-core
    provides: "headless fixed-step sim core, canonical snapshot/fingerprint primitives, Node-only Vitest determinism gate"
provides:
  - "BattleSim.step() wired to physics: events.clear -> commands.drain -> clock.step -> applyCommands (Rapier impulses) -> physics.step(dt) -> contactBridge.drain -> pose mirror -> D-33 safety-belt clamp (all synchronous, no cross-tick contact attribution)"
  - "Rapier is the source of truth: EntityStore is a read-only pose mirror (x/y/rotation/vx/vy/angularVelocity); Force/Torque route through applyImpulse/applyTorqueImpulse"
  - "ISimState.physics: IPhysicsWorld; PhysicsWorld owns the colliderHandle->IUnitPartRef map so the part map is reachable from the aggregate root for serialization"
  - "IUnitXform (+rotation/angularVelocity) and IUnitComponents.physics (IUnitPhysics: bodyHandle + weaponHandles); spawn() builds a composite unit in store.ids() order"
  - "canonical snapshot VERSION 2->3: per-entity rotation/angularVelocity + Rapier takeSnapshot() bytes + part map (handle:f64/entityId:i32/part:u8/armorSubtype:u8); deserializeState restores the world and rebuilds the part map + per-entity handles"
  - "tests/sim/commands.test.ts: physics-wiring spec (mirror holds, snapshot v3 round-trip, anti-vacuous mirror motion, D-33 safety-belt boundary, post-physics determinism) + force assertions recalibrated to the physics mass model"
affects: [02-04, 02-05, phase-3-content-tables, phase-4-unit-ai, phase-5-render, phase-6-bridge-recording]

# Actuals (#2632) — pairs with the plan's `estimate` (34000 tokens / 1 task / confidence low).
actuals:
  tokens: 15076
  tasks: 1
  commits: 3
plan_head_before: dfdc92898cf10fc512ed932aac386a7273d34659

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "step() order: clear -> drain -> clock -> applyCommands (impulses) -> physics.step -> contact.drain -> mirror -> safety belt (one tick, no cross-tick attribution)"
    - "Part-map ownership in IPhysicsWorld: the colliderHandle->IUnitPartRef map lives on the physics world so serializeState(s) can read it from ISimState and deserializeState can rebuild it (D-34 snapshot completeness)"
    - "Pose mirror is the only writer of EntityStore's read-only view; handles survive World.restoreSnapshot so per-entity body/weapon handles are re-derived from the part map"
    - "Spawn spec derived deterministically: ring position by ordered id + ai-stream velocity (keeps the determinism gate's different-seed assertion after movementSystem is replaced)"
    - "Safety belt writes the clamp back to BOTH Rapier (source of truth) and the store mirror"

key-files:
  created: []
  modified:
    - src/sim/battle-sim.ts
    - src/sim/snapshot.ts
    - src/sim/world/physics-world.ts
    - src/sim/world/contact.ts
    - src/sim/world/entity-store.ts
    - src/sim/world/world.ts
    - src/sim/content/physics.ts
    - tests/sim/commands.test.ts

key-decisions:
  - "Report the part map from IPhysicsWorld (not IContactBridge): snapshot.ts can only reach state through ISimState.physics, so the map must live there for serialize/deserialize symmetry; ContactBridge now delegates register/lookup to physics (tracer API preserved)."
  - "spawn() derives its composite spec from a ring (position by ordered id) + the seeded 'ai' stream (velocity); a purely seed-independent spawn would break the Phase-1 'different seed -> different trace' assertions once movementSystem is removed."
  - "Force/Torque assertions are recalibrated to shape (direction/magnitude + one-shot damping decay), not exact Δv constants: the unit body is joint-coupled to the weapon and damped, so an exact 'Δv == fx' constant is not physically meaningful."
  - "Rapier snapshot round-trip is byte-identical (fingerprint(restore(snapshot)) === fingerprint(snapshot)) with physics present — verified green, so no v2 migration path was needed."

patterns-established:
  - "Snapshot v3 = Phase-1 layout + per-entity rotation/angularVelocity (9×i32) + rapierLen:u32 + takeSnapshot() bytes + partMapCount:u32 + per-entry (handle:f64, entityId:i32, part:u8, armorSubtype:u8)"
  - "deserializeState: rebuild entities -> World.restoreSnapshot(bytes) -> rebuild part map -> derive per-entity body/weapon handles from the part map (handles survive restore)"

requirements-completed: [PHYS-01, PHYS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Rapier is the source of truth inside the sim core: spawn() builds a composite unit (body + armor colliders + jointed weapon) in store.ids() order; after step() each unit's pose (x,y,rotation,vx,vy,angularVelocity) is mirrored from Rapier into EntityStore."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/commands.test.ts#spawn builds a composite unit and ISimState exposes the physics world"
        status: pass
      - kind: unit
        ref: "tests/sim/commands.test.ts#after step() the mirrored pose (rotation/angularVelocity) matches the Rapier body (D-34)"
        status: pass
      - kind: integration
        ref: "tests/sim/commands.test.ts#anti-vacuous: physics motion moves a mirrored pose value past the 1/256 grid"
        status: pass
    human_judgment: false
  - id: D2
    description: "CommandKind.Force and CommandKind.Torque route through Rapier impulse APIs (applyImpulse / applyTorqueImpulse), not direct xform mutation; the source-of-truth invariant holds."
    requirement: "PHYS-01"
    verification:
      - kind: integration
        ref: "tests/sim/commands.test.ts#a force submitted before a tick changes the target velocity after that tick"
        status: pass
      - kind: integration
        ref: "tests/sim/commands.test.ts#drains commands exactly once (a force is not re-applied on the next step)"
        status: pass
      - kind: other
        ref: "grep battle-sim.ts: no 'xform.vx +=' / 'xform.vy +='; applyImpulse/applyTorqueImpulse present"
        status: pass
    human_judgment: false
  - id: D3
    description: "Canonical snapshot v3 round-trips with physics present (fingerprint(restore(snapshot)) === fingerprint(snapshot)), and same seed + same scenario yields an identical per-tick fingerprint trace after physics is introduced."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/sim/commands.test.ts#snapshot v3 round-trips with physics present (D-34)"
        status: pass
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#fingerprint(restore(serialize(s))) === fingerprint(serialize(s))"
        status: pass
      - kind: integration
        ref: "tests/determinism/gate.test.ts#same seed → identical per-tick fingerprint trace"
        status: pass
      - kind: integration
        ref: "tests/sim/commands.test.ts#same seed + same command log → identical per-tick fingerprint trace after physics"
        status: pass
    human_judgment: false
  - id: D4
    description: "The D-33 safety belt pulls position/velocity back only when a unit is outside the 1000×1000 m safe area, under store.ids()-ordered iteration."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/commands.test.ts#D-33 safety belt pulls a unit back inside the safe area only when out of bounds"
        status: pass
    human_judgment: false

# Metrics
duration: 17 min
completed: 2026-10-16
status: complete
---

# Phase 2 Plan 03: Wire Rapier into the Sim Core + Canonical Snapshot v3 Summary

**Rapier is now the sim's source of truth: `BattleSim.step()` applies commands as Rapier impulses, steps the fixed-step physics world, drains typed contacts, mirrors each unit's pose (including rotation/angularVelocity) into the read-only `EntityStore`, and clamps runaway units with the D-33 safety belt — while the canonical snapshot is extended to v3 (rotation/angularVelocity + `takeSnapshot()` bytes + the collider→part map) so `fingerprint(restore(snapshot)) === fingerprint(snapshot)` and the same-seed determinism gate both stay green.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-10-16T15:23:14Z
- **Completed:** 2026-10-16T15:39:50Z
- **Tasks:** 1 (single `type="auto" tdd="true"` task)
- **Files modified:** 8 (7 source + 1 test)

## Accomplishments

- **Wired physics into the real sim step** (`src/sim/battle-sim.ts`): the final order is
  `events.clear()` → `commands.drain()` + `drainRejections()` → `clock.step()` → emit rejections →
  `applyCommands` (Rapier impulses) → `physics.step(dt)` → `contactBridge.drain(tick)` →
  `mirrorAndClamp()`. All synchronous, no cross-tick contact attribution. The `never` exhaustiveness
  guard is intact.
- **Rapier is the source of truth, the store is a read-only mirror** (D-34): `spawn()` builds a
  composite unit through `CompositeFactory` (one entity + tagged body/armor colliders + a 2-anchor
  revolute weapon joint) in `store.ids()` order; `applyCommands` applies `Force` via
  `RigidBody.applyImpulse` and `Torque` via `applyTorqueImpulse` (no direct `xform` mutation); the
  mirror copies `translation()/rotation()/linvel()/angvel()` back into `IUnitXform`.
- **Extended contracts**: `IUnitXform` gains `rotation`/`angularVelocity`; `IUnitComponents` gains a
  named `physics: IUnitPhysics` component; `ISimState` gains `physics: IPhysicsWorld`.
- **Canonical snapshot v2 → v3** (`src/sim/snapshot.ts`): the per-entity record widens to
  `rotation`/`angularVelocity`, then the entity section is followed by the Rapier `takeSnapshot()`
  bytes and the part map. `deserializeState` rebuilds the store, calls
  `RAPIER.World.restoreSnapshot(bytes)`, rebuilds the part map, and re-derives each entity's
  body/weapon handles from that map. `serializeState`/`fingerprint` stay separable (D-03).
- **Part map reachable from the aggregate root**: `PhysicsWorld` now owns the
  `colliderHandle → IUnitPartRef` map (with `registerPart`/`lookupPart`/`partEntries`), so
  `serializeState(s)` can reach it via `ISimState.physics`; `ContactBridge` delegates to it
  (its tracer API is unchanged).
- **D-33 safety belt**: only when a unit is outside the 1000×1000 m safe area does `mirrorAndClamp`
  clamp its position and zero the outward velocity component — written back to both Rapier and the
  mirror.
- **Tests** (`tests/sim/commands.test.ts`): physics-wiring spec (composite spawn + `ISimState.physics`,
  mirror matches the Rapier body, snapshot v3 round-trip, anti-vacuous mirror motion, D-33 boundary,
  post-physics determinism) plus the recalibrated Phase-1 force assertions.

## Task Commits

The single `tdd="true"` task produced three atomic commits on `master`:

1. **Task 1 (RED): failing spec for physics-in-sim wiring + snapshot v3** — `6eb7c4a` (test)
2. **Task 1 (GREEN): wire Rapier into the sim core + canonical snapshot v3** — `7ee22af` (feat)
3. **Task 1 (coverage): direct D-33 safety-belt boundary coverage** — `1ae0014` (test)

**Plan metadata:** `(this commit)` (docs: complete plan)

## Snapshot v3 byte layout (as committed)

```
header:  MAGIC:u32(0x454d5331)  VERSION:u16(=3)  reserved:u16
tick:    i32
streams: streamCount:u16 { nameLen:u16, nameBytes:u8[nameLen], state:u32×4 }
entities: entityCount:u32  nextId:u32
          per entity (9×i32 = 36 B): id, hp, level, x, y, vx, vy, ROTATION, ANGULARVELOCITY
rapier:  rapierLen:u32  rapierBytes:u8[rapierLen]                 // world.takeSnapshot()
parts:   partMapCount:u32
          per entry (14 B): colliderHandle:f64  entityId:i32  part:u8  armorSubtype:u8  // 255 = none
```

## Final `BattleSim.step()` order (as committed)

```
events.clear()
  → commands.drain() + commands.drainRejections()
  → clock.step()
  → emit Rejected (per drained rejection)
  → applyCommands (Force→applyImpulse, Torque→applyTorqueImpulse)
  → physics.step(dt)          // pre-step velocity capture + world.step(eventQueue)
  → contactBridge.drain(tick) // collision-enter → typed IContactEvent → events.emit
  → mirrorAndClamp()          // store.ids()-ordered pose mirror + D-33 safety-belt clamp
```

## Phase-1 test recalibration

- **`tests/sim/commands.test.ts`** (only test file changed, plus additions):
  - *"a force ... changes the target velocity"*: the Phase-1 exact `Δv == fx` assertion became
    direction + magnitude thresholds (`f.vx > b.vx`, `f.vy < b.vy`, `|Δv| > 0.01`). The unit body is
    joint-coupled to its weapon and linearly damped, so an exact constant is not physically
    meaningful; the test's *shape* ("a force changes velocity once") is preserved.
  - *"drains commands exactly once"*: the Phase-1 `v - r ≈ 1` assertion became `d1 > 0 && d2 < d1`
    (Rapier damping shrinks the one-shot lead; a re-applied force would make `d2 > d1`).
- **Unchanged and still green**: `tests/sim/snapshot.test.ts` (now exercises composites through the
  v3 round-trip), `tests/determinism/gate.test.ts`, `tests/sim/headless.test.ts` — the "different
  seed → different trace" assertions are preserved by the seed-derived spawn spec.

## Files Created/Modified

- `src/sim/battle-sim.ts` — physics-wired facade: composite `spawn()`, seed-derived spawn spec,
  Rapier impulse command routing, physics step + contact drain + pose mirror + D-33 clamp, rebuild of
  factory/bridge on `restore()`.
- `src/sim/snapshot.ts` — VERSION 3; per-entity rotation/angularVelocity; f64 helpers; Rapier
  snapshot bytes + part-map sections; `deserializeState` restores the world, rebuilds the part map,
  and derives per-entity physics handles.
- `src/sim/world/physics-world.ts` — part map ownership (`registerPart`/`lookupPart`/`partEntries`),
  `IUnitPartEntry`, restore-capable constructor (`new PhysicsWorld(dt, restoredWorld)`).
- `src/sim/world/contact.ts` — `ContactBridge` delegates `register`/`lookup` to the physics part map.
- `src/sim/world/entity-store.ts` — `IUnitXform` +rotation/angularVelocity; `IUnitComponents` +physics;
  `spawn()`/`restore()` initialize/copy the new fields.
- `src/sim/world/world.ts` — `ISimState.physics: IPhysicsWorld`.
- `src/sim/content/physics.ts` — spawn scenario constants (`SPAWN_RING_RADIUS`, `SPAWN_ANGLE_STEP`,
  `SPAWN_SPEED`; no inline literals on the physics path, T-02-04).
- `tests/sim/commands.test.ts` — physics-wiring spec + recalibrated force assertions.

## Decisions Made

- **Part-map ownership moved to `IPhysicsWorld`.** `serializeState(s)` can only reach state via
  `ISimState`, and the plan adds only `physics` — so for the part map to be serialized/restored
  symmetrically, the physics world must own it. `ContactBridge` keeps its exact tracer API and
  delegates; the tracer tests stay green.
- **Seed-derived spawn spec.** With `movementSystem` removed from `step()`, a purely seed-independent
  spawn would make every seed produce the same trace and break the Phase-1 "different seed → different
  trace" assertions (in unmodified `gate.test.ts`/`headless.test.ts`). Position stays a function of
  ordered id (no initial overlap); velocity is drawn from the seeded `'ai'` stream.
- **Shape-based (not constant-based) force assertions** — see recalibration above.
- **No `run-sim.ts` change required** — `runTrace` only calls `spawn()`/`step()`/`fingerprint()`, whose
  signatures are unchanged, so the plan's "update if spawn() semantics changed" was a no-op.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Part map was not reachable from the aggregate root**
- **Found during:** Task 1 (snapshot v3 design)
- **Issue:** The plan assigns the part map to `ContactBridge` (02-02 tracer) but adds only `physics`
  to `ISimState`; `serializeState(s)`/`deserializeState(bytes)` could not read or rebuild the part map
  through state, making the v3 round-trip impossible.
- **Fix:** Moved part-map ownership to `PhysicsWorld` (`registerPart`/`lookupPart`/`partEntries`);
  `ContactBridge` delegates. This also makes `deserializeState` able to rebuild the map (handles
  survive `World.restoreSnapshot`).
- **Files modified:** `src/sim/world/physics-world.ts`, `src/sim/world/contact.ts`
- **Verification:** `snapshot v3 round-trips with physics present` and the full
  `tests/sim/snapshot.test.ts` round-trip suite pass.
- **Committed in:** `7ee22af` (Task 1 GREEN)

**2. [Rule 2 - Missing Critical] `spawn()` spec source was undefined and must stay seed-dependent**
- **Found during:** Task 1 (battle-sim wiring)
- **Issue:** `spawn()` takes no arguments; the plan did not say where the composite spec's
  position/velocity come from. A fixed spawn would let all units overlap and would nullify the
  Phase-1 "different seed → different trace" assertions once `movementSystem` was replaced.
- **Fix:** `spawnSpec(id)` = ring position by ordered id + `'ai'`-stream velocity; constants added to
  `src/sim/content/physics.ts` (T-02-04: no inline literals on the physics path).
- **Files modified:** `src/sim/battle-sim.ts`, `src/sim/content/physics.ts`
- **Verification:** `tests/determinism/gate.test.ts`, `tests/sim/headless.test.ts` (both
  different-seed assertions) remain green.
- **Committed in:** `7ee22af` (Task 1 GREEN)

**3. [Rule 2 - Missing Critical] D-33 safety-belt truth had no planned assertion**
- **Found during:** Task 1 (acceptance-criteria verification)
- **Issue:** The must-have "the D-33 safety belt pulls position/velocity back only when a unit is
  outside the 1000×1000 m safe area" had no test in the plan's behavior block.
- **Fix:** Added a boundary test that pushes a unit outside (5000, 5000) with outward velocity and
  asserts it is pulled back to the 1000×1000 boundary with no outward velocity restored.
- **Files modified:** `tests/sim/commands.test.ts`
- **Verification:** test passes; full suite green.
- **Committed in:** `1ae0014` (Task 1 coverage)

---

**Total deviations:** 3 auto-fixed (3 × Rule 2 — missing critical functionality)
**Impact on plan:** All three are required for correctness/verifiability (snapshot completeness,
preserved determinism assertions, safety-belt coverage). No new abstraction layers, no content
pipeline — the tracer's seams are reused, and `CompositeFactory`/`ICompositeFactory` signatures were
left untouched (preserving plan 02-04's freezer constraint, no file overlap).

## Issues Encountered

None. The Rapier snapshot round-trip (`fingerprint(restore(snapshot)) === fingerprint(snapshot)` with
physics present) was verified on the first implementation attempt. `pnpm run typecheck` (both
tsconfigs), `pnpm run lint`, `pnpm gate`, and `pnpm test` (72 tests) are all green.

## Deferred / Notes

- **`src/sim/systems/movement.ts` is now superseded** (no longer called by `step()`) but was left in
  place: deleting it was outside this plan's file scope. Its own JSDoc notes it is a Phase-1 stand-in
  to be replaced by physics. A follow-up may remove it plus the now-unused `MOVEMENT_NUDGE_SCALE`.
- **Direct NaN/∞ guard test** for the mirror path is deferred to plan 02-05 (per the plan's threat
  register T-02-04); the safety belt is the current runtime mitigation.
- **Collision-group / lifecycle / CCD hardening** and the array-collision-group factory build-out
  remain plan 02-04's scope (`composite.ts`).

## Self-Check: PASSED

- **Created files:** none (this plan modified existing files only).
- **Modified files verified on disk:** `src/sim/battle-sim.ts`, `src/sim/snapshot.ts`,
  `src/sim/world/physics-world.ts`, `src/sim/world/contact.ts`, `src/sim/world/entity-store.ts`,
  `src/sim/world/world.ts`, `src/sim/content/physics.ts`, `tests/sim/commands.test.ts` — all FOUND.
- **Commits measured:** `commits=3` from `plan_head_before=dfdc928…`
  (`6eb7c4a`, `7ee22af`, `1ae0014`).
- **Verification:** `pnpm run typecheck` exit 0 (both tsconfigs); `pnpm run lint` exit 0;
  `pnpm gate` 14 passed; `pnpm test` 72 passed.
- **Acceptance greps:** `const VERSION = 3;` present in `snapshot.ts`; no `xform.vx +=`/`xform.vy +=`
  in `battle-sim.ts` (Force routes through `applyImpulse`); `ISimState.physics: IPhysicsWorld`
  present; `IUnitXform` has `rotation`/`angularVelocity`.

---
*Phase: 02-physics-composite-units*
*Completed: 2026-10-16*
