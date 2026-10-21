---
gsd_state_version: "1.0"
current_phase: 5
current_phase_name: 渲染系统
status: executing
stopped_at: 05-01 (Round 1 type contract) approved — Round 2 not planned
last_updated: "2026-10-21T12:21:30.000Z"
last_activity: 2026-10-21
last_activity_desc: Phase 5 Round 1 type contract approved; 05-01 complete
state_head: dd2251cb33e54dfe31ab15ae5ba0cb4df06ec569
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 21
  completed_plans: 21
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-21)

**Core value:** 战斗必须激烈好看。
**Current focus:** Phase 5 — 渲染系统

## Current Position

Phase: 5 (渲染系统) — EXECUTING
Plan: 1 of 1 planned (05-01 Round 1 complete; Round 2 not yet planned)
Status: Executing Phase 5 — type contract APPROVED
Last activity: 2026-10-21 — Round 1 type contract approved by the user; 05-01 complete

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 21
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | - | - |
| 2 | 7 | - | - |
| 3 | 3 | - | - |
| 4 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: Stable

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 1 P01 | 12 min | 3 tasks | 5 files |
| Phase 1 P02 | 50 | 3 tasks | 3 files |
| Phase 1 P03 | 8min | 2 tasks | 3 files |
| Phase 01-unit-system P04 | 6min | 2 tasks | 3 files |
| Phase 01-unit-system P05 | 3min | 2 tasks | 4 files |
| Phase 2 P1 | 4 min | 3 tasks | 4 files |
| Phase 2 P02 | 9min | 3 tasks | 2 files |
| Phase 02 P03 | 12min | 2 tasks | 2 files |
| Phase 2 P04 | 7min | 3 tasks | 3 files |
| Phase 02-physics-simulation P05 | 7min | 2 tasks | 2 files |
| Phase 2 P06 | 6min | 2 tasks | 2 files |
| Phase 02 P07 | 12min | 2 tasks | 2 files |
| Phase 03 P01 | 13 min | 3 tasks | 2 files |
| Phase 03 P02 | 14 min | 3 tasks | 8 files |
| Phase 03 P02 | 14 min | 3 tasks | 8 files |
| Phase 03 P03 | 8min | 3 tasks | 3 files |
| Phase 04 P01 | 159 min | 4 tasks | 7 files |
| Phase 04 P02 | 33 min | 3 tasks | 19 files |
| Phase 04 P03 | 12 min | 3 tasks | 7 files |
| Phase 04 P04 | ~35min | 3 tasks | 6 files |
| Phase 04 P05 | ~52min | 3 tasks | 10 files |
| Phase 05 P01 | ~40min | 4 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 单里程碑、按 8 系统分阶段（一阶段一系统，非层级推进）。
- 类型先行 + 用户审查门禁：每阶段先写 `types.ts` + `I*` 接口，用户批准后才实现。
- 移除确定性：不做重放/指令录像；精彩回放 = 录像片段原样截取。
- 无 runnable 中间态：最终可运行模拟仅在 8 系统全部组装后存在。
- [Phase 1]: Lint repaired via TypeScript side-by-side alias (devDep typescript -> @typescript/typescript6 for typescript-eslint's JS API; @typescript/native -> TS7 for tsc) instead of pinning the project to TS 6.x
- [Phase 1]: tsconfig include widened to ['src','tests'] so test files are type-checked (TS18003 cleared); strict stays true — no type-safety weakening
- [Phase 1]: Type-first unit contract approved: 7 numeric enums + 8 I* interfaces; 13 numeric attributes via getAttribute, class/equipment/modifiers via dedicated methods (16 total)
- [Phase 1]: IEquipment.weapon/armor are optional enum fields (D-11): an absent literal is undefined, never null
- [Phase 1]: IRng lives in src/common/types.ts and is re-exported from @/units/types (D-07/D-09/D-10)
- [Phase 1]: IUnit.getName() carries the spawn-time per-unit name (D-12); no getters/setters anywhere
- [Phase 1]: Phase 1 P03: data.ts is the single calibration surface — CLASS_DEFS/WEAPON_DEFS/ARMOR_DEFS + 6 named constants, all spec-exact and test-pinned
- [Phase 1]: Phase 1 P03: attackGrowth is the k.L coefficient, defenseGrowth is a flat per-level increment (OQ-2); maxHpGrowth is ~10% of base maxHp and calibration-pending (OQ-3); class mass is body-only (OQ-6)
- [Phase 1]: Phase 1 P04: Unit.getAttribute computes MaxHealth/Attack/Defense/ControlLevel from the rolled spawn bases (#maxHpBase/#attackBase/#defenseBase/#controlLevelBase), not the #def statics, so spawn randomization stays observable (sigma != 0)
- [Phase 1]: Phase 1 P04: attack growth is level-scaling (base + attackGrowth*L*(L-1)/2; Swordsman L3=90) and defense growth is flat per-level (base + defenseGrowth*(L-1); L3=36); level-derived values are recomputed on every read, never stored (D-04)
- [Phase 1]: Phase 1 P04: the constructor seeds #hp from the level-1 MaxHealth so a unit always spawns at full health; #applyModifiers is scoped to MaxHealth/Attack/Defense in Phase 1 and IModifier is unchanged
- [Phase 1]: Phase 1 P05: spawnUnit rolls the 7 spec attributes as N(class mean, (mean/8)^2) clamped non-negative; control-level mean is the shared CONTROL_LEVEL_BASE (10) for every class
- [Phase 1]: Phase 1 P05: IRng/MathRng/sampleNormal live in src/common/ as the reusable randomness seam; sampleNormal guards u1<=0 (never Math.log(0)) with a non-negative clamp that is a correctness guard, not shaping
- [Phase 2]: Phase 2 P01: @dimforge/rapier2d-compat pinned to literal 0.21.0 via pnpm add -E (D-02/D-12); runtime RAPIER.version()===0.21.0 asserted in the harness so the loaded build is pinned too
- [Phase 2]: Phase 2 P01: default Vitest worker pool kept — full multi-file suite (9 files/82 tests) green with Rapier WASM loaded, so the research Pitfall 7 pool:'forks' fallback was not needed; vitest.config.ts unchanged
- [Phase 2]: Phase 2 P01: tests/helpers/rng.ts extracts mulberry32 verbatim as the shared deterministic IRng (type-only import from @/common/types, AGENTS §9); tests/units/spawn-normal.test.ts untouched
- [Phase 2]: Phase 2 P02: physics type contract approved at the blocking-human gate — numeric ColliderPart enum + 8 I* interfaces declared declarations-only (src/physics/types.ts), no class/const/function/Rapier import
- [Phase 2]: Phase 2 P02: IPhysicsWorld exposes applyForce/applyTorque now (physics is control's only actuator) and tick() returns a structured IPhysicsTickResult{contacts,damages}; scope boundary is IPhysicsWorld only — no IBattleSim (Phase 4)
- [Phase 2]: Phase 2 P02: requirements-completed left empty — round 1 (type declarations only) stops at the review gate, so no PHYS-01..05 behavior is satisfied yet
- [Phase 2]: Phase 2 P03: armor reduction uses the D-11 sign-consistent B_A = 破甲比率 (not 1/penetration) — higher penetration bypasses MORE armor; proven by a dedicated test (锤子 pen5 96.30 > 弓箭 pen0.2 51.02 at D_R 100)
- [Phase 2]: Phase 2 P03: rollDamage reuses the shared sampleNormal (@/common/rng) with σ = mean/20 (DAMAGE_JITTER_SIGMA_DIVISOR = 20) — no physics-local sampler (AGENTS §9)
- [Phase 2]: Phase 2 P03: damage math lives in a Rapier-free pure module so PHYS-03/04 are unit-testable without the WASM engine; caller skips reduction on a Body hit via isDamageBearingPair + defenderPart
- [Phase 2]: Phase 2 P04: PhysicsWorld builds one compound RigidBody per unit with body=spec.mass, weapon/armor=def mass (per-collider setMass, Rapier sums); collider handle -> {unitId, part[, weaponKind][, armorKind]} index (D-03/D-04/D-05)
- [Phase 2]: Phase 2 P04: removeUnit purges handle-index entries BEFORE removeRigidBody (handle reuse, Pitfall 3); getUnitState returns null for unknown id; tick() = exactly one world.step at f32 dt with forces/torques cleared after the step (D-10/PHYS-05)
- [Phase 2]: Phase 2 P04: #rng is not stored yet (constructor param _rng) because no-unused-private-class-members is an error for write-only fields; 02-06 adds the stored field when damage jitter consumes it
- [Phase 2]: Phase 2 P05: tick() drains the EventQueue after the step and emits a part-tagged IContactEvent only for started, cross-unit collisions; parts come solely from the collider-handle index (D-04/D-08)
- [Phase 2]: Phase 2 P05: contact events stay unordered (unitAId/partA, unitBId/partB) with a defensive same-unit guard; no contact normal is read in the drain - the normal + dv belong to the 02-06 damage layer
- [Phase 2]: Phase 2 P06: tick() computes dV from PRE-step velocities + the contactPair normal (copied in-closure) and emits final-number IDamageEvents, deduped once per (attackerId,defenderId) per tick with armor-beats-body precedence; contacts stay complete
- [Phase 2]: Phase 2 P06: damage dedup applies to damages only; the one-strike window is per tick (cross-tick suppression is neither implemented nor asserted); #preVelocities/#rng placeholders from 02-04/02-05 are now consumed
- [Phase 2]: Phase 2 P07: the omega x r moment arm is measured from body.worldCom() (the COM that linvel() uses), never body.translation(); the 2D cross-product, normal projection, and pre-step velocity source are unchanged (D-08)
- [Phase 2]: Phase 2 P07: tests/physics/rotation.test.ts is the phase's first applyTorque regression - it pins the emitted deltaV to the COM-based contact-point projection (3 dp), rejects the origin-based value (>0.5 m/s apart), and cross-checks with Rapier velocityAtPoint (6 dp)
- [Phase 03]: Phase 3 round 1: control-system type contract approved at the type-first gate — 17 I* interfaces + numeric SkillIntentKind, declarations only
- [Phase 03]: Phase 3 round 2 pending: Sensor, ControlSystem loop, ArenaSensingWorld, DefaultUnitAI, IDamageSink glue and src/control/constants.ts are planned only after the gate; requirements-completed stays empty in round 1
- [Phase 03]: Gate answers recorded for round 2: ISensingWorld is env-geometry-only; first-equipped weapon wins at registration; decide-then-apply on ticks 0/6/12; cooldown lives on the AI instance with intents leaving via IControlTickResult.skillIntents; ControlSystem owns dead-unit deregistration; IUnitState imported from @/physics/types
- [Phase 03]: Phase 03 P02: decisions fire at tickIndex % 6 === 0 before application, so the first decision takes effect on tick 0 (A5)
- [Phase 03]: Phase 03 P02: the held action is re-applied every physics tick; zero net force/torque skips application to avoid waking sleeping bodies
- [Phase 03]: Phase 03 P02: ai.decide and sanitizeAction share one try/catch; throwing/malformed plugin output falls back to a zero action without aborting the tick
- [Phase 03]: Phase 03 P02: deregistration order is provider.destroy -> catalog delete -> physics.removeUnit; physics registration failure destroys the AI and leaves no partial state
- [Phase 03]: Phase 03 P03: DefaultUnitAI priority is idle -> retreat -> ram -> approach; retreat never emits a skill intent (D-14/D-16)
- [Phase 03]: Phase 03 P03: skill intents are one-shot per decision (Charge -> Spin close-range, then ArrowStorm, then bow) armed as observation.tick + cooldown ticks (D-17)
- [Phase 03]: Phase 03 P03: pluggability is proven by swapping providers across identical real Rapier setups; a throwing provider falls back to zero action without poisoning the loop
- [Phase 04]: Round 1 type gate APPROVED — 7 numeric enums (incl. ArmyState.Engaging=4), numeric time rate (no TimeRate enum), reduced vision briefs (A21)
- [Phase 04]: G-1 IHealableUnit, G-2 IStaticObstacleWorld and G-5 IControlSystem.setUnitAI approved as additive declaration-only seams; ControlSystem.setUnitAI shim is the only Round-1 implementation
- [Phase 04]: army orders reduced to MoveTo/Garrison/Hold and IArmyOrder.afterMinutes is relative game time (omitted = now)
- [Phase 04]: 04-02: zero-member battles survive their creation tick; join runs after trigger, so the end pass guards members.length === 0
- [Phase 04]: 04-02: pair locks are stored separately from battles and released only past the 80 m trigger distance; end/merge never relock
- [Phase 04]: 04-02: brake mode is driven by World-owned lastBattleOfUnit + brakeUntilMinutes (>= 6 game min); a battle that ends clears both immediately
- [Phase 04]: 04-02: ArmyState.InBattle stays a reserved contract value; only Engaging is assigned and never read
- [Phase 04]: 04-03: heal validates the amount then refuses when dead, so a corpse stays at zero and healing never reads the max for invalid input (D-06)
- [Phase 04]: 04-03: spawnUnit returns IHealableUnit (C-2) with no cast — Unit itself implements the seam, so no runtime probe exists
- [Phase 04]: 04-03: static obstacles are fixed cuboids without active events and never enter the collider tag index; invalid specs are rejected before any Rapier object or id is created
- [Phase 04]: 04-03: setUnitAI ownership follows creation — a providerOwned set decides every provider.destroy call; injected instances are only dropped
- [Phase 04]: 04-03: KING-05 stays pending even though its static-obstacle seam shipped; city training/garrison behaviour belongs to 04-04/04-05
- [Phase 04]: Garrison resolution keeps a satisfied order as a standing state and refuses a different live holder without touching the city link
- [Phase 04]: Training pauses by cap/Engaging/MAX_SCENARIO_UNITS, produces at most one unit per substep and keeps the threshold remainder
- [Phase 04]: Vision and healing stay stateless/per-unit; terrain and boundary walls are separate obstacle id sets removed only by World.dispose
- [Phase 04]: 04-05: city battles require a real garrison, carry cityId, suppress the garrison army pair and survive merge overlap
- [Phase 04]: 04-05: settlement transfers ownership through one helper, partitions survivors into a World-allocated garrison army, clears the winning field order and never calls updateTeam
- [Phase 04]: 04-05: loser regroup uses a participant ledger and living-roster centres; nearest owned city or deterministic golden-angle fallback
- [Phase 04]: 04-05: PlaceholderCommander runs once per outer tick after expiry, reads only reduced vision briefs, and is isolated at factory/decide/order validation
- [Phase 04]: 04-05: frozen GarrisonSelector id gap bridged by a WeakMap identity registry populated at unit registration; World still sanitises all ids
- [Phase 04]: 04-05: validateScenario is the constructor's first statement so invalid tables never touch physics or control
- [Phase 05]: 05-01 Round 1 type gate APPROVED — render contract frozen: 1 numeric enum (CameraMode), 2 function type aliases, 28 I* interfaces, declarations only
- [Phase 05]: PixiJS exact-pinned `pixi.js@8.22.0` (`pnpm add -E`) after a blocking-human supply-chain approval; `Container` is the only Pixi symbol in the contract and only in type position
- [Phase 05]: G-1..G-6 approved as written — type-only Container, IRenderServices+provider, damage feed + Round-2 decorator, mode derived from target, factory-owned shared geometry, visual spec snapshotted at first appearance
- [Phase 05]: CameraMode is derived from setBattleTarget(number|undefined) with NO independent mode setter; reset() clears the target so getMode() is Strategic
- [Phase 05]: ICameraUpdateInput.shakeImpulsePx is the declared writer for shakeX/shakeY, so the D-06 shake chain is reachable through interfaces rather than a hidden mutation
- [Phase 05]: requirements-completed stays empty — REND-01..05 are Round-2 behaviour; Phase 5 is NOT complete
- [Phase 05]: Round 2 pending (05-02 not planned): constants/calendar/cameraMath/hudModel/frameModel, DamageTap, GeometryUnitView/UnitViewFactory, Camera, Hud, Renderer, src/demo/*, src/main.ts, index.html, style.css, dev/build scripts, Chrome UAT

### Pending Todos

None yet.

### Blockers/Concerns

- 每阶段的类型/接口设计需用户审查通过后才能进入实现（Wave 1 → 门禁 → Wave 2）。
- 参考文档数值需实测校准。

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Control | 射弹与技能物理效果（弓箭/万箭齐发/冲锋/旋转） | Deferred to later combat/skill layer | Phase 3 | v1 |
| Control | 丰富默认 AI 行为/职业战术/个性参数 | Deferred to pluggable AI implementations | Phase 3 | v1 |
| Control | 地图障碍物射线感知 | Phase 4 (`ISensingWorld` implementation) | Phase 3 | v1 |
| Control | 运行时阵营更新 (`updateTeam`) | Reserved, enabled in Phase 4 | Phase 3 | v1 |
| Control | 按控制等级选择 AI / RL / LLM 单位控制 | v2 / Phase 7 | Phase 3 | v1 |

## Session Continuity

Last session: 2026-10-21T12:21:30.000Z
Stopped at: 05-01 (Round 1 type contract) approved — Round 2 not planned
Resume file: .planning/phases/05-render-system/05-01-SUMMARY.md
