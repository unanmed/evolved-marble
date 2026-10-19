---
phase: 02-physics-simulation
verified: 2026-10-19T10:32:50Z
status: passed
score: 16/16 must-haves verified
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
  - .planning/phases/02-physics-simulation/02-07-PLAN.md
  - .planning/phases/02-physics-simulation/02-01-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-02-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-03-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-04-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-05-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-06-SUMMARY.md
  - .planning/phases/02-physics-simulation/02-07-SUMMARY.md
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
  - tests/physics/rotation.test.ts
  - tests/helpers/rng.ts
covered_digest: "v1:sha256:9b2eaa5f1e154f8e10b902ae1c06684bc1b38c3f0334c8d26b67b345808e1b5e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "For a rotating compound body, Δv is the pre-step contact-point relative velocity (v_com + ω×r measured about the center of mass) projected onto the world-space contact normal (PHYS-03)."
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Spin/charge damage magnitude reads as 'fiercer' than a stationary poke and tracks |ω|·r_com without absurd spikes (WR-02 calibration judgement)"
    addressed_in: "Phase 5"
    evidence: "02-07-PLAN.md output note: 'the WR-02 calibration question ... remains a playtest item for the assembled sim (Phase 5) and is not gated by this plan'; Phase 5 delivers the PixiJS assembled sim where the hit can be watched."
---

# Phase 2: 物理模拟系统 Verification Report

