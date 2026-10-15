---
phase: 01-foundation-deterministic-sim-core
plan: 01
subsystem: infra
tags: [toolchain, typescript, vite, vitest, eslint, determinism, headless, tsconfig, pnpm]

# Dependency graph
requires: []
provides:
  - "pnpm side-by-side TS6/TS7 toolchain layout (effective `tsc` = native TypeScript 7, `tsc6` = TS6 compiler API for typescript-eslint)"
  - "package.json scripts typecheck/test/test:watch/gate/lint — the single entry point every later plan's <verify> calls"
  - "DOM-free sim project boundary (tsconfig.sim.json) type-checking src/sim + src/config independently of the DOM base project"
  - "central sim config constants (src/config/sim.ts): FIXED_DT, AI_INTERVAL, DEFAULT_SEED, MAX_FRAME, MAX_STEPS"
  - "predecessor TS/Vue tree (src/**) + index.html removed, so the new boundary type-checks cleanly"
affects: [01-02, 01-03, 01-04, physics, combat, ai, rendering, bridge]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized source diff, generated pnpm-lock.yaml excluded).
actuals:
  tokens: 23625
  tasks: 2
  commits: 1
  plan_head_before: e4395c216d8481b91fc3bc3f13c10c3515311d40

# Tech tracking
tech-stack:
  added:
    - "@typescript/native@^7.0.2 (aliased as typescript) — native `tsc`"
    - "@typescript/typescript6@^6.0.2 (aliased as `typescript` for the lint compiler API; `tsc6` bin)"
    - "vite@^8.3.4 (rolldown) — key names build.rolldownOptions/oxc"
    - "vitest@^5.0.4 (node environment)"
    - "eslint@^10.12.0 + typescript-eslint@^8.71.2 + @eslint/js@^10.0.1 + globals@^17.13.0"
    - "prettier@^3.9.10 + eslint-plugin-prettier@^5.5.7"
    - "@types/node@^26.6.5"
  patterns:
    - "pnpm side-by-side TS7(native)+TS6(lint API) layout (RESEARCH Pitfall 1/2)"
    - "Type-level headless boundary: tsconfig.sim.json with lib:[\"ESNext\"], types:[], no DOM (D-03/SIM-03)"
    - "Deterministic config constants centralised in one data-only module, no imports (D-01)"

