---
phase: "1"
slug: "foundation-deterministic-sim-core"
status: ready
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-15"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

> **Reconciled (revision):** the Per-Task Verification Map now matches the final four-plan set
> (01-01 toolchain+removal / 01-02 tracer / 01-03 expansion / 01-04 gate). Wave 0 is owned by
> Plan 01-01 Task 1; every non-checkpoint task carries an automated `<verify>`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (Node ≥22.12, Vite 8) |
| **Config file** | `vitest.config.ts` — does not exist yet; created in Wave 0 (Plan 01-01 Task 1) |
| **Quick run command** | `pnpm vitest run tests/sim` |
| **Full suite command** | `pnpm test` (i.e. `vitest run`) |
| **Gate command** | `pnpm gate` (i.e. `vitest run tests/determinism`) |
| **Estimated runtime** | ~15–30 seconds (unit + determinism gate) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run tests/sim`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** `pnpm gate && pnpm test` must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | SIM-01, SIM-03 | T-01-SC | Bleeding-edge toolchain installs under the TS6/TS7 side-by-side layout; predecessor `src/**` tree + `index.html` removed so `typecheck`/`lint` run clean | toolchain (typecheck + lint) | `pnpm run typecheck; pnpm run lint` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01-01 | 1 | — | T-01-SC | Human approves the bleeding-edge package set before install is trusted | manual (`checkpoint:human-verify`, blocking) | — (checkpoint by design, not automated) | ❌ W0 | ⬜ pending |
| 01-02-01 | 01-02 | 2 | SIM-01, SIM-03 | T-01-01 | Full sim runs headless (Node env, no DOM, no clock); seeded fixed-step state evolves and is reproducible; DOM-free typecheck passes | integration | `pnpm run typecheck && pnpm vitest run tests/sim/headless.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 3 | SIM-02 | T-01-01 | Named seeded streams only; independent + `save`/`restore` round-trip; unknown stream name throws | unit | `pnpm vitest run tests/sim/rng.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 3 | SIM-02, SIM-03 | T-01-05 | Typed commands drained exactly once/tick; unknown `kind` rejected deterministically (no silent no-op) | unit | `pnpm vitest run tests/sim/commands.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-03 | 01-03 | 3 | SIM-01 | — | Fixed-step pacing (step count, spike clamp, debt-drop, alpha); `sim/**` boundary rules resolve in lint + DOM-free typecheck | unit + static lint | `pnpm vitest run tests/sim/clock.test.ts tests/host/loop.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 01-04 | 4 | SIM-04 | T-01-04 | `fingerprint(restore(serialize(s))) === fingerprint(serialize(s))`; every mutator moves the fingerprint | unit | `pnpm vitest run tests/sim/snapshot.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-02 | 01-04 | 4 | SIM-04 | T-01-04 | Same seed twice → identical per-tick trace; different seed → different; state evolves; `entityId`/iteration order stable | integration | `pnpm gate && pnpm vitest run tests/sim/entity-store.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-03 | 01-04 | 4 | SIM-04 | — | Pre-commit gate wired (`core.hooksPath` == `.githooks`); refuses commit on divergence; no CI added | config check | `pnpm gate` (+ `core.hooksPath` equality assertion) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` toolchain install — side-by-side TS6/TS7 layout, Vite 8, Vitest 5, ESLint 10, Prettier; `typecheck`/`test`/`gate`/`lint` scripts (D-07/D-08) — **Plan 01-01 Task 1**
- [ ] Remove the discarded predecessor tree (`index.html` + all tracked files under `src/**`) so the new boundary type-checks (CONTEXT.md "src/ 与 model/ 全部重写"); `model/` + `requirements.txt` deferred (not tsc-checked) — **Plan 01-01 Task 1**
- [ ] `tsconfig.json` (base) + `tsconfig.sim.json` (DOM-free, `lib:["ESNext"]`, `types:[]`, explicit `rootDir`, includes `src/sim` + `src/config`) — **Plan 01-01 Task 1**
- [ ] `src/config/sim.ts` — central `FIXED_DT`/`AI_INTERVAL`/`DEFAULT_SEED`/`MAX_FRAME`/`MAX_STEPS` (also the non-empty tsc input after removal) — **Plan 01-01 Task 1**
- [ ] `eslint.config.js` — flat config with `sim/**` boundary rules (no DOM imports; ban `Math.random`/`Date.now`) — **Plan 01-03 Task 3**
- [ ] `vitest.config.ts` — `environment: 'node'`, include `tests/**` — **Plan 01-01 Task 1**
- [ ] `tests/helpers/run-sim.ts` — headless trace runner (shared by SIM-03/SIM-04) — **Plan 01-04 Task 2**
- [ ] `tests/sim/*.test.ts` and `tests/determinism/gate.test.ts` scaffolds — **Plans 01-02, 01-03, 01-04**
- [ ] `.githooks/pre-commit` + `git config core.hooksPath .githooks` (D-09) — **Plan 01-04 Task 3**
- [ ] `.prettierrc` carried over from the old repo verbatim (4-space, single quotes, no trailing comma, arrow-parens avoid) — **Plan 01-01 Task 1 (kept unchanged)**
- [ ] `.gitignore` check — confirm `checkpoint/`, `video/`, `dist/`, `coverage/` ignored; add any external output dir (D-10) — **Plan 01-01 Task 1**

*No existing test infrastructure exists — the old repo had none; everything is Wave 0 (Plan 01-01 onward).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bleeding-edge package set approval (T-01-SC) | — | Cannot be automated: a human must confirm the install list against the Package Legitimacy Audit before install is trusted | Plan 01-01 Task 2 — open RESEARCH `## Package Legitimacy Audit`, confirm each package's source repo/publisher, reply `approved` |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the single human-verify checkpoint is exempt by design)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
