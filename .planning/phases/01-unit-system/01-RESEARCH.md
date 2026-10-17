# Phase 1: 单位系统 (Unit System) - Research

**Researched:** 2026-10-17
**Domain:** Data-driven domain model in TypeScript (unit attributes, class/weapon/armor tables, normal-distributed generation, level/exp progression)
**Confidence:** MEDIUM-HIGH (in-repo spec + environment: HIGH; external algorithm/library facts: MEDIUM; unresolved spec ambiguities are flagged)

> **Provenance tags used throughout:** `[VERIFIED: <source>]` = confirmed via tool AND authoritative source (or a source-of-truth file `Read` this session, with verbatim quote). `[CITED: <url>]` = referenced from official/authoritative documentation. `[ASSUMED]` = training knowledge or spec inference, **needs user confirmation** — see Assumptions Log.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**数值表组织**
- **D-01:** 职业/武器/防具数值存为**类型化常量表**（TS 顶层 `const` + JSDoc），不使用 JSON 数据文件、不使用工厂函数。
- **D-02:** 数值表**单文件集中**在 `src/units/data.ts`（不按类别拆分、不逐项拆文件）。

**对象与派生模型**
- **D-03:** 单位用 `class Unit implements IUnit` 表示（数据 + 方法，符合 interface-first 约定）。 — **Reversibility:** costly — `IUnit` 是后续物理/操控/渲染系统共同依赖的核心契约，改动波及所有引用方。
- **D-04:** 随等级成长的派生属性**不存储**，由**统一方法** `getAttribute(kind: AttributeKind): number` 实时计算。 — **Reversibility:** costly — 所有属性读取都将经由该方法，替换需改动全部调用点。
- **D-05:** **禁止 getter/setter**（用户明确偏好）；属性读取一律走专门方法。
- **D-06:** 装备用**列表**表示（武器/防具，带 kind 区分），加成用 `IModifier` **修正器列表**表示；解锁表决定装备/技能在何时获得。

**随机源**
- **D-07:** 单位生成随机走**可注入的 `IRng` 接口**；默认实现包 `Math.random`（无确定性要求，抽象目的是便于测试注入固定序列）。
- **D-08:** 正态生成（均值按职业、σ = 均值/8）后**截断到非负**，保证属性（生命上限/控制等级/攻击/防御/武器比率/防具比率/质量）不为负。

**模块布局**
- **D-09:** 单位系统代码放在 `src/units/`（如 `types.ts` / `data.ts` / `Unit.ts` / `rng.ts`）；导入走路径别名 `@/units/...`（tsconfig 已配 `@/*` → `./src/*`）。 — **Reversibility:** costly — 目录/路径改动会波及后续所有系统的 import。
- **D-10:** 单位系统的**所有类型与枚举**（`IUnit`、`AttributeKind`、`ClassKind`、`WeaponKind`、`ArmorKind`、`IClassDef`、`IWeaponDef`、`IArmorDef`、`IModifier`、`IRng` 等）集中在 `src/units/types.ts`（遵守"每文件夹一个 types.ts"）。

### the agent's Discretion
- 枚举的具体成员命名与取值、`IClassDef`/`IWeaponDef`/`IArmorDef`/`IModifier` 的字段结构细节。
- 正态分布的具体算法（如 Box–Muller）、`IRng` 的方法集（如 `next()` / `normal()` 的取舍）。
- `data.ts` 的内部组织、各方法的具体签名（除已定的 `getAttribute(kind)` 形态外）。
- 升级/经验公式的落地细节以参考文档为准（实测后校准）。

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UNIT-01 | 单位拥有文档定义的属性集合（生命值、生命上限、等级、经验值、经验比率、攻击经验比率、防御经验比率、控制等级、基础攻击力、基础防御力、加成、装备、职业、武器比率、防具比率、质量） | §Attribute Enumeration + §Pattern 2 `getAttribute`; the enumeration is **16 items, not 17** — flagged in Open Question OQ-1 |
| UNIT-02 | 定义 7 个职业（剑士、弓箭手、狂战士、锤兵、骑士、剑盾、长矛兵）的初始属性、每级成长与装备/技能解锁表 | §Class Table (verbatim spec values) + §Pattern 1 typed const tables + §Pattern 3 unlock table; growth interpretation flagged OQ-2 |
| UNIT-03 | 定义 6 种武器（长剑、短剑、斧头、锤子、弓箭、长矛）的攻击比率、质量与对各防具的破甲比率 | §Weapon Table (verbatim) + `Record<ArmorKind, number>` penetration matrix pattern |
| UNIT-04 | 定义 2 种防具（头盔、盾牌）的防御比率与质量 | §Armor Table (verbatim) |
| UNIT-05 | 单位生成属性按正态分布随机（均值按职业，标准差 = 均值/8），作用于生命上限/控制等级/攻击/防御/武器比率/防具比率/质量 | §Pattern 4 Box–Muller + `IRng` injection + §Code Examples `sampleNormal`; test strategy §Validation Architecture |
| UNIT-06 | 升级机制——按攻击/防御经验公式与击杀经验累积，达阈值升级并按职业增长属性、恢复生命上限增加值、解锁装备/技能 | §Progression Formulas (verbatim) + OQ-2/OQ-3 (maxHp growth, xp reset) |
</phase_requirements>

---

## Summary

Phase 1 is a **pure, headless, in-process domain module** with **no external runtime dependencies** — no physics, no rendering, no network, no packages to install. Its entire job is (a) encoding the authoritative spec's numbers faithfully into typed constant tables, (b) modelling a `Unit` whose level-scaled values are computed on demand through one accessor `getAttribute(kind)`, and (c) making unit generation and progression deterministic *enough to test* via an injectable `IRng`. The technology surface is TypeScript 7.0.2 + Vitest 5.0.4 only.

