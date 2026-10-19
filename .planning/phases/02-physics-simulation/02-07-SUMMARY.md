---
phase: 02-physics-simulation
plan: 07
subsystem: physics
tags: [rapier, world-com, centre-of-mass, angular-velocity, delta-v, apply-torque, regression, phys-03, gap-g1]

# Dependency graph
requires:
  - phase: 02-physics-simulation (wave 3, 02-05)
    provides: "tick() contact bridge: started IContactEvent[] from a drained EventQueue"
  - phase: 02-physics-simulation (wave 4, 02-06)
    provides: "tick() damage pipeline: pre-step velocity snapshot + contactPair normal/point → IDamageEvent[]"
provides:
  - "src/physics/PhysicsWorld.ts — the ω×r moment arm in tick() is measured from each body's world centre of mass (worldCom()), pairing the angular term with linvel()'s COM reference"
  - "tests/physics/rotation.test.ts — the phase's first applyTorque regression: spins a hammer unit into a defender, captures the solver manifold, and pins the COM-based Δv while rejecting the origin-based value"
affects: [03-control, 04-kingdom, 05-rendering]

# Actuals (#2632) — pairs with the plan's `estimate` (tokens: 30000, tasks: 2).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 3279
  tasks: 2
  commits: 2
  plan_head_before: 7d86bb563b226196db243c5f0393997e57f6320d

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rotation centre = body.worldCom(): Rapier's linvel() is the COM velocity and the solver rotates about the COM, so the ω×r moment arm must be measured from the same point. body.translation() (the rigid-body origin) is forbidden — for a compound body it injects |ω|·|com − origin| of false contact speed."
    - "Regression test reaches the otherwise-hidden Rapier world by wrapping RAPIER.World.prototype.createRigidBody and recording `this`, restoring the original prototype method in a finally block (same prototype-patching technique as tick.test.ts)."
    - "COM-vs-origin discrimination: the test computes the contact-point Δv twice (worldCom centres vs translation centres), asserts the emitted value matches COM to 3 dp and differs from the origin value by > 0.5 m/s — so reverting the fix fails the test."
    - "Independent oracle: pre-step velocities are written back with setLinvel/setAngvel (wakeUp false) and Rapier's velocityAtPoint at the captured contact point must agree with the COM projection to 6 dp."

key-files:
  created:
    - tests/physics/rotation.test.ts
  modified:
    - src/physics/PhysicsWorld.ts

key-decisions:
  - "Used body.worldCom() rather than velocityAtPoint(): it keeps the existing cross-product form and normal projection byte-identical, changing only the reference point (the smallest possible fix for G1)."
  - "The velocity sampling instant is untouched: #preVelocities is still filled before world.step and remains the sole Δv source (D-08)."
  - "The captured contact is read through a small readCapturedContact() helper because TypeScript's control-flow analysis does not track assignments made inside the contactPair closure; reading the holder directly narrowed it to `null`."
  - "The test reads bodies/colliders from colliders.getAll() + parent() (capsule = weapon, the other body's ball = defender) instead of relying on creation order."

patterns-established:
  - "Rotating-body physics regressions drive a torqued compound body with force + torque, capture the hit tick's solver manifold, and compare the emitted Δv against a COM-based recomputation plus an independent Rapier oracle."
  - "Frozen contract preserved: src/physics/types.ts is byte-identical and PhysicsWorld gained no public member."

