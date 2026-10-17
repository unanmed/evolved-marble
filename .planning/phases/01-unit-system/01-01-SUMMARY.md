---
phase: 01-unit-system
plan: 01
subsystem: testing
tags: [vitest, typescript-eslint, tsconfig, toolchain, harness, wave-0]

# Dependency graph
requires: []
provides:
  - "Repaired Vitest harness: standalone config with `@`→src resolve.alias and no stale setupFiles"
  - "tsconfig.json that type-checks both src/ and tests/ (TS18003 cleared)"
  - "Working `pnpm lint` via the TypeScript 7/6 side-by-side alias (OQ-5)"
  - "tests/units/ scaffold with a smoke test so `vitest run` matches ≥1 file"
affects: [01-unit-system plans 02-05, all later phases that rely on pnpm test/typecheck/lint]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 2131
  tasks: 3
  commits: 3
plan_head_before: db6ec6a5deaacb9132759bdc86e6ca623ef83557

# Tech tracking
tech-stack:
  added:
    - "@typescript/typescript6@6.0.2 (aliased as devDep `typescript` — JS API for typescript-eslint)"
    - "typescript@7.0.2 retained via local alias key `@typescript/native` (native tsc)"
  patterns:
    - "Standalone vitest.config.ts must re-declare the `@` resolve.alias (it does not inherit vite.config.ts)"
    - "TypeScript side-by-side alias: `typescript` → TS6 for API consumers, `@typescript/native` → TS7 for tsc"

key-files:
  created:
    - tests/units/harness.test.ts
  modified:
    - vitest.config.ts
    - tsconfig.json
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Lint repaired via Microsoft side-by-side alias (TS6 JS API for typescript-eslint, TS7 for tsc) rather than pinning the whole project to TS 6.x"
  - "`@typescript/native` added as a local package.json alias key (not a registry `pnpm add`)"
  - "tsconfig `include` widened to ['src','tests'] so test files are type-checked; `strict` left true (no weakening)"

patterns-established:
  - "Wave-0 harness repair: fix the three gates (test/typecheck/lint) before any type or code work"

requirements-completed: [UNIT-01, UNIT-02, UNIT-03, UNIT-04, UNIT-05, UNIT-06]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "vitest.config.ts resolves the `@` alias to src/ (mirroring vite.config.ts) and no longer references the nonexistent physics setupFiles"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "node gsd-config-check.cjs → CONFIG_OK (alias=true noSetup=true includeTests=true)"
        status: pass
    human_judgment: false
  - id: D2
    description: "tsconfig.json `include` covers both src and tests; `strict` stays true; dangling tsconfig.sim.json reference removed"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "pnpm typecheck → exit 0 (TS18003 cleared)"
        status: pass
    human_judgment: false
  - id: D3
    description: "tests/units/harness.test.ts smoke test so `vitest run` loads the runner + config"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/harness.test.ts#unit-system harness > loads the Vitest runner and config"
        status: pass
    human_judgment: false
  - id: D4
    description: "`pnpm lint` runs to completion with exit 0 — typescript-eslint imports a JS-capable compiler (TS6) via the side-by-side alias"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "pnpm lint → exit 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "All three quality gates green together after the toolchain repair"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "pnpm test (exit 0, 1 passed) + pnpm typecheck (exit 0) + pnpm lint (exit 0)"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-10-17
status: complete
---

# Phase 1 Plan 01: Wave-0 Harness Repair Summary