**Phase Goal:** 用 Rapier2D 复合刚体承载单位，把物理接触转为带部位标记的类型化事件，并按文档公式完成伤害与防具减伤计算，以固定步长 tick 推进。
**Verified:** 2026-10-19T10:32:50Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 02-07, commits `8c65448` + `b1d213b`)

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | **PHYS-01** — a unit is one compound `RigidBody` whose body / weapon / armor are separate, part-tagged colliders with their own masses | ✓ VERIFIED | `PhysicsWorld.registerUnit` creates one dynamic body + `ColliderDesc.ball(bodyRadius)` (mass = spec.mass) + `capsule(...)` at `(weaponOffsetX, 0)` (mass = weapon.mass) + one `ball(armorRadius)` per armor (mass = armor.mass), indexing each handle as `{unitId, part, weaponKind?, armorKind?}` (`PhysicsWorld.ts:87-149`). Probe: `body.mass()` = 94.99999 for 70 + hammer 25; `compound.test.ts#sums per-collider masses` passes. |
| 2 | **PHYS-02** — inter-unit contact becomes a typed, part-tagged event that distinguishes body / weapon / armor | ✓ VERIFIED | `tick()` drains `drainCollisionEvents`, ignores `!started`, skips missing handles and same-unit pairs, and pushes `{unitAId, partA, unitBId, partB}` (`PhysicsWorld.ts:226-244`). Probe: 3 contacts on the first tick, then 0 for 29 further ticks; `events.test.ts` (4 tests) green. |
| 3 | **PHYS-03** — damage mean is exactly `max[A_A·P_A·W_A·(√Δv − 1), 0]` | ✓ VERIFIED | `computeDamageMean` (`damage.ts:31-45`) is a literal transcription with a finite/non-negative Δv guard. `damage.test.ts` pins 60·1·1.2·(√9−1)=144, 80·1·0.8·(√4−1)=64, and the `max(…,0)` clamp at Δv 1 / 0.25 / 0. |
| 4 | **PHYS-03** — normal jitter is σ = mean/20 via the shared `sampleNormal` (no physics-local sampler) | ✓ VERIFIED | `rollDamage` = `sampleNormal(rng, mean, mean / DAMAGE_JITTER_SIGMA_DIVISOR)` with the const = 20 (`damage.ts:19,54-56`); imports `@/common/rng`. 2000 seeded samples reproduce mean ±10% and σ ±25%. |
| 5 | **PHYS-03** — Δv uses PRE-step velocities projected onto the world-space contact normal, never post-step velocities | ✓ VERIFIED | `tick()` snapshots `linvel()`/`angvel()` into `#preVelocities` **before** `#world.step` (`PhysicsWorld.ts:208-217`), then projects the snapshot (`PhysicsWorld.ts:303-340`). Probe: emitted `deltaV` = 10.526323318 = pre-step `vx` exactly; post-step `vx` was 6.3636. `tick.test.ts` pre-step test green. |
| 6 | **PHYS-03** — for a rotating compound body, Δv is the pre-step contact-point velocity `v_com + ω×r` measured about the **center of mass**, projected onto the world-space contact normal (prior Gap G1) | ✓ VERIFIED | `tick()` now reads `attackerBody.worldCom()` / `defenderBody.worldCom()` as the moment-arm origin (`PhysicsWorld.ts:324-325`); `translation()` is no longer used as a rotation centre. The new `tests/physics/rotation.test.ts` passes: it spins a hammer unit with `applyTorque(1, 4000)`, requires `|ω| > 5`, asserts `com` and `origin` projections differ by > 0.5 m/s, pins `event.deltaV ≈ comDeltaV` to 3 dp, rejects the origin value by > 0.5 m/s, and confirms Rapier's `velocityAtPoint()` oracle agrees to 6 dp. |
| 7 | **PHYS-04** — armor hits apply the D-11 sign-consistent reduction using the struck armor's kind; body hits apply no reduction | ✓ VERIFIED | `defenderTag.part === Armor` → `armorKind` from the collider tag, `penetration = weapon.penetration[armorKind]`, `computeDamageReduction(...)`; `Body` leaves `armorKind` undefined and `damageReduced` 0 (`PhysicsWorld.ts:350-375`). `damage.test.ts` pins hammer pen 5 → 96.30 vs bow pen 0.2 → 51.02 at D_R 100. |
| 8 | **PHYS-04** — at most one damage event per `(attackerId, defenderId)` per tick, and the armor hit beats the enclosed body hit | ✓ VERIFIED | `damageCandidates` keyed by `${attackerId}:${defenderId}` with armor-over-body precedence and a larger-`damageReduced` / smaller-`armorKind` tie-break (`PhysicsWorld.ts:388-424`). Probe: exactly one event on the co-occurrence tick, `defenderPart = Armor`, no Body event; `tick.test.ts` green. |
| 9 | **PHYS-05** — `tick()` advances exactly one fixed step at `dt = 1/60`, consults no wall-clock, and consumes per-tick forces | ✓ VERIFIED | `#world.timestep = config.dt`, one `#world.step(#eventQueue)` per `tick()`, then `resetForces/resetTorques` (`PhysicsWorld.ts:83,217,428-431`). Grep: no `Date.now` / `performance.now` / `setTimeout` / `rAF`. Probe: force consumed exactly once. `DT = 1/60` in `constants.ts:14`. |
| 10 | Harness — `@dimforge/rapier2d-compat` is pinned to exactly `0.21.0`, WASM initialises under Vitest, the whole suite is green, and a deterministic `IRng` helper exists | ✓ VERIFIED | `package.json:29` → `"@dimforge/rapier2d-compat": "0.21.0"` (no range); lockfile entry present; `rapier-harness.test.ts` awaits `RAPIER.init()`, asserts `RAPIER.version() === '0.21.0'`, frees world + queue. `tests/helpers/rng.ts` exports `mulberry32(seed): IRng`. `pnpm test` → 15 files / 113 tests passed. |
| 11 | Type contract — declarations only: numeric `ColliderPart` (0/1/2), JSDoc'd `I*` interfaces, no class/function/const/Rapier, absent-object `null` vs absent-literal `undefined` | ✓ VERIFIED | `src/physics/types.ts` (212 lines) declares `ColliderPart` + 10 interfaces; only import is `import type … from '@/units/types'`; no runtime body. `types.test.ts` pins Body=0 / Weapon=1 / Armor=2. `weapon: IWeaponDef \| null`, `armors: readonly IArmorDef[]`, `weaponKind?`/`armorKind?`. |
| 12 | Constants — `DT` (1/60) and `DEFAULT_GEOMETRY` are the single calibration surface, every top-level const JSDoc'd | ✓ VERIFIED | `constants.ts:14` `DT = 1 / 60`; `DEFAULT_GEOMETRY` with bodyRadius 0.5, weaponHalfLength 0.4, weaponRadius 0.05, weaponOffsetX 0.7, armorRadius 0.55, each field JSDoc'd. |
| 13 | **02-07** — the angular term's moment arm is taken from the same point Rapier pairs with `linvel()` (the COM); `translation()` is never used as the rotation centre | ✓ VERIFIED | `PhysicsWorld.ts:324-325` uses `worldCom()` for both bodies; grep shows `translation()` remains only in `getUnitState` (a position read, not a rotation centre) and in the explanatory comment. No `worldCom`/`translation` mixing remains. |
| 14 | **02-07** — Δv remains sourced exclusively from the PRE-step velocity snapshot; the fix changes only the rotation centre, never the sampling instant | ✓ VERIFIED | `#preVelocities` is still filled at `PhysicsWorld.ts:208-215`, before `#world.step` at line 217. The commit diff `8c65448` is confined to the two rotation-centre reads + comment; no velocity read moved across the step. `tick.test.ts` pre-step assertion still green. |
| 15 | **02-07** — a committed test under `tests/physics/` calls `applyTorque`, captures a real damage event, asserts the emitted `deltaV` equals the COM-based contact-point velocity, and would fail if the reference point reverted to `translation()` | ✓ VERIFIED | `tests/physics/rotation.test.ts:171` calls `applyTorque(1, 4000)`; lines 250-256 require `|ω| > 5`, `|com − origin| > 0.5`, `event.deltaV ≈ comDeltaV` (3 dp), and `|event.deltaV − originDeltaV| > 0.5`; lines 269-282 cross-check with `velocityAtPoint` (6 dp). The named test passes (`✓ … pins the COM-based Δv and rejects the rigid-body-origin value`, 55 ms). |
| 16 | **02-07** — the frozen contract is untouched: `IPhysicsWorld` and every existing `types.ts` member keep their exact signatures/JSDoc; the class gains no public member | ✓ VERIFIED | `git diff 7d86bb5..HEAD -- src/physics/types.ts` is empty (last change `e4f9187`, before the gap-closure plan). The class's eight public methods (`registerUnit`, `removeUnit`, `hasUnit`, `applyForce`, `applyTorque`, `getUnitState`, `tick`, `dispose`) exactly match `IPhysicsWorld` (`types.ts:197-211`); no public member was added. |

