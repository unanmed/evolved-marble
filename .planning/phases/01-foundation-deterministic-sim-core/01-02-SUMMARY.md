---
phase: 01-foundation-deterministic-sim-core
plan: 02
subsystem: sim-core
tags: [determinism, fixed-timestep, seeded-rng, headless, fingerprint, tracer, entity-store, accumulator]

# Dependency graph
requires: [01-01]
provides:
  - "TickClock — monotonic tick counter; step() is the only time advance (SIM-01)"
  - "RandomStreams — sfc32 seeded streams behind a JSON-serializable facade (SIM-02 substrate)"
  - "EntityStore — composition-first object model with a stable orderedIds iteration contract (D-04/D-05)"
  - "SimState aggregate composed explicitly and injected (no module-level singleton)"
  - "movementSystem — the Phase-1 only per-tick state mutator (non-vacuous gate fixture, A1)"
  - "serializeState + fingerprint — canonical, ordered, 1/256-quantized bytes + non-crypto hash (SIM-04 substrate)"
  - "BattleSim facade — the single public sim surface (reset/step/snapshot/fingerprint/state) Phase 2/4/6 attach to"
  - "runLoop accumulator + headlessPump/fixedFpsPump (DOM-free host pacing)"
affects: [01-03, 01-04, physics, combat, ai, rendering, bridge]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff).
actuals:
  tokens: 3610
  tasks: 1
  commits: 1
  plan_head_before: 67411c5d9653f89f21da4e9db63f2ddbd48ac7c8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed-step accumulator loop with swappable pumps (Gaffer 'Fix Your Timestep') — sim sees only step()"
    - "One master seed → named, decorrelated sfc32 streams via an xmur3 mixer over (seed, name)"
    - "Composition-first entity object + separate orderedIds array (never iterate Map/Set order)"
    - "Canonical serialize (ordered + 1/256 quantized) split from a non-crypto fingerprint hash"
    - "DOM-free host pacing (runLoop/pump) importable by Vitest node env"

key-files:
  created:
    - src/sim/core/clock.ts
    - src/sim/core/rng.ts
    - src/sim/world/entity-store.ts
    - src/sim/world/world.ts
    - src/sim/systems/movement.ts
    - src/sim/snapshot.ts
    - src/sim/battle-sim.ts
    - src/host/loop.ts
    - src/host/pump.ts
    - tests/sim/headless.test.ts
  modified:
    - tsconfig.json

key-decisions:
  - "A minimal but genuinely state-mutating movementSystem is a labelled Phase-1 stand-in (A1) so the SIM-04 fingerprint gate is non-vacuous."
  - "movementSystem nudge scale is 0.05, not the draft's 0.001 — 0.001 is below the 1/256 fingerprint quantization grid and would make the gate vacuous (see Deviations)."
  - "Fingerprint = cyrb53 variant over canonical bytes; documented as a non-cryptographic diagnostic, never a security token (T-01-03 accept)."
  - "Base tsconfig rootDir widened from `src` to `.` so `tests/` is under rootDir under TS7 (tsconfig.sim.json still narrows to `src`)."

coverage:
  - id: D1
    description: "Stepping the sim advances state by a fixed step count, never by wall-clock; time is a monotonic tick counter."
    requirement: "SIM-01"
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/sim/headless.test.ts (3 passed) — runLoop advances whole FIXED_DT steps driven by headlessPump"
        status: pass
    human_judgment: false
  - id: D2
    description: "The full sim runs headless in Node with no window/document/requestAnimationFrame and no clock read."
    requirement: "SIM-03"
    verification:
      - kind: typecheck
        ref: "pnpm run typecheck (tsconfig.sim.json DOM-free project) — src/sim/** type-checks with lib:['ESNext'], types:[]"
        status: pass
      - kind: unit
        ref: "pnpm vitest run tests/sim/headless.test.ts — full path runs in Vitest environment: node"
        status: pass
    human_judgment: false
  - id: D3
    description: "Running the headless path from a fixed seed produces state that changes tick-over-tick (non-vacuous fixture, A1) and is reproducible for a fixed seed while diverging across seeds."
    requirement: "SIM-03"
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/sim/headless.test.ts — set(trace).size > 1; same seed → identical trace; different seed → different fingerprint"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 02: Headless Fixed-Step Seeded Sim Tracer Summary