requirements-completed: [PHYS-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "tick() computes the ω×r term about each body's world centre of mass (worldCom()), so linvel() and the angular term share one reference point; the cross-product form, normal projection, and pre-step Δv source are unchanged"
    requirement: PHYS-03
    verification:
      - kind: other
        ref: "node presence check over src/physics/PhysicsWorld.ts (attackerBody.worldCom() + defenderBody.worldCom() + omega term) -> COM_ORIGIN_OK"
        status: pass
      - kind: other
        ref: "pnpm typecheck -> exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "tests/physics/rotation.test.ts calls applyTorque, spins a hammer unit into a bare defender, captures a Weapon↔Body damage event, and asserts the emitted deltaV equals the COM-based contact-point projection while rejecting the origin-based projection; the event's part/reduction semantics are unchanged"
    requirement: PHYS-03
    verification:
      - kind: integration
        ref: "tests/physics/rotation.test.ts#pins the COM-based Δv and rejects the rigid-body-origin value"
        status: pass
      - kind: integration
        ref: "pnpm test (15 files, 113 tests) green"
        status: pass
      - kind: other
        ref: "pnpm lint -> exit 0"
        status: pass
      - kind: other
        ref: "temporary revert of worldCom() -> translation() fails the new test (emitted 10.8208 vs COM 5.8330), then restored"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-10-19
status: complete
---

# Phase 2 Plan 07: Rotating-Body Δv Rotation Centre — Gap G1 Summary

**`tick()` now measures the `ω×r` moment arm from each body's world centre of mass (`worldCom()`), matching `linvel()`'s COM reference, and a new `applyTorque` regression pins the COM-correct Δv while failing if the reference point ever reverts to the rigid-body origin.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-19T18:14+08:00 (approx.)
- **Completed:** 2026-10-19T18:26+08:00
- **Tasks:** 2
- **Files modified:** 2 (`src/physics/PhysicsWorld.ts` +6/−4; `tests/physics/rotation.test.ts` new, 304 lines)

## Accomplishments

- Closed verification gap G1: the angular term no longer uses `body.translation()` (the rigid-body origin) as its rotation centre. Both bodies now use `body.worldCom()`, so `linvel()` and `ω×r` share one reference point.
- Kept the fix minimal: the 2D cross-product `(-ω·ry, ω·rx)`, the normal projection, and the pre-step `#preVelocities` sampling instant are unchanged (D-08).
- Added the phase's first `applyTorque` regression. It drives a hammer unit with `applyForce(1, 3000, 0)` + `applyTorque(1, 4000)`, captures a real `Weapon↔Body` damage event and the hit tick's solver manifold, and asserts:
  - `|ω| > 5` rad/s on the hit tick;
  - the COM-based and origin-based projections differ by more than 0.5 m/s;
  - the emitted `deltaV` equals the COM-based value to 3 dp and differs from the origin-based value by more than 0.5 m/s;
  - Rapier's `velocityAtPoint()` agrees with the COM projection to 6 dp and the emitted `deltaV` to 3 dp.
- Verified the discrimination is real: reverting `worldCom()` → `translation()` makes the new test fail with emitted `10.8208` against the COM-correct `5.8330`, exactly the values measured during planning; the fix was then restored.
- Confirmed the frozen contract is untouched: `src/physics/types.ts` is byte-identical; `PhysicsWorld` gained no public member.

## Task Commits

Each task was committed atomically:

1. **Task 1: Measure the ω×r moment arm from the centre of mass in tick()** — `8c65448` (fix)
2. **Task 2: Add tests/physics/rotation.test.ts — pin the COM-correct Δv for a torqued attacker** — `b1d213b` (test)

## Files Created/Modified

- `src/physics/PhysicsWorld.ts` — the damage branch now reads `attackerBody.worldCom()` / `defenderBody.worldCom()` for the `ω×r` moment arm; the comment states why the origin must not be used.
- `tests/physics/rotation.test.ts` — new regression spec: captures the Rapier world via a restored `createRigidBody` prototype patch, discovers the weapon capsule / defender ball through `colliders.getAll()`, drives the torque+force loop for up to 120 ticks, and pins the COM-based `deltaV` plus event semantics.

## Decisions Made

- `worldCom()` over `velocityAtPoint()`: keeps the existing computation shape and changes only the reference point — the smallest correct fix for G1.
- The contact holder is read through `readCapturedContact()` because TypeScript's control-flow analysis does not track assignments made inside the `contactPair` callback; a direct holder read narrowed to `null`.
- Bodies are located by shape + parent handle rather than creation order, so the test does not depend on internal registration ordering.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial TypeScript compile failed with `Property 'x' does not exist on type 'never'` at the captured-contact reads: the closure assignment to the holder is invisible to control-flow narrowing. Resolved by reading the holder through a typed helper function, which keeps the union return type and avoids a cast.
- During the intentional revert check, PowerShell's `Set-Content` re-encoded `PhysicsWorld.ts`; the file was restored with `git checkout -- src/physics/PhysicsWorld.ts` (Task 1 commit already contains the correct fix), and the full gate was re-run green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap G1 is closed and locked by a committed regression; `pnpm test` is 15 files / 113 tests green, `pnpm typecheck` and `pnpm lint` exit 0.
- The remaining WR-02 item is calibration only: whether spin/charge damage *feels* right after the reference-point fix is a playtest judgement for the assembled sim (Phase 5), not a Phase-2 gate.

---
*Phase: 02-physics-simulation*
*Completed: 2026-10-19*

## Self-Check: PASSED

- FOUND: `src/physics/PhysicsWorld.ts`
- FOUND: `tests/physics/rotation.test.ts`
- FOUND: `.planning/phases/02-physics-simulation/02-07-SUMMARY.md`
- FOUND commit: `8c65448` (Task 1 fix)
- FOUND commit: `b1d213b` (Task 2 test)
