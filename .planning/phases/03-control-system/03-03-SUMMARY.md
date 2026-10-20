---
phase: 03-control-system
plan: 03
subsystem: control
tags: [typescript, ai-control, behaviour-tree, pluggable-ai, skill-cooldown, vitest, rapier]

# Dependency graph
requires:
  - phase: 03-control-system
    provides: "APPROVED frozen control contract in src/control/types.ts (plan 03-01)"
  - phase: 03-control-system
    provides: "Sensor, ControlSystem loop, constants, ArenaSensingWorld/TestDamageSink and the chase/ram/retreat skeleton (plan 03-02)"
  - phase: 02-physics-simulation
    provides: "PhysicsWorld applyForce/applyTorque/getUnitState/tick on real Rapier bodies"
  - phase: 01-unit-system
    provides: "IUnit attributes, equipment, skills and spawnUnit"
provides:
  - "src/control/DefaultUnitAI.ts — complete fixed-priority behaviour tree with velocity-error/PD steering and one-shot skill intents governed by per-unit tick cooldowns"
  - "tests/control/default-ai.test.ts — CTRL-02/CTRL-04 behavioural proof (13 cases)"
  - "tests/control/pluggable.test.ts — CTRL-04 provider-swap, lifecycle, throwing-plugin isolation, updateTeam and real-AI autonomy proof (5 cases)"
affects: [04-kingdom-system, 07-ai-integration, v2 RL control]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 8838
  tasks: 3
  commits: 4
  plan_head_before: ee59ddca175c7d7e6d5972e204e3989bac8265e3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fixed-priority behaviour tree expressed as private methods (no node classes, no Status enum, no BT library)"
    - "velocity-error force + PD torque steering with every magnitude clamped at the AI boundary"
    - "one-shot skill intent per decision; cooldown state lives on the per-unit AI and advances by observation.tick"
    - "provider swap proven against real Rapier bodies without touching physics or units"
    - "throwing plugin isolated by ControlSystem's zero-action fallback"

key-files:
  created:
    - tests/control/default-ai.test.ts
    - tests/control/pluggable.test.ts
  modified:
    - src/control/DefaultUnitAI.ts

key-decisions:
  - "Behaviour tree priority is no-enemy idle -> low-health retreat -> in-range ram -> approach; retreat never emits a skill intent."
  - "Skill intent ordering is Charge -> Spin (inside DEFAULT_AI_ATTACK_RANGE) -> ArrowStorm -> bow (inside DEFAULT_AI_SKILL_RANGE), so at most one intent leaves a decision."
  - "Cooldown fields are armed as observation.tick + COOLDOWN_TICKS and start at 0, so a skill unlocked at spawn can fire on the first decision."
  - "The AI still stamps observation.unitId on every intent and consumes only the snapshot; no IUnit/physics/Rapier reference is held."
  - "Tests prove pluggability by driving identical real physics/unit setups with two constant-action providers along different axes rather than by inspecting source."