**A runnable Node/Vitest headless simulation that seeds a PRNG, advances a fixed-timestep tick clock via a Gaffer accumulator, mutates composition-first entity state through a minimal seeded system, and emits a canonical state fingerprint — proving the layer split and the reproducibility contract end-to-end on the thinnest possible path.**

## Performance

- **Duration:** ~6 min execution
- **Started:** 2026-10-15 (after `67411c5` docs(01-01): record tsconfig baseUrl deviation)
- **Completed:** 2026-10-15
- **Tasks:** 1 (single `type="tracer"` task — 10 files across 5 layers)
- **Files modified:** 11 (10 new + `tsconfig.json`)

## Accomplishments

- Wired ONE path through every layer the phase touches: seed → seeded RNG → fixed-step `TickClock` → composition-first `EntityStore` → minimal seeded `movementSystem` → canonical snapshot/fingerprint → host accumulator loop → headless run.
- `TickClock` (`src/sim/core/clock.ts`): monotonic `_tick` counter; `step()` is the only way time advances; no wall-clock read.
- `RandomStreams` (`src/sim/core/rng.ts`): hand-rolled ~15-line `sfc32` behind an `RngStream` interface (`next`/`getState`/`setState`, JSON-serializable numbers); `mixSeed(seed, name)` derives streams via an xmur3 mixer over `(seed, name)` — never naive `seed + index`; `save()`/`restore()` enumerate the named stream set.
- `EntityStore` (`src/sim/world/entity-store.ts`): monotonic `entityId` from 1, a `private orderedIds: EntityId[]` (the iteration contract), and a `Map` used **only** as a lookup index; `spawn`/`despawn`/`get`/`ids`.
- `SimState` (`src/sim/world/world.ts`): `{ store, clock, rng }` composed explicitly and passed into systems — no module-level singleton.
- `movementSystem` (`src/sim/systems/movement.ts`): iterates the ordered id array, applies a seeded `'ai'`-stream nudge to `vx`, integrates `x`/`y` — labelled a Phase-1 stand-in (A1) and the only source of per-tick change.
- `serializeState`/`fingerprint` (`src/sim/snapshot.ts`): canonical fixed field order, entities in `orderedIds` order, floats quantized to a 1/256 grid, written little-endian; hash separated from serialization (cyrb53 variant), documented as a diagnostic — not a security token.
- `BattleSim` (`src/sim/battle-sim.ts`): explicit facade exposing `reset`/`step`/`snapshot`/`fingerprint`/`state` (+ `spawn` convenience); constructed with `(seed, cfg?)`.
- `runLoop` (`src/host/loop.ts`) + `headlessPump`/`fixedFpsPump` (`src/host/pump.ts`): DOM-free Gaffer accumulator with spiral-of-death clamp and step cap.
- `tests/sim/headless.test.ts`: drives the full path through `runLoop`+`headlessPump`, proving (a) state evolves tick-over-tick, (b) same seed → identical per-tick trace, (c) different seed → different fingerprint.

## Task Commits

1. **Task 1: End-to-end "seed → fixed-step → seeded mutate → fingerprint" headless slice** - `169881b` (feat)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## Files Created/Modified

- `src/sim/core/clock.ts` — `TickClock` (fixed `dt`, monotonic tick counter, single `step()`).
- `src/sim/core/rng.ts` — `RngState`, `RngStream`, `mixSeed`, `makeSfc32`, `RandomStreams`.
- `src/sim/world/entity-store.ts` — `EntityId`, `UnitComponents`, `EntityStore`.
- `src/sim/world/world.ts` — `SimState` aggregate.
- `src/sim/systems/movement.ts` — `movementSystem` (Phase-1 stand-in).
- `src/sim/snapshot.ts` — `serializeState`, `fingerprint`.
- `src/sim/battle-sim.ts` — `BattleSim`, `BattleSimConfig`.
- `src/host/loop.ts` — `runLoop`, `StepTarget`, `RunLoopConfig`.
- `src/host/pump.ts` — `headlessPump`, `fixedFpsPump`.
- `tests/sim/headless.test.ts` — Vitest headless determinism fixture.
- `tsconfig.json` — widened base `rootDir` to `.` (blocking fix — see Deviations).

## Decisions Made

