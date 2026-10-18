---
phase: 01-unit-system
reviewed: 2026-10-18T05:53:13Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - package.json
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
findings:
  critical: 2
  warning: 3
  info: 4
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-18T05:53:13Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 1 ships a headless unit data-model: numeric enums + `I*` interfaces (`src/units/types.ts`, `src/common/types.ts`), typed constant tables (`src/units/data.ts`), the `Unit` progression state machine (`src/units/Unit.ts`), an injectable RNG with a Box–Muller sampler (`src/common/rng.ts`), and normal-distributed spawning (`src/units/spawn.ts`).

Ground-truth checks: `tsc --noEmit` (TS 7.0.2 CLI, `.bin/tsc.cmd`) exits 0; `vitest run` reports 8 files / 67 tests passing. All spec-derived numeric tables (`CLASS_DEFS`, `WEAPON_DEFS`, `ARMOR_DEFS`, the 50/10/100 gates, `CONTROL_LEVEL_BASE`/`+5`) were transcribed and cross-checked line-by-line against `.planning/reference/ai-marble-kingdom.md` and match exactly, including the documented 剑盾 "弓箭" typo correction. The documented project conventions (interface-first, one `types.ts` per folder, numeric-only enums, JSDoc on interface members / private members / top-level consts, no getters/setters, no public member outside an interface) are all satisfied in the reviewed source.

The implementation is faithful to its plan (D-01..D-12, OQ-2/OQ-3/OQ-4/OQ-6/OQ-7), but the plan's own threat model (`01-04-PLAN.md` T-01-08/T-01-09; `01-05-PLAN.md` T-01-11 — "negative or non-finite inputs must not corrupt state") is **not enforced anywhere in code**. Mutator inputs are unvalidated, so `NaN`/`Infinity`/negative values silently corrupt `#hp`/`#xp` (and can blow the level up to thousands). Two Critical and three Warning findings below; the data tables and the RNG/spawn path are otherwise sound.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: `takeDamage` accepts non-finite/negative input and corrupts `#hp` (Health returns `NaN`, or exceeds MaxHealth)

**File:** `src/units/Unit.ts:177-179`
**Issue:** `takeDamage(amount)` computes `this.#hp = Math.max(0, this.#hp - amount)` with no validation of `amount`.
- `takeDamage(NaN)` → `Math.max(0, NaN)` evaluates to **`NaN`** (verified: `Math.max(0, NaN) === NaN`). `#hp` becomes `NaN` permanently; `getAttribute(AttributeKind.Health)` then returns `NaN` and `isAlive()` returns `false` (`NaN > 0` is false), i.e. the unit instantly reads as dead and every downstream consumer of Health gets `NaN`.
- `takeDamage(-100)` → `#hp` **increases**, and can exceed `MaxHealth`, breaking the documented invariant "生命值被生命上限约束" (spec §单位 / reference:106-108). There is no upper clamp anywhere (`getAttribute(Health)` returns `#hp` verbatim).

This directly violates the phase's stated prohibition "MUST NOT return NaN/Infinity/undefined from `getAttribute` for any AttributeKind" (`01-04-PLAN.md` T-01-08) and the trust-boundary row "`takeDamage`/`gain*Experience` accept raw numbers ... negative or non-finite inputs must not corrupt state" (`01-04-PLAN.md` threat model). `Unit`'s `attributes.test.ts` only exercises positive finite damage, so the tests do not catch it.

**Fix:**
```ts
takeDamage(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }
    this.#hp = Math.max(0, Math.min(this.#hp - amount, this.#maxHealth()));
}
```
(Clamping to `this.#maxHealth()` also restores the "Health ≤ MaxHealth" invariant; keep the lower clamp at 0.)

#### CR-02: `gainKillExperience` accepts non-finite/negative input and corrupts `#xp` (Experience returns `NaN`/`Infinity`, level can inflate to thousands)

