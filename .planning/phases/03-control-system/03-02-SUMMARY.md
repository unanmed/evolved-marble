---
phase: 03-control-system
plan: 02
subsystem: control
tags: [typescript, ai-control, sensing, physics-loop, vitest, rapier]

# Dependency graph
requires:
  - phase: 03-control-system
    provides: "APPROVED frozen control contract in src/control/types.ts (plan 03-01)"
  - phase: 02-physics-simulation
    provides: "IPhysicsWorld actuators/readouts (applyForce/applyTorque/getUnitState/tick) and IDamageEvent"
  - phase: 01-unit-system
    provides: "IUnit attributes, equipment, CLASS/WEAPON/ARMOR defs and spawnUnit"
provides:
  - "src/control/constants.ts — calibratable control/AI constants"
  - "Sensor implements ISensor — 64-ray/50 m, 16+16 sorted briefs, pure observation snapshot"
  - "ControlSystem implements IControlSystem — registration, 6-tick cadence, per-tick re-application, clamping, damage routing, dead-unit batch deregistration"
  - "DefaultUnitAI implements IUnitAI — deterministic chase / ram / retreat baseline"
  - "tests/control/{arena,damage-sink,loop,sensing} — fixtures + CTRL-01..04 behavioural coverage"
affects: [03-03 control round 3, 04-kingdom-system, 07-ai-integration]

# Actuals (#2632) — same estimateTokens scale (chars/4 over realized diff)
actuals:
  tokens: 26233
  tasks: 3
  commits: 3
  plan_head_before: 614cee06438c812ae665fc81d3f0bf6ab1338be2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pure per-decision snapshot (IUnitObservation) built by Sensor; AI never sees physics or mutable IUnit"
    - "IUnitAIProvider is the only AI construction seam; ControlSystem names no concrete AI"
    - "held-action re-application every physics tick because PhysicsWorld resets forces/torques"
    - "velocity-error force + PD torque steering (Rapier has no default damping)"
    - "defensive clamping of untrusted plugin output at the ControlSystem execution boundary"
    - "analytic ray×AABB and ray×circle sensing with no Rapier dependency"

key-files:
  created:
    - src/control/constants.ts
    - src/control/Sensor.ts
    - src/control/ControlSystem.ts
    - src/control/DefaultUnitAI.ts
    - tests/control/arena.ts
    - tests/control/damage-sink.ts
    - tests/control/loop.test.ts
    - tests/control/sensing.test.ts
  modified: []

key-decisions:
  - "Decisions fire on absolute ticks 0/6/12 (tickIndex % 6) before forces are applied, so the first decision takes effect on tick 0 (A5)."
  - "The held action is re-applied on every physics tick and zero net force/torque skips application, avoiding sleeping-body wakeups (D-13 / Pitfall 3)."
  - "sanitizeAction and ai.decide run inside one try/catch: a throwing or malformed plugin returns a zero action without aborting the tick (T-03-04/T-03-05)."
  - "Skill intents are shape-checked (numeric enum kind + matching unitId) and only leave via IControlTickResult.skillIntents on decision ticks (T-03-06)."
  - "Physics registration is wrapped so a failure destroys the just-created AI and leaves the catalog clean; deregistration order is provider.destroy → catalog delete → physics.removeUnit (A8)."
  - "DefaultUnitAI is deterministic (no IRng) and emits skillIntent: null; skill selection/cooldowns are the explicit 03-03 scope."
  - "Sensor passes only enemy briefs as ray blockers, making friendly non-blocking structural rather than conditional (D-02)."
  - "IUnitPhysicsSpec is built from live IUnit attributes plus the first equipped weapon and every armor, then frozen by physics (A3/WR-01/D-19)."

metrics:
  duration: 14min
  completed: 2026-10-20
