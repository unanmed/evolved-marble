---
phase: 02-physics-simulation
verified: 2026-10-19T08:05:31Z
status: gaps_found
score: 11/12 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/phases/02-physics-simulation/02-CONTEXT.md
  - .planning/phases/02-physics-simulation/02-DISCUSSION-LOG.md
  - .planning/phases/02-physics-simulation/02-RESEARCH.md
  - .planning/phases/02-physics-simulation/02-VALIDATION.md
  - .planning/phases/02-physics-simulation/02-01-PLAN.md
  - .planning/phases/02-physics-simulation/02-02-PLAN.md
  - .planning/phases/02-physics-simulation/02-03-PLAN.md
  - .planning/phases/02-physics-simulation/02-04-PLAN.md
  - .planning/phases/02-physics-simulation/02-05-PLAN.md
  - .planning/phases/02-physics-simulation/02-06-PLAN.md
  - .planning/phases/02-physics-simulation/02-01-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-02-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-03-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-04-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-05-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-06-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-REVIEW.md
  - .planning/phases/02-physics-simulation/02-REVIEW-FIX.md
  - package.json
  - pnpm-lock.yaml
  - tsconfig.json
  - vitest.config.ts
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
  - tests/helpers/rng.ts
covered_digest: "v1:sha256:44d8c6832b7843f85f149ff14745f95daf273503e9c364a389713f880b4f96fc"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "For a rotating compound body, Δv is the pre-step contact-point relative velocity (v_com + ω×r measured about the center of mass) projected onto the world-space contact normal (PHYS-03)."
    status: failed
    reason: "The WR-02 review fix adds the ω×r term but measures the moment arm from the rigid-body origin (`body.translation()`) instead of the center of mass. Rapier's `linvel()` is the COM velocity and rotation is about the COM, so the two must be paired. With the default compound geometry (body mass 70 at the local origin + hammer mass 25 at local x = 0.7) the COM sits 0.184 m from the origin, so the error scales as |ω|·0.184 m/s. Measured end-to-end: emitted deltaV 18.186 vs COM-correct 9.648 (88% error) at ω = 46.4 rad/s; at a gentler ω = 3.78 rad/s the emitted 3.763 vs COM-correct 4.264 (11.8% error). The emitted value matches the translation()-based formula exactly and Rapier's own `velocityAtPoint()` matches the COM-based formula to 2.4e-8, which isolates the reference point as the sole cause."
    artifacts:
      - path: src/physics/PhysicsWorld.ts
        issue: "lines 309-332: `attackerCenter = attackerBody.translation()` / `defenderCenter = defenderBody.translation()` are used as the rotation centre for the ω×r term."
    missing:
      - "Use `body.worldCom()` (or `body.velocityAtPoint({ x: contactX, y: contactY })`) as the rotation centre when adding the ω×r term — not `body.translation()`."
      - "Add a regression test that applies torque, captures a damage event, and asserts the emitted deltaV equals the COM-based contact-point velocity. No committed test calls `applyTorque` at all today, so the WR-02 change is entirely untested."
      - "After the fix, re-confirm spin/charge damage magnitude in playtest (WR-02's original calibration concern)."
---

# Phase 2: 物理模拟系统 Verification Report