The single most decision-relevant discovery is **not** about unit design — it is that **the phase's quality gates are currently broken in three independent ways**, all verified by running the tools this session: (1) `pnpm lint` **cannot run at all** (`typescript-eslint 8.71.2` refuses `TypeScript 7.0`); (2) `pnpm test` uses a **stale `vitest.config.ts`** whose `setupFiles` points at a non-existent file and whose config **does not resolve the `@/*` alias**, so any test importing `@/units/...` fails; (3) `pnpm typecheck` errors with `TS18003` (empty `src/`) and never checks `tests/`. Wave 0 must repair these before any Wave 1 type work can be validated. Details, evidence, and fixes are in **Environment Availability** and **Validation Architecture**.

Two spec ambiguities are load-bearing for UNIT-06 and must be resolved at the type-first review gate, not silently: the **per-level growth notation** (`每级增加 10L 点` vs `每级增加 6 点`) and the **unspecified 生命上限 growth** (the spec says hp heals by the "生命上限增加值" but never states how 生命上限 grows). A third discrepancy: every requirement/goal says **"17 项属性"** but the enumeration contains **16**. These are in **Open Questions** / **Assumptions Log**.

**Primary recommendation:** Wave 1 writes `src/units/types.ts` only — numeric enums (`AttributeKind`, `ClassKind`, `WeaponKind`, `ArmorKind`, `SkillKind`) plus `I*` interfaces — then stops for the mandatory user review gate. Wave 2 implements `data.ts` (verbatim spec tables), `rng.ts` (Box–Muller over `IRng`), `Unit.ts` (`getAttribute` + progression), and `spawn.ts`. Repair the Vitest/lint/typecheck gates in Wave 0. Keep growth/exp constants in `data.ts` as named `const`s so calibration is a one-file edit (satisfies the user's explicit "便于实测校准" demand).

---

## Architectural Responsibility Map

> This is a **single in-browser process with no server tiers**. "Tiers" below are read as *architectural layers within that process*; the map records which layer owns each capability so the planner assigns tasks to the right module and future phases know where to couple.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Attribute set & type contract (`IUnit`, `AttributeKind`) | Type layer (`src/units/types.ts`) | — | Single source of enums/interfaces; imported by every other unit file and by later systems (D-10) |
| Class/weapon/armor/growth data | Pure data (`src/units/data.ts`) | — | Typed constants, no logic, no imports beyond types (D-01/D-02) |
| Derived-value computation (`getAttribute`) | Domain object (`src/units/Unit.ts`) | data table | The one uniform read path (D-04/D-05); reads tables, never stores derived values |
| Random generation (normal, clamped ≥0) | Domain service (`src/units/rng.ts` + spawn) | injected `IRng` | Injectable seam for tests (D-07/D-08) |
| Progression (exp accrual, level-up, unlock) | Domain object (`src/units/Unit.ts`) | data unlock table + formula constants | Owns mutable state (hp/xp/level/equipment); constants stay in `data.ts` for calibration |
| Equipment/modifier aggregation | Domain object (`src/units/Unit.ts`) | data `IModifier` list | Lists, not getters (D-06) |
| Physics / AI control / rendering (consumers) | **Out of phase** | — | They read `getAttribute`/`IUnit` in Phases 2/3/5; Phase 1 must keep `IUnit` stable |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 7.0.2 (`[VERIFIED: node_modules/typescript/package.json]` — read this session) | Language; `strict`, `target/module = ESNext`, `@/*` path alias | Project-declared stack (`package.json` devDependency) |
| Vitest | 5.0.4 (`[VERIFIED: node_modules/vitest/package.json]` — read this session) | Test runner for the headless domain module | Project-declared (`pnpm test`) |

**No runtime dependency is added by this phase.** The unit system is pure TypeScript + `Math`. This is deliberate (anti-over-engineering; CONTEXT resolves all data-modeling choices to typed constants + native math).

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | Do **not** add a stats/random library, a schema validator, or a data-file loader for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled Box–Muller (3 lines) | `simple-statistics` / `gaussian` npm packages | Rejected: over-engineering for a single formula; adds a dependency + supply-chain surface for no benefit |
| `IRng { next() }` + free `sampleNormal()` helper | `IRng` exposing `normal(mean, sd)` | Both valid; see Pattern 4 — keep `IRng` minimal (`next()` only) and put Box–Muller in a helper so the RNG stub stays trivial to inject |
| `Record<Enum, T>` lookup tables | JSON files + runtime schema validation | Rejected by D-01: JSON loses compile-time enum-key completeness and HMR friendliness |

**Version verification:** `tsc`/`vitest` are already installed; verified by reading `node_modules/*/package.json` this session. **Do not** run `npm view`-style installs for this phase — nothing new is needed at runtime.

---

## Package Legitimacy Audit

> This phase **installs no external runtime packages**. The only candidate additions are the *optional toolchain repair* packages below (only if the planner chooses to fix `pnpm lint`); they are **not** required to implement the unit system.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@typescript/typescript6` | npm | published 2026-07-06 | ~8.0M/wk | github.com/microsoft/TypeScript | OK | Approved **if** the lint repair is chosen |
| `typescript` (7.0.2) | npm | already installed | — | github.com/microsoft/TypeScript | OK | Already present |
| `@typescript/native` | npm | **does not exist** | — | — | SLOP (false positive) | **REMOVED** — see note below |

**Note on `@typescript/native` (important):** In Microsoft's side-by-side instructions this is a **local `package.json` alias key**, not a published registry package: `"@typescript/native": "npm:typescript@^7.0.2"`. The registry lookup correctly returns 404 — do **not** ever run `pnpm add @typescript/native`. The real dependency behind it is `typescript@7.0.2` (already installed). `[CITED: devblogs.microsoft.com/typescript/announcing-typescript-7-0/]` `[VERIFIED: npm registry — @typescript/typescript6 = 6.0.2, 7.9M/wk; @typescript/native = 404]`

**Packages removed due to SLOP verdict:** none (the SLOP hit was a local-alias false positive, documented above).
**Packages flagged as suspicious [SUS]:** none.

---

## Architecture Patterns

### System Architecture Diagram

Data-flow through the unit system (all in-process, headless):

```
  class/weapon/armor/growth/unlock numbers
  (.planning/reference/ai-marble-kingdom.md)
                 │  transcribed verbatim
                 ▼
  ┌───────────────────────────┐        ┌──────────────────────────────┐
  │ data.ts (pure constants)  │        │ types.ts (enums + I* ifaces) │
  │ CLASS_DEFS / WEAPON_DEFS  │◄───────┤ AttributeKind, ClassKind,    │
  │ ARMOR_DEFS / formula Ks   │ imports│ WeaponKind, ArmorKind,       │
  └───────────┬───────────────┘  types │ SkillKind, IUnit, IClassDef, │
              │ reads                  │ IWeaponDef, IArmorDef,        │
              │                        │ IModifier, IRng … (no logic) │
              │                        └──────────────┬───────────────┘
              │                                       │ implemented by
              ▼                                       ▼
  ┌──────────────────────┐   injects IRng   ┌──────────────────────────┐
  │ spawn.ts             │─────────────────►│ rng.ts                   │
  │ spawnUnit(kind, rng) │  sampleNormal()  │ MathRng (wraps Math.random)│
  │  → new Unit(...)     │◄─────────────────│ + Box–Muller helper       │
  └──────────┬───────────┘                  └──────────────────────────┘
             │ creates
             ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ Unit implements IUnit                                              │
  │  stored:  class, hp, level, xp, equipment[], modifiers[]           │
  │  derived: getAttribute(kind) = clamp(base_rolled + growth(L) + Δmod)│
  │  mutate:  gainAttackExperience / gainDefenseExperience /           │
  │           gainKillExperience → threshold N_E(L) → levelUp()        │
  │           levelUp(): grow attrs, hp += ΔmaxHp, unlock equipment    │
  └───────────────┬───────────────────────────────────────────────────┘
                  │ getAttribute / getEquipment / getModifiers
                  ▼
     CONSUMERS (this phase: Vitest tests) ── later: physics (P2), AI (P3), render (P5)
```

Decision points: (a) spawn → which 7 attributes are randomized; (b) `getAttribute` → stored vs derived branch; (c) exp gain → threshold check → (possibly multiple) level-up → unlock application.

### Recommended Project Structure
```
src/
└── units/
    ├── types.ts     # ALL enums + I* interfaces; no runtime logic (D-10, convention #2)
    ├── data.ts      # typed const tables: classes/weapons/armors/growth/unlock/formula constants (D-01/D-02)
    ├── rng.ts       # IRng default impl (Math.random wrapper) + normal-sampling helper (D-07)
    ├── Unit.ts      # class Unit implements IUnit (getAttribute + progression)
    └── spawn.ts     # spawnUnit(classKind, rng): Unit  (generation logic; dispatches to rng)
tests/
└── units/
    ├── data-classes.test.ts
    ├── data-weapons-armors.test.ts
    ├── attributes.test.ts
    ├── spawn-normal.test.ts
    └── leveling.test.ts
```
`spawn.ts` is an addition beyond CONTEXT's example list (CONTEXT lists "如 types.ts / data.ts / Unit.ts / rng.ts"); placing generation in its own file keeps `Unit.ts` focused on the object and satisfies convention #5 (no public members outside the interface) since spawning is not a `Unit` member.

### Pattern 1: Typed constant tables keyed by numeric enums
**What:** One `Record<Enum, IDef>` (or mapped type) per kind, so a missing enum member is a **compile error**, plus an explicit ordered `readonly Enum[]` array for iteration/testing.
**When to use:** Every table in `data.ts`.
**Why:** `Record<ClassKind, IClassDef>` + `noUncheckedIndexedAccess` **off** (it is off in this tsconfig `[VERIFIED: tsconfig.json]`) gives safe, non-optional lookups; the explicit array sidesteps numeric-enum reverse-mapping during iteration (see Pitfall 3).
```ts
// Source: typescriptlang.org handbook Enums (keyof typeof / typeof E[keyof typeof E]) [+ SO Record<Enum,V>]
import { ClassKind } from '@/units/types';

/** 7 个职业的完整数值定义，按 ClassKind 索引（缺项即编译错误）。 */
export const CLASS_DEFS: Record<ClassKind, IClassDef> = {
  [ClassKind.Swordsman]: { /* … verbatim spec … */ },
  // … 6 more
};

/** 职业枚举的有序全集，用于遍历/测试（避免数字枚举反向映射）。 */
export const ALL_CLASS_KINDS: readonly ClassKind[] = [
  ClassKind.Swordsman, ClassKind.Archer, /* … */
] as const;
```
`[CITED: typescriptlang.org/docs/handbook/enums]` `[VERIFIED: tsconfig.json — noUncheckedIndexedAccess absent]`

### Pattern 2: One derived-value accessor, computed not stored (`getAttribute`)
**What:** Numeric attributes are read exclusively through `getAttribute(kind: AttributeKind): number`. Stored mutable state (hp, xp, level) and derived values (attack, defense, maxHp, ratios, mass, controlLevel) both route through it; derived values are recomputed from level each call.
**When to use:** All numeric reads (D-04/D-05; no getters/setters).
**Why it stays consistent:** because derived values are *functions of level* rather than accumulated increments, there is no float drift and no stale cache — the same reason the spec's `N_E = 100·(1+R_E)^L` and `stat = f(L)` are safe to recompute.
```ts
/** 统一属性读取入口；stored 直接返回，derived 按当前等级实时计算。 */
public getAttribute(kind: AttributeKind): number {
  switch (kind) {
    case AttributeKind.Health: return this.hp;                 // stored
    case AttributeKind.Level: return this.level;               // stored
    case AttributeKind.MaxHealth: return this.#maxHealth();    // derived
    case AttributeKind.Attack: return this.#grown(/* … */);    // derived
    // … exhaustive switch — TS narrows; no default needed (see Pitfall 4)
  }
}
```
`[ASSUMED]` — shape is the agent's discretion per CONTEXT; presented for the review gate, not as verified fact.

### Pattern 3: Level → grant unlock table (equipment + skills)
**What:** Per class, an initial equipment set plus an ordered `IEquipmentGrant[]` keyed by level. Upgrades are applied in a single consolidation step on level-up.
**When to use:** UNIT-06 unlock; the 狂战士's "4 级获得第二把斧头" proves equipment must be a **list that can hold duplicates** (validates D-06).
**Why:** Keeps "what is unlocked when" as data, so calibration/re-balance needs no code change.

### Pattern 4: Normal sampling behind an injectable `IRng` (Box–Muller)
**What:** `IRng` exposes only `next(): number` (uniform `[0,1)`); a `sampleNormal(rng, mean, sd)` helper performs Box–Muller and clamps to ≥ 0.
**When to use:** All 7 randomized spawn attributes; also reused for Phase 2's damage jitter.
**Why:** Box–Muller is exact and tiny; keeping `IRng` at one method makes test stubs trivial and matches the "only necessary abstraction" constraint.
```ts
// Source: mathworld.wolfram.com Box-MullerTransformation; NYU GaussianSampling notes; STAT418 course page
/** 给定 mean/σ，用两次均匀随机经 Box–Muller 得到正态样本，截断到非负。 */
export function sampleNormal(rng: IRng, mean: number, sd: number): number {
  let u1 = rng.next();
  while (u1 <= 0) u1 = rng.next();   // guard: ln(0) = -Infinity
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mean + z * sd); // D-08: 截断到非负
}
```
With σ = mean/8, `P(mean + z·σ < 0) = P(z < −8) ≈ 6.2e-16`, so the clamp is a correctness guard, not a shaping mechanism. `[CITED: mathworld.wolfram.com/Box-MullerTransformation.html]`

### Anti-Patterns to Avoid
- **Storing derived values** and mutating them on level-up: reintroduces drift and violates D-04. Compute from level.
- **String enums / string-keyed tables:** forbidden by convention #3; also loses `Record<Enum,V>` completeness.
- **Iterating a numeric enum with `Object.values`/`Object.entries`:** yields reverse-mapped names too (see Pitfall 3). Use the explicit `ALL_*` arrays.
- **A factory-function layer over the data tables:** D-01 explicitly forbids it.
- **Splitting `data.ts` per category:** D-02 forbids it — keep one file.
- **Adding a getter/setter "for convenience":** D-05 forbids it outright.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Normal-distribution sampling | A custom rejection sampler / lookup-table CDF approximation | `sampleNormal` helper (Box–Muller, ~4 lines) | Exact, standard, well-documented; anything more is over-engineering `[CITED: mathworld]` |
| Statistical test randomness | Assertions against un-seeded `Math.random` | A tiny deterministic `IRng` (e.g. mulberry32, ~6 lines) injected in tests | Removes flakiness; the whole point of D-07's injectable seam |
| Table integrity | Runtime schema-validation framework | `Record<Enum, IDef>` compile-time completeness + Vitest assertions vs spec | Compile-time is cheaper and earlier than runtime validation; no dependency |
| Enum iteration | Hand-maintained `for (let i = 0; i < 7; i++)` numeric loops | Explicit `readonly Enum[]` arrays typed against the enum | Prevents silent gaps when enum members change |

**Key insight:** this domain is *data + a few formulas*; the correct engineering move is **more compile-time typing, fewer runtime abstractions**. Every added library here is a net negative.

---

## Common Pitfalls

### Pitfall 1: `pnpm lint` cannot run at all (TypeScript 7 vs typescript-eslint)
**What goes wrong:** `pnpm lint` exits 2 with `Error: typescript-eslint does not support TS 7.0.` The `typescript-eslint` module **throws at import time**, so no ESLint rule runs.
**Why it happens:** TypeScript 7.0 ships **no JavaScript API**; `typescript-eslint@8.x` has peer `typescript >=4.8.4 <6.1.0` and imports the compiler API. `[VERIFIED: ran pnpm lint this session]` `[CITED: github.com/typescript-eslint/typescript-eslint/issues/10940]` `[CITED: devblogs.microsoft.com/typescript/announcing-typescript-7-0/]`
**How to avoid:** Choose one at Wave 0 (see Open Question OQ-5): (A) Microsoft's supported side-by-side — alias `typescript` → `@typescript/typescript6` and add alias `@typescript/native` → `npm:typescript@^7.0.2` (keeps TS7 `tsc` + gives ESLint the TS6 API); (B) pin `typescript` to 6.x project-wide; (C) drop `typescript-eslint` from `eslint.config.js` and `package.json` (loses TS-aware lint); (D) accept `pnpm lint` red for this phase.
**Warning signs:** lint fails before printing any file paths; the stack trace originates in `typescript-eslint/dist/index.js`.

### Pitfall 2: `pnpm test` fails before running any test (two independent causes)
**What goes wrong:** (a) `setupFiles: ['tests/helpers/physics-setup.ts']` points at a **file that does not exist** → `Error: Cannot find module '…/tests/helpers/physics-setup.ts'`; (b) even with a setup file, tests importing `@/…` fail with `Cannot find package '@/probe-alias'` because `vitest.config.ts` defines **no `resolve.alias`** (a standalone `vitest.config.ts` does not inherit `vite.config.ts`'s `@` alias). `[VERIFIED: both reproduced by running vitest this session]`
**Why it happens:** `vitest.config.ts` is a **leftover from the deleted old version** — its comments reference old decision IDs (`D-08 / SIM-03`, `D-21`) and a Rapier physics setup that Phase 1 does not use.
**How to avoid:** Wave 0 repairs `vitest.config.ts`: remove/replace the stale `setupFiles` entry (Phase 1 has no physics) **and** add `resolve.alias = { '@': join(process.cwd(), 'src') }` (mirroring `vite.config.ts`) — or switch test imports to relative paths. Ensure at least one test file exists (the `include: ['tests/**/*.test.ts']` glob currently matches nothing → exit 1).
**Warning signs:** `No test files found, exiting with code 1`; or `Cannot find package '@/…'`.

### Pitfall 3: Numeric-enum reverse mapping breaks naive iteration
**What goes wrong:** `Object.keys(ClassKind)` / `Object.values(ClassKind)` include the **reverse-mapped string names** alongside numbers, and `Object.entries` gives both. Looping a numeric enum to "get all classes" silently doubles/duplicates entries.
**Why it happens:** TypeScript numeric enums emit both `E[A]=0` and `E[0]='A'`.
**How to avoid:** Hand-write an explicit `readonly ClassKind[]` (and friends) in `types.ts`, typed against the enum so additions are caught; use `Record<Enum,T>` for lookups. `[CITED: typescriptlang.org/docs/handbook/enums]`
**Warning signs:** table-integrity tests report twice as many entries as expected.

### Pitfall 4: `switch` on `AttributeKind` not exhaustive
**What goes wrong:** A new `AttributeKind` member is added but `getAttribute`'s switch silently falls through to `undefined` (returns `undefined` for a `number` return type only if TS isn't checking exhaustiveness).
**Why it happens:** Without a `never` exhaustiveness guard, TS won't flag a missing case if there's a `default`.
**How to avoid:** No `default` branch; assign the switch result to a `const result: number` and add an exhaustiveness guard `default: { const _x: never = kind; throw … }` (or rely on a `ReturnType`-checked switch). Cover with a test asserting every `AttributeKind` yields a number.
**Warning signs:** `getAttribute` returns `NaN`/`undefined` for a rarely-used kind.

### Pitfall 5: Box–Muller `Math.log(0) = -Infinity` → `NaN`
**What goes wrong:** `Math.random()` can return exactly `0`; `Math.log(0) = -Infinity`, so `z = sqrt(Inf)*cos(...) = ±Inf`, and `mean + z·sd` becomes `±Infinity`/`NaN`, poisoning the attribute.
**Why it happens:** Uniform RNG half-open interval includes 0.
**How to avoid:** Guard `u1` away from 0 (loop or use `1 - rng.next()`), and clamp the final value with `Math.max(0, …)`. This is cheap insurance for a rare-but-real case; a unit with `NaN` mass silently corrupts Phase 2 physics.
**Warning signs:** an attribute is `Infinity`/`NaN`; a distribution test's `min` is negative or non-finite.

### Pitfall 6: Growth-notation ambiguity misinterpreted (`10L` vs `6`)
**What goes wrong:** `基础攻击力每级增加 10L 点` vs `基础防御力每级增加 6 点` may be implemented as *different shapes* by accident (e.g. quadratic for attack, linear for defense) or with the wrong origin (off-by-one at level 1).
**Why it happens:** The spec uses `L` (current level) only for attack and leaves the intent to "实测校准".
**How to avoid:** Resolve explicitly at the type-first gate (OQ-2). Recommend `stat(L) = base + k·(L−1)` (linear; table value = level-1 value) so all classes share one shape and calibration touches one number. Encode the choice as constants, never inline.
**Warning signs:** level-1 stats differ from the spec table; attack growth outpaces defense super-linearly.

### Pitfall 7: Stale/partial tooling config passes silently
**What goes wrong:** `tsconfig.json` `include: ["src"]` means `pnpm typecheck` **never checks `tests/`** (test type errors ship), while its own comment claims tests are included and references a `tsconfig.sim.json` that does not exist. Combined with the lint breakage, "all gates green" can be falsely assumed. `[VERIFIED: read tsconfig.json this session]`
**How to avoid:** Decide in Wave 0 whether to add `"tests"` to `include` (recommended, so test files are typechecked) and remove the dangling `tsconfig.sim.json` reference; treat `pnpm typecheck` as red until `src/` is non-empty (`TS18003`). `[VERIFIED: ran pnpm typecheck → TS18003]`

### Pitfall 8: Convention drift (interface-first, numeric enums, JSDoc) is *not* lint-enforced
**What goes wrong:** The mandatory conventions ("interface `I` first", "numeric enums only", "JSDoc on interface members/top-level const", "no public members outside an interface") are **not enforced by any ESLint rule** in `eslint.config.js`. Nothing fails if they are violated.
**Why it happens:** The config only wires `@eslint/js`, `typescript-eslint` recommended, and prettier.
**How to avoid:** Enforce in the plan's verification tasks (plan-checker / code-review) with explicit checklist items, and keep the review gate meaningful.
**Warning signs:** a class with a public field not present in its interface; a string enum; a top-level `const` without JSDoc.

---

## Code Examples

### Spawn: 7 randomized attributes, mean by class, σ = mean/8
```ts
// Sources: reference doc §单位生成 (mean by class, σ = mean/8, 7 attributes, clamp ≥0);
//          Box–Muller formula per mathworld/NYU.
/** 生成一个单位：7 项属性按职业均值、σ=均值/8 取正态（截断非负），其余取职业初值。 */
export function spawnUnit(cls: ClassKind, rng: IRng): Unit {
  const def = CLASS_DEFS[cls];
  const roll = (mean: number): number => sampleNormal(rng, mean, mean / 8);
  return new Unit(cls, {
    maxHp: roll(def.maxHp),
    controlLevel: sampleNormal(rng, CONTROL_LEVEL_BASE, CONTROL_LEVEL_BASE / 8),
    attack: roll(def.attack),
    defense: roll(def.defense),
    weaponRatio: roll(def.weaponRatio),
    armorRatio: roll(def.armorRatio),
    mass: roll(def.mass),
  });
}
```
The 7 randomized attributes are exactly: 生命上限 / 控制等级 / 基础攻击力 / 基础防御力 / 武器比率 / 防具比率 / 质量. `[VERIFIED: .planning/reference/ai-marble-kingdom.md:166-174]`:
> "以下属性都会受随机影响：- 生命上限 - 控制等级 - 基础攻击力 - 基础防御力 - 武器比率 - 防具比率 - 质量"

### Progression formulas (verbatim from spec)
`[VERIFIED: .planning/reference/ai-marble-kingdom.md:124-142]`:
> "$$E=R_A\times \sqrt{D-50}$$" (attack exp; D = damage dealt after armor reduction, only when > 50)
> "$$E=R_D\times\sqrt{\Delta D-50}$$" (defense exp; ΔD = damage reduced, only when > 50)
> "$$E=R_A\times 10L$$" (kill exp; L = enemy level)
> "$$N_E=100\cdot(1+R_E)^L$$" (level-up threshold; L = current level, R_E = 经验比率)

Implications for the implementation (all thresholds/factors belong in `data.ts` as named constants): the `50` gate and `10`/`100` factors are calibratable; attack exp uses **final** damage `D` (post-armor); defense exp uses the **reduced amount** `ΔD`; kill exp uses the killer's own attack-exp ratio `R_A`.

### Class table (verbatim spec values — transcribe exactly)
`[VERIFIED: .planning/reference/ai-marble-kingdom.md:273-397]`

| 职业 (ClassKind) | 生命上限 | 基础攻击力 | 基础防御力 | 武器比率 | 防具比率 | 质量 | 经验比率 R_E | 攻击经验比率 R_A | 防御经验比率 R_D | 攻击成长 | 防御成长 | 初始/解锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 剑士 | 200 | 60 | 24 | 1.0 | 0.8 | 70 | 0.10 | 0.5 | 0.5 | 10L | 6 | 长剑; 3级 盾牌 |
| 弓箭手 | 140 | 50 | 9 | 0.9 | 0.6 | 55 | 0.12 | 0.8 | 0.2 | 15L | 3 | 弓箭; 5级 技能·万箭齐发; 8级 头盔 |
| 狂战士 | 260 | 75 | 15 | 1.3 | 0.5 | 85 | 0.15 | 0.7 | 0.3 | 15L | 4 | 斧头; 2级 头盔; 4级 第二把斧头; 6级 技能·冲锋 |
| 锤兵 | 240 | 80 | 20 | 1.0 | 0.7 | 110 | 0.15 | 0.8 | 0.5 | 10L | 6 | 锤子; 2级 头盔; 6级 技能·旋转 |
| 骑士 | 280 | 55 | 30 | 1.0 | 1.0 | 120 | 0.10 | 0.5 | 0.6 | 15L | 6 | 长剑 + 头盔; 6级 盾牌 |
| 剑盾 | 220 | 40 | 40 | 0.8 | 1.4 | 95 | 0.08 | 0.4 | 0.9 | 10L (原文笔误写作"弓箭") | 8 | 短剑 + 盾牌; 7级 头盔 |
| 长矛兵 | 200 | 48 | 22 | 1.1 | 0.9 | 85 | 0.10 | 0.7 | 0.4 | 12L | 4 | 长矛; 3级 头盔; 8级 护盾 |

All classes: **初始控制等级均值 = 10，每次升级 +5**。 `[VERIFIED: .planning/reference/ai-marble-kingdom.md:271]`:
> "每种职业的初始控制等级均值都是 10，每次升级时，控制等级增加 5 级。"

Spec transcription notes to hand to the planner: 剑盾's growth line reads "弓箭每级增加 10L 点" for its **攻击** growth (obvious typo — 剑盾 wields 短剑, not 弓箭); 长矛兵's 8级 unlock is written "护盾" while the armor enum is 盾牌 (treat as 盾牌 unless the user says otherwise). `[VERIFIED: .planning/reference/ai-marble-kingdom.md:379,397]`

### Weapon table (verbatim)
`[VERIFIED: .planning/reference/ai-marble-kingdom.md:204-250]`

| 武器 (WeaponKind) | 质量 | 攻击比率 | 破甲·头盔 | 破甲·盾牌 |
|---|---|---|---|---|
| 长剑 | 12 | 1.2 | 1.5 | 0.6 |
| 短剑 | 8 | 1.0 | 1 | 1 |
| 斧头 | 16 | 0.8 | 2 | 1 |
| 锤子 | 25 | 1.5 | 5 | 3 |
| 弓箭 | 6 | 0.6 | 0.4 | 0.2 |
| 长矛 | 15 | 0.8 | 2 | 1.5 |

Represent penetration as `Record<ArmorKind, number>` inside `IWeaponDef` so "武器 × 防具" lookup is total and type-checked (UNIT-03 SC3).

### Armor table (verbatim)
`[VERIFIED: .planning/reference/ai-marble-kingdom.md:259-267]`

| 防具 (ArmorKind) | 质量 | 防御比率 |
|---|---|---|
| 头盔 | 8 | 1 |
| 盾牌 | 15 | 1.2 |

### Distribution test shape (injected deterministic RNG)
```ts
// tests/units/spawn-normal.test.ts (pseudocode)
const rng = mulberry32Rng(0xC0FFEE);            // tiny deterministic IRng for tests
const samples = Array.from({ length: 100_000 }, () => spawnUnit(ClassKind.Swordsman, rng));
const hp = samples.map(u => u.getAttribute(AttributeKind.MaxHealth));
expect(mean(hp)).toBeCloseTo(200, /* tolerance ~2% */ -1);   // mean by class
expect(std(hp)).toBeCloseTo(200 / 8, /* ~5% */ -1);          // σ = mean/8
expect(Math.min(...hp)).toBeGreaterThanOrEqual(0);           // non-negative clamp
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Seeded `sfc32` RNG streams for cross-run determinism (deleted old version) | Injectable `IRng` defaulting to `Math.random`; **no determinism** | This milestone (PROJECT.md "移除确定性") | Phase 1 does not need seeded/serializable RNG state; the seam exists only for test injection (D-07) |
| JSON/`content/` data files + schema validation; split `classes.ts`/`weapons.ts`/`armor.ts` | Single `src/units/data.ts` typed const tables | This milestone (D-01/D-02) | One file to calibrate; compile-time completeness |
| Unit data split into three components (`IUnitAttrs`/`IUnitProgress`/`IUnitEquip`) | One `class Unit implements IUnit` with a single `getAttribute` accessor | This milestone (D-03/D-04) | Simpler contract for the 8-system scope; no ECS-lite |

