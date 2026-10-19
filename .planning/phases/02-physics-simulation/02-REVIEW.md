---
phase: 02-physics-simulation
reviewed: 2026-10-19T14:38:27Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/physics/types.ts
  - src/physics/constants.ts
  - src/physics/damage.ts
  - src/physics/PhysicsWorld.ts
  - tests/physics/rapier-harness.test.ts
  - tests/physics/types.test.ts
  - tests/physics/damage.test.ts
  - tests/physics/compound.test.ts
  - tests/physics/events.test.ts
  - tests/physics/tick.test.ts
findings:
  critical: 1
  warning: 6
  info: 7
  total: 14
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-19T14:38:27Z
**Depth:** standard (with targeted runtime probes)
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 2 (Rapier2D physics layer) is, on the whole, well-built. The interface-first
conventions hold (`IPhysicsWorld` is implemented with no extra public members, numeric
`ColliderPart`, JSDoc on private members and top-level consts), the pure damage math in
`damage.ts` matches the reference formulas exactly, and the delta-V / armor-reduction /
one-strike-per-pair pipeline behaves correctly.

I verified this by running the full suite (110/110 pass), `tsc --noEmit` (clean) and
`eslint .` (clean), plus four throw-away runtime probes (since removed) that exercised
the pipeline beyond the committed tests: a slow approach never leaks an unreduced Body
hit past enclosing armor, a two-armor defender is correctly reduced by the higher-reduction
armor, and a separating spawn does not produce damage. The core algorithms are trustworthy.

No security vulnerabilities were found: the module performs no I/O, has no external input
surface, no secrets, no `eval`, and no injection path. Findings below are one lifecycle
crash plus quality/robustness/convention defects.

## Critical Issues

### CR-01: `dispose()` is not idempotent — a second call crashes with a NullPointer-style TypeError

**File:** `src/physics/PhysicsWorld.ts:384-392`
**Issue:** `dispose()` calls `this.#world.free()` / `this.#eventQueue.free()` unconditionally
and never marks itself done. `world.free()` nulls the underlying raw pointer, so a second
`dispose()` reads a property of `undefined` and throws. Reproduced at runtime:

```
double dispose -> TypeError: Cannot read properties of undefined (reading 'free')
```

This is a crash in a public lifecycle method (`IPhysicsWorld.dispose`). Any defensive/double
cleanup (e.g. a `finally` block racing a manual cleanup, a React effect cleanup, or a
test `afterEach` plus `afterAll`) will throw instead of being a no-op. Because the sim glue
in later phases owns world lifetime, this is a realistic failure.
**Fix:**
```ts
#disposed = false;

dispose(): void {
    if (this.#disposed) {
        return;
    }
    this.#disposed = true;
    this.#world.free();
    this.#eventQueue.free();
    this.#bodies.clear();
    this.#specs.clear();
    this.#colliders.clear();
    this.#index.clear();
    this.#preVelocities.clear();
}
```

## Warnings

### WR-01: Combat inputs are captured once at `registerUnit` and can never be refreshed

**File:** `src/physics/PhysicsWorld.ts:139` (with `src/physics/types.ts:166-183`)
**Issue:** `#specs.set(spec.unitId, spec)` snapshots `attack` / `weaponRatio` / `defense` /
`armorRatio` / `weapon` / `armors` by reference. `IUnitPhysicsSpec` is fully `readonly`, and
`IPhysicsWorld` exposes no update method. Consequence: when a unit levels up or unlocks
equipment (Phase 1 already models per-level `attack`/`defense` growth and equipment unlocks),
the damage the physics layer deals/receives never changes. The only workaround —
`removeUnit` + `registerUnit` — destroys the body's position and velocity, which is
unacceptable mid-battle.
**Fix:** add `updateUnit(unitId: number, spec: IUnitPhysicsSpec): void` to `IPhysicsWorld`
(and rebuild/refresh the retained spec while keeping the existing body), or have `registerUnit`
retain a caller-supplied live numeric provider instead of a frozen snapshot. This is a
contract-level gap that should be raised at the type gate.

### WR-02: delta-V ignores the weapon's rotational (omega x r) velocity