**File:** `src/units/Unit.ts:207-211` (with `#checkLevelUp` at `src/units/Unit.ts:261-271`)
**Issue:** `gainKillExperience(enemyLevel)` adds `#def.attackExpRatio * KILL_EXP_LEVEL_FACTOR * enemyLevel` to `#xp` with no validation, then runs the multi-level loop.
- `gainKillExperience(NaN)` → `#xp = NaN`; `getAttribute(Experience)` returns `NaN`. `#checkLevelUp` then never fires (`NaN >= threshold` is false), so the `NaN` is permanently sticky and contaminates every subsequent `getAttribute(Experience)` read.
- `gainKillExperience(Infinity)` → `#xp = Infinity`; the `#checkLevelUp` loop runs to the point where `1.1 ** level` overflows: verified ~7,399 iterations, ending at **level ≈ 7400 with `#xp = NaN`** (`Infinity - Infinity = NaN`). A single bad call silently destroys the unit's progression state (and, in a hot loop over many units, is an avoidable thousands-of-iterations stall).
- `gainKillExperience(-5)` → negative `#xp` (no floor), again outside any invariant.

Unlike `gainAttackExperience`/`gainDefenseExperience` (whose `> gate` comparison incidentally rejects `NaN`), the kill path has no gate, so it is fully exposed. This violates the same T-01-08 prohibition and the mutator trust boundary.

**Fix:**
```ts
gainKillExperience(enemyLevel: number): void {
    if (!Number.isFinite(enemyLevel) || enemyLevel <= 0) {
        return;
    }
    this.#xp += this.#def.attackExpRatio * KILL_EXP_LEVEL_FACTOR * enemyLevel;
    this.#checkLevelUp();
}
```
Apply the same `Number.isFinite(...) && x > gate` guard to `gainAttackExperience`/`gainDefenseExperience` inputs for defence-in-depth (they are currently safe only by accident of the comparison operator).

### Warnings

#### WR-01: `sampleNormal` only guards `u1 <= 0`; a non-finite/out-of-range RNG value still yields `NaN`

**File:** `src/common/rng.ts:34-42`
**Issue:** The zero guard `while (u1 <= 0) u1 = rng.next();` handles a `0` (and negative) draw, but a draw `> 1` produces `-2 * Math.log(u1) < 0`, so `Math.sqrt(negative) === NaN`, `z` is `NaN`, and the final `Math.max(0, mean + z * sd)` evaluates to **`NaN`** (`Math.max(0, NaN) === NaN` — verified) — the clamp does *not* protect against `NaN`. `sampleNormal` (and therefore every spawned attribute) can then be `NaN`. `01-05-PLAN.md` T-01-11 explicitly claims the guard+clamp stops a wayward RNG from yielding `NaN`/`Infinity`; that claim holds only for the `≤ 0` case. `IRng.next()` is a documented contract (`[0,1)`), so this requires a misbehaving injected source — but the injection seam is exactly where the tests/threat model promise robustness.

**Fix:** also reject/repair out-of-range draws, or hard-guarantee the result:
```ts
let u1 = rng.next();
while (!(u1 > 0) || u1 > 1) {
    u1 = rng.next();
}
// ... and guard the final value:
const sample = mean + z * sd;
return Number.isFinite(sample) ? Math.max(0, sample) : mean;
```

#### WR-02: Level-up health restore uses raw `maxHpGrowth`, not the actual (modifier-adjusted) MaxHealth increase

**File:** `src/units/Unit.ts:265-268`
**Issue:** The restore is `this.#hp = Math.min(this.#hp + this.#def.maxHpGrowth, this.#applyModifiers(AttributeKind.MaxHealth, this.#maxHealth()))`. The spec says a level-up restores the **"生命上限增加值"** (the *increase in MaxHealth* — reference:107). With no modifiers the delta of `#maxHealth()` per level is exactly `maxHpGrowth`, so this matches. But the constructor already accepts injected `IModifier[]` that scale `MaxHealth`, so the case is reachable: with a `Multiplicative` MaxHealth modifier of `+1.0`, a level 1→2 Swordsman goes MaxHealth 400→440 (delta 40) but the code adds only 20 (`400 + 20 = 420`), i.e. it under-restores by the modifier factor. Conversely a `< 1` multiplier is masked by the `Math.min` cap. The restore should track the same quantity the accessor exposes.