**Deprecated/outdated (do not carry over from `b8bb56b^`):** the old `src/sim/core/rng.ts`, `src/sim/content/*`, and phases 01–03 plans. PROJECT.md: *"两者仅作参考，不背负旧架构"*. The old phase-03 `03-CONTEXT.md` is nonetheless useful as a **cross-check on formula interpretation** (it independently read the same spec the same way, e.g. attack exp uses post-armor `D`, defense exp uses reduced `ΔD`, kill = `R_A·10L`, threshold `100·(1+R_E)^L`). `[VERIFIED: git show b8bb56b^:.planning/phases/03-combat-mechanics-data-progression/03-CONTEXT.md]`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Growth is linear with the spec table value = level-1 value: `stat(L) = base + k·(L−1)`; "10L/15L/12L" is read as an ordinary per-level increment | Pitfall 6 / OQ-2 | Level-N stats off by `k` (off-by-one) or wrong (quadratic) shape — balance + UNIT-02/06 tests |
| A2 | 生命上限 grows per level by a **per-class constant** (needs a chosen value), since the spec states hp heals by the "生命上限增加值" but never gives its formula | OQ-3 / UNIT-06 | UNIT-06 SC5 cannot be satisfied with a defined value; hp-restore amount arbitrary |
| A3 | On level-up, xp resets to 0 (spec does not state carry-over) | OQ-4 | Progression pacing / multi-level-up behavior |
| A4 | Only 攻击/防御/控制等级/生命上限 grow with level; 武器比率/防具比率/质量 are fixed at spawn | §§Class/Weapon/Armor tables | Unexpected scaling if spec intended otherwise |
| A5 | Unit `质量` attribute = body mass only; equipment masses stay on their own entries (physics sums later) | OQ-6 | Phase 2 inertia/defence-balance coupling |
| A6 | Non-numeric attributes (加成/装备/职业) are exposed via dedicated accessors, not via `getAttribute` (which returns `number`) | Pattern 2 | Interface shape rejected at the review gate |
| A7 | `技能` uses a `SkillKind` enum (万箭齐发/冲锋/旋转) recorded as data only; classes with none listed get none | Pattern 3 / OQ-7 | Missing skill data for some classes |
| A8 | "护盾" (长矛兵 8级) = 盾牌 | §Class table | One wrong armor unlock |

