---
phase: 01-foundation-deterministic-sim-core
plan: 07
subsystem: sim-core
tags: [style-retrofit, d-12, jsdoc, convention-gate, documentation, vitest, node-fs, sim-02, sim-04, behavior-preserving]

# Dependency graph
requires: [01-06]
provides:
  - "Chinese JSDoc coverage on src/sim/core/** (clock/events/math/rng) and src/sim/content/formulas.ts — D-12 at the declaration level"
  - "tests/style/conventions.test.ts — runnable D-12 convention gate; scan roots ['src/sim/core', 'src/sim/content']; requires a /**-opened JSDoc block, @returns on every exported function, and @param when the signature has parameters"
  - "A gate that later D-12 plans (01-09/01-10/01-11/01-12) widen in lockstep with the dirs they document"
affects: [style-retrofit, review-remediation, physics, combat, ai, render, bridge]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff, .planning excluded).
actuals:
  tokens: 2514
  tasks: 2
  commits: 2
  plan_head_before: 7108b1712bd9d6ca4caff35c72b5fe7b01170582

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural convention gate (D-12): a Vitest test walks declared scan roots with node:fs, finds each top-level `export` declaration line, and asserts the immediately-preceding comment block opens with `/**` (a plain block comment fails); exported functions additionally need `@returns` and, when parameterized, `@param`."
    - "The gate's declared scan roots are the source of truth for 'documented set': later plans append their directory exactly when its docs land, so the gate is never green over undocumented files."
    - "Scoped Node types via `/// <reference types=\"node\" />` for a single test file, rather than widening tsconfig types project-wide."

key-files:
  created:
    - tests/style/conventions.test.ts
  modified:
    - src/sim/core/math.ts
    - src/sim/core/rng.ts

key-decisions:
  - "Only math.ts (clamp) and rng.ts (xmur3/mixSeed/makeSfc32) needed new @param/@returns; clock.ts, events.ts and content/formulas.ts already satisfied D-12 at the declaration level, so they were left untouched (docs are comment-only)."
  - "The gate checks top-level exported declarations structurally (block presence + `/**` opener + tag presence) rather than parsing the AST — deterministic, zero-dependency, and intentionally coarse: member-level D-12 coverage is the human doc pass, the gate guards against regression."
  - "The `/**` opener test uses startsWith('/**'), which accepts single-line JSDoc (`/** … */`) and rejects plain `/* … */` — matching the plan's acceptance criterion that only `/**` opens a valid doc block."
  - "Added a scoped `/// <reference types=\"node\" />` to the gate test because TS 7 (native) no longer auto-includes @types/node, which made `node:fs`/`node:path`/`process` typecheck failures."
  - "The gate file documents itself (D-12) even though it is not in its own scan roots yet; Plan 01-12 brings tests/** into the scanned set."

patterns-established:
  - "A convention retrofittable across several plans is enforced by one gate whose scan roots are widened plan-by-plan, so the gate is always exactly as strict as the documentation that exists."
  - "Behavior-preserving doc passes are verified by the existing determinism gate (pnpm gate) plus typecheck/lint/test, not by new behavior assertions."

