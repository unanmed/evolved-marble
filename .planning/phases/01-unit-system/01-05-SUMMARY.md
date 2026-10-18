---
phase: 01-unit-system
plan: 05
subsystem: units
tags: [typescript, injectable-rng, box-muller, normal-distribution, numeric-enums, vitest, statistics]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "Wave 1 type contract (01-02): `IRng` (in `src/common/types.ts`, re-exported from `@/units/types`), `ISpawnAttributes`, `IUnit`, `ClassKind`, `AttributeKind` (user-approved)"
  - phase: 01-unit-system
    provides: "Wave 2 data tables (01-03): `CLASS_DEFS` per-class 1-level means + `CONTROL_LEVEL_BASE` (= 10)"
  - phase: 01-unit-system
    provides: "Wave 3 (01-04): `class Unit implements IUnit` constructed as `(classKind, roll, modifiers?, name?)`, reading MaxHealth/Attack/Defense/ControlLevel from the rolled spawn bases"
provides:
  - "`src/common/rng.ts` — `class MathRng implements IRng` (default non-deterministic `Math.random` wrapper) + `sampleNormal(rng, mean, sd)` Box–Muller sampler with a `u1 > 0` guard and a clamp to ≥ 0"
  - "`src/units/spawn.ts` — `spawnUnit(classKind, rng): IUnit`: rolls the 7 randomized attributes (σ = mean/8, control level mean from the shared `CONTROL_LEVEL_BASE`) clamped non-negative, assigns a `<class>#<index>` display name, and constructs `Unit`"
  - "`tests/units/rng.test.ts` — known-vector / zero-guard / clamp / `[0,1)` bounds for `sampleNormal` + `MathRng`"
  - "`tests/units/spawn-normal.test.ts` — statistical distribution assertions (mean ≈ class mean, σ ≈ mean/8, ≥ 0) via an injected deterministic IRng"
affects: [Phase 2 physics (damage jitter reuses `IRng`/`sampleNormal` with σ = mean/20), Phase 4 kingdom (spawns armies of units), Phase 5 render (reads spawn-time names)]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 2884
  tasks: 2
  commits: 2
  plan_head_before: ed65d1d

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "`class MathRng implements IRng` — the only production implementation of the injected `IRng` seam; its `next()` is documented as the default (non-deterministic) source (D-07)"
    - "`sampleNormal(rng, mean, sd)` — Box–Muller `z = √(-2·ln u1)·cos(2π·u2)`, with a `while (u1 <= 0) u1 = rng.next()` guard (never `Math.log(0)`) and a final `Math.max(0, mean + z·sd)` clamp (D-08)"
    - "Randomness is injected through the shared `src/common/` abstraction — no seeded/global RNG, no statistics dependency (`Math` only)"
    - "Deterministic test RNG (mulberry32) defined inline in the spawn test; a tiny scripted `IRng` stub inline in the rng test — no production test-only abstraction"
    - "Module-level monotonic `let spawnIndex` (JSDoc'd) drives the `<class>#<index>` display name (D-12)"

key-files:
  created:
    - src/common/rng.ts
    - src/units/spawn.ts
    - tests/units/rng.test.ts
    - tests/units/spawn-normal.test.ts
  modified: []

key-decisions:
  - "`sampleNormal`'s non-negative clamp is a correctness guard, not a shaping mechanism: with σ = mean/8 the truncation point sits 8σ below the mean, so the clamp is effectively never hit (verified: all 7 attributes stayed ≥ 0 and finite across 100k samples)"
  - "`MathRng`/`sampleNormal` live in `src/common/rng.ts` (per AGENTS.md convention #9 and D-07/D-09/D-10) since the random seam is a generic reusable abstraction Phase 2's damage jitter will reuse"
  - "`spawnUnit`'s control-level mean uses the shared `CONTROL_LEVEL_BASE` constant (10) for every class — the spec fixes every class's initial control-level mean at 10, and `IClassDef` has no per-class controlLevel field"
  - "Only the 7 spec-listed attributes are rolled; 经验比率/攻击经验比率/防御经验比率 are class constants and are NOT randomized"
  - "The rolled mass is the class's body mass only — equipment mass stays on the equipment defs and is summed later by the physics layer (OQ-6)"

patterns-established:
  - "Injectable randomness → deterministic statistics testing: a seeded inline `IRng` makes distribution assertions reproducible without any determinism claim"
  - "Test-only RNG stubs are defined inline in the test file (scripted sequence / mulberry32), never promoted into `src/`"

