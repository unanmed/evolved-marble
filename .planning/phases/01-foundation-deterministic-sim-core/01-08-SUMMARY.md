---
phase: 01-foundation-deterministic-sim-core
plan: 08
subsystem: tooling
tags: [gap-closure, review-remediation, eslint-boundary, wr-04, wr-05, sim-03, d-03, d-08, headless-boundary, vitest]

# Dependency graph
requires: [01-05]
provides:
  - "eslint.config.js — the headless boundary block (no-restricted-imports/-globals/-properties/-syntax) now targets ['src/sim/**/*.ts', 'src/config/**/*.ts'], matching tsconfig.sim.json's DOM-free include"
  - "vitest.config.ts — dangling coverage block removed; config references no undeclared provider dependency"
affects: [style-retrofit, review-remediation, sim-config, phase-2-physics]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff, .planning excluded).
actuals:
  tokens: 475
  tasks: 2
  commits: 2
  plan_head_before: 9465bbe27bcb571881010d6a30035969c01f89b5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-layer headless boundary: the ESLint boundary block's `files` and tsconfig.sim.json's `include` must name the SAME directories (now src/sim + src/config) so the lint layer and the DOM-free compiler layer stay complementary (D-03/SIM-03)."
    - "Dangling config deletion over dependency install: a config entry that references an undeclared dependency and backs no script is removed rather than satisfied, keeping the config internally consistent without adding a new (legitimacy-checked) dependency."

key-files:
  created: []
  modified:
    - eslint.config.js
    - vitest.config.ts

key-decisions:
  - "WR-04 fix is a one-line `files` extension plus a comment update — the boundary rules themselves are untouched; only the selector widens to cover src/config alongside src/sim."
  - "WR-05 fixed by deletion (not installation): the coverage block was dead (no test:coverage script, @vitest/coverage-v8 undeclared) and D-08 mandates Vitest, not coverage; adding the provider would introduce a new dependency for an unused capability."
  - "The mandated explanatory comment in vitest.config.ts is prose only — it describes the decision without re-declaring a `coverage:` / `provider: 'v8'` entry, so the verify's declaration-match gate stays meaningful."
  - "Math global stays allowed in the boundary (D-02 permits Math.sin/cos); only Math.random is restricted via no-restricted-properties — the widened block inherits this unchanged."

patterns-established:
  - "When a config file and its enforcement selector are meant to cover the same surface, assert that equality directly: `eslint --print-config <file-in-surface>` must resolve the boundary rules — an automated check that the selector actually reaches the tree, not just that lint is green."