**File:** `src/physics/PhysicsWorld.ts:200-206` and `277-289`
**Issue:** `#preVelocities` snapshots only `linvel()`; the projected delta-V is
`|(vAttacker - vDefender) . n|` with no tangential term. For an offset spinning weapon the
true contact-point velocity is `v_com + omega x r`; omitting it systematically understates
(or mis-states) impact speed for rotating attacks. The code comment calls this a
"CONTEXT-authorized calibration simplification" (research A2) and CONTEXT does delegate the
"precise delta-V derivation" to the agent, so it is not a spec violation — but two of the
project's named skills (`SkillKind.Spin`, `SkillKind.Charge`) are high-rotation attacks, and
the project's core value is "battles must be fierce", so under-counted spin damage is a real
gameplay risk, not just a nicety.
**Fix:** also snapshot `body.angvel()` and add `omega x r` for the weapon/contact point
(L2 helper: `(vx - w*ry, vy + w*rx)`), or explicitly record the deferral as a tracked
calibration item with a test pinning the current behaviour.

### WR-03: Bare `catch {}` hides errors, and a missing manifold emits a spurious zero-damage event

**File:** `src/physics/PhysicsWorld.ts:261-275`
**Issue:** Two problems in the normal-fetch block:
1. `catch { return; }` swallows every error from `world.contactPair` / `world.getCollider`
   with no diagnostic — a genuine engine fault is indistinguishable from the intended
   "collider no longer resolves" case.
2. `nx`/`ny` default to `0`. If `contactPair` succeeds but never invokes the callback (the
   pair is no longer in contact), the code still builds an `IDamageEvent` with
   `deltaV = 0`, `damageMean = 0`, `damage = 0` instead of skipping the pair. The plan
   ("If either collider no longer resolves, skip the damage event for that pair") implies a
   skip, not a zero event.
**Fix:**
```ts
const collider1 = this.#world.getCollider(handle1);
const collider2 = this.#world.getCollider(handle2);
if (collider1 === undefined || collider2 === undefined) {
    return;
}
let nx = 0;
let ny = 0;
let hasNormal = false;
this.#world.contactPair(collider1, collider2, manifold => {
    const normal = manifold.normal();
    nx = normal.x;
    ny = normal.y;
    hasNormal = true;
});
if (!hasNormal) {
    return;
}
```

### WR-04: AGENTS §2 violation — structured types declared inline instead of in `types.ts`

**File:** `src/physics/PhysicsWorld.ts:55-63` and `65`
**Issue:** The `#index` map value type
(`{ unitId; part; weaponKind?; armorKind? }`) and the `#preVelocities` value type
(`{ vx; vy }`) are anonymous structural types declared inline in the class. AGENTS §2 is
mandatory: "all type declarations centralized in one `types.ts` per folder"; the phase
research (Pitfall 9) explicitly warns that §1-§6 are not lint-enforced and must be caught at
the review gate. These records are real system types (a collider tag), not local temporaries.
**Fix:** declare `IColliderTag` (and, if desired, `IVelocitySnapshot`) in
`src/physics/types.ts` with JSDoc, and use them for the private map types.

### WR-05: Every armor becomes a coincident, geometrically identical collider

**File:** `src/physics/PhysicsWorld.ts:123-136` (with `src/physics/constants.ts:33`)
**Issue:** Each equipped armor creates `ColliderDesc.ball(geometry.armorRadius)` with the same
local translation `(0, 0)`. A defender with Helmet + Shield therefore has two *exactly
coincident, identical* circles. Two consequences:
1. Duplicate narrow-phase contacts every step for the same attacker weapon (confirmed by
   probe: the same `Weapon<->Armor` pair is reported twice), doubling solver work.
2. `IContactEvent` cannot attribute which armor was struck — both report
   `part = Armor` with no `armorKind` — so a consumer cannot tell helmet from shield from the
   contact layer. The damage layer's armor-kind tie-break compensates by comparing rolled
   `damageReduced`, but that makes armor-kind selection depend on a random jitter comparison
   rather than geometry.
**Fix:** give each armor a distinct geometry (per-armor offset/rotation or radius) if armor
coverage is meant to be directional, or document explicitly that armors are intentionally
non-directional and that contact-layer armor attribution is deliberately unavailable.

### WR-06: `tick.test.ts` co-occurrence assertion is timing-dependent and brittle

