---
phase: 01-foundation-deterministic-sim-core
plan: 05
subsystem: sim-core
tags: [determinism, snapshot, serialize, restore, entity-store, next-id, id-cursor, cr-01, sim-04, sim-02, wr-02, wr-03, gap-closure, exhaustiveness, int32]

# Dependency graph
requires: [01-04]
provides:
  - "src/sim/world/entity-store.ts (extended) — get nextId() accessor + restore(entries, nextId?) that adopts the serialized cursor (D-05, CR-01)"
  - "src/sim/snapshot.ts (extended) — VERSION bumped 1→2; the entity-id cursor is written after entityCount (uint32) and read back into restore; INT32_MAX range guard in quantize() (WR-03)"
  - "src/sim/battle-sim.ts (extended) — compile-time exhaustiveness default in applyCommands() (WR-02)"
  - "tests/sim/snapshot.test.ts (extended) — dead-id-reuse regression, id-cursor census case, churn reproducibility, int32 overflow throw"
affects: [physics, combat, rl-reset, bridge, snapshot-format, review-remediation]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff, .planning excluded).
actuals:
  tokens: 1481
  tasks: 3
  commits: 4
  plan_head_before: 988e7104f3ffb23cc85dc3125378e6baca8528c9

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Future-affecting cursor serialization: the entity-id cursor (EntityStore.nextId) is part of canonical state, written after entityCount; restore adopts it so ids are never reused across a snapshot round-trip (D-05)."
    - "Deterministic failure over silent coercion: quantize() throws on out-of-int32 values instead of letting DataView.setInt32 wrap (ToInt32 mod 2^32) with no signal."
    - "Compile-time exhaustiveness: a never-typed default branch turns a newly added, unhandled Command variant into a typecheck error rather than a silent no-op."

key-files:
  created: []
  modified:
    - src/sim/world/entity-store.ts
    - src/sim/snapshot.ts
    - src/sim/battle-sim.ts
    - tests/sim/snapshot.test.ts

key-decisions:
  - "The snapshot VERSION is bumped 1 → 2 because the canonical byte layout gains an id-cursor field; the version guard already throws 'unsupported version' and no v1 migration path was added (no snapshot is persisted this phase)."
  - "EntityStore.restore(entries, nextId?) adopts the caller-supplied cursor when present and falls back to max(id)+1 only when omitted, so legacy callers keep monotonic ids while the serializer path is exact."
  - "The private cursor field was renamed from nextId to nextEntityId so the public get nextId() accessor cannot recurse into itself; the name keeps no underscore prefix (D-15)."
  - "quantize() throws a deterministic Error naming the offending value rather than clamping — a silent clamp would hide divergence; the in-range path stays byte-identical (grid/rounding/endianness unchanged)."
  - "The applyCommands guard references a used never-typed local (not an underscore-prefixed throwaway) to satisfy no-unused-vars without violating D-15."

patterns-established:
  - "A snapshot is a complete restart point only if every future-affecting counter (ids, tick, RNG) is serialized; prove it with a churn regression, not just a round-trip of the live set."
  - "The anti-vacuous mutator census must include the id cursor — states with identical live entities but different nextId must fingerprint differently."
  - "Perfect command intake includes a compile-time exhaustiveness guard so the union and its apply switch cannot drift."

requirements-completed: [SIM-04, SIM-02]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "The serializer is exhaustive with respect to the entity-id cursor: after despawn(max) → snapshot → restore → spawn, the restored sim assigns the same, never-before-used id as the original."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#entity-id cursor survives a snapshot round-trip (CR-01, D-05) > does not reuse a dead id after despawn(max) → snapshot → restore → spawn"
        status: pass
    human_judgment: false
  - id: D2
    description: "The anti-vacuous mutator census includes the id cursor: two stores with identical live entities but differing nextId serialize to different fingerprints."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#mutator census > a differing id cursor (identical live entities) moves the fingerprint"
        status: pass
    human_judgment: false
  - id: D3
    description: "A despawn→snapshot→restore→despawn→spawn churn sequence reproduces identically across two runs (id cursor survives churn)."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#entity-id cursor survives a snapshot round-trip (CR-01, D-05) > a despawn→snapshot→restore→despawn→spawn churn reproduces identically"
        status: pass
    human_judgment: false
  - id: D4
    description: "quantize() rejects a value outside the signed-int32 range with a deterministic error instead of letting DataView.setInt32 silently wrap (WR-03); in-range bytes are unchanged."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#quantize int32 range guard (WR-03) (2 tests: overflow throws; in-range bytes identical)"
        status: pass
    human_judgment: false
  - id: D5
    description: "applyCommands() has a compile-time exhaustiveness guard: adding a Command variant without handling it fails pnpm run typecheck rather than silently no-op'ing (WR-02)."
    requirement: "SIM-02"
    verification:
      - kind: other
        ref: "pnpm run typecheck — probe: adding a 6th Command variant produced `battle-sim.ts(135,27): error TS2322 ... not assignable to type 'never'`; reverted. commands.test.ts (9) green."
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 05: Serialize the Entity-Id Cursor + Two Latent-Hazard Guards Summary

