---
phase: 01-unit-system
verified: 2026-10-18T06:18:47Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/01-unit-system/01-01-PLAN.md
  - .planning/phases/01-unit-system/01-01-SUMMARY.md
  - .planning/phases/01-unit-system/01-02-PLAN.md
  - .planning/phases/01-unit-system/01-02-SUMMARY.md
  - .planning/phases/01-unit-system/01-03-PLAN.md
  - .planning/phases/01-unit-system/01-03-SUMMARY.md
  - .planning/phases/01-unit-system/01-04-PLAN.md
  - .planning/phases/01-unit-system/01-04-SUMMARY.md
  - .planning/phases/01-unit-system/01-05-PLAN.md
  - .planning/phases/01-unit-system/01-05-SUMMARY.md
  - package.json
  - pnpm-lock.yaml
  - src/common/rng.ts
  - src/common/types.ts
  - src/units/Unit.ts
  - src/units/data.ts
  - src/units/spawn.ts
  - src/units/types.ts
  - tests/units/attributes.test.ts
  - tests/units/data-classes.test.ts
  - tests/units/data-weapons-armors.test.ts
  - tests/units/harness.test.ts
  - tests/units/leveling.test.ts
  - tests/units/rng.test.ts
  - tests/units/spawn-normal.test.ts
  - tests/units/types.test.ts
  - tsconfig.json
  - vitest.config.ts
covered_digest: "v1:sha256:c023593d7813d3a179814a674542bed64d36b87e3ef475c31fec7ce301a9253a"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: 单位系统 Verification Report

