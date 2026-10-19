---
phase: 03-control-system
plan: 01
subsystem: control
tags: [typescript, type-contract, ai-control, numeric-enum, vitest, typecheck]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "AttributeKind / ClassKind / IEquipment / IUnit / SkillKind / WeaponKind frozen types"
  - phase: 02-physics-simulation
    provides: "IUnitState motion readout and IDamageEvent frozen type"
provides:
  - "src/control/types.ts — complete control-system contract (17 I* interfaces + SkillIntentKind enum + SkillIntent union)"
  - "tests/control/types.test.ts — enum ordinal pinning + compile-time contract proof"
  - "An APPROVED type-first gate authorising round-2 implementation planning"
affects: [03-control-system round 2, 04-kingdom-system, 07-ai-integration]

# Actuals (#2632) — same estimateTokens scale (chars/4 over realized diff)
actuals:
  tokens: 4513
  tasks: 3
  commits: 2
  plan_head_before: e31e8aed069a1ecd1fafea8f8621b3e73bfc5c71

# Tech tracking
tech-stack:
  added: []
  patterns: [type-only-import-contract, declarations-only-types-module, numeric-enum-discriminant]

key-files:
  created:
    - src/control/types.ts
    - tests/control/types.test.ts
  modified: []

key-decisions:
  - "ROUND 1 ONLY: the plan delivers the type contract, not the behavior — Sensor, ControlSystem loop, ArenaSensingWorld, DefaultUnitAI, IDamageSink glue and constants are round-2 work."
  - "The type-design gate was APPROVED by the user as written; approval authorises round-2 implementation PLANNING, not implementation in this run."
  - "requirements-completed is intentionally empty: CTRL-01..04 describe behavioral outcomes that round 1 only contracts; they are not satisfied until round 2 lands (same precedent as Phase 2 P02)."
  - "IUnitState is imported type-only from @/physics/types and never redeclared; the control module does not extend IPhysicsWorld."
  - "Absent objects are null (sense result, getUnit, skillIntent); the absent literal getTeam is number | undefined — AGENTS §8."
  - "SkillIntentKind is a numeric enum (Weapon=0, Unit=1); string enums forbidden by AGENTS §3."

patterns-established:
  - "Declarations-only types module: one numeric enum + interfaces + one union alias, JSDoc on every member, no class/function/const/Rapier import."
  - "Compile-time contract proof via a complete IUnitObservation literal plus expectTypeOf, with only enum ordinals asserted at runtime."

requirements-completed: []  # Round 1 only — CTRL-01..04 behavior is deferred to round 2.

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Complete control-system type contract declared (17 I* interfaces, numeric SkillIntentKind, SkillIntent union)"
    requirement: "CTRL-01, CTRL-02, CTRL-03, CTRL-04"
    verification:
      - kind: unit
        ref: "pnpm typecheck (exit 0)"
        status: pass
      - kind: unit
        ref: "node presence check over src/control/types.ts → CTRL_TYPES_OK (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Numeric enum ordinals pinned and the snapshot/action/provider contract compile-checked"
    verification:
      - kind: unit
        ref: "tests/control/types.test.ts (7/7 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Mandatory type-first review gate approved by the user"
    verification: []
    human_judgment: true
    rationale: "The project convention (PROJECT.md / AGENTS.md) requires an explicit human design approval before round-2 implementation planning; it cannot be automated."

# Metrics
duration: 13min
completed: 2026-10-19
status: complete
---

# Phase 03 Plan 01: 操控系统类型契约 Summary

**Complete control-system contract — 17 JSDoc'd `I*` interfaces plus the numeric `SkillIntentKind` enum — approved at the type-first gate, unlocking round-2 implementation planning.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-19T13:55:04Z (2026-10-19 21:55 +08:00)
- **Completed:** 2026-10-19T14:08:32Z (2026-10-19 22:08 +08:00)
- **Tasks:** 3/3 (2 executable + 1 blocking-human decision resolved)
- **Files modified:** 2

## Accomplishments

