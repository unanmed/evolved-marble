---
phase: "4"
slug: "kingdom-system"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-20"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` (`environment: 'node'`; `include: ['tests/**/*.test.ts']`; alias `@` → `src/`) |
| **Quick run command** | `pnpm test -- tests/kingdom` (plus the seam suites) |
| **Full suite command** | `pnpm test` + `pnpm typecheck` + `pnpm lint` |
| **Estimated runtime** | ~2 s for the Phase 4 kingdom suite (10 files / 121 tests); ~0.5 s for the seam suites |
| **Per-file prereq** | `await RAPIER.init()` in `beforeAll`; `afterEach` disposes `KingdomWorld`/`PhysicsWorld`; seeded `mulberry32` `IRng` |

Round 1's gate is `pnpm typecheck` (`expectTypeOf` is a no-op under `vitest run`); Round 2 adds the behavioural suites under `tests/kingdom/` plus the three additive-seam suites.

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` + `pnpm test -- tests/kingdom`
- **After every plan wave:** Run `pnpm test` + `pnpm lint`
- **Before `/gsd-verify-work`:** Full suite (including `pnpm typecheck`) must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 04-01 | 1 | KING-01..08 | T-04-01 / T-04-05 | Declaration-only kingdom contract; scenario/order validation boundaries fixed in types | static | `pnpm typecheck` | ✓ | green |
| 04-01-02 | 04-01 | 1 | KING-03, KING-05, D-27 | T-04-06 | Additive-only G-1 `IHealableUnit`, G-2 `IStaticObstacleWorld`, G-5 `setUnitAI`; frozen types untouched | static | `pnpm typecheck` | ✓ | green |
| 04-01-03 | 04-01 | 1 | KING-01..08 | T-04-01 | 7 numeric enums + reduced-vision key sets pinned at compile time and runtime | unit | `pnpm test -- tests/kingdom/types.test.ts` | ✓ | green |
| 04-02-01 | 04-02 | 2 | KING-01, KING-02, KING-03, KING-08 | T-04-01 | 1000×1000 map, 10 m/h march, edge bounce, 1×/24× time rate, faction ownership | unit + integration | `pnpm test -- tests/kingdom/time.test.ts tests/kingdom/scenario.test.ts` | ✓ | green |
| 04-02-02 | 04-02 | 2 | KING-03 | T-04-02 | 25 m formation under program control on real Rapier; 1/h march heal | integration | `pnpm test -- tests/kingdom/march.test.ts` | ✓ | green |
| 04-02-03 | 04-02 | 2 | KING-06 | T-04-01 | Battle trigger <80 m, 80 m weighted square, membership/merge/end, real damage sink | integration | `pnpm test -- tests/kingdom/battle.test.ts tests/kingdom/tracer.test.ts` | ✓ | green |
| 04-03-01 | 04-03 | 2 | KING-03, KING-05 | T-04-12 | `Unit.heal` guards/clamps, never revives; `spawnUnit` returns `IHealableUnit` without cast | unit | `pnpm test -- tests/units/heal.test.ts` | ✓ | green |
| 04-03-02 | 04-03 | 2 | D-27 | T-04-11 / T-04-13 | Static cuboids block movement, emit no events, never enter the tag index; invalid specs rejected before mutation | integration | `pnpm test -- tests/physics/static-obstacles.test.ts` | ✓ | green |
| 04-03-03 | 04-03 | 2 | KING-03, KING-05 | T-04-09 | `setUnitAI` ownership: provider-created destroyed once, injected instances only dropped | unit | `pnpm test -- tests/control/set-unit-ai.test.ts` | ✓ | green |
| 04-04-01 | 04-04 | 3 | KING-03, KING-05 | T-04-03 | Garrison symmetry/release, 96 h/72 h training with cap+battle pause+remainder, 2/h garrison heal | integration | `pnpm test -- tests/kingdom/city.test.ts` | ✓ | green |
| 04-04-02 | 04-04 | 3 | KING-04 | T-04-08 | 100 m army / 150 m city stateless vision union; reduced briefs leak no roster/order/training internals | unit + integration | `pnpm test -- tests/kingdom/vision.test.ts` | ✓ | green |
| 04-04-03 | 04-04 | 3 | D-27 | T-04-13 | Terrain blocks movement and 64 sensing rays; walls contain units, stay out of `getTerrain()`, removed on dispose | integration | `pnpm test -- tests/kingdom/terrain.test.ts` | ✓ | green |
| 04-05-01 | 04-05 | 4 | KING-05, KING-06, KING-07 | T-04-04 / T-04-10 / T-04-15 | City battle requires a real garrison, carries `cityId`, capture via one helper, survivor garrison split, loser regroup | integration | `pnpm test -- tests/kingdom/city.test.ts tests/kingdom/battle.test.ts` | ✓ | green |
| 04-05-02 | 04-05 | 4 | KING-08 | T-04-02 | Placeholder `ICommander` is deterministic, restricted to MoveTo/Garrison/Hold, isolated per decision/order | integration | `pnpm test -- tests/kingdom/commander.test.ts` | ✓ | green |
| 04-05-03 | 04-05 | 4 | KING-08 | T-04-01 | `validateScenario` rejects every invalid class before physics/control state; faction ↔ `teamId` mapping proven | unit + integration | `pnpm test -- tests/kingdom/scenario.test.ts` | ✓ | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] `tests/kingdom/` + `tests/kingdom/types.test.ts` — Round 1 scaffolding: compile-time contract proof plus enum pinning.
- [x] Round 2 harness: `tests/kingdom/harness.ts` — awaited `RAPIER.init()`, `PhysicsWorld`/`ControlSystem`/`KingdomWorld` scenario assembly, `afterEach` dispose, seeded `mulberry32`.
- [x] Round 2 behaviour suites: `time`, `march`, `battle`, `city`, `vision`, `terrain`, `scenario`, `commander`, `tracer`.
- [x] G-1 approved: `tests/units/heal.test.ts`; G-2: `tests/physics/static-obstacles.test.ts`; G-5: `tests/control/set-unit-ai.test.ts`.
- [x] No new dependencies; `vitest.config.ts` / `tsconfig.json` unchanged.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| User reviews and approves `src/kingdom/types.ts` interface design | KING-01..08 | Type-first gate requires explicit human confirmation before implementation | **Approved** at the Round 1 type-design gate (recorded in `04-01-SUMMARY.md`); no remaining action. |
| Confirm the additive G-1/G-2/G-5 seams are acceptable | KING-03/05, D-27 | Seams touch frozen contracts; the user must explicitly approve additions | **Approved** (G-1 `IHealableUnit`, G-2 `IStaticObstacleWorld`, G-5 `setUnitAI`); no remaining action. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-21

---

## Validation Audit 2026-10-21

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All eight requirements (KING-01..KING-08) map to green automated tests: `tests/kingdom` — 10 files / 121 tests passing, plus 4 seam suites / 48 tests. `tracer.test.ts` is the cross-system E2E slice.

**Integration caveat (not a Nyquist gap):** the milestone audit (`v1-MILESTONE-AUDIT.md`) notes that the battle-end and city-settlement tests force-kill defenders via `takeDamage` rather than letting collision damage terminate the fight naturally. Requirement-level coverage is complete; a single natural-damage E2E run is recommended before milestone close.
