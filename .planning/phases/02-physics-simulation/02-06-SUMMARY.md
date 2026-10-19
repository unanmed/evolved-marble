---
phase: 02-physics-simulation
plan: 06
subsystem: physics
tags: [rapier, damage-event, delta-v, armor-reduction, per-pair-exclusivity, pre-step-velocity, d08, d11, d13, phys-03, phys-04, phys-05]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "frozen WEAPON_DEFS/ARMOR_DEFS (penetration table + defenseRatio) and WeaponKind/ArmorKind"
  - phase: 02-physics-simulation (wave 1, 02-02)
    provides: "frozen src/physics/types.ts (ColliderPart, IDamageEvent, IPhysicsTickResult)"
  - phase: 02-physics-simulation (wave 2, 02-03)
    provides: "pure damage/armor math (computeDamageMean, rollDamage, computeDamageReduction, isDamageBearingPair)"
  - phase: 02-physics-simulation (wave 2, 02-04)
    provides: "PhysicsWorld compound body + collider-handle index + fixed-step tick() + stored #rng"
  - phase: 02-physics-simulation (wave 3, 02-05)
    provides: "tick() contact bridge: started IContactEvent[] from a drained EventQueue"
provides:
  - "src/physics/PhysicsWorld.ts — tick() snapshots pre-step velocities, fetches the world-space contact normal via contactPair, and emits part-tagged IDamageEvent[] with FINAL damage/damageReduced, deduped once per (attackerId, defenderId) per tick with armor-beats-body precedence"
  - "tests/physics/tick.test.ts — integration proof: weapon-body vs weapon-armor, formula agreement, weapon-weapon immunity, one-strike/one-damage exclusivity with observed co-occurrence, and one-step advance"
affects: [03-control, 04-kingdom, 05-rendering]

# Actuals (#2632) — pairs with the plan's `estimate` (tokens: 40000, tasks: 2).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 6010
  tasks: 2
  commits: 2
  plan_head_before: 53bf990ec943aad88e50adf5c17fc22509574c94

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Δv from PRE-step velocities: tick() snapshots each body's linvel before world.step, then projects the pre-step relative velocity onto the world-space normal (D-08; research Pitfall 6) — post-step velocity would understate damage to ≈0"
    - "contact normal copied INSIDE the world.contactPair closure (the manifold is temporary; never retained — research Pitfall 2); a pair whose colliders no longer resolve is skipped"
    - "attacker = the collider side whose part is Weapon; defender = the other side (Body or Armor); damage-bearing gate = isDamageBearingPair (excludes body↔body and weapon↔weapon, D-13/OQ-4)"
    - "armor hit: armorKind from the struck armor collider's tag, penetration = weapon.penetration[armorKind], damageReduced = computeDamageReduction(...) (D-11 sign-consistent); body hit: armorKind undefined, damageReduced 0 (击中本体不减伤)"
    - "per-tick per-(attackerId, defenderId) damageCandidates map: armor candidate replaces body candidate (armor wins); a later body candidate after an armor candidate is discarded; two-armor keep larger damageReduced (tie-break smaller armorKind) — exactly one damage event per pair per tick; contacts stay complete"
    - "finite/non-negative guard: a non-finite projected Δv is coerced to 0 so NaN/Infinity never leaves the physics layer (T-02-16)"

key-files:
  created:
    - tests/physics/tick.test.ts
  modified:
    - src/physics/PhysicsWorld.ts

key-decisions:
  - "Δv is linear-only (no ω×r angular term) — the CONTEXT-authorized calibrated simplification (research A2); the snapshot is keyed by unit id and defaulted to {0,0} when absent."
  - "Damage dedup applies to `damages` only — `contacts` still reports every started cross-unit pair (both the armor and body contacts), so no contact information is lost."
  - "Precedence is order-independent: armor always beats a co-occurring body hit for the same pair in one step, and two armor hits resolve on the larger damageReduced with a smaller-armorKind tie-break."
  - "The one-strike window is per tick: the same pair may legitimately damage again on a later tick (a new started transition); no cross-tick suppression exists or is asserted."
  - "The test recomputes computeDamageMean from the event's OWN deltaV and computeDamageReduction from (damage + damageReduced), asserting formula agreement without depending on the jitter draw."