**Phase Goal:** 用 Rapier2D 复合刚体承载单位，把物理接触转为带部位标记的类型化事件，并按文档公式完成伤害与防具减伤计算，以固定步长 tick 推进。
**Verified:** 2026-10-19T08:05:31Z
**Status:** gaps_found
**Re-verification:** No — initial verification (no prior VERIFICATION.md)

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | **PHYS-01** — a unit is one compound `RigidBody` whose body / weapon / armor are separate, part-tagged colliders with their own masses | ✓ VERIFIED | `PhysicsWorld.registerUnit` creates one dynamic body + `ColliderDesc.ball(bodyRadius)` (mass = spec.mass) + `capsule(...)` at `(weaponOffsetX, 0)` (mass = weapon.mass) + one `ball(armorRadius)` per armor (mass = armor.mass), indexing each handle as `{unitId, part, weaponKind?, armorKind?}` (`PhysicsWorld.ts:87-149`). Probe: `body.mass()` = 94.99999 for 70 + hammer 25 (per-collider masses sum); `compound.test.ts#sums per-collider masses` passes. |
| 2 | **PHYS-02** — inter-unit contact becomes a typed, part-tagged event that distinguishes body / weapon / armor | ✓ VERIFIED | `tick()` calls `#eventQueue.drainCollisionEvents`, ignores `!started`, skips missing handles and same-unit pairs, and pushes `{unitAId, partA, unitBId, partB}` (`PhysicsWorld.ts:226-244`). Probe: 3 contacts on the first tick, then 0 for 29 further ticks (no `stopped` leakage); `events.test.ts` (4 tests) green. |
| 3 | **PHYS-03** — damage mean is exactly `max[A_A·P_A·W_A·(√Δv − 1), 0]` | ✓ VERIFIED | `computeDamageMean` (`damage.ts:31-45`) is a literal transcription with a finite/non-negative Δv guard. `damage.test.ts` pins 60·1·1.2·(√9−1)=144, 80·1·0.8·(√4−1)=64, and the `max(…,0)` clamp at Δv 1 / 0.25 / 0. All 11 damage tests pass. |
| 4 | **PHYS-03** — normal jitter is σ = mean/20 via the shared `sampleNormal` (no physics-local sampler) | ✓ VERIFIED | `rollDamage` = `sampleNormal(rng, mean, mean / DAMAGE_JITTER_SIGMA_DIVISOR)` with the const = 20 (`damage.ts:19,54-56`); imports `@/common/rng`. 2000 seeded samples reproduce mean ±10% and σ ±25%. |
| 5 | **PHYS-03** — Δv uses PRE-step velocities projected onto the world-space contact normal, never post-step velocities | ✓ VERIFIED | `tick()` snapshots `linvel()`/`angvel()` into `#preVelocities` **before** `#world.step`, reads `manifold.normal()` inside the `contactPair` closure into locals, then projects (`PhysicsWorld.ts:204-217, 285-338`). Probe: emitted `deltaV` = 10.526323318 = pre-step `vx` exactly; post-step `vx` was 6.3636 (would have understated by 4.16). |
| 6 | **PHYS-03 (post-review addition)** — for a rotating compound body, Δv is the pre-step contact-point velocity `v_com + ω×r` measured about the **center of mass** | ✗ FAILED | The ω×r term uses `body.translation()` as the rotation centre (`PhysicsWorld.ts:322-331`). Rapier's `linvel()` is the COM velocity and rotation is about the COM: probe `velocityAtPoint()` matches the `worldCom()` formula to 2.4e-8 and differs from the `translation()` formula by 0.368 m/s at ω=2. End-to-end probe: emitted 18.186 vs COM-correct 9.648 (88% error). See Gap G1. |
| 7 | **PHYS-04** — armor hits apply the D-11 sign-consistent reduction using the struck armor's kind; body hits apply no reduction | ✓ VERIFIED | `defenderTag.part === Armor` → `armorKind` from the collider tag, `penetration = weapon.penetration[armorKind]`, `computeDamageReduction(rolled, defense, armorRatio, armorDef.defenseRatio, penetration)`; `Body` leaves `armorKind` undefined and `damageReduced` 0 (`PhysicsWorld.ts:348-373`). `computeDamageReduction` uses `B_A = penetration` (not its reciprocal) — `damage.test.ts` pins hammer pen 5 → 96.30 vs bow pen 0.2 → 51.02 at D_R 100. |
| 8 | **PHYS-04** — at most one damage event per `(attackerId, defenderId)` per tick, and the armor hit beats the enclosed body hit | ✓ VERIFIED | `damageCandidates` map keyed by `${attackerId}:${defenderId}` with armor-over-body precedence and a larger-`damageReduced` / smaller-`armorKind` tie-break (`PhysicsWorld.ts:388-424`). Probe: on the co-occurrence tick the result was exactly one event, `defenderPart = Armor`, `armorKind = Helmet`, `damageReduced = 9.83`, no Body event; `tick.test.ts#emits exactly one damage event per pair per tick…` passes. |
| 9 | **PHYS-05** — `tick()` advances exactly one fixed step at `dt = 1/60`, consults no wall-clock, and consumes per-tick forces | ✓ VERIFIED | `#world.timestep = config.dt` (1/60 in every caller), one `#world.step(#eventQueue)` per `tick()`, then `resetForces/resetTorques` (`PhysicsWorld.ts:83,217,426-429`). Grep: no `Date.now` / `performance.now` / `setTimeout` / `rAF`. Probe: after one forced tick `vx = 0.0142857`, unchanged on the next two ticks (force consumed exactly once). `DT = 1/60` in `constants.ts:14`. |
| 10 | Harness — `@dimforge/rapier2d-compat` is pinned to exactly `0.21.0`, WASM initialises under Vitest, the whole suite is green, and a deterministic `IRng` helper exists | ✓ VERIFIED | `package.json` → `"@dimforge/rapier2d-compat": "0.21.0"` (no range); `pnpm-lock.yaml` entry present; `rapier-harness.test.ts` awaits `RAPIER.init()`, asserts `RAPIER.version() === '0.21.0'`, frees world + queue. `tests/helpers/rng.ts` exports `mulberry32(seed): IRng` from `@/common/types`. `pnpm test` → 14 files / 112 tests passed. |
| 11 | Type contract — declarations only: numeric `ColliderPart` (0/1/2), JSDoc'd `I*` interfaces, no class/function/const/Rapier, absent-object `null` vs absent-literal `undefined` | ✓ VERIFIED | `src/physics/types.ts` (212 lines) declares `ColliderPart` + `IColliderTag`, `IVelocitySnapshot`, `IUnitPhysicsSpec`, `IUnitState`, `IContactEvent`, `IDamageEvent`, `IPhysicsTickResult`, `IPhysicsGeometry`, `IPhysicsConfig`, `IPhysicsWorld`; only import is `import type … from '@/units/types'`; no runtime body. `types.test.ts` pins Body=0 / Weapon=1 / Armor=2. `weapon: IWeaponDef \| null`, `armors: readonly IArmorDef[]`, `weaponKind?`/`armorKind?`. |
| 12 | Constants — `DT` (1/60) and `DEFAULT_GEOMETRY` are the single calibration surface, every top-level const JSDoc'd | ✓ VERIFIED | `constants.ts:14` `DT = 1 / 60`; `DEFAULT_GEOMETRY` with bodyRadius 0.5, weaponHalfLength 0.4, weaponRadius 0.05, weaponOffsetX 0.7, armorRadius 0.55, each field JSDoc'd; the accepted WR-05 non-directional-armor limitation is documented inline. |