key-files:
  created:
    - tsconfig.sim.json
    - vitest.config.ts
    - src/config/sim.ts
  modified:
    - package.json
    - tsconfig.json
    - vite.config.ts
    - eslint.config.js
    - .gitignore
    - pnpm-lock.yaml
  removed:
    - index.html
    - src/body/*, src/map/*, src/scene/*, src/train/*, src/utils/*
    - src/main.tsx, src/renderer.ts, src/setup.ts, src/workflow.ts, src/common.ts, src/styles.css, src/vite-env.d.ts

key-decisions:
  - "TS7 removed `baseUrl`; the `@/*` alias is expressed as a relative `paths` entry (`./src/*`) instead — dropped the now-unused baseUrl."
  - "model/ + requirements.txt (Python) deliberately NOT removed this plan — tsc never checks them and the Python side is rebuilt in a later bridge/training phase (stated in the plan objective)."
  - ".prettierrc kept verbatim (4-space, single quotes, no trailing comma, arrow-parens avoid)."
  - "Toolchain package set approved by the human at the Task 2 blocking-human checkpoint (T-01-SC)."

patterns-established:
  - "Config/tooling only: all later verifies route through `pnpm run typecheck` / `lint` / `test` / `gate`."
  - "DOM-free core boundary enforced at the tsconfig layer before any sim code exists."

requirements-completed: [SIM-01, SIM-03]

coverage:
  - id: D1
    description: "Bleeding-edge toolchain installed under the official side-by-side TS6/TS7 layout (Vite 8 / Vitest 5 / ESLint 10); `pnpm run typecheck` and `pnpm run lint` run clean."
    requirement: "SIM-01"
    verification:
      - kind: other
        ref: "pnpm run typecheck; pnpm run lint (run by prior executor at Task 1 commit faf12cb)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Discarded predecessor TS/Vue tree (src/**) and its index.html entry removed — no tracked file under src/ imports vue/@motajs/client."
    requirement: "SIM-01"
    verification:
      - kind: other
        ref: "git ls-files src (only src/config/sim.ts); git ls-files index.html (empty)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DOM-free sim project boundary (tsconfig.sim.json) plus the central sim config constants (src/config/sim.ts) exist and type-check independently."
    requirement: "SIM-03"
    verification:
      - kind: unit
        ref: "pnpm run typecheck (tsconfig.sim.json DOM-free project); src/config/sim.ts exports FIXED_DT/AI_INTERVAL/DEFAULT_SEED/MAX_FRAME/MAX_STEPS"
        status: pass
    human_judgment: false
  - id: D4
    description: "Human approval of the bleeding-edge package set before the install is trusted (T-01-SC, package-legitimacy checkpoint)."
    verification: []
    human_judgment: true
    rationale: "Supply-chain legitimacy of bleeding-edge pins is a human security judgement against the RESEARCH Package Legitimacy Audit; it is unautomatable by design and was satisfied by the user replying `approved`."

# Metrics
duration: 11min
completed: 2026-10-15
status: complete
---

# Phase 1 Plan 01: Toolchain Bootstrap, Predecessor Removal & Sim Config Summary

**Bleeding-edge toolchain (side-by-side TS7 native `tsc` + TS6 lint compiler, Vite 8, Vitest 5, ESLint 10) wired up, the discarded Vue/`@motajs/client` `src/**` tree + `index.html` cleared, and a DOM-free sim boundary plus central config constants seeded.**

## Performance

- **Duration:** ~11 min execution (plus human checkpoint wait for Task 2)
- **Started:** 2026-10-15 (after `e4395c2` docs(01): create phase plan)
- **Completed:** 2026-10-15
- **Tasks:** 2 (Task 1 auto; Task 2 blocking-human checkpoint — approved)
- **Files modified:** 30 (incl. `pnpm-lock.yaml`)

## Accomplishments

- Rewrote `package.json` for the new stack with the pnpm `packageManager` pin and Node `>=22.12.0` engine floor; scripts `typecheck` (base + sim projects), `test`, `test:watch`, `gate`, `lint`; dropped the entire old dependency set.
- Wired the official side-by-side layout: `typescript` → `npm:@typescript/typescript6` (TS6 compiler API + `tsc6` bin) and `@typescript/native` → `npm:typescript` (native TS7 `tsc`).
- Added `tsconfig.sim.json` (DOM-free: `lib: ["ESNext"]`, `types: []`, `rootDir: src`, includes `src/sim/**` + `src/config/**`) — the type-level headless boundary (SIM-03).
- Slimmed `vite.config.ts` (removed the Vue JSX plugin + dead `/upload-frame`/`frame-end`/`ping` proxy), extended `eslint.config.js` ignores, and extended `.gitignore` (`coverage/`, research cache, D-10/D-11 note).
- Removed the discarded predecessor tree (`index.html` + all tracked files under `src/**`) so the new boundary type-checks — CONTEXT.md's "src/ 与 model/ 全部重写" applied to the TS tree.
- Seeded `src/config/sim.ts` with data-only constants (`FIXED_DT`, `AI_INTERVAL`, `DEFAULT_SEED`, `MAX_FRAME`, `MAX_STEPS`), which also keeps both tsconfig projects free of TS18003.
- Recorded the human approval of the bleeding-edge package set (Task 2, T-01-SC) — the sole blocking-human gate for this plan.

## Task Commits

1. **Task 1: Bootstrap the bleeding-edge toolchain, remove the predecessor tree, seed the sim config** - `faf12cb` (chore)
2. **Task 2: Approve the bleeding-edge toolchain package set (T-01-SC)** - checkpoint only, **no commit** — blocking-human gate; user replied `approved` (approval recorded here, install trusted thereafter).

**Plan metadata:** _(this SUMMARY.md commit)_ (docs: complete plan)

_Note: Task 2 is a `checkpoint:human-verify` by design; it produces no code, so it has no task commit._

## Files Created/Modified

- `package.json` — rewritten for the side-by-side TS6/TS7 toolchain; new scripts + Node floor; old deps dropped.
- `tsconfig.json` — dropped Vue `jsx`/`jsxImportSource`, added explicit `rootDir: src`, switched the `@/*` alias to a relative `paths` entry, widened `include` to `["src","tests"]`.
- `tsconfig.sim.json` — new DOM-free sim project boundary.
- `vitest.config.ts` — new; `test.environment: 'node'`, `test.include: ['tests/**/*.test.ts']`, v8 coverage scoped to `src/sim/**`.
- `vite.config.ts` — slimmed (Vue JSX plugin + dead proxy removed).
- `eslint.config.js` — extended `ignores` (`coverage`).
- `.gitignore` — extended (`coverage/`, research cache, D-10/D-11 external-output note).
- `src/config/sim.ts` — new; central sim config constants.
- Removed: `index.html` and the predecessor `src/**` tree.
- `pnpm-lock.yaml` — regenerated for the new dependency set.

