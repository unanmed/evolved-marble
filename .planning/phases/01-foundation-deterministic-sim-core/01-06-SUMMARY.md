---
phase: 01-foundation-deterministic-sim-core
plan: 06
subsystem: sim-core
tags: [style-retrofit, d-13, d-14, d-15, d-16, interface-first, numeric-enum, no-underscore-prefix, named-interfaces, determinism, fingerprint-identity, sim-01, sim-02, sim-03]

# Dependency graph
requires: [01-05]
provides:
  - "src/sim/commands.ts — numeric CommandKind enum + named IForceCommand/ITorqueCommand/IWeaponAbilityCommand/IUnitAbilityCommand/ISpawnCommand; IRejectedCommand; IValidateOk/IValidateErr; ICommandQueue"
  - "src/sim/core/events.ts — numeric SimEventKind enum + named ICommandEvent/IRejectedEvent/IDamageEvent/IKillEvent/ILevelupEvent/IContactEvent; IEventLog"
  - "src/sim + src/host + tests — every class is interface-first (I<ClassName> + implements); no class name used as a type; no inline object types; no private `_` prefix"
  - "the D-12..D-16 project-locked conventions are now the inherited baseline for every later phase"
affects: [physics, combat, ai, render, bridge, rl-reset, style-retrofit, review-remediation]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff, .planning excluded).
actuals:
  tokens: 12655
  tasks: 2
  commits: 3
  plan_head_before: 2207bc2c42438ffb62e26e81a8a310288b1dca82

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface-first classes (D-13): every class declares an exported I<ClassName> interface immediately above it and `implements` it; the interface mirrors the class's public surface exactly (no added/removed members)."
    - "Numeric enums as discriminants (D-14): CommandKind/SimEventKind are numeric `enum`s so `switch (cmd.kind)` still narrows at compile time; string-literal-union discriminants are banned project-wide."
    - "Named variant interfaces (D-16): every member of a discriminated union is a named interface; inline object types are replaced by named interfaces (IUnitAttrs/IUnitXform/IMutatorCase/IPerformanceStub/IPerformanceGlobal)."
    - "No `_` prefix on private members (D-15): backing fields are camelCase behind the `private` keyword (tickCount, rejectedCount, simState); public accessors keep their names."
    - "Behavior-preserving rename proof: fixed-seed fingerprint trace captured before and after the retrofit and asserted byte-identical."

key-files:
  created: []
  modified:
    - src/sim/commands.ts
    - src/sim/core/events.ts
    - src/sim/battle-sim.ts
    - src/sim/core/clock.ts
    - src/sim/core/rng.ts
    - src/sim/world/entity-store.ts
    - src/sim/world/world.ts
    - src/sim/snapshot.ts
    - src/sim/systems/movement.ts
    - src/host/loop.ts
    - tests/sim/commands.test.ts
    - tests/helpers/run-sim.ts
    - tests/host/loop.test.ts
    - tests/sim/clock.test.ts
    - tests/sim/snapshot.test.ts
    - tests/sim/headless.test.ts
    - tests/sim/rng.test.ts

key-decisions:
  - "Command/event kinds became numeric enums with a fixed ordinal (Force=0, Torque=1, WeaponAbility=2, UnitAbility=3, Spawn=4; Command=0, Rejected=1, Damage=2, Kill=3, Levelup=4, Contact=5) — order chosen to preserve the existing switch grouping and reserved branches."
  - "isKnownKind now accepts only numeric enum values (typeof number + membership); strings, NaN and unknown numbers stay deterministically rejected, and the deterministic rejection/counting behavior is unchanged (T-01-05)."
  - "Renamed interfaces keep their meaning but gain the mandatory I prefix (IRngStream, IUnitComponents, IEntitySnapshot, IStepTarget, IRunLoopConfig, IBattleSimConfig, ISimState, IRunTraceOptions); type aliases that are not interfaces/enums (EntityId, RngState, Command, SimEvent, ValidateResult) keep their names per the plan."
  - "IUnitComponents was split so its nested shapes are named (IUnitAttrs, IUnitXform) rather than inline object types (D-16)."
  - "The snapshot.ts prose reference to `SimState` was updated to `ISimState`; prose references to class names (BattleSim/EntityStore/RandomStreams/TickClock/CommandQueue) were left as-is because those classes keep their names."
  - "Full JSDoc pass is deferred to Plan 01-07 (D-12); this plan only added JSDoc to newly-introduced symbols and kept renamed-symbol references consistent."