**The snapshot now serializes and restores the entity-id cursor (no dead-id reuse across a round-trip), with a deterministically-guarded quantizer and a compile-time-exhaustive command apply switch — closing CR-01 and the phase's serializer-completeness gaps.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-15T13:12:10Z
- **Completed:** 2026-10-15T13:24:26Z
- **Tasks:** 3 (Task 1 tracer TDD; Tasks 2–3 auto; no checkpoints)
- **Files modified:** 4 code/test files + this SUMMARY

## Accomplishments

- **Task 1 (TDD: RED → GREEN)** — made the snapshot exhaustive with respect to the id cursor. `EntityStore` gains a `get nextId()` accessor and `restore(entries, nextId?)` (adopts the serialized cursor; `?? max(id)+1` fallback for legacy callers). `snapshot.ts` bumps `VERSION` 1 → 2, writes the cursor as a uint32 immediately after `entityCount` (with the `+4` size accounting), and `deserializeState` reads it back into `store.restore(entries, nextId)`. Added a `spawn×2 → despawn(max) → snapshot → restore → spawn` regression (proves both sims assign the same, never-before-used id — was `2 vs 3` before the fix), an id-cursor mutator-census case, and a churn-reproducibility guard.
- **Task 2 (WR-03)** — `quantize()` now throws a deterministic Error naming the offending value when `Math.round(v * QUANT_GRID)` leaves the signed-int32 range, instead of letting `DataView.setInt32` silently apply ToInt32 (mod 2³²). Added `INT32_MAX`, documented the guard, and kept the in-range path byte-identical.
- **Task 3 (WR-02)** — added a `default` branch to `applyCommands`'s `switch (cmd.kind)` that assigns the narrowed `cmd` to a `never`-typed local and throws naming the unhandled kind. Adding a 6th `Command` variant without handling it is now a **compile error** (probe-verified), not a silent no-op.
- **Full suite green:** `pnpm run typecheck` (both projects) exit 0; `pnpm test` 51 passed (was 46, +5); `pnpm gate` 3 passed; `pnpm run lint` exit 0.

## Task Commits

Each task was committed atomically (Task 1 is a TDD tracer: RED then GREEN):

1. **Task 1 RED: failing id-cursor regression + census case** - `02f92e9` (test)
2. **Task 1 GREEN: serialize the entity-id cursor end-to-end (CR-01)** - `7614256` (feat)
3. **Task 2: deterministic int32 range guard in quantize() (WR-03)** - `cd320ef` (fix)
4. **Task 3: compile-time exhaustiveness guard in applyCommands() (WR-02)** - `75e1e99` (fix)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## TDD Gate Compliance

Task 1 (`type="tracer" tdd="true"`) followed RED → GREEN:

- **RED** (`02f92e9`, `test(01-05): ...`): the two new tests failed intentionally on the planned behavior — `AssertionError: expected 2 to be 3` (dead id reused on the restored sim) and `expected '695740ed1087c' not to be '695740ed1087c'` (cursor omitted from the fingerprint). This matches the 01-VERIFICATION.md probe exactly (original next id 3, restored 2).
- **GREEN** (`7614256`, `feat(01-05): ...`): implementation made both target tests pass; snapshot test file went 14 → 17 passing.
- **REFACTOR:** none needed.

`workflow.tdd_mode` is disabled in this project's config, so the machine-enforced RED-evidence gate did not run; the discipline was followed manually and the RED failure is captured above.

## Files Created/Modified