**All A# items require user confirmation** — they are spec inferences, not verified facts.

---

## Open Questions (RESOLVED)

> **RESOLVED 2026-10-17 with the user before planning proceeds.** Decisions below are binding for Phase 1.

1. **UNIT-01 "17 项属性" vs 16 enumerated — RESOLVED: 16.** The 16 enumerated attributes are canonical. The "17" in the phase goal/SC1 was a counting error; the ROADMAP SC1 and PROJECT.md wording are reconciled to 16. Do **NOT** invent a 17th attribute.

2. **Growth notation — RESOLVED (user).** Attack-class growth uses the `k·L` form (scales with current level; `10L` = each level adds `10 × current level` points). Defense-class growth uses a **flat coefficient 6 (per level +6), NOT `6L`** — deliberately, because 防御 is a **percentage damage-reduction** stat and a `6L` curve would over-scale late-game mitigation. → In `getAttribute`, attack-class growth terms multiply by level L; defense-class growth terms are constants.

3. **生命上限 growth — RESOLVED (user): reasonable default.** Each class gets a reasonable `maxHpGrowth` field (user authorized the agent to choose a sensible default), marked for calibration; on level-up hp += that increment.

4. **XP overflow / multi-level — RESOLVED: carry the remainder + multi-level loop.** On level-up subtract the threshold, keep the surplus, and loop so a single gain can trigger multiple level-ups. Marked for calibration.