- **Non-vacuous fixture (A1):** a minimal but real seeded `movementSystem` is shipped so the fingerprint gate discriminates state changes; it is explicitly labelled a Phase-1 stand-in that Phase 2 replaces with real physics.
- **Fingerprint is diagnostic, not auth:** `fingerprint()` hashes canonical, quantized bytes with a cyrb53 variant; the module header states it must never be used as a security token (threat T-01-03 disposition=accept).
- **1/256 quantization grid** kept as documented (research A3); the movement mechanics were tuned to it rather than loosening the grid.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] movementSystem nudge scale raised 0.001 → 0.05 so the gate is non-vacuous**
- **Found during:** Task 1 (implementation + the plan's own `<fails_when>` analysis)
- **Issue:** The plan's draft used `nudge * 0.001`. Snapshots quantize floats to a 1/256 (≈0.0039) grid, so a per-tick `vx` change of ≤0.0005 quantizes to 0 and the fingerprint stays constant across ticks — a **vacuous** determinism gate. The plan itself lists "the per-tick fingerprint set has size 1 (vacuous gate)" as a failure condition, so non-vacuity takes precedence over the draft constant.
- **Fix:** Set `NUDGE_SCALE = 0.05` (named constant, commented) so one tick's nudge reliably crosses the quantization grid; the consequential `movementSystem` remains deliberately tiny and is still the only per-tick mutator.
- **Files modified:** `src/sim/systems/movement.ts`
- **Verification:** `pnpm vitest run tests/sim/headless.test.ts` — the non-vacuous assertion (`new Set(trace).size > 1`) passes.
- **Committed in:** `169881b` (Task 1 commit)

**2. [Rule 3 - Blocking] Base `tsconfig.json` rootDir widened (`src` → `.`)**
- **Found during:** Task 1 (`pnpm run typecheck`)
- **Issue:** The base project sets `rootDir: "src"` but `include: ["src", "tests"]`. This was latent in Plan 01-01 because `tests/` was empty; adding `tests/sim/headless.test.ts` triggered TS6059 ("File is not under rootDir") under TS7.
- **Fix:** Set base `rootDir` to `.` (harmless — the project is `noEmit`); `tsconfig.sim.json` still narrows `rootDir` to `src` for the DOM-free project.
- **Files modified:** `tsconfig.json`
- **Verification:** `pnpm run typecheck` passes for both projects.
- **Committed in:** `169881b` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were required for the plan's own success criteria (non-vacuous gate; type-check). No scope creep; the tracer stayed one file per layer.

## Issues Encountered

- None beyond the two auto-fixed deviations above. Type-check, lint, and the headless test are all green.

## Known Stubs

- `movementSystem` (`src/sim/systems/movement.ts`) is an intentional Phase-1 stand-in (research A1) — a functional mutator, not a non-functional stub. It is the fixture that keeps the SIM-04 gate non-vacuous and will be replaced by real physics in Phase 2. No data-source gaps; the plan's goal (prove determinism end-to-end) is achieved.

## Threat Flags

None — no new network/auth/file/schema surface. `sim/**` stays DOM-free and clock-free (enforced by `tsconfig.sim.json`); all randomness flows through the seeded `RandomStreams` facade (T-01-01 mitigated); the fingerprint is documented non-cryptographic (T-01-03 accepted).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The `sim/**` deterministic boundary is now proven in practice: no DOM/clock imports, ordered iteration, seeded randomness, canonical fingerprint.
- Plan 01-03 can add the hard ESLint boundary rules (Example 2) and the `tests/sim/*` + `tests/determinism/*` unit/gate tests on top of this tracer.
- Plan 01-04's determinism gate builds directly on `serializeState` → `fingerprint` (the plan's `key_links`).
- No blockers. `pnpm run typecheck` / `lint` / `test` are all green.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `.planning/phases/01-foundation-deterministic-sim-core/01-02-SUMMARY.md`
- FOUND: `src/sim/core/clock.ts`, `src/sim/core/rng.ts`, `src/sim/world/entity-store.ts`, `src/sim/world/world.ts`, `src/sim/systems/movement.ts`, `src/sim/snapshot.ts`, `src/sim/battle-sim.ts`, `src/host/loop.ts`, `src/host/pump.ts`, `tests/sim/headless.test.ts`
- FOUND: commit `169881b`