requirements-completed: [UNIT-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "`sampleNormal(rng, mean, sd)` performs a Box–Muller normal sample that never produces a negative or non-finite value: a `u1 <= 0` redraw guard avoids `Math.log(0)` and the result is clamped to ≥ 0"
    requirement: UNIT-05
    verification:
      - kind: unit
        ref: "tests/units/rng.test.ts#returns the mean when the two uniform draws give z = 0"
        status: pass
      - kind: unit
        ref: "tests/units/rng.test.ts#skips a zero first draw so Math.log(0) is never taken"
        status: pass
      - kind: unit
        ref: "tests/units/rng.test.ts#clamps a negative sample to exactly 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "`class MathRng implements IRng` is the default injected source (wrapping `Math.random`) and always returns a number in `[0, 1)`"
    requirement: UNIT-05
    verification:
      - kind: unit
        ref: "tests/units/rng.test.ts#always returns a number in [0, 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "`spawnUnit(classKind, rng)` samples each of the 7 randomized attributes from a normal distribution with mean = the class base value and σ = mean/8 (control level uses the shared `CONTROL_LEVEL_BASE` = 10), with every value clamped non-negative and finite"
    requirement: UNIT-05
    verification:
      - kind: unit
        ref: "tests/units/spawn-normal.test.ts#mean is within 2% of the class base (200)"
        status: pass
      - kind: unit
        ref: "tests/units/spawn-normal.test.ts#standard deviation is within 5% of mean/8 (25)"
        status: pass
      - kind: unit
        ref: "tests/units/spawn-normal.test.ts#mean is within 2% of 80 and deviation is within 5% of 10"
        status: pass
      - kind: unit
        ref: "tests/units/spawn-normal.test.ts#mean is within 2% of 10 for every class and every sample is non-negative"
        status: pass
      - kind: unit
        ref: "tests/units/spawn-normal.test.ts#yields no negative or non-finite value across all 7 attributes"
        status: pass
    human_judgment: false
  - id: D4
    description: "`spawnUnit` assigns each unit a distinct `<class name>#<running index>` display name at spawn time, readable via `getName()` (D-12)"
    requirement: UNIT-05
    verification:
      - kind: unit
        ref: "tests/units/spawn-normal.test.ts#gives consecutive units distinct non-empty names starting with the class name"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-10-18
status: complete
---

# Phase 1 Plan 05: Unit Generation (Injectable RNG + Normal Spawn) Summary

**Injectable `IRng` seam (`MathRng` + Box–Muller `sampleNormal`) and `spawnUnit`, which rolls the 7 spec-listed attributes as `N(class mean, (mean/8)²)`, clamps them non-negative, and assigns each unit a `<class>#<index>` name.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-18T05:42:48Z (base `ed65d1d`)
- **Completed:** 2026-10-18T05:45:07Z (`36a76c3`)
- **Tasks:** 2 (both `type="auto"`, single commit each)
- **Files modified:** 4 (all created)

## Accomplishments

- **`src/common/rng.ts` (`class MathRng implements IRng` + `sampleNormal`)** — `MathRng.next()` wraps `Math.random` and its JSDoc states it is the default non-deterministic source (the abstraction exists only to inject fixed sequences in tests, D-07). `sampleNormal(rng, mean, sd)` implements Box–Muller `z = √(-2·ln u1)·cos(2π·u2)` with a `while (u1 <= 0)` redraw so `Math.log(0)` is never taken, then returns `Math.max(0, mean + z·sd)` (D-08). No top-level `const`, no statistics dependency — `Math` only.
- **`src/units/spawn.ts` (`spawnUnit(classKind, rng): IUnit`)** — reads `def = CLASS_DEFS[classKind]`, rolls exactly the 7 randomized attributes (`maxHp`, `controlLevel`, `attack`, `defense`, `weaponRatio`, `armorRatio`, `mass`) via a local `roll(mean) = sampleNormal(rng, mean, mean / 8)` helper, and takes the control-level mean from the shared `CONTROL_LEVEL_BASE` (10) rather than any per-class field. Mass is rolled as body mass only (OQ-6). Each unit gets a distinct `<class name>#<spawnIndex>` name from a JSDoc'd module-level counter and is constructed as `new Unit(classKind, attributes, [], name)`.
- **Tests (10 new assertions across 2 files)** — `rng.test.ts` pins the Box–Muller known vector (`z = 0` ⇒ returns the mean), the zero guard, the non-negative clamp, and `MathRng`'s `[0, 1)` bounds; `spawn-normal.test.ts` asserts mean ≈ class base, σ ≈ mean/8, control-level mean ≈ 10 across all seven classes, non-negativity/finiteness of all 7 attributes, and distinct class-prefixed names — all via an injected deterministic `IRng`.
- **Full suite green** — 8 files / 67 tests passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement MathRng + sampleNormal (Box–Muller) in src/common/rng.ts with unit tests** - `980bbff` (feat)
2. **Task 2: Implement spawnUnit and distribution tests in spawn-normal.test.ts** - `36a76c3` (feat)

**Plan metadata:** `_metadata commit_` (docs: complete 01-05 plan)

## Files Created/Modified

- `src/common/rng.ts` — `MathRng` + `sampleNormal`; imports `IRng` (type-only) from `@/common/types`; no top-level `const`.
- `src/units/spawn.ts` — `spawnUnit`; imports `sampleNormal` from `@/common/rng`, `IRng` from `@/common/types`, `CLASS_DEFS`/`CONTROL_LEVEL_BASE` from `@/units/data`, types from `@/units/types`, and `Unit` from `@/units/Unit`.
- `tests/units/rng.test.ts` — scripted inline `IRng` stub; known-vector / zero-guard / clamp / bounds assertions.
- `tests/units/spawn-normal.test.ts` — inline mulberry32 deterministic `IRng`; 100k-sample mean/σ distribution checks + non-negative/finite edge check + distinct-name check.

## Decisions Made

- **Clamp is a guard, not shaping (D-08)**: with σ = mean/8 the truncation sits 8σ below the mean, so the `Math.max(0, …)` clamp is effectively never exercised — confirmed empirically (all 7 attributes stayed finite and ≥ 0 over 100k samples). It exists only to guarantee a non-finite/negative value can never silently corrupt a downstream attribute.
- **`src/common/` placement (D-07/D-09/D-10)**: `MathRng` + `sampleNormal` are generic reusable abstractions (per AGENTS.md convention #9) that Phase 2's `σ = D̄_R/20` damage jitter will reuse, so they live beside the `IRng` contract.
- **Control-level mean is global**: `spawnUnit` uses `CONTROL_LEVEL_BASE` (10) for every class — the spec fixes all classes' initial control-level mean at 10, and `IClassDef` intentionally has no `controlLevel` field.
- **Only the 7 spec attributes are rolled**: the three exp-ratio fields are class constants and remain un-randomized.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None. `pnpm test` / `pnpm typecheck` / `pnpm lint` were all green on the first run for both tasks; no package installs, no auth gates, no environment blockers. (Git emitted the usual LF→CRLF working-copy warning on Windows — cosmetic only.)

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surface. The plan's trust boundary (`injected IRng → attribute values`) is mitigated exactly as specified: T-01-11 (`sampleNormal` `u1 <= 0` guard + non-negative clamp, asserted finite/non-negative by tests), T-01-12 (only the 7 documented attributes are rolled, mean/σ pinned by tests), and T-01-SC (no statistics/gaussian dependency — native `Math` only; no `package.json` change). No network, secrets, or untrusted input.

## Next Phase Readiness

- UNIT-05 is delivered: unit generation is normal-distributed (mean by class, σ = mean/8) and clamped non-negative, with the seven rolled attributes observable through `getAttribute`.
- The `IRng`/`sampleNormal` seam is now shared in `src/common/` and ready for Phase 2's damage jitter (σ = mean/20) to reuse without any new randomness abstraction.
- `spawnUnit` is the single entry point that produces populated `Unit`s; Phase 4 (kingdom) can spawn armies through it and Phase 5 (render) can display the spawn-time names.
- All gates (`pnpm test` 67 passed, `pnpm typecheck` exit 0, `pnpm lint` exit 0) are green — Phase 1's harness is fully verified.

---
*Phase: 01-unit-system*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Created files present on disk: `src/common/rng.ts`, `src/units/spawn.ts`, `tests/units/rng.test.ts`, `tests/units/spawn-normal.test.ts` ✓
- Task commits present: `980bbff` (rng), `36a76c3` (spawn) ✓
- Measured commits from ledger base `ed65d1d`: 2 ✓
- Gates green: `pnpm test` (8 files, 67 passed), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0) ✓
