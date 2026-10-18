---
phase: 01-unit-system
plan: 02
subsystem: units
tags: [typescript, type-first, numeric-enums, interfaces, jsdoc, irng, review-gate]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "Wave-0 harness repair (01-01): working pnpm test/typecheck/lint and the `@` alias"
provides:
  - "`src/units/types.ts` — the complete unit-system type contract: 7 numeric enums + 8 `I*` interfaces, JSDoc'd, no runtime logic"
  - "`src/common/types.ts` — the shared `IRng` randomness interface (`next(): number`)"
  - "`IRng` re-exported from `@/units/types` so unit-system importers keep a single path"
  - "`tests/units/types.test.ts` — enum ordinal assertions + `@` alias resolution proof"
  - "User-approved type contract (type-first gate cleared) for plans 01-03…01-05"
affects: [01-unit-system plans 03-05, Phase 2 physics, Phase 3 control, Phase 5 render]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 2342
  tasks: 3
  commits: 6
plan_head_before: 3d35d5af06d783e3d866c95e27f4940a5e6fdafa

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-first gate: declaration-only `types.ts` modules (numeric enums + `I*` interfaces) committed and reviewed before any implementation"
    - "Per-folder `types.ts`: unit-system types in `src/units/types.ts`; generic reusable abstractions (`IRng`) in `src/common/types.ts`"
    - "Missing-value convention D-11: absent object → `null`; absent literal (number/enum/boolean/string) → optional/`undefined`"
    - "No getters/setters: every numeric read goes through `getAttribute(kind: AttributeKind)`"

key-files:
  created:
    - src/units/types.ts
    - src/common/types.ts
    - tests/units/types.test.ts
  modified: []

key-decisions:
  - "Attribute count is 16 (13 numeric reachable via getAttribute; class/equipment/modifiers via dedicated methods) — no 17th attribute"
  - "`IEquipment.weapon`/`armor` are optional enum fields (`weapon?: WeaponKind` / `armor?: ArmorKind`) per D-11 — a missing literal is `undefined`, never `| null`"
  - "Every unit carries a name read via `IUnit.getName(): string` (D-12), assigned at spawn time"
  - "`IRng` lives in `src/common/types.ts` (generic, reusable) and is re-exported from `src/units/types.ts` (D-07/D-09/D-10)"
  - "All kind enums are numeric with explicit integer ordinals; string enums forbidden"

patterns-established:
  - "Enum ordinals pinned by Vitest assertions so a string-enum regression fails the suite"
  - "Cross-folder type re-export proven with `expectTypeOf` at the type level"

requirements-completed: [UNIT-01, UNIT-02, UNIT-03, UNIT-04, UNIT-05, UNIT-06]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "`src/units/types.ts` declares 7 numeric enums with explicit integer ordinals (AttributeKind 13, ClassKind 7, WeaponKind 6, ArmorKind 2, SkillKind 3, EquipmentKind 2, ModifierMode 2)"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/types.test.ts#unit-system types — numeric enums"
        status: pass
    human_judgment: false
  - id: D2
    description: "`src/units/types.ts` declares the 8 `I*` interfaces with JSDoc on every member, including `IUnit.getAttribute` and `getName`"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "pnpm typecheck → exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shared `IRng` interface declared in `src/common/types.ts` and re-exported unchanged through `@/units/types`"
    requirement: UNIT-05
    verification:
      - kind: unit
        ref: "tests/units/types.test.ts#re-exports the same IRng type from @/common/types through @/units/types"
        status: pass
    human_judgment: false
  - id: D4
    description: "Type contract reviewed and approved by the user at the blocking-human type-first gate"
    verification: []
    human_judgment: true
    rationale: "Design approval is a human judgement by definition (ROADMAP type-first gate); automation can prove shape correctness but not that the contract is the right design."

# Metrics
duration: 50min
completed: 2026-10-18
status: complete
---

# Phase 1 Plan 02: Unit-System Type Contract Summary

**Complete unit-system type contract: 7 numeric enums and 8 JSDoc'd `I*` interfaces in `src/units/types.ts`, shared `IRng` in `src/common/types.ts`, user-approved at the type-first gate.**

## Performance

- **Duration:** ~50 min (including the review-gate revision pass)
- **Started:** 2026-10-17T15:31:04Z (89b8904)
- **Completed:** 2026-10-17T16:21:35Z (df6d570)
- **Tasks:** 3 (2 implementation + 1 checkpoint approved)
- **Files modified:** 3 (all created)

## Accomplishments