5. **`pnpm lint` breakage — RESOLVED (user): repair this phase.** Wave 0 repairs `pnpm lint` (prefer Microsoft side-by-side alias: `typescript` → `@typescript/typescript6`; fallback pin TS 6.x). `@typescript/native` is a local alias key — do **NOT** `pnpm add` it.

6. **Equipment mass in unit `质量` — RESOLVED: no.** Unit `质量` = body mass only; weapons/armors carry their own mass and are summed later in the physics layer.

7. **Skill-less classes — RESOLVED: allowed empty.** Classes with no skill listed in the spec get an empty skill set (equipment unlocks only); later milestones may extend.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | toolchain (`engines: >=24`) | ✓ | 24.21.0 | — |
| pnpm | `engines: pnpm@12.5.1` | ✓ | 12.5.1 | — |
| TypeScript | typecheck / language | ✓ | 7.0.2 | pin 6.x if lint repair needs it |
| Vitest | tests | ✓ | 5.0.4 | — |
| Vite | Vitest transform | ✓ | 8.3.4 | — |
| ESLint + typescript-eslint | `pnpm lint` | ✗ (incompatible) | eslint 10.12.0 / tseslint 8.71.2 | side-by-side alias / pin TS6 / drop tseslint (OQ-5) |
| Rapier2D / PixiJS / Mediabunny | later phases only | ✗ | — | not needed in Phase 1 |

