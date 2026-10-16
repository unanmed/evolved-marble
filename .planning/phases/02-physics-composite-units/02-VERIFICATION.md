---
phase: 02-physics-composite-units
verified: 2026-10-16T10:21:57Z
status: passed
score: 34/34 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/02-physics-composite-units/02-01-PLAN.md
  - .planning/phases/02-physics-composite-units/02-01-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-02-PLAN.md
  - .planning/phases/02-physics-composite-units/02-02-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-03-PLAN.md
  - .planning/phases/02-physics-composite-units/02-03-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-04-PLAN.md
  - .planning/phases/02-physics-composite-units/02-04-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-05-PLAN.md
  - .planning/phases/02-physics-composite-units/02-05-SUMMARY.md
  - .planning/phases/02-physics-composite-units/02-06-PLAN.md
  - .planning/phases/02-physics-composite-units/02-06-SUMMARY.md
  - src/sim/battle-sim.ts
  - src/sim/content/physics.ts
  - src/sim/world/composite.ts
  - tests/sim/collision-groups.test.ts
  - tests/sim/physics-composite.test.ts
covered_digest: "v1:sha256:2f97a09d8d687c4cb5616f4e5ae0add2bb85124e5ee08e0d77bd26f1d8b57087"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 29/30
  gaps_closed:
    - "P-02-04 — unit-level `InteractionGroups`: same-unit parts mutually non-damaging while enemy units still collide (D-27) — previously held only ≤16 concurrent units; now held for the full live-pool capacity (120) including the id-1/id-17 aliasing family."
  gaps_remaining: []
  regressions: []
advisory: []
human_verification: []
---

# Phase 2: Physics & Composite Units Verification Report

**Phase Goal:** Units are compound Rapier2D rigid bodies whose body/weapon/armor parts are physically distinct and tagged, and whose physical contacts are surfaced as typed, part-tagged simulation events — deterministically.
**Verified:** 2026-10-16T10:21:57Z
**Status:** passed
**Re-verification:** Yes — after gap closure (02-06, D-27 live-pool collision allocator)

## Verdict summary

The single previously-FAILED must-have truth — **02-04 D-27 "unit-level `InteractionGroups`: same-unit parts mutually non-damaging while enemy units still collide"** — is now **VERIFIED**. The modulo membership alias `(entityId - 1) % 16` was replaced by a deterministic live pool of **distinct 2-bit masks** (`C(16,2) = 120`), with release on `despawn`, a fail-loud exhaustion throw naming `GROUP_UNIT_CAPACITY`, a module-level capacity/pool consistency guard, and a `restore()` re-seed (WR-03). The aliasing family (ids differing by a multiple of 16) now physically collides, and all `C(20,2)` pairs of 20 concurrent units interact while each unit excludes its own membership.

The **phase goal is achieved end-to-end**: composite units spawn as one body carrying body+armor colliders plus a separate revolute-jointed weapon body; every collider is part-tagged; weapon↔armor/body contacts surface through the real `BattleSim` as typed `IContactEvent`s with a pre-step Δv; snapshot v3 round-trips; and the same-machine determinism gate is green. All 99 tests, the determinism gate (14), typecheck and lint are green on the committed tree (`4414e12`).

Independently re-ran in this pass: `pnpm vitest run tests/sim/collision-groups.test.ts tests/sim/physics-composite.test.ts` → **13 passed**; `pnpm gate` → **3 files / 14 tests passed**; `pnpm test` → **15 files / 99 tests passed**. Debt-marker scan (`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not implemented`) over the phase-modified physics sources → **no matches**.