requirements-completed: [CTRL-04, CTRL-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "DefaultUnitAI three-behaviour priority tree with clamped velocity-error/PD steering (idle, approach, ram, retreat, PD damping)"
    requirement: "CTRL-04"
    verification:
      - kind: unit
        ref: "tests/control/default-ai.test.ts (13/13 passed)"
        status: pass
      - kind: unit
        ref: "pnpm typecheck (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "One-shot Charge/Spin/ArrowStorm/bow intents with per-unit tick cooldowns and no skill physics"
    requirement: "CTRL-02"
    verification:
      - kind: unit
        ref: "tests/control/default-ai.test.ts#emits one * intent per cooldown window"
        status: pass
      - kind: unit
        ref: "tests/control/default-ai.test.ts#emits only the six force/torque magnitudes plus the intent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Any IUnitAIProvider can replace the AI without touching physics or units; lifecycle create/destroy is exact and dispose idempotent"
    requirement: "CTRL-04"
    verification:
      - kind: integration
        ref: "tests/control/pluggable.test.ts#drives identical physics/unit setups with two different providers"
        status: pass
      - kind: integration
        ref: "tests/control/pluggable.test.ts#creates one AI per registration and destroys each exactly once"
        status: pass
    human_judgment: false
  - id: D4
    description: "A throwing provider cannot crash the loop; updateTeam reclassifies a unit in the next observation"
    requirement: "CTRL-04"
    verification:
      - kind: integration
        ref: "tests/control/pluggable.test.ts#isolates a throwing provider and leaves a fresh loop healthy"
        status: pass
      - kind: integration
        ref: "tests/control/pluggable.test.ts#reclassifies a unit after updateTeam without re-registration"
        status: pass
    human_judgment: false
  - id: D5
    description: "The real DefaultUnitAI runs autonomously and shrinks the initial 10 m separation over 120 ticks"
    requirement: "CTRL-04"
    verification:
      - kind: integration
        ref: "tests/control/pluggable.test.ts#runs the real DefaultUnitAI autonomously and closes the gap"
        status: pass
      - kind: integration
        ref: "pnpm test (20 files / 167 tests passed)"
        status: pass
    human_judgment: false

metrics:
  duration: 8min
  completed: 2026-10-20
status: complete
---

# Phase 03 Plan 03: 默认基线 AI 完整行为树与可插拔验收 Summary

**`DefaultUnitAI` is now a deterministic three-behaviour priority tree (retreat → ram → approach) with velocity-error/PD steering, one-shot Charge/Spin/ArrowStorm/bow intents on per-unit tick cooldowns, and two suites prove provider swaps, lifecycle, throwing-plugin isolation and real-AI autonomy on Rapier bodies.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-20T04:38:00Z (approx.)
- **Completed:** 2026-10-20T04:47:00Z
- **Tasks:** 3/3
- **Files modified/created:** 3 (1 source modified, 2 test files created)
- **Commits:** 4 (3 task commits + 1 style-only follow-up)

## Accomplishments

- `DefaultUnitAI` gained private cooldown state (`bowReadyTick`, `arrowStormReadyTick`, `chargeReadyTick`, `spinReadyTick`, all starting at 0) and `chooseSkillIntent`, without changing its public surface (`decide` remains the only public member).
- The selector now expresses the full D-14/D-16 tree: no enemy → zero action; low health → steer away at `DEFAULT_AI_RETREAT_SPEED` with no intent; inside `DEFAULT_AI_ATTACK_RANGE` → ram at `DEFAULT_AI_ATTACK_SPEED`; otherwise → approach at `DEFAULT_AI_APPROACH_SPEED`. Chase/ram both emit an intent.
- Skill intents follow D-17 exactly: at most one per decision, ordered Charge → Spin (close range) → ArrowStorm → bow (within `DEFAULT_AI_SKILL_RANGE`); each arms `observation.tick + <cooldown>` and every intent stamps `observation.unitId` with the correct `SkillIntentKind` discriminator.
- Steering stays velocity-error/PD and clamped; no RNG, wall-clock, `IUnit`, physics or Rapier access, and no new type declarations or inlined magic numbers.
- `tests/control/default-ai.test.ts` (13 cases) builds complete `IUnitObservation` literals with a nonzero Mass (10) and no Rapier: idle, approach magnitude, stronger ram, retreat direction, PD damping sign change, determinism, bow/Charge/Spin/ArrowStorm cooldown windows, Charge-over-Spin priority, no-unlock case, and an action-shape check proving only six magnitudes + intent are emitted.
- `tests/control/pluggable.test.ts` (5 cases) uses real `PhysicsWorld` + `ArenaSensingWorld` + `TestDamageSink`: two providers drive identical setups along +x and +y for 30 ticks; `create`/`destroy` counts are exact and `dispose()` is idempotent; a throwing `decide` survives 30 ticks with unchanged positions and a fresh loop still moves; `updateTeam` moves unit B from `allies` to `enemies` on the next observation; the real `DefaultUnitAI` autonomously closes the 10 m gap.

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete DefaultUnitAI — full behaviour tree + one-shot skill intents with tick cooldowns** — `c248266` (feat)
2. **Task 1 follow-up: prettier formatting of the completed AI** — `b638bc7` (style)
3. **Task 2: Add tests/control/default-ai.test.ts** — `dad9ce0` (test)
4. **Task 3: Add tests/control/pluggable.test.ts** — `dd447ce` (test)

**Plan metadata:** this SUMMARY + STATE/ROADMAP/REQUIREMENTS update (docs commit, made after this file).

## Files Created/Modified

- `src/control/DefaultUnitAI.ts` — added the four cooldown fields, `chooseSkillIntent`, `hasBow`; `decide` now runs the full priority selector; `buildAction` unchanged in mechanics (JSDoc updated).
- `tests/control/default-ai.test.ts` — `attributesWith`, `makeObservation`, `enemyAt`, `forceVector`, `torqueScalar`, `expectUnitSkill`, `expectBowIntent` helpers + 13 behavioural cases.
- `tests/control/pluggable.test.ts` — `ConstantActionAI`, `RecordingProvider`, `ThrowingAI`, `RecordingAI`, `zeroAction`, `axisAction`, `makeUnit`, `createSetup`, `registerPair`, `requireState` helpers + 5 pluggability cases.

## Decisions Made

- **Cooldown arming:** `readyTick = observation.tick + COOLDOWN_TICKS`; with fields initialised to 0 a spawn-unlocked skill fires on tick 0 and is unavailable on tick 1, then available exactly at the cooldown tick.
- **Intent priority:** Charge outranks Spin when both are unlocked; close-range unit skills outrank ArrowStorm and the bow, preserving the "at most one intent" invariant.
- **Retreat silences skills:** the retreat branch passes `null` directly, so a low-health unit never emits an intent even with unlocked skills/bow.
- **Provider-swap proof:** two identical setups driven by constant-action providers along different axes is stronger than inspecting source — it demonstrates the whole loop, not just the seam.
- **Throwing-plugin proof:** a zero-action fallback is asserted by unchanged spawn positions plus a second, healthy setup that still moves, proving the loop itself was not poisoned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Formatting] Prettier line-wrapping in the completed AI**
- **Found during:** Task 2 lint pass
- **Issue:** `eslint` (prettier/prettier) flagged two wrapped assignments introduced in Task 1.
- **Fix:** `eslint --fix` collapsed them to single lines; no behavior change.
- **Files modified:** `src/control/DefaultUnitAI.ts`
- **Verification:** `pnpm exec eslint src/control/DefaultUnitAI.ts tests/control/*.test.ts` exits 0.
- **Committed in:** `b638bc7`

