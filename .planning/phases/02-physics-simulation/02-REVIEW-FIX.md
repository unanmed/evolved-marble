---
phase: 02-physics-simulation
fixed_at: 2026-10-19T07:25:18Z
review_path: .planning/phases/02-physics-simulation/02-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-10-19T07:25:18Z
**Source review:** `.planning/phases/02-physics-simulation/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 Critical, 6 Warnings — `fix_scope: critical_warning`)
- Fixed: 7
- Skipped: 0

**Gates after every commit:** `pnpm test` (112/112), `pnpm typecheck` (clean), `pnpm lint` (clean).

**Isolation note:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so all
edits and commits were made **in the main checkout** (no worktree). The gate results above
are reproducible from the tree you are looking at.

## Fixed Issues

### CR-01: `dispose()` is not idempotent — a second call crashes

**Files modified:** `src/physics/PhysicsWorld.ts`, `tests/physics/compound.test.ts`
**Commit:** `006e56b`
**Applied fix:** Added a private `#disposed` flag (JSDoc'd, AGENTS §4) and an early-return
guard in `dispose()`, so a second (or later) call is a safe no-op and never re-invokes
`world.free()` / `eventQueue.free()`. Added a lifecycle test asserting repeated `dispose()`
calls do not throw (and the `afterEach` double-dispose remains safe).

### WR-01: Combat inputs are captured once at `registerUnit` and can never be refreshed

**Files modified:** `src/physics/PhysicsWorld.ts`
**Commit:** `56df2cd`
**Applied fix:** Documented as an **accepted contract limitation** — `#specs` snapshots the
`readonly` `IUnitPhysicsSpec` and `IPhysicsWorld` intentionally exposes no update entry, so
combat inputs cannot be refreshed after registration; callers needing a refresh must
`removeUnit` + `registerUnit`. Per the review guidance the frozen `IPhysicsWorld` was **not**
expanded (the alternative `updateUnit` path would have broken the type gate).

### WR-02: delta-V ignores the weapon's rotational (ω × r) velocity

**Files modified:** `src/physics/PhysicsWorld.ts`
**Commit:** `e07a649`
**Applied fix:** Implemented the full contact-point velocity. `tick()` now also snapshots
`body.angvel()`, and the world-space contact point is read via `manifold.solverContactPoint(0)`;
Δv uses `v_com + ω × r` for both bodies (`(-ω·ry, ω·rx)`), falling back to linear-only when no
solver contact point is available. This addresses the gameplay risk for the rotation-heavy
`SkillKind.Spin` / `SkillKind.Charge` attacks rather than deferring it.
**Status:** `fixed: requires human verification` — this is a numeric/logic change (the
contact-point term); syntax + type + integration gates pass, but the calibration effect on
spin/charge damage should be confirmed during playtesting.

### WR-03: Bare `catch {}` hides errors, and a missing manifold emits a spurious zero-damage event

**Files modified:** `src/physics/PhysicsWorld.ts`, `tests/physics/tick.test.ts`
**Commit:** `e0e23a4`
**Applied fix:** Removed the silent `try/catch`. The two colliders are resolved once via
`world.getCollider` and a `null` result skips the pair; a `hasNormal` flag records whether
`contactPair` invoked its callback at all, and a pair with no manifold is **skipped** instead
of emitting a `deltaV = 0` / `damage = 0` event. Added a deterministic test that stubs
`world.contactPair` to never invoke its callback and asserts the contact event is still reported
while **no** damage event is emitted (previously this produced a zero-damage event).

### WR-04: AGENTS §2 violation — structured types declared inline instead of in `types.ts`

**Files modified:** `src/physics/PhysicsWorld.ts`, `src/physics/types.ts`
**Commit:** `e4f9187`
**Applied fix:** Added `IColliderTag` (collider-handle tag) and `IVelocitySnapshot` (pre-step
linear + angular velocity) to `src/physics/types.ts` with JSDoc on every member, and used them
for the `#index` / `#preVelocities` private maps. No existing approved interface member was
changed; the single-`types.ts`-per-folder rule is preserved. The now-unused `WeaponKind` import
was dropped (value-only usage remains).

### WR-05: Every armor becomes a coincident, geometrically identical collider

**Files modified:** `src/physics/constants.ts`
**Commit:** `05f840b`
**Applied fix:** Documented the limitation explicitly next to `DEFAULT_GEOMETRY`: multiple
armors (Helmet + Shield) intentionally produce coincident, identical, **non-directional** circle
colliders; this doubles duplicate narrow-phase contacts and means `IContactEvent` cannot
attribute which armor was struck. The damage layer still resolves the specific armor via the
per-collider `IColliderTag.armorKind` (D-13). Per the guidance, the frozen types/geometry were
**not** changed (offsetting armors would break the armor-encloses-body invariant the pipeline
relies on).

### WR-06: `tick.test.ts` co-occurrence assertion is timing-dependent and brittle

**Files modified:** `tests/physics/tick.test.ts`
**Commit:** `855eb62`
**Applied fix:** Made co-occurrence **deterministic** by spawning the weapon already overlapping
both the defender's armor disk (0.55) and body disk (0.5), so both `started` contacts occur on
the same first step regardless of machine / Rapier build — removing the reliance on the 0.05 m
armor-body gap being crossed within a single step. The real invariant is kept strict and
strengthened: every tick asserts `pairEvents.length <= 1`, and the co-occurrence tick asserts
exactly one event, `defenderPart === Armor`, `armorKind === Helmet`, and no `Body` event. (The
at-rest spawn yields Δv = 0 on that tick; positive armor reduction remains pinned by the
dedicated single-armor-hit test.)

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-10-19T07:25:18Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
