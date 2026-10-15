---
phase: 01-foundation-deterministic-sim-core
verified: 2026-10-15T11:42:02.983Z
status: gaps_found
score: 12/15 must-haves verified
covered_files:
  - .gitattributes
  - .githooks/pre-commit
  - .gitignore
  - .planning/REQUIREMENTS.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-01-PLAN.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-01-SUMMARY.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-02-PLAN.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-02-SUMMARY.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-03-PLAN.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-03-SUMMARY.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-04-PLAN.md
  - .planning/phases/01-foundation-deterministic-sim-core/01-04-SUMMARY.md
  - eslint.config.js
  - package.json
  - src/config/sim.ts
  - src/host/loop.ts
  - src/host/pump.ts
  - src/sim/battle-sim.ts
  - src/sim/commands.ts
  - src/sim/content/formulas.ts
  - src/sim/core/clock.ts
  - src/sim/core/events.ts
  - src/sim/core/math.ts
  - src/sim/core/rng.ts
  - src/sim/snapshot.ts
  - src/sim/systems/movement.ts
  - src/sim/world/entity-store.ts
  - src/sim/world/world.ts
  - tests/determinism/gate.test.ts
  - tests/helpers/run-sim.ts
  - tests/host/loop.test.ts
  - tests/sim/clock.test.ts
  - tests/sim/commands.test.ts
  - tests/sim/entity-store.test.ts
  - tests/sim/headless.test.ts
  - tests/sim/rng.test.ts
  - tests/sim/snapshot.test.ts
  - tsconfig.json
  - tsconfig.sim.json
  - vite.config.ts
  - vitest.config.ts
covered_digest: "v1:sha256:08fa5ef5881cb20f9825da27fd8f46e65b64b922acf3ec2c34823500152089c9"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "fingerprint(restore(serialize(state))) equals fingerprint(serialize(state)) — the serializer omits nothing (SIM-04 correctness)"
    status: failed
    reason: "serializeState() omits EntityStore.nextId (the id cursor) and EntityStore.restore() reconstructs it as max(live id)+1. When the highest-id entity was despawned before the snapshot, the restored store's next id diverges from the original and reuses a dead id — yet both states serialize to the identical fingerprint. Independently reproduced with a throwaway probe: original next id = 3, restored next id = 2, both fingerprints 695740ed1087c. The 'serializer omits nothing' claim is false; threat T-01-04 ('serializer omits state') is not actually mitigated."
    artifacts:
      - path: "src/sim/snapshot.ts"
        issue: "serializeState writes tick + RNG streams + entityCount/entities only — no id cursor; deserializeState calls store.restore(entries) with no nextId"
      - path: "src/sim/world/entity-store.ts"
        issue: "restore() sets nextId = maxId + 1, discarding the store's true monotonic cursor"
    missing:
      - "Expose EntityStore.nextId and serialize it (after entityCount); thread it into restore(entries, nextId); bump the snapshot VERSION"
      - "Add a regression test: spawn×2 → despawn(max) → snapshot → restore → spawn yields the same id on both sims"
  - truth: "The fingerprint actually tracks state — it is not constant across ticks and every state mutator moves it (SIM-04 / anti-vacuous)"
    status: failed
    reason: "The mutator census proves xform.x/y/vx/vy, hp, level, tick and RNG state move the fingerprint, but the id cursor (nextId) is an unaccounted state mutator. A probe showed two stores with different nextId (2 vs 3) over identical live entities serialize to the identical fingerprint, so the anti-vacuous census is incomplete and the fingerprint is not a total state discriminator."
    artifacts:
      - path: "tests/sim/snapshot.test.ts"
        issue: "mutator census enumerates 6 entity fields + tick + RNG, but omits the entity-id cursor"
      - path: "src/sim/snapshot.ts"
        issue: "nextId is not part of the serialized state the fingerprint hashes"
    missing:
      - "Serialize the id cursor (same fix as the serializer-completeness gap) and extend the census with the nextId mutator"
  - truth: "entityId stays monotonic and iteration order is stable across spawn/despawn (no Map delete+re-add reorder) (D-04/D-05)"
    status: failed
    reason: "Live-session churn is correct (orderedIds splice preserves survivor order; entity-store.test passes). But across a snapshot/restore the id cursor regresses: after despawn(max) → snapshot → restore, the next spawn reuses a previously used id (probe: original spawns 3, restored spawns 2), violating D-05 'ids stable and monotonic, never reused' on the restore path — the exact path Phase 2 kill/respawn will use."
    artifacts:
      - path: "src/sim/world/entity-store.ts"
        issue: "restore() derives nextId from live entities instead of restoring the serialized cursor"
      - path: "src/sim/snapshot.ts"
        issue: "no nextId field in the canonical byte layout"
    missing:
      - "Persist/restore the id cursor so ids are never reused after a snapshot round-trip (same fix as gap 1); Phase 2's kill/respawn makes this reachable via BattleSim"
