---
phase: 01-unit-system
fixed_at: 2026-10-18T06:10:00Z
review_path: .planning/phases/01-unit-system/01-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-10-18T06:10:00Z
**Source review:** `.planning/phases/01-unit-system/01-REVIEW.md`
**Iteration:** 1
**Scope:** CRITICAL + WARNING (`fix_scope: critical_warning`) — CR-01, CR-02, WR-01, WR-02, WR-03

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

**Verification environment:** `workflow.use_worktrees=false`, so all fixes were applied and committed in the
**main checkout** (no isolated worktree). After every commit: `pnpm test` (8 files / 80 tests passing at the end),
`pnpm typecheck` (exit 0) and `pnpm lint` (exit 0) all green. Gate results are reproducible from this tree.

**Design contract preserved:** `IUnit` / `src/units/types.ts` unchanged — no new public members, no getters/setters,
numeric enums retained, JSDoc added on the private `#checkLevelUp` and to the constructor `@throws`.

## Fixed Issues

### CR-01: `takeDamage` accepts non-finite/negative input and corrupts `#hp`

**Files modified:** `src/units/Unit.ts`, `tests/units/attributes.test.ts`
**Commit:** `ca5164d`
**Status:** fixed
**Applied fix:** Guarded `takeDamage` — non-finite (`NaN`/`±Infinity`) or non-positive `amount` is ignored as an
invalid hit (no state change, cannot poison `#hp`). Valid damage now clamps `#hp` to `[0, modifier-adjusted MaxHealth]`
using `#applyModifiers(AttributeKind.MaxHealth, #maxHealth())`, restoring the public invariant
`getAttribute(Health) <= getAttribute(MaxHealth)`. Added 3 tests (invalid inputs are no-ops; negative damage cannot
exceed MaxHealth; `NaN` attempt leaves Health finite).

### CR-02: `gainKillExperience` accepts non-finite/negative input and corrupts `#xp`

**Files modified:** `src/units/Unit.ts`, `tests/units/leveling.test.ts`
**Commit:** `a61ceec`
**Status:** fixed
**Applied fix:** `gainKillExperience` now ignores non-finite or non-positive `enemyLevel` (prevents `NaN`/`Infinity`
from poisoning `#xp` and prevents `Infinity` from driving `#checkLevelUp` unbounded). Applied the same
`Number.isFinite(x) && x > gate` hardening to `gainAttackExperience` / `gainDefenseExperience` for defence-in-depth
(they previously rejected `NaN` only by accident of the `>` comparison, and did **not** reject `Infinity`). Added
3 tests.

### WR-01: `sampleNormal` only guards `u1 <= 0`; out-of-range/non-finite draw still yields `NaN`

**Files modified:** `src/common/rng.ts`, `tests/units/rng.test.ts`
**Commit:** `fd3de10`
**Status:** fixed
**Applied fix:** The re-draw loop now rejects any draw outside `(0, 1]` via `while (!(u1 > 0) || u1 > 1)` — the
`!(u1 > 0)` form also rejects `NaN`. The final result is additionally guarded with
`Number.isFinite(sample) ? Math.max(0, sample) : mean` so the return value can never be `NaN`/`Infinity`. Updated the
function JSDoc. Added 3 tests (u1 > 1, non-finite u1, all-invalid-then-valid sequence).

### WR-02: Level-up health restore uses raw `maxHpGrowth`, not the modifier-adjusted MaxHealth delta

**Files modified:** `src/units/Unit.ts`, `tests/units/leveling.test.ts`
**Commit:** `d802307`
**Status:** fixed: requires human verification
**Applied fix:** `#checkLevelUp` now measures `previousMaxHealth` (via the accessor-consistent
`#applyModifiers(MaxHealth, #maxHealth())`) before incrementing the level and `currentMaxHealth` after, restoring
`#hp` by the actual positive delta and clamping to `currentMaxHealth`. Injected multiplicative MaxHealth modifiers
are now honored. Added 1 test (Swordsman with a `+1.0` Multiplicative MaxHealth modifier: MaxHealth 200→400 at level 1,
then level 2 → 440 with Health restored 350→390).
**Note:** This is a logic-correctness change (restore delta semantics), so it is flagged as requiring human
verification per the fixer verification policy. The no-modifier behavior is byte-for-byte unchanged and is covered by
the pre-existing level-up restore test.

### WR-03: `Unit` constructor does not validate `classKind`

**Files modified:** `src/units/Unit.ts`, `tests/units/attributes.test.ts`
**Commit:** `57c9ed7`
**Status:** fixed
**Applied fix:** The constructor resolves the class definition first and throws
`new RangeError(\`Unknown ClassKind: ${String(classKind)}\`)` for an out-of-range ordinal, before any state
assignment. Documented the failure mode via `@throws {RangeError}` on the constructor JSDoc. Added 3 tests
(out-of-range throws `RangeError`; error message names the ordinal; every valid `ClassKind` still constructs).

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-10-18T06:10:00Z_
_Fixer: opencode (gsd-code-fixer)_
_Iteration: 1_