requirements-completed: [SIM-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "`src/config/**` is covered by the ESLint headless boundary block (no-restricted-imports/-globals/-properties/-syntax), so Date/Math.random in a config/content module are lint errors — matching the DOM-free tsconfig.sim.json project (WR-04, SIM-03/D-03)."
    requirement: "SIM-03"
    verification:
      - kind: other
        ref: "pnpm exec eslint --print-config src/config/sim.ts resolves both no-restricted-properties and no-restricted-globals"
        status: pass
      - kind: other
        ref: "pnpm run lint exit 0 (src/config/sim.ts, data-only, still passes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`vitest.config.ts` no longer references an undeclared coverage provider, so the config is internally consistent and pnpm test has no dangling --coverage path (WR-05)."
    requirement: "SIM-03"
    verification:
      - kind: unit
        ref: "pnpm test (8 files, 51 tests) exit 0"
        status: pass
      - kind: other
        ref: "Select-String vitest.config.ts for `provider\\s*:\\s*'?v8` returns no match (coverage provider removed)"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 08: Tooling Review Remediation (WR-04 / WR-05) Summary

**Extended the ESLint headless boundary to cover `src/config/**` (matching the DOM-free `tsconfig.sim.json` project) and removed the dangling `@vitest/coverage-v8` coverage block from `vitest.config.ts` — no dependency added, full suite green.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-15T13:56:01Z
- **Completed:** 2026-10-15T13:58:25Z
- **Tasks:** 2 (both `type="auto"`; no checkpoints)
- **Files modified:** 2

## Accomplishments

- **WR-04 (Task 1)** — the ESLint boundary block's `files` selector widened from `['src/sim/**/*.ts']` to `['src/sim/**/*.ts', 'src/config/**/*.ts']`. `src/config/**` previously sat inside the DOM-free type project but had only the weaker (compiler-only) layer protecting it; `Date.now()` / `new Date()` / `Math.random()` there are now lint errors as well as type errors. The block's explanatory comment was updated to state it covers both trees and to note the `tsconfig.sim.json` include parity. Rules were neither weakened nor duplicated.
- **WR-05 (Task 2)** — removed the `coverage` block (`provider: 'v8'`, `include: ['src/sim/**']`) that referenced the undeclared `@vitest/coverage-v8` dependency. `environment: 'node'` and `include: ['tests/**/*.test.ts']` are unchanged. A prose Chinese comment records that coverage is intentionally unconfigured this phase (no provider dependency, no `test:coverage` script); re-introducing it requires adding the dependency and the script together. No dependency was added to `package.json`.
- **Full suite green** — `pnpm run typecheck` (both projects) exit 0; `pnpm run lint` exit 0; `pnpm test` 51 passed (8 files); `pnpm gate` 3 passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the ESLint headless boundary to `src/config/**` (WR-04)** - `cb2e0dc` (chore)
2. **Task 2: Resolve the dangling coverage config in `vitest.config.ts` (WR-05)** - `19dbb53` (chore)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## Files Created/Modified

- `eslint.config.js` — boundary block `files` now `['src/sim/**/*.ts', 'src/config/**/*.ts']`; comment updated to document the shared headless surface with `tsconfig.sim.json`.
- `vitest.config.ts` — `coverage` block removed; prose comment documents the intentional omission.

## Decisions Made

- **WR-04** is a selector-width change plus comment correction; the `no-restricted-*` rule bodies are untouched, so the boundary's semantics are unchanged — only its scope now matches the DOM-free project.
- **WR-05 resolved by deletion, not installation** — the coverage entry backed no script and required an undeclared dependency; the phase's test decision (D-08) mandates Vitest, not coverage. Adding `@vitest/coverage-v8` would have introduced a new dependency (needing a package-legitimacy check) for an unused capability. The comment is worded as prose and does not re-declare a coverage/provider entry.
- **Math stays allowed** in the widened boundary (D-02 permits `Math.sin/cos`); only `Math.random` is restricted, as before.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Protected `master` with sequential-executor override.** `gsd-tools query git.base-branch --is-protected master` returns `true`, and `git.branching_strategy` is `"none"`, but every prior Phase-1 plan (01-01…01-06) is committed directly on `master` (`state_head` = `6c92d3b`). Per the sequential-executor contract ("main working tree; normal git commits with hooks"), tasks were committed on `master` with the pre-commit hook active — matching the established pattern. No worktree branch namespace applies here.
- **Pre-commit hook runs lint + determinism only** (not typecheck/full suite) — this is D-09's intent; the full suite was run manually before each task commit and before the plan metadata commit.

## Known Stubs

- None introduced. This plan is tooling/config only (two config files); no runtime code was touched.

## Threat Flags

None — no new network/auth/file/schema surface. **T-01-01** (`src/config/**` randomness/time sources) is now mitigated at BOTH layers: the ESLint block joins the DOM-free `tsconfig.sim.json` project, so `Date`/`Math.random`/`performance` in a config module are lint errors (was: type-only). **T-01-06** (broken coverage path) is mitigated by removal — the test config has no undeclared-dependency path. **T-01-SC** (package installs): explicitly no new dependency; no install ran.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The headless boundary is now enforced at both layers for the **entire** headless surface (`src/sim` + `src/config`); `tsconfig.sim.json` and the ESLint boundary block name the same directories. Later phases adding headless trees (e.g. `src/host`) should keep the two selectors in lockstep.
- `vitest.config.ts` is internally consistent; coverage can be re-introduced deliberately (provider dependency + `test:coverage` script together) if a later phase needs it.
- No blockers. `pnpm run typecheck` (both projects), `pnpm run lint`, `pnpm test` (51), and `pnpm gate` (3) are all green.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `eslint.config.js`, `vitest.config.ts`
- FOUND: commits `cb2e0dc`, `19dbb53`
- VERIFIED: `eslint --print-config src/config/sim.ts` resolves the boundary rules; `vitest.config.ts` declares no coverage provider; typecheck/lint/test/gate all green