---

# Phase 1: Foundation & Deterministic Sim Core Verification Report

**Phase Goal:** A headless, fixed-timestep, fully seeded simulation core exists that can be stepped and whose reproducibility is provable by an automated gate — with no renderer, DOM, network, or clock dependencies.
**Verified:** 2026-10-15T11:42:02.983Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The determinism *mechanics* are genuinely delivered and independently confirmed: the tree is
clean, the DOM-free boundary holds at both the type and lint layers, the fixed-step clock and
accumulator behave correctly, randomness flows only through seeded named streams, and the
double-run gate passes. What fails is the phase's own **serializer-completeness** contract
(`must_haves` of Plan 01-04, and threat T-01-04): the snapshot omits `EntityStore.nextId`, so a
snapshot is not a complete restart point for any run that despawns its highest-id entity. This
was independently reproduced (not merely accepted from REVIEW.md).

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1 | Predecessor TS/Vue `src/**` tree + `index.html` removed; typecheck + lint clean | ✓ VERIFIED | `git ls-files src` = only new `src/**`; `git ls-files index.html` empty; `pnpm run typecheck` exit 0; `pnpm run lint` exit 0 |
| 2 | Bleeding-edge toolchain installs/runs under side-by-side TS6/TS7 layout | ✓ VERIFIED | `node_modules` present; package.json aliases `typescript`→`@typescript/typescript6`, `@typescript/native`→`typescript`; typecheck (native tsc) + lint (tseslint) both exit 0 |
| 3 | DOM-free sim project (`tsconfig.sim.json`) exists and type-checks independently | ✓ VERIFIED | `tsconfig.sim.json` `lib:["ESNext"]`, `types:[]`, `include` src/sim+src/config; `pnpm run typecheck` exit 0 |
| 4 | Stepping advances by fixed step count, never wall-clock (D-01/SIM-01) | ✓ VERIFIED | `TickClock.step()` only mutation; `tests/sim/clock.test.ts` + `tests/host/loop.test.ts` pass (8 tests) |
| 5 | Full sim runs headless in Node with no DOM/RAF/clock (D-01/SIM-03) | ✓ VERIFIED | DOM-free project type-checks; all suites run under Vitest `environment: node` |
| 6 | Fixed seed → state changes tick-over-tick (non-vacuous fixture, A1) | ✓ VERIFIED | `gate.test.ts` "trace is not a constant" (`new Set(trace).size > 1`) passes over 200 ticks |
| 7 | Time is a monotonic tick counter; accumulator converts a frame budget into whole fixed steps | ✓ VERIFIED | `runLoop` floor(acc/dt) with maxFrame clamp + maxSteps debt-drop; loop.test passes |
| 8 | Every randomness source is a named seeded stream that save/restore round-trips (SIM-02) | ✓ VERIFIED | `src/sim/core/rng.ts` (`RandomStreams`, xmur3 `mixSeed`, sfc32); `tests/sim/rng.test.ts` 5 tests pass |
| 9 | External control enters only as typed Commands, drained exactly once/tick, unknown kinds rejected deterministically (no silent no-op) | ✓ VERIFIED | `src/sim/commands.ts` total `validate()`; `BattleSim.step()` drains once at top; `tests/sim/commands.test.ts` 9 tests pass. (Caveat: `atTick` is validated but unenforced — see Anti-Patterns WR-01) |
| 10 | `sim/**` cannot import DOM/node/host/render/pixi; `Math.random`/`Date.now`/`performance.now` are lint errors inside `sim/**` | ✓ VERIFIED | `eslint --print-config src/sim/battle-sim.ts` resolves `no-restricted-imports`/`-globals`/`-properties`; `pnpm run lint` exit 0 |
| 11 | Same seed twice → identical PER-TICK fingerprint trace; different seed → different (SIM-04) | ✓ VERIFIED | `tests/determinism/gate.test.ts` 3 tests pass (`pnpm gate` exit 0) |
| 12 | Fingerprint tracks state — not constant across ticks and **every state mutator moves it** | ✗ FAILED | Mutator census omits the id cursor; probe: nextId 2 vs 3 over identical entities → identical fingerprint |
| 13 | `fingerprint(restore(serialize(state))) === fingerprint(serialize(state))` and the serializer omits nothing (SIM-04 correctness) | ✗ FAILED | Equality holds trivially, but `nextId` is omitted from `serializeState`; probe: original next id 3 vs restored 2 (dead id reused) |
| 14 | `entityId` monotonic/never reused and iteration order stable across spawn/despawn incl. snapshot/restore (D-04/D-05) | ✗ FAILED | Live churn VERIFIED, restore path FAILED: probe shows dead id 2 reused after snapshot/restore |
| 15 | A committed pre-commit gate runs the determinism check and refuses to commit on divergence (D-09) | ✓ VERIFIED | `git config core.hooksPath` = `.githooks`; `.githooks/pre-commit` staged 100755; runs lint + determinism; `.gitattributes` pins LF; no CI workflow added |