patterns-established:
  - "A rename/type-identity retrofit cannot be split per-file: TypeScript does not compile a half-renamed graph, so D-13 landed as one globally-atomic task with all producers/consumers updated together."
  - "A behavior-preserving refactor is verified by capturing the fixed-seed fingerprint trace before the change and asserting byte-identity after it — not just by re-running the same self-consistency gate."

requirements-completed: [SIM-01, SIM-02, SIM-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Command/event discriminants are numeric enums and every discriminated-union member is a named interface (no string-literal-union enums, no inline object union members)."
    requirement: "SIM-02"
    verification:
      - kind: unit
        ref: "tests/sim/commands.test.ts (9 tests) uses CommandKind/SimEventKind across drain/validation/submit"
        status: pass
      - kind: other
        ref: "grep for `kind: '` in src/sim/commands.ts and src/sim/core/events.ts returns no matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every class in src/** and tests/** has an exported I<ClassName> interface it implements, and no class name is used in any type position (D-13)."
    requirement: "SIM-01"
    verification:
      - kind: other
        ref: "pnpm run typecheck (tsconfig.json + tsconfig.sim.json) exit 0"
        status: pass
      - kind: other
        ref: "grep whole-word for :/< class names (BattleSim, EntityStore, SimState, TickClock, RandomStreams, CommandQueue, EventLog, StepTarget, RunLoopConfig, BattleSimConfig, RngStream, UnitComponents, EntitySnapshot, RunTraceOptions, RejectedCommand) finds only value usages (new X()), class declarations (implements), and prose"
        status: pass
    human_judgment: false
  - id: D3
    description: "No private member carries a leading `_` prefix (D-15): TickClock._tick->tickCount, CommandQueue._rejectedTotal->rejectedCount, BattleSim._state->simState, with public accessors unchanged."
    requirement: "SIM-01"
    verification:
      - kind: other
        ref: "grep for `private _` across src/** returns no matches"
        status: pass
    human_judgment: false
  - id: D4
    description: "Previously-inline object types are named interfaces: IUnitAttrs/IUnitXform (entity-store), IMutatorCase (snapshot.test), IPerformanceStub/IPerformanceGlobal (clock.test)."
    requirement: "SIM-03"
    verification:
      - kind: other
        ref: "pnpm run typecheck exit 0 with the named interfaces replacing the inline literals"
        status: pass
    human_judgment: false
  - id: D5
    description: "The retrofit is byte-for-byte behavior-preserving: the fixed-seed fingerprint trace is identical before and after."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/determinism/gate.test.ts (3 tests) — pnpm gate exit 0"
        status: pass
      - kind: other
        ref: "captured trace FP_TRACE (12 ticks, seed 12345) + FP_FINAL identical pre- and post-retrofit (final = ed670b76a9019)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 06: D-13/D-14/D-15/D-16 Style Retrofit Summary

**Retrofitted the whole Phase-1 tree to the project-locked code-style conventions: numeric `CommandKind`/`SimEventKind` enums with named variant interfaces, interface-first classes with `I`-prefixed interfaces and no class-as-type, named inline types, and no `_` prefix on private members — byte-for-byte behavior-preserving (the fixed-seed fingerprint trace is unchanged).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-10-15T13:32:26Z
- **Completed:** 2026-10-15T13:50:00Z
- **Tasks:** 2 (Task 1 tracer TDD: RED→GREEN; Task 2 auto, globally atomic; no checkpoints)
- **Files modified:** 17 (10 source + 7 test)

## Accomplishments

- **Task 1 (D-14/D-16, TDD tracer)** — converted the sim's inward contract from string-literal discriminants to numeric enums. `CommandKind { Force=0, Torque=1, WeaponAbility=2, UnitAbility=3, Spawn=4 }` and `SimEventKind { Command=0, Rejected=1, Damage=2, Kill=3, Levelup=4, Contact=5 }`. Each union member is now a named interface (`IForceCommand`, `ITorqueCommand`, `IWeaponAbilityCommand`, `IUnitAbilityCommand`, `ISpawnCommand`, `ICommandEvent`, `IRejectedEvent`, `IDamageEvent`, `IKillEvent`, `ILevelupEvent`, `IContactEvent`); `RejectedCommand`→`IRejectedCommand`; the local `ValidateResult` inline union became `IValidateOk | IValidateErr`. `isKnownKind` accepts only numeric enum values (strings/NaN/unknown still rejected). `battle-sim.ts` `switch (cmd.kind)` narrows on the numeric enum; emit/rejected events use `SimEventKind`.
- **Task 2 (D-13/D-15/D-16, globally atomic)** — added an exported `I<ClassName>` interface above every class and made the class `implements` it: `ITickClock`, `IRandomStreams`, `IEntityStore`, `ICommandQueue`, `IEventLog`, `IBattleSim`, plus the test-local `ICounter`. Renamed existing interfaces to the `I` prefix: `IRngStream`, `IUnitComponents`, `IEntitySnapshot`, `IStepTarget`, `IRunLoopConfig`, `IBattleSimConfig`, `ISimState`, `IRunTraceOptions`. Switched every type position to the interface (members, parameters, returns, `Array<>`/`Record<>` element types) so no class name is used as a type anywhere. Split `IUnitComponents` into named `IUnitAttrs`/`IUnitXform`; named the inline `performance` stub (`IPerformanceStub`/`IPerformanceGlobal`) and the snapshot mutator case (`IMutatorCase`). Removed `_` prefixes: `tickCount`, `rejectedCount`, `simState`.
- **Behavior-proof retrofits are safe:** captured the 12-tick fixed-seed fingerprint trace (seed 12345) before the retrofit and re-captured it after; both traces and the final fingerprint (`ed670b76a9019`) are byte-identical.
- **Full suite green:** `pnpm run typecheck` (both projects) exit 0; `pnpm run lint` exit 0; `pnpm test` 51 passed; `pnpm gate` 3 passed.

## Task Commits

Each task was committed atomically (Task 1 is a TDD tracer: RED then GREEN):

1. **Task 1 RED: failing numeric-enum command/event contract tests** - `acf8bf0` (test)
2. **Task 1 GREEN: numeric CommandKind/SimEventKind enums + named variant interfaces** - `69e2356` (feat)
3. **Task 2: interface-first classes, no class-as-type, named inline types, no `_` prefix** - `6c92d3b` (refactor)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## TDD Gate Compliance

Task 1 (`type="tracer" tdd="true"`) followed RED → GREEN:

- **RED** (`acf8bf0`, `test(01-06): ...`): the updated `commands.test.ts` referenced `CommandKind`/`SimEventKind`/`IRejectedEvent` before they existed — 8 of 9 cases failed at runtime with `TypeError: Cannot read properties of undefined (reading 'Force')` (`SimEventKind.Rejected` similarly), captured from `pnpm vitest run tests/sim/commands.test.ts`. This is the honest RED for a *type-identity* change: the behavior is unchanged, so the only thing that can fail is the not-yet-declared contract.
- **GREEN** (`69e2356`, `feat(01-06): ...`): declaring the enums/interfaces made all 9 cases pass; assertions were not weakened (drain order, rejection count, velocity delta and determinism are unchanged).
- **REFACTOR:** none needed.

`workflow.tdd_mode` is disabled in this project's config, so the machine-enforced RED-evidence gate did not run; the discipline was followed manually with the RED failure captured above.

**Tracer feedback gate:** Task 1's `<verify>` is automated-only (`pnpm run typecheck; pnpm vitest run tests/sim/commands.test.ts`). `human_verify_mode` is `end-of-phase`, so the verify was re-run end-to-end after GREEN and passed — no human checkpoint was inserted, and expansion to Task 2 proceeded.

## Files Created/Modified

- `src/sim/commands.ts` — numeric `CommandKind`; named command interfaces; `IRejectedCommand`; `IValidateOk`/`IValidateErr`; `ICommandQueue`; private `rejectedCount`; numeric `isKnownKind`.
- `src/sim/core/events.ts` — numeric `SimEventKind`; named event interfaces; `IEventLog`.
- `src/sim/battle-sim.ts` — `IBattleSimConfig`/`ISimState`/`IBattleSim`; private `simState` (was `_state`); switch/emit on numeric enum kinds.
- `src/sim/core/clock.ts` — `ITickClock`; private `tickCount` (was `_tick`).
- `src/sim/core/rng.ts` — `IRngStream`/`IRandomStreams`.
- `src/sim/world/entity-store.ts` — `IUnitAttrs`/`IUnitXform`/`IUnitComponents`/`IEntitySnapshot`/`IEntityStore`.
- `src/sim/world/world.ts` — `ISimState` with interface-typed fields.
- `src/sim/snapshot.ts` — types switched to `ISimState`/`IEntitySnapshot`; prose `SimState`→`ISimState`.
- `src/sim/systems/movement.ts` — `movementSystem(w: ISimState, dt)`.
- `src/host/loop.ts` — `IStepTarget`/`IRunLoopConfig` + JSDoc `@param`/`@returns`.
- `tests/sim/commands.test.ts` — enum-valued kinds; unchanged assertions.
- `tests/helpers/run-sim.ts` — `IRunTraceOptions`.
- `tests/host/loop.test.ts` — `ICounter extends IStepTarget` + `class Counter implements ICounter`.
- `tests/sim/clock.test.ts` — `IPerformanceStub`/`IPerformanceGlobal`.
- `tests/sim/snapshot.test.ts` — `IBattleSim`; `IMutatorCase` object-array mutator census (`$name` interpolation).
- `tests/sim/headless.test.ts` — `buildSim(...): IBattleSim`.
- `tests/sim/rng.test.ts` — `draw(rs: IRandomStreams, ...)`.

## Decisions Made

- **Fixed enum ordinals** were chosen to preserve the existing `switch` grouping (`Torque`/`WeaponAbility`/`UnitAbility` share one branch; `Spawn` stays the reserved branch) and to keep the numeric kind stable for later phases.
- **`isKnownKind` accepts only numeric enum values** — the deterministic rejection/counting contract (T-01-05) is unchanged; strings and unknown numbers are still dropped and counted, never thrown.
- **Type aliases that are neither interfaces nor enums keep their names** (`EntityId`, `RngState`, `Command`, `SimEvent`, `ValidateResult`) per the plan.
- **Prose references to class names were left intact** (classes keep their names); only the renamed-interface prose (`SimState`→`ISimState`) was updated (full D-12 JSDoc pass is Plan 01-07).
- **D-13 landed as one atomic task** because TypeScript cannot compile a half-renamed type graph; the pre-commit hook (lint + determinism) stays green after each task.

## Deviations from Plan

None - plan executed exactly as written. The plan's file list named `src/config/sim.ts`, `src/sim/content/formulas.ts`, `src/sim/core/math.ts`, `src/host/pump.ts` and `tests/sim/entity-store.test.ts` as part of the "retrofit surface"; none of them declared a class, interface, inline object type, or `_`-prefixed member, so they required no edit (the plan is `files_modified`-conservative).

## Issues Encountered

- The pre-commit hook runs only `pnpm run lint` + the determinism tests (not typecheck), so the deliberate RED commit — which is type-incomplete by construction — was committable. Lint (non-type-aware typescript-eslint) and the determinism suite both passed on the RED state; the RED failure was captured with the task's own `pnpm vitest run tests/sim/commands.test.ts`.
- No `pnpm run build` script exists (pre-existing; Phase 1 removed the predecessor entry point). Out of scope; the plan's verification does not require a build.

## Known Stubs

- None introduced. The Phase-1 `movementSystem` stand-in is unchanged; command/event contracts are unchanged in behavior (only their discriminant representation changed).

## Threat Flags

None — no new network/auth/file/schema surface. **T-01-05** (silently dropped command variant) remains mitigated: `isKnownKind` accepts only the numeric enum set and the deterministic reject+count contract is re-proven by `commands.test.ts`. **T-01-01** (sim/** randomness/time after refactor) is unaffected: this is a pure rename/type retrofit with no logic change, and the DOM-free `tsconfig.sim.json` + ESLint `sim/**` boundary still pass (the verify runs lint + gate). **T-01-03** remains a non-cryptographic diagnostic (disposition=accept).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every later phase inherits the project-locked conventions: new classes must ship an `I<ClassName>` interface, command/event kinds must be numeric enums, private members must not use `_`, and inline object types must be named.
- The command/event contract is now enum-discriminated while remaining behavior-identical; the fixed-seed determinism gate (`ed670b76a9019` trace) is unchanged, so Phase 2's physics can attach without re-baselining.
- Full JSDoc coverage (D-12) is the remaining style item, planned separately in Plan 01-07.
- No blockers. `pnpm run typecheck` (both projects), `pnpm run lint`, `pnpm test` (51), and `pnpm gate` (3) are all green.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `src/sim/commands.ts`, `src/sim/core/events.ts`, `src/sim/battle-sim.ts`, `src/sim/core/clock.ts`, `src/sim/core/rng.ts`, `src/sim/world/entity-store.ts`, `src/sim/world/world.ts`, `src/sim/snapshot.ts`, `src/sim/systems/movement.ts`, `src/host/loop.ts`
- FOUND: commits `acf8bf0`, `69e2356`, `6c92d3b`
- VERIFIED: fingerprints identical pre/post (`ed670b76a9019`); typecheck/lint/test/gate all green