- **Numeric enum layer**: `AttributeKind` (13 numeric members, `Health=0 … Mass=12`), `ClassKind` (7), `WeaponKind` (6), `ArmorKind` (2), `SkillKind` (3), `EquipmentKind` (2), `ModifierMode` (2) — every member an explicit integer, JSDoc'd with its Chinese name.
- **Interface layer**: `IUnit`, `ISpawnAttributes`, `IEquipment`, `IModifier`, `IUnlockEntry`, `IClassDef`, `IWeaponDef`, `IArmorDef` — all members `readonly` where immutable and JSDoc'd; `IUnit` exposes `getAttribute(kind)` as the single numeric read path, `getName()`, and the progression/damage methods, with no getter/setter anywhere.
- **Missing-value convention applied**: `IEquipment.weapon`/`armor` are optional enum fields (`weapon?: WeaponKind` / `armor?: ArmorKind`) — absent literal → `undefined`, never `| null` (D-11).
- **Shared randomness seam**: `IRng` (`next(): number`) now lives in `src/common/types.ts` and is re-exported from `src/units/types.ts`; `IWeaponDef.penetration` is `Readonly<Record<ArmorKind, number>>` so the weapon×armor lookup is total and type-checked.
- **Gate cleared**: at the blocking-human review the user approved the design after requesting a revision pass (D-11 optional-literal typing, D-12 `getName()`, and the `IRng` move to `src/common/`), which was implemented in `d61b262` and `df6d570`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write `src/units/types.ts` + `src/common/types.ts`** — `89b8904` (feat) → revised `d61b262` (refactor)
2. **Task 2: Add `tests/units/types.test.ts`** — `60116f2` (test) → revised `df6d570` (test)
3. **Task 3: Type-first review gate** — no commit (human checkpoint, **approved**)

**Plan metadata:** `_metadata commit_` (docs: complete plan)

The revision pass also produced two planning commits between the initial code and the revised code: `f676da8` (plans revised for D-11/D-12 + `IRng` move) and `5b9bb90` (conventions recorded).

## Files Created/Modified

- `src/units/types.ts` — 7 numeric enums + 8 `I*` interfaces; `export type { IRng } from '@/common/types'` is the only non-declaration line.
- `src/common/types.ts` — the shared `IRng` interface (`next(): number`), with JSDoc; nothing else.
- `tests/units/types.test.ts` — pins enum ordinals, verifies all 13 `AttributeKind` members are integers with reverse mappings, and asserts `IRng` identity across the re-export with `expectTypeOf`.

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Tests | `pnpm test` | exit 0 — 2 files, 7 tests passed |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Type presence | plan `<automated>` presence check | all required enums/interfaces + `IRng` present (`TYPES_OK`) |
| Design review | blocking-human checkpoint | **approved** (after revision pass) |

## Decisions Made

- **13 numeric attributes, 16 total**: 职业/装备/加成 are non-numeric and read through dedicated methods, not `AttributeKind`; no 17th attribute invented.
- **Optional literals, not `null`**: D-11 was applied to `IEquipment.weapon`/`armor`; the revision pass confirmed no other literal-typed nullable field exists in the contract.
- **Per-unit name via dedicated method**: `getName(): string` (D-12), set at spawn time — `"<class name>#<index>"` by `spawnUnit`, class name fallback for direct construction.
- **`IRng` under `src/common/`**: generic reusable abstraction moved out of `src/units/` per AGENTS.md convention #9 and D-07/D-09/D-10; unit types re-export it for a single import path.
- **No `normal()` on `IRng`**: keeps test stubs trivial; Box–Muller (`sampleNormal`) belongs in `src/common/rng.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Revision pass re-typed absent literal fields and moved `IRng` to `src/common/`**
- **Found during:** Task 3 (type-first review gate)
- **Issue:** The initial contract typed `IEquipment.weapon`/`armor` as `| null` (violating the project null/undefined convention) and kept `IRng` in the unit folder despite being a generic shared abstraction; the user requested revisions.
- **Fix:** Switched to optional enum fields (`weapon?: WeaponKind` / `armor?: ArmorKind`), added `getName()` to `IUnit`, moved `IRng` to `src/common/types.ts` with a re-export, and updated the cross-folder test accordingly.
- **Files modified:** `src/units/types.ts`, `src/common/types.ts`, `tests/units/types.test.ts`
- **Verification:** `pnpm test` (7 passed), `pnpm typecheck`, `pnpm lint` all exit 0; user approved the revised design.
- **Committed in:** `d61b262` (types) and `df6d570` (test), superseding `89b8904` / `60116f2`.

---

**Total deviations:** 1 (Rule 2, driven by the review gate)
**Impact on plan:** Contract-level corrections only; no scope creep. The revision pass is exactly what the type-first gate exists to surface.

## Issues Encountered

None beyond the requested revision pass. No package installs, no auth gates, no environment blockers.

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surface. The type module imports nothing (no dependency added, matching T-01-SC); enum ordinals are pinned by tests (T-01-05); the human review gate (T-01-04) was exercised and cleared.

## Next Phase Readiness

- The unit-system contract is **frozen and approved** — plans 01-03 (`data.ts`), 01-04 (`Unit implements IUnit`), and 01-05 (`IRng`/`sampleNormal`/`spawnUnit`) can proceed.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` remain green, so every later plan starts from a verified harness.
- The `@` alias is proven end-to-end at runtime (`tests/units/types.test.ts` importing `@/units/types`), completing the Wave-0 repair's promise.

---
*Phase: 01-unit-system*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Created files present on disk: `src/units/types.ts`, `src/common/types.ts`, `tests/units/types.test.ts` ✓
- Task commits present: `89b8904`, `60116f2`, `d61b262`, `df6d570` (+ planning revisions `f676da8`, `5b9bb90`) ✓
- Gates re-run and green: `pnpm test` (7 passed), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0) ✓
- Design-review checkpoint resolved: **approved** ✓