status: complete
requirements-completed: [CTRL-01, CTRL-02, CTRL-03, CTRL-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Sensing contract: 64 finite rays in [0,50], boundary + enemy geometry, friendly non-blocking, 16+16 sorted briefs, empty projectiles, null guards"
    requirement: "CTRL-01"
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/control/sensing.test.ts (11/11 passed)"
        status: pass
      - kind: unit
        ref: "pnpm typecheck (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Execution semantics: cadence 0/6/12/18, composition, per-tick re-application, zero skip, clamping, skill-intent channel, decide/malformed isolation"
    requirement: "CTRL-02, CTRL-03"
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/control/loop.test.ts (18/18 passed)"
        status: pass
      - kind: unit
        ref: "pnpm typecheck (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pluggable provider + autonomous default AI proven end to end on real Rapier bodies (register → sense → decide → apply → tick → damage routed)"
    requirement: "CTRL-04"
    verification:
      - kind: integration
        ref: "tests/control/loop.test.ts tracer case (real PhysicsWorld, two teams, damage context applied)"
        status: pass
      - kind: integration
        ref: "pnpm test (18 files / 149 tests passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Damage ownership boundary: ControlSystem routes only; TestDamageSink owns same-team immunity, damage/experience and never removes physics bodies"
    requirement: "CTRL-02"
    verification:
      - kind: integration
        ref: "tests/control/loop.test.ts damage-routing + same-team-collision + dead-unit cases"
        status: pass
    human_judgment: false
---

# Phase 03 Plan 02: 操控系统实现（感知 + 控制循环 + 默认基线 AI） Summary

**Six-tick control loop over the frozen contract: `Sensor` assembles complete 64-ray snapshots, `ControlSystem` re-applies held actions every physics tick and routes damage to an injected sink, and `DefaultUnitAI` autonomously chases, rams and retreats — proven end to end on real Rapier bodies.**

## Performance

- **Duration:** 14 min
- **Tasks:** 3/3
- **Files created:** 8 (4 source + 4 tests)
- **Files modified:** 0 (frozen contracts untouched)
- **Commits:** 3 task commits

## Accomplishments

- `src/control/constants.ts` centralises every calibratable value (decision cadence, ray/neighbour limits, force/torque caps, arena extent, default-AI steering/thresholds, future skill cooldowns), each a JSDoc'd top-level `const`.
- `Sensor implements ISensor` joins `IUnitCatalog` + `IPhysicsWorld.getUnitState` + `ISensingWorld.castRayFan` into a pure `IUnitObservation`: all 13 attributes, class/equipment/skills copies, motion, injected tick, exactly 64 sanitized distances in `[0,50]`, ≤16 distance-sorted enemies/allies with a `unitId` tie-break, enemy-only blockers carrying the catalog `teamId`, empty Phase-3 projectiles, and `null` guards for missing unit/motion/team.
- `ControlSystem implements IControlSystem`/`IUnitCatalog`: durable registration (provider → physics → catalog, with rollback), 6-tick decisions, per-tick force/torque re-application with zero-skip, shape validation and net-vector clamping of untrusted AI output, skill intents only on decision ticks, damage routing to `IDamageSink`, and batch dead-unit removal in `provider.destroy → catalog delete → physics.removeUnit` order.
- `DefaultUnitAI implements IUnitAI`: deterministic fixed-priority selector (no enemy → idle, low health → retreat, otherwise chase/ram) with velocity-error force control and PD facing; `skillIntent` stays `null` until 03-03.
- Test fixtures `ArenaSensingWorld` (analytic ray×AABB + ray×circle, empty projectiles) and `TestDamageSink` (same-team immunity, alive guard, damage/experience, no physics removal) make the sensing and combat boundaries independently testable.
- `tests/control/loop.test.ts` (18 tests) pins cadence, composition, re-application, clamping, skill-intent channel + spoof rejection, decide-throw and malformed-output isolation, damage routing, same-team immunity under real collision (damage events emitted but filtered), dead-unit batch removal, registration/deregistration ordering, lifecycle, and the end-to-end tracer.
- `tests/control/sensing.test.ts` (11 tests) pins the CTRL-01 contract with real `Unit`s and the real arena.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): constants + Sensor + ControlSystem + DefaultUnitAI + tracer** — `643b525` (feat)
2. **Task 2 (fixtures + execution semantics)** — `64613e0` (test)
3. **Task 3 (sensing contract)** — `e42e406` (test)

**Plan metadata:** this SUMMARY + STATE/ROADMAP update (docs commit, made after this file).

## Files Created/Modified

- `src/control/constants.ts` — all control/AI constants, JSDoc'd; `DT` intentionally not redeclared.
- `src/control/Sensor.ts` — `class Sensor implements ISensor`; private `buildAttributes`, `collectBriefs`, `buildBlockers`, `sanitizeRayDistances`.
- `src/control/ControlSystem.ts` — `class ControlSystem implements IControlSystem`; private `buildSpec`, `sanitizeAction`, `readMagnitude`, `composeAction`, `routeDamage`, `removeRegisteredUnit`, `zeroAction`.
- `src/control/DefaultUnitAI.ts` — `class DefaultUnitAI implements IUnitAI`; private `zeroAction`, `nearestEnemy`, `isLowHealth`, `torqueToward`, `buildAction`.
- `tests/control/arena.ts` — `class ArenaSensingWorld implements ISensingWorld`; analytic ray geometry, no Rapier import.
- `tests/control/damage-sink.ts` — `class TestDamageSink implements IDamageSink`; same-team immunity, alive guard, damage/experience, never touches physics.
- `tests/control/loop.test.ts` — tracer + execution-semantics suite with test-local recording physics/AI/provider (no extra public members).
- `tests/control/sensing.test.ts` — CTRL-01 behavioural suite with physics/catalog stubs and a recording sensing world.

