---
phase: "3"
slug: "control-system"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-19"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` (`environment: 'node'`; `include: ['tests/**/*.test.ts']`; alias `@` → `src/`) |
| **Quick run command** | `pnpm test -- tests/control` |
| **Full suite command** | `pnpm test` + `pnpm typecheck` (+ `pnpm lint`) |
| **Estimated runtime** | ~1 s for the Phase 3 control suite (6 files / 85 tests) |

Round 1's gate is `pnpm typecheck` (`expectTypeOf` is a no-op under `vitest run`); Round 2 adds the behavioral suites under `tests/control/`.

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` + `pnpm test -- tests/control`
- **After every plan wave:** Run `pnpm test` + `pnpm lint`
- **Before `/gsd-verify-work`:** Full suite (including `pnpm typecheck`) must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 03-01 | 1 | CTRL-01..04 | T-03-01 / T-03-02 | Declaration-only `src/control/types.ts`; no runtime behavior or external input | static | `pnpm typecheck` | ✓ | green |
| 03-01-02 | 03-01 | 1 | CTRL-01..04 | T-03-03 | Numeric enum values and contract shapes pinned at compile time and runtime | unit | `pnpm test -- tests/control/types.test.ts` | ✓ | green |
| 03-02-01 | 03-02 | 2 | CTRL-01..04 | T-03-04 / T-03-05 | End-to-end decide → force → physics → damage slice; untrusted plugin output clamped | integration | `pnpm test -- tests/control/loop.test.ts tests/control/sensing.test.ts` | ✓ | green |
| 03-02-02 | 03-02 | 2 | CTRL-02, CTRL-03 | T-03-04 / T-03-05 / T-03-06 / T-03-08 | Net force/torque composition and clamping; non-finite → 0; skill intents only on decision ticks; 0/6/12 cadence | unit + integration | `pnpm test -- tests/control/loop.test.ts` | ✓ | green |
| 03-02-03 | 03-02 | 2 | CTRL-01 | T-03-07 | 64 sanitized distances in `[0, 50]`; ≤16 enemies / ≤16 allies; friendly blockers never occlude; empty projectiles | integration | `pnpm test -- tests/control/sensing.test.ts` | ✓ | green |
| 03-03-01 | 03-03 | 3 | CTRL-04, CTRL-02 | T-03-11 / T-03-13 | Complete `DefaultUnitAI` behaviour tree; clamped steering; one-shot skill intents with tick cooldowns | unit | `pnpm test -- tests/control/default-ai.test.ts` | ✓ | green |
| 03-03-02 | 03-03 | 3 | CTRL-04, CTRL-02 | T-03-11 / T-03-15 | Idle/approach/ram/retreat, PD damping, determinism, cooldown windows, one intent per decision | unit | `pnpm test -- tests/control/default-ai.test.ts` | ✓ | green |
| 03-03-03 | 03-03 | 3 | CTRL-04 | T-03-12 / T-03-14 | Provider swap leaves physics/unit code unchanged; lifecycle exact; throwing plugin survives 30 ticks; `updateTeam` reclassifies | integration | `pnpm test -- tests/control/pluggable.test.ts` | ✓ | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] `tests/control/` + `tests/control/types.test.ts` — Round 1 scaffolding: compile-time contract proof plus enum pinning.
- [x] Round 2 fixtures: `tests/control/arena.ts` (`ArenaSensingWorld` — boundary rect + unit circles + empty projectiles), `tests/control/damage-sink.ts`.
- [x] No new dependencies and no `vitest.config.ts` changes — existing Vitest/alias/TS configuration is sufficient.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| User reviews and approves the `src/control/types.ts` interface design | CTRL-01..04 | Type-first gate requires explicit human confirmation before implementation (PROJECT.md / ROADMAP.md) | **Approved 2026-10-19** at the Round 1 type-design gate; no remaining manual action. |

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

All four requirements (CTRL-01..CTRL-04) map to green automated tests: `tests/control` — 6 files / 85 tests passing. (`set-unit-ai.test.ts` is a Phase 4 additive extension, outside this phase's requirement set.)