**Score:** 16/16 truths verified (0 present, behavior-unverified)

### Prohibitions (must-NOT)

| # | Prohibition | Tier | Status | Evidence |
| - | ----------- | ---- | ------ | -------- |
| P1 | MUST NOT use `body.translation()` as the rotation centre for the ω×r term | test | ✓ VERIFIED (enforced) | `worldCom()` is the only rotation centre (`PhysicsWorld.ts:324-325`); `rotation.test.ts` fails if the emitted value matches the origin-based projection instead of COM. |
| P2 | MUST NOT read post-step velocities to compensate for the reference-point change | test | ✓ VERIFIED (enforced) | `#preVelocities` snapshot precedes `world.step` (`PhysicsWorld.ts:208-217`); no post-step `linvel`/`angvel` read enters Δv. `tick.test.ts` and `rotation.test.ts` both pin pre-step values. |
| P3 | MUST NOT change `IPhysicsWorld`, `IVelocitySnapshot`, `IDamageEvent`, or any other approved `types.ts` member | judgment | ✓ VERIFIED | Mechanical evidence: `git diff 7d86bb5..HEAD -- src/physics/types.ts` is empty; no public member added to the class. |

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases. These do not affect the status.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Spin/charge damage magnitude *feels* right (WR-02 calibration judgement) | Phase 5 | `02-07-PLAN.md` output note: "the WR-02 calibration question ... remains a playtest item for the assembled sim (Phase 5) and is not gated by this plan"; Phase 5 delivers the assembled sim. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/physics/types.ts` | Physics type contract, declarations only | ✓ VERIFIED | 212 lines; numeric enum + 10 interfaces; JSDoc on every member; only a type-only `@/units/types` import. Byte-identical to the pre-02-07 version. |
| `src/physics/constants.ts` | `DT` + `DEFAULT_GEOMETRY` | ✓ VERIFIED | `DT = 1/60`; complete geometry; both exports JSDoc'd. |
| `src/physics/damage.ts` | Pure damage/armor math | ✓ VERIFIED | 5 exported functions + `DAMAGE_JITTER_SIGMA_DIVISOR`; imports `@/common/rng` and `@/physics/types`; no Rapier import. |
| `src/physics/PhysicsWorld.ts` | `class PhysicsWorld implements IPhysicsWorld` | ✓ VERIFIED | 448 lines; full contract with no extra public member; the ω×r moment arm now originates at `worldCom()` for both bodies; compound assembly, handle index, lifecycle, actuators, fixed-step tick, contact bridge and damage pipeline all wired. |
| `tests/physics/rotation.test.ts` | Regression proof for the COM-based rotating Δv | ✓ VERIFIED | 304 lines; calls `applyTorque`; captures the hit pair's solver manifold; asserts COM-vs-origin discrimination and a `velocityAtPoint` oracle; restores the patched prototype in `finally`. Passes. |
| `tests/physics/rapier-harness.test.ts` | Wave-0 WASM smoke test | ✓ VERIFIED | Awaits init, pins `RAPIER.version()`, steps a world, frees both objects. |
| `tests/physics/types.test.ts` | Enum ordinal + alias proof | ✓ VERIFIED | Pins 0/1/2. (Pre-existing vacuous literal loop — IN-3, info only.) |
| `tests/physics/damage.test.ts` | Formula + jitter + D-11 sign proof | ✓ VERIFIED | 11 tests, hand-computed values and the reciprocal-falsifying sign assertion. |
| `tests/physics/compound.test.ts` | Mass / lifecycle / state / one-step | ✓ VERIFIED | 5 tests incl. dispose idempotency. |
| `tests/physics/events.test.ts` | Scripted contacts, part tags, no self-events | ✓ VERIFIED | 4 tests; lone-unit case emits nothing. |
| `tests/physics/tick.test.ts` | Damage integration + exclusivity | ✓ VERIFIED | 6 tests incl. the manifold-less skip and the deterministic co-occurrence case. |
| `tests/helpers/rng.ts` | Deterministic `IRng` helper | ✓ VERIFIED | `mulberry32(seed)` → `IRng`. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `PhysicsWorld.ts` | `physics/types.ts` | `implements IPhysicsWorld`, returns `IUnitState \| null`, `IPhysicsTickResult` | ✓ WIRED | Typecheck exit 0; all contract types consumed. |
| `PhysicsWorld.ts` | `physics/damage.ts` | `computeDamageMean`, `computeDamageReduction`, `rollDamage`, `isDamageBearingPair` | ✓ WIRED | All four imported and called inside `tick()`. |
| `PhysicsWorld.ts` | Rapier `RigidBody.worldCom` | ω×r moment-arm origin in `tick()` | ✓ WIRED | `attackerBody.worldCom()` / `defenderBody.worldCom()` at lines 324-325; runtime exercised by `rotation.test.ts`. |
| `PhysicsWorld.ts` | `physics/constants.ts` | `DT` / `DEFAULT_GEOMETRY` supplied via `IPhysicsConfig` | ✓ WIRED (injected) | The class reads `config.dt` / `config.geometry`; callers inject the constants. Intentional dependency injection, no behavioural gap. |
| `PhysicsWorld.ts` | `@dimforge/rapier2d-compat` | `World`, `EventQueue`, `RigidBodyDesc`, `ColliderDesc`, `contactPair` | ✓ WIRED | `RAPIER.init()` precondition documented; harness/tests await it. |
| `tests/physics/rotation.test.ts` | `src/physics/PhysicsWorld.ts` | `applyForce` + `applyTorque` drive a spinning weapon into a defender; emitted `deltaV` compared against the COM projection | ✓ WIRED | Test passes; `applyTorque` is called every tick until the hit. |
| `tests/physics/*` | `tests/helpers/rng.ts` | `mulberry32(fixedSeed)` | ✓ WIRED | Injected into every `PhysicsWorld` construction. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `PhysicsWorld.tick()` | `contacts[]` | `EventQueue.drainCollisionEvents` → `#index` tag lookup | Yes — probe emitted 3 real part-tagged contacts | ✓ FLOWING |
| `PhysicsWorld.tick()` | `damages[]` | pre-step velocity snapshot + `contactPair` normal/point + `worldCom()` moment arm → `computeDamageMean` → `rollDamage` → armor lookup → `damageCandidates` | Yes — `rotation.test.ts` emits a real Weapon↔Body event whose `deltaV` matches both the COM recomputation (3 dp) and Rapier's `velocityAtPoint` oracle (6 dp) | ✓ FLOWING (G1 resolved) |
| `PhysicsWorld.getUnitState()` | `IUnitState` | `body.translation()/rotation()/linvel()/angvel()` | Yes — probe: torque 500 → angvel 0.429; force 60 → vx 0.0142857 | ✓ FLOWING |
| `computeDamageMean` | `damageMean` | retained spec + event `deltaV` | Yes — test recomputes from the event's own Δv and matches to 6 dp | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite | `pnpm test` | 15 files / 113 tests passed | ✓ PASS |
| Type gate | `pnpm typecheck` | exit 0 | ✓ PASS |
| Lint gate | `pnpm lint` | exit 0 | ✓ PASS |
| Rotating-body COM regression | `pnpm test -- tests/physics/rotation.test.ts --reporter=verbose` | 1 file / 1 test passed (55 ms) | ✓ PASS |
| Commit integrity | `git show --stat 8c65448` / `b1d213b` | fix touches only `PhysicsWorld.ts` (+6/−4); test adds `rotation.test.ts` (304 lines) | ✓ PASS |
| Frozen contract | `git diff 7d86bb5..HEAD -- src/physics/types.ts` | empty | ✓ PASS |
| Worktree clean | `git diff --quiet HEAD -- src/physics tests/physics` | matches HEAD | ✓ PASS |
| Fixed step / force consumed once | throw-away probe: force 60, then 3 ticks | vx 0.0142857 / 0.0142857 / 0.0142857 | ✓ PASS |
| `applyTorque` drives the body | throw-away probe: torque 500, one tick | angvel 0 → 0.4295 | ✓ PASS |
| Handle index survives remove + re-register | throw-away probe | new tags observed; no stale tag | ✓ PASS |
| Co-occurring armor+body strike → exactly one (armor) event | throw-away probe | 1 event, `defenderPart=Armor`, no Body event | ✓ PASS |
| Δv comes from pre-step velocity | throw-away probe | emitted 10.526323318 = pre-step exactly; post-step 6.3636 | ✓ PASS |
| Rotating contact-point Δv about the COM | `rotation.test.ts` (committed) | emitted matches COM (3 dp) and differs from origin by > 0.5 m/s; oracle 6 dp | ✓ PASS |
| No `stopped` events leak | throw-away probe: 30 ticks | contacts `[3,0,0,…]` | ✓ PASS |

### Probe Execution

No probe scripts are declared by the plans and no `scripts/*/tests/probe-*.sh` exist in the repository — not applicable to this phase. Probe-style verification is performed by the committed Vitest suites and the throw-away numeric probes recorded above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PHYS-01 | 02-01, 02-02, 02-04 | 单位由 Rapier2D 复合刚体表示，本体/武器/防具为独立碰撞体并按部位打标 | ✓ SATISFIED | Truth 1; per-collider mass probe; handle index; `removeUnit` purge. |
| PHYS-02 | 02-02, 02-05 | 物理接触转换为带部位标记的类型化模拟事件 | ✓ SATISFIED | Truth 2; `events.test.ts` + probe. |
| PHYS-03 | 02-02, 02-03, 02-06, 02-07 | 伤害按文档公式计算，含 Δv 与正态抖动（σ = 均值/20） | ✓ SATISFIED | Truths 3-6, 13-15; the rotating-body Δv now measures about the COM and is pinned by `rotation.test.ts`. |
| PHYS-04 | 02-02, 02-03, 02-06 | 防具减伤与破甲按文档公式计算（击中本体不触发减伤） | ✓ SATISFIED | Truths 7-8; D-11 sign proof; body-hit `damageReduced = 0`; one-event-per-pair probe. |
| PHYS-05 | 02-02, 02-04, 02-06 | 模拟以固定步长 tick 推进，1 tick = 游戏 1/60 秒，与渲染解耦 | ✓ SATISFIED | Truth 9; `DT = 1/60`; no wall-clock; force consumed per tick. |

**Orphaned requirements:** none — REQUIREMENTS.md maps PHYS-01..05 to Phase 2 and every ID appears in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/physics/PhysicsWorld.ts` | 126 | `weaponKind` written into `#index` but never read (damage uses `attackerWeapon.id`) | ℹ️ Info | Dead field; no behavioural impact. |
| `src/physics/damage.ts` | 95-112 | `computeFinalDamage` exported but unused in production | ℹ️ Info | Only a test fixture; plan allowed either form. |
| `src/physics/types.ts` | 153 | JSDoc says "at least one side is `Weapon`"; the implementation requires **exactly** one | ℹ️ Info | Documentation imprecision only. |
| `tests/physics/types.test.ts` | 25-27 | `for (const ordinal of [0,1,2]) expect(Number.isInteger(ordinal))` — asserts on literals | ℹ️ Info | Vacuous assertion; the following loop over real members is meaningful. |
| `tests/physics/tick.test.ts` | 227 | `expect(damage).toBeLessThan(damage + damageReduced)` — tautological given the preceding assertion | ℹ️ Info | Redundant, not misleading. |

