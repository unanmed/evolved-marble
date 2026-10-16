---
phase: 02-physics-composite-units
plan: 01
subsystem: physics
tags: [rapier2d, wasm, deterministic, vitest, physics-constants, exact-pin]

# Dependency graph
requires:
  - phase: 01-foundation-deterministic-sim-core
    provides: headless fixed-step sim core, canonical snapshot/fingerprint primitives, Node-only Vitest determinism gate
provides:
  - "@dimforge/rapier2d-deterministic-compat@0.21.0 exact-pinned in package.json + pnpm-lock.yaml"
  - "idempotent WASM entry point initPhysics() + rapierVersion() (src/sim/world/physics-init.ts)"
  - "version smoke test + recorded GOLDEN_RAPIER_FINGERPRINT same-machine drift canary (tests/determinism/rapier-version.test.ts)"
  - "single-source engine physics constants (src/config/sim.ts)"
  - "single-source content physics constants (src/sim/content/physics.ts)"
  - "shared Vitest setupFiles invoking initPhysics() once (tests/helpers/physics-setup.ts + vitest.config.ts)"
affects: [02-02, 02-03, 02-04, 02-05, phase-3-content-tables, phase-5-render]

# Actuals (#2632) — pairs with the plan's `estimate` (52000 tokens / 3 tasks / confidence low).
actuals:
  tokens: 2400
  tasks: 3
  commits: 2
plan_head_before: 65b90bdc86b8be74ea9c14c8726d36198ce6fafc

# Tech tracking
tech-stack:
  added:
    - "@dimforge/rapier2d-deterministic-compat@0.21.0 (Rapier2D deterministic WASM, base64-inlined, exact pin)"
  patterns:
    - "Idempotent module-level init latch — the one deliberate mutable-state exception (D-21)"
    - "Engine constants in src/config/sim.ts; content-driven values in src/sim/content/physics.ts (single source, D-06)"

key-files:
  created:
    - src/sim/world/physics-init.ts
    - src/sim/content/physics.ts
    - tests/helpers/physics-setup.ts
    - tests/determinism/rapier-version.test.ts
  modified:
    - src/config/sim.ts
    - vitest.config.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "D-18 literal-string substitution: @dimforge/rapier2d-deterministic -> @dimforge/rapier2d-deterministic-compat (ships byte-identical deterministic WASM but resolves under plain Node, which the Node-only gate D-22 needs) — EXPLICITLY USER-APPROVED at the legitimacy checkpoint"
  - "GOLDEN_RAPIER_FINGERPRINT = e1b1f66b73551 recorded as a same-machine version-drift canary (D-19); update only on an intentional Rapier version bump"
  - "D-32 one-way rating reaffirmed (1 world unit = 1 metre on a 1000×1000 m map) — recorded, not re-asked"
  - "Node-only WASM strategy confirmed (D-23): -compat needs no bundler plugin, no .wasm asset config, and no vite-plugin-wasm"

patterns-established:
  - "Async WASM init is the sole async step in the sim stack; PhysicsWorld construction stays synchronous thereafter (D-21)"
  - "Shared Vitest setupFiles performs the one-time initPhysics(); individual physics tests need no per-file beforeAll"