The fresh code review's new **CR-01** (non-atomic `BattleSim.spawn()` leaving a ghost entity when the pool is exhausted) is **real but out of the phase's truths**: it manifests only at **>120 concurrent live units**, which the phase explicitly scopes out as unsupported/deferred, and it does **not** falsify any declared must-have (the allocator does fail loud and does not alias a membership bit). It is recorded below as a **⚠️ WARNING**, not a `gaps_found` blocker. See "Anti-Patterns" and the note under Advisory.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | R-SC1 — A unit spawns as one rigid body carrying independent body, weapon, and armor colliders that can be individually identified | ✓ VERIFIED | `src/sim/world/composite.ts` `spawn()` — 1 body + ball collider + armor collider + separate weapon body (2-anchor `JointData.revolute`); `physics-composite.test.ts#spawns N weapons + N armors…` green. |
| 2 | R-SC2 — A weapon striking another unit emits a typed sim event recording which part (body vs armor) was hit | ✓ VERIFIED | `contact.ts` `drain()` emits `IContactEvent{partA,partB,armorA,armorB,dv}`; `contact.test.ts` Tests 2/3/6 green. |
| 3 | R-SC3 — Physics on the Rapier2D deterministic build with a fixed step; determinism fingerprint stays green after physics | ✓ VERIFIED | `@dimforge/rapier2d-deterministic-compat@0.21.0` exact pin; `physics-gate.test.ts` double-run identical; `gate.test.ts`; gate 14/14. |
| 4 | R-SC4 — Cross-machine fingerprint stable + fast weapons do not tunnel (CCD configured) | ✓ VERIFIED (cross-machine half RELAXED by D-17) | `setCcdEnabled(true)` + `maxCcdSubsteps`; `ccd.test.ts` 240 m/s vs 0.06 m target → 1 hit with CCD / 0 without. Cross-machine half relaxed to same-machine by CONTEXT D-17 (per task note); no `.github/workflows`. |
| 5 | P-02-01 — `initPhysics()` idempotent; a `RAPIER.World` constructable afterwards (D-21) | ✓ VERIFIED | `physics-init.ts` module latch; `rapier-version.test.ts` idempotence + Node World step green. |
| 6 | P-02-01 — `rapierVersion()` returns exactly `'0.21.0'` (D-19) | ✓ VERIFIED | `rapier-version.test.ts#版本被精确钉定` green. |
| 7 | P-02-01 — version smoke test asserts a golden fingerprint stable across two in-process constructions (D-19) | ✓ VERIFIED | `GOLDEN_RAPIER_FINGERPRINT = 'e1b1f66b73551'`; test green. |
| 8 | P-02-01 — user explicitly approved the D-18 variant substitution | ✓ VERIFIED (recorded) | Recorded in 02-01-SUMMARY + `.planning/STATE.md`; observable outcome (`-compat` exact-pinned) matches. Human approval itself is a process artifact — see Human Verification. |
| 9 | P-02-01 — `-compat` exact-pinned (no `^`/`~`) and lockfile records `0.21.0` (D-19) | ✓ VERIFIED | `package.json` `"@dimforge/rapier2d-deterministic-compat": "0.21.0"`; lockfile records `0.21.0`. |
| 10 | P-02-01 — every new physics constant has a single source; no inline numeric literals on the physics path (D-06/D-35) | ✓ VERIFIED | Engine constants in `src/config/sim.ts`; content in `src/sim/content/physics.ts`; group-bit constants re-sourced to `GROUP_BIT_COUNT`/`GROUP_MEMBERSHIP_BITS_PER_UNIT`/`GROUP_UNIT_CAPACITY`. |
| 11 | P-02-01 — `pnpm gate` (tests/determinism) stays green once the shared setup is wired | ✓ VERIFIED | Ran `pnpm gate` → 3 files / 14 tests passed, exit 0. |
| 12 | P-02-01 — WASM resolves under plain Node with no bundler plugin / `.wasm` asset config (D-23) | ✓ VERIFIED | `vitest.config.ts` `environment:'node'` + `setupFiles` only, no wasm plugin; all physics tests init+step under Node. |
| 13 | P-02-01 / P-02-02 — determinism gating is same-machine only; no cross-machine golden hash, no CI job (D-17) | ✓ VERIFIED | No `.github/**`; only same-machine double-run gates exist. |
| 14 | P-02-02 — every created collider registered in `handle → (entityId, part[, armorSubtype])`; `lookup` resolves and returns `null` (never throws) for unregistered handles (PHYS-01) | ✓ VERIFIED | `PhysicsWorld.registerPart/lookupPart`; `physics-gate.test.ts` null-guard green. |
| 15 | P-02-02 — a weapon-vs-armor collision-enter emits one typed `IContactEvent`, correct parts, `dv > 0` (PHYS-02) | ✓ VERIFIED | `physics-gate.test.ts` typed-contact tests green. |
| 16 | P-02-02 — two runs of the same fixed scenario → identical per-tick fingerprints AND identical Rapier `takeSnapshot()` hashes (D-20) | ✓ VERIFIED | `physics-gate.test.ts#same scenario double-run…` green. |
| 17 | P-02-02 — Rapier entities created in `store.ids()` order, never from `Map`/`Set` iteration (Pitfall 3) | ✓ VERIFIED | `BattleSim.spawn`/`run-physics.ts` drive creation by ordered id; factory `units` Map is lookup-only. |
| 18 | P-02-02 — the weapon swings continuously in a reciprocating arc driven by numeric constants, no AI (D-25) | ✓ VERIFIED (subsystem; integration caveat W-02) | `CompositeFactory.driveSwing` (θ'=A·ω·cos(phase)); `physics-composite.test.ts#weapon swings continuously` green. Not invoked by `BattleSim.step()` — see W-02. |
| 19 | P-02-03 — after `BattleSim.step()` each unit's pose is mirrored from Rapier; store is a read-only mirror (D-34) | ✓ VERIFIED | `battle-sim.ts` `mirrorAndClamp()`; `commands.test.ts` mirror tests green. |
| 20 | P-02-03 — `snapshot()` v3 round-trips with physics (D-34) | ✓ VERIFIED | `VERSION = 3`; `commands.test.ts` + `snapshot.test.ts` byte-identity green. |
| 21 | P-02-03 — same seed + same scenario → identical per-tick fingerprint trace after physics (D-17) | ✓ VERIFIED | `commands.test.ts#same seed + same command log…after physics`; `gate.test.ts` green. |
| 22 | P-02-03 — `CommandKind.Force`/`Torque` route through Rapier impulse APIs, not direct `xform` mutation | ✓ VERIFIED | `battle-sim.ts` `applyImpulse`/`applyTorqueImpulse`; no `xform.vx +=` on the Force path. |
| 23 | P-02-03 — D-33 safety belt clamps position/velocity only when outside the 1000×1000 m safe area, under `store.ids()` iteration | ✓ VERIFIED | `mirrorAndClamp()`; `commands.test.ts#D-33 safety belt…` green. |
| 24 | P-02-04 — `CompositeFactory` accepts `{weapons,armors}`; N weapon bodies + N armor colliders tagged `ArmorSubtype` (D-26) | ✓ VERIFIED | `composite.ts` array loops; `physics-composite.test.ts#spawns N weapons + N armors…` green. |
| 25 | **P-02-04 — unit-level `InteractionGroups`: same-unit parts mutually non-damaging while enemy units still collide (D-27)** | **✓ VERIFIED** (was ✗ FAILED) | Replaced modulo alias with a live pool of **distinct 2-bit masks** (`C(16,2)=120`), release on `despawn`, fail-loud on exhaustion. `collision-groups.test.ts` asserts all `C(20,2)` pairs interact + self-exclusion; `physics-composite.test.ts#units whose ids differ by a multiple of 16 physically collide` (1 & 17) passes; `pnpm vitest` on both files → 13 passed. |
| 26 | P-02-04 — `despawn(entityId)` removes body/colliders/joint in ordered fashion, leaving no dangling part-map handle | ✓ VERIFIED | `composite.ts` `despawn`/`removeBody` (also releases the membership mask); `physics-composite.test.ts#despawn…` green. |
| 27 | P-02-04 — CCD enabled on weapon bodies; fast weapon vs dynamic target = exactly 1 hit with CCD, 0 without | ✓ VERIFIED | `ccd.test.ts` parametrized contrast + `isCcdEnabled()` green. |
| 28 | P-02-04 — weapon angular velocity oscillates continuously over N steps (sustained), not a one-step spike | ✓ VERIFIED | `physics-composite.test.ts#weapon swings continuously…` (sign changes ≥2, sustained tail). |
| 29 | P-02-05 — head-on 8 m/s approach yields `dv ≈ 8` from PRE-STEP velocities | ✓ VERIFIED | `contact.test.ts` Test 1 (`|dv − 8| < 0.2`). |
| 30 | P-02-05 — weapon-vs-armor/body naming, null guard, enter-only, census, part-map f64 round-trip, real `BattleSim` → `EventLog` contact | ✓ VERIFIED | `contact.test.ts` Tests 2–6, `snapshot.test.ts` census; all green. |
| 31 | 02-06 — Membership masks drawn from a deterministic live-unit pool, released on despawn; allocation is order-stable (same sequence → identical encoded `InteractionGroups`), gate stays green (D-17) | ✓ VERIFIED | `composite.ts` `enumerateMembershipPool`/`freeMasks` (LIFO pop/push); `collision-groups.test.ts#two identical spawn/despawn sequences yield byte-identical collision-group values` green; gate 14/14. |
| 32 | 02-06 — A spawn that would exhaust the pool fails loud (throws) instead of silently aliasing another live unit's membership bit | ✓ VERIFIED | `unitMembership` throws naming `GROUP_UNIT_CAPACITY`; `collision-groups.test.ts#spawning exactly GROUP_UNIT_CAPACITY (120) units succeeds; one more throws (fail loud)` green. (Module-level pool/capacity guard throws at import on desync.) |
| 33 | 02-06 — Two units whose ids differ by a multiple of 16 (e.g. 1 and 17 — the previously-aliased family) physically collide | ✓ VERIFIED | `physics-composite.test.ts#units whose ids differ by a multiple of 16 physically collide` green (real contact `a=1,b=17`). |
| 34 | 02-06 — After `restore()`, `BattleSim` re-seeds the factory's live-unit index and membership pool, so a restored unit despawns (handles resolve `null`, counts drop) and a later spawn never aliases a restored unit | ✓ VERIFIED | `battle-sim.ts` `restore()` derives map from `store.ids()`; `composite.ts` `reseed`; `physics-composite.test.ts#BattleSim restore re-seeds the factory…` + factory-level case green. |

**Score:** 34/34 truths verified; 0 present-but-behavior-unverified. (30 prior truths — the D-27 one flipped FAILED→VERIFIED — plus 4 new 02-06 truths; 02-06's ">16 pair still collides" restatement is folded into row 25.)

### Requirement Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PHYS-01 | 02-02, 02-03, 02-04, **02-06** | Units are compound rigid bodies: body/weapon/armor are independent colliders, tagged by part | ✓ SATISFIED | Composite factory + part map + unit-level groups (rows 1, 14, 17, 24, 25, 26, 31–34). |
| PHYS-02 | 02-02, 02-05 | Physics contacts become typed sim events recording the hit part | ✓ SATISFIED | `ContactBridge`; rows 2, 15, 29, 30. |
| PHYS-03 | 02-01, 02-02, 02-03, 02-04, 02-05 | Uses the Rapier2D deterministic build | ✓ SATISFIED | `-compat@0.21.0` exact pin + version smoke; rows 3, 4, 6, 9, 11, 20, 21, 27. |

All three phase requirement IDs declared across the six PLAN frontmatters (02-01→PHYS-03; 02-02→PHYS-01/02/03; 02-03→PHYS-01/03; 02-04→PHYS-01/03; 02-05→PHYS-02/03; 02-06→PHYS-01) are accounted for; `REQUIREMENTS.md` maps exactly these three to Phase 2. **No orphaned requirements.** (`REQUIREMENTS.md`'s Status column still reads PHYS-02/03 "Gaps Found" from the prior pass — stale text, not a code defect; PHYS-01 is marked Complete.)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/sim/world/physics-init.ts` | Idempotent WASM init + version | ✓ VERIFIED | latch + `rapierVersion()`. |
| `src/sim/content/physics.ts` | Content physics constants | ✓ VERIFIED | import-free pure data; new group-bit constants + capacity doc corrected. |
| `src/config/sim.ts` | Engine physics constants | ✓ VERIFIED | import-free. |
| `src/sim/world/physics-world.ts` | Deterministic world + pre-step capture + part map | ✓ VERIFIED | `step()` captures before `world.step`. |
| `src/sim/world/composite.ts` | Composite factory (spawn/driveSwing/despawn) + live-pool allocator | ✓ VERIFIED | `enumerateMembershipPool` (120 distinct 2-bit masks), `unitMembership` (fail-loud), `despawn` (mask release), `reseed`; module-level capacity guard. |
| `src/sim/world/contact.ts` | Typed contact bridge (pre-step Δv, null guard) | ✓ VERIFIED | delegates part map to `IPhysicsWorld`. |
| `src/sim/core/events.ts` | Numeric `PartKind`/`ArmorSubtype`, extended `IContactEvent` | ✓ VERIFIED | named interfaces. |
| `src/sim/battle-sim.ts` | Physics-wired step, impulses, mirror, safety belt; `despawn`/`restore` re-seed | ✓ VERIFIED | restore derives restored map from `store.ids()`; new `despawn(entityId)`. |
| `src/sim/snapshot.ts` | Snapshot v3 | ✓ VERIFIED | `VERSION = 3`. |
| Test files (collision-groups, physics-composite, ccd, contact, snapshot, commands, physics-gate, rapier-version) | Verification surfaces | ✓ VERIFIED | all present and green. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `BattleSim.step()` | `PhysicsWorld.step` → `ContactBridge.drain` → `EventLog` | same-tick drain | ✓ WIRED | `contact.test.ts` Test 6 drives the real `BattleSim`. |
| `store.ids()` order | Rapier creation/deletion order | ordered loops | ✓ WIRED | factory `units` Map lookup-only. |
| `snapshot.ts` v3 bytes | Rapier `takeSnapshot()` + part map | `deserializeState` | ✓ WIRED | round-trip byte-identity + part-map resolution green. |
| `CompositeFactory.spawn` | live-pool membership → encoded `InteractionGroups` on colliders | `unitMembership`→`interactionGroups` | ✓ WIRED (new) | `collision-groups.test.ts` reads real `collisionGroups()` and asserts every pair. |
| `CompositeFactory.despawn` | returns mask to pool → later `spawn` reuses a free mask | `freeMasks.push`/`pop` | ✓ WIRED (new) | release test green. |
| `BattleSim.restore` | `CompositeFactory` with restored live-unit map → membership re-seed | constructor `restoredUnits` | ✓ WIRED (new) | BattleSim-level `restore → despawn → spawn` case green. |
| `CompositeFactory.driveSwing` | `BattleSim.step()` | — | ⚠️ NOT WIRED (W-02, deferred to Phase 4) | Derived integration check, not a declared must-have key link; `driveSwing` is implemented + tested at the factory level but `step()` never calls it. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `IContactEvent.dv` | `dv` | `PhysicsWorld.preStepVelocities` captured before `world.step` | Yes (head-on 8 m/s → ≈8; post-step would be ~0) | ✓ FLOWING |
| `IUnitXform.{x,y,rotation,vx,vy,angularVelocity}` | pose mirror | Rapier `translation()/rotation()/linvel()/angvel()` in `mirrorAndClamp()` | Yes (anti-vacuous motion > 1/256 grid) | ✓ FLOWING |
| part map (`colliderHandle → ref`) | `IUnitPartRef` | every `createCollider` registration | Yes (lookup resolves; round-trips through snapshot) | ✓ FLOWING |
| live membership pool | encoded `InteractionGroups` | `enumerateMembershipPool()` → real collider `collisionGroups()` | Yes (20-unit C(20,2) predicate + id-1/17 physical contact) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| D-27 regression suite (+ composite factory) | `pnpm vitest run tests/sim/collision-groups.test.ts tests/sim/physics-composite.test.ts` | 2 files / 13 tests passed, exit 0 | ✓ PASS |
| Determinism gate | `pnpm gate` | 3 files / 14 tests passed, exit 0 | ✓ PASS |
| Full suite | `pnpm test` | 15 files / 99 tests passed, exit 0 | ✓ PASS |
| Exact-pin + deterministic build only | `package.json` grep | only `"@dimforge/rapier2d-deterministic-compat": "0.21.0"` | ✓ PASS |
| No stub/debt markers on physics paths | `TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER\|not implemented` over phase-modified src | no matches | ✓ PASS |
| `groupMembership` not modulo-aliased; capacity guard present | code trace `composite.ts` | `freeMasks.pop()` + throw naming `GROUP_UNIT_CAPACITY`; import-time pool-length assertion | ✓ PASS |

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/sim/collision-groups.test.ts` | PHYS-01 | 4 | 0 | No | Behavioral (C(20,2) predicate, exhaustion throw, reuse, byte-identity) | ✓ SOUND |
| `tests/sim/physics-composite.test.ts` | PHYS-01/03 | 9 | 0 | No | Behavioral (real contacts, handle resolution, restore glue) | ✓ SOUND |
| `tests/sim/contact.test.ts` | PHYS-02/03 | 6 | 0 | No | Value (Δv ≈ 8) + Behavioral (real BattleSim drain) | ✓ SOUND |
| `tests/sim/ccd.test.ts`, `snapshot.test.ts`, `commands.test.ts`, `tests/determinism/*` | PHYS-01/02/03 | — | 0 | No | Behavioral / Value | ✓ SOUND |

**Disabled tests on requirements:** 0 → no BLOCKER. **Circular patterns:** 0 → no BLOCKER. (Expected values derive from physical constants / independent predicates, not from the system under test.) **Insufficient assertions:** 0.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/sim/battle-sim.ts` | 156-161 | `spawn()` non-atomic across the new fail-loud exhaustion boundary (fresh review CR-01) | ⚠️ Warning | `store.spawn()` runs before `factory.spawn` throws; an exhausted spawn leaves a ghost entity whose placeholder `bodyHandle: 0` aliases a live body (`mirrorAndClamp()` would mirror body 0 into it). Reachable only at **>120 concurrent live units** (explicitly unsupported/deferred). Does **not** falsify a must-have — the allocator fails loud and never aliases a membership bit (truth #32). Fix: roll back on throw (`try { … } catch { store.despawn(id); throw }`) or pre-check capacity. |
| `src/sim/battle-sim.ts` | 237-254 | `driveSwing` never invoked by `step()` (W-02 / IN-05) | ⚠️ Warning | In the live sim weapons do not actively oscillate; D-25 integration deferred to Phase 4 (recorded in STATE.md). Subsystem truth #18/#28 verified at the factory level. |
| `src/sim/world/composite.ts` | 401-419 | `reseed` restores the membership set but not the free-list order (fresh review WR-01) | ⚠️ Warning | A post-`restore` spawn can receive a different (functionally-equivalent) mask → `restore+spawn` byte-exact continuation differs. No gate fails; D-17 same-sequence determinism unaffected. |
| `src/sim/battle-sim.ts` | 425-444 | `restore()` non-atomic if the re-seed defensive throw fires (fresh review WR-02) | ⚠️ Warning | Could leave `this.factory` bound to the old world while `simState.physics` is new. Defensive path only. |
| `src/sim/world/composite.ts` / `src/sim/snapshot.ts` | 406-417 / 344 | `reseed` trusts a `bodyHandle` that may be the `?? 0` fallback (WR-03) | ⚠️ Warning | Pre-existing `bodyHandle ?? 0` hazard could read another unit's groups on a corrupt snapshot. |
| `tests/sim/physics-composite.test.ts` | 360-405, 407-450 | "does not alias" restore assertions non-discriminating below capacity (WR-04) | ⚠️ Warning | The despawn/handle-drop half is discriminating; the no-alias half could pass without reserving masks. |
| `src/sim/snapshot.ts` | 129 / 199-206 | Part map serialized in `Map` insertion order (WR-05) | ⚠️ Warning | Byte order depends on spawn/despawn history; untested divergence path. |
| `src/sim/battle-sim.ts` | 268-318 | `atTick` validated but never enforced (WR-01, pre-existing) | ⚠️ Warning | Phase-1 command contract gap; async replay could diverge. |
| `src/sim/systems/movement.ts` | 24-32 | Superseded Phase-1 nudge system still present | ℹ️ Info | Not called by `step()`. |

Re-verification evidence gate (#3304): N/A for a `gaps_found`→blocker decision — **no** truth/artifact/link failed on this pass, and the only new-scope anti-pattern (CR-01) was categorized as a **warning** (out-of-phase-truth robustness issue on a >120-unit path), so it does not enter the Step 7 blocker set and needs no evidence-gate disposition. It is surfaced here for human awareness regardless.

### Advisory (New Scope, Unevidenced)

New-scope findings from Step 7 with no deterministic evidence — reported, not blocking.

| # | Finding | Category | Why Advisory |
| --- | --- | --- | --- |
| — | None | — | No unevidenced new-scope blocker was raised; the one new-scope defect (CR-01) is code-traced and recorded as a warning above. |

### Human Verification

N/A — Infrastructure/foundation phase. Phase 2's goal and success criteria are entirely technical (compound rigid bodies, typed contact events, determinism) with no user-facing UI/CLI/external service. Per the infrastructure-phase scoping gate, human verification is auto-passed; `human_verification: []`. No truth is ⚠️ PRESENT_BEHAVIOR_UNVERIFIED or ⚠️ `insufficient_spec`.

*(Recorded for the record, not a blocking item: the plan-02-01 `checkpoint:human-verify gate="blocking-human"` — the D-18 variant substitution `@dimforge/rapier2d-deterministic` → `-deterministic-compat` — is recorded as user-approved in 02-01-SUMMARY and `.planning/STATE.md`. Its observable outcome — the `-compat` package installed, exact-pinned, version-guarded — is verified (row 8/9). The approval itself is a process artifact not re-derivable from code.)*

### Gaps Summary

**None.** The single prior gap — the ≥17-unit D-27 collision-group truth — is closed. The `(entityId-1) % 16` membership alias is gone; masks now come from a deterministic live pool of 120 distinct 2-bit masks, released on despawn, failing loud at capacity, and re-seeded on `restore`. Distinct units collide, same-unit parts do not, and the same-machine determinism gate is green. The remaining items are warnings (deferred D-25 integration, pre-existing snapshot hazards, and the out-of-scope non-atomic exhausted-spawn robustness defect) — none falsifies a must-have or the phase goal.

---

_Verified: 2026-10-16T10:21:57Z_
_Verifier: the agent (gsd-verifier)_
