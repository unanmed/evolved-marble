---
phase: 02-physics-composite-units
reviewed: 2026-10-16T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - package.json
  - src/config/sim.ts
  - src/sim/battle-sim.ts
  - src/sim/content/physics.ts
  - src/sim/core/events.ts
  - src/sim/snapshot.ts
  - src/sim/world/composite.ts
  - src/sim/world/contact.ts
  - src/sim/world/entity-store.ts
  - src/sim/world/physics-init.ts
  - src/sim/world/physics-world.ts
  - src/sim/world/world.ts
  - tests/determinism/physics-gate.test.ts
  - tests/determinism/rapier-version.test.ts
  - tests/helpers/physics-setup.ts
  - tests/helpers/run-physics.ts
  - tests/sim/ccd.test.ts
  - tests/sim/commands.test.ts
  - tests/sim/contact.test.ts
  - tests/sim/physics-composite.test.ts
  - tests/sim/snapshot.test.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 6
  info: 8
  total: 15
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 2 wires Rapier2D into the sim core (D-34), builds a composite-unit factory (body + armor colliders on one rigid body, weapon bodies on revolute joints), a typed contact bridge using pre-step velocities for Δv, and canonical snapshot v3 (Rapier snapshot bytes + part map). The overall shape is sound and the touched seams (`PhysicsWorld`, `ContactBridge`, `CompositeFactory`, `serializeState`/`deserializeState`) are cohesive, JSDoc-heavy, and mostly follow the project-locked rules. Rapier `forEachRigidBody` is read-only and only feeds a handle-keyed lookup map, so unordered iteration does not leak into determinism; entities are iterated strictly via `store.ids()`.

However, the implementation has one correctness defect that silently breaks core collision behavior once unit count exceeds the 16-bit membership budget, plus several integration gaps where documented behavior is not actually wired (command `atTick`, weapon swing) and where snapshot/restore rehydration is incomplete. All Δv/contact and collision-group arithmetic was traced against Rapier's `InteractionGroups` semantics; the pre-step capture ordering is correct (commands → capture → `world.step` → drain).

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Collision membership bit is reused every 16 units → unrelated units silently stop colliding

**File:** `src/sim/world/composite.ts:332-335` (`unitMembership`), used at `composite.ts:194-196`
**Issue:** `unitMembership(id) = (GROUP_UNIT_MEMBERSHIP << ((id - 1) % GROUP_COUNT)) & GROUP_MASK_ALL` with `GROUP_COUNT = 16`. Entity ids that differ by a multiple of 16 receive the **same** membership bit. Because `interactionGroups` removes a unit's own membership bit from that unit's filter mask, two unrelated units sharing a bit **do not collide with each other at all** — unit 1 and unit 17, unit 2 and unit 18, etc. pass through one another. This is not a harmless cap: the project's core product is faction battles with "多个势力…调动军队", so >16 units on the map is the expected regime. The failure is silent (no assertion, no event). The comment documents the bit budget but the code neither guards nor reports overflow.

Worked trace: unit 1 → membership `0x0001`, body filter `0xFFFE`; unit 17 → membership `0x0001`, body filter `0xFFFE`. Interaction test `((a>>16)&b)!=0 && ((b>>16)&a)!=0` evaluates `(0x0001 & 0xFFFE) == 0` → no interaction. Confirmed non-collision.

**Fix:** Allocate membership bits from a live-unit pool and release on `despawn`, and fail loud on exhaustion rather than aliasing. Minimal guard (still modulo-free for the first 16):
```typescript
// CompositeFactory
private readonly freeBits: number[] = Array.from(
    { length: GROUP_COUNT },
    (_, i) => GROUP_UNIT_MEMBERSHIP << i
);

private unitMembership(entityId: EntityId): number {
    // assign a stable, unique bit per live entity; never alias an active unit
    const existing = this.membership.get(entityId);
    if (existing !== undefined) return existing;
    const bit = this.freeBits.pop();
    if (bit === undefined) {
        throw new Error(`collision groups exhausted (max ${GROUP_COUNT} live units)`);
    }
    this.membership.set(entityId, bit);
    return bit;
}
```
and release the bit in `despawn`. If >16 simultaneous units is a real requirement, the unit-level grouping decision (D-27) must be revisited (e.g., layers vs. group bits) — a modulo alias is not acceptable.

