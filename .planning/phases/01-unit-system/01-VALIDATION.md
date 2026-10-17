---
phase: "1"
slug: "unit-system"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-17"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` — **needs Wave 0 repair** (stale `setupFiles` → non-existent `tests/helpers/physics-setup.ts`; missing `resolve.alias` for `@`) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5–15 seconds (pure data/domain) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test` + `pnpm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-02-01 | 01-02 | 1 | UNIT-01 | — | Attribute reads never return NaN/Infinity; enum args validated | unit | `pnpm test -- tests/units/types.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 2 | UNIT-02 | — | Class table complete for all 7 kinds | unit | `pnpm test -- tests/units/data-classes.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 2 | UNIT-03 | — | Weapon table complete; `penetration[ArmorKind]` exhaustive | unit | `pnpm test -- tests/units/data-weapons-armors.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 2 | UNIT-04 | — | Armor table complete for both kinds | unit | `pnpm test -- tests/units/data-weapons-armors.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-01 | 01-05 | 4 | UNIT-05 | — | RNG output guarded (`u1>0`); attributes clamped ≥ 0 | unit | `pnpm test -- tests/units/rng.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-02 | 01-05 | 4 | UNIT-05 | — | Normal spawn mean/σ within tolerance; all attributes ≥ 0 | unit | `pnpm test -- tests/units/spawn-normal.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 01-04 | 3 | UNIT-01 | — | Rolled bases, not class constants; all reads finite | unit | `pnpm test -- tests/units/attributes.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-02 | 01-04 | 3 | UNIT-06 | — | Level-up state transitions deterministic | unit | `pnpm test -- tests/units/leveling.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/units/` + at least one test file — the Vitest `include` glob currently matches nothing → `vitest run` exits 1.
- [ ] `vitest.config.ts` repair — remove/replace `setupFiles: ['tests/helpers/physics-setup.ts']` (file absent → hard failure) **and** add `resolve.alias` for `@` (else `@/units/...` imports fail under Vitest).
- [ ] `tsconfig.json` — decide whether to add `"tests"` to `include` so tests are typechecked; remove dangling `tsconfig.sim.json` comment reference.
- [ ] Toolchain decision for `pnpm lint` (typescript-eslint 8.71.2 refuses TS 7) — OQ-5.
- [ ] Framework install: none (Vitest already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | none | All phase behaviors have automated verification — pure in-process data/domain module. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
