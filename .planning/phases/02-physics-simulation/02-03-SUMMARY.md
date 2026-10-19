---
phase: 02-physics-simulation
plan: 03
subsystem: physics
tags: [rapier-free, pure-math, damage, armor-reduction, d11-sign, jitter, sample-normal, d13-classifier]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "frozen WEAPON_DEFS/ARMOR_DEFS (penetration table + defenseRatio) and the shared IRng/sampleNormal (D-07/D-09/D-10)"
  - phase: 02-physics-simulation (wave 0, 02-01)
    provides: "tests/helpers/rng.ts deterministic mulberry32 IRng shared helper"
  - phase: 02-physics-simulation (wave 1, 02-02)
    provides: "frozen src/physics/types.ts contract (numeric ColliderPart enum, IDamageEvent shape) approved at the type-design gate"
provides:
  - "src/physics/damage.ts — pure Rapier-free damage & armor-reduction math: computeDamageMean, rollDamage, computeDamageReduction, computeFinalDamage, isDamageBearingPair + DAMAGE_JITTER_SIGMA_DIVISOR"
  - "tests/physics/damage.test.ts pinning the spec formulas, the jitter statistics, the D-11 sign ruling (higher penetration ⇒ larger final damage) and the D-13/OQ-4 pair classifier"
affects: [02-physics-simulation 02-06 (damage event pipeline), 03-control, 04-kingdom]

# Actuals (#2632) — pairs with the plan's `estimate` (tokens: 30000, tasks: 2).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 2997
  tasks: 2
  commits: 2
plan_head_before: 2725feadda851049ecc120bf092738ba5ecd5b06

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pure-math module: no Rapier import, no class, no mutable module state — deterministic and engine-free unit testing of the gameplay formulas"
    - "single-source randomness: rollDamage delegates to the shared sampleNormal (@/common/rng) with σ = mean/20; no physics-local sampler (AGENTS §9)"
    - "sign-consistent armor ruling (D-11): B_A = 破甲比率 used directly (not its reciprocal) so higher penetration bypasses MORE armor"
    - "finite/non-negative data-integrity guards at every formula boundary: Δv clamped before Math.sqrt, mean clamped by max(…,0), reduction denominator guarded to 0"

key-files:
  created:
    - src/physics/damage.ts
    - tests/physics/damage.test.ts
  modified: []

key-decisions:
  - "D-11 sign ruling implemented and test-pinned: computeDamageReduction uses B_A = penetration (not 1/penetration); the reciprocal reading would invert the weapon roster (research OQ-1) — the dedicated sign assertion fails under it."
  - "rollDamage reuses the shared sampleNormal with σ = mean/20 (DAMAGE_JITTER_SIGMA_DIVISOR = 20) — no physics-local Gaussian sampler (AGENTS §9)."
  - "isDamageBearingPair encodes D-13/OQ-4 as 'exactly one side is Weapon'; body↔body and weapon↔weapon bear no damage; the caller separately confirms differing owners."
  - "No body-hit reduction helper was added: the caller skips reduction on a Body hit via isDamageBearingPair + defenderPart (击中本体不减伤, D-11)."
  - "Test imports the shared mulberry32 helper via the relative path ../helpers/rng because the repo has no `tests/*` path alias (tsconfig paths = @/* only; vitest alias = @ only). Intent identical to the plan's `tests/helpers/rng`."

patterns-established:
  - "Physics gameplay formulas live in a Rapier-free pure module so PHYS-03/04 are verified without the WASM engine (plan 02-06 consumes these functions)."

requirements-completed: [PHYS-03, PHYS-04]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "src/physics/damage.ts implements the spec damage mean D̄_R = max[A_A·P_A·W_A·(√Δv − 1), 0] with a finite/non-negative Δv clamp; hand-computed values (144, 0, 64) and the clamp are pinned"
    requirement: PHYS-03
    verification:
      - kind: unit
        ref: "tests/physics/damage.test.ts#computeDamageMean — spec mean D̄_R"
        status: pass
      - kind: integration
        ref: "pnpm test -- tests/physics/damage.test.ts (1 file, 11 tests) green"
        status: pass
    human_judgment: false
  - id: D2
    description: "rollDamage delegates to the shared sampleNormal with σ = mean/20 (no physics-local sampler); over 2000 seeded samples the mean and σ reproduce"
    requirement: PHYS-03
    verification:
      - kind: unit
        ref: "tests/physics/damage.test.ts#rollDamage — shared sampleNormal jitter"
        status: pass
    human_judgment: false
  - id: D3
    description: "computeDamageReduction/computeFinalDamage apply the D-11 sign-consistent B_A = 破甲比率 (not its reciprocal): higher penetration yields a larger final damage and a smaller ΔD (锤子 pen 5 → 96.30 vs 弓箭 pen 0.2 → 51.02 at D_R 100)"
    requirement: PHYS-04
    verification:
      - kind: unit
        ref: "tests/physics/damage.test.ts#D-11 sign-consistency + worked example"
        status: pass
    human_judgment: false
  - id: D4
    description: "isDamageBearingPair matches D-13/OQ-4: weapon↔body and weapon↔armor bear damage; body↔body, weapon↔weapon and armor↔armor do not"
    requirement: PHYS-04
    verification:
      - kind: unit
        ref: "tests/physics/damage.test.ts#isDamageBearingPair — D-13/OQ-4 classifier"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-10-19
status: complete
---

# Phase 2 Plan 03: Pure Damage & Armor-Reduction Math (Round 2) Summary

