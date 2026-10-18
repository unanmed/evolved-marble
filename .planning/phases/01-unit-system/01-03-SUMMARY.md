---
phase: 01-unit-system
plan: 03
subsystem: units
tags: [typescript, typed-const-tables, numeric-enums, spec-exact, vitest, data-module]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "Wave 1 type contract (01-02): `src/units/types.ts` — 7 numeric enums + 8 `I*` interfaces (user-approved); `@/units/...` alias proven under Vitest"
provides:
  - "`src/units/data.ts` — the single typed-constant calibration surface: `CLASS_DEFS` (7), `WEAPON_DEFS` (6, with a total `Record<ArmorKind, number>` penetration matrix), `ARMOR_DEFS` (2), ordered `ALL_*_KINDS` arrays, and 6 level/experience calibration constants"
  - "`tests/units/data-classes.test.ts` — spec-exact assertions over the 7 class defs + calibration constants"
  - "`tests/units/data-weapons-armors.test.ts` — spec-exact assertions over the 6 weapons, 2 armors, and the weapon×armor penetration matrix"
affects: [01-unit-system plan 04 (Unit.getAttribute applies these coefficients), 01-unit-system plan 05 (spawn.ts reads CONTROL_LEVEL_BASE), Phase 2 physics (weapon/armor mass), Phase 4 leveling]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 7466
  tasks: 2
  commits: 3
  plan_head_before: 55d9e71c7968d83d1c58b67b52043c87c2d52901

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-file typed-constant data module (D-01/D-02): one `src/units/data.ts` of JSDoc'd top-level `const`s — no JSON, no factories, no per-category files"
    - "`Record<EnumKind, IDef>` tables make a missing enum member a compile error (completeness by type, not convention)"
    - "Total lookup types: `penetration: Readonly<Record<ArmorKind, number>>` forces both armor kinds for every weapon"
    - "Ordered `ALL_*_KINDS` arrays for iteration because numeric enums reverse-map `Object.keys`"

key-files:
  created:
    - src/units/data.ts
    - tests/units/data-classes.test.ts
    - tests/units/data-weapons-armors.test.ts
  modified: []

key-decisions:
  - "`attackGrowth` is the level-scaling coefficient k in the k·L attack-growth form; `defenseGrowth` is a flat per-level increment — the distinct shapes are encoded in JSDoc, formulas live in `Unit.getAttribute` (OQ-2)"
  - "`maxHpGrowth` is NOT in the spec: chosen as ~10% of each class's base maxHp (20/14/26/24/28/22/20) and marked 'calibration pending' in JSDoc (OQ-3)"
  - "Unit `mass` is body mass only; weapon/armor masses stay on their own defs and are summed by physics later (OQ-6)"
  - "`CONTROL_LEVEL_BASE = 10` is a single shared constant (spec fixes every class's initial control-level mean at 10), not a per-class field"
  - "Spec typos corrected without changing intent: 剑盾's attack-growth line mislabels the stat as 弓箭 → sword-shield uses attackGrowth 10; 长矛兵's level-8 '护盾' → ArmorKind.Shield"

patterns-established:
  - "Calibration surface = one file: re-tuning any balance number is a one-line edit in `data.ts`"
  - "Spec-exact tests compare individual numeric fields (not whole-table snapshots) so a single wrong number fails loudly"

requirements-completed: [UNIT-02, UNIT-03, UNIT-04]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "`CLASS_DEFS` holds all 7 `ClassKind` entries with spec-exact level-1 bases, growth coefficients, initial equipment, and level unlock tables"
    requirement: UNIT-02
    verification:
      - kind: unit
        ref: "tests/units/data-classes.test.ts#units/data — CLASS_DEFS spec-exact base values"
        status: pass
      - kind: unit
        ref: "tests/units/data-classes.test.ts#units/data — initial equipment and unlocks"
        status: pass
    human_judgment: false
  - id: D2
    description: "`WEAPON_DEFS` holds all 6 `WeaponKind` entries with spec mass/attackRatio and a total `penetration` record covering both armor kinds"
    requirement: UNIT-03
    verification:
      - kind: unit
        ref: "tests/units/data-weapons-armors.test.ts#units/data — WEAPON_DEFS spec-exact values"
        status: pass
      - kind: unit
        ref: "tests/units/data-weapons-armors.test.ts#resolves every weapon × armor lookup to a finite number (total matrix)"
        status: pass
    human_judgment: false
  - id: D3
    description: "`ARMOR_DEFS` holds both `ArmorKind` entries with spec mass and defenseRatio"
    requirement: UNIT-04
    verification:
      - kind: unit
        ref: "tests/units/data-weapons-armors.test.ts#units/data — ARMOR_DEFS completeness and values"
        status: pass
    human_judgment: false
  - id: D4
    description: "Level/experience calibration constants exported as named, asserted `data.ts` consts (ATTACK/DEFENSE_EXP_DAMAGE_GATE=50, KILL_EXP_LEVEL_FACTOR=10, LEVEL_THRESHOLD_BASE=100, CONTROL_LEVEL_BASE=10, CONTROL_LEVEL_GROWTH_PER_LEVEL=5)"
    requirement: UNIT-02
    verification:
      - kind: unit
        ref: "tests/units/data-classes.test.ts#pins every level/experience calibration constant to its spec value"
        status: pass
    human_judgment: false
  - id: D5
    description: "Each class's `attackGrowth` (k·L coefficient) and `defenseGrowth` (flat per-level) are distinct data fields, resolving OQ-2 without storing the formula shape in the table"
    requirement: UNIT-02
    verification:
      - kind: unit
        ref: "tests/units/data-classes.test.ts#units/data — CLASS_DEFS spec-exact base values (attackGrowth/defenseGrowth per class)"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-18
