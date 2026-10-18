---
phase: "2"
slug: "physics-simulation"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-18"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` — already clean (Phase 1 repaired `@` alias + removed stale `setupFiles`); no Wave 0 repair needed |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5–20 s (physics `RAPIER.init()` adds ~125 ms once per file) |
| **Per-file prereq** | `await RAPIER.init()` in `beforeAll` (idempotent) |

---

## Sampling Rate

- **After every task commit:** `pnpm test`
- **After every plan wave:** `pnpm test` + `pnpm typecheck` (+ `pnpm lint`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-*-01 | 02-01 | 0 | PHYS-01 | — | Compound body mass == Σ collider masses; handle map tagged | unit (integration) | `pnpm test -- tests/physics/compound.test.ts` | ❌ W0 | ⬜ pending |
| 02-*-02 | 02-01 | 0 | PHYS-02 | — | `started` events tagged `{unitId, part}`; no same-body self-events; normal via `contactPair` | unit (integration) | `pnpm test -- tests/physics/events.test.ts` | ❌ W0 | ⬜ pending |
| 02-*-03 | 02-01 | 0 | PHYS-03 | — | `computeDamageMean(...)` matches hand-computed incl. `max(…,0)`; jitter σ≈mean/20 via injected `IRng` | unit (pure+stat) | `pnpm test -- tests/physics/damage.test.ts` | ❌ W0 | ⬜ pending |
| 02-*-04 | 02-01 | 0 | PHYS-04 | — | weapon↔armor applies reduction per penetration; weapon↔body no reduction; OQ-1 sign pinned | unit (pure) | `pnpm test -- tests/physics/damage.test.ts` | ❌ W0 | ⬜ pending |
| 02-*-05 | 02-01 | 0 | PHYS-05 | — | `world.timestep == 1/60`; one tick == one `world.step`; no wall-clock | unit (integration) | `pnpm test -- tests/physics/tick.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Install the dependency:** `pnpm add -E @dimforge/rapier2d-compat@0.21.0` behind a `checkpoint:human-verify` (package-legitimacy SUS flag). Nothing runs without it.
- [ ] `tests/physics/` files (`compound.test.ts`, `events.test.ts`, `damage.test.ts`, `tick.test.ts`) — glob already matches; files don't exist yet.
- [ ] Rapier lifecycle convention — `beforeAll(await RAPIER.init())`; `afterEach`/`afterAll` `world.free()` + `queue.free()`.
- [ ] **Prove WASM runs under Vitest's worker pool** — if it fails under `threads`, add `pool: 'forks'` to `vitest.config.ts` (research Pitfall 7).
- [ ] Deterministic `IRng` test helper (reuse/extract the inline `mulberry32`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual "combat looks good" feel | influenced by PHYS-03/04 numbers | aesthetic/calibration judgement; needs a running sim (Phase 5) | Deferred to post-assembly calibration; not gated here. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