requirements-completed: [PHYS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Rapier2D deterministic build installed at an exact pin (no ^/~) and recorded in the lockfile; initPhysics() is an idempotent, async WASM entry point that lets a World be constructed synchronously afterwards."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/determinism/rapier-version.test.ts#版本被精确钉定（版本变更即硬失败）"
        status: pass
      - kind: unit
        ref: "tests/determinism/rapier-version.test.ts#initPhysics() 幂等：二次调用无错 resolve（D-21）"
        status: pass
      - kind: unit
        ref: "tests/determinism/rapier-version.test.ts#初始化后可在 Node 下构造并步进 World（D-22）"
        status: pass
    human_judgment: false
  - id: D2
    description: "Version smoke test emits and asserts a golden snapshot fingerprint (same-machine version-drift canary), stable across two in-process constructions."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/determinism/rapier-version.test.ts#golden 指纹跨两次进程内构造稳定且等于记录值（D-19）"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every new physics constant has a single source: engine values in src/config/sim.ts, content values in src/sim/content/physics.ts (both import-free; sim-boundary lint clean)."
    requirement: "PHYS-03"
    verification:
      - kind: automated
        ref: "pnpm run lint (sim-boundary no-restricted-* block over src/sim/** + src/config/**)"
        status: pass
      - kind: automated
        ref: "pnpm run typecheck (tsconfig.json + DOM-free tsconfig.sim.json)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Shared Vitest setup calls initPhysics() once for the whole suite; the determinism gate stays green with the setup wired."
    requirement: "PHYS-03"
    verification:
      - kind: integration
        ref: "pnpm gate (vitest run tests/determinism) — 7 passed with setupFiles active"
        status: pass
      - kind: integration
        ref: "pnpm test — 10 files / 60 tests passed with setupFiles active"
        status: pass
    human_judgment: false
  - id: D5
    description: "Human legitimacy gate for the [SUS]/too-new Rapier package AND explicit approval of the D-18 variant substitution (-deterministic -> -deterministic-compat) before install."
    verification: []
    human_judgment: true
    rationale: "The install is gated on a human judgement about third-party package provenance and a locked-decision substitution; the user typed 'approved' after read-only registry verification (official Dimforge repo, no postinstall, not deprecated, SLSA provenance). No automation can certify package legitimacy."

# Metrics
duration: 5 min
completed: 2026-10-16
status: complete
---

# Phase 2 Plan 01: Rapier2D Foundation Summary

**Exact-pinned `@dimforge/rapier2d-deterministic-compat@0.21.0` (D-18 substitution, user-approved), an idempotent `initPhysics()` WASM gate, single-source engine + content physics constants, and a version smoke test with a recorded same-machine golden fingerprint.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-16T14:34:00Z (approx)
- **Completed:** 2026-10-16T14:39:00Z (approx)
- **Tasks:** 3 (Task 1 = human-approval gate, satisfied; Tasks 2–3 executed & committed)
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- Installed `@dimforge/rapier2d-deterministic-compat@0.21.0` **exact-pinned** (`--save-exact`, no `^`/`~`) and locked it in `pnpm-lock.yaml` — the deterministic Rapier build PHYS-03 mandates.
- Added `src/sim/world/physics-init.ts` with the sole idempotent async WASM entry point (`initPhysics()` / `rapierVersion()`); `BattleSim.step()` remains purely synchronous (D-21).
- Added `tests/determinism/rapier-version.test.ts`: version hard-fail, idempotence, Node World step, and a golden snapshot fingerprint (`e1b1f66b73551`) stable across two in-process constructions (D-19/D-22).
- Consolidated all new physics numbers into single sources: engine constants in `src/config/sim.ts`, content test-values in `src/sim/content/physics.ts` (both import-free; sim-boundary lint clean).
- Wired the shared `await initPhysics()` test setup into `vitest.config.ts` `setupFiles`, so individual physics tests need no per-file init.

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: Verify Rapier package legitimacy (checkpoint:human-verify, gate=blocking-human)** — no commit (checkpoint task); resolved by user's `approved` response, incl. the D-18 `-compat` substitution.
2. **Task 2: Install exact-pinned Rapier deterministic build + idempotent init** — `97964a6` (feat)
3. **Task 3: Single-source physics constants + shared test setup** — `4b47ef2` (feat)

**Plan metadata:** `(this commit)` (docs: complete plan)

## Files Created/Modified
- `package.json` — added `"@dimforge/rapier2d-deterministic-compat": "0.21.0"` (exact pin, no caret).
- `pnpm-lock.yaml` — records `@dimforge/rapier2d-deterministic-compat@0.21.0`.
- `src/sim/world/physics-init.ts` — `initPhysics()` (idempotent latch) + `rapierVersion()`; Chinese JSDoc with `@returns`.
- `tests/determinism/rapier-version.test.ts` — version smoke + golden fingerprint canary (4 tests).
- `src/config/sim.ts` — engine constants `WORLD_WIDTH/HEIGHT`, `GRAVITY_X/Y`, `RESTITUTION`, `LINEAR_DAMPING`, `ANGULAR_DAMPING`, `SAFETY_BELT_MARGIN`, `MAX_CCD_SUBSTEPS`.
- `src/sim/content/physics.ts` — content test-values: body/armor/weapon geometry + mass, swing amplitude/angular speed, collision-group bits.
- `tests/helpers/physics-setup.ts` — shared `await initPhysics()` setup.
- `vitest.config.ts` — `setupFiles: ['tests/helpers/physics-setup.ts']`, `environment: 'node'` unchanged.

## Decisions Made
- **D-18 literal-string substitution (user-approved):** installed `@dimforge/rapier2d-deterministic-compat` instead of the literal `@dimforge/rapier2d-deterministic`. Both ship **byte-identical** deterministic WASM (research verified SHA-256 identity), but `-compat` exposes `init()` and resolves under plain Node — required by the Node-only gate (D-22). The future cross-machine upgrade path (D-17) stays zero-cost (same WASM).
- **Golden fingerprint recorded:** `GOLDEN_RAPIER_FINGERPRINT = 'e1b1f66b73551'` for a fixed raw-world scenario (single dynamic ball, no RNG, 60 steps). Documented as a **same-machine** version-drift canary — it intentionally carries no wall-clock/host input.
- **D-32 reaffirmed, not re-asked:** 1 world unit = 1 metre; the one-way rating is recorded for the record.
- **D-23 WASM strategy:** `-compat` needs no `vite-plugin-wasm`, no top-level-await plugin, and no `.wasm` asset config.

## Deviations from Plan

### Plan-sanctioned deviation (recorded, approved)

**1. [Rule 4-class — architectural substitution, user-approved] D-18 package string changed to the `-compat` variant**
- **Found during:** Task 1 (checkpoint:human-verify) / Task 2 (install)
- **Issue:** CONTEXT D-18 locked the literal package string `@dimforge/rapier2d-deterministic`, but D-23 delegated the WASM variant choice to research. The raw `-deterministic` build statically imports a `.wasm` file, exposes **no `init()`**, and **cannot be resolved by plain Node** — incompatible with the Node-only determinism gate (D-22).
- **Fix:** Install `@dimforge/rapier2d-deterministic-compat@0.21.0` (byte-identical deterministic WASM; exposes `init()`; resolves under plain Node). This revises the literal string but not the intent (the deterministic **build** is what PHYS-03 mandates).
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** user typed `approved` at the blocking-human legitimacy checkpoint after read-only registry verification; the version smoke test asserts `'0.21.0'`.
- **Committed in:** `97964a6` (Task 2 commit)

---

**Total deviations:** 1 (plan-sanctioned, explicitly user-approved — not an auto-fix)
**Impact on plan:** No scope creep. The substitution was pre-anticipated by the plan and folded into the checkpoint it mandated; it keeps the Node-only gate working with strictly less build machinery.

## Issues Encountered
None. All plan-level verification commands passed:
- `pnpm run typecheck` — 0 (both `tsconfig.json` and `tsconfig.sim.json`)
- `pnpm run lint` — 0 (sim-boundary block clean)
- `pnpm gate` (`vitest run tests/determinism`) — 7 passed
- `pnpm test` — 10 files / 60 tests passed
- `package.json` grep — `"@dimforge/rapier2d-deterministic-compat": "0.21.0"` (no `^`/`~`)

## User Setup Required
None — the legitimacy checkpoint was satisfied inline; no external service configuration.

## Next Phase Readiness
- The deterministic Rapier build is installed, exact-pinned, and version-guarded; later plans (02-02 tracer and beyond) can construct a `PhysicsWorld` synchronously in Node after `await initPhysics()`.
- Single-source constants are in place for the composite factory (`BODY_*`/`ARMOR_*`/`WEAPON_*`/swing/group bits) and the world (`WORLD_*`/gravity/damping/safety-belt/CCD).
- The shared Vitest setup means the physics suite is gate-ready with no per-file init.
- **Note for 02-02+:** the golden fingerprint `e1b1f66b73551` is a raw-world `takeSnapshot()` canary only; the sim-level dual-fingerprint gate (D-20) lands with the physics-enabled sim in later plans.

---
*Phase: 02-physics-composite-units*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Created files verified on disk: `src/sim/world/physics-init.ts`, `src/sim/content/physics.ts`, `tests/helpers/physics-setup.ts`, `tests/determinism/rapier-version.test.ts`, `02-01-SUMMARY.md`.
- Commits verified: `97964a6` (Task 2), `4b47ef2` (Task 3), `c49c8d4` (SUMMARY/metadata).
- `pnpm run typecheck`, `pnpm run lint`, `pnpm gate`, `pnpm test` all exit 0.
- `package.json` pin has no `^`/`~`; `pnpm-lock.yaml` records `0.21.0`.