**Score:** 11/12 truths verified (0 present, behavior-unverified)

### Deferred Items

None. The failing truth is Phase-2 physics work (PHYS-03); no later milestone phase covers it (Phase 3 is control, Phase 4 kingdom, Phase 5 render).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/physics/types.ts` | Physics type contract, declarations only | ✓ VERIFIED | 212 lines; numeric enum + 10 interfaces; JSDoc on every member; only a type-only `@/units/types` import; no Rapier, no logic. |
| `src/physics/constants.ts` | `DT` + `DEFAULT_GEOMETRY` | ✓ VERIFIED | 42 lines; both exports JSDoc'd; geometry complete. |
| `src/physics/damage.ts` | Pure damage/armor math | ✓ VERIFIED | 127 lines; 5 exported functions + `DAMAGE_JITTER_SIGMA_DIVISOR`; imports `@/common/rng` and `@/physics/types`; no Rapier import (the word "Rapier" appears only in the header comment). |
| `src/physics/PhysicsWorld.ts` | `class PhysicsWorld implements IPhysicsWorld` | ⚠️ PRESENT — one defective computation | 446 lines; implements the full contract with no extra public members; compound assembly, handle index, lifecycle, actuators, fixed-step tick, contact bridge and damage pipeline all wired. The ω×r moment-arm defect is at 309-332 (Gap G1). |
| `tests/physics/rapier-harness.test.ts` | Wave-0 WASM smoke test | ✓ VERIFIED | Awaits init, pins `RAPIER.version()`, steps a world, frees both objects. |
| `tests/physics/types.test.ts` | Enum ordinal + alias proof | ✓ VERIFIED | Imports `@/physics/types`; pins 0/1/2; distinctness. (Contains one vacuous `[0,1,2]` loop — see IN-3.) |
| `tests/physics/damage.test.ts` | Formula + jitter + D-11 sign proof | ✓ VERIFIED | 11 tests, all hand-computed values and the reciprocal-falsifying sign assertion. |
| `tests/physics/compound.test.ts` | Mass / lifecycle / state / one-step | ✓ VERIFIED | 5 tests incl. dispose idempotency and re-registration after removal. |
| `tests/physics/events.test.ts` | Scripted contacts, part tags, no self-events | ✓ VERIFIED | 4 tests; lone-unit case emits nothing. |
| `tests/physics/tick.test.ts` | Damage integration + exclusivity | ✓ VERIFIED | 6 tests incl. the manifold-less skip and the deterministic co-occurrence case. |
| `tests/helpers/rng.ts` | Deterministic `IRng` helper | ✓ VERIFIED | `mulberry32(seed)` → `IRng`; type-only import from `@/common/types`. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `PhysicsWorld.ts` | `physics/types.ts` | `implements IPhysicsWorld`, returns `IUnitState \| null`, `IPhysicsTickResult` | ✓ WIRED | Typecheck exit 0; `ColliderPart`, `IColliderTag`, `IVelocitySnapshot`, `IDamageEvent` all consumed. |
| `PhysicsWorld.ts` | `physics/damage.ts` | `computeDamageMean`, `computeDamageReduction`, `rollDamage`, `isDamageBearingPair` | ✓ WIRED | All four imported and called inside `tick()` (lines 26-31, 247, 340, 346, 362). |
| `PhysicsWorld.ts` | `physics/constants.ts` | "reads DT and DEFAULT_GEOMETRY" | ⚠️ PARTIAL (intentional) | The class reads `config.dt` / `config.geometry`; `DT`/`DEFAULT_GEOMETRY` are supplied by the callers (`tick.test.ts`, `compound.test.ts`, `events.test.ts`). This matches 02-04's own task text (constructor `(config, rng)`) but not its key-link wording. Dependency injection is arguably the better shape; no behavioural gap. |
| `PhysicsWorld.ts` | `@dimforge/rapier2d-compat` | `World`, `EventQueue`, `RigidBodyDesc`, `ColliderDesc`, `contactPair` | ✓ WIRED | `RAPIER.init()` precondition documented; harness/tests await it. |
| `tests/physics/*` | `@/physics/PhysicsWorld` | construct + exercise public contract | ✓ WIRED | 5 integration files, 112 tests green. |
| `tests/physics/*` | `tests/helpers/rng.ts` | `mulberry32(fixedSeed)` | ✓ WIRED | Injected into every `PhysicsWorld` construction. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `PhysicsWorld.tick()` | `contacts[]` | `EventQueue.drainCollisionEvents` → `#index` tag lookup | Yes — probe emitted 3 real part-tagged contacts for a scripted overlap | ✓ FLOWING |
| `PhysicsWorld.tick()` | `damages[]` | pre-step velocity snapshot + `contactPair` normal/contact point → `computeDamageMean` → `rollDamage` → armor lookup → `damageCandidates` | Yes — probe emitted real values (e.g. deltaV 15.96, damageMean 269.60, damage 255.95, damageReduced 9.83) | ⚠️ FLOWING BUT WRONG FOR ROTATION — the contact-point term is computed about the body origin (G1) |
| `PhysicsWorld.getUnitState()` | `IUnitState` | `body.translation()/rotation()/linvel()/angvel()` | Yes — probe: torque 500 → angvel 0.429; force 60 → vx 0.0142857 | ✓ FLOWING |
| `computeDamageMean` | `damageMean` | `attack`, `weaponRatio`, `weapon.attackRatio` from the retained spec + event `deltaV` | Yes — test recomputes from the event's own deltaV and matches to 6 dp | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite | `pnpm test` | 14 files / 112 tests passed | ✓ PASS |
| Type gate | `pnpm typecheck` | exit 0 | ✓ PASS |
| Lint gate | `pnpm lint` | exit 0 | ✓ PASS |
| Presence checks (all plan `<automated>` node scripts) | `PHYS_TYPES` / `DAMAGE` / `CONSTANTS` / `WORLD` / `EVENTS` / `DAMAGES` | all `OK` | ✓ PASS |
| Fixed step / force consumed once | throw-away probe: force 60, then 3 ticks | vx 0.0142857 / 0.0142857 / 0.0142857 | ✓ PASS |
| `applyTorque` drives the body | throw-away probe: torque 500, one tick | angvel 0 → 0.4295 | ✓ PASS |
| Handle index survives remove + re-register | throw-away probe: remove unit 7, re-register with weapon+armor next to unit 2 | new tags `Armor`/`Body` observed; no stale tag | ✓ PASS |
| Co-occurring armor+body strike → exactly one (armor) event | throw-away probe: force 7000 × 80 ticks | 1 event, `defenderPart=Armor`, `damageReduced=9.83`, no Body event | ✓ PASS |
| Δv comes from pre-step velocity | throw-away probe: captured pre/post `vx` around the hit | emitted 10.526323318 = pre-step exactly; post-step 6.3636 | ✓ PASS |
| Rotating contact-point Δv | throw-away probe: force + torque, capture the manifold point | emitted 18.186 vs COM-correct 9.648 (88% error) | ✗ FAIL |
| No `stopped` events leak | throw-away probe: 30 ticks after first contact | contacts `[3,0,0,…]` | ✓ PASS |

### Probe Execution

No probe scripts are declared by the plans and no `scripts/*/tests/probe-*.sh` exist in the repository — not applicable to this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PHYS-01 | 02-01, 02-02, 02-04 | 单位由 Rapier2D 复合刚体表示，本体/武器/防具为独立碰撞体并按部位打标 | ✓ SATISFIED | Truth 1; per-collider mass probe; handle index; `removeUnit` purge. |
| PHYS-02 | 02-02, 02-05 | 物理接触转换为带部位标记的类型化模拟事件 | ✓ SATISFIED | Truth 2; `events.test.ts` + probe. |
| PHYS-03 | 02-02, 02-03, 02-06 | 伤害按文档公式计算，含 Δv 与正态抖动（σ = 均值/20） | ⚠️ PARTIAL | Formula and jitter fully verified (Truths 3-5); the rotating-body Δv is wrong (Truth 6 / Gap G1). |
| PHYS-04 | 02-02, 02-03, 02-06 | 防具减伤与破甲按文档公式计算（击中本体不触发减伤） | ✓ SATISFIED | Truths 7-8; D-11 sign proof; body-hit `damageReduced = 0`; one-event-per-pair probe. |
| PHYS-05 | 02-02, 02-04, 02-06 | 模拟以固定步长 tick 推进，1 tick = 游戏 1/60 秒，与渲染解耦 | ✓ SATISFIED | Truth 9; `DT = 1/60`; no wall-clock; force consumed per tick. |

**Orphaned requirements:** none — REQUIREMENTS.md maps PHYS-01..05 to Phase 2 and every ID appears in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/physics/PhysicsWorld.ts` | 322-331 | Rotation centre taken from `translation()` instead of `worldCom()` | 🛑 BLOCKER (G1) | Wrong Δv (up to 88% in probe) for spinning weapons — the exact class of attack (`Spin`/`Charge`) the fix was meant to improve. |
| `src/physics/PhysicsWorld.ts` | 126 | `weaponKind` written into `#index` but never read (damage uses `attackerWeapon.id`) | ℹ️ Info | Dead field; no behavioural impact. |
| `src/physics/damage.ts` | 95-112 | `computeFinalDamage` exported but unused in production (`tick()` inlines `rolled - damageReduced`) | ℹ️ Info | Only a test fixture; plan allowed either form. |
| `src/physics/types.ts` | 153 | JSDoc says "at least one side is `Weapon`"; the implementation requires **exactly** one | ℹ️ Info | Documentation imprecision only. |
| `tests/physics/types.test.ts` | 25-27 | `for (const ordinal of [0,1,2]) expect(Number.isInteger(ordinal))` — asserts on literals | ℹ️ Info | Vacuous assertion; the following loop over real members is meaningful. |
| `tests/physics/tick.test.ts` | 227 | `expect(damage).toBeLessThan(damage + damageReduced)` — tautological given the preceding `damageReduced > 0` | ℹ️ Info | Redundant, not misleading. |