## Decisions Made

- **TS7 `baseUrl` removal:** TypeScript 7 removed `baseUrl`; the `@/*` → `src/*` alias is now expressed as a relative `paths` entry (`./src/*`). (Auto-fixed — see Deviations.)
- **`model/` + `requirements.txt` deferred:** not removed this plan — `tsc` never checks the Python tree and the Python side is rebuilt in a later bridge/training phase. Stated explicitly in the plan objective to keep the Phase-1 diff focused.
- **`.prettierrc` kept verbatim**, unchanged, per plan.
- **Toolchain package set approved** at the Task 2 blocking-human checkpoint (T-01-SC); the RESEARCH Package Legitimacy Audit flagged several pins `SUS (too-new)` but all were dispositioned Approved (official source repos, no install scripts) and the human confirmed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS 7 removed `baseUrl` → switched `paths` to relative form**
- **Found during:** Task 1 (tsconfig rewrite)
- **Issue:** The plan said to keep the `@/*` → `src/*` path alias. TypeScript 7 no longer supports `baseUrl`, so the inherited alias config would not resolve and the config would not load as written.
- **Fix:** Expressed the alias as a relative `paths` entry (`"@/*": ["./src/*"]`) and dropped the now-unused `baseUrl`.
- **Files modified:** `tsconfig.json`
- **Verification:** `pnpm run typecheck` passes for both the base and sim projects.
- **Committed in:** `faf12cb` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the tsconfig to load/type-check under TS7. No scope creep.

## Issues Encountered

- None beyond the TS7 `baseUrl` deviation above. The toolchain install resolved cleanly under the side-by-side layout (no peer conflict), which was the primary RESEARCH risk (Pitfall 1/2).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `pnpm run typecheck` / `lint` / `test` / `gate` are now the stable verify surface every later plan calls (Plan 01-02 onward).
- The DOM-free boundary (`tsconfig.sim.json`) and `src/config/sim.ts` constants are in place for the Plan 01-02 headless fixed-step → fingerprint tracer.
- **Deferred (stated):** `model/` + `requirements.txt` (Python) removed when their replacement phase lands.
- No blockers. Wave 2 (Plan 01-02) is unblocked.

---
*Phase: 01-foundation-deterministic-sim-core*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `.planning/phases/01-foundation-deterministic-sim-core/01-01-SUMMARY.md`
- FOUND: `src/config/sim.ts`, `tsconfig.sim.json`, `vitest.config.ts`
- REMOVED: `index.html`; `git ls-files src` = `src/config/sim.ts` only
- FOUND: commit `faf12cb`
