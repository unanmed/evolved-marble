---
phase: 01-unit-system
plan: 04
subsystem: units
tags: [typescript, class-implements-interface, numeric-enums, derived-values, leveling-state-machine, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "Wave 1 type contract (01-02): `IUnit` + `ISpawnAttributes` + 7 numeric enums (user-approved)"
  - phase: 01-unit-system
    provides: "Wave 2 data tables (01-03): `CLASS_DEFS`, growth coefficients, unlock tables, and the exp/level calibration constants"
provides:
  - "`src/units/Unit.ts` — `class Unit implements IUnit`: the single exhaustive `getAttribute(kind)` read path (rolled spawn bases + level-derived growth) plus `getName`/`getClass`/`getEquipment`/`getModifiers`/`getSkills`/`takeDamage`/`isAlive`/`gain*Experience`"
  - "`tests/units/attributes.test.ts` — UNIT-01 coverage: every numeric attribute finite, rolled-base awareness, spawn-at-full-health, modifier injection, name-at-construction"
  - "`tests/units/leveling.test.ts` — UNIT-06 coverage: exp formulas with the >50 gate, `100(1+R_E)^L` threshold, per-class growth (OQ-2), health restore cap, level-3 unlock"
affects: [01-unit-system plan 05 (spawnUnit constructs Unit), Phase 2 physics (reads getAttribute), Phase 3 control, Phase 5 render (HUD HP/level)]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 5325
  tasks: 2
  commits: 3
  plan_head_before: a15a9f5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "`class Unit implements IUnit` with ES private (`#`) fields; every private field/method JSDoc'd; no public member outside `IUnit`; no getters/setters"
    - "Derived values are recomputed on every read from `#level` + the rolled `#*Base` fields — never stored (D-04)"
    - "Rolled spawn bases (`ISpawnAttributes`) are the source of truth for level-1 stats; `#def.*` statics supply only growth coefficients/ratios — spawn randomization stays observable (σ≠0)"
    - "`getAttribute` is an exhaustive `switch` with a `never` guard in the `default` branch that throws (no value path)"
    - "TDD RED→GREEN for the attributes task (`test(01-04)` then `feat(01-04)`)"

key-files:
  created:
    - src/units/Unit.ts
    - tests/units/attributes.test.ts
    - tests/units/leveling.test.ts
  modified: []

key-decisions:
  - "Attack growth is level-scaling `base + attackGrowth·L·(L−1)/2`; defense growth is flat `base + defenseGrowth·(L−1)` — both computed from `#level`, distinct shapes per OQ-2"
  - "`MaxHealth`/`Attack`/`Defense`/`ControlLevel` read the rolled spawn bases (`#maxHpBase`/`#attackBase`/`#defenseBase`/`#controlLevelBase`), NOT the `#def.*` statics, so a roll ≠ class base is reflected (keeps 01-05's distribution tests viable)"
  - "Constructor sets `#hp` from the level-1 `MaxHealth` returned by `getAttribute` (rolled base + injected modifiers), so a unit always spawns at full health even when the roll differs from the class base"
  - "`#modifiers` is assigned before `#hp`; `#applyModifiers` is called only for the three combat stats (MaxHealth/Attack/Defense) — a documented Phase 1 scope boundary; `IModifier` is unchanged"
  - "A single xp grant may trigger multiple level-ups: the threshold is subtracted, the remainder carried, and the check loops (OQ-4); classes with no skill unlock keep an empty skill list (OQ-7)"

patterns-established:
  - "Private state + `#applyModifiers(flat/multiplicative)` clamp → `(base + Σflat)·Π(1+mult)` clamped to ≥0"
  - "Level-scaling vs flat growth encoded as two small private helpers (`#attackValue`, `#defenseValue`) rather than inline arithmetic"

requirements-completed: [UNIT-01, UNIT-06]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "`class Unit implements IUnit` exposes a single exhaustive `getAttribute(kind)` returning a finite number for every one of the 13 numeric `AttributeKind` members (never guard on the default branch)"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/attributes.test.ts#returns a finite number for every AttributeKind"
        status: pass
      - kind: unit
        ref: "tests/units/attributes.test.ts#covers all 13 numeric AttributeKind members without NaN/Infinity/undefined"
        status: pass
    human_judgment: false
  - id: D2
    description: "Level-derived reads (MaxHealth/Attack/Defense/ControlLevel) are computed from `#level` and the rolled spawn bases, so a roll differing from the class base is reflected through `getAttribute`"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/attributes.test.ts#reflects a roll that differs from the class base at level 1"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#grows Attack (level-scaling), Defense (flat), ControlLevel (+5) and MaxHealth (+maxHpGrowth)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A freshly constructed unit spawns at full health: `Health === MaxHealth` even when the rolled maxHp differs from the class base"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/attributes.test.ts#sets Health equal to the rolled MaxHealth when the roll differs from the base"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#spawns at full health"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-numeric accessors complete the 16-attribute set: `getClass`/`getEquipment`/`getModifiers`/`getSkills` return faithful copies and `getName()` returns the name fixed at construction (explicit arg verbatim; class-name fallback)"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/attributes.test.ts#exposes class, initial equipment, modifiers, skills and a non-empty name"
        status: pass
      - kind: unit
        ref: "tests/units/attributes.test.ts#returns an explicit name verbatim"
        status: pass
      - kind: unit
        ref: "tests/units/attributes.test.ts#falls back to the class name when the name argument is omitted"
        status: pass
    human_judgment: false
  - id: D5
    description: "Injected modifiers are observable: `getModifiers()` returns the injected list and `getAttribute` reflects flat/multiplicative contributions for MaxHealth/Attack/Defense (other kinds intentionally out of scope this phase)"
    requirement: UNIT-01
    verification:
      - kind: unit
        ref: "tests/units/attributes.test.ts#applies a flat modifier to Attack"
        status: pass
      - kind: unit
        ref: "tests/units/attributes.test.ts#applies a multiplicative modifier to Attack"
        status: pass
    human_judgment: false
  - id: D6
    description: "The experience/level-up state machine: `R·√(amount−50)` attack/defense exp with an exclusive gate, `R_A·10·L` kill exp, `100(1+R_E)^L` threshold with remainder carry and multi-level termination, per-class growth, health restore capped at MaxHealth, and the unlock table applied at each level"
    requirement: UNIT-06
    verification:
      - kind: unit
        ref: "tests/units/leveling.test.ts#earns R_A·√(D−50) attack experience only above the 50 gate"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#earns R_D·√(ΔD−50) defense experience only above the 50 gate"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#levels up when experience reaches the threshold and carries the remainder"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#restores health by the MaxHealth increase and never exceeds MaxHealth"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#grants the Shield armor at level 3"
        status: pass
      - kind: unit
        ref: "tests/units/leveling.test.ts#raises the level by more than one from a single large grant"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-18
status: complete
---

# Phase 1 Plan 04: Unit Core Implementation Summary

**`class Unit implements IUnit` — a single exhaustive `getAttribute` switch reading rolled spawn bases plus level-derived growth (level-scaling Attack, flat Defense), with the full experience/level-up/unlock state machine (UNIT-01, UNIT-06).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-18T13:32:00Z (base `a15a9f5`)
- **Completed:** 2026-10-18T13:38:00Z (`31383e0`)
- **Tasks:** 2 (Task 1 `tdd=true`, Task 2 `auto`)
- **Files modified:** 3 (all created)

## Accomplishments

- **`src/units/Unit.ts` (`class Unit implements IUnit`)** — all state is ES-private (`#`), JSDoc'd, and no public member exists outside `IUnit`; no getters/setters.
- **Single read path** — `getAttribute(kind)` is an exhaustive `switch` over all 13 numeric `AttributeKind` members with a `never` guard in the `default` branch that throws, so no kind can ever read `undefined`/`NaN`.
- **Rolled bases, not class statics** — `MaxHealth`/`Attack`/`Defense`/`ControlLevel` compute from the rolled `#maxHpBase`/`#attackBase`/`#defenseBase`/`#controlLevelBase`; `#def.*` supplies only growth coefficients and ratios. A roll ≠ class base is therefore observable (keeps spawn randomization, σ≠0, for 01-05).
- **OQ-2 growth shapes** — Attack is level-scaling (`base + attackGrowth·L·(L−1)/2`; Swordsman L3 = 90), Defense is flat per-level (`base + defenseGrowth·(L−1)`; Swordsman L3 = 36), `MaxHealth = maxHpBase + maxHpGrowth·(L−1)` (L2 = 220), `ControlLevel` +5/level. All recomputed per read, never stored.
- **Spawn at full health** — the constructor seeds `#hp` from the level-1 `MaxHealth` returned by `getAttribute` (rolled base + injected modifiers), so `Health === MaxHealth` even when the roll differs from the class base.
- **Progression state machine** — `gainAttackExperience`/`gainDefenseExperience`/`gainKillExperience` apply the exact spec formulas (exclusive `>50` gate; `R_A·10·L` kill exp); `#checkLevelUp` subtracts the `100(1+R_E)^L` threshold, carries the remainder, loops for multi-level grants (OQ-4), restores `#hp` by `+maxHpGrowth` capped at the readable 生命上限, and applies the level's unlock entry (equipment + skills; empty skill sets allowed, OQ-7).
- **Modifier injection scope** — an optional `readonly IModifier[]` constructor argument is the only way to observe a non-empty modifier list this phase; `#applyModifiers` is wired into exactly MaxHealth/Attack/Defense (documented boundary; `IModifier`/`IUnit` unchanged).
- **Tests** — 21 new assertions across 2 files (11 + 10), all green; full suite 6 files / 57 tests passing.

## Task Commits

Executed with TDD for Task 1 (RED → GREEN), then a single commit for Task 2:

1. **Task 1 (RED): add failing Unit attribute tests** — `4a32ca7` (test) — test failed with `Cannot find package '@/units/Unit'` before implementation
2. **Task 1 (GREEN): implement class Unit** — `04c7d6d` (feat)
3. **Task 2: add Unit leveling/progression tests** — `31383e0` (test)

**Plan metadata:** `_metadata commit_` (docs: complete 01-04 plan)

## Files Created/Modified

- `src/units/Unit.ts` — `class Unit implements IUnit`; imports only `@/units/data` (tables + calibration constants) and `@/units/types`; no top-level `const`.
- `tests/units/attributes.test.ts` — rolled-base awareness, finiteness of all 13 kinds, damage/death, non-numeric accessors, modifier injection, name-at-construction.
- `tests/units/leveling.test.ts` — exp formulas + gate, threshold/level change, OQ-2 growth, health restore cap, level-3 Shield unlock, multi-level termination.

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Tests (Task 1) | `pnpm test -- tests/units/attributes.test.ts` | exit 0 — 11 passed |
| Tests (Task 2) | `pnpm test -- tests/units/leveling.test.ts` | exit 0 — 10 passed |
| Full suite | `pnpm test` | exit 0 — 6 files, 57 tests passed |
| Typecheck | `pnpm typecheck` | exit 0 (`Unit` satisfies `IUnit`; tests type-check) |
| Lint | `pnpm lint` | exit 0 |

## Decisions Made

- **Rolled bases over class statics**: level-1 reads come from `ISpawnAttributes`; `#def.*` provides only growth coefficients/ratios (protects 01-05's distribution assertions).
- **Level-scaling vs flat growth (OQ-2)**: Attack uses `L·(L−1)/2`; Defense is flat per-level — encoded as two private helpers rather than inline arithmetic.
- **Modifier scope (Phase 1)**: `#applyModifiers` is invoked only for MaxHealth/Attack/Defense; a modifier on any other kind is returned by `getModifiers()` but intentionally not applied yet (`IModifier` unchanged).
- **Full-health spawn**: `#hp` is seeded from the same modified `MaxHealth` the accessor returns, so the restore cap and the readable 生命上限 can never disagree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier formatting pass**
- **Found during:** Task 1 lint run
- **Issue:** 10 `prettier/prettier` errors from line-wrapping in `Unit.ts` and `attributes.test.ts` (long call/argument expressions).
- **Fix:** `pnpm exec prettier --write src/units/Unit.ts tests/units/attributes.test.ts` (formatting only; no semantic change). The reformat of the RED test file was folded into the GREEN commit.
- **Files modified:** `src/units/Unit.ts`, `tests/units/attributes.test.ts`
- **Verification:** `pnpm lint` exit 0; `pnpm test -- tests/units/attributes.test.ts` still 11 passed.
- **Committed in:** `04c7d6d` (GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Formatting only; no scope creep, no behavior change.

## Issues Encountered

- **Floating-point threshold**: `100·(1+R_E)^L` is not exact in IEEE-754 (`100·1.1 ≈ 110.00000000000001`), so a level-1 grant of exactly 110 would *not* level up. Tests use grants with a safe margin (e.g. 100 → no level-up, 150 → level-up) and `toBeCloseTo` for the carried remainder, keeping assertions exact without depending on float equality at the boundary.
- No package installs, no auth gates, no environment blockers.

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surface. `Unit.ts` imports only `@/units/*` (no dependency added, satisfying T-01-SC). Threat-register mitigations are implemented: T-01-08 (exhaustive switch + `never` guard, no `undefined` path), T-01-09 (health restore clamped with `Math.min` to the readable 生命上限), T-01-10 (threshold subtraction guarantees `#checkLevelUp` termination; the multi-level grant test exercises it).

## Next Phase Readiness

- `Unit` is the object every later system reads; `getAttribute` is now stable and fully covered, so Phase 2 physics / Phase 3 control / Phase 5 render can depend on it.
- `spawnUnit` (01-05) constructs `Unit` with the rolled `ISpawnAttributes` (and an optional name) — the constructor's `(classKind, roll, modifiers?, name?)` shape is ready for it.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` are all green, so 01-05 starts from a verified harness.

---

*Phase: 01-unit-system*
*Completed: 2026-10-18*

## Self-Check: PASSED

- Created files present on disk: `src/units/Unit.ts`, `tests/units/attributes.test.ts`, `tests/units/leveling.test.ts` ✓
- Task commits present: `4a32ca7` (RED test), `04c7d6d` (GREEN feat), `31383e0` (leveling test) ✓
- Measured commits from ledger base `a15a9f5`: 3 ✓
- Gates green: `pnpm test` (57 passed), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0) ✓
