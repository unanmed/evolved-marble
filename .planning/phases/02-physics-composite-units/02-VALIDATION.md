---
phase: "2"
slug: "physics-composite-units"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
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
| **Quick run command** | `pnpm vitest run tests/deterministic` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run tests/deterministic`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-* | 01 | 1 | PHYS-03 | — | N/A | smoke | `pnpm vitest run tests/deterministic/physics-gate.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-* | 01 | 1 | PHYS-03 | — | N/A | integration | `pnpm vitest run tests/deterministic/physics-gate.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-* | 02 | 2 | PHYS-01 | — | N/A | unit | `pnpm vitest run tests/sim/physics-composite.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-* | 03 | 2 | PHYS-02 | T-02-01 | contact bridge guards `lookup(handle) → null` | unit | `pnpm vitest run tests/sim/contact.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-* | 03 | 2 | PHYS-02 | — | N/A | unit (Δv pre-step) | `pnpm vitest run tests/sim/contact.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-* | 03 | 2 | PHYS-03 | — | N/A | unit (CCD sweep) | `pnpm vitest run tests/sim/ccd.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-* | 03 | 2 | PHYS-03 | — | N/A | integration (snapshot round-trip) | `pnpm vitest run tests/sim/snapshot.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/deterministic/physics-gate.test.ts` — async `initPhysics()` in `beforeAll`; version smoke (0.21.0 + golden hash) + dual fingerprint (sim + `takeSnapshot()`) same-machine double run (D-19/D-20).
- [ ] `tests/sim/physics-composite.test.ts` — composite rig (1 body + N colliders + 1 weapon body + joint) + `colliderHandle → (entityId, part, armorSubtype)` map (PHYS-01).
- [ ] `tests/sim/contact.test.ts` — typed `IContactEvent` with parts + Δv > 0; Δv from pre-step velocities (head-on 8 m/s → Δv ≈ 8) (PHYS-02).
- [ ] `tests/sim/ccd.test.ts` — sweep test: fastest weapon against a dynamic target → exactly one hit (PHYS-03, criterion-4 CCD half).
- [ ] Extend `tests/helpers/run-sim.ts` (or a physics helper) to build the physics-enabled sim and return both the sim trace and the Rapier snapshot hash.
- [ ] Shared test-setup `await initPhysics()` across physics test files.

*(Test infra otherwise exists — Vitest is configured; no framework install needed.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser bundle smoke | PHYS-03 | WASM packaging for Vite 8/Chrome is reasoned, not executed (research MEDIUM on the browser bundle path) | Run `pnpm build` and confirm the `-compat` Rapier import resolves in the production bundle |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