The prior 🛑 BLOCKER (rotation centre taken from `translation()`) is **resolved**: no `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / placeholder markers, no `any`, no `@ts-ignore`, no `eslint-disable` in `src/physics/` or `tests/physics/`. No debt-marker blockers.

### Human Verification Required

None for Phase 2. The only human-facing item is the WR-02 spin/charge **calibration** judgement, which the plan explicitly defers to the Phase 5 assembled sim and which is recorded under Deferred Items above — it is not a Phase-2 gate.

### Gaps Summary

No gaps remain. The sole prior gap (G1) is closed at the source: `tick()` now measures each body's `ω×r` moment arm from `worldCom()`, the same reference point Rapier pairs with `linvel()`, and the rigid-body origin is no longer used as a rotation centre. The fix is minimal — the 2D cross-product form, the normal projection, and the pre-step `#preVelocities` sampling instant are byte-for-byte unchanged. It is locked by a committed `applyTorque` regression that independently recomputes both the COM-based and origin-based contact-point velocities, requires the emitted value to match the COM to 3 dp, requires it to differ from the origin value by more than 0.5 m/s, and cross-checks against Rapier's `velocityAtPoint()` to 6 dp. The frozen `types.ts` contract is untouched and the class gained no public member. All three gates are green: `pnpm test` (15 files / 113 tests), `pnpm typecheck`, and `pnpm lint`.

---

_Verified: 2026-10-19T10:32:50Z_
_Verifier: the agent (gsd-verifier)_