**File:** `tests/physics/tick.test.ts:247-317`
**Issue:** The test hard-asserts `expect(coOccurrenceSeen).toBe(true)` after driving a hammer
attacker at force 7000 for 80 ticks. Success depends on the per-step displacement exceeding
the 0.05 m armor-body gap at the specific moment of first contact. The project explicitly
does not guarantee deterministic physics across platforms/runs ("No Determinism" constraint),
so a different machine or Rapier build can flip this assertion to a failure. The plan even
anticipates this ("if it is not observed, raise the closing speed") — but a hard assertion on
an emergent timing outcome is exactly the flaky pattern to avoid.
**Fix:** keep the per-tick `pairEvents.length <= 1` invariant (that is the real contract) and
make co-occurrence deterministic by spawning the weapon already straddling both colliders
(e.g. place the body/armor so the weapon capsule overlaps both at spawn), or downgrade
`coOccurrenceSeen` to a diagnostic rather than a pass/fail gate.

## Info

### IN-01: Dead field — `weaponKind` is stored in the index but never read

**File:** `src/physics/PhysicsWorld.ts:60, 119`
**Issue:** `#index` entries carry `weaponKind`, but the only consumer that needs a weapon kind
reads `attackerWeapon.id` (line 331). The index field is written and never read.
**Fix:** remove `weaponKind` from the index entry (and the `WeaponKind` import if nothing else
uses it), or drive `IDamageEvent.weaponKind` from the index to justify its existence.

### IN-02: `computeFinalDamage` is exported but unused in production

**File:** `src/physics/damage.ts:95-112`
**Issue:** The class inlines `damage = rolled - damageReduced` (line 320) rather than calling
`computeFinalDamage`. The function is only referenced by `tests/physics/damage.test.ts`.
**Fix:** call `computeFinalDamage` from `PhysicsWorld` (the plan states they are equivalent),
or drop the export if it is only a test fixture.

### IN-03: Vacuous assertion in `types.test.ts`

**File:** `tests/physics/types.test.ts:25-27`
**Issue:** `for (const ordinal of [0, 1, 2]) { expect(Number.isInteger(ordinal)).toBe(true); }`
asserts on literal integers and never touches the enum members; it can never fail.
**Fix:** delete the loop (the following loop over `members` is the meaningful one).

### IN-04: Tautological assertion in `tick.test.ts`

**File:** `tests/physics/tick.test.ts:227`
**Issue:** `expect(event.damage).toBeLessThan(event.damage + event.damageReduced)` is
arithmetically equivalent to the `damageReduced > 0` assertion already made on line 225.
**Fix:** remove it, or assert the intended relationship against `damageMean` instead.

### IN-05: `IPhysicsTickResult` doc says "at least one side Weapon"; implementation requires exactly one

**File:** `src/physics/types.ts:124-125`
**Issue:** The JSDoc says damage events require "at least one side is `Weapon`", but
`isDamageBearingPair` (and the tick pipeline) excludes weapon-vs-weapon, so the requirement is
*exactly* one side. The same doc’s parenthetical mentions the exclusion, but the headline
sentence is imprecise.
**Fix:** reword to "exactly one side is a `Weapon` collider".

### IN-06: RNG is consumed for damage candidates that are later discarded

**File:** `src/physics/PhysicsWorld.ts:297` (with dedup at `339-368`)
**Issue:** `rollDamage` runs for every damage-bearing contact, including Body candidates that
are replaced by an Armor hit and losing Armor candidates. The shared `IRng` stream therefore
advances for phantom hits, so how many draws a tick consumes depends on contact ordering and
on events that never materialize.
**Fix:** defer the jitter roll until after `damageCandidates` is resolved (compare on
`damageMean`/reduction factor, then roll once for the surviving candidate).

### IN-07: Magic number `100` duplicated in the reduction formula

**File:** `src/physics/damage.ts:77-82`
**Issue:** The literal `100` (from the spec’s `100 * B_A` term) is embedded twice. The file
already establishes a single-calibration-surface pattern (`DAMAGE_JITTER_SIGMA_DIVISOR`).
**Fix:** extract e.g. `export const ARMOR_PENETRATION_SCALE = 100;` with JSDoc and use it in
both places.

---

_Reviewed: 2026-10-19T14:38:27Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