**Fix:** compute the delta from the accessor-consistent value:
```ts
const previousMax = this.#applyModifiers(AttributeKind.MaxHealth, this.#maxHealth()); // before increment
this.#level += 1;
const currentMax = this.#applyModifiers(AttributeKind.MaxHealth, this.#maxHealth());
this.#hp = Math.min(this.#hp + (currentMax - previousMax), currentMax);
```
(or, if the injected-modifier case is explicitly out of Phase-1 scope, document that the restore is intentionally pre-modifier).

#### WR-03: `Unit` constructor does not validate `classKind`; a bad ordinal throws an opaque `TypeError`

**File:** `src/units/Unit.ts:75-77`
**Issue:** `this.#def = CLASS_DEFS[classKind]` then `this.#name = name ?? this.#def.name`. `classKind: ClassKind` is a numeric enum, so at runtime it can be any `number`; for an out-of-range ordinal `CLASS_DEFS[classKind]` is `undefined` and the failure surfaces later as `Cannot read properties of undefined (reading 'name')`, far from the true cause. `spawnUnit` always passes a valid member, so this is latent, but `Unit` is the exported core contract later systems will construct directly.

**Fix:** fail fast with a clear message:
```ts
const def = CLASS_DEFS[classKind];
if (def === undefined) {
    throw new RangeError(`Unknown ClassKind: ${String(classKind)}`);
}
this.#def = def;
```

### Info

#### IN-01: `IEquipment` is not a discriminated union and permits invalid states

**File:** `src/units/types.ts:128-136`
**Issue:** `kind: EquipmentKind` is described as a discriminant, but `weapon?`/`armor?` are both optional, so the type accepts `{ kind: EquipmentKind.Weapon }` (no weapon) and `{ kind: EquipmentKind.Weapon, weapon: ..., armor: ... }` (both slots). Nothing in Phase 1 consumes these fields, so there is no runtime bug yet, but invalid data can be produced by any future writer without a compile error.

**Fix:** express it as a union while keeping the per-folder `types.ts` convention:
```ts
export type IEquipment =
    | { readonly kind: EquipmentKind.Weapon; readonly weapon: WeaponKind }
    | { readonly kind: EquipmentKind.Armor; readonly armor: ArmorKind };
```

#### IN-02: Accessors return shallow copies; equipment element objects are shared across every unit of a class

**File:** `src/units/Unit.ts:90, 161-174`
**Issue:** `#equipment = [...this.#def.initialEquipment]` copies the array but not the elements, and `#applyUnlocks` pushes the shared `entry.equipment` objects. `getEquipment()`/`getModifiers()`/`getSkills()` likewise copy the array, not the elements — so all units of a class share the same `IEquipment` object identities from the module-level `CLASS_DEFS`. The types are `readonly`, so this is safe today, but a future consumer mutating a returned element would corrupt the shared table across all units.

**Fix:** either keep the elements immutable/frozen, or deep-copy on the way out (`getEquipment(): readonly IEquipment[] { return this.#equipment.map(e => ({ ...e })); }`). At minimum, document the shared-identity assumption on `getEquipment`.

#### IN-03: `vitest.config.ts` resolves the `@` alias from `process.cwd()`

**File:** `vitest.config.ts:17-21`
**Issue:** `alias: { '@': join(process.cwd(), 'src') }` assumes Vitest is always launched with the repo root as cwd. If invoked from a subdirectory (or by an editor/tool with a different cwd), `@/units/...` stops resolving and every test file fails with an unrelated import error. `vite.config.ts:10-12` shares the same pattern, so the two stay consistent, but both are cwd-sensitive.

**Fix:** derive the path from the config file instead, e.g. `fileURLToPath(new URL('./src', import.meta.url))`.

#### IN-04: `ALL_CLASS_KINDS` / `ALL_WEAPON_KINDS` / `ALL_ARMOR_KINDS` are unused by `src/`

**File:** `src/units/data.ts:311-319, 391-398, 403-405`
**Issue:** These ordered iteration arrays are exported but consumed only by test files in this phase; no production module imports them yet. This is expected (the research doc designed them as the sanctioned way to iterate numeric enums for later systems) rather than a defect, but flagging it so a future cleanup pass does not delete them as "dead exports".

**Fix:** none required; if they remain unused after the next phase that iterates classes/weapons, reconsider narrowing their visibility.
