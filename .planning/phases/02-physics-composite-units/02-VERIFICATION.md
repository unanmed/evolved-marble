---
phase: 02-physics-composite-units
verified: 2026-10-16T08:55:09Z
status: gaps_found
score: 29/30 must-haves verified
covered_files:
  - .planning/phases/02-physics-composite-units/02-01-PLAN.md
  - .planning/phases/02-physics-composite-units/02-02-PLAN.md
  - .planning/phases/02-physics-composite-units/02-03-PLAN.md
  - .planning/phases/02-physics-composite-units/02-04-PLAN.md
  - .planning/phases/02-physics-composite-units/02-05-PLAN.md
  - .planning/phases/02-physics-composite-units/02-01-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-02-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-03-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-04-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-05-SUMMARY.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - package.json
  - pnpm-lock.yaml
  - vitest.config.ts
  - src/config/sim.ts
  - src/sim/content/physics.ts
  - src/sim/world/physics-init.ts
  - src/sim/world/physics-world.ts
  - src/sim/world/composite.ts
  - src/sim/world/contact.ts
  - src/sim/core/events.ts
  - src/sim/battle-sim.ts
  - src/sim/snapshot.ts
  - src/sim/world/entity-store.ts
  - src/sim/world/world.ts
  - tests/helpers/physics-setup.ts
  - tests/helpers/run-physics.ts
  - tests/determinism/rapier-version.test.ts
  - tests/determinism/physics-gate.test.ts
  - tests/sim/physics-composite.test.ts
  - tests/sim/ccd.test.ts
  - tests/sim/contact.test.ts
  - tests/sim/snapshot.test.ts
  - tests/sim/commands.test.ts
covered_digest: "v1:sha256:3704844628b6e670c3e0b8481fbbbda540c9d5cd40425f6ce4507b08a0e329d5"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Unit-level `InteractionGroups` let all parts of one unit be mutually non-damaging while enemy units still collide (D-27)."
    status: failed
    reason: >-
      Membership bits are allocated by `(entityId - 1) % GROUP_COUNT` (GROUP_COUNT=16) with no
      live-bit pool and no exhaustion guard. Any two units whose ids differ by a multiple of 16
      receive the identical membership bit; because each unit's filter mask excludes its own bit,
      such pairs do not collide AT ALL. In the project's target regime (10v10 = 20 units) ids
      (1,17),(2,18),(3,19),(4,20) are mutually non-colliding — 8 units ghost through their partner.
      The truth as written ("enemy units still collide") is therefore false beyond 16 concurrent
      units. Independently found by the phase code review as CR-01 (critical) and confirmed here by
      tracing `unitMembership`/`interactionGroups` in `src/sim/world/composite.ts`.
    artifacts:
      - path: "src/sim/world/composite.ts"
        issue: "`unitMembership()` (l.332-335) aliases bits via modulo; `interactionGroups()` (l.348-352) removes the own bit from the filter, so aliased units never interact. The `GROUP_COUNT=16` comment in `src/sim/content/physics.ts` calls the encoding cap a 'Rapier hard limit', but Rapier does not require one membership bit per unit."
    missing:
      - "Allocate membership bits from a live-unit pool and release on `despawn`; fail loud on exhaustion instead of aliasing (per CR-01's suggested fix)."
      - "Add a regression test with >16 concurrent units asserting every distinct-id pair collides (currently `tests/sim/physics-composite.test.ts` 'enemy units still collide' only exercises ids 1 and 2)."
      - "OR narrow the must-have truth to an explicit '≤16 concurrent units' scope and record the deferred >16 fix against the Phase-4 10v10 target — in which case this gap may be accepted via an `overrides` entry."
deferred: []
---

# Phase 2: Physics & Composite Units Verification Report

**Phase Goal:** Units are compound Rapier2D rigid bodies whose body/weapon/armor parts are physically distinct and tagged, and whose physical contacts are surfaced as typed, part-tagged simulation events — deterministically.
**Verified:** 2026-10-16T08:55:09Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Verdict summary

