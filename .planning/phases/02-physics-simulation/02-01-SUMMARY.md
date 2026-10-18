---
phase: 02-physics-simulation
plan: 01
subsystem: testing
tags: [rapier, wasm, vitest, physics, rng, dependency-pin]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "@-alias Vitest config, tests/units/ suite, src/common/types.ts IRng"
provides:
  - "exact-pinned runtime dependency @dimforge/rapier2d-compat@0.21.0"
  - "tests/physics/ Wave-0 harness proving RAPIER.init() + World step headless under Vitest"
  - "tests/helpers/rng.ts deterministic mulberry32 IRng reused from the shared seam"
affects: [02-physics-simulation round-2 implementation plans, 03-control, 05-rendering]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 645
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: ["@dimforge/rapier2d-compat@0.21.0 (WASM physics, exact pin, zero deps)"]
  patterns:
    - "WASM engine init via beforeAll(async () => await RAPIER.init()) once per test file"
    - "afterAll free() of World + EventQueue to release the WASM heap (Pitfall 12)"
    - "f32 timestep asserted with toBeCloseTo, never exact equality (Pitfall 5)"
    - "shared deterministic IRng extracted to tests/helpers/, not duplicated or physics-local"

key-files:
  created:
    - tests/physics/rapier-harness.test.ts
    - tests/helpers/rng.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Pinned @dimforge/rapier2d-compat to the literal 0.21.0 via `pnpm add -E` — no caret/tilde range (D-02/D-12)."
  - "Default Vitest worker pool kept — the full 9-file suite runs green with WASM loaded, so the research Pitfall 7 `pool: 'forks'` fallback was NOT needed; vitest.config.ts left untouched."
  - "Runtime RAPIER.version() === '0.21.0' asserted in the harness so the actually-loaded build is pinned, not just package.json."
  - "tests/helpers/rng.ts copies mulberry32 verbatim and imports IRng type-only from @/common/types (AGENTS §9); tests/units/spawn-normal.test.ts left unchanged."
  - "requirements-completed intentionally left empty: this plan is a Wave-0 prerequisite (round 1 of 2) and delivers NO physics implementation, so marking PHYS-01..05 complete would be false."

patterns-established:
  - "Physics test lifecycle: one World per file, awaited init in beforeAll, free() in afterAll"

requirements-completed: []

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "package.json pins @dimforge/rapier2d-compat to exactly 0.21.0 (no range operator)"
    verification:
      - kind: other
        ref: "node -e \"require('./package.json').dependencies['@dimforge/rapier2d-compat'] === '0.21.0'\" -> PIN=0.21.0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rapier WASM initializes and steps a World headless under the Vitest worker pool, with World/EventQueue freed"
    verification:
      - kind: unit
        ref: "tests/physics/rapier-harness.test.ts#Rapier harness — WASM init under the Vitest worker pool"
        status: pass
      - kind: integration
        ref: "pnpm test (9 files, 82 tests) green under the default worker pool"
        status: pass
    human_judgment: false
  - id: D3
    description: "tests/helpers/rng.ts exports a deterministic seeded IRng (mulberry32) reusing @/common/types"
    verification:
      - kind: other
        ref: "pnpm typecheck (tests include) + structural check -> HELPER_OK"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-10-18
status: complete
---

# Phase 2 Plan 01: Physics Harness (Wave 0) Summary

**Exact-pinned `@dimforge/rapier2d-compat@0.21.0` installed behind the approved human-verify gate, with a headless WASM smoke test green under Vitest's default worker pool and a reusable deterministic `IRng` helper for later physics tests.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-18T18:45:00+08:00
- **Completed:** 2026-10-18T18:48:34+08:00
- **Tasks:** 3 (1 approved gate + 2 executed)
- **Files modified:** 4

## Accomplishments
- The project's first runtime dependency is installed at an exact pin: `"@dimforge/rapier2d-compat": "0.21.0"` (literal, no `^`/`~`), materialized in `pnpm-lock.yaml`.
- `RAPIER.init()` + a `World` step were proven to run headless under Vitest's **default** worker pool — the full suite (9 files, 82 tests) stays green, so the documented `pool: 'forks'` fallback was not required (research Pitfall 7 cleared).
- The harness pins the runtime build (`RAPIER.version() === '0.21.0'`) and frees every WASM object (`world.free()` / `eventQueue.free()`) so memory does not leak across the suite (Pitfall 12).
- A shared deterministic `mulberry32` `IRng` helper now lives in `tests/helpers/rng.ts`, ready for Wave-2 damage-jitter tests without duplication.

## Task Commits

Each task was committed atomically:

1. **Gate: approve installing the pinned engine** — human-approved (blocking-human), no commit (nothing installed before approval).
2. **Task 2: Install the exact pin + prove `RAPIER.init()` under Vitest** - `2beab6e` (chore)
3. **Task 3: Add the shared deterministic `IRng` test helper** - `e99a0a6` (test)

**Plan metadata:** this docs commit (SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `package.json` - added `dependencies["@dimforge/rapier2d-compat"] = "0.21.0"` (exact pin)
- `pnpm-lock.yaml` - lockfile entry materializing the exact pin (`@dimforge/rapier2d-compat@0.21.0`)
- `tests/physics/rapier-harness.test.ts` - Wave-0 smoke test: awaited `RAPIER.init()`, one `World` step with a fresh `EventQueue`, runtime version assert, teardown `free()`
- `tests/helpers/rng.ts` - deterministic seeded `IRng` via `mulberry32`, type-only import of `IRng` from `@/common/types`
- `vitest.config.ts` - **unchanged** (default pool sufficed; `@` alias + `environment: 'node'` intact)

## Decisions Made
- Kept the default Vitest worker pool: the multi-file suite passed with WASM loaded, so `pool: 'forks'` was unnecessary — avoiding an unforced config change.
- Asserted `RAPIER.version() === '0.21.0'` at runtime in addition to the package.json pin, so a silent drift in the loaded build would fail the harness.
- Left `requirements-completed: []` — see the frontmatter decision: this plan delivers prerequisites only, no PHYS-* requirement is actually satisfied yet.

## Deviations from Plan

None - plan executed exactly as written. `vitest.config.ts` was left untouched because the forks fallback was genuinely not required (the plan permitted but did not mandate it).

## Issues Encountered
- A shell parsing quirk: PowerShell interpreted `$before..HEAD` as its range operator when computing the commit ledger count. Re-ran with the range quoted (`"$before..HEAD"`); the measured count is 2. (Tooling-only, no code impact.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave-1 plan `02-02` (type declarations only for `src/physics/types.ts`) is unblocked: the pinned engine is installed and the harness proves WASM runs headless, so the mandatory type-design review gate is the next stop.
- The `tests/physics/` scaffold exists, so later per-requirement test files need no config changes.
- No blockers. No physics type/interface or implementation code was written (round 1 = prerequisites only).

---
*Phase: 02-physics-simulation*
*Completed: 2026-10-18*

## Self-Check: PASSED

All declared files exist (package.json, pnpm-lock.yaml, tests/physics/rapier-harness.test.ts, tests/helpers/rng.ts, 02-01-SUMMARY.md); both task commits (`2beab6e`, `e99a0a6`) are present in git history. `pnpm test` (9 files / 82 tests) and `pnpm typecheck` both green.
