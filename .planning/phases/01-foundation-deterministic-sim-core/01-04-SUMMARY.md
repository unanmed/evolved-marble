---
phase: 01-foundation-deterministic-sim-core
plan: 04
subsystem: sim-core
tags: [determinism, fingerprint, snapshot, serialize, restore, pre-commit, gate, entity-store, anti-vacuous, sim-04]

# Dependency graph
requires: [01-03]
provides:
  - "src/sim/snapshot.ts (extended) — serializeState (canonical/ordered/quantized), deserializeState (self-describing inverse incl. exact RNG state + tick), fingerprint (separable non-crypto cyrb53), QUANT_GRID"
  - "src/sim/world/entity-store.ts (extended) — EntitySnapshot + order-preserving restore() (monotonic nextId preserved)"
  - "src/sim/core/clock.ts (extended) — TickClock.restore(tick) (snapshot-only step counter restore)"
  - "src/sim/battle-sim.ts (extended) — BattleSim.snapshot/restore round-trip"
  - "tests/helpers/run-sim.ts — runTrace({seed,ticks}) headless per-tick fingerprint trace runner"
  - "tests/determinism/gate.test.ts — the SIM-04 double-run gate (3 assertions)"
  - "tests/sim/snapshot.test.ts, tests/sim/entity-store.test.ts — serializer census + ordering guards"
  - ".githooks/pre-commit — same-machine determinism gate wired via core.hooksPath (D-09, no CI)"
affects: [physics, combat, ai, rendering, bridge, rl-reset]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff, .planning excluded).
actuals:
  tokens: 5818
  tasks: 3
  commits: 3
  plan_head_before: 996f97ebf850c8dd381946aa89eefb8939adf7e0

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical exhaustive serialization: fixed field order + orderedIds entity order + dictionary-sorted named RNG streams + floats quantized to an exported QUANT_GRID; the hash stays a separate pure function (D-03/Pitfall 3)"
    - "Self-describing snapshot: stream names are encoded in the bytes, so deserializeState(bytes) needs no external config"
    - "Mutator census: every state-affecting field, perturbed past one quantization grid, must move the fingerprint (guards the 'serializer omits state' trust failure, T-01-04)"
    - "Non-vacuous gate discipline: the per-tick trace must contain >1 distinct value (Pitfall 8)"
    - "Windows-safe hook: .gitattributes forces LF under .githooks/ so core.autocrlf=true cannot CRLF the #!/bin/sh shebang"

key-files:
  created:
    - tests/sim/snapshot.test.ts
    - tests/helpers/run-sim.ts
    - tests/determinism/gate.test.ts
    - tests/sim/entity-store.test.ts
    - .githooks/pre-commit
    - .gitattributes
  modified:
    - src/sim/snapshot.ts
    - src/sim/world/entity-store.ts
    - src/sim/core/clock.ts
    - src/sim/battle-sim.ts

key-decisions:
  - "serializeState is exhaustive (tick + all named RNG streams + all entities incl. id); command queue and event log are excluded because they are per-tick transient input/output, not future-affecting state at a quiescent point."
  - "Named RNG streams are serialized in dictionary (name-sorted) order, decoupling canonical byte order from construction order; deserialize rebuilds a RandomStreams with the decoded names then restores exact states."
  - "Fingerprint remains a non-cryptographic cyrb53 diagnostic, separable from serialization so a native/vectorized hash can swap in later without touching sim logic (D-03, V6/T-01-03)."
  - "The 'restore + re-step matches original' behavior is asserted within one quantization grid: a quantized snapshot is an approximate restart, so exact byte equality with the unquantized original is not the right invariant; two restores of the same snapshot re-step exactly."
  - "The pre-commit gate is same-machine only (D-09); no CI workflow was added, and .gitattributes pins LF for the hook so the gate cannot silently stop running on Windows (core.autocrlf=true)."

patterns-established:
  - "State = clock + seeded RNG + entities; serialize exhaustively and prove it with a round-trip test plus a mutator census."
  - "Iteration order is the orderedIds array, never Map/Set/object-key order; restore preserves it and keeps entityId monotonic."
  - "Same-machine determinism is an automated pre-commit gate (double-run per-tick fingerprint compare), not a manual check and not CI."

