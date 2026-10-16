---
phase: 02-physics-composite-units
reviewed: 2026-10-16T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/sim/world/composite.ts
  - src/sim/battle-sim.ts
  - src/sim/content/physics.ts
  - tests/sim/collision-groups.test.ts
  - tests/sim/physics-composite.test.ts
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This is a **gap-closure delta** (plan 02-06) for Phase 2. It replaces the
`(entityId - 1) % 16` membership-bit allocation with a deterministic live-unit pool of
distinct 2-bit masks (`C(16,2) = 120`), adds mask release on `despawn`, fail-loud
exhaustion, a module-level capacity/pool consistency assertion, and a `restoredUnits`
re-seed path consumed by `BattleSim.restore()`.

**CR-01 resolution — confirmed for the intended regime.** I traced the corrected predicate
against Rapier's `InteractionGroups` semantics
(`collide ⟺ (membersA & filterB) ≠ 0 && (membersB & filterA) ≠ 0`) for all distinct live
pairs: because every unit's mask has the same popcount (2) and masks are distinct,
`mask_v \ mask_u ≠ ∅` for `u ≠ v`, so `members(v) & filter(u) ≠ 0` in both directions —
**all distinct-id pairs interact**. Same-unit parts share the unit mask and clear it from
their own filter (`members & filter = mask & ~mask = 0`), so **same-unit parts never
interact**. The id-1/id-17 aliasing family is gone. The `> 120` regime now **fails loud**
rather than silently aliasing, and the module-level enumeration/`GROUP_UNIT_CAPACITY`
equality assertion prevents a silent capacity/bits desync. Determinism of the allocator is
order-stable for identical spawn/despawn sequences (LIFO free list), and the update is
JSDoc-complete with `I`-prefixed interfaces, so the project-locked style rules hold for the
delta.

However, the delta introduces two real defects on the paths it newly opened (the fail-loud
exhaustion path and the restore re-seed path): a non-atomic `spawn()` that corrupts the
`EntityStore` when the pool is exhausted, and a re-seed that restores the membership
**set** but not the allocator's free-list **order**, so a spawn after a restore can receive a
different (though functionally-equivalent) mask than the uninterrupted run — and because
that encoding lands in the Rapier snapshot bytes, exact state-reproduction determinism is
not preserved after a restore+spawn. The two "does not alias" restore assertions are also
non-discriminating at < capacity, so the re-seed's pool reserve is not actually proven.

## Critical Issues

### CR-01: `BattleSim.spawn()` is non-atomic — a fail-loud pool exhaustion leaves a ghost entity in the store

**File:** `src/sim/battle-sim.ts:156-161` (with the throw at
`src/sim/world/composite.ts:429-441`)
**Issue:** `spawn()` allocates the id **first**, then calls the factory:
```typescript
spawn(): EntityId {
    const id = this.simState.store.spawn();            // store now has a full entity (placeholder)
    const unit = this.factory.spawn(this.spawnSpec(id), id); // ← can throw now
    this.simState.store.get(id).physics = unit;
    return id;
}
```
The delta makes `CompositeFactory.spawn` throw (fail loud) when the pool is exhausted
(`unitMembership` → `freeMasks.pop() === undefined`). That throw happens **after**
`EntityStore.spawn()` has already appended the id to `orderedIds`/`byId` and advanced
`nextEntityId` — with the placeholder `physics: { entityId: id, bodyHandle: 0, weaponHandles: [] }`
(`entity-store.ts:104-121`). No rollback occurs. The result is a **ghost entity** in the
store whose `bodyHandle` is `0`.

Rapier handle `0` is a live body (the first body created in the world), not a null sentinel,
so the failure is silent corruption rather than a clean error:
- `step()` → `mirrorAndClamp()` (`battle-sim.ts:345-376`) iterates `store.ids()`, calls
  `world.getRigidBody(0).translation()` and mirrors the **wrong** unit's pose into the ghost
  entity's `xform` — no exception, just wrong state.
- `snapshot()` then serializes the ghost entity and its bogus pose, so the corruption
  propagates into the "source of truth" bytes and the fingerprint.
- Commands targeting the ghost id pass `hasUnit()` and apply impulses to the wrong body.

This is exactly the "silent undefined/aliased handle" class the rest of the codebase guards
against. The fail-loud contract implies the caller may catch and recover, but a catch leaves
the simulation corrupted.

**Fix:** Make the id allocation and factory spawn atomic (roll back the store on failure):
```typescript
spawn(): EntityId {
    const id = this.simState.store.spawn();
    let unit: IUnitPhysics;
    try {
        unit = this.factory.spawn(this.spawnSpec(id), id);
    } catch (err) {
        this.simState.store.despawn(id); // roll back the just-allocated id
        throw err;
    }
    this.simState.store.get(id).physics = unit;
    return id;
}
```
(Note `spawnSpec` also consumes two draws from the `'ai'` stream before the throw; if
post-exhaustion recovery must remain trace-identical, either pre-check capacity before
allocating or accept that a rejected spawn is a non-deterministic boundary. At minimum the
store must not be left inconsistent.)