**The Rapier-free damage core: the spec mean `D̄_R = max[A_A·P_A·W_A·(√Δv − 1), 0]`, normal jitter σ = mean/20 via the shared `sampleNormal`, and the D-11 sign-consistent armor reduction `B_A = 破甲比率` (higher penetration bypasses more armor) — all pinned by a green, engine-free test including the dedicated sign proof.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-19T13:28:00+08:00 (approx, after reading frozen contracts)
- **Completed:** 2026-10-19T13:39:21+08:00 (Task 2 commit)
- **Tasks:** 2
- **Files modified:** 2 (127 + 207 lines, 334 insertions)

## Accomplishments

- `src/physics/damage.ts` transcribes the spec formulas as pure functions: `computeDamageMean` (with a finite/non-negative Δv clamp before `Math.sqrt` and the `max(…,0)` clamp), `rollDamage` (delegates to the shared `sampleNormal`, σ = mean/20), `computeDamageReduction` (D-11 sign-consistent), `computeFinalDamage` (`D = D_R − ΔD`), and `isDamageBearingPair` (D-13/OQ-4 classifier). The `DAMAGE_JITTER_SIGMA_DIVISOR = 20` const is the single jitter calibration point. No Rapier import, no class, no mutable state.
- The **D-11 sign ruling is encoded and proven**: `B_A = 破甲比率` used directly (not `1/penetration`). The dedicated test asserts that the higher-penetration weapon (锤子 pen 5) yields a *larger* final damage and a *smaller* reduction than the lower-penetration weapon (弓箭 pen 0.2) — the assertion that would flip under the reciprocal reading (research OQ-1 / A1).
- **Worked example pinned** (defender Swordsman A_D 24, P_D 0.8, Helmet S_D 1.0 → X = 19.2; D_R = 100): 锤子 pen 5 → final ≈ 96.30 (ΔD ≈ 3.70); 短剑 pen 1 → final ≈ 83.89 (ΔD ≈ 16.11).
- **Statistical jitter pinned**: 2000 seeded samples reproduce the requested mean (±10%) and σ = mean/20 (±25%), every sample finite and non-negative.
- `tests/physics/damage.test.ts` is fully Rapier-free (no `RAPIER.init()`, no WASM) — PHYS-03/PHYS-04 math is verifiable without the engine.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create `src/physics/damage.ts` — pure damage & armor-reduction functions** - `65f4764` (feat)
2. **Task 2: Add `tests/physics/damage.test.ts` — formula pinning + D-11 sign proof** - `1f09816` (test)

**Plan metadata:** this docs commit (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

- `src/physics/damage.ts` - pure damage/armor math (5 functions + 1 JSDoc'd const); imports only `sampleNormal` (`@/common/rng`), `IRng` (`@/common/types`, type-only), and `ColliderPart` (`@/physics/types`); no Rapier, no class, no state
- `tests/physics/damage.test.ts` - 11 tests: hand-computed mean cases + `max(…,0)`/finite guards, jitter statistics, the OQ-1 worked example, the D-11 sign proof, and the D-13/OQ-4 classifier; imports `mulberry32` via `../helpers/rng`

## Decisions Made

- No body-hit helper was added; the caller uses `isDamageBearingPair` + `defenderPart` to skip reduction on a Body hit (击中本体不减伤, D-11) — keeps the pure module free of caller-policy logic.
- `rollDamage` takes the already-computed `mean` (not the A_A/ratios) so the jitter seam stays a one-liner over the shared `sampleNormal`.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 - Blocking] Test helper imported via relative path `../helpers/rng` instead of the bare specifier `tests/helpers/rng`**

- **Found during:** Task 2
- **Issue:** The plan's action names `mulberry32` from `tests/helpers/rng`, but the repo defines no `tests/*` path alias — `tsconfig.json` maps only `@/*` → `./src/*` and `vitest.config.ts` aliases only `@` → `src`. The bare specifier does not resolve (TypeScript TS2307 / Vite node resolution failure).
- **Fix:** Used the equivalent relative import `../helpers/rng` from `tests/physics/damage.test.ts`. Same shared helper, same intent; verified by a green test run and clean typecheck.
- **Files modified:** `tests/physics/damage.test.ts`
- **Commit:** `1f09816`

## Issues Encountered

- None functional. Both gates green: `pnpm test -- tests/physics/damage.test.ts` (1 file / 11 tests), `pnpm test` (11 files / 97 tests), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), Task-1 presence check prints `DAMAGE_OK`.
- Environment note: priority `master` is the project's protected default branch, but `branching_strategy: none` and the sequential-on-main-tree execution directive make main-tree commits the intended mode (all prior plan commits are on `master`); commits used normal hooks (no `--no-verify`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PhysicsWorld` (plan 02-06) can now compute Δv → `computeDamageMean` → `rollDamage` → (`computeDamageReduction`/`computeFinalDamage`) and gate pairs with `isDamageBearingPair`, then emit final-number `IDamageEvent`s — all against this frozen, tested math.
- The D-11 sign ruling is locked in code and tests; no further design ambiguity on OQ-1.
- No blockers.

## Threat Flags

None - the module only adds pure in-process arithmetic; no network, auth, file, or trust-boundary surface. The T-02-07/T-02-08 mitigations (finite/non-negative guards; sign assertion) are implemented and pinned.

---
*Phase: 02-physics-simulation*
*Completed: 2026-10-19*

## Self-Check: PASSED

All declared files exist (`src/physics/damage.ts`, `tests/physics/damage.test.ts`, `02-03-SUMMARY.md`); both task commits (`65f4764`, `1f09816`) are present in git history. `pnpm test -- tests/physics/damage.test.ts` (11 tests), `pnpm test` (11 files / 97 tests), `pnpm typecheck` (exit 0) and `pnpm lint` (exit 0) all pass; the Task-1 presence check prints `DAMAGE_OK`.
