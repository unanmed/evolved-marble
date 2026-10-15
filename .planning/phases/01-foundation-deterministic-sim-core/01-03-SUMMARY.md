---
phase: 01-foundation-deterministic-sim-core
plan: 03
subsystem: sim-core
tags: [determinism, seeded-rng, command-contract, event-log, boundary-enforcement, eslint, fixed-timestep, headless]

# Dependency graph
requires: [01-02]
provides:
  - "src/sim/commands.ts — Command discriminated union (force/torque/weaponAbility/unitAbility/spawn) + total CommandQueue (structural validation, deterministic rejection)"
  - "src/sim/core/events.ts — typed per-tick SimEvent union + EventLog (emit copies, drain/clear)"
  - "src/sim/core/math.ts — documented sanctioned deterministic math subset (D-02) + clamp"
  - "src/sim/content/formulas.ts — data-only TS constants module (D-06), zero imports (A7)"
  - "SimState gains commands + events; BattleSim.submit() intake"
  - "BattleSim.step() drains the command queue once at the TOP (external timing never enters the step)"
  - "eslint.config.js sim/** headless boundary block (imports/globals/properties/syntax) — the lint half of SIM-03"
  - "tests/sim/rng.test.ts, tests/sim/commands.test.ts, tests/sim/clock.test.ts, tests/host/loop.test.ts"
affects: [01-04, physics, combat, ai, rendering, bridge]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff, .md excluded).
actuals:
  tokens: 6655
  tasks: 3
  commits: 3
  plan_head_before: 2ee96a1f7a8caf7a5edcfe6f1c97925bea7ed909

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Total (never-throwing) Command intake: unknown kind / missing field → deterministic drop + rejection counter (T-01-05); no silent no-op, no undefined dereference"
    - "Commands drained exactly once at the TOP of BattleSim.step(); force applied before movementSystem; unknown entity targets dropped deterministically"
    - "Per-tick EventLog: cleared at tick start, emit stores shallow copies, drain returns a copy array"
    - "single-source numeric constants in src/sim/content (D-06) consumed by systems"
    - "Two-layer headless boundary completed: ESLint sim/** block (imports/globals/properties/syntax) alongside the DOM-free tsconfig.sim.json"

key-files:
  created:
    - src/sim/commands.ts
    - src/sim/core/events.ts
    - src/sim/core/math.ts
    - src/sim/content/formulas.ts
    - tests/sim/rng.test.ts
    - tests/sim/commands.test.ts
    - tests/sim/clock.test.ts
    - tests/host/loop.test.ts
  modified:
    - src/sim/systems/movement.ts
    - src/sim/world/world.ts
    - src/sim/battle-sim.ts
    - eslint.config.js

key-decisions:
  - "submit() accepts readonly unknown[] (not readonly Command[]) — the intake must validate untrusted runtime shapes, which a Command[]-typed signature would forbid at compile time."
  - "Force is applied before movementSystem so the same tick integrates the new velocity; unknown entity targets are dropped via an ordered-id existence check (no throwing get())."
  - "CommandQueue keeps a monotonic rejectedTotal plus a per-batch rejection list; BattleSim converts the latter into `rejected` events each tick."
  - "torque/weaponAbility/unitAbility/spawn are accepted-and-recorded (emit `command`) but inert in Phase 1 — reserved surfaces, never a silent no-op."
  - "MOVEMENT_NUDGE_SCALE moved into content/formulas.ts (D-06 single source) and movement.ts consumes it; Math global is NOT banned (D-02 allows sin/cos)."

patterns-established:
  - "Trust-boundary intake is a total function — validate shape, drop-and-count on failure, never throw."
  - "Every tick: clear events → drain commands once → advance clock → apply commands → run systems."
  - "Headless boundary is enforced twice (lint + DOM-free tsconfig); verify via `eslint --print-config`."