- `src/sim/world/entity-store.ts` — `get nextId()` accessor; `restore(entries, nextId?)`; private cursor field renamed `nextId` → `nextEntityId` (avoids accessor self-recursion, keeps D-15 no-underscore rule).
- `src/sim/snapshot.ts` — `VERSION = 2`; `nextId` written after `entityCount`; `+4` byte-size accounting; cursor read and passed to `restore`; `INT32_MAX` + range guard in `quantize()`.
- `src/sim/battle-sim.ts` — `default` exhaustiveness branch with a used `never`-typed local in `applyCommands()`.
- `tests/sim/snapshot.test.ts` — dead-id-reuse regression, id-cursor census case, churn reproducibility, int32 overflow throw, in-range bytes unchanged (14 → 19 cases).

## Decisions Made

- **The snapshot VERSION is bumped 1 → 2** because the canonical byte layout gains the cursor field; the existing version guard throws `unsupported version` and **no v1 migration path** was added (snapshots never leave the process this phase).
- **`restore(entries, nextId?)` adopts the caller cursor when supplied**, falling back to `max(id)+1` only when omitted — the serializer path is exact while any legacy caller keeps monotonic ids.
- **`quantize()` throws rather than clamps** — a silent clamp would mask divergence; the error names the offending value and the in-range bytes are unchanged.
- **The guard uses a used, non-underscore local** to satisfy `no-unused-vars` without violating D-15.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed the private id-cursor field to prevent accessor self-recursion**
- **Found during:** Task 1 (GREEN)
- **Issue:** The plan specified adding `get nextId(): number` "returning the private `nextId` field". A class cannot have both a private field `nextId` and a getter `nextId` without the getter body `return this.nextId` recursing into itself.
- **Fix:** Renamed the private field to `nextEntityId` (getter `nextId` delegates to it; `spawn`/`restore` updated). Keeps the plan-mandated public `get nextId()` contract and the D-15 no-underscore rule.
- **Files modified:** `src/sim/world/entity-store.ts`
- **Verification:** `pnpm run typecheck` exit 0; id-cursor regression + census tests pass.
- **Committed in:** `7614256` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** A mechanical necessity to satisfy the plan's own public-API contract; no scope change, no new behavior beyond the plan.

## Issues Encountered

- The task notes list `pnpm run build` among the checks to keep green, but `package.json` defines **no `build` script** (Phase 1 removed the TS/Vue predecessor entry point, so there is nothing to bundle yet). This is pre-existing and out of scope; the plan's `<verification>` section does not require a build. `pnpm run typecheck`, `pnpm test`, `pnpm gate`, and `pnpm run lint` are all green.

## Known Stubs

- None introduced. The Phase-1 `movementSystem` stand-in (from 01-02/01-03) is unchanged; the reserved command/event surfaces it feeds are unchanged by this plan.

## Threat Flags

None — no new network/auth/file/schema surface. **T-01-04** (serializer omits state → two divergent worlds report equal) is now genuinely mitigated: the id cursor is part of canonical bytes, the mutator census covers it, and the despawn→restore→spawn regression proves no dead id is reused. **T-01-05** (silently dropped command variant) is mitigated by the compile-time exhaustiveness guard. The int32 guard is an integrity/robustness fix, not an authentication mechanism (T-01-03 remains a non-cryptographic diagnostic, disposition=accept).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The snapshot is now a complete restart point with respect to the entity-id cursor; Phase 2's kill/respawn path attaches to a serializer that provably omits no counter state.
- The command apply switch is drift-proof: the growing Phase 2/4 command surface cannot compile an unhandled variant.
- Closes 01-VERIFICATION.md GAPS 1–3 (single root cause: `nextId` omitted) and the REVIEW warnings WR-02/WR-03. Remaining review items (WR-01, WR-04, WR-05, IN-01..08) and the D-12..D-16 style retrofit are planned separately (01-06..01-12).
- No blockers. `pnpm run typecheck` (both projects), `pnpm test` (51), `pnpm gate` (3), and `pnpm run lint` are all green.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `src/sim/world/entity-store.ts`, `src/sim/snapshot.ts`, `src/sim/battle-sim.ts`, `tests/sim/snapshot.test.ts`
- FOUND: `nextId` serialized in `src/sim/snapshot.ts` (write L120, read L189); `store.restore(entries, nextId)` at L214
- FOUND: commits `02f92e9`, `7614256`, `cd320ef`, `75e1e99`
