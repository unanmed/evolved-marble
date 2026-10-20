---
phase: 03-control-system
verified: 2026-10-20T13:33:34Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/03-control-system/03-01-PLAN.md
  - .planning/phases/03-control-system/03-01-SUMMARY.md
  - .planning/phases/03-control-system/03-02-PLAN.md
  - .planning/phases/03-control-system/03-02-SUMMARY.md
  - .planning/phases/03-control-system/03-03-PLAN.md
  - .planning/phases/03-control-system/03-03-SUMMARY.md
  - src/control/ControlSystem.ts
  - src/control/DefaultUnitAI.ts
  - src/control/Sensor.ts
  - src/control/constants.ts
  - src/control/types.ts
  - tests/control/arena.ts
  - tests/control/damage-sink.ts
  - tests/control/default-ai.test.ts
  - tests/control/loop.test.ts
  - tests/control/pluggable.test.ts
  - tests/control/sensing.test.ts
  - tests/control/types.test.ts
covered_digest: "v1:sha256:e413920140b2d1c831897866e1ca558d4806c09ec575e4a25ecc8e91c3291a2a"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: 操控系统 Verification Report

**Phase Goal:** 定义单位级 AI 的输入/输出契约与 0.1s 决策节奏，并把 AI 控制做成可插拔模块 + 一个默认基线实现，使模拟可自主运行。
**Verified:** 2026-10-20T13:33:34Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1 | **CTRL-01 / SC1 input contract** — `Sensor implements ISensor` assembles a complete `IUnitObservation`: all 13 `AttributeKind` readings, `classKind`, copied equipment/skills, `motion` from `IPhysicsWorld.getUnitState`, injected absolute `tick`, projectile list, and `null` when unit/motion/team is unavailable | ✓ VERIFIED | `src/control/Sensor.ts:68-115`, `buildAttributes` at `:122-154`; `tests/control/sensing.test.ts` "exposes every attribute key plus motion, tick, class and equipment" + "returns null for an unknown unit, missing motion, and unknown team" (pass) |
| 2 | **SC1 rays** — exactly 64 world-fixed ray distances, each finite in `[0,50]`, malformed/padded/truncated safely; friendlies are structurally never blockers | ✓ VERIFIED | `RAY_COUNT=64`, `SENSING_MAX_DISTANCE=50` (`src/control/constants.ts:18,24`); `sanitizeRayDistances` (`Sensor.ts:307-324`); blockers built from enemy briefs only (`Sensor.ts:242-258`); sensing tests cover 64/range, analytic boundary, enemy shortening, ally non-blocking, malformed rays |
| 3 | **SC1 briefs** — ≤16 enemies + ≤16 allies, alive-only, within `NEIGHBOR_QUERY_RADIUS`, distance-ascending with unitId tie-break, documented fields only, equipment copied | ✓ VERIFIED | `Sensor.collectBriefs` (`Sensor.ts:167-233`); `MAX_NEIGHBORS=16`; tests "sorts neighbours by distance, caps each list at 16…", "breaks distance ties by ascending unitId", "builds briefs with documented fields only and copies equipment" (pass) |
| 4 | **CTRL-02 / SC2 output contract** — `IUnitAction` carries four non-negative world-axis force magnitudes, two non-negative torque magnitudes, and `skillIntent: SkillIntent \| null`; `SkillIntent` is a discriminated union over numeric `SkillIntentKind` covering weapon skills (`weapon: WeaponKind`) and unit skills (`skill: SkillKind`) | ✓ VERIFIED | `src/control/types.ts:22-27,145-193`; ordinal pinning in `tests/control/types.test.ts` (`tests/control` 73/73 pass); default AI emits both discriminators (`tests/control/default-ai.test.ts` bow/Charge/Spin/ArrowStorm cases) |
| 5 | **CTRL-02 composition safety** — `ControlSystem` composes `fx=forceRight−forceLeft`, `fy=forceUp−forceDown`, `torque=torqueCCW−torqueCW`; non-finite/negative → 0; net force vector and torque clamped; spoofed or malformed skill intents dropped and rebuilt | ✓ VERIFIED | `ControlSystem.composeAction` (`:484-506`), `sanitizeAction`/`readSkillIntent` (`:369-474`); loop tests "composes net force/torque…" (asserts `applyForce(1,7,3)`/`applyTorque(1,3)`), "maps non-finite and negative magnitudes to zero", "caps net force magnitude and torque", "drops skill intents whose payload is invalid", "emits a rebuilt skill intent that plugin mutation cannot change" (pass) |
| 6 | **CTRL-03 / SC3 cadence** — decisions occur exactly on absolute ticks 0/6/12/18 via `tickIndex % DECISION_INTERVAL_TICKS`, tick-counted (never wall-clock); 6 ticks × `DT=1/60` = 0.1 s; non-decision ticks do not call `decide` | ✓ VERIFIED | `ControlSystem.tick` (`:193`), `DECISION_INTERVAL_TICKS=6`, `DT=1/60` (`src/physics/constants.ts:14`); contract JSDoc anchors `6-tick (0.1 s) cadence` / `0/6/12` (`types.ts:310-314`, presence check `CTRL_TYPES_OK`); loop test "decides exactly on ticks 0/6/12/18 and never between" (pass) |
| 7 | **D-13 held action** — the composed action is re-applied on every physics tick (physics clears forces/torques), zero net force/torque individually skip application, and the action is replaced at the next decision | ✓ VERIFIED | `ControlSystem.tick` re-apply loop (`:238-250`); tests "composes net force/torque and re-applies…" asserts 13 force + 13 torque calls over 13 ticks, and "replaces the held action at the next decision instead of reusing the first" (pass) |
| 8 | **CTRL-04 / SC4 pluggability** — `IUnitAIProvider` is the only AI construction seam; `ControlSystem` names no concrete AI, `create`/`destroy` are exact, `dispose()` idempotent, and two different providers drive the same real physics/units without source changes | ✓ VERIFIED | `ControlSystem.ts` imports only `Sensor`; AI calls are `provider.create` (`:129`) / `provider.destroy` (`:134,283,555`); `tests/control/pluggable.test.ts` "drives identical physics/unit setups with two different providers" + lifecycle/throwing-provider cases (pass); `git diff 614cee0..HEAD -- src/physics src/units` empty |
| 9 | **CTRL-04 / SC5 autonomy** — `DefaultUnitAI` deterministically idles with no enemy, approaches the nearest enemy, rams inside `DEFAULT_AI_ATTACK_RANGE`, retreats at low health, with velocity-error/PD steering and no `IUnit`/physics access | ✓ VERIFIED | `src/control/DefaultUnitAI.ts:66-96,247-329`; `tests/control/default-ai.test.ts` idle/approach/ram/retreat/PD/determinism cases (13/13 pass) |
| 10 | **CTRL-02 / D-17 skills** — at most one `SkillIntent` per decision when unlocked and its tick cooldown expired (`Charge` → `Spin` close range, `ArrowStorm` → bow in skill range), cooldowns on the AI instance advanced by `observation.tick`, no skill physics/execution | ✓ VERIFIED | `chooseSkillIntent` (`DefaultUnitAI.ts:164-220`); default-ai tests "emits one … intent per … window" for Bow/Charge/Spin/ArrowStorm, "prefers Charge over Spin, emitting at most one intent", "emits only the six force/torque magnitudes plus the intent, never skill physics" (pass) |
| 11 | **D-06/D-09/D-10 registration & damage** — registration binds `unitId↔IUnit↔teamId`, builds `IUnitPhysicsSpec` from attributes + first weapon + all armors, throws on duplicate/rollback; damages resolved to `IDamageContext` and routed to the injected sink; dead units batch-removed in `provider.destroy → catalog delete → physics.removeUnit` order | ✓ VERIFIED | `ControlSystem.registerUnit` (`:111-145`), `buildSpec` (`:327-359`), `routeDamage` (`:513-537`), `removeRegisteredUnit` (`:546-564`); loop tests registration/deregistration order, physics-failure rollback, damage routing, batch removal (pass) |
| 12 | **Contract integrity** — `src/control/types.ts` is declarations-only (numeric enums, JSDoc, no class/const/function/Rapier), frozen `types.ts`/`src/physics/*`/`src/units/*` untouched, no dependency added, and no RNG/wall-clock in the control layer | ✓ VERIFIED | Presence check prints `CTRL_TYPES_OK`; `git diff 8265b73 -- src/control/types.ts` and `git diff 614cee0..HEAD -- src/physics src/units package.json pnpm-lock.yaml` both empty; grep for `Math.random|Date.|performance.now|setTimeout|setInterval` in `src/control/*.ts` returns nothing |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/control/types.ts` | Frozen control contract | ✓ VERIFIED | 318 lines, declarations only; all 17 `I*` interfaces + `SkillIntentKind` + `SkillIntent`; imported by every consumer |
| `src/control/constants.ts` | Calibratable constants | ✓ VERIFIED | All 22 declared constants present and consumed by `Sensor`/`ControlSystem`/`DefaultUnitAI`/arena/tests (usage grep non-zero for each) |
| `src/control/Sensor.ts` | `Sensor implements ISensor` | ✓ VERIFIED | 325 lines; wired in `ControlSystem` constructor; all state flows from catalog/physics/sensing world |
| `src/control/ControlSystem.ts` | `ControlSystem implements IControlSystem` | ✓ VERIFIED | 581 lines; registration, cadence, re-apply, clamp, routing, deregistration; no concrete AI names |
| `src/control/DefaultUnitAI.ts` | `DefaultUnitAI implements IUnitAI` | ✓ VERIFIED | 330 lines; `decide` is the only public member; constants-driven, clamped |
| `tests/control/arena.ts` | `ArenaSensingWorld implements ISensingWorld` | ✓ VERIFIED | Used by loop/sensing/pluggable suites; analytic ray×AABB + ray×circle, no Rapier |
| `tests/control/damage-sink.ts` | `TestDamageSink implements IDamageSink` | ✓ VERIFIED | Same-team immunity, alive guard, damage/XP; no physics access (verified: no `removeUnit`/`IPhysicsWorld`) |
| `tests/control/{types,sensing,loop,default-ai,pluggable}.test.ts` | Behavioural proof | ✓ VERIFIED | 73 tests in `tests/control`, all passing |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `ControlSystem` | `IPhysicsWorld` | `applyForce` / `applyTorque` / `getUnitState` / `tick` / `registerUnit` / `removeUnit` | ✓ WIRED | Recording physics asserts exact calls; real Rapier tracer moves bodies |
| `ControlSystem` | `Sensor` | `new Sensor(physics, this, sensingWorld, () => this.tickIndex)` + `sensor.sense(id)` | ✓ WIRED | Constructed in constructor, called on decision ticks |
| `ControlSystem` | `IUnitAIProvider` | `provider.create` / `provider.destroy` only | ✓ WIRED | No `DefaultUnitAI` reference in production (`src` grep: only its own file) |
| `Sensor` | `ISensingWorld` | `castRayFan` + `queryProjectiles` | ✓ WIRED | Values sanitized and copied; tests assert 64 rays |
| `Sensor` | `IPhysicsWorld` | `getUnitState` (motion only) | ✓ WIRED | No raycast requested from physics (frozen seam respected) |
| `ControlSystem` | `@/units/data` | `WEAPON_DEFS` first weapon + `ARMOR_DEFS` all armors | ✓ WIRED | `buildSpec` maps equipment → `IUnitPhysicsSpec` |
| `DefaultUnitAI` | `@/control/constants` | all thresholds/speeds/gains/cooldowns | ✓ WIRED | Every `DEFAULT_AI_*` / cooldown constant consumed |
| `default-ai`/`pluggable` tests | `types.ts` | `IUnitAI.decide`, `SkillIntentKind`, intents | ✓ WIRED | `implements IUnitAI`; intents carry discriminator + unitId |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `Sensor` | `attributes` | `IUnit.getAttribute` for all 13 keys | Yes — real `IUnit` instances via `spawnUnit` in tests | ✓ FLOWING |
| `Sensor` | `motion` | `IPhysicsWorld.getUnitState` | Yes — copied real state; sourced from Rapier in loop/pluggable tests | ✓ FLOWING |
| `Sensor` | `rayDistances` | `ISensingWorld.castRayFan` → `ArenaSensingWorld` analytic geometry | Yes — computed intersections, not constants | ✓ FLOWING |
| `Sensor` | `enemies` / `allies` | `catalog.listUnitIds` + `getUnit`/`getTeam` + distance filter | Yes — built from registered units | ✓ FLOWING |
| `Sensor` | `projectiles` | `ISensingWorld.queryProjectiles` | Phase-3 empty by locked D-04; sanitizer handles non-empty/malformed input (tested) | ✓ FLOWING (empty-by-design) |
| `ControlSystem` | `skillIntents` | `ai.decide().skillIntent` → `sanitizeAction` → `IControlTickResult` | Yes — real intents observed on decision ticks in loop/default-ai/pluggable tests | ✓ FLOWING |
| `ControlSystem` | force/torque → physics | `composeAction` → `applyForce`/`applyTorque` | Yes — real Rapier bodies move (tracer closes gap) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Control layer typecheck | `pnpm typecheck` | exit 0 | ✓ PASS |
| Control suites | `pnpm vitest run tests/control` | 5 files / 73 tests passed | ✓ PASS |
| Full suite (regression, run once) | `pnpm test` | 20 files / 186 tests passed | ✓ PASS |
| Lint | `pnpm lint` | exit 0 | ✓ PASS |
| Contract presence + cadence anchors | presence check over `src/control/types.ts` | `CTRL_TYPES_OK`, exit 0 | ✓ PASS |
| Frozen-contract integrity | `git diff 8265b73 -- src/control/types.ts`; `git diff 614cee0..HEAD -- src/physics src/units package.json pnpm-lock.yaml` | empty output | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No probe scripts exist in this repo (`scripts/` absent); not applicable | N/A |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CTRL-01 | 03-01, 03-02 | 单位级 AI 输入契约：自身属性、位置、64 射线、射弹距离、16 敌 / 16 友简讯 | ✓ SATISFIED | `IUnitObservation` + `Sensor`; sensing suite (64 rays in [0,50], 16/16 caps, sorted, alive-only, empty projectiles, null guards) |
| CTRL-02 | 03-01, 03-02, 03-03 | 单位级 AI 输出契约：四向力、旋转力、武器技能、单位技能 | ✓ SATISFIED | `IUnitAction` + `SkillIntent` union; composition/clamping tests; bow/Charge/Spin/ArrowStorm intent+cooldown tests |
| CTRL-03 | 03-01, 03-02 | AI 每 0.1s（6 tick）决策一次 | ✓ SATISFIED | `tickIndex % DECISION_INTERVAL_TICKS`, `DT=1/60`; cadence test asserts exactly `[0,6,12,18]` |
| CTRL-04 | 03-01, 03-02, 03-03 | AI 控制可插拔 + 提供默认实现以独立运行 | ✓ SATISFIED | `IUnitAIProvider` sole seam; provider-swap + lifecycle + throwing-plugin suites; real `DefaultUnitAI` closes gap over 120 ticks |

No orphaned Phase-3 requirements: REQUIREMENTS.md maps exactly CTRL-01..04 to Phase 3, and all four are claimed across the three plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None: `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` scan over `src/control/*.ts` and `tests/control/*.ts` returned no matches | — | — |

### Human Verification Required

None. All five ROADMAP success criteria are exercised by automated, passing behavioural tests; there is no UI, real-time, or external-service surface in this phase.

### Gaps Summary

No gaps. The phase goal is achieved in code and behaviour:

- The AI input contract is implemented (`Sensor`) and behaviourally pinned: 13 attributes, motion, tick, exactly 64 sanitized rays in [0,50], ≤16 sorted alive enemy and ally briefs, projectile list, null guards.
- The output contract is implemented and exercised: four force magnitudes + two torque magnitudes + discriminated weapon/unit skill intents, with the control boundary composing, clamping, and rebuilding untrusted output.
- The decision cadence is tick-counted at `0/6/12/18…` (6 × 1/60 s = 0.1 s), and the held action is re-applied on every physics tick.
- Pluggability is proven on real Rapier bodies with two different providers, exact `create`/`destroy` lifecycle, throwing-plugin isolation, and `updateTeam` reclassification — with `src/physics/*` and `src/units/*` untouched (`git diff` empty).
- The default baseline AI autonomously approaches, rams, and retreats, emits cooldown-gated skill intents, and drives the real simulation for 120 ticks without human input.

**Accepted scope (not gaps):** `projectiles` stays empty in Phase 3 (locked D-04), `updateTeam` is a reserved runtime entry (D-07), and skill physical effects are deferred (D-17). These are explicit, approved decisions implemented as specified.

---

_Verified: 2026-10-20T13:33:34Z_
_Verifier: the agent (gsd-verifier)_
