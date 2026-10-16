---
phase: 02-physics-composite-units
plan: 04
subsystem: physics
tags: [rapier2d, wasm, composite-rig, collision-groups, interaction-groups, ccd, lifecycle, despawn, deterministic, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-physics-composite-units
    provides: "verified tracer: PhysicsWorld/CompositeFactory/ContactBridge + typed part-tagged IContactEvent + direct swing drive (02-02)"
  - phase: 02-physics-composite-units
    provides: "Rapier wired into BattleSim + snapshot v3 + IPhysicsWorld-owned part map (02-03)"
  - phase: 02-physics-composite-units
    provides: "exact-pinned deterministic Rapier build + initPhysics() + single-source physics constants (02-01)"
provides:
  - "CompositeFactory (full): data-driven `{ weapons: [...], armors: [...] }` arrays (D-26); N weapons as separate jointed bodies + N armor colliders tagged with ArmorSubtype"
  - "unit-level InteractionGroups (D-27): all parts of one unit share one membership bit; each part's filter excludes it — intra-unit non-damaging, enemy units still collide"
  - "ordered lifecycle: despawn(entityId) removes weapon bodies then the body (each carrying its colliders + revolute joints) and unregisters every part handle (T-02-01)"
  - "IPhysicsWorld.unregisterPart + UnregisterCollider callback: the part map gains a removal path so despawn leaves no dangling handle"
  - "CCD hardening: setCcdEnabled(true) on weapon bodies + world.maxCcdSubsteps; tests/sim/ccd.test.ts proves the with/without-CCD hit contrast (240 m/s vs 0.06 m thin dynamic target)"
  - "sustained swing: driveSwing keeps the direct angular drive (θ' = A·ω·cos(tick·ω·dt)); tests/sim/physics-composite.test.ts asserts a real oscillation (≥2 sign changes, amplitude + tail sustained)"
affects: [02-05, phase-3-content-tables, phase-4-unit-ai, phase-5-render]

# Actuals (#2632) — pairs with the plan's `estimate` (26000 tokens / 1 task / confidence low).
actuals:
  tokens: 5147
  tasks: 1
  commits: 2
plan_head_before: d92125b6fd3a8fe2ec3b9004fd6bf1e9635b697d

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unit-level collision filtering via Rapier InteractionGroups: membership = GROUP_UNIT_MEMBERSHIP << ((entityId-1) % GROUP_COUNT); filter = mask & ~membership; encoded (membership<<16)|filter (D-27)"
    - "Ordered lifecycle: factory keeps a lookup-only Map<EntityId, IUnitPhysics>; despawn removes weapon bodies then the body (Rapier cascades colliders + joints) and unregisters every handle first (T-02-01)"
    - "Part-map removal path: IPhysicsWorld.unregisterPart + UnregisterCollider callback (register/unregister symmetry for the colliderHandle->IUnitPartRef map)"
    - "Direct angular swing drive (setAngvel from a tick-derived phase) retained over the joint motor (D-36) — the motor only reaches a constant angular velocity, not a reciprocating swing"

key-files:
  created:
    - tests/sim/physics-composite.test.ts
    - tests/sim/ccd.test.ts
  modified:
    - src/sim/world/composite.ts
    - src/sim/world/physics-world.ts
    - src/sim/content/physics.ts
    - src/sim/battle-sim.ts
    - tests/helpers/run-physics.ts

key-decisions:
  - "Swing drive FINAL CHOICE: direct angular drive (not the D-24 joint motor). A bounded motor sweep (AccelerationBased f=1/100/1000, ForceBased f=100/10000, target 6/60 rad/s) showed the motor driving the weapon to a CONSTANT angular velocity (e.g. 1.6366 rad/s) — no reciprocating oscillation. The direct drive yields θ' = A·ω·cos(tick·ω·dt): 5 sign changes / 150 ticks, peak 6.2832 rad/s, undamped tail 6.2796 — a sustained swing (D-36 reversible simplification)."
  - "Same-unit non-collision is now enforced by unit-level InteractionGroups alone; the tracer's joint.setContactsEnabled(false) was removed so there is ONE mechanism (the 2-weapon test is the load-bearing proof — no joint covers weapon↔weapon)."
  - "Collision-group encoding: membership = GROUP_UNIT_MEMBERSHIP << ((entityId - 1) % GROUP_COUNT=16) masked to the 16-bit field; body filter = GROUP_MASK_ALL & ~membership, weapon/armor filter = GROUP_MASK_ENEMY & ~membership; encoded as (membership << 16) | filter."
  - "despawn removes in fixed order weapon-bodies-then-body, each after unregistering its colliders, so Rapier arena operations stay deterministic (Pitfall 3); unknown entityId is an explicit no-op (matches IEntityStore.despawn)."
  - "CCD test parameters: projectile at 240 m/s from x=-1 to a 0.06 m-thick (halfX 0.03) DYNAMIC target at x=+1 over 12 steps — with CCD exactly 1 hit, without CCD 0 hits (study Pitfall 4 contrast reproduced)."

patterns-established:
  - "InteractionGroups is a single number: high 16 bits membership, low 16 bits filter; interact iff ((a>>16)&b)!=0 && ((b>>16)&a)!=0 — the 16-bit membership field caps distinct unit groups at GROUP_COUNT=16"
  - "TDD on a TS physics factory: write the behavioral spec first (RED), let vitest/esbuild strip types so assertion failures surface (not just type errors), then implement (GREEN)"

requirements-completed: [PHYS-01, PHYS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "CompositeFactory accepts `{ weapons: [...], armors: [...] }` arrays (D-26): a unit with 2 weapons + 2 armors spawns 1 body + 2 armor colliders + 2 jointed weapon bodies, each armor collider tagged with its ArmorSubtype, and every collider handle resolves via the part map."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#spawns N weapons + N armors and resolves every handle to its part/subtype (D-26)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unit-level InteractionGroups (D-27) keep all parts of one unit mutually non-damaging while enemy units still collide; COLLISION_EVENTS is set only on weapon/armor/body colliders."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#same-unit parts do not produce damaging contacts with each other (D-27)"
        status: pass
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#enemy units still collide (D-27)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ordered lifecycle: despawn(entityId) removes the unit's weapon bodies and body (each carrying its colliders + revolute joints) and unregisters every part handle, leaving no dangling handle (T-02-01)."
    requirement: "PHYS-01"
    verification:
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#despawn removes the body, colliders and joint and leaves no dangling handle (T-02-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "CCD is enabled on weapon bodies; a fast weapon (240 m/s) vs a thin (0.06 m) dynamic target registers exactly one hit with CCD and zero without (Pitfall 4)."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/sim/ccd.test.ts#fast weapon vs thin dynamic target — CCD enabled → 1 hit(s) / CCD disabled → 0 hit(s)"
        status: pass
      - kind: unit
        ref: "tests/sim/ccd.test.ts#CompositeFactory enables CCD on weapon bodies (Pitfall 4)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The weapon's angular velocity oscillates continuously over N steps (a real sustained swing), not a one-step spike decaying to 0 (D-25)."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/sim/physics-composite.test.ts#weapon swings continuously — sustained oscillation, not a one-step spike (D-25)"
        status: pass
    human_judgment: false

# Metrics
duration: 10 min
completed: 2026-10-16
status: complete
---

# Phase 2 Plan 04: Full Composite Factory (Arrays, Unit Groups, Lifecycle, CCD, Swing) Summary

**The tracer's single-weapon slice grew into the full data-driven composite factory: arbitrary `{ weapons, armors }` arrays with `ArmorSubtype`, unit-level `InteractionGroups` (same-unit parts non-damaging, enemy units still colliding), an ordered `despawn` that removes bodies/colliders/joints and unregisters every part handle, CCD-enabled weapon bodies with a verified with/without-CCD tunneling contrast, and a *sustained* reciprocating swing — driven by the D-36 direct angular drive after a bounded joint-motor sweep failed to oscillate.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-16T15:52:00Z (approx)
- **Completed:** 2026-10-16T16:03:17Z
- **Tasks:** 1 (single `type="auto" tdd="true"` task)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- **Data-driven arrays (D-26):** `CompositeFactory.spawn` builds N weapon bodies (each its own dynamic body + capsule + 2-anchor revolute joint) and N armor colliders (tagged `ArmorSubtype.Helmet`/`Shield`) on the body rigid body; the `ICompositeSpec.weapons`/`armors` array shape was already frozen by the tracer and is now exercised with 2+2 parts.
- **Unit-level collision groups (D-27):** every collider gets `setCollisionGroups` built from the unit's membership bit. Same-unit parts share a membership bit and exclude it in their filter → no intra-unit damaging contacts; different units have different bits → they still collide. `ActiveEvents.COLLISION_EVENTS` is set only on weapon/armor/body colliders.
- **Ordered lifecycle + part-map removal:** `despawn(entityId)` removes each weapon body then the body (Rapier cascades each body's colliders and revolute joints), after unregistering every collider handle via the new `IPhysicsWorld.unregisterPart`. Unknown ids are an explicit no-op. No dangling part-map handle remains (T-02-01).
- **CCD hardening (Pitfall 4 / PHYS-03):** weapon bodies are `setCcdEnabled(true)`; `PhysicsWorld` already sets `maxCcdSubsteps`. `tests/sim/ccd.test.ts` reproduces the verified contrast — a 240 m/s projectile vs a 0.06 m-thick *dynamic* target yields 1 hit with CCD and 0 without.
- **Sustained swing (D-25):** `driveSwing` keeps the direct angular drive; the swing test proves oscillation (≥2 sign changes over 150 ticks, peak ≈ 6.2832 rad/s, undamped tail ≈ 6.2796) rather than a one-step spike.

## Swing-drive outcome (motor vs direct — D-24 / D-36)

A bounded **joint-motor sweep** was run first (the D-24 literal mechanism) on the composite rig:

| Motor model | factor | target | result (weapon angvel over 60 steps) |
|-------------|--------|--------|--------------------------------------|
| AccelerationBased | 1 | 6 | ramps 0.027 → 1.033 (never reaches target, no oscillation) |
| AccelerationBased | 100 / 1000 | 6 | saturates to a **constant** 1.6366 |
| ForceBased | 100 / 10000 | 6 | saturates to a **constant** 1.6366 |
| ForceBased | 10000 | 60 | saturates to a **constant** 16.3658 |

The motor drives the weapon to a **constant angular velocity** (sustained rotation, not a reciprocating swing); no factor/model in the sweep produced an oscillation. **Decision: fall back to the direct angular drive** (`θ' = A·ω·cos(tick·ω·dt)`), documented as a D-36 reversible simplification. Measured direct-drive series: 5 sign changes / 150 ticks, `max|ω| = 6.2832`, last-quarter `max|ω| = 6.2796` (no decay).

## Collision-group encoding

`InteractionGroups` is one 32-bit number: high 16 bits **membership**, low 16 bits **filter**; interaction allowed iff `((a>>16)&b)!=0 && ((b>>16)&a)!=0`.

```
membership = GROUP_UNIT_MEMBERSHIP << ((entityId - 1) % GROUP_COUNT)   // GROUP_UNIT_MEMBERSHIP=0x0001, GROUP_COUNT=16
bodyGroups = (membership << 16) | (GROUP_MASK_ALL  & ~membership)      // body  collider
partGroups = (membership << 16) | (GROUP_MASK_ENEMY & ~membership)     // weapon/armor colliders
```
Same unit ⇒ same membership bit, and each part's filter excludes that bit ⇒ intra-unit non-collision. Different units ⇒ different bits ⇒ collision. The 16-bit membership field caps distinct unit groups at `GROUP_COUNT = 16` (Rapier limit).

## CCD test parameters

- Projectile: capsule, start x = -1 m, **240 m/s** along +x.
- Target: **dynamic** cuboid, half-thickness **0.03 m** (0.06 m thick), half-height 0.5 m, at x = +1 m.
- 12 fixed steps of `FIXED_DT = 1/60`.
- Result: **CCD on → exactly 1 hit; CCD off → 0 hits** (tunneling).

## Task Commits

The single `tdd="true"` task produced two atomic commits on `master`:

1. **Task 1 (RED): failing spec for full composite factory (arrays, groups, despawn, CCD, swing)** — `714769a` (test)
2. **Task 1 (GREEN): full composite factory — arrays, unit-level collision groups, ordered despawn, CCD-enabled weapons** — `018fcd6` (feat)

**Plan metadata:** `(this commit)` (docs: complete plan)

## TDD Gate Compliance

- **RED:** `714769a` (`test(02-04):`) — 6 passed / 2 failed. The named target *"same-unit parts do not produce damaging contacts"* **failed on an assertion** (one same-unit contact was emitted without groups); *"despawn ..."* failed (`despawn` not yet implemented). Not INVALID_RED (an assertion failure on the planned behavior, not a load/syntax error).
- **GREEN:** `018fcd6` (`feat(02-04):`) — all 8 new tests pass.
- **REFACTOR:** none — the GREEN implementation was already minimal/clean; no refactor commit produced.
- `workflow.tdd_mode` is `false` in `.planning/config.json`, so the formal `check tdd-red-evidence` gate was not enforced; the RED/GREEN sequence was followed manually.

## Files Created/Modified
- `tests/sim/physics-composite.test.ts` (created) — 5 tests: array assembly + part resolution, same-unit non-damage, enemy collision, ordered despawn + no dangling handle, sustained swing.
- `tests/sim/ccd.test.ts` (created) — CCD with/without contrast (parametrized) + factory-enables-CCD.
- `src/sim/world/composite.ts` (modified) — array spec build-out, unit `InteractionGroups`, `despawn`, `units` lookup index; `spawn`/`driveSwing` signatures preserved.
- `src/sim/world/physics-world.ts` (modified) — `IPhysicsWorld.unregisterPart` (+ impl) so `despawn` clears the part map.
- `src/sim/content/physics.ts` (modified) — added `GROUP_COUNT = 16` (single-source membership-field width).
- `src/sim/battle-sim.ts` (modified) — pass the `unregister` callback when (re)building the factory.
- `tests/helpers/run-physics.ts` (modified) — pass the `unregister` callback.

## Decisions Made
- **Swing drive = direct angular drive** (motor sweep non-oscillating) — see the outcome table above.
- **Single same-unit mechanism:** removed the tracer's `joint.setContactsEnabled(false)`; the unit-level groups now cover body↔weapon *and* weapon↔weapon (the 2-weapon test is the load-bearing proof).
- **Part-map removal path:** added `IPhysicsWorld.unregisterPart` and threaded an `UnregisterCollider` callback through the factory constructor (required, not optional — no silent no-op on the physics path).
- **despawn order:** weapon bodies → body; each removed only after its collider handles are unregistered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] No part-map removal path existed for `despawn` (T-02-01)**
- **Found during:** Task 1 (despawn design)
- **Issue:** The plan requires `despawn` to unregister every handle it removes (no dangling part-map handle), but `IPhysicsWorld`/`ContactBridge` only exposed `register`/`lookup` — the map is owned by `PhysicsWorld` and had no removal path.
- **Fix:** Added `IPhysicsWorld.unregisterPart(handle)` (+ impl); added a required `UnregisterCollider` constructor callback to `CompositeFactory`; updated the two factory construction sites (`battle-sim.ts`, `tests/helpers/run-physics.ts`) to pass `handle => physics.unregisterPart(handle)`.
- **Files modified:** `src/sim/world/physics-world.ts`, `src/sim/world/composite.ts`, `src/sim/battle-sim.ts`, `tests/helpers/run-physics.ts`
- **Verification:** `tests/sim/physics-composite.test.ts#despawn ...` asserts every removed handle resolves to `null`; collider/body/joint counts drop exactly.
- **Committed in:** `018fcd6` (Task 1 GREEN)

**2. [Rule 2 - Missing Critical] `InteractionGroups` membership field needed a single-source width constant**
- **Found during:** Task 1 (collision-group encoding)
- **Issue:** The unit membership bit must wrap within the 16-bit membership field (`(entityId-1) % 16`), but no such constant existed and inline literals are barred on the physics path (T-02-04).
- **Fix:** Added `GROUP_COUNT = 16` to `src/sim/content/physics.ts` (single source) with a JSDoc note on the Rapier limit.
- **Files modified:** `src/sim/content/physics.ts`
- **Verification:** `pnpm run typecheck`/`lint` green; group tests green.
- **Committed in:** `018fcd6` (Task 1 GREEN)

**3. [Rule 2 - Missing Critical] `ICompositeFactory` needed the `despawn` lifecycle entry**
- **Found during:** Task 1 (lifecycle requirement)
- **Issue:** The plan's must-have requires `despawn(entityId)`, but the tracer-frozen interface only had `spawn`/`driveSwing`.
- **Fix:** Added `despawn(entityId)` to `ICompositeFactory`; `spawn`/`driveSwing` signatures left **byte-identical** to the tracer (the freezer constraint) so 02-03's wiring and the physics gate are unaffected.
- **Files modified:** `src/sim/world/composite.ts`
- **Verification:** full suite green (81 tests); the tracer determinism gate unchanged.
- **Committed in:** `018fcd6` (Task 1 GREEN)

---

**Total deviations:** 3 auto-fixed (3 × Rule 2 — missing critical functionality)
**Impact on plan:** All three are correctness/verifiability requirements the plan itself mandates (T-02-01 part-map cleanup, T-02-04 single-source group constants, the D-26 lifecycle entry). Files touched beyond `files_modified` (physics-world.ts, content/physics.ts, battle-sim.ts, run-physics.ts) are minimal, additive wiring for the unregister path and one constant — no new abstraction layers, no content pipeline, no change to the tracer-frozen `spawn`/`driveSwing` signatures.

## Issues Encountered
None. `pnpm run typecheck` (both tsconfigs), `pnpm run lint`, `pnpm gate`, and `pnpm test` (13 files / 81 tests) are all green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The composite factory is now fully data-driven and lifecycle-complete; Phase 3's class/equipment tables can drop in as `{ weapons, armors }` arrays without a rewrite (D-26).
- **For 02-05 (hardening):** contact-semantics and snapshot-hardening tests; the part-map unregister path (`IPhysicsWorld.unregisterPart`) is now available for `despawn`-then-snapshot scenarios.
- **Known limit:** unit-level grouping uses the 16-bit `InteractionGroups` membership field, so at most `GROUP_COUNT = 16` distinct unit groups coexist; more units would reuse a membership bit and be treated as same-unit. Phase 3+ should revisit if unit counts exceed 16.
- The direct angular swing drive is final for Phase 2; if D-24's motor is revisited later, an oscillating motor *target* (not a fixed one) would be required to produce a reciprocating swing.

## Self-Check: PASSED

- Created files verified on disk: `tests/sim/physics-composite.test.ts`, `tests/sim/ccd.test.ts`, `02-04-SUMMARY.md`.
- Modified files verified on disk: `src/sim/world/composite.ts`, `src/sim/world/physics-world.ts`, `src/sim/content/physics.ts`, `src/sim/battle-sim.ts`, `tests/helpers/run-physics.ts`.
- Commits verified: `714769a` (RED), `018fcd6` (GREEN). `commits=2` measured from `plan_head_before=d92125b…`.
- `pnpm run typecheck` (both tsconfigs) exit 0; `pnpm run lint` exit 0; `pnpm gate` 14 passed; `pnpm test` 13 files / 81 tests passed.
- Acceptance greps: `setCcdEnabled(true)` on weapon bodies; `setActiveEvents(COLLISION_EVENTS)` only on body/armor/weapon colliders; `setCollisionGroups` on all three collider types; `setContactsEnabled` no longer present (single unit-group mechanism).

---
*Phase: 02-physics-composite-units*
*Completed: 2026-10-16*