requirements-completed: [SIM-04, SIM-02]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Canonical, exhaustive state serialization + lossless-equivalent restore, with a separable non-cryptographic fingerprint; serializer omits nothing."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts (14 passed) — fingerprint round-trip identity, byte-identical restore, order stability, bad-magic guard, mutator census (x/y/vx/vy/hp/level/tick/RNG), deterministic restart point, re-step within one grid"
        status: pass
    human_judgment: false
  - id: D2
    description: "Automated same-machine determinism gate: same seed → identical per-tick trace; different seed → different; trace is non-constant (non-vacuous)."
    requirement: "SIM-04"
    verification:
      - kind: integration
        ref: "tests/determinism/gate.test.ts (3 passed) via `pnpm gate` (vitest run tests/determinism)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Entity iteration order is stable under spawn/despawn churn and entityId stays monotonic (no Map delete+re-add reorder)."
    requirement: "SIM-02"
    verification:
      - kind: unit
        ref: "tests/sim/entity-store.test.ts (4 passed) — monotonic ids, spawn-order ids(), despawn+spawn preserves survivor order, unknown-id no-op"
        status: pass
    human_judgment: false
  - id: D4
    description: "The determinism gate is wired as a pre-commit hook (core.hooksPath == .githooks) that refuses commits on failure; no CI added."
    requirement: "SIM-04"
    verification:
      - kind: other
        ref: "git config --get core.hooksPath == '.githooks'; .githooks/pre-commit staged 100755; hook executed and passed during the Task 3 commit (7ec52bb)"
        status: pass
    human_judgment: false
  - id: D5
    description: ".gitignore still ignores coverage/ and documents the D-10/D-11 external-output rule; no GitHub Actions workflow was added."
    requirement: "SIM-04"
    verification:
      - kind: other
        ref: ".gitignore lines 32-39 (coverage + D-10/D-11 note); no .github/workflows present"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 04: Canonical Snapshot/Fingerprint & Double-Run Determinism Gate Summary

**Canonical exhaustive serialize/restore with a separable cyrb53 fingerprint, a non-vacuous double-run determinism gate, and a same-machine pre-commit hook (D-09) — with entity iteration order proven stable under spawn/despawn churn.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-15T11:20:58Z
- **Completed:** 2026-10-15T11:27:35Z
- **Tasks:** 3 (all `type="auto"`; no checkpoints)
- **Files modified:** 10 code/test/config files + this SUMMARY

## Accomplishments

- **Task 1** — hardened `src/sim/snapshot.ts` into a canonical exhaustive codec: `serializeState` (fixed field order, entities in `EntityStore.ids()` order, dictionary-sorted named RNG streams, floats quantized to the exported `QUANT_GRID` = 1/256), `deserializeState` (self-describing inverse — reconstructs tick, exact RNG state, and entities), and `fingerprint` (unchanged pure non-cryptographic cyrb53, documented as a diagnostic). Extended `EntityStore` with `EntitySnapshot`/`restore()` (order-preserving, monotonic `nextId`) and `TickClock` with `restore(tick)`; added `BattleSim.restore`. Shipped `tests/sim/snapshot.test.ts` (14 cases): round-trip fingerprint identity, byte-identical restore, order stability, bad-magic guard, and a **mutator census** proving every tracked field (x/y/vx/vy/hp/level/tick/RNG) moves the fingerprint.
- **Task 2** — added `tests/helpers/run-sim.ts` (`runTrace({seed,ticks})`, a headless per-tick fingerprint trace runner over `runLoop` + `headlessPump`), `tests/determinism/gate.test.ts` (the SIM-04 gate: same-seed identical trace, different-seed differs, non-constant trace), and `tests/sim/entity-store.test.ts` (monotonic ids, spawn-order `ids()`, despawn+spawn preserving survivor order).
- **Task 3** — created `.githooks/pre-commit` (runs `pnpm run lint` + `pnpm vitest run tests/determinism --reporter=dot`, prints "Determinism gate failed — refusing to commit." and exits non-zero), staged it executable (100755), wired `git config core.hooksPath .githooks`, and added `.gitattributes` (`/.githooks/* text eol=lf`). Confirmed `.gitignore` already ignores `coverage/` and records the D-10/D-11 external-output rule; **no CI workflow was added**.
- The gate is **non-vacuous**: `runTrace` yields `>1` distinct fingerprint over 200 ticks; the empty-world tick census and the perturbed-RNG-stream census each move the fingerprint, so the serializer provably omits nothing. The Task 3 commit itself was gated by the new hook, which ran and passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonical exhaustive snapshot/restore + separable fingerprint** - `6b1cc74` (feat)
2. **Task 2: Double-run determinism gate + entity-ordering guards** - `8312a59` (test)
3. **Task 3: Wire same-machine determinism pre-commit gate** - `7ec52bb` (chore)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## Files Created/Modified

- `src/sim/snapshot.ts` — `QUANT_GRID`, `serializeState`, `deserializeState`, `fingerprint` (rewritten; hash kept separable).
- `src/sim/world/entity-store.ts` — `EntitySnapshot` + order-preserving `restore()`.
- `src/sim/core/clock.ts` — `TickClock.restore(tick)` (snapshot-only).
- `src/sim/battle-sim.ts` — `snapshot()`/`restore(bytes)` round-trip.
- `tests/sim/snapshot.test.ts` — 14 serializer/restore/fingerprint cases + mutator census.
- `tests/helpers/run-sim.ts` — `runTrace` headless trace runner.
- `tests/determinism/gate.test.ts` — the SIM-04 gate.
- `tests/sim/entity-store.test.ts` — D-04/D-05 ordering guards.
- `.githooks/pre-commit` — D-09 gate script (POSIX sh).
- `.gitattributes` — forces LF under `.githooks/`.