patterns-established:
  - "The damage event carries FINAL numbers; the caller (Phase 3/4) applies them to Units. Physics still holds ids/numbers only — no Unit reference in the module (D-09/D-14)."
  - "Integration tests drive units to collision over a bounded tick loop and locate the event by (attackerId, defenderId) + part — never assuming the unordered A/B contact order."

requirements-completed: [PHYS-03, PHYS-04]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "tick() computes Δv from pre-step velocities + the world-space contact normal (copied inside the contactPair closure), runs it through the pure damage module, and emits part-tagged IDamageEvent[] with FINAL damage/damageReduced — armor hits reduce via weapon.penetration[armorKind] + armor defenseRatio, body hits do not; at most one event per (attackerId, defenderId) per tick with armor-beats-body precedence; contacts remain complete"
    requirement: PHYS-03
    verification:
      - kind: other
        ref: "node presence check over PhysicsWorld.ts (contactPair/manifold.normal/preVelocities/computeDamageMean/rollDamage/isDamageBearingPair/IDamageEvent/damageReduced/damageMean/damageCandidates/ColliderPart.Armor) -> DAMAGES_OK"
        status: pass
      - kind: other
        ref: "pnpm typecheck -> exit 0"
        status: pass
      - kind: integration
        ref: "pnpm test -- tests/physics/tick.test.ts (1 file, 5 tests) green"
        status: pass
    human_judgment: false
  - id: D2
    description: "tests/physics/tick.test.ts proves the damage integration end-to-end: a weapon↔body hit (no armorKind, damageReduced 0), a weapon↔armor hit (defined armorKind, damageReduced>0 matching computeDamageReduction), a high-speed armored strike where the enclosed body is struck in the same step as the armor and exactly one (armor) damage event is emitted with observed co-occurrence, a weapon↔weapon pair emitting a contact but zero damage, and a one-step velocity advance"
    requirement: PHYS-04
    verification:
      - kind: unit
        ref: "tests/physics/tick.test.ts#emits a Weapon↔Body damage event for an unarmored hit — no armorKind, zero reduction, finite non-negative numbers"
        status: pass
      - kind: unit
        ref: "tests/physics/tick.test.ts#emits a Weapon↔Armor damage event for an armored hit — defined armorKind, positive reduction matching the formula"
        status: pass
      - kind: unit
        ref: "tests/physics/tick.test.ts#emits exactly one damage event per pair per tick and lets the armor hit win over the enclosed body hit"
        status: pass
      - kind: unit
        ref: "tests/physics/tick.test.ts#emits no damage for a weapon↔weapon contact even though the contact is reported"
        status: pass
      - kind: unit
        ref: "tests/physics/tick.test.ts#advances exactly one fixed step: vx ≈ force/mass × DT, then repeated ticks advance the position"
        status: pass
      - kind: integration
        ref: "pnpm test (14 files, 110 tests) green; pnpm lint exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-19
status: complete
---

# Phase 2 Plan 06: Damage Pipeline — Δv → IDamageEvent Summary

**`tick()` completes the physics event pipeline: it snapshots every unit's PRE-step linear velocity, fetches the world-space contact normal via `world.contactPair`, and emits part-tagged `IDamageEvent`s carrying FINAL `damage`/`damageReduced` — one event per `(attackerId, defenderId)` per tick, with a co-occurring armor hit beating the enclosed body hit so a single strike never double-counts nor bypasses armor.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-10-19T14:23Z (test commit `6c5cf55`)
- **Tasks:** 2 (Task 1 committed by the prior attempt as `ac03c40`; this continuation wrote, proved, and committed Task 2)
- **Files modified:** 2 (`src/physics/PhysicsWorld.ts` +176/−7; `tests/physics/tick.test.ts` new, 361 lines)

## Accomplishments