**Repaired the three broken quality gates (Vitest `@` alias, tsconfig test coverage, `pnpm lint`) so every later Phase-1 plan can be verified.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-17T15:09:05Z
- **Completed:** 2026-10-17T15:20:58Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- **Vitest harness works**: `vitest.config.ts` now declares `resolve.alias { '@': join(cwd,'src') }` (a standalone Vitest config does not inherit `vite.config.ts`'s alias) and the stale `setupFiles: ['tests/helpers/physics-setup.ts']` (a nonexistent physics file from the deleted old version) is gone. `@/units/...` imports will now resolve under Vitest.
- **tsconfig type-checks tests**: `include` widened to `["src","tests"]` so `pnpm typecheck` covers test files and TS18003 no longer fires with an empty `src/`; dangling `tsconfig.sim.json` comment reference removed; `strict: true` and `@/*` path mapping preserved.
- **`pnpm lint` restored**: `typescript-eslint@8.x` refused TypeScript 7.0 (no JS API). Fixed via Microsoft's side-by-side alias — devDep `typescript` → `npm:@typescript/typescript6@^6.0.2` (JS API for ESLint) plus local alias key `@typescript/native` → `npm:typescript@^7.0.2` (native tsc). `eslint.config.js` untouched; no rule disabled.
- **Wave-0 scaffold**: `tests/units/harness.test.ts` makes the `tests/**/*.test.ts` glob match a file, so `vitest run` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repair vitest.config.ts + tsconfig.json** - `0a3167a` (fix)
2. **Task 2: Add tests/units harness smoke test** - `b17b139` (test)
3. **Task 3: Repair pnpm lint via TS side-by-side alias** - `6181bc3` (fix)

**Plan metadata:** `_metadata commit_` (docs: complete plan)

## Files Created/Modified

- `vitest.config.ts` — added `import { join } from 'path'`, `resolve.alias` `@`→`join(process.cwd(),'src')`; removed stale `setupFiles` and old-version comments (kept `environment: 'node'`, `include: ['tests/**/*.test.ts']`, no-coverage comment).
- `tsconfig.json` — `include: ["src", "tests"]`; rewrote the `rootDir` comment to drop the `tsconfig.sim.json` reference.
- `package.json` — `typescript` aliased to `@typescript/typescript6@^6.0.2`; added `@typescript/native: npm:typescript@^7.0.2`.
- `pnpm-lock.yaml` — materialized by `pnpm install` (11 packages added, 9 removed).
- `tests/units/harness.test.ts` — Vitest smoke test (new; no exported symbols).

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Vitest config pin | `node gsd-config-check.cjs` | `CONFIG_OK` (alias=true, noSetup=true, includeTests=true) |
| Tests | `pnpm test` | exit 0 — 1 passed (1) |
| Typecheck | `pnpm typecheck` | exit 0 (effective tsc = 7.0.2) |
| Lint | `pnpm lint` | exit 0 (typescript-eslint imports successfully) |
| Lint toolchain intact | `eslint.config.js` | still imports `typescript-eslint`; no rule disabled |

## Decisions Made

- **Side-by-side alias over project-wide TS6 pin**: keeps the TS7 native `tsc` (verified `pnpm exec tsc --version` → 7.0.2) while giving `typescript-eslint` the TS6 JS API it imports. The documented fallback (pin `typescript` to `^6.0.2`) was not needed.
- **`@typescript/native` added as a local alias key**, never via `pnpm add` — the registry lookup for that name 404s (RESEARCH §Package Legitimacy Audit).

## Deviations from Plan

None - plan executed exactly as written.

(Environment note, not a plan deviation: PowerShell 5.1 mangles double quotes passed to native `node -e`, so the Task-1 `<automated>` config-check regex was executed via a functionally-equivalent temp `.cjs` script instead of an inline `node -e`. The check logic is byte-for-byte the plan's regexes.)

## Issues Encountered

None. All three gates went green on the preferred (side-by-side alias) path; no fallback or checkpoint was required.

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surface introduced. The only supply-chain change is the already-vetted `@typescript/typescript6@6.0.2` toolchain alias (matches `threat_model` T-01-03 / T-01-SC; no rule disabled to force green).

## Next Phase Readiness

- `pnpm test`, `pnpm typecheck`, and `pnpm lint` are all green — the Nyquist validation contract (01-VALIDATION.md) can now run.
- Ready for plan **01-02** (type-first: `src/units/types.ts` numeric enums + `I*` interfaces, then the mandatory user review gate).
- The `@` alias is structurally pinned here; its end-to-end runtime resolution is proven by 01-02's `tests/units/types.test.ts` importing `@/units/types`.

---
*Phase: 01-unit-system*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Created/modified files present on disk: vitest.config.ts, tsconfig.json, package.json, pnpm-lock.yaml, tests/units/harness.test.ts ✓
- Task commits present: `0a3167a`, `b17b139`, `6181bc3` ✓
- Gates re-run and green: `pnpm test` (1 passed), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0) ✓