- Declared the complete control-system type contract in `src/control/types.ts`: `SkillIntentKind` (numeric), `SkillIntent` union, and 17 `I*` interfaces covering observation, action, AI/provider seam, sensing, catalogue, damage sink, registration and the control loop — declarations only, no class/function/`const`/Rapier import.
- Pinned the numeric enum ordinals and compile-proved the contract in `tests/control/types.test.ts` (7/7 tests), including a complete `IUnitObservation` literal over every `AttributeKind` key and `expectTypeOf` checks on `decide`/`create`/`sense`.
- Resolved the mandatory blocking-human type-design gate: user response `approve` — the contract is frozen for round-2 planning and the Phase-4 kingdom world.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write `src/control/types.ts`** — `8265b73` (feat)
2. **Task 2: Add `tests/control/types.test.ts`** — `5ca0742` (test)
3. **Task 3: Type-design gate (`checkpoint:decision`)** — resolved by user `approve`; no code commit (checkpoint only)

**Plan metadata:** this SUMMARY + STATE/ROADMAP update (docs commit, made after this file).

_Note: Task 3 is a blocking-human decision, so it produces no commit of its own; its outcome is recorded here and in the State updates._

## Files Created/Modified

- `src/control/types.ts` — declarations-only control-system contract: `SkillIntentKind` (Weapon=0, Unit=1), `IUnitBrief`, `IProjectileSighting`, `ISensedUnit`, `ISensingWorld`, `IUnitObservation`, `IWeaponSkillIntent`, `IUnitSkillIntent`, `SkillIntent`, `IUnitAction`, `IUnitAI`, `IUnitAIProvider`, `ISensor`, `IUnitCatalog`, `IDamageContext`, `IDamageSink`, `IControlUnitRegistration`, `IControlTickResult`, `IControlSystem`.
- `tests/control/types.test.ts` — enum ordinal pinning + compile-time contract and `@/control/types` alias-resolution proof.

## Decisions Made

- **Round 1 stops at the gate.** The phase is split by the project's two-round convention: this plan declares types; the behavioral half (Sensor, ControlSystem loop, ArenaSensingWorld, DefaultUnitAI, damage-sink glue, `src/control/constants.ts`) is planned separately in round 2.
- **The gate is approved.** The user approved `src/control/types.ts` as written. This authorises round-2 implementation planning only — no implementation was performed in this run.
- **`requirements-completed` stays empty.** CTRL-01..04 are behavioral outcomes; round 1 supplies the contract they will be verified against. Marking them complete now would falsely signal the phase goal is met (same precedent as Phase 2 plan 02).
- **Design answers surfaced at the gate** (recorded for round 2, no contract change): sensing seam is control-owned and env-geometry-only (A1); first-equipped-weapon wins at registration (A3); decide-then-apply ordering on ticks 0/6/12 (A5); cooldown owned by the AI instance with intents leaving via `IControlTickResult.skillIntents` (A7); `ControlSystem` owns dead-unit deregistration (A8); `IUnitState` imported directly from `@/physics/types`; the `IUnit` split between the pure `IUnitObservation` and the seam-level `IUnitAIProvider.create` / catalogue / damage context (item 16); round 2 must inject a tick source into the Sensor (item 17).

## Deviations from Plan

None - plan executed exactly as written. Task 3 was a designed blocking-human checkpoint and was resolved by the user's `approve` response rather than auto-approved.

## Issues Encountered

None.

## Known Stubs

None. The module is intentionally declarations-only; absence of `Sensor`, `ControlSystem`, `DefaultUnitAI` and constants is the plan's stated round-1 scope, not a stub.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The control-system type contract is stable and approved; round-2 implementation planning can proceed against it.
- **Phase 3 is NOT complete:** its behavioral success criteria (default baseline AI, 6-tick decision loop, pluggable end-to-end run) remain for round 2. ROADMAP stays `In Progress`; the phase checkbox and completion date must not be stamped.
- Round 2 must not re-plan or reshape `src/control/types.ts`; open items A1/A3/A5/A7/A8 are answered above.

---

## Self-Check: PASSED

- `src/control/types.ts` exists and is unchanged since `8265b73` (empty diff).
- `tests/control/types.test.ts` exists and is unchanged since `5ca0742` (empty diff).
- `pnpm typecheck` exits 0; presence check prints `CTRL_TYPES_OK`.
- `pnpm vitest run tests/control/types.test.ts` exits 0 with 7/7 tests passing.
- No implementation file exists beyond the plan's two declared files (`src/control/` contains only `types.ts`).

---

*Phase: 03-control-system*
*Completed: 2026-10-19 (round 1 — type declarations only)*