### Warnings

#### WR-01: `atTick` is validated but never enforced; commands apply on whatever tick they drain

**File:** `src/sim/battle-sim.ts:268-318` (`applyCommands`), contract at `src/sim/commands.ts:44-45`
**Issue:** Every command carries `atTick` documented as "期望生效的 tick（副作用：异步 driver 迟到则跳过）", and `validate()` even requires it (`commands.ts:119-122`). But `applyCommands` never reads `cmd.atTick` — every drained command is applied on the tick of the `step()` that drained it. A command submitted with `atTick` far in the future (e.g. by an async Python/LLM driver) is applied immediately; a late command is applied late instead of being skipped. This contradicts the documented replay/async contract (SIM-02/SIM-03) and makes "recorded command log + seed" replay diverge from live behavior when driver timing varies.

**Fix:** Enforce the field in the command loop, e.g. skip (and emit a `Rejected`/skip event) when `cmd.atTick !== tick` (or `< tick` for "late" semantics), or remove `atTick` and the corresponding doc claim. The existing tests submit `atTick: t + 1` immediately before `step()`, so gating on `cmd.atTick === tick` remains test-compatible:
```typescript
for (const cmd of cmds) {
    if (cmd.atTick !== tick) {
        // late/early command: deterministic skip, never silently applied
        this.rejectUnit(cmd.unit, tick); // or a dedicated 'stale command' reason
        continue;
    }
    ...
}
```

#### WR-02: `driveSwing` is never invoked — weapons never swing in the real sim (D-25 unwired)

**File:** `src/sim/world/composite.ts:295-304` (implemented), `src/sim/battle-sim.ts:219-236` (`step()`)
**Issue:** `CompositeFactory.driveSwing` is fully implemented and gated by tests, but `BattleSim.step()` never calls it — and nothing in `src/` does (grep confirms only the declaration and its definition). Consequently, in the shipped simulation path, weapon bodies receive no angular velocity, weapons never oscillate, and weapon-driven contacts (the Δv source for damage in Phase 3) essentially never occur. `contact.test.ts` Test 6 even sets weapon orientation manually with the note "`BattleSim` 本阶段不驱动摆动". D-25 ("无需 AI 的持续往复摆动") is therefore a deliverable that is not integrated.

**Fix:** Drive the swing in `step()` before `physics.step`, iterating the ordered id array and using the store's mirror handle set (do not iterate the factory's `units` Map):
```typescript
// after applyCommands, before physics.step
for (const id of this.simState.store.ids()) {
    this.factory.driveSwing(
        this.simState.store.get(id).physics,
        tick,
        this.cfg.dt
    );
}
```

#### WR-03: `restore()` rebuilds `CompositeFactory` with an empty `units` index — `despawn` silently no-ops for restored units

**File:** `src/sim/battle-sim.ts:407-419` (`restore`), `src/sim/world/composite.ts:315-323` (`despawn`)
**Issue:** `despawn` begins with `const unit = this.units.get(entityId); if (!unit) return;`. After `restore()`, a brand-new `CompositeFactory` is constructed and its `units` map is empty; the restored physics world contains real bodies/parts but the factory has no record of them. Any future `despawn` for a restored unit becomes a silent no-op — its bodies, colliders, joints and part-map entries leak, and the "no dangling handle" guarantee (T-02-01) is broken. This is latent only because `BattleSim` currently exposes no public despawn path, but the factory contract is public and tested, so the seam is a footgun.

**Fix:** Rehydrate the factory index from the restored store after construction:
```typescript
this.factory = new CompositeFactory(...);
for (const id of this.simState.store.ids()) {
    this.factory.units.set(id, this.simState.store.get(id).physics);
}
```
Add a public `rehydrate(units: ReadonlyMap<EntityId, IUnitPhysics>)` (or constructor arg) rather than reaching into the field, and add a round-trip test: spawn → snapshot → restore → despawn → assert colliders/bodies/joints decremented and part lookups null.

#### WR-04: Missing Body part silently aliases Rapier body handle `0`