**Phase Goal:** 建立完整可用的单位数据模型——16 项属性、7 个职业、6 种武器、2 种防具、正态随机生成与等级/经验/升级机制。
**Verified:** 2026-10-18T06:18:47Z
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md)

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | The type contract is declaration-only: numeric enums + JSDoc'd `I*` interfaces, `IRng` shared in `src/common/`, no getters/setters, `IEquipment.weapon?`/`armor?` optional (D-11). | ✓ VERIFIED | `src/units/types.ts` declares 7 integer enums (`AttributeKind` 0–12, `ClassKind` 0–6, `WeaponKind` 0–5, `ArmorKind` 0–1, `SkillKind`, `EquipmentKind`, `ModifierMode`) and 8 interfaces; line 7 re-exports `IRng` from `@/common/types`; `src/common/types.ts` declares `IRng.next()`; no `get`/`set` accessor syntax anywhere. `tests/units/types.test.ts` pins ordinals and the re-export. `pnpm typecheck` exit 0. |
| 2 | UNIT-01: a unit can be constructed for every class and all 16 documented attributes are readable — 13 numeric via `getAttribute`, plus 职业/装备/加成 via `getClass()`/`getEquipment()`/`getModifiers()`. | ✓ VERIFIED | `src/units/Unit.ts` `getAttribute` is an exhaustive `switch` over all 13 numeric kinds with a `never` guard; `getClass`/`getEquipment`/`getModifiers`/`getSkills` present. `tests/units/attributes.test.ts` reads all 13 kinds finite, constructs every valid `ClassKind`, and exercises class/equipment/modifiers/name. |
| 3 | UNIT-02: all 7 classes have spec-exact level-1 stats, per-level growth, initial equipment and equipment/skill unlock tables, queryable from `CLASS_DEFS`. | ✓ VERIFIED | `src/units/data.ts` `CLASS_DEFS` is `Record<ClassKind, IClassDef>` with 7 entries matching `.planning/reference/ai-marble-kingdom.md` line-by-line (200/60/24/1.0/0.8/70/0.10/0.5/0.5 … 200/48/22/1.1/0.9/85/0.10/0.7/0.4), growth `10L/6` … `12L/4`, and unlock tables (Swordsman Shield@3, Archer ArrowStorm@5 + Helmet@8, Berserker Helmet@2 + 2nd Axe@4 + Charge@6, Hammer Helmet@2 + Spin@6, Knight Shield@6, SwordShield Helmet@7, Spearman Helmet@3 + Shield@8). `tests/units/data-classes.test.ts` asserts every field and every unlock entry. |
| 4 | UNIT-03 + UNIT-04: all 6 weapons and 2 armors expose spec-exact mass / attack ratio / defense ratio / penetration, and every weapon×armor penetration lookup is total. | ✓ VERIFIED | `WEAPON_DEFS: Record<WeaponKind, IWeaponDef>` (6) and `ARMOR_DEFS: Record<ArmorKind, IArmorDef>` (2) match the reference: Longsword 12/1.2/{1.5,0.6}, Shortsword 8/1.0/{1,1}, Axe 16/0.8/{2,1}, Hammer 25/1.5/{5,3}, Bow 6/0.6/{0.4,0.2}, Spear 15/0.8/{2,1.5}; Helmet 8/1.0, Shield 15/1.2. `penetration` is typed `Record<ArmorKind, number>`, so the matrix is exhaustive; `tests/units/data-weapons-armors.test.ts` asserts every value and every weapon×armor lookup finite. |
| 5 | UNIT-05: the 7 randomized attributes (MaxHealth/ControlLevel/Attack/Defense/WeaponRatio/ArmorRatio/Mass) are normally distributed with mean = class base (control level mean 10), σ = mean/8, injected via `IRng`, and always finite/non-negative. | ✓ VERIFIED | `src/units/spawn.ts` rolls exactly those 7 with `sampleNormal(rng, mean, mean/8)` and `CONTROL_LEVEL_BASE` (10); body mass only (no equipment mass). `src/common/rng.ts` implements Box–Muller with a `(0,1]` redraw guard and a `Number.isFinite` + `≥0` clamp. `tests/units/spawn-normal.test.ts` uses an injected deterministic mulberry32 RNG over 100,000 samples: mean within 2% of 200, σ within 5% of 25, Hammer attack mean/σ within tolerance, control-level mean ≈ 10 for all 7 classes, all 7 attributes finite/≥0. |
| 6 | UNIT-06: attack/defense experience uses `R·√(amount−50)` above an exclusive 50 gate, kill experience uses `R_A·10·L`, and reaching `100·(1+R_E)^L` levels the unit with remainder carry and multi-level termination. | ✓ VERIFIED | `src/units/Unit.ts` implements all three formulas plus `#levelThreshold()` and a `while` loop in `#checkLevelUp` (OQ-4). `tests/units/leveling.test.ts` asserts exact XP (5, 5, 15), gate non-earning at 50/49, threshold ≈110 at level 1, remainder carry to level 2, and multi-level from one large grant. |
| 7 | UNIT-06: on level-up, base attributes grow per class (level-scaling Attack, flat Defense, +5 control level, +maxHpGrowth), health is restored by the 生命上限 increase and capped at MaxHealth, and the level's equipment/skill unlock is applied. | ✓ VERIFIED (behaviorally tested) | `Unit.getAttribute` computes Attack `base + 10·L·(L−1)/2`, Defense `base + 6·(L−1)`, ControlLevel `base + 5·(L−1)`, MaxHealth `base + growth·(L−1)` from rolled bases; `#checkLevelUp` restores by the modifier-adjusted MaxHealth delta and clamps; `#applyUnlocks` applies equipment/skills. `tests/units/leveling.test.ts` asserts L2 70/30/15/220, L3 90/36/20/240, health 150→170, the Shield@3 unlock, and the WR-02 case (MaxHealth 400→440, Health 350→390). |
| 8 | The phase gate is genuinely green: `pnpm test`, `pnpm typecheck`, `pnpm lint` all exit 0; no stubs, debt markers, `any`/`@ts-ignore`, or disabled rules were introduced to force green. | ✓ VERIFIED | `pnpm test` → 8 files / 80 tests passed; `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. `src/` and `tests/units/` contain no `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/placeholder markers and no `any`/`@ts-ignore`/`eslint-disable`. `tsconfig.json` keeps `strict: true`; the only lint-config relaxations (`no-explicit-any: off`, etc.) predate this phase. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/units/types.ts` | Unit-system type contract: numeric enums + `I*` interfaces, no logic | ✓ VERIFIED | 247 lines, declaration-only (one `IRng` re-export), JSDoc on every member; no functions/classes/consts. |
| `src/common/types.ts` | Shared `IRng` interface | ✓ VERIFIED | `next(): number` with JSDoc; no runtime logic. |
| `src/common/rng.ts` | `MathRng` + Box–Muller `sampleNormal` | ✓ VERIFIED | 45 lines; `MathRng implements IRng` wraps `Math.random`; `sampleNormal` guards `(0,1]` and clamps/falls back to mean on non-finite. |
| `src/units/data.ts` | Typed const tables + calibration constants | ✓ VERIFIED | 406 lines; `CLASS_DEFS` (7), `WEAPON_DEFS` (6), `ARMOR_DEFS` (2), `ALL_*` arrays, six calibration constants; every top-level const JSDoc'd; single file per D-02. |
| `src/units/Unit.ts` | `class Unit implements IUnit` | ✓ VERIFIED | 329 lines; exhaustive `getAttribute`, rolled-base reads, modifier application on MaxHealth/Attack/Defense, progression state machine, classKind validation. No public member outside `IUnit`; no getters/setters. |
| `src/units/spawn.ts` | `spawnUnit(classKind, rng)` | ✓ VERIFIED | Rolls exactly 7 attributes, injects `IRng`, assigns `<class>#<index>` name, constructs `new Unit(...)`. |
| `tests/units/types.test.ts` | Enum ordinals + alias proof | ✓ VERIFIED | Imports `@/units/types`; pins ordinals; type-level `IRng` re-export assertion. |
| `tests/units/data-classes.test.ts` | 7 class spec assertions | ✓ VERIFIED | 310 lines; every class field, growth value, initial equipment and unlock entry asserted. |
| `tests/units/data-weapons-armors.test.ts` | 6 weapons + 2 armors + matrix | ✓ VERIFIED | 138 lines; all values, both armor keys, and total weapon×armor lookups. |
| `tests/units/attributes.test.ts` | UNIT-01 coverage | ✓ VERIFIED | All 13 numeric kinds finite, rolled-base awareness, full-health spawn, modifiers, damage guard, class validation, name. |
| `tests/units/leveling.test.ts` | UNIT-06 coverage | ✓ VERIFIED | XP formulas, gate, threshold, per-class growth, health restore (incl. modifier-adjusted delta), unlock, multi-level termination. |
| `tests/units/rng.test.ts` | Box–Muller guards | ✓ VERIFIED | Known vector, zero guard, clamp, `u1>1`/non-finite redraw, `MathRng` bounds. |
| `tests/units/spawn-normal.test.ts` | Distribution assertions | ✓ VERIFIED | 100k samples via injected deterministic RNG; mean/σ/non-negativity/names. |
| `tests/units/harness.test.ts` | Runner smoke test | ✓ VERIFIED | Minimal `describe/it/expect`. |
| `vitest.config.ts` | `@`→`src` alias, no stale setupFiles | ✓ VERIFIED | `resolve.alias { '@': join(cwd,'src') }`; `environment: 'node'`; `include: ['tests/**/*.test.ts']`; no `setupFiles`. |
| `tsconfig.json` | Includes `src` + `tests`, strict | ✓ VERIFIED | `include: ["src","tests"]`, `strict: true`, `@/*` path mapping, no `tsconfig.sim.json` reference. |
| `package.json` | Lint toolchain alias | ✓ VERIFIED | `typescript` → `@typescript/typescript6@^6.0.2`, `@typescript/native` → `npm:typescript@^7.0.2`; `pnpm lint` green. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/units/types.ts` | `src/common/types.ts` | `export type { IRng } from '@/common/types'` | ✓ WIRED | Line 7; `tests/units/types.test.ts` asserts the re-export is the same type. |
| `src/units/data.ts` | `src/units/types.ts` | Imports enums + `I*Def` types | ✓ WIRED | `Record<Enum, IDef>` typing makes a missing kind a compile error. |
| `src/units/Unit.ts` | `src/units/data.ts` | Reads `CLASS_DEFS` + calibration constants | ✓ WIRED | Growth, ratios, unlocks and exp constants all consumed in `Unit`. |
| `src/units/Unit.ts` | `src/units/types.ts` | `implements IUnit`, exhaustive `AttributeKind` switch | ✓ WIRED | Typecheck confirms the class satisfies the interface. |
| `src/units/spawn.ts` | `src/common/rng.ts` / `src/common/types.ts` | `sampleNormal(rng, mean, mean/8)` with injected `IRng` | ✓ WIRED | All 7 rolls go through `sampleNormal`; RNG is a parameter. |
| `src/units/spawn.ts` | `src/units/Unit.ts` / `src/units/data.ts` | `new Unit(classKind, attributes, [], name)`; `CLASS_DEFS` + `CONTROL_LEVEL_BASE` means | ✓ WIRED | Unit is constructed from rolled attributes and the counter-based name. |
| `tests/*` | `src/*` via `@/...` | Vitest `@` alias | ✓ WIRED | 8 test files import `@/units/...` / `@/common/...` and pass. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `Unit.getAttribute` | `#hp`, `#level`, `#xp`, rolled `#*Base` | Constructor `ISpawnAttributes` (from `spawnUnit` or direct test roll) | Yes — real rolled values feed every derived read; no static return | ✓ FLOWING |
| `spawnUnit` | 7 rolled attributes | `CLASS_DEFS[classKind]` means + `CONTROL_LEVEL_BASE`, passed to `sampleNormal` | Yes — statistical tests confirm non-zero variance and correct means | ✓ FLOWING |
| `#checkLevelUp` | `#xp`, `#level`, `#hp`, `#equipment` | XP gained via `gain*Experience`; thresholds/unlocks from `CLASS_DEFS` | Yes — tests observe level, growth, health and unlock changes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite (all unit-system behaviors) | `pnpm test` | 8 files / 80 tests passed, exit 0 | ✓ PASS |
| Type contract + implementation typecheck | `pnpm typecheck` | exit 0 | ✓ PASS |
| Lint (including prettier + typescript-eslint) | `pnpm lint` | exit 0 | ✓ PASS |
| Normal-spawn distribution (UNIT-05) | `pnpm test -- tests/units/spawn-normal.test.ts` (covered by full run) | mean/σ assertions pass; all values finite/≥0 | ✓ PASS |
| Level-up state transition incl. WR-02 (UNIT-06) | `pnpm test -- tests/units/leveling.test.ts` (covered by full run) | growth/health/unlock assertions pass | ✓ PASS |

### Probe Execution

N/A — this phase declares no probes and has no `scripts/*/tests/probe-*.sh`; it is a pure in-process TypeScript data model. Verification was performed via the project's Vitest/tsc/ESLint gates (above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| UNIT-01 | 01-01, 01-02, 01-04 | 16 documented unit attributes readable | ✓ SATISFIED | 13 numeric via `getAttribute`; class/equipment/modifiers via dedicated methods; `attributes.test.ts`. |
| UNIT-02 | 01-01, 01-02, 01-03 | 7 classes with initial stats, per-level growth, equipment/skill unlocks | ✓ SATISFIED | `CLASS_DEFS` spec-exact; `data-classes.test.ts`. |
| UNIT-03 | 01-01, 01-02, 01-03 | 6 weapons with attack ratio, mass, weapon×armor penetration | ✓ SATISFIED | `WEAPON_DEFS` + typed total penetration matrix; `data-weapons-armors.test.ts`. |
| UNIT-04 | 01-01, 01-02, 01-03 | 2 armors with defense ratio and mass | ✓ SATISFIED | `ARMOR_DEFS` (Helmet 8/1.0, Shield 15/1.2); `data-weapons-armors.test.ts`. |
| UNIT-05 | 01-01, 01-02, 01-05 | Normal-distributed generation (mean by class, σ = mean/8) for the 7 attributes | ✓ SATISFIED | `spawnUnit` + `sampleNormal`; 100k-sample distribution tests. |
| UNIT-06 | 01-01, 01-02, 01-04 | Exp formulas, threshold level-up, per-class growth, health restore, skill unlock | ✓ SATISFIED | `Unit` progression state machine; `leveling.test.ts` incl. WR-02. |

**Orphaned requirements:** none — all six IDs mapped to Phase 1 in `.planning/REQUIREMENTS.md` appear in at least one plan's `requirements` frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/units/types.ts` | 128–136 | `IEquipment` uses `kind` + optional `weapon?`/`armor?`, so the type permits invalid combinations (e.g. both/neither) — review IN-01 | ℹ️ Info | No Phase-1 consumer reads these fields; this shape is the D-11 contract explicitly required by the must-haves (optional enums, never `| null`), and a discriminated union was an optional review suggestion, not a phase requirement. |
| `src/units/Unit.ts` | 95, 167–178 | Accessors copy arrays but share element objects from `CLASS_DEFS` — review IN-02 | ℹ️ Info | All relevant fields are `readonly`; no mutation path exists today. |
| `src/units/data.ts` | 311–319, 391–405 | `ALL_*_KINDS` arrays are currently consumed by tests only — review IN-04 | ℹ️ Info | Intentional iteration helpers for later systems; not dead code per the research design. |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/placeholder markers; no `any`, `@ts-ignore`, `@ts-nocheck`, or `eslint-disable` in `src/`. No stub returns, hardcoded empty data, or unwired components found.

