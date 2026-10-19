---
gsd_state_version: "1.0"
current_phase: 03
current_phase_name: 操控系统
status: executing
stopped_at: Phase 3 context gathered
last_updated: "2026-10-19T13:54:25.616Z"
last_activity: 2026-10-19
last_activity_desc: Phase 2 complete, transitioned to Phase 3
state_head: 56df98625b2806acdb00a8c7707c8f8667cd934a
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 13
  completed_plans: 12
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-17)

**Core value:** 战斗必须激烈好看。
**Current focus:** Phase 2 — 物理模拟系统

## Current Position

Phase: 03 (操控系统) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-10-19 — Phase 2 complete, transitioned to Phase 3

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 12
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | - | - |
| 2 | 7 | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- 每阶段的类型/接口设计需用户审查通过后才能进入实现（Wave 1 → 门禁 → Wave 2）。
- 参考文档数值需实测校准。

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-19T12:32:22.269Z
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-control-system/03-CONTEXT.md