**File:** `src/sim/snapshot.ts:344`
**Issue:** `bodyHandle: bodyByEntity.get(e.id) ?? 0` silently substitutes handle `0` when no `PartKind.Body` entry was found for the entity. Rapier body handle `0` is almost certainly a *live* body (the first created). The fallback thus converts a snapshot-integrity error (missing body part) into a wrong-but-plausible handle that aliases another entity's body. Command application (`bodyOf`) would then apply impulses to the wrong unit with no signal — a silent correctness/data-integrity hazard, exactly the "silent no-op / undefined deref" class the code elsewhere guards against.

**Fix:** Treat a missing body part as a hard, deterministic error (the snapshot is claimed exhaustive):
```typescript
const bodyHandle = bodyByEntity.get(e.id);
if (bodyHandle === undefined) {
    throw new Error(`snapshot: entity ${e.id} has no Body part`);
}
```
(and keep `weaponHandles` as-is or validate similarly).

#### WR-05: Part map is serialized in raw `Map` insertion order — snapshot bytes are history-dependent

**File:** `src/sim/snapshot.ts:129,199-206` and `src/sim/world/physics-world.ts:213-219` (`partEntries`)
**Issue:** `serializeState` deliberately canonicalizes RNG streams by dictionary sort (`snapshot.ts:124-126`) but writes the part map in `partEntries()`'s `Map` insertion order. Insertion order tracks the *history* of collider create/delete (`parts.set` on a fresh handle appends; `delete`+re-`set` on a reused handle re-appends). Two simulations that reach the same logical state by different spawn/despawn histories can therefore emit different part-segment byte orderings, breaking the "same logical state → identical bytes at any call site" invariant (SIM-04 / D-05). Current tests only compare same-history runs, so this gap is untested.

**Fix:** Sort the part entries by a canonical key (the numeric collider handle) before writing, and register in that same order on restore:
```typescript
const parts = [...s.physics.partEntries()].sort((a, b) => a.handle - b.handle);
```
Serialization and deserialization must agree on the ordering (they will, since the same handle set is written then read).

#### WR-06: `spawn()` leaves the store pose mirror at `(0,0)` until the first `step()`

**File:** `src/sim/battle-sim.ts:153-158`, `src/sim/battle-sim.ts:327-357` (`mirrorAndClamp`)
**Issue:** `spawn()` creates the Rapier body at the spec position but only sets `store.get(id).physics`, never the `xform` mirror; the mirror is written exclusively by `mirrorAndClamp` during `step()`. Until the next `step()`, `state.store.get(id).xform` reports `(0,0)` while the physical body is at the spawn ring — a stale, contradictory state. A host/renderer reading `state` on the spawn frame draws at the origin, and `snapshot()` taken between `spawn()` and the first `step()` records a mirror that disagrees with the embedded Rapier bytes (the restored mirror then self-heals only after one step). `snapshot.test.ts` documents the behavior ("spawn() 本身不写 xform") but that does not make the two-view inconsistency correct.

**Fix:** Write the initial mirror in `spawn()` (or have `spawn()`/`mirrorAndClamp` share a single body→mirror helper) so the read-only view is never stale:
```typescript
const id = this.simState.store.spawn();
const unit = this.factory.spawn(this.spawnSpec(id), id);
const c = this.simState.store.get(id);
c.physics = unit;
this.mirrorOne(id, unit); // sets xform from Rapier body/vel/rotation
```

### Info

#### IN-01: Weapon bodies spawn at rest while the carrier body spawns with velocity

**File:** `src/sim/world/composite.ts:241-249`
**Issue:** The body is created with `setLinvel(spec.vx, spec.vy)`, but each weapon body is created without any `setLinvel`. On the first `world.step`, the revolute joint must reconcile a moving body with a stationary weapon, injecting a transient joint impulse/jerk. It is deterministic (so not a gate failure) but is non-physical and can visibly twitch the weapon on the first frames — relevant to the "battle must look good" core value.
**Fix:** Initialize weapon linvel to the spec velocity (`.setLinvel(spec.vx, spec.vy)`) so the joint starts unstrained.

#### IN-02: `EntityStore.ids()` returns the live internal array

**File:** `src/sim/world/entity-store.ts:151-153`
**Issue:** The method is documented as a "只读的有序 id 视图" but returns the internal `orderedIds` array by reference; any caller can `push`/`splice`/reorder it and silently corrupt the iteration contract. All current callers only read, but the type `readonly EntityId[]` does not enforce anything at runtime.
**Fix:** Return a copy (`this.orderedIds.slice()`) or freeze/cache a readonly view; the performance cost is negligible at the intended scale.