**Missing dependencies with no fallback:** none that block implementation (unit system is native TS).
**Missing/blocked with fallback:**
- `pnpm lint` — **currently non-functional** (Pitfall 1). Fallback per OQ-5.
- `pnpm typecheck` — red while `src/` is empty (`TS18003`); resolves once Wave 1 files exist. `pnpm test` — red until Wave 0 repairs `vitest.config.ts` and a test exists.

---

## Validation Architecture

> Included because `workflow.nyquist_validation` is `true` in `.planning/config.json` `[VERIFIED: read config.json]`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4 (`[VERIFIED: node_modules]`), `environment: 'node'` |
| Config file | `vitest.config.ts` — **needs Wave 0 repair** (stale `setupFiles`; missing `resolve.alias`) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UNIT-01 | Spawn each of 7 classes; assert all 16 attribute kinds readable; numeric kinds return finite numbers; 职业/装备/加成 accessible | unit | `pnpm test -- tests/units/attributes.test.ts` | ❌ Wave 0 |
| UNIT-02 | Assert each `CLASS_DEFS[k]` equals spec base values, growth coefficients, initial equipment, and unlock levels for all 7 classes | unit | `pnpm test -- tests/units/data-classes.test.ts` | ❌ Wave 0 |
| UNIT-03 | Assert 6 weapons' mass/attackRatio and `penetration[ArmorKind]`; assert total (weapon×armor) lookup | unit | `pnpm test -- tests/units/data-weapons-armors.test.ts` | ❌ Wave 0 |
| UNIT-04 | Assert 2 armors' mass/defenseRatio | unit | `pnpm test -- tests/units/data-weapons-armors.test.ts` | ❌ Wave 0 |
| UNIT-05 | Injected deterministic `IRng`: sample mean ≈ class mean; sample σ ≈ mean/8; all ≥ 0; Box–Muller helper matches known `u1,u2`→`z` | unit (statistical bounds) | `pnpm test -- tests/units/spawn-normal.test.ts` | ❌ Wave 0 |
| UNIT-06 | Attack/defense/kill exp formulas (incl. `>50` gate); threshold `100·(1+R_E)^L`; level-up grows attrs; hp += ΔmaxHp; equipment/skill unlocks fire | unit | `pnpm test -- tests/units/leveling.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (fast: pure data/domain).
- **Per wave merge:** `pnpm test` + `pnpm typecheck` (once `src/` exists) + `pnpm lint` (only if repaired).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/units/` + at least one test file — the `include` glob currently matches nothing → `vitest run` exits 1.
- [ ] `vitest.config.ts` repair — **remove/replace `setupFiles: ['tests/helpers/physics-setup.ts']`** (file absent → hard failure) **and** add `resolve.alias` for `@` (else `@/units/...` imports fail under Vitest).
- [ ] `tsconfig.json` — decide whether to add `"tests"` to `include` so test files are typechecked; remove the dangling `tsconfig.sim.json` comment reference.
- [ ] Toolchain decision for `pnpm lint` (OQ-5).
- Framework install: none (Vitest already present).

