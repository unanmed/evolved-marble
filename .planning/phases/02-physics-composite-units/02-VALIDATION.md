---
phase: "2"
slug: "physics-composite-units"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-16"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (environment: `node`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run tests/determinism` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run tests/determinism`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Plan IDs follow the 5-plan revision (02-01 foundation · 02-02 tracer · 02-03 sim-core integration · 02-04 factory build-out · 02-05 hardening).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-02 | 01 | 1 | PHYS-03 | T-02-SC | N/A | smoke (version + golden fingerprint) | `pnpm vitest run tests/determinism/rapier-version.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | PHYS-01 | — | N/A | integration (composite rig + part map) | `pnpm vitest run tests/determinism/physics-gate.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | PHYS-02 | — | N/A | integration (typed contact, Δv > 0) | `pnpm vitest run tests/determinism/physics-gate.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | PHYS-03 | — | N/A | integration (dual fingerprint, same-machine) | `pnpm vitest run tests/determinism/physics-gate.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | PHYS-01 | — | N/A | integration (pose mirror) | `pnpm vitest run tests/sim/snapshot.test.ts` | ✅ (extend) | ⬜ pending |
| 02-03-01 | 03 | 3 | PHYS-03 | T-02-02 | in-process bytes only; version guard rejects non-v3 | integration (snapshot round-trip) | `pnpm vitest run tests/sim/snapshot.test.ts` | ✅ (extend) | ⬜ pending |
| 02-04-01 | 04 | 3 | PHYS-01 | T-02-01 | `despawn` unregisters handles; `lookup` → null | unit (arrays + collision groups + lifecycle) | `pnpm vitest run tests/sim/physics-composite.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | PHYS-03 | — | N/A | unit (CCD sweep contrast) | `pnpm vitest run tests/sim/ccd.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 4 | PHYS-02 | T-02-01 | contact bridge guards `lookup(handle) → null` | unit (pre-step Δv + parts/subtype) | `pnpm vitest run tests/sim/contact.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-02 | 05 | 4 | PHYS-03 | — | N/A | unit (snapshot v3 census + part-map round-trip) | `pnpm vitest run tests/sim/snapshot.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/determinism/rapier-version.test.ts` — plan 02-01: async `initPhysics()`; version smoke (`'0.21.0'`) + golden fingerprint (D-19).
- [ ] `tests/determinism/physics-gate.test.ts` — plan 02-02: dual fingerprint (sim + `takeSnapshot()`) same-machine double run; ≥1 typed part-tagged contact with Δv > 0 (D-19/D-20).
- [ ] `tests/helpers/run-physics.ts` — plan 02-02: build the physics-enabled scenario directly and return the pose trace + Rapier snapshot hash.
- [ ] `tests/sim/physics-composite.test.ts` — plan 02-04: composite rig (1 body + N colliders + N weapon bodies + joints) + `colliderHandle → (entityId, part, armorSubtype)` map; collision groups; ordered despawn (PHYS-01).
- [ ] `tests/sim/ccd.test.ts` — plan 02-04: sweep test: fast weapon against a dynamic target → exactly one hit with CCD, zero without (PHYS-03).
- [ ] `tests/sim/contact.test.ts` — plan 02-05: typed `IContactEvent` with parts + Δv from pre-step velocities (head-on 8 m/s → Δv ≈ 8); null guard; enter-only (PHYS-02).
- [ ] `tests/sim/snapshot.test.ts` — plans 02-03/02-05: extend the mutator census with `xform.rotation`/`xform.angularVelocity` + composite-unit round-trip (PHYS-03).
- [ ] Shared test-setup `await initPhysics()` across physics test files (`tests/helpers/physics-setup.ts` via `vitest.config.ts` `setupFiles`, plan 02-01).

*(Test infra otherwise exists — Vitest is configured; no framework install needed.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser bundle smoke | PHYS-03 | WASM packaging for Vite 8/Chrome is reasoned, not executed (research MEDIUM on the browser bundle path — RESEARCH Open Question 3) | Run `pnpm build` and confirm the `-compat` Rapier import resolves in the production bundle |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized for the 5-plan revision (02-01 foundation · 02-02 tracer · 02-03 integration · 02-04 factory · 02-05 hardening); test paths aligned to `tests/determinism` (the pre-commit hook and `pnpm gate` target).