## Warnings

### WR-01: Restore re-seed restores the membership set but not the free-list order → post-restore spawns can diverge from the uninterrupted run

**File:** `src/sim/world/composite.ts:401-419` (`reseed`), `src/sim/battle-sim.ts:425-444`
**Issue:** The live allocator's free list is a LIFO stack: allocation `pop()`s the **last**
element; `despawn` `push()`es the freed mask to the **end** (so the free list is
`[never-allocated masks … , freed masks in reverse-free order]`). `reseed` reconstructs the
free list by removing the restored (live) masks from a **freshly enumerated** array via
`splice`, i.e. it rebuilds the complement in **enumeration order**, not the LIFO order the
live factory had. Whenever the most-recently-freed mask is not the highest-index mask not in
the live set, the two orders differ.

Concrete trace (enumeration positions `c0..c119`; `pop` takes the end):
```
spawn A -> c119, spawn B -> c118         live free list: [c0..c117]
despawn A -> push c119                    free list:      [c0..c117, c119]
despawn B -> push c118                    free list:      [c0..c117, c119, c118]  top = c118
snapshot
restore (live set empty)                  free list:      [c0..c119]              top = c119
spawn D -> live: c118   |   restored: c119   ← different mask
```
Because the membership bits are encoded into each collider's `InteractionGroups`, which is
part of the Rapier `takeSnapshot()` bytes, `fingerprint()` after a
`restore → spawn` differs from `fingerprint()` after the equivalent uninterrupted
`spawn`. All masks are functionally equivalent and the physics outcome is identical, so no
current gate fails (existing restore tests never spawn a new unit against the same bit
budget, and `snapshot.test.ts:244-337` compares restore-vs-restore, not
restore-continuation vs direct continuation) — but the delta's assertion of re-seed
**completeness** and "order-stable" (D-17) is not upheld: the allocator's free-list order is
part of its deterministic state and is not serialized.

**Fix:** Either make allocation order canonical and history-free — allocate the
**lowest** available mask (or index masks by a serialized cursor) so the free-list order is
unobservable — or serialize the free-list order (e.g. as a sidecar in the snapshot part
section), then rebuild `freeMasks` in that exact order in `reseed`. The lowest-available
scheme is the smaller change and makes restore re-seed trivially complete.

### WR-02: `restore()` is non-atomic when the re-seed defensive throw fires

**File:** `src/sim/battle-sim.ts:425-444`, throw at `src/sim/world/composite.ts:406-411`
**Issue:** `restore()` replaces `this.simState` (via `deserializeState`) and `this.bridge`,
and only then constructs the new `CompositeFactory(...)` — whose `reseed` can throw
(`restore: unit ${id} has no body collider to read groups from`). If it throws, the
assignment `this.factory = new CompositeFactory(...)` never completes, so `this.factory`
still references the **old** world while `this.simState.physics` is the **new** world.
The sim is left half-restored: a subsequent `spawn()` creates bodies in the stale world and
stores their handles against the new store. The defensive throw is correct in intent, but it
must not leave a torn object.

**Fix:** Build the factory into a local first, then commit atomically:
```typescript
const factory = new CompositeFactory(
    this.simState.physics.world,
    (handle, ref) => bridge.register(handle, ref),
    handle => this.simState.physics.unregisterPart(handle),
    restoredUnits
); // throws before any assignment
this.bridge = bridge;
this.factory = factory;
```
(Also assign `this.simState` last, or capture the new state locally until all sub-objects
are built.)

### WR-03: `reseed` trusts a `bodyHandle` that may be the `0` fallback → wrong-mask reservation and possible re-aliasing on a corrupt snapshot

**File:** `src/sim/world/composite.ts:406-417`, fallback at `src/sim/snapshot.ts:344`
**Issue:** `deserializeState` writes `bodyHandle: bodyByEntity.get(e.id) ?? 0`. If an
entity's part map has no `PartKind.Body` entry (the pre-existing WR-04 hazard), the entity
is restored with `bodyHandle = 0` — a live body belonging to a *different* entity. `reseed`
guards only `!body || body.numColliders() === 0`; a valid-but-wrong body passes the guard, so
`reseed` reads **another unit's** membership bits and (a) records them as this unit's mask
and (b) removes that mask from `freeMasks`. The truly-owned mask, if any, is never reserved,
so a later `spawn` can be handed a mask that is still in use by a live restored unit — the
exact cross-unit aliasing CR-01 eliminated, silently reintroduced for a corrupt snapshot.

**Fix:** Fix the root cause (WR-04): make the missing Body part a hard error in
`deserializeState` instead of a `?? 0` fallback. Optionally, in `reseed` cross-check that the
entity's `bodyHandle` actually resolves to a body whose first collider is registered to that
same `entityId` (`lookupPart(body.collider(0).handle)?.entityId === id`) and throw otherwise.

### WR-04: The two "does not alias" restore assertions are non-discriminating at < capacity