status: complete
---

# Phase 1 Plan 03: Unit Data Tables Summary

**All seven classes, six weapons, and two armors encoded as spec-exact typed constant tables in one `src/units/data.ts`, with a total weapon×armor penetration matrix and six asserted calibration constants.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-18T05:17:00Z (base `55d9e71`)
- **Completed:** 2026-10-18T05:26:00Z (`85e9e0b`)
- **Tasks:** 2 (both `type=auto`)
- **Files modified:** 3 (all created)

## Accomplishments

- **`CLASS_DEFS: Record<ClassKind, IClassDef>`** — 7 spec-exact classes (剑士/弓箭手/狂战士/锤兵/骑士/剑盾/长矛兵) with level-1 bases, `attackGrowth` (k·L coefficient), `defenseGrowth` (flat per-level), the calibratable `maxHpGrowth`, initial equipment, and level unlock tables (equipment + skills).
- **`WEAPON_DEFS: Record<WeaponKind, IWeaponDef>`** — 6 weapons with mass/attackRatio and a `Readonly<Record<ArmorKind, number>>` penetration matrix covering **both** armor kinds for every weapon (e.g. Hammer `{Helmet: 5, Shield: 3}`, Bow `{Helmet: 0.4, Shield: 0.2}`).
- **`ARMOR_DEFS: Record<ArmorKind, IArmorDef>`** — 头盔 (8 kg, ratio 1.0) and 盾牌 (15 kg, ratio 1.2).
- **Calibration constants** — `ATTACK_EXP_DAMAGE_GATE=50`, `DEFENSE_EXP_DAMAGE_GATE=50`, `KILL_EXP_LEVEL_FACTOR=10`, `LEVEL_THRESHOLD_BASE=100`, `CONTROL_LEVEL_BASE=10`, `CONTROL_LEVEL_GROWTH_PER_LEVEL=5`, each JSDoc'd with its spec formula.
- **Ordered iteration arrays** — `ALL_CLASS_KINDS` (7), `ALL_WEAPON_KINDS` (6), `ALL_ARMOR_KINDS` (2), ordered to side-step numeric-enum reverse mapping.
- **Spec-exact tests** — 2 new files, 30 assertions, all green; full suite 4 files / 36 tests passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: CLASS_DEFS + growth/unlock tables + calibration constants** — `ca485fa` (feat)
2. **Task 2: WEAPON_DEFS + ARMOR_DEFS + penetration matrix** — `7ecece5` (feat)
3. **Task 1 addendum: pin remaining calibration constants** — `85e9e0b` (test) _(see Deviation 1)_

**Plan metadata:** `_metadata commit_` (docs: complete 01-03 plan)

## Files Created/Modified

- `src/units/data.ts` — the single typed-constant calibration surface: calibration constants, `CLASS_DEFS`, `ALL_CLASS_KINDS`, `WEAPON_DEFS`, `ARMOR_DEFS`, `ALL_WEAPON_KINDS`, `ALL_ARMOR_KINDS`; imports only `@/units/types`.
- `tests/units/data-classes.test.ts` — completeness/order/shared-constant checks, spec-exact per-class field assertions, initial-equipment + unlock-table assertions, calibration-pin assertions.
- `tests/units/data-weapons-armors.test.ts` — weapon/armor completeness and ordering, spec-exact mass/attackRatio, the full penetration matrix, spot-checks, and a total weapon×armor finiteness loop.

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Tests (Task 1) | `pnpm test -- tests/units/data-classes.test.ts` | exit 0 — 19 passed |
| Tests (Task 2) | `pnpm test -- tests/units/data-weapons-armors.test.ts` | exit 0 — 10 passed |
| Full suite | `pnpm test` | exit 0 — 4 files, 36 tests passed |
| Typecheck | `pnpm typecheck` | exit 0 (tables satisfy their `Record<Enum, IDef>` types) |
| Lint | `pnpm lint` | exit 0 |