## Decisions Made

- **Serialization scope = clock + seeded RNG + entities.** The command queue and event log are per-tick transient input/output (commands drain to empty at `step()` top; events clear each tick), so they are not future-affecting state at a quiescent point and are intentionally excluded. Documented in `snapshot.ts`.
- **Dictionary-sorted RNG stream order.** Streams serialize in name-sorted order so canonical bytes do not depend on `RandomStreams` construction order; `deserializeState` rebuilds the facade from the decoded names and restores exact (non-quantized) integer states.
- **The round-trip invariant is byte/fingerprint identity, not unquantized equality.** A quantized snapshot is an approximate restart; the "restore + re-step matches the original" behavior is asserted within one quantization grid, while two restores of the same snapshot re-step **exactly**.
- **Gate is same-machine only (D-09), no CI.** `.gitattributes` pins LF for the hook because `core.autocrlf=true` (confirmed on this machine) would otherwise CRLF the shebang and silently disable the gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `TickClock` needed a snapshot-only `restore(tick)` setter**
- **Found during:** Task 1 (serialize/restore)
- **Issue:** `deserializeState` must reconstruct the tick counter, but `TickClock._tick` is private with `step()` as the only mutator. Without a setter, restore is impossible (stepping `tick` times is O(tick) and wrong).
- **Fix:** Added `TickClock.restore(tick: number)` — semantics "set the clock back to a tick", documented as serialize-only, the sole non-`step()` mutation path.
- **Files modified:** `src/sim/core/clock.ts`
- **Verification:** `tests/sim/snapshot.test.ts` round-trip + deterministic-restart cases pass; `pnpm run typecheck` (DOM-free `tsconfig.sim.json`) green.
- **Committed in:** `6b1cc74` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `.gitattributes` to keep the hook LF on Windows**
- **Found during:** Task 3 (hook wiring)
- **Issue:** `core.autocrlf=true` on this machine normalizes checked-out files to CRLF; a CRLF `#!/bin/sh` shebang breaks execution, silently disabling the D-09 gate after any fresh checkout — the exact Windows caveat RESEARCH A5 flags.
- **Fix:** Added `.gitattributes` with `/.githooks/* text eol=lf`.
- **Files modified:** `.gitattributes` (new)
- **Verification:** hook file is CR-free (LF); `git ls-files -s .githooks/pre-commit` = mode `100755`; hook executed and passed during the Task 3 commit.
- **Committed in:** `7ec52bb` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both are required to make the plan's own goal real — a round-trippable snapshot and a gate that reliably runs on this platform. No scope creep; no new architectural layer, no new dependency, no CI.

## Issues Encountered

- Prettier flagged formatting in the Task 1 test file; resolved with `eslint --fix` (mechanical only). No behavioral changes.

## Known Stubs

- None. The Phase-1 `movementSystem` stand-in (from 01-02/01-03) remains the deliberately-tiny state mutator; it is fully wired and functional, not a stub. The reserved command/event surfaces noted in 01-03 are unchanged by this plan.

## Threat Flags

None — no new network/auth/file/schema surface. T-01-04 (serializer omits state → two divergent worlds report equal) is mitigated by exhaustive canonical serialization + `restore` round-trip + the mutator census. The fingerprint stays documented as a non-cryptographic diagnostic (T-01-03, V6). Snapshots never leave the process this phase (no untrusted-load surface).

## User Setup Required

None — the hook path is set locally (`git config core.hooksPath .githooks`, per clone) and is committed as an executable script. No external service configuration required.

## Next Phase Readiness

- The gate is now an automated pre-commit control: a divergence or a removed system fails `pnpm gate` and refuses the commit.
- Phase 2 (Rapier physics) attaches to a proven, round-trippable snapshot boundary; when physics state grows, the separable `fingerprint()` can be swapped for a native/vectorized hash without touching sim logic (D-03/Pitfall 3).
- No blockers. `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (46 tests) and `pnpm gate` are all green; `core.hooksPath` is `.githooks`; no CI workflow exists.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `src/sim/snapshot.ts`, `src/sim/world/entity-store.ts`, `src/sim/core/clock.ts`, `src/sim/battle-sim.ts`
- FOUND: `tests/sim/snapshot.test.ts`, `tests/helpers/run-sim.ts`, `tests/determinism/gate.test.ts`, `tests/sim/entity-store.test.ts`
- FOUND: `.githooks/pre-commit`, `.gitattributes`
- FOUND: commits `6b1cc74`, `8312a59`, `7ec52bb`