- **`src/physics/PhysicsWorld.ts`** (Task 1, `ac03c40`) — `tick()` still performs exactly one `world.step(#eventQueue)`, but now (a) snapshots each body's `linvel()` into `#preVelocities` **before** the step (the Δv source; post-step velocity is the documented Pitfall-6 bug), and (b) while draining started collisions, computes a damage candidate for every damage-bearing pair. The world-space normal is read via `world.contactPair(...)` and its `x`/`y` are copied **inside** the closure (the manifold is temporary, Pitfall 2); a pair whose colliders no longer resolve is skipped. `deltaV = |(vAttacker − vDefender)·n|` from pre-step velocities, coerced to 0 if non-finite. `damageMean = computeDamageMean(attack, weaponRatio, weapon.attackRatio, deltaV)`; the jitter is `rollDamage(#rng, damageMean)` (shared `sampleNormal`, σ = mean/20). Armor hits look up `weapon.penetration[armorKind]` and `armorDef.defenseRatio` to apply `computeDamageReduction`; body hits keep `armorKind` `undefined` and `damageReduced` 0. Candidates go into a per-tick `Map` keyed by `(attackerId, defenderId)` with armor-beats-body precedence (a later body candidate after an armor candidate is discarded; two armor hits keep the larger `damageReduced`, tie-breaking on the smaller `armorKind`). Only after the drain completes are the map's values pushed into `damages`; `contacts` stays complete.
- **`tests/physics/tick.test.ts`** (Task 2, `6c5cf55`) — 5 integration tests after `await RAPIER.init()` in `beforeAll`, each `PhysicsWorld` disposed in `afterEach`: (1) a hammer/longsword-driven strike on an **unarmored** defender yields a `Weapon↔Body` event with `armorKind` undefined, `damageReduced` 0, finite non-negative `deltaV`/`damageMean`/`damage`, and `damageMean` recomputed from the event's own `deltaV`; (2) a strike on a **helmeted** defender yields a `Weapon↔Armor` event with `armorKind === Helmet` and `damageReduced > 0` matching `computeDamageReduction(damage + damageReduced, …)`; (3) a heavy attacker driven to ≈20 m/s into an armored defender: **every** tick asserts `pairEvents.length <= 1`, and on a tick whose contacts contain BOTH `Weapon↔Armor` and `Weapon↔Body` for the pair it asserts exactly one event, `defenderPart === Armor`, a defined `armorKind`, `damageReduced > 0`, and no `Body` event — with `coOccurrenceSeen === true` required after the loop; (4) two side-by-side weapon owners whose capsules overlap produce a `Weapon↔Weapon` contact but **zero** damage events; (5) a lone bare unit: one `applyForce` + one `tick()` gives `vx ≈ force/mass × DT` via `toBeCloseTo`, then repeated ticks advance the position monotonically.
- The frozen `src/physics/types.ts` and `src/physics/damage.ts` were **not** modified — the implementation matched the committed Task-1 code, so no deviation was needed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compute Δv and emit IDamageEvent from tick()** - `ac03c40` (feat) — committed by the prior attempt
2. **Task 2: Add `tests/physics/tick.test.ts` — damage integration and one-step semantics** - `6c5cf55` (test)