No `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / placeholder markers, no `any`, no `@ts-ignore`, no `eslint-disable` in `src/physics/` or `tests/physics/`. No debt-marker blockers.

### Human Verification Required

Status is `gaps_found`, so this is **not** a human-gated phase; the one open item below becomes relevant only after Gap G1 is fixed:

1. **Spin/charge damage magnitude after the moment-arm fix**
   **Test:** Drive a hammer/spinning unit into a defender in the assembled sim (or a tuned harness) once `worldCom()` replaces `translation()`.
   **Expected:** Spin and charge hits deal damage that reads as "fiercer" than a stationary poke, with no absurd spikes; the value tracks `|ω|·r_com`.
   **Why human:** This is the calibration judgement 02-REVIEW-FIX's WR-02 note deferred; it needs a running sim (Phase 5) and cannot be settled by a numeric assertion alone.

### Gaps Summary

The phase delivers almost everything it promised: the compound body, the part-tagged contact bridge, the exact damage-mean formula with σ = mean/20 jitter, the D-11 sign-consistent armor reduction with body-hit immunity, the per-tick armor-over-body exclusivity guard, and the fixed 1/60 tick are all present, wired, and exercised by 112 green tests plus independent probes.

One truth fails. The code-review fix for WR-02 added the weapon's angular `ω × r` term to Δv, which is the right intent — but it takes the moment arm `r` from `body.translation()` (the rigid-body origin) while Rapier's `linvel()` is the velocity of the **center of mass** and rotation is about the COM. For a compound body the two points differ: with the default geometry (body 70 kg at the origin + hammer 25 kg at local x = 0.7) the COM is 0.184 m off the origin, so the injected velocity error is `|ω| · 0.184` m/s. The probe isolates this cleanly — Rapier's own `velocityAtPoint()` agrees with the `worldCom()` formula to 2.4e-8 and disagrees with the `translation()` formula by 0.368 m/s at ω = 2 — and the end-to-end emitted Δv (18.186) matches the wrong formula while the correct value is 9.648.

Because the error is a deterministic, reproducible computation defect (not a calibration preference), it is recorded as a gap rather than only a human-verification item. The fix is small: use `body.worldCom()` (or `body.velocityAtPoint({ x: contactX, y: contactY })`) as the rotation centre. The absence of any committed test that calls `applyTorque` is why this survived the code review; a regression test pinning the COM-based value should land with the fix. Once fixed, the remaining WR-02 concern — whether spin/charge damage *feels* right — is a playtest calibration item for the assembled sim.

---

_Verified: 2026-10-19T08:05:31Z_
_Verifier: the agent (gsd-verifier)_