**Score:** 12/15 truths verified (0 present, behavior-unverified)

Note: ROADMAP SC4 ("runs in CI") is superseded by locked decision D-09 (same-machine pre-commit
gate, no CI); truth 15 is evaluated against D-09, not CI.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/sim/core/clock.ts` | Fixed-step tick counter | ✓ VERIFIED | `TickClock`; `step()` + snapshot-only `restore(tick)` |
| `src/sim/core/rng.ts` | Named seeded streams + save/restore | ✓ VERIFIED | sfc32 + xmur3 `mixSeed`; unknown name throws |
| `src/sim/world/entity-store.ts` | Ordered, restorable store | ⚠️ PARTIAL | `orderedIds` contract correct; `restore()` derives `nextId = maxId+1` (cursor lost) |
| `src/sim/world/world.ts` | `SimState` aggregate | ✓ VERIFIED | `{store, clock, rng, commands, events}` composed, injected |
| `src/sim/systems/movement.ts` | Seeded per-tick mutator (A1) | ✓ VERIFIED | Consumes `content/formulas.MOVEMENT_NUDGE_SCALE`; only per-tick mutator |
| `src/sim/snapshot.ts` | Canonical serialize + restore + separable fingerprint | ✗ STUB (incomplete) | Omits `nextId`; hash separable + non-crypto documented |
| `src/sim/battle-sim.ts` | Public sim facade | ✓ VERIFIED | reset/step/submit/snapshot/restore/fingerprint |
| `src/sim/commands.ts` | Typed Command + total queue | ✓ VERIFIED | 5 kinds, structural validation, rejection counter |
| `src/sim/core/events.ts` | Per-tick typed EventLog | ✓ VERIFIED | emit copies, drain returns copy, clear |
| `src/sim/core/math.ts` | Sanctioned math subset + clamp | ✓ VERIFIED | Documented; `clamp` |
| `src/sim/content/formulas.ts` | Data-only constants (D-06) | ✓ VERIFIED | Zero imports |
| `src/host/loop.ts`, `src/host/pump.ts` | DOM-free pacing | ✓ VERIFIED | Gaffer accumulator; headless/fixedFps pumps |
| `src/config/sim.ts` | Central constants | ✓ VERIFIED | FIXED_DT/AI_INTERVAL/DEFAULT_SEED/MAX_FRAME/MAX_STEPS |
| `tests/helpers/run-sim.ts`, `tests/determinism/gate.test.ts` | Trace runner + gate | ✓ VERIFIED | `runTrace`; 3-assertion gate |
| `.githooks/pre-commit`, `.gitattributes` | D-09 gate wiring | ✓ VERIFIED | 100755, LF-pinned, hooksPath set |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `runLoop` | `sim.step()` | `StepTarget.step` | ✓ WIRED | Only advance primitive; pumps carry budgets |
| `RandomStreams` | `movementSystem` | `w.rng.stream('ai').next()` | ✓ WIRED | No `Math.random` path; lint-banned |
| `EntityStore.ids()` | systems | ordered iteration | ✓ WIRED | movement iterates `w.store.ids()` |
| `serializeState` | `fingerprint` | snapshot() → hash | ✓ WIRED | Separable pure hash |
| `.githooks/pre-commit` | `pnpm gate` | `vitest run tests/determinism` | ✓ WIRED | hooksPath = `.githooks` |
| `EntityStore` state | `serializeState` | canonical bytes | ✗ PARTIAL | `nextId` not carried (gap) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `movementSystem` | `xform` | seeded `'ai'` stream nudge + integration | Yes | ✓ FLOWING |
| `fingerprint` | canonical bytes | `serializeState(state)` | Yes (but incomplete — no id cursor) | ⚠️ PARTIAL |
| `runTrace` | per-tick fingerprint[] | `BattleSim.snapshot()` via `runLoop` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Type projects compile | `pnpm run typecheck` | exit 0 | ✓ PASS |
| Lint boundary holds | `pnpm run lint` | exit 0 | ✓ PASS |
| Full suite | `pnpm test` | 8 files / 46 tests passed | ✓ PASS |
| Determinism gate | `pnpm gate` | 1 file / 3 tests passed | ✓ PASS |
| Boundary rules resolve for sim | `eslint --print-config src/sim/battle-sim.ts` | lists `no-restricted-imports`/`-globals`/`-properties` | ✓ PASS |
| Snapshot/restore after despawn (CR-01) | throwaway probe (run then removed) | `FP_EQUAL true`; `ORIG_NEXT 3 REST_NEXT 2` | ✗ FAIL (gap) |
| `src/config` lint boundary | `eslint --print-config src/config/sim.ts` | no `no-restricted-*` rules present | ✗ (WR-04, warning) |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | No probe scripts declared in PLAN/SUMMARY | n/a | N/A |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SIM-01 | 01-01, 01-02, 01-03 | Fixed step, decoupled from rendering | ✓ SATISFIED | `TickClock`; `runLoop` accumulator; clock/loop tests pass |
| SIM-02 | 01-01, 01-03, 01-04 | Seeded PRNG, reproducible by seed | ✓ SATISFIED | Named `RandomStreams`; `Math.random` lint-banned in `sim/**`; rng tests pass |
| SIM-03 | 01-01, 01-02, 01-03 | Headless (no-render) run mode | ✓ SATISFIED | DOM-free `tsconfig.sim.json` type-checks; Vitest `node` env; two-layer boundary |
| SIM-04 | 01-02, 01-04 | Determinism gate (state fingerprint/snapshot) proving same-seed consistency | ⚠️ PARTIAL | Gate exists and passes same/diff-seed; but the snapshot is not exhaustive (omits `nextId`), so the state fingerprint cannot distinguish divergent futures — see gaps |

No orphaned requirements: all four Phase-1 IDs (SIM-01..04) appear in the plans' `requirements` frontmatter and are mapped in REQUIREMENTS.md traceability.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/sim/battle-sim.ts` | 103-131 | `switch (cmd.kind)` with no `default`/`never` exhaustiveness guard | ⚠️ Warning | A future `Command` variant added without updating `applyCommands` compiles and silently no-ops (predecessor anti-pattern, WR-02) |
| `src/sim/commands.ts` | 16-24, 40-44 | `atTick` validated but never read in `applyCommands` | ⚠️ Warning | Module doc claims replay-from-recorded-log; a late command is applied at drain tick, not skipped for its tick — unrealized contract (WR-01) |
| `src/sim/snapshot.ts` | 38-40, 75-78 | `quantize()` → `setInt32` wraps out of range silently | ⚠️ Warning | Latent; Phase-1 magnitudes are safe but Phase-2 physics values could exceed ±8.38e6 (WR-03) |
| `eslint.config.js` | 56 | Boundary block scoped to `src/sim/**` only | ⚠️ Warning | `src/config/**` is in the DOM-free tsconfig but has only the weaker layer; `Date.now`/`Math.random` there are neither type- nor lint-errors (WR-04) |
| `vitest.config.ts` | 8-11 | `coverage.provider:'v8'` with `@vitest/coverage-v8` undeclared; include omits config/host | ⚠️ Warning | `vitest run --coverage` fails (missing dep); two source trees untracked (WR-05) |

No debt markers (`TODO`/`FIXME`/`XXX`/`TBD`/`HACK`) found in `src/` or `tests/`.

### Human Verification Required

None — the phase's deliverables are programmatically verifiable and all commands were run by the verifier.

### Gaps Summary

One root cause produces all three failed must-haves: **`serializeState()` omits `EntityStore.nextId`,
and `EntityStore.restore()` reconstructs the cursor as `max(live id)+1`.** Consequences:

- The serializer is not exhaustive (fails the Plan 01-04 truth "the serializer omits nothing"), so
  threat **T-01-04** — the phase's declared high-severity threat — is not actually mitigated.
- The anti-vacuous mutator census is incomplete (fails "every state mutator moves it").
- `entityId` is reused after a snapshot/restore, violating **D-05** on the entity-churn path.

It is latent through the public facade today (`BattleSim` has no `despawn()`), but it is immediately
reachable via the public `sim.state.store` and via any Phase-2 kill/respawn path — and the phase's
own must-have states the serializer omits *nothing*, which is falsified regardless of reachability.
The fix is small and localized: serialize the cursor, thread it through `restore(entries, nextId)`,
bump the snapshot version, and add the despawn→snapshot→restore→spawn regression test plus a census entry.
Everything else the phase set out to deliver is present, wired, and independently confirmed.

---

_Verified: 2026-10-15T11:42:02.983Z_
_Verifier: the agent (gsd-verifier)_