---

## Security Domain

> Included because `security_enforcement: true` and `security_asvs_level: 1` in `.planning/config.json` `[VERIFIED]`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No users, accounts, or session surface |
| V3 Session Management | no | Headless in-process library |
| V4 Access Control | no | No protected resources |
| V5 Input Validation | yes (weak) | Validate enum arguments; `Record<Enum,T>` completeness; guard RNG output (`u1>0`); clamp attributes ≥ 0; avoid `NaN`/`Infinity` propagation |
| V6 Cryptography | no | `Math.random` is used for gameplay flavor only — **not** security-sensitive, and determinism/security are explicitly out of scope |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-finite value (`NaN`/`Infinity`) leaking into an attribute | (data integrity, not a security class) | Guard `Math.log(0)`; clamp to ≥ 0 (Pitfall 5) |
| (other) | — | No network, no deserialization, no secrets, no user input in Phase 1 — security surface is effectively nil |

*Phase 1 has no secrets, no I/O, and no untrusted input. Security review effort should focus on data-integrity guards above, not on ASVS controls.*

---

## Sources

### Primary (HIGH confidence)
- `.planning/reference/ai-marble-kingdom.md` — authoritative spec; read in full this session. Verbatim quotes cited inline (unit attributes §105-122; progression §124-142; spawn §164-174; weapons §204-250; armors §259-267; classes §271-397).
- `.planning/phases/01-unit-system/01-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/config.json`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts`, `eslint.config.js`, `.prettierrc` — all `Read` this session.
- Live tool runs this session: `pnpm test` (no-test-files → exit 1), `pnpm lint` (typescript-eslint/TS7 refusal), `pnpm typecheck` (TS18003), plus temporary Vitest probes reproducing the missing-setup-file and missing-`@`-alias failures (probe files removed afterward).

### Secondary (MEDIUM confidence)
- Box–Muller transform: Wolfram MathWorld `Box-MullerTransformation`; NYU `GaussianSampling` lecture notes; STAT418 transformation-methods course page. `[CITED]`
- TypeScript enum lookup typing: TS Handbook `Enums`; `Record<Enum,V>` exhaustive-key patterns. `[CITED]`
- TypeScript 7 / typescript-eslint incompatibility + official side-by-side fix: devblogs.microsoft.com "Announcing TypeScript 7.0"; typescript-eslint issue #10940. `[CITED]`

### Tertiary (LOW confidence)
- None relied upon as authoritative. Prior-art `b8bb56b^` files are reference-only and superseded by this milestone's decisions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified installed versions by reading `node_modules`.
- Data model / spec values: HIGH — transcribed verbatim from the in-repo authoritative spec.
- Architecture: MEDIUM — patterns are standard TS, but interface shapes are agent discretion pending the review gate.
- Pitfalls: HIGH for environment blockers (reproduced by running tools); MEDIUM for design pitfalls.
- Growth/exp interpretation: LOW — genuine spec ambiguity (OQ-2/OQ-3), flagged for user confirmation.

**Research date:** 2026-10-17
**Valid until:** ~2026-11-16 (30 days; stable domain). Re-verify the typescript-eslint/TS7 status if the lint repair is deferred (fast-moving → shorter runway on that item).
