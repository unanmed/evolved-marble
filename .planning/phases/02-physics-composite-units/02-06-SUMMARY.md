---
phase: 02-physics-composite-units
plan: 06
subsystem: physics
tags: [rapier2d, wasm, collision-groups, interaction-groups, live-pool, determinism, restore, despawn, gap-closure, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-physics-composite-units
    provides: "full CompositeFactory arrays/unit groups/lifecycle/CCD/swing (02-04)"
  - phase: 02-physics-composite-units
    provides: "Rapier wired into BattleSim + snapshot v3 + IPhysicsWorld-owned part map + restore (02-03)"
provides:
  - "CompositeFactory live-pool membership allocator (D-27): a deterministic pool of distinct 2-bit masks (C(16,2)=120) replaces the (entityId-1)%16 alias; masks are released on despawn and exhaustion fails loud naming GROUP_UNIT_CAPACITY"
  - "module-level capacity/pool consistency assertion in composite.ts: throws at import naming both the enumerated pool length and GROUP_UNIT_CAPACITY when they differ (a bits-per-unit edit cannot silently desync the guard or the >16 regression cardinality)"
  - "content constants re-sourced: GROUP_BIT_COUNT / GROUP_MEMBERSHIP_BITS_PER_UNIT / GROUP_UNIT_CAPACITY replace GROUP_COUNT / GROUP_UNIT_MEMBERSHIP; the false 'Rapier hard limit' claim is removed"
  - "CompositeFactory optional restored live-unit map: re-seeds the units index and membership pool from restored colliders in ascending id order (WR-03)"
  - "BattleSim.restore builds the restored map from store.ids() and an additive public BattleSim.despawn(entityId) (spawn's symmetric lifecycle entry; the reachable path that makes the re-seed provable at the BattleSim level)"
  - "tests/sim/collision-groups.test.ts: >16-concurrent-unit collision regression + exhaustion/release/order-stability suite"
affects: [phase-3-combat, phase-4-unit-ai, phase-5-render, phase-6-bridge]

# Actuals (#2632) — pairs with the plan's `estimate` (30000 tokens / 2 tasks / confidence low).
actuals:
  tokens: 7362
  tasks: 2
  commits: 3
plan_head_before: 6e14c4c1acc8550407affe2a402638bac7afc167

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-unit membership pool: enumerate all C(16,2)=120 distinct 2-bit masks in ascending combination order; each live unit pops a mask (pop) and returns it on despawn (push); two equal-popcount masks are incomparable under bit inclusion, so distinct units always share an interactable bit while a unit's own mask is cleared from its own filter"
    - "Fail-loud allocator: an empty pool throws (naming GROUP_UNIT_CAPACITY) instead of aliasing a live unit's membership bit — no silent collision loss"
    - "Import-time capacity/pool consistency assertion (phenomenon: hand-written capacity literal vs enumerated pool) via a module-level guard"
    - "Restore re-seed: CompositeFactory's optional restoredUnits map rehydrates both the units index and the membership pool from restored collider collisionGroups() high 16 bits, ascending id order; BattleSim.restore derives it from store.ids()"

key-files:
  created:
    - tests/sim/collision-groups.test.ts
  modified:
    - src/sim/world/composite.ts
    - src/sim/content/physics.ts
    - src/sim/battle-sim.ts
    - tests/sim/physics-composite.test.ts

key-decisions:
  - "Widen membership to distinct 2-bit masks: a single-bit live pool still caps at 16 concurrent units (below the 10v10=20 target), so each unit claims a distinct 2-bit mask, raising capacity to C(16,2)=120 while keeping one mechanism (a free-list + one enumeration helper), not a new abstraction layer (D-36)."
  - "Fail loud on exhaustion: unitMembership throws naming GROUP_UNIT_CAPACITY when the pool is empty — never aliases another live unit's membership bit (CR-01 suggested fix)."
  - "Pool enumeration + capacity guard live at module level in composite.ts (throws at import when the enumerated pool length differs from GROUP_UNIT_CAPACITY); GROUP_UNIT_CAPACITY stays a single-source literal in the pure-data content module."
  - "Free-list is LIFO (pop to allocate, push to release); identical spawn/despawn sequences produce identical encoded groups (order-stable, D-17), so the same-machine determinism gate is unaffected."
  - "Restore re-seed folded in WR-03: CompositeFactory takes an optional restoredUnits map; BattleSim.restore derives it from store.ids() (never Map/Set iteration) and BattleSim.despawn is the additive public entry that makes the re-seed observably testable."
  - "despawn order revisited: the factory releases the unit's membership mask (push to freeMasks) after removing its bodies; BattleSim.despawn runs factory.despawn then store.despawn so the factory reads restored Rapier handles/masks before the store drops the id."

patterns-established:
  - "InteractionGroups predicate is read with logical right shift (>>>): a high-bit membership mask pushes the encoded value past 2^31, where arithmetic >> would sign-extend incorrectly."
  - "Match the pool cardinality to the encoding arithmetic: enumerate the pool and assert its length equals the single-source capacity so a bits-per-unit edit fails loud at import rather than silently shifting the exhaustion bound and the regression's expected unit count."

requirements-completed: [PHYS-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Unit-level InteractionGroups (D-27) keep every distinct unit pair colliding beyond 16 concurrent units (the previously-aliased id-1/id-17 family now collides) while same-unit parts stay mutually non-damaging."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#units whose ids differ by a multiple of 16 physically collide (aliasing family)"
        status: pass
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#same-unit parts stay mutually non-damaging with widened multi-bit masks (D-27)"
        status: pass
      - kind: unit
        ref: "tests/sim/collision-groups.test.ts#every distinct pair of 20 concurrent units interacts; each unit excludes its own membership (D-27)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Membership masks come from a deterministic live pool; spawning beyond GROUP_UNIT_CAPACITY throws an error naming the capacity (fail loud, no silent aliasing), and the capacity literal cannot silently desync from the enumerated pool."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/collision-groups.test.ts#spawning exactly GROUP_UNIT_CAPACITY (120) units succeeds; one more throws (fail loud)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Masks freed on despawn are reusable: refilling to capacity does not throw and each refilled unit interacts with every still-live unit."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/collision-groups.test.ts#despawned masks are reusable — refilling to capacity does not throw and interacts with every live unit (D-27)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Allocation is order-stable: two identical spawn/despawn sequences produce byte-identical encoded InteractionGroups for the same live ids (D-17 same-machine determinism)."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/collision-groups.test.ts#two identical spawn/despawn sequences yield byte-identical collision-group values (order-stable, D-17)"
        status: pass
      - kind: integration
        ref: "pnpm gate (tests/determinism): 3 files / 14 tests pass, exit 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "BattleSim.restore re-seeds the composite factory from store.ids(): a restored unit is despawnable (its part handles resolve null, collider/body/joint counts drop) and a later spawn does not alias a restored unit — proven at the BattleSim level (WR-03)."
    requirement: "PHYS-01"
    verification:
      - kind: integration
        ref: "tests/sim/physics-composite.test.ts#BattleSim restore re-seeds the factory — despawn drops restored handles, new spawn does not alias (WR-03)"
        status: pass
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#a factory re-seeded with restored units despawns them and does not alias new spawns (WR-03)"
        status: pass
    human_judgment: false

# Metrics
duration: 12 min
completed: 2026-10-16
status: complete
---

# Phase 2 Plan 06: D-27 Live-Pool Collision Groups (Gap Closure) Summary

**The `(entityId-1) % 16` membership-bit alias was replaced by a deterministic live-unit pool of distinct 2-bit masks (capacity C(16,2)=120), released on `despawn`, failing loud on exhaustion, and re-seeded on `BattleSim.restore` — so the id-1/id-17 family and every pair of 20 concurrent units now collide, proven both at the factory and BattleSim levels.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-16T18:01:00Z (approx)
- **Completed:** 2026-10-16T18:08:00Z (approx)
- **Tasks:** 2 (both `tdd="true"`; Task 2 is test-only)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- **D-27 collision defect closed (CR-01):** `CompositeFactory.unitMembership` now allocates from a deterministic live pool of **distinct 2-bit masks** instead of `(entityId-1) % 16`. Two equal-popcount masks are incomparable under bit inclusion, so any two distinct live units share at least one interactable bit (mutual interaction) while a unit's own mask is cleared from its own filter (intra-unit non-damaging). Capacity rises from 16 to `C(16,2) = 120`, covering the 10v10 (20-unit) target regime.
- **Fail loud, never alias:** an exhausted pool throws an error naming `GROUP_UNIT_CAPACITY`; masks are returned to the pool on `despawn` so the freed mask can be reused without sharing it with any live unit.
- **Single-source guard:** a module-level assertion computes the enumerated pool once and throws **at import** when its length differs from `GROUP_UNIT_CAPACITY`, naming both values — a `GROUP_MEMBERSHIP_BITS_PER_UNIT` edit cannot silently desync the exhaustion bound or the `>16` regression's expected cardinality.
- **Restore re-seed (WR-03 folded):** `CompositeFactory` accepts an optional `restoredUnits` map and re-seeds both the units index and the membership pool from restored collider `collisionGroups()` high bits, in ascending id order; `BattleSim.restore` derives that map from `store.ids()`, and the new additive `BattleSim.despawn(entityId)` makes the re-seed observably testable at the BattleSim level.
- **Scale regression suite:** `tests/sim/collision-groups.test.ts` asserts, over all `C(20,2)` pairs, that 20 concurrent units interact while each unit self-excludes; that spawning beyond capacity throws; that freed masks are reusable; and that identical spawn/despawn sequences yield byte-identical encodings (D-17).

## Task Commits

Each task was committed atomically (`workflow.tdd_mode` is `false`; the RED→GREEN ordering was followed manually):

1. **Task 1 (RED): failing specs for live-pool groups + restore re-seed** — `6f6d659` (test)
2. **Task 1 (GREEN): live-pool collision groups with restore re-seed** — `2466133` (feat)
3. **Task 2: >16-unit collision-group regression suite** — `17001a6` (test)

**Plan metadata:** `(this commit)` (docs: complete plan)

## Files Created/Modified

- `src/sim/content/physics.ts` (modified) — `GROUP_BIT_COUNT` / `GROUP_MEMBERSHIP_BITS_PER_UNIT` / `GROUP_UNIT_CAPACITY` replace `GROUP_COUNT` / `GROUP_UNIT_MEMBERSHIP`; the 16-bit member width is no longer described as a Rapier hard limit.
- `src/sim/world/composite.ts` (modified) — module-level `enumerateMembershipPool()` + capacity/pool consistency guard; `membership`/`freeMasks` fields; live-pool `unitMembership`; mask release in `despawn`; optional `restoredUnits` constructor arg + `reseed`.
- `src/sim/battle-sim.ts` (modified) — `restore()` builds the restored live-unit map from `store.ids()` and passes it to the factory; new public `BattleSim.despawn(entityId)` (+ `IBattleSim` entry).
- `tests/sim/physics-composite.test.ts` (modified) — added Tests A–D (aliasing-family collision, multi-bit same-unit safety, factory-level restore rehydration, BattleSim-level `restore → despawn → spawn` glue); rig fields switched to interface types (IN-04).
- `tests/sim/collision-groups.test.ts` (created) — the `>16`-concurrent-unit regression, exhaustion, release, and order-stability suite.

## Final membership encoding

- **Bits per unit:** `GROUP_MEMBERSHIP_BITS_PER_UNIT = 2` (distinct 2-bit masks).
- **Capacity:** `GROUP_UNIT_CAPACITY = 120` (`C(16, 2)`).
- **Pool order:** ascending combination order over the 16 bit positions — `[(0,1),(0,2),…,(0,15),(1,2),…,(13,15),(14,15)]`; `pop` allocates from the end, `push` returns masks on `despawn`.
- **Encoding (unchanged):** `members = mask & GROUP_MASK_ALL`; `filter = filterMask & ~mask & GROUP_MASK_ALL`; `groups = (members << 16) | filter`. Interact iff `((a >>> 16) & b) !== 0 && ((b >>> 16) & a) !== 0`.
- **Exhaustion message:** `collision groups exhausted: cannot spawn more than 120 live units`.
- **Capacity guard message:** `collision groups: membership pool length <N> != GROUP_UNIT_CAPACITY 120`.

## Decisions Made

- Distinct 2-bit masks (capacity 120) rather than a single-bit live pool (capacity 16) — the 20-unit target cannot be met at 16, and 2-bit masks keep one mechanism (a free-list + one enumeration helper), honouring D-36 (no new abstraction layer).
- Free-list is LIFO (`pop`/`push`); order-stable for identical sequences, so determinism is unaffected.
- The capacity/pool guard is an import-time equality assertion rather than relocating `GROUP_UNIT_CAPACITY`, keeping the content module import-free pure data.

## Deviations from Plan

None - plan executed exactly as written. (The test rig's fields were switched from class-typed to interface-typed per project-locked rule #2 / review IN-04, which the plan's style directive already required.)

## Issues Encountered

None. `pnpm run typecheck` (both tsconfigs), `pnpm run lint`, `pnpm gate` (14 tests), and `pnpm test` (15 files / 99 tests) are all green.

## Threat Flags

None — no new network endpoint, auth path, file-access pattern, or trust boundary was introduced. The change hardens the existing `caller → CompositeFactory.spawn` boundary (fail-loud exhaustion) and the `snapshot bytes → restore` boundary (throws on a restored unit without a body collider), matching the plan's threat register (T-02-06/07/08).

## Next Phase Readiness

- The D-27 must-have truth now holds beyond 16 concurrent units, so the previously-failed Phase-2 must-have is satisfied; re-verification should flip truth #25 from FAILED to VERIFIED.
- `BattleSim.despawn(entityId)` is the lifecycle entry Phase 4 unit-death reuses; the factory's `restoredUnits` constructor arg is the seam for any future restore path.
- Still deferred (unchanged, out of scope): WR-02 `driveSwing` wiring (Phase 4), WR-05 part-map ordering (snapshot canonicality pass), WR-04 `bodyHandle ?? 0` fallback (pre-existing; the new re-seed adds a defensive throw), and >120 concurrent units (fails loud, unsupported).

---

*Phase: 02-physics-composite-units*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Created file verified on disk: `tests/sim/collision-groups.test.ts`.
- Modified files verified on disk: `src/sim/world/composite.ts`, `src/sim/content/physics.ts`, `src/sim/battle-sim.ts`, `tests/sim/physics-composite.test.ts`.
- Summary verified on disk: `.planning/phases/02-physics-composite-units/02-06-SUMMARY.md`.
- Commits verified: `6f6d659` (RED), `2466133` (GREEN), `17001a6` (Task 2). `commits=3` measured from `plan_head_before=6e14c4c…`.
- `pnpm run typecheck` (both tsconfigs) exit 0; `pnpm run lint` exit 0; `pnpm gate` 14 passed; `pnpm test` 15 files / 99 tests passed.
