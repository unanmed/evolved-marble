---
phase: "2"
slug: "physics-simulation"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-18"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` — already clean (Phase 1 repaired the `@` alias and removed the stale `setupFiles`); no Wave 0 repair needed |
| **Quick run command** | `pnpm test -- tests/physics` |
| **Full suite command** | `pnpm test` (currently 33 files / 332 tests, ~6 s) |
| **Estimated runtime** | ~1 s for the Phase 2 physics suite (8 files / 39 tests) |
| **Per-file prereq** | `await RAPIER.init()` in `beforeAll` (idempotent); dispose/free in `afterEach`/`afterAll` |

---

## Sampling Rate

- **After every task commit:** `pnpm test -- tests/physics`
- **After every plan wave:** `pnpm test` + `pnpm typecheck` (+ `pnpm lint`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 0 | PHYS-01..05 | T-02-01 / T-02-SC | Supply chain gated: exact `0.21.0` pin approved before install | infra | `pnpm typecheck` + package presence check | ✓ | green |
| 02-01-02 | 02-01 | 0 | PHYS-01..05 | T-02-02 / T-02-03 | WASM init + one World step headless under Vitest; objects freed | integration | `pnpm test -- tests/physics/rapier-harness.test.ts` | ✓ | green |
| 02-01-03 | 02-01 | 0 | PHYS-01..05 | T-02-SC | Deterministic seeded `IRng` helper, no new dependency | unit | `pnpm typecheck` | ✓ | green |
| 02-02-01 | 02-02 | 1 | PHYS-01..05 | T-02-04 | `src/physics/types.ts` declaration-only and gate-approved | static | `pnpm typecheck` | ✓ | green |
| 02-02-02 | 02-02 | 1 | PHYS-02 | T-02-05 / T-02-06 | `ColliderPart` numeric ordinals pinned; no engine handles leak | unit | `pnpm test -- tests/physics/types.test.ts` | ✓ | green |
| 02-03-01 | 02-03 | 2 | PHYS-03, PHYS-04 | T-02-07 / T-02-08 | `computeDamageMean`/`computeDamageReduction` finite, non-negative, sign-consistent | unit | `pnpm test -- tests/physics/damage.test.ts` | ✓ | green |
| 02-03-02 | 02-03 | 2 | PHYS-03, PHYS-04 | T-02-07 / T-02-08 | Hand-computed mean/reduction, jitter σ = mean/20, D-11 penetration proof | unit | `pnpm test -- tests/physics/damage.test.ts` | ✓ | green |
| 02-04-01 | 02-04 | 3 | PHYS-01, PHYS-05 | — | `DT = 1/60` and calibratable geometry constants | static | `pnpm typecheck` | ✓ | green |
| 02-04-02 | 02-04 | 3 | PHYS-01, PHYS-05 | T-02-09 / T-02-10 / T-02-11 / T-02-12 | Compound body, handle index purged before free, idempotent dispose, one step per tick | integration | `pnpm test -- tests/physics/compound.test.ts` | ✓ | green |
| 02-04-03 | 02-04 | 3 | PHYS-01, PHYS-05 | T-02-09..12 | Σ collider masses, re-registration clean, fixed-step advance | integration | `pnpm test -- tests/physics/compound.test.ts` | ✓ | green |
| 02-05-01 | 02-05 | 3 | PHYS-02 | T-02-13 / T-02-14 / T-02-15 | `started` events tagged from the index; stale handles skipped; same-unit guard | integration | `pnpm test -- tests/physics/events.test.ts` | ✓ | green |
| 02-05-02 | 02-05 | 3 | PHYS-02 | T-02-13..15 | Part-tagged contacts, no self events, no contacts for a lone unit | integration | `pnpm test -- tests/physics/events.test.ts` | ✓ | green |
| 02-06-01 | 02-06 | 4 | PHYS-03, PHYS-04 | T-02-16 / T-02-17 / T-02-18 / T-02-20 | Pre-step Δv, in-closure normal, armorKind from tag, one event per pair/tick | integration | `pnpm test -- tests/physics/tick.test.ts` | ✓ | green |
| 02-06-02 | 02-06 | 4 | PHYS-03, PHYS-04 | T-02-16..20 | Weapon↔body no reduction; weapon↔armor positive reduction; no zero-damage event on missing manifold | integration | `pnpm test -- tests/physics/tick.test.ts` | ✓ | green |
| 02-07-01 | 02-07 | 5 | PHYS-03 | T-02-21 / T-02-22 / T-02-23 | ω×r measured from `worldCom()`, pre-step Δv source unchanged, frozen contract | integration | `pnpm test -- tests/physics/rotation.test.ts` | ✓ | green |
| 02-07-02 | 02-07 | 5 | PHYS-03 | T-02-21 / T-02-24 | COM-based Δv pinned; origin value rejected; prototype restored in `finally` | integration | `pnpm test -- tests/physics/rotation.test.ts` | ✓ | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] **Dependency installed:** `@dimforge/rapier2d-compat@0.21.0` exact pin, approved at the human-verify gate.
- [x] `tests/physics/` files exist (`rapier-harness`, `types`, `damage`, `compound`, `events`, `tick`, `rotation`).
- [x] Rapier lifecycle convention enforced — `beforeAll(await RAPIER.init())`, `afterEach`/`afterAll` free.
- [x] WASM runs under the default Vitest worker pool — no `pool: 'forks'` fallback needed.
- [x] Deterministic `IRng` helper in `tests/helpers/rng.ts` (`mulberry32`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual "combat looks good" feel | influenced by PHYS-03/04 numbers | aesthetic/calibration judgement; needs the running sim (Phase 5) | Deferred to post-assembly calibration; not gated here. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-21

---

## Validation Audit 2026-10-21

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All five requirements (PHYS-01..PHYS-05) map to green automated tests: `tests/physics` — 8 files / 39 tests passing. (`static-obstacles.test.ts` is a Phase 4 additive extension, outside this phase's requirement set.)