**File:** `tests/sim/physics-composite.test.ts:360-405` and `:407-450`
**Issue:** Both tests despawn a restored unit, then `spawn` a fresh unit and assert the new
unit still interacts with the surviving restored unit. With `GROUP_UNIT_CAPACITY = 120` and
fewer than 5 live units, a `reseed` that rehydrated `units` but **forgot** to reserve the
live masks would still pass: the new unit `pop`s the highest remaining mask, which is
already distinct from the survivor's mask, so `interacts(...) === true` regardless. The tests
therefore prove the units-index rehydration (via the collider/body/joint decrement
assertions) but do **not** prove the membership-pool re-seed that the delta's central claim
("new spawn does not alias a restored unit") rests on.

**Fix:** Force an actual collision of masks after restore — e.g. assert the new unit's mask
is not equal to any restored unit's mask and is absent from the restored set; or, more
robustly, after restore spawn `GROUP_UNIT_CAPACITY - liveCount` units and assert the next
spawn throws (proving the restored masks really were removed from the pool).

## Info

### IN-01: Interaction predicate is documented with arithmetic `>>` but must use `>>>`

**File:** `src/sim/content/physics.ts:75-79`, `src/sim/world/composite.ts:443-448`
**Issue:** Both doc comments state the predicate as
`((a >> 16) & b) != 0 && ((b >> 16) & a) != 0`. For masks with bit 15 set, the encoded
`InteractionGroups` value exceeds `2³¹`, so arithmetic `>>` sign-extends and yields a wrong
result. The tests correctly use `>>>` (and the summary calls this out as an established
pattern), but the normative comment reads `>>`.
**Fix:** Change the comment (and any future helper) to `((a >>> 16) & b) !== 0 && ((b >>> 16) & a) !== 0`.

### IN-02: Direct `EntityStore.despawn` bypasses mask release — lifecycle pairing is convention-only

**File:** `src/sim/battle-sim.ts:173-176`, `src/sim/world/entity-store.ts:128-132`
**Issue:** `BattleSim.despawn` correctly pairs `factory.despawn` (bodies + mask release) with
`store.despawn`. But `EntityStore.despawn` remains public and independent; calling it
directly (as `tests/sim/snapshot.test.ts:181,191` does, and as Phase 3/4 death code might)
leaks the unit's bodies, colliders, part-map entries **and** its membership mask (the mask is
never returned to `freeMasks`). There is no guard or doc on `EntityStore.despawn` warning
that the factory must be notified.
**Fix:** Document the pairing explicitly on `IEntityStore.despawn`, or route all removals
through `BattleSim.despawn` (e.g. make the store's despawn internal to the sim facade).

### IN-03: `GROUP_MASK_ENEMY` equals `GROUP_MASK_ALL`, so the body/part filter split is dead

**File:** `src/sim/content/physics.ts:106-113`, `src/sim/world/composite.ts:256-257`
**Issue:** Bodies use `interactionGroups(mask, GROUP_MASK_ALL)` and parts use
`interactionGroups(mask, GROUP_MASK_ENEMY)`, but both constants are `0xffff`, so the two
paths are identical. This is documented as intentional for Phase 2 (enemy/ally damage
deferred to D-31), so it is not a defect — noted only so the divergence in Phase 3 is a
deliberate change rather than an accident.
**Fix:** None required now; when `GROUP_MASK_ENEMY` narrows, re-verify the symmetric
interaction predicate against body-vs-enemy-part pairs.

### IN-04: Capacity guard checks pool length but not that masks fit the 16-bit membership field

**File:** `src/sim/world/composite.ts:198-204`
**Issue:** The import-time guard asserts `enumerateMembershipPool().length === GROUP_UNIT_CAPACITY`.
It does not assert `GROUP_BIT_COUNT <= 16`. A future edit that raises `GROUP_BIT_COUNT` above
16 **and** updates `GROUP_UNIT_CAPACITY` to match would keep the guard green while producing
masks with bits above 15, which are silently lost by `(members << 16)` / `& GROUP_MASK_ALL`.
**Fix:** Add `if (GROUP_BIT_COUNT > 16) throw ...` alongside the length assertion (or assert
`GROUP_MEMBERSHIP_BITS_PER_UNIT < GROUP_BIT_COUNT <= 16`).

### IN-05: (Residual, carried from prior review) `driveSwing` is still never invoked by `BattleSim.step()`

**File:** `src/sim/battle-sim.ts:237-254`
**Issue:** `CompositeFactory.driveSwing` is implemented and unit-tested, but `step()` never
calls it, so weapons never oscillate in the shipped sim and D-25 ("持续往复摆动") remains
unwired. This is unchanged and explicitly deferred in the 02-06 summary (Phase 4), but it
means the collision groups under review currently only ever filter body/armor contacts in the
real path.
**Fix:** As before — drive the swing in `step()` before `physics.step`, iterating the ordered
`store.ids()`.

---

_Reviewed: 2026-10-16T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