The **phase goal itself is achieved**: composite units spawn as one body carrying body+armor colliders plus a separate revolute-jointed weapon body; every collider is part-tagged; weapon↔armor/body contacts surface through the real `BattleSim` as typed `IContactEvent`s carrying a pre-step Δv; snapshot v3 round-trips and the same-machine determinism gate is green. All 91 tests, the determinism gate (14), `typecheck` (both tsconfigs) and `lint` are green on the committed tree.

However, one declared **must-have truth is FAILED**: the 02-04 unit-level collision-group truth ("…while enemy units still collide") holds only within a 16-concurrent-unit budget and silently breaks beyond it — exactly the 10v10+ (20+ unit) regime the product targets. This is the review's CR-01 (critical) and is confirmed by tracing the code. Per the verification decision tree, a failed must-have truth ⇒ `gaps_found`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | R-SC1 — A unit spawns as one rigid body carrying independent body, weapon, and armor colliders that can be individually identified | ✓ VERIFIED | `src/sim/world/composite.ts` `spawn()` creates 1 body + ball collider + armor collider(s) + separate weapon body (2-anchor `JointData.revolute`); every collider registered via `register(handle, ref)`. `physics-composite.test.ts` asserts 1 body + 2 armor + 2 weapons resolvable. |
| 2 | R-SC2 — A weapon striking another unit emits a typed sim event recording which part (body vs armor) was hit | ✓ VERIFIED | `src/sim/world/contact.ts` `drain()` emits `IContactEvent{partA,partB,armorA,armorB,dv}`; `tests/sim/contact.test.ts` Test 2/3/6 (real `BattleSim` → `events.drain()` weapon-vs-armor, same tick). |
| 3 | R-SC3 — Physics on the Rapier2D deterministic build with a fixed step; determinism fingerprint stays green after physics | ✓ VERIFIED | `@dimforge/rapier2d-deterministic-compat@0.21.0` (exact pin); `PhysicsWorld.step` sets `timestep`; `physics-gate.test.ts` double-run identical pose+snapshot hash; `tests/determinism/gate.test.ts` same-seed trace identical. Gate 14/14 green. |
| 4 | R-SC4 — Cross-machine fingerprint stable + fast weapons do not tunnel (CCD configured) | ✓ VERIFIED (cross-machine half RELAXED by D-17) | CCD: `setCcdEnabled(true)` on weapon bodies + `maxCcdSubsteps`; `tests/sim/ccd.test.ts` 240 m/s vs 0.06 m thin target → 1 hit with CCD / 0 without. Cross-machine half intentionally relaxed to same-machine by CONTEXT D-17 (per task note); same-machine double-run gate exists and is green. No `.github/workflows` (no CI), confirming D-17. |
| 5 | P-02-01 — `initPhysics()` idempotent; a `RAPIER.World` constructable afterwards (D-21) | ✓ VERIFIED | `src/sim/world/physics-init.ts` module latch; `rapier-version.test.ts` idempotence + Node World step tests green. |
| 6 | P-02-01 — `rapierVersion()` returns exactly `'0.21.0'` (D-19) | ✓ VERIFIED | `rapier-version.test.ts#版本被精确钉定` green (`expect(rapierVersion()).toBe('0.21.0')`). |
| 7 | P-02-01 — version smoke test asserts a golden fingerprint stable across two in-process constructions (D-19) | ✓ VERIFIED | `GOLDEN_RAPIER_FINGERPRINT = 'e1b1f66b73551'`; `rapier-version.test.ts#golden…` green. |
| 8 | P-02-01 — user explicitly approved the D-18 variant substitution | ✓ VERIFIED (recorded; see Human Verification) | Recorded in 02-01-SUMMARY + `.planning/STATE.md`; the observable outcome (the `-compat` package installed, exact-pinned) matches. Human approval itself is not code-derivable. |
| 9 | P-02-01 — `-compat` exact-pinned (no `^`/`~`) and lockfile records `0.21.0` (D-19) | ✓ VERIFIED | `package.json` → `"@dimforge/rapier2d-deterministic-compat": "0.21.0"`; `pnpm-lock.yaml` l.215 `…-compat@0.21.0`. |
| 10 | P-02-01 — every new physics constant has a single source; no inline numeric literals on the physics path (D-06/D-35) | ✓ VERIFIED | Engine constants in `src/config/sim.ts`, content in `src/sim/content/physics.ts` (both import-free). Remaining literals are structural zeros (`{x:0,y:0}` joint anchors), not physics values. |
| 11 | P-02-01 — `pnpm gate` (tests/determinism) stays green once the shared setup is wired | ✓ VERIFIED | Ran `pnpm gate` → 3 files / 14 tests passed, exit 0. |
| 12 | P-02-01 — WASM resolves under plain Node with no bundler plugin / `.wasm` asset config (D-23) | ✓ VERIFIED | `vitest.config.ts` has `environment:'node'` + `setupFiles` only, no wasm plugin; all physics tests init+step under Node. |
| 13 | P-02-01 / P-02-02 — determinism gating is same-machine only; no cross-machine golden hash, no CI job (D-17) | ✓ VERIFIED | No `.github/**`; only same-machine double-run gates exist. |
| 14 | P-02-02 — every created collider registered in `handle → (entityId, part[, armorSubtype])`; `lookup` resolves and returns `null` (never throws) for unregistered handles (PHYS-01) | ✓ VERIFIED | `PhysicsWorld.registerPart/lookupPart`; `physics-gate.test.ts#ContactBridge.lookup…` asserts registered resolution + `null` for handle 999999. |
| 15 | P-02-02 — a weapon-vs-armor collision-enter emits one typed `IContactEvent`, correct parts, `dv > 0` (PHYS-02) | ✓ VERIFIED | `physics-gate.test.ts` typed-contact + weapon-vs-armor naming tests green. |
| 16 | P-02-02 — two runs of the same fixed scenario → identical per-tick fingerprints AND identical Rapier `takeSnapshot()` hashes (D-20) | ✓ VERIFIED | `physics-gate.test.ts#same scenario double-run…` green. |
| 17 | P-02-02 — Rapier entities created in `store.ids()` order, never from `Map`/`Set` iteration (Pitfall 3) | ✓ VERIFIED | `BattleSim.spawn`/`run-physics.ts` drive creation by ordered id; factory `units` Map is lookup-only (documented + traceable). |
| 18 | P-02-02 — the weapon swings continuously in a reciprocating arc driven by numeric constants, no AI (D-25) | ✓ VERIFIED | `CompositeFactory.driveSwing` (θ'=A·ω·cos(phase)); `physics-composite.test.ts#weapon swings continuously` asserts ≥2 sign changes + sustained amplitude; `physics-gate.test.ts#weapon swings` green. (Integration caveat: see W-02.) |
| 19 | P-02-03 — after `BattleSim.step()`, each unit's pose (`x,y,rotation,vx,vy,angularVelocity`) is mirrored from Rapier; store is a read-only mirror (D-34) | ✓ VERIFIED | `battle-sim.ts` `mirrorAndClamp()`; `commands.test.ts` mirror/rotation/angularVelocity tests green. |
| 20 | P-02-03 — `snapshot()` v3 round-trips with physics: `fingerprint(restore(snapshot)) === fingerprint(snapshot)` (D-34) | ✓ VERIFIED | `VERSION = 3`; `commands.test.ts#snapshot v3 round-trips…` + `snapshot.test.ts` byte-identity tests green. |
| 21 | P-02-03 — same seed + same scenario → identical per-tick fingerprint trace after physics (D-17) | ✓ VERIFIED | `commands.test.ts#same seed + same command log…after physics`; `gate.test.ts` green. |
| 22 | P-02-03 — `CommandKind.Force`/`Torque` route through Rapier impulse APIs, not direct `xform` mutation | ✓ VERIFIED | `battle-sim.ts` `applyImpulse`/`applyTorqueImpulse`; no `xform.vx +=`/`xform.vy +=` on the Force path (grep). |
| 23 | P-02-03 — D-33 safety belt clamps position/velocity only when outside the 1000×1000 m safe area, under `store.ids()` iteration | ✓ VERIFIED | `mirrorAndClamp()`; `commands.test.ts#D-33 safety belt…` green (unit pushed to (5000,5000) → clamped to (1000,1000)). |
| 24 | P-02-04 — `CompositeFactory` accepts `{weapons,armors}`; N weapon bodies + N armor colliders tagged `ArmorSubtype` (D-26) | ✓ VERIFIED | `composite.ts` array loops; `physics-composite.test.ts#spawns N weapons + N armors…` green. |
| 25 | **P-02-04 — unit-level `InteractionGroups`: same-unit parts mutually non-damaging while enemy units still collide (D-27)** | ✗ FAILED | Holds only ≤16 units. `unitMembership` aliases every 16th id (`(id-1)%16`), and the filter excludes the own bit ⇒ ids differing by 16 never collide. Target regime (10v10=20 units) loses 4 pairs. See Gaps/CR-01. |
| 26 | P-02-04 — `despawn(entityId)` removes body/colliders/joint in ordered fashion, leaving no dangling part-map handle | ✓ VERIFIED | `composite.ts` `despawn`/`removeBody`; `physics-composite.test.ts#despawn…` asserts counts drop exactly + all handles → `null`. (Caveat W-03: not exercised after `restore()`.) |
| 27 | P-02-04 — CCD enabled on weapon bodies; fast weapon vs dynamic target = exactly 1 hit with CCD, 0 without | ✓ VERIFIED | `ccd.test.ts` parametrized contrast + `isCcdEnabled()` assertion green. |
| 28 | P-02-04 — weapon angular velocity oscillates continuously over N steps (sustained), not a one-step spike | ✓ VERIFIED | `physics-composite.test.ts#weapon swings continuously…` (150 ticks, sign changes ≥2, last-quarter amplitude ≥ peak/2). |
| 29 | P-02-05 — head-on 8 m/s approach yields `dv ≈ 8` from PRE-STEP velocities | ✓ VERIFIED | `contact.test.ts` Test 1 (`|dv − 8| < 0.2`; post-step manifold would give ~0). |
| 30 | P-02-05 — weapon-vs-armor names `partA=Weapon`/`partB=Armor` + correct `armorB`; weapon-vs-body names `partB=Body`, `armorB=null`; unregistered handle emits nothing and never throws; enter-only, no dedup; rotation/angularVelocity census; part map round-trips as f64; real `BattleSim` → `EventLog` contact | ✓ VERIFIED | `contact.test.ts` Tests 2–6, `snapshot.test.ts` census + `composite-unit snapshot v3 completeness` describe; all green. |

**Score:** 29/30 truths verified (1 failed); 0 present-but-behavior-unverified.

### Requirement Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PHYS-01 | 02-02, 02-03, 02-04 | Units are compound rigid bodies: body/weapon/armor are independent colliders, tagged by part | ✓ SATISFIED (with the D-27 scale defect noted) | composite factory + part map + `IUnitComponents.physics`; truths 1, 14, 17, 24, 26 above |
| PHYS-02 | 02-02, 02-05 | Physics contacts become typed sim events recording the hit part | ✓ SATISFIED | `ContactBridge`; truths 2, 15, 29, 30 |
| PHYS-03 | 02-01, 02-02, 02-03, 02-04, 02-05 | Uses the Rapier2D deterministic build | ✓ SATISFIED | `-compat@0.21.0` exact pin + version smoke; truths 3, 4, 6, 9, 11, 20, 21, 27 |

All three phase requirement IDs (PHYS-01/02/03) declared in the five PLAN frontmatters are accounted for; `REQUIREMENTS.md` maps exactly these three to Phase 2. No orphaned requirements (no other ID maps to Phase 2).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/sim/world/physics-init.ts` | Idempotent WASM init + version | ✓ VERIFIED | latch + `rapierVersion()`; Chinese JSDoc. |
| `src/sim/content/physics.ts` | Content physics constants | ✓ VERIFIED | import-free pure data. |
| `src/config/sim.ts` | Engine physics constants | ✓ VERIFIED | import-free; JSDoc on each. |
| `src/sim/world/physics-world.ts` | Deterministic world + pre-step velocity capture + part map | ✓ VERIFIED | `step()` captures before `world.step`. |
| `src/sim/world/composite.ts` | Composite factory (spawn/driveSwing/despawn) | ✓ VERIFIED (defect at l.332) | see gap. |
| `src/sim/world/contact.ts` | Typed contact bridge (pre-step Δv, null guard) | ✓ VERIFIED | delegates part map to `IPhysicsWorld`. |
| `src/sim/core/events.ts` | Numeric `PartKind`/`ArmorSubtype`, extended `IContactEvent` | ✓ VERIFIED | named interfaces. |
| `src/sim/battle-sim.ts` | Physics-wired step, impulses, mirror, safety belt | ✓ VERIFIED | — |
| `src/sim/snapshot.ts` | Snapshot v3 | ✓ VERIFIED | `VERSION = 3`. |
| `src/sim/world/entity-store.ts`, `src/sim/world/world.ts` | rotation/angularVelocity, `physics` on `ISimState` | ✓ VERIFIED | — |
| Test files (physics-setup, run-physics, rapier-version, physics-gate, physics-composite, ccd, contact, snapshot, commands) | Verification surfaces | ✓ VERIFIED | all present and green. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `BattleSim.step()` | `PhysicsWorld.step` → `ContactBridge.drain` → `EventLog` | `contactBridge.drain(tick)` inside the same tick | ✓ WIRED | `contact.test.ts` Test 6 drives the real `BattleSim` and finds the contact in the enter tick. |
| `store.ids()` order | Rapier creation/deletion order | ordered loops in `spawn`/`despawn`/`mirrorAndClamp` | ✓ WIRED | factory `units` Map lookup-only. |
| `snapshot.ts` v3 bytes | Rapier `takeSnapshot()` + part map | `deserializeState` → `World.restoreSnapshot` + re-register parts | ✓ WIRED | round-trip byte-identity + part-map resolution tests green. |
| `CompositeFactory.driveSwing` | `BattleSim.step()` | — | ⚠️ NOT WIRED | `driveSwing` is implemented and tested but `BattleSim.step()` never calls it (grep: only declared/defined in `composite.ts`). See W-02. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `IContactEvent.dv` | `dv` | `PhysicsWorld.preStepVelocities` (`linvel`/`angvel` captured before `world.step`) | Yes (head-on 8 m/s → ≈8; post-step would be ~0) | ✓ FLOWING |
| `IUnitXform.{x,y,rotation,vx,vy,angularVelocity}` | pose mirror | Rapier `body.translation()/rotation()/linvel()/angvel()` in `mirrorAndClamp()` | Yes (anti-vacuous motion > 1/256 grid) | ✓ FLOWING |
| part map (`colliderHandle → ref`) | `IUnitPartRef` | every `createCollider` registration | Yes (lookup resolves; round-trips through snapshot) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full test suite | `pnpm test` | 14 files / 91 tests passed, exit 0 | ✓ PASS |
| Determinism gate | `pnpm gate` | 3 files / 14 tests passed, exit 0 | ✓ PASS |
| Typecheck (both tsconfigs) | `pnpm run typecheck` | exit 0 | ✓ PASS |
| Lint (sim boundary + conventions) | `pnpm run lint` | exit 0 | ✓ PASS |
| Exact-pin + no non-deterministic build | `grep @dimforge/rapier` (json) | only `"@dimforge/rapier2d-deterministic-compat": "0.21.0"` | ✓ PASS |
| No stub/debt markers on physics paths | `grep Method not implemented\|TODO\|FIXME\|XXX\|HACK` (src) | no matches | ✓ PASS |

### Probe Execution

No probes declared by the phase (no `scripts/*/tests/probe-*.sh`, none referenced in PLAN/SUMMARY). Step 7c: not applicable.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/sim/world/composite.ts` | 332-335 | Modulo membership aliasing (CR-01) | 🛑 BLOCKER | Fails the D-27 "enemy units still collide" must-have beyond 16 units. Structured as the gap above. |
| `src/sim/battle-sim.ts` | 219-236 | `driveSwing` never invoked (W-02 / review WR-02) | ⚠️ Warning | In the live sim weapons never actively oscillate; weapon-driven Δv contacts only arise from body translation. The subsystem truth is verified, but D-25 is not integrated into the real step. |
| `src/sim/battle-sim.ts` | 407-419 | `restore()` rebuilds factory with empty `units` (W-03 / review WR-03) | ⚠️ Warning | `despawn` silently no-ops for restored units (latent — no public despawn path in Phase 2). |
| `src/sim/snapshot.ts` | 344 | `bodyHandle ?? 0` fallback (WR-04) | ⚠️ Warning | A missing Body part silently aliases a live Rapier handle 0 instead of failing loud. |
| `src/sim/snapshot.ts` | 129/199-206 | Part map serialized in Map insertion order (WR-05) | ⚠️ Warning | Byte order depends on spawn/despawn history rather than canonical order; untested divergence path. |
| `src/sim/battle-sim.ts` | 153-158 | `spawn()` leaves mirror at (0,0) until first `step()` (WR-06) | ⚠️ Warning | Two-view inconsistency on the spawn frame (documented in `snapshot.test.ts`). |
| `src/sim/battle-sim.ts` | 268-318 | `atTick` validated but never enforced (WR-01) | ⚠️ Warning | Pre-existing Phase-1 command contract gap; async-driver replay could diverge. |
| `src/sim/systems/movement.ts` | 24-32 | Superseded Phase-1 nudge system still present | ℹ️ Info | Not called by `step()`; docs mark it a Phase-1 stand-in. |
| test rigs (`contact.test.ts`, `physics-composite.test.ts`) | 35-42 / 41-50 | Classes used as types (IN-04) | ℹ️ Info | Project-locked rule #2 not applied to test rig interfaces. |
| `src/sim/snapshot.ts` | 144-163, 231-255 | Local serializer closures lack JSDoc (IN-03) | ℹ️ Info | Convention gate only checks top-level exports, so this passes. |

Re-verification evidence gate: N/A — this is an initial verification.

## Gaps Summary

The phase delivers its goal end-to-end: compound Rapier2D units with physically-distinct, part-tagged colliders, typed part-tagged contact events with a correct pre-step Δv, snapshot v3 round-tripping, and same-machine determinism — all gates green. One **must-have truth is failed**: the D-27 unit-level collision grouping silently aliases membership bits every 16 entity ids, so unrelated units (e.g. id 1 and id 17) never collide. Since the product's core is multi-faction 10v10+ battles (20+ units), this is a real silent correctness defect, not a theoretical edge — it is the review's CR-01 (critical). It does **not** contradict the phase goal statement (which is about compound units + typed contacts), but it does contradict the plan-02-04 must-have truth as written. Fix by allocating membership bits from a live-unit pool with a loud exhaustion guard (and add a >16-unit collision regression test), or explicitly scope the truth to ≤16 units and accept it via an `overrides` entry.

## Deferred Items

None. The >16-unit fix is *not* clearly addressed by a later phase's roadmap section (Phase 4 asserts 10v10+ battles but does not state the collision-group fix), so it is not deferred under Step 9b.

## Human Verification Recommended

1. **D-18 variant-substitution approval**
   **Test:** Confirm a human actually typed `approved` for installing `@dimforge/rapier2d-deterministic-compat` in place of the CONTEXT-locked `@dimforge/rapier2d-deterministic`.
   **Expected:** An authentic approval exists (02-01-SUMMARY + `.planning/STATE.md` record it); the installed, exact-pinned package is the approved variant.
   **Why human:** A user's approval is a process artifact not re-derivable from the codebase; only its outcome (the `-compat` package present) is observable.

---

_Verified: 2026-10-16T08:55:09Z_
_Verifier: the agent (gsd-verifier)_