## Decisions Made

- **Decision-then-apply (A5):** decisions occur at `tickIndex % 6 === 0` and the new action is applied on the same tick, so the first decision is observed at absolute tick 0.
- **Held-action semantics:** the composed action is re-applied on every physics tick; zero force and zero torque individually skip application to avoid waking sleeping bodies.
- **Single plugin guard:** `decide` and `sanitizeAction` share one `try/catch`, so both a throw and a malformed return fall back to a zero action and later decision ticks still run.
- **Intent validation:** an intent survives only when `kind` is a numeric `SkillIntentKind` member and `unitId` equals the deciding unit.
- **Damage boundary:** `ControlSystem` resolves ids and routes; `IDamageSink` owns same-team filtering, `takeDamage` and experience; dead units are removed once, after all routing.
- **Sensing structure:** only enemy briefs become blockers, so friendly units can never occlude rays by construction; ray values are copied and sanitized to exactly 64 entries.
- **Registration snapshot:** the physics spec uses the first equipped weapon and all armors and is never refreshed (A3/WR-01/D-19 accepted).

## Deviations from Plan

None affecting product code. Two test-only strengthenings:

1. **Counting sink wrapper in the same-team collision test** — `TestDamageSink` was wrapped by an inline delegating sink so the test can prove damage events were emitted and then filtered (not merely absent). This strengthens D-09 coverage without changing production code.
2. **Optional `onDispose` callback on the test-local `RecordingPhysicsWorld`** — added so the dispose test can assert `ControlSystem.dispose()` does not dispose the physics world. Test fixture only.

## Issues Encountered

- The same-team collision test initially asserted a centre distance ≤ 1.1 m, but the weapon collider (local x = 0.7, capsule radius 0.05) acts as a spacer, so the closest centre distance is ≈ 1.21 m. The assertion was corrected to the plan's invariant (≥ body diameter) plus a `routed.length > 0` proof that contact actually occurred and produced damage events that the sink filtered.

## Known Stubs

None. `DefaultUnitAI` emits `skillIntent: null` and the cooldown constants are unused **by design**: Phase 3's skill intent + cooldown selection is the explicit scope of plan 03-03, not a hidden stub, and the output contract is already exercised by the skill-intent channel tests.

## Threat Flags

None. The plan's threat register was implemented as specified: untrusted AI output is shape-validated and clamped (`T-03-04`), throwing/malformed plugins are isolated (`T-03-05`), spoofed intents are dropped (`T-03-06`), ray output is sanitized (`T-03-07`), sink failures are isolated (`T-03-08`), duplicate/stale ids are handled (`T-03-09`), and no dependency or new I/O surface was added (`T-03-SC`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-03 can now complete `DefaultUnitAI`'s behaviour tree and skill-intent cooldowns and add `tests/control/{default-ai,pluggable}` without touching the frozen contracts.
- Phase 3 is **NOT complete**: plan 03-03 (default-AI behaviour + provider swap acceptance) remains, so ROADMAP keeps the phase `In Progress` and the phase checkbox stays unchecked.
- `src/control/types.ts`, `src/units/*`, `src/physics/*`, `package.json` and `pnpm-lock.yaml` are unchanged by this plan.

---

## Self-Check: PASSED

- `src/control/constants.ts`, `Sensor.ts`, `ControlSystem.ts`, `DefaultUnitAI.ts`, `tests/control/{arena,damage-sink,loop,sensing}` all exist.
- Commits `643b525`, `64613e0`, `e42e406` are present in `git log`.
- `pnpm typecheck` exits 0; `pnpm vitest run tests/control/` = 3 files / 36 tests passed; `pnpm test` = 18 files / 149 tests passed; `pnpm lint` exits 0.
- No diff under `src/physics/`, `src/units/`, `src/control/types.ts`, `package.json`, or `pnpm-lock.yaml`.

---

*Phase: 03-control-system*
*Completed: 2026-10-20 (round 2 — sensing, control loop and default baseline AI)*