#### IN-03: Local serializer closures lack JSDoc (project-locked rule #1)

**File:** `src/sim/snapshot.ts:144-163` (`u8`/`u16`/`u32`/`i32`/`f64`), `src/sim/snapshot.ts:231-255` (`readU8`/`readU16`/`readU32`/`readI32`/`readF64`)
**Issue:** The project-locked rules require JSDoc on every function. These local helper closures in `serializeState`/`deserializeState` have none (`quantize`/`dequantize` do). 
**Fix:** Add one-line JSDoc to each closure, or hoist them to documented module-level helpers.

#### IN-04: Test rigs use classes as types (project-locked rule #2)

**File:** `tests/sim/contact.test.ts:35-42` (`IContactRig`), `tests/sim/physics-composite.test.ts:41-50` (`ICompositeRig`)
**Issue:** Rule #2 forbids using a class directly as a type and requires an `I`-prefixed interface before the class. These rig interfaces declare `physics: PhysicsWorld; bridge: ContactBridge; events: EventLog;` (and `factory: CompositeFactory`), i.e. classes used as types. Production code complies; the test helpers do not.
**Fix:** Type the rig fields with the interfaces (`IPhysicsWorld`, `IContactBridge`, `IEventLog`, `ICompositeFactory`), which are already exported.

#### IN-05: Stream-name truncation and unguarded entity-id encoding

**File:** `src/sim/snapshot.ts:173` (name), `src/sim/snapshot.ts:184` (id)
**Issue:** Stream names are written as `name.charCodeAt(i) & 0xff`, so any non-ASCII/long stream name silently collides (bytes truncated to 8 bits, later decoded via `String.fromCharCode`). Separately, the entity `id` is written with raw `i32()` rather than the guarded `quantize()` path, so an id above `2^31-1` wraps silently — the exact class WR-03 guards against for other fields.
**Fix:** Encode names as UTF-8 (or assert ASCII) and write ids via a range-checked path.

#### IN-06: `deserializeState` has no length/bounds validation

**File:** `src/sim/snapshot.ts:229-299`
**Issue:** Untrusted/short `bytes` are decoded with no minimum-length check: reading a name past the end yields `String.fromCharCode(undefined)` → `'\u0000'` silently (no throw), and attacker-sized `rapierLen`/`entityCount`/`partCount` fields drive allocations/loops before any `DataView` range error surfaces. Only `MAGIC`/`VERSION` are validated. Low severity (local-only, no network boundary here), but it makes corrupt-snapshot diagnostics unreliable.
**Fix:** Validate `bytes.byteLength >= HEADER_SIZE` up front and bounds-check each count against remaining length; reject with a deterministic `snapshot: truncated` error.

#### IN-07: `velocityAtPoint` mixes a post-step contact point with pre-step velocity

**File:** `src/sim/world/contact.ts:184-197`
**Issue:** The contact point `px`/`py` comes from the manifold after `world.step()` (post-step positions), but the linear/angular velocity comes from the pre-step capture. The lever arm `r = p − translation()` therefore uses the post-step translation while `ω` is pre-step, introducing a small skew in `dv` (absorbed by the tests' `DV_TOLERANCE`). Δv magnitude is correct for center-of-mass contacts but slightly off for off-center weapon hits, which are exactly the interesting cases.
**Fix:** Capture body translations alongside the pre-step velocities in `capturePreStepVelocities`, and use the pre-step translation for the lever arm (keep the manifold point for `p`).

#### IN-08: `state` getter exposes the mutable aggregate root despite the "read-only view" contract

**File:** `src/sim/battle-sim.ts:53-55,131-134`
**Issue:** `IBattleSim.state` is documented as a "只读状态视图" but returns the live `ISimState`, whose `store`/`rng`/`commands` are all mutable (tests deliberately mutate it). Nothing prevents a host from corrupting state outside the command boundary — the very boundary the design claims to enforce.
**Fix:** Either type `state` as a `Readonly<...>` view (deep), or document explicitly that deep immutability is not enforced and keep mutation out of host code by convention.

---

_Reviewed: 2026-10-16T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