**2. [Rule 2 - Test-only completeness] Added a recording AI wrapper**
- **Found during:** Task 3 (`updateTeam` case)
- **Issue:** The three named test-local classes could not capture the observation snapshot needed to prove reclassification.
- **Fix:** Added a minimal `RecordingAI implements IUnitAI` whose only public member is `decide` (same pattern as `tests/control/loop.test.ts`).
- **Files modified:** `tests/control/pluggable.test.ts`
- **Verification:** the `updateTeam` case asserts unit 2 moves from `allies` to `enemies`.
- **Committed in:** `dd447ce`

---

**Total deviations:** 2 (1 formatting, 1 test-only helper). **Impact:** No production behavior change, no scope creep; both were required to keep the lint gate green and the reclassification proof possible.

## Issues Encountered

- The plan's Task 1 `<verify>` only requires `typecheck` + `loop.test.ts`, so the prettier violations surfaced one task later during the Task 2 lint pass and were fixed in a dedicated style commit rather than by amending the already-committed task.

## Known Stubs

None. Every constant introduced in 03-02 (`BOW_SHOT_INTERVAL_TICKS`, `ARROW_STORM_COOLDOWN_TICKS`, `CHARGE_COOLDOWN_TICKS`, `SPIN_COOLDOWN_TICKS`, `DEFAULT_AI_SKILL_RANGE`) is now consumed by `DefaultUnitAI` and pinned by tests.

## Threat Flags

None. The plan's threat register was implemented as specified: all force/torque magnitudes are clamped (`T-03-11`), throwing plugins are isolated and proven over 30 ticks (`T-03-12`), intents always carry the deciding `unitId` (`T-03-13`), the AI holds no `IUnit`/physics reference (`T-03-14`), synchronous-plugin preemption remains an accepted v1 limitation (`T-03-15`), and zero dependencies were added (`T-03-SC`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 is **complete**: CTRL-01..04 are covered by the sensing/loop suites (03-02) plus the default-AI and pluggability suites (03-03). The simulation now runs autonomously with a replaceable AI provider.
- `src/control/types.ts`, `src/units/*`, `src/physics/*`, `package.json` and `pnpm-lock.yaml` have no diff in this plan.
- Phase 4 (王国系统) can implement `ISensingWorld` against the kingdom map and swap `IDamageSink` for real battle settlement; `IUnitAIProvider` remains the only AI seam for RL/LLM control.

---

## Self-Check: PASSED

- `src/control/DefaultUnitAI.ts`, `tests/control/default-ai.test.ts`, `tests/control/pluggable.test.ts` all exist.
- Commits `c248266`, `b638bc7`, `dad9ce0`, `dd447ce` are present in `git log`.
- `pnpm typecheck` exits 0; `pnpm vitest run tests/control/default-ai.test.ts` = 13/13; `pnpm vitest run tests/control/pluggable.test.ts` = 5/5; `pnpm test` = 20 files / 167 tests; `pnpm lint` exits 0.
- No diff under `src/physics/`, `src/units/`, `src/control/types.ts`, `package.json`, or `pnpm-lock.yaml`.

---

*Phase: 03-control-system*
*Completed: 2026-10-20 (round 3 — default AI behaviour tree + pluggability acceptance)*