**Plan metadata:** this docs commit (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

- `src/physics/PhysicsWorld.ts` (modified, +176/−7) — pre-step velocity snapshot, `contactPair` normal fetch (copied inside the closure), damage-bearing classification, `computeDamageMean`→`rollDamage`→armor reduction or none, per-pair `damageCandidates` dedup with armor precedence; `#rng` stored for the jitter (`#preVelocities`/`#rng` placeholders from 02-04/02-05 now consumed)
- `tests/physics/tick.test.ts` (new, 361 lines) — 5 tests; imports `RAPIER`, `PhysicsWorld`, `ColliderPart`, `DT`/`DEFAULT_GEOMETRY`, `computeDamageMean`/`computeDamageReduction`, `WEAPON_DEFS`/`ARMOR_DEFS`, `mulberry32`; no `Unit` import (D-07)

## Decisions Made

- Damage dedup applies to `damages` only; `contacts` still reports both the armor and body contacts for a co-occurring strike (per plan 02-06's exclusivity guard).
- `deltaV` is linear-only (no angular `ω×r` term) per the CONTEXT-authorized calibrated simplification (research A2).
- Precedence is order-independent (armor over body; larger `damageReduced` then smaller `armorKind` for two armor hits), so the emitted event does not depend on the drain order.
- The exclusivity invariant is per tick only; the test asserts no cross-tick suppression, matching the plan (a new `started` transition may legitimately damage again later).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier formatting of the `touchesPair` call in the weapon↔weapon test**
- **Found during:** Task 2 (`tick.test.ts`) lint gate
- **Issue:** The first draft wrapped `touchesPair(contact, 1, 2, …)` across multiple lines inside `.some(contact => …)`; `eslint-plugin-prettier` required it on a single line (1 prettier/prettier error).
- **Fix:** Re-flowed the call to one line (fits within the 80-col `printWidth` at that indentation).
- **Files modified:** `tests/physics/tick.test.ts`
- **Verification:** `pnpm lint` exits 0; `pnpm test -- tests/physics/tick.test.ts` (5 tests) green.
- **Committed in:** `6c5cf55` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — formatting only, no behavior change)
**Impact on plan:** None on design or scope; the plan executed as written.

## Proxy for the prior attempt

Task 1's implementation (`src/physics/PhysicsWorld.ts`) was already committed (`ac03c40`) before this continuation. This run only had to write, prove, and commit Task 2. The implementation was **not** touched: the test was written against the committed code and passed on the first run (no implementation bug surfaced), so the hard constraint to avoid modifying `types.ts`/`damage.ts`/`PhysicsWorld.ts` was respected.

## Issues Encountered

None functional. All gates green: `pnpm test -- tests/physics/tick.test.ts` (1 file / 5 tests), `pnpm test` (14 files / 110 tests), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), and the Task-1 presence check prints `DAMAGES_OK`.
Environment note: `config.json` sets `git.branching_strategy: none`, `use_worktrees: false`, `mode: yolo`, so main-tree commits on `master` are the intended mode (all prior plan commits are on `master`); Task 2 used normal hooks (no `--no-verify`).

## Known Stubs

None introduced. The 02-04/02-05 placeholders (`#preVelocities` pre-step snapshot now populated; `damages: []` now emitted) are resolved by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 2 is functionally complete**: PHYS-01 (compound body), PHYS-02 (typed contacts), PHYS-03/04 (Δv + damage/armor), and PHYS-05 (fixed-step tick result) are all implemented and test-pinned.
- Phase 3 (control) drives the world via `applyForce`/`applyTorque` and reads `getUnitState`; a caller applies the emitted `IDamageEvent` numbers (`takeDamage`/`gain*Experience`) to Units — the D-07/D-09/D-14 one-way boundary is intact.
- No blockers.

## Threat Flags

None - no network/auth/file surface added. The plan's threat mitigations are implemented and pinned: T-02-16 (pre-step snapshot; normal copied in-closure; missing-collider skip; non-finite Δv coerced to 0 — asserted by the finiteness checks), T-02-17 (`armorKind` from the struck collider tag; `penetration[armorKind]` lookup; armor vs body paths asserted separately), T-02-20 (per-tick `damageCandidates` dedup with armor precedence — pinned by `pairEvents.length === 1` + armor-part), T-02-18 (no `Unit` reference in the module), T-02-19 (every test disposes its world), T-02-SC (no dependency added).

---

*Phase: 02-physics-simulation*
*Completed: 2026-10-19*

## Self-Check: PASSED

All declared files exist (`src/physics/PhysicsWorld.ts`, `tests/physics/tick.test.ts`, `02-06-SUMMARY.md`); both task commits (`ac03c40`, `6c5cf55`) are present in git history. `pnpm test -- tests/physics/tick.test.ts` (5 tests), `pnpm test` (14 files / 110 tests), `pnpm typecheck` (exit 0) and `pnpm lint` (exit 0) all pass; the Task-1 presence check prints `DAMAGES_OK`.