requirements-completed: [SIM-01, SIM-02, SIM-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "All sim randomness is a named, seeded, independent, JSON-serializable sfc32 stream behind RandomStreams; unknown names throw and save()/restore() round-trips."
    requirement: "SIM-02"
    verification:
      - kind: unit
        ref: "tests/sim/rng.test.ts (5 passed) — independence, save/restore round-trip, unknown-name throw, byte-identical save()"
        status: pass
    human_judgment: false
  - id: D2
    description: "External control enters only as typed Commands drained exactly once per step; unknown kind/missing field/unknown entity are rejected or dropped deterministically and recorded."
    requirement: "SIM-02"
    verification:
      - kind: unit
        ref: "tests/sim/commands.test.ts (9 passed) — force velocity, single-drain, post-step isolation, unknown kind, unknown entity, same-seed determinism"
        status: pass
    human_judgment: false
  - id: D3
    description: "sim/** is headless by construction: lint bans render/host/driver/pixi/node imports, DOM/timer/clock globals, Math.random/Date.now/performance.now and new Date(); Math.sin/cos stay allowed."
    requirement: "SIM-03"
    verification:
      - kind: other
        ref: "pnpm run lint (exit 0); pnpm exec eslint --print-config src/sim/battle-sim.ts resolves no-restricted-properties + no-restricted-globals; boundary probe (Math.random/Date.now/new Date) reported errors"
        status: pass
      - kind: typecheck
        ref: "pnpm run typecheck (tsconfig.sim.json DOM-free project) — exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fixed-step pacing is unit-proven: the tick counter advances by exactly one with no wall-clock read; the accumulator turns a frame budget into floor(acc/dt) whole steps, clamps spikes to maxFrame, zeroes debt at maxSteps, and yields alpha in [0,1)."
    requirement: "SIM-01"
    verification:
      - kind: unit
        ref: "tests/sim/clock.test.ts (3 passed) + tests/host/loop.test.ts (5 passed)"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 03: Command Contract, Seeded-Stream Facade & Headless Boundary Summary

**Named seeded sfc32 streams behind a serializable facade, a total `Command` intake drained once per tick with deterministic rejection, a per-tick typed event log, data-only content constants, and the ESLint half of the `sim/**` headless boundary — proven by 25 passing tests.**

## Performance

- **Duration:** ~11 min execution
- **Started:** 2026-10-15T19:01:55Z
- **Completed:** 2026-10-15T19:13Z
- **Tasks:** 3 (all `type="auto"`; no checkpoints)
- **Files modified:** 12 (`src/tests/eslint.config.js`) + this SUMMARY

## Accomplishments

- **Task 1** — finalized the RNG facade with a dedicated `tests/sim/rng.test.ts` (same-seed identity, different-seed divergence, named-stream independence, `save`/`restore` round-trip, unknown-name throw, byte-identical `save()`); added `src/sim/core/math.ts` (documented sanctioned deterministic math subset per D-02 + `clamp`) and `src/sim/content/formulas.ts` (data-only, zero imports, D-06/A7).
- **Task 2** — added `src/sim/commands.ts` (`Command` union grounded in `ai-marble-kingdom.md:153-158` + a **total** `CommandQueue`) and `src/sim/core/events.ts` (typed per-tick `SimEvent`/`EventLog`); extended `SimState` (`commands`, `events`) and `BattleSim` (`submit()`, and `step()` draining the queue once at the top before `movementSystem`).
- **Task 3** — extended `eslint.config.js` with the `sim/**` boundary block and added `tests/sim/clock.test.ts` + `tests/host/loop.test.ts`.
- Malformed/unknown commands are rejected deterministically and counted (`rejectedTotal`); a command for a non-existent entity is dropped (no throw); two identical seed + command-log runs produce identical fingerprints.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm vitest run` (25 tests) are all green; `eslint --print-config` on a `src/sim/**` file resolves both boundary rules, and a throwaway probe using `Math.random` / `Date.now` / `new Date` was correctly flagged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seeded RNG facade + sanctioned math + content data module** - `f87caa8` (feat)
2. **Task 2: Typed Command contract + per-tick EventLog** - `b863178` (feat)
3. **Task 3: Enforce sim/** headless boundary + clock/loop tests** - `5286fcc` (test)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## Files Created/Modified

- `tests/sim/rng.test.ts` — named-stream independence, save/restore, unknown-name throw, byte-identical save() (SIM-02).
- `src/sim/core/math.ts` — sanctioned deterministic math subset (D-02) + `clamp`; no libm reimplementation.
- `src/sim/content/formulas.ts` — data-only constants (`MOVEMENT_NUDGE_SCALE`); imports nothing (D-06/A7).
- `src/sim/systems/movement.ts` — sources the nudge scale from `content/`; clamps the seeded nudge (defensive, no-op in range).
- `src/sim/commands.ts` — `Command` union, `CommandQueue` (structural validation + deterministic rejection).
- `src/sim/core/events.ts` — `SimEvent` union (Phase-1 `command`/`rejected` + reserved phases) and `EventLog`.
- `src/sim/world/world.ts` — `SimState` gains `commands` + `events`.
- `src/sim/battle-sim.ts` — `submit()` intake; `step()` clear-events → drain-once → clock → apply → systems.
- `eslint.config.js` — `sim/**` boundary block (imports/globals/properties/syntax).
- `tests/sim/commands.test.ts` — 9 cases: force velocity, single-drain, post-step isolation, unknown kind, unknown entity, determinism.
- `tests/sim/clock.test.ts` — tick starts 0, `step()` +1, no wall-clock read.
- `tests/host/loop.test.ts` — floor(acc/dt) steps, sub-step accumulation, spike clamp, debt-drop, alpha ∈ [0,1).

## Decisions Made

- **`submit(readonly unknown[])`** rather than `readonly Command[]`: the trust boundary must validate runtime shapes; a `Command[]`-typed signature would make the required unknown-kind test unrepresentable.
- **Force applied before `movementSystem`** so the same tick integrates the new velocity; unknown entity targets are dropped via an ordered-id existence check (`ids().includes`) rather than the throwing `store.get()`.
- **`torque`/`weaponAbility`/`unitAbility`/`spawn`** are accepted and recorded (emit a `command` event) but inert in Phase 1 — reserved surfaces, deliberately **not** silent no-ops.
- **`MOVEMENT_NUDGE_SCALE`** relocated to `content/formulas.ts` (D-06 single source of truth) and consumed by `movementSystem` (see Deviations).
- **`Math` global is not banned** — only `Math.random` (D-02 allows `Math.sin/cos`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] `submit()` signature widened to `readonly unknown[]`**
- **Found during:** Task 2 (Command contract)
- **Issue:** The plan wrote `submit(commands: readonly Command[])`, but one required behavior is that an *unknown* `kind` submitted from outside is rejected deterministically at runtime. A `Command[]`-typed parameter forbids that input at compile time, so the trust-boundary requirement (T-01-05) would be untestable/unimplementable.
- **Fix:** Typed the intake as `readonly unknown[]` and validated with a total `validate()` function (drop-and-count on failure).
- **Files modified:** `src/sim/commands.ts`, `src/sim/battle-sim.ts`
- **Verification:** `tests/sim/commands.test.ts` unknown-kind and garbage-array cases pass.
- **Committed in:** `b863178` (Task 2 commit)

**2. [Rule 2 - Missing Critical Functionality] `movementSystem` sources its constant from `content/formulas.ts`**
- **Found during:** Task 1 (content data module)
- **Issue:** The plan places "the seeded movement nudge scale" in `content/formulas.ts` (D-06 single-source data) but did not list `src/sim/systems/movement.ts` in Task 1's files. Leaving the literal in `movement.ts` would duplicate a tunable across two files — exactly the "scattered hard-coded constants" anti-pattern CONTEXT calls out.
- **Fix:** Exported `MOVEMENT_NUDGE_SCALE` from `content/formulas.ts`; `movementSystem` imports and uses it (and passes the seeded nudge through `math.clamp` as a documented invariant).
- **Files modified:** `src/sim/systems/movement.ts`, `src/sim/content/formulas.ts`
- **Verification:** `pnpm vitest run` (25 passed) — fingerprints/behavior unchanged; `pnpm run typecheck` + `lint` green.
- **Committed in:** `f87caa8` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical functionality)
**Impact on plan:** Both were required for the plan's own success criteria (a genuinely total command intake; a single numeric source). No scope creep; no new architectural layer.

## Issues Encountered

- None. The only friction was mechanical Prettier formatting on the new files, resolved with `eslint --fix`; the `no-useless-assignment` core rule required restructuring the wall-clock test so its assertions live inside the patch window.

## Known Stubs

- `torque` / `weaponAbility` / `unitAbility` / `spawn` command kinds and the reserved `damage`/`kill`/`levelup`/`contact` events are **typed, wired, and recorded** but have no Phase-1 mechanic — they are reserved contract surfaces (fully-shaped, emitted as `command` events, not silent no-ops) that Phase 2/3 implement. This is the plan's explicit intent, not a gap; the plan's goal (a total Command pipeline) is achieved.

## Threat Flags

None — no new network/auth/file/schema surface. The added surface is the `Command` intake, hardened as a total function (T-01-05 mitigated); `Math.random`/`Date.now`/`performance.now`/`new Date()` and DOM/node/host/render imports are now lint errors inside `sim/**` (T-01-01 mitigated); the fingerprint remains a documented non-cryptographic diagnostic.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The `sim/**` boundary is now enforced by **both** halves — ESLint (`no-restricted-imports`/`-globals`/`-properties`/`-syntax`) and the DOM-free `tsconfig.sim.json`.
- Plan 01-04's determinism gate builds directly on the 01-02 `serializeState`/`fingerprint` and can now assume commands are a total, once-per-tick pipeline.
- No blockers. `pnpm run typecheck` / `lint` / `test` are all green.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `src/sim/commands.ts`, `src/sim/core/events.ts`, `src/sim/core/math.ts`, `src/sim/content/formulas.ts`
- FOUND: `tests/sim/rng.test.ts`, `tests/sim/commands.test.ts`, `tests/sim/clock.test.ts`, `tests/host/loop.test.ts`
- FOUND: commits `f87caa8`, `b863178`, `5286fcc`