## Decisions Made

- **OQ-2 growth distinction encoded in data**: `attackGrowth` is the k·L coefficient, `defenseGrowth` is a flat per-level increment — documented per-field in JSDoc; only coefficients are data, the formula shape stays in `getAttribute` (plan 01-04).
- **OQ-3 `maxHpGrowth`**: not specified in the reference; set to ~10% of each class's base maxHp (20/14/26/24/28/22/20) and flagged "calibration pending" in JSDoc.
- **OQ-6 body-only mass**: class `mass` excludes weapon/armor mass; those stay on `IWeaponDef`/`IArmorDef` for physics to sum.
- **`CONTROL_LEVEL_BASE=10` shared**: spec fixes every class's initial control-level mean at 10, so it is one constant (not a per-class field); `spawn.ts` (01-05) samples `sampleNormal(rng, 10, 10/8)`.
- **Spec-typo transcription**: 剑盾's attack-growth line mislabels the stat as "弓箭" → recorded as `attackGrowth 10`; 长矛兵 level-8 "护盾" → `ArmorKind.Shield`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Pinned the remaining calibration constants in tests**
- **Found during:** Task 1 (post-commit verification review)
- **Issue:** The Task-1 test asserted only `CONTROL_LEVEL_BASE`/`CONTROL_LEVEL_GROWTH_PER_LEVEL`; the plan's must-have #4 ("all calibration numbers live as named `data.ts` constants") had no assertion for the other four, leaving their spec values unverified.
- **Fix:** Added a `pins every level/experience calibration constant to its spec value` case asserting `ATTACK_EXP_DAMAGE_GATE`/`DEFENSE_EXP_DAMAGE_GATE`=50, `KILL_EXP_LEVEL_FACTOR`=10, `LEVEL_THRESHOLD_BASE`=100.
- **Files modified:** `tests/units/data-classes.test.ts`
- **Verification:** `pnpm test -- tests/units/data-classes.test.ts` (19 passed), `pnpm lint` exit 0.
- **Committed in:** `85e9e0b` (follow-up test commit to the Task-1 artifact)

### Process note

**2. [Rule 3 - Blocking] Prettier formatting pass**
- **Found during:** Task 1 lint run
- **Issue:** 16 `prettier/prettier` errors from object-literal line wrapping in `data.ts` and the test file.
- **Fix:** `npx prettier --write` on the two files (formatting only, no semantic change).
- **Verification:** `pnpm lint` exit 0.
- **Committed in:** folded into `ca485fa` / `7ecece5`.

---

**Total deviations:** 1 auto-fixed (Rule 2) + 1 process note (Rule 3, formatting)
**Impact on plan:** No scope creep; the added assertions only tighten verification of a plan must-have.

## Issues Encountered

None beyond formatting. No package installs, no auth gates, no environment blockers. `types.ts` was not modified (contract frozen as required).

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surface. `data.ts` imports only `@/units/types` (no dependency added, satisfying T-01-SC); `Record<Enum, IDef>` typing makes a missing class/weapon/armor kind a compile error (T-01-06) and `penetration: Record<ArmorKind, number>` forces both armor kinds (T-01-07); spec-exact tests pin the numbers so silent numeric corruption fails the suite.

## Next Phase Readiness

- The calibration surface is complete and frozen-shaped for downstream plans: `Unit.getAttribute` (01-04) consumes `attackGrowth`/`defenseGrowth`/`maxHpGrowth`; `spawn.ts` (01-05) consumes `CONTROL_LEVEL_BASE`.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` are all green, so plans 01-04 and 01-05 start from a verified harness.
- `maxHpGrowth` remains explicitly "calibration pending" — expected to be tuned after the combat simulation runs.

---

*Phase: 01-unit-system*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Created files present on disk: `src/units/data.ts`, `tests/units/data-classes.test.ts`, `tests/units/data-weapons-armors.test.ts` ✓
- Task commits present: `ca485fa`, `7ecece5`, `85e9e0b` ✓
- Measured commits from ledger base `55d9e71`: 3 ✓
- Gates green: `pnpm test` (36 passed), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0) ✓