### Prohibitions Assessment

All plan prohibitions were checked against the codebase:

- **Test-tier** (wired enforcement present, so none are flagged): numeric enums only (`types.test.ts` pins ordinals), completeness via `Record<Enum, IDef>` + table tests, no NaN/Infinity from `getAttribute` (exhaustive switch + finite tests), health never exceeding MaxHealth after restore (level-up clamp tests), spawn values finite/non-negative (`rng` + spawn tests), `@/*` mapping retained (all tests import via alias).
- **Judgment-tier** (inspected, no violation): no getters/setters; no public member outside `IUnit`; no 17th attribute; literal-typed missing fields are optional/`undefined` (not `| null`); `tsconfig` `strict` stays true; no seeded/global RNG (injection only); no gaussian/statistics dependency; no JSON/factory split of the data tables; spec numbers were not silently "improved" (the 剑盾 "弓箭" typo is corrected and documented; `maxHpGrowth` is explicitly marked calibration-pending per OQ-3).

### Human Verification Required

None. All phase behaviors are pure in-process data/domain logic and are exercised by passing automated tests.

**WR-02 assessment (explicitly requested):** the code-review fix changed the level-up health restore from `+maxHpGrowth` to the actual modifier-adjusted MaxHealth delta. This is a behavior-dependent state transition, and it **is** exercised by a dedicated behavioral test — `tests/units/leveling.test.ts` “restores health by the actual modifier-adjusted MaxHealth increase (WR-02)” asserts MaxHealth 200→400 with a `+100%` modifier, then level 2 MaxHealth 440 and Health 350→390. The test passes in the full run, and the no-modifier path is unchanged (150→170). The implementation matches the spec wording “恢复生命上限增加值” (the actual increase in the readable MaxHealth). Therefore no human-verification item is needed; the fixer's "requires human verification" flag is discharged by this passing behavioral test.

### Gaps Summary

None. The phase goal is achieved: the unit data model is complete (16 attributes, 7 classes, 6 weapons, 2 armors), spec-exact against `.planning/reference/ai-marble-kingdom.md`, normally distributed on spawn, and implements the full experience/level-up/unlock state machine. All three quality gates are green (80 tests, typecheck, lint), and no stubs, debt markers, or unwired artifacts were found.

---

_Verified: 2026-10-18T06:18:47Z_
_Verifier: the agent (gsd-verifier)_