requirements-completed: [SIM-04, SIM-02]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Every declaration under src/sim/core/** and src/sim/content/** carries Chinese JSDoc; every function documents all @param's and its @returns (D-12)."
    requirement: "SIM-02"
    verification:
      - kind: other
        ref: "pnpm run typecheck (tsconfig.json + tsconfig.sim.json) exit 0"
        status: pass
      - kind: unit
        ref: "tests/style/conventions.test.ts — '每个顶层导出声明都有合法 JSDoc 覆盖' passes over ['src/sim/core','src/sim/content']"
        status: pass
    human_judgment: false
  - id: D2
    description: "An automated D-12 gate exists at tests/style/conventions.test.ts, requires a /**-opened doc block, rejects a plain block comment, and requires @param/@returns on exported functions — ready to be widened by Plans 01-09…01-12."
    requirement: "SIM-04"
    verification:
      - kind: unit
        ref: "tests/style/conventions.test.ts (5 tests) incl. rule self-tests: accepts /**, rejects plain block comment, rejects no comment, parses empty + multi-line parameter lists"
        status: pass
      - kind: other
        ref: "pnpm run lint exit 0; pnpm test 56 passed (9 files); pnpm gate 3 passed"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 07: D-12 JSDoc Coverage + Convention Gate Summary

**Chinese JSDoc with `@param`/`@returns` on `src/sim/core/**` (clock/events/math/rng) and `src/sim/content/formulas.ts`, plus a runnable Vitest D-12 gate (`tests/style/conventions.test.ts`) that requires `/**`-opened doc blocks and fails on undocumented exported declarations — behavior-preserving (typecheck/lint/test/gate all green, fingerprints unchanged).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-15T14:06:19Z
- **Completed:** 2026-10-15T14:13:00Z
- **Tasks:** 2 (both `type="auto"`; no checkpoints)
- **Files modified:** 3 (2 source documented + 1 test created)

## Accomplishments

- **Task 1 (D-12 docs on the leaf modules)** — added Chinese JSDoc `@param`/`@returns` where missing: `clamp` (`math.ts`, all three params + return) and `xmur3`/`mixSeed`/`makeSfc32` (`rng.ts`). `clock.ts`, `events.ts` and `content/formulas.ts` were audited and already satisfied D-12 at the declaration level, so they were left untouched. Comment-only diff (24 insertions, 3 deletions).
- **Task 2 (the convention gate)** — created `tests/style/conventions.test.ts`: walks a single exported `SCAN_ROOTS = ['src/sim/core', 'src/sim/content']` with `node:fs`, finds every top-level `export` declaration (`class|interface|enum|function|type|const`, incl. `abstract class`), and asserts the nearest preceding non-empty line closes a comment block whose opening line begins with `/**` (a plain block comment is rejected). Exported `function`s must carry `@returns` and, when the (possibly multi-line) signature has parameters, at least one `@param`. Failures report `file:line: message — declaration`. Four self-tests pin the rule behavior (accepts `/**`, rejects a plain block comment, rejects no comment, parses empty vs. multi-line parameter lists). The file is itself D-12-documented in preparation for Plan 01-12.
- **Non-vacuous + behavior-preserving** — the gate's scan test passes over the documented set (5 tests total), and the doc-only pass left the determinism gate green (`pnpm gate`, fingerprint trace `ed670b76a9019` unchanged) and `pnpm test` at 56 passed (up from 51 — the +5 are the new gate's tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: `@param`/`@returns` JSDoc on sim/core math + rng (D-12)** - `15dd29f` (docs)
2. **Task 2: D-12 JSDoc convention gate (`tests/style/conventions.test.ts`)** - `5f1bb3a` (test)

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

## Files Created/Modified

- `src/sim/core/math.ts` — `clamp` now documents `@param {value}`, `@param {min}`, `@param {max}` and `@returns`.
- `src/sim/core/rng.ts` — `xmur3`, `mixSeed` and `makeSfc32` now document their parameters and return values.
- `tests/style/conventions.test.ts` — **new**; the D-12 JSDoc convention gate (`SCAN_ROOTS`, structural doc-block + `/**`-opener + `@param`/`@returns` checks, deterministic violations) plus rule self-tests. Uses `node:fs`/`node:path` under Vitest's `environment: 'node'`.

## Decisions Made

- **Scope was smaller than the plan's file list implied:** `clock.ts`, `events.ts` and `content/formulas.ts` already carried declaration-level Chinese JSDoc (interface/class/member/function docs with `@param`/`@returns`) from earlier plans, so Task 1 edited only `math.ts` and `rng.ts`. The plan's objective is "add docs where missing"; it was satisfied without touching already-documented files.
- **The gate is structural, not AST-based:** it checks block presence, the `/**` opener, and tag presence — deterministic, dependency-free (only `node:fs` + Vitest), and non-flaky. It deliberately guards *regression* of documented top-level exports; full member-level coverage remains the human doc pass across Plans 01-07…01-12.
- **`/**`-opener test uses `startsWith('/**')`:** this accepts single-line JSDoc (`/** … */`) while rejecting a plain `/* … */` block, matching the plan's stated acceptance criterion.
- **Gate test documents itself now:** although `tests/**` is not yet in `SCAN_ROOTS`, Plan 01-12 adds it, so the file already satisfies D-12 (every helper + the exported constant is JSDoc'd, functions carry `@param`/`@returns`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a scoped `/// <reference types="node" />` to the gate test**
- **Found during:** Task 2 (creating `tests/style/conventions.test.ts`)
- **Issue:** `pnpm run typecheck` failed with `TS2591: Cannot find name 'node:fs' / 'node:path' / 'process'`. TS 7 (native, the toolchain pinned by D-07) no longer auto-includes `@types/node` when `types` is unspecified in `tsconfig.json`, even though `@types/node@26.6.5` is installed.
- **Fix:** Added a single-file `/// <reference types="node" />` directive at the top of `tests/style/conventions.test.ts` (after the module JSDoc, before the imports). This supplies Node ambient types to exactly this file and leaves the shared `tsconfig.json` untouched (no project-wide `types` change that could disturb the DOM-lib/`@types/node` relationship elsewhere).
- **Files modified:** `tests/style/conventions.test.ts`
- **Verification:** `pnpm run typecheck` exit 0 (both projects); `pnpm exec eslint tests/style/conventions.test.ts` exit 0.
- **Committed in:** `5f1bb3a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the typecheck to pass under the project's TS 7 toolchain; no scope creep, no behavior change.

## Issues Encountered

- TS 7's changed `@types` auto-inclusion behavior (above) was the only surprise. `@types/node` exists in `node_modules`; the fix is scoped to the one test file that needs Node builtins.

## Known Stubs

- None introduced. This is a comment-only source pass plus one test file; no runtime surface changed.

## Threat Flags

None — no new network/auth/file/schema runtime surface. **T-01-01** (doc change → behavior/determinism): mitigated — comment-only edits; the verify re-ran `pnpm test` + `pnpm gate` and fingerprints are unchanged. **T-01-03** (`fingerprint()` docs): unchanged (disposition=accept). **T-01-SC** (package installs): no dependency change — the gate uses only `node:fs`/`node:path` and Vitest.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/sim/core/**` and `src/sim/content/**` are D-12-compliant, and the gate that proves it is committed and green.
- The gate is built to be widened: Plans 01-09/01-10/01-11/01-12 append their directory to `SCAN_ROOTS` at the same moment they document it, keeping the gate exactly as strict as the shipped docs.
- No blockers. `pnpm run typecheck` (both projects), `pnpm run lint`, `pnpm test` (56), and `pnpm gate` (3) are all green.

---

*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `tests/style/conventions.test.ts`, `src/sim/core/math.ts`, `src/sim/core/rng.ts`
- FOUND: commits `15dd29f`, `5f1bb3a`
- VERIFIED: typecheck exit 0; lint exit 0; `pnpm test` 56 passed; `pnpm gate` 3 passed
