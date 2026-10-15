---
phase: "1"
slug: "foundation-deterministic-sim-core"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-15"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (Node ≥22.12, Vite ≥6.4) |
| **Config file** | `vitest.config.ts` — does not exist yet; created in Wave 0 |
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
| 01-01-01 | 01-01 | 1 | SIM-01 | — | N/A | unit | `pnpm vitest run tests/sim/clock.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01-01 | 1 | SIM-01 | — | Accumulator turns wall/frame budget into whole `DT` steps; clamps spikes; caps steps/frame | unit | `pnpm vitest run tests/host/loop.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 01-02 | 2 | SIM-02 | T-01-01 | Seeded streams only; no `Math.random`/wall-clock in `sim/**` | unit + static lint | `pnpm vitest run tests/sim/rng.test.ts && pnpm lint` | ❌ W0 | ⬜ pending |
| 01-02-02 | 01-02 | 2 | SIM-03 | — | Full sim runs headless (Node env, no DOM, no clock) | integration | `pnpm vitest run tests/sim/headless.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 01-02 | 2 | SIM-03 | — | `sim/**` imports no DOM/node/pixi (module graph guard) | static lint + typecheck | `pnpm lint && pnpm typecheck` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 3 | SIM-04 | T-01-02 | Same seed twice → identical per-tick fingerprint trace; different seed → different; state evolves | integration | `pnpm vitest run tests/determinism` | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 3 | SIM-04 | T-01-02 | `fingerprint(restore(serialize(s))) === fingerprint(serialize(s))`; every mutator moves the fingerprint | unit | `pnpm vitest run tests/sim/snapshot.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-03 | 01-03 | 3 | SIM-02/D-04/D-05 | — | `entityId` monotonic; iteration order stable across spawn/despawn (no Map reorder) | unit | `pnpm vitest run tests/sim/entity-store.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` toolchain install — side-by-side TS6/TS7 layout, Vite 8, Vitest 5, ESLint, Prettier; `typecheck`/`test`/`gate`/`lint` scripts (D-07/D-08)
- [ ] `tsconfig.json` (base) + `tsconfig.sim.json` (DOM-free, `lib:["ESNext"]`, `types:[]`, explicit `rootDir`)
- [ ] `eslint.config.js` — flat config with `sim/**` boundary rules (no DOM imports; ban `Math.random`/`Date.now`)
- [ ] `vitest.config.ts` — `environment: 'node'`, include `tests/**`
- [ ] `tests/helpers/run-sim.ts` — headless trace runner (shared by SIM-03/SIM-04)
- [ ] `tests/sim/*.test.ts` and `tests/determinism/gate.test.ts` scaffolds
- [ ] `.githooks/pre-commit` + `git config core.hooksPath .githooks` (D-09)
- [ ] `.prettierrc` carried over from the old repo (4-space, single quotes, no trailing comma, arrow-parens avoid)
- [ ] `.gitignore` check — confirm `checkpoint/`, `video/`, `dist/`, `coverage/` ignored; add any external output dir (D-10)

*No existing test infrastructure exists — the old repo had none; everything is Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | — | All phase behaviors have automated verification. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
