---
phase: "1"
slug: "unit-system"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-17"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` — repaired in Wave 0: stale `setupFiles` removed, `resolve.alias['@']` → `src/` added, `include: ['tests/**/*.test.ts']`; `tsconfig.json` includes `src` + `tests` with `strict: true` |
| **Quick run command** | `pnpm test -- tests/units` |
| **Full suite command** | `pnpm test` (currently 33 files / 332 tests, ~6 s) |
| **Estimated runtime** | ~3 seconds for the Phase 1 unit suite |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- tests/units`
- **After every plan wave:** Run `pnpm test` + `pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 0 | UNIT-01..06 | T-01-01 / T-01-02 | Config resolves `@` alias, includes `tests/**`, no stale `setupFiles`; `strict` retained | infra | `pnpm test` + `pnpm typecheck` | ✓ | green |
| 01-01-02 | 01-01 | 0 | UNIT-01..06 | T-01-02 | Vitest runner loads under `environment: 'node'` | unit | `pnpm test -- tests/units/harness.test.ts` | ✓ | green |
| 01-01-03 | 01-01 | 0 | UNIT-01..06 | T-01-03 / T-01-SC | `pnpm lint` works via vetted TS alias, no rule disabled | infra | `pnpm lint` | ✓ | green |
| 01-02-01 | 01-02 | 1 | UNIT-01..06 | T-01-04 | Type module is declaration-only and gate-approved | static | `pnpm typecheck` | ✓ | green |
| 01-02-02 | 01-02 | 1 | UNIT-01..06 | T-01-05 | Numeric enum ordinals pinned; shared `IRng` re-export | unit | `pnpm test -- tests/units/types.test.ts` | ✓ | green |
| 01-03-01 | 01-03 | 2 | UNIT-02 | T-01-06 | All 7 class definitions complete; growth/unlock tables and calibration constants pinned | unit | `pnpm test -- tests/units/data-classes.test.ts` | ✓ | green |
| 01-03-02 | 01-03 | 2 | UNIT-03, UNIT-04 | T-01-06 / T-01-07 | 6 weapons + 2 armors complete; every weapon has both armor penetrations | unit | `pnpm test -- tests/units/data-weapons-armors.test.ts` | ✓ | green |
| 01-04-01 | 01-04 | 3 | UNIT-01 | T-01-08 / T-01-09 | All 13 attribute reads finite; invalid damage ignored; modifiers apply | unit | `pnpm test -- tests/units/attributes.test.ts` | ✓ | green |
| 01-04-02 | 01-04 | 3 | UNIT-06 | T-01-09 / T-01-10 | Exp gates, `100·(1+R_E)^L` thresholds, per-class growth, health-restore cap, multi-level grant, L3 unlock | unit | `pnpm test -- tests/units/leveling.test.ts` | ✓ | green |
| 01-05-01 | 01-05 | 4 | UNIT-05 | T-01-11 | Box–Muller guards `u1 <= 0`, clamps to ≥ 0, always finite | unit | `pnpm test -- tests/units/rng.test.ts` | ✓ | green |
| 01-05-02 | 01-05 | 4 | UNIT-05 | T-01-12 | Normal spawn mean/σ within tolerance; all 7 attributes non-negative and finite; unique names | unit | `pnpm test -- tests/units/spawn-normal.test.ts` | ✓ | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] `tests/units/` exists with a harness smoke test — the Vitest `include` glob now matches files.
- [x] `vitest.config.ts` repaired — stale `setupFiles` removed and `resolve.alias` for `@` added.
- [x] `tsconfig.json` includes `src` + `tests` and keeps `strict: true`.
- [x] `pnpm lint` toolchain repaired via the vetted `@typescript/typescript6@6.0.2` alias.
- [x] Framework install: none needed (Vitest already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | none | All phase behaviors have automated verification — pure in-process data/domain module. |

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

All six requirements (UNIT-01..UNIT-06) map to green automated tests: `tests/units` — 9 files / 87 tests passing.
