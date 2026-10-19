# Phase 3: 操控系统 - Pattern Map

**Mapped:** 2026-10-19
**Files analyzed:** 12 (all new; 0 modifications to existing `src/` files)
**Analogs found:** 11 / 12 (1 has no direct analog: the default behavior-tree AI)

## File Classification

| New/Modified File | Round | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|-------|------|-----------|----------------|---------------|
| `src/control/types.ts` | 1 (gate) | model / type declarations | transform (pure snapshot → action) | `src/physics/types.ts` | exact |
| `tests/control/types.test.ts` | 1 (gate) | test | transform (compile-time assertions) | `tests/physics/types.test.ts` + `tests/units/types.test.ts` | exact |
| `src/control/constants.ts` | 2 | config | static values | `src/physics/constants.ts` | exact |
| `src/control/Sensor.ts` | 2 | service (perception) | request-response (`sense(unitId)`) | `src/physics/PhysicsWorld.ts` | role-match |
| `src/control/ControlSystem.ts` | 2 | controller / orchestrator | event-driven + batch tick | `src/physics/PhysicsWorld.ts` | role-match |
| `src/control/DefaultUnitAI.ts` | 2 | service (strategy / behavior tree) | transform (snapshot → action) | *(none)* — use RESEARCH §Pattern 1/3 + `src/common/rng.ts` for class shape | no analog |
| `tests/control/arena.ts` | 2 | test fixture (`ISensingWorld`) | request-response (analytic ray geometry) | `tests/physics/tick.test.ts` (harness) + `src/physics/constants.ts` | role-match |
| `tests/control/damage-sink.ts` *(implied by D-09/D-10; not in RESEARCH file list)* | 2 | test fixture (`IDamageSink`) | event-driven | `src/units/Unit.ts` + `src/physics/PhysicsWorld.ts` routing | role-match |
| `tests/control/sensing.test.ts` | 2 | test | integration | `tests/physics/tick.test.ts` | role-match |
| `tests/control/loop.test.ts` | 2 | test | integration (tick cadence) | `tests/physics/tick.test.ts` / `tests/physics/events.test.ts` | role-match |
| `tests/control/default-ai.test.ts` | 2 | test | unit | `tests/units/attributes.test.ts` style | role-match |
| `tests/control/pluggable.test.ts` | 2 | test | integration | `tests/physics/tick.test.ts` + `tests/helpers/rng.ts` | role-match |

> **Tracked-source gate:** every analog path below was verified with `git ls-files -- <path>` (all tracked; no `.gsd/capabilities` mirror paths exist in this repo).

> **No existing file is modified.** D-01 explicitly forbids touching `src/physics/*`; D-07 forbids touching `src/units/*`. Any plan that lists `src/physics/types.ts` or `src/units/types.ts` as modified is wrong.

## Pattern Assignments

### `src/control/types.ts` (model / declarations, transform)

**Analog:** `src/physics/types.ts`

This is the gate artifact: declarations only — numeric enums + `I*` interfaces + one type alias. No Rapier, no classes, no top-level `const`, no algorithms.

**File header pattern** (`src/physics/types.ts:1-6`):
```typescript
/**
 * 物理模拟系统的全部类型声明：数字枚举 + `I*` 接口。
 * 本文件只含声明（枚举与接口），不含任何算法、数据表或运行时逻辑——
 * 无 Rapier 调用、无伤害运算、无类、无顶层 `const`。
 * 装备数值复用 Phase 1 已冻结的 `IWeaponDef`/`IArmorDef`（仅类型引用，不引用 `Unit` 类，D-07）。
 */
```

**Type-only upstream imports** (`src/physics/types.ts:8-13`):
```typescript
import type {
    ArmorKind,
    IArmorDef,
    IWeaponDef,
    WeaponKind
} from '@/units/types';
```

For Phase 3 use:
```typescript
import type { IDamageEvent, IUnitState } from '@/physics/types';
import type {
    AttributeKind, ClassKind, IEquipment, IUnit, SkillKind, WeaponKind
} from '@/units/types';
```
`IUnitState` lives in `@/physics/types` (lines 77-90) — the RESEARCH test snippet at line 511 imports it from `@/control/types`, which is wrong unless `types.ts` re-exports it. Prefer importing directly from `@/physics/types` (as `src/units/types.ts:7` re-exports `IRng` only when a re-export is genuinely wanted).

**Numeric enum with per-member JSDoc** (`src/physics/types.ts:15-28`):
```typescript
/**
 * 复合刚体中的部位标识：本体 / 武器 / 防具各为一个独立碰撞体（D-03）。
 * 成员一律为整数——本项目强制使用数字枚举（禁止字符串枚举）。
 */
export enum ColliderPart {
    /** 本体：单位自身的圆形碰撞体。 */
    Body = 0,
    /** 武器：细长 capsule 碰撞体，随本体刚性旋转。 */
    Weapon = 1,
    /** 防具：环绕本体的圆形碰撞体。 */
    Armor = 2
}
```
Apply verbatim shape to `SkillIntentKind { Weapon = 0, Unit = 1 }` (RESEARCH line 393).

**Readonly interface + JSDoc on every member + null/undefined convention** (`src/physics/types.ts:46-72`):
```typescript
/**
 * 注册一个单位到物理世界的输入：**纯数值**，不含任何 `Unit` 实例（D-07）。
 * 缺失的**对象**引用用 `null`（`weapon`），缺失的**集合**用空数组（`armors`）。
 */
export interface IUnitPhysicsSpec {
    /** 单位 id：物理层以此为键索引刚体与碰撞体。 */
    readonly unitId: number;
    ...
    /** 已装备武器定义……；未装备武器时为 `null`。 */
    readonly weapon: IWeaponDef | null;
    /** 全部已装备防具定义……；未装备防具时为空数组。 */
    readonly armors: readonly IArmorDef[];
}
```
Apply to `IUnitObservation` / `IUnitAction` / `IUnitBrief` / `IProjectileSighting` / `ISensedUnit` / `ISensingWorld` / `IUnitAI` / `IUnitAIProvider` / `ISensor` / `IUnitCatalog` / `IDamageContext` / `IDamageSink` / `IControlUnitRegistration` / `IControlTickResult` / `IControlSystem`. `skillIntent` is a missing **object** → `SkillIntent | null` (not `undefined`).

**Contract interface with method JSDoc** (`src/physics/types.ts:190-212`):
```typescript
/**
 * 物理系统契约（D-07）：拥有 Rapier world、按 id 注册单位、并在 `tick()` 中
 * 发出带部位标记的类型化事件。物理层只持有 id 与数值，不拥有、不引用 `Unit`。
 */
export interface IPhysicsWorld {
    /** 注册一个单位：…… */
    registerUnit(spec: IUnitPhysicsSpec): void;
    ...
    /** 读取本单位的运动学读数；未知 id 返回 `null`（缺失对象 → `null`）。 */
    getUnitState(unitId: number): IUnitState | null;
    /** 推进恰好一个固定步长并返回本步的类型化事件（D-10）。 */
    tick(): IPhysicsTickResult;
    /** 释放 Rapier world 与事件队列。 */
    dispose(): void;
}
```
Use this shape for `ISensor.sense(...): IUnitObservation | null` (Pitfall 8/9) and `IControlSystem.tick(): IControlTickResult`.

**Round 2 internal-types section:** RESEARCH Open Question 6 recommends appending behavior-tree node/state types to the **end** of `src/control/types.ts` under a clearly marked `// ---- 默认 AI 内部类型（非契约）----` banner, after the gate has approved the contract region. Keep them below all `I*` contract declarations.

---

### `tests/control/types.test.ts` (test, compile-time)

**Analogs:** `tests/physics/types.test.ts` (enum pinning) and `tests/units/types.test.ts` (re-export/type-equality)

**Enum pinning pattern** (`tests/physics/types.test.ts:1-16`):
```typescript
import { describe, expect, it } from 'vitest';
import { ColliderPart } from '@/physics/types';

describe('physics-system types — numeric ColliderPart enum', () => {
    it('pins Body to 0', () => {
        expect(ColliderPart.Body).toBe(0);
    });

    it('pins Weapon to 1 and Armor to 2 (numeric enum, not string)', () => {
        expect(ColliderPart.Weapon).toBe(1);
        expect(ColliderPart.Armor).toBe(2);
        expect(typeof ColliderPart.Body).toBe('number');
    });
});
```

**Type-level assertion pattern** (`tests/units/types.test.ts:1, 66-72`):
```typescript
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('unit-system types — shared IRng re-export', () => {
    it('re-exports the same IRng type from @/common/types through @/units/types', () => {
        expectTypeOf<IRngViaUnits>().toEqualTypeOf<IRng>();
    });
});
```

Apply the same for `IUnitAI['decide']` parameter/return and `IUnitAIProvider['create']` (RESEARCH lines 529-533). **Critical:** `expectTypeOf` is erased at runtime — Round 1 gate is `pnpm typecheck` **and** `pnpm test` (Pitfall 7). Build one complete `IUnitObservation` object literal so all 13 `AttributeKind` keys are compile-checked.

---

### `src/control/constants.ts` (config, static)

**Analog:** `src/physics/constants.ts`

**Header + top-level `const` + JSDoc** (`src/physics/constants.ts:1-14`):
```typescript
/**
 * 物理模拟系统的数值常量：固定步长与可校准几何尺寸（D-06/D-10）。
 * 本文件是物理数值的唯一调参入口——改动一行即改动一个尺寸；
 * 全部为类型化顶层 `const` + JSDoc（AGENTS §6），不使用 JSON 数据文件，不使用工厂函数。
 */

import type { IPhysicsGeometry } from '@/physics/types';

/**
 * 固定仿真步长（秒），值为 `1 / 60`（D-10）：一次 `tick()` 恰好推进一步，与渲染解耦。
 * 与几何尺寸同属可校准数值（本阶段锁定 1/60，后续实测可调整）。
 */
export const DT = 1 / 60;
```

Phase 3 constants to declare here (all exported, all JSDoc'd, no JSON): `DECISION_INTERVAL_TICKS = 6`, `RAY_COUNT = 64`, `SENSING_MAX_DISTANCE = 50`, `MAX_NEIGHBORS = 16`, `NEIGHBOR_QUERY_RADIUS` (A6, start ~100), skill cooldown tick constants (5/6/7 s × 60), bow shot interval, default-AI steering constants, force/torque clamp caps. `DT` continues to come from `@/physics/constants` — do **not** redeclare it.

---

### `src/control/Sensor.ts` (service, request-response)

**Analog:** `src/physics/PhysicsWorld.ts`

**Class/implements/private-member/JSDoc pattern** (`src/physics/PhysicsWorld.ts:35-46`):
```typescript
/**
 * 复合刚体：`class PhysicsWorld implements IPhysicsWorld`。
 */
export class PhysicsWorld implements IPhysicsWorld {
    /** 构造参数（固定步长与几何尺寸，D-06/D-10）。 */
    private readonly config: IPhysicsConfig;
    /** 本世界拥有的 Rapier 世界；`dispose()` 时释放。 */
    private readonly world: InstanceType<typeof RAPIER.World>;
    /** 注入的随机源：伤害抖动的唯一来源…… */
    private readonly rng: IRng;
    /** unitId → 该单位的复合刚体。 */
    private bodies = new Map<number, InstanceType<typeof RAPIER.RigidBody>>();
```

Sensor shape to copy:
- `export class Sensor implements ISensor`
- constructor deps: `physics: IPhysicsWorld`, `catalog: IUnitCatalog`, `world: ISensingWorld`
- private merge/copy helpers all `private`, each with JSDoc (AGENTS §4/§10)
- no getters/setters; `sense()` reads via `IUnit.getAttribute/getEquipment/getSkills/getClass`, `physics.getUnitState`, `catalog.getTeam/listUnitIds`

**Null-return guard** (`src/physics/PhysicsWorld.ts:190-205`):
```typescript
getUnitState(unitId: number): IUnitState | null {
    const body = this.bodies.get(unitId);
    if (body === undefined) {
        return null;
    }
    ...
}
```
`Sensor.sense` returns `null` when either `catalog.getUnit` or `physics.getUnitState` misses (Pitfall 8). `ControlSystem` skips null units that tick.

**Defensive finite guard** (`src/physics/PhysicsWorld.ts:340-343`):
```typescript
// 非有限值时按 0 处理，保证 NaN/Infinity 绝不离开物理层（数据完整性护栏）。
const deltaV = Number.isFinite(projectedDeltaV)
    ? Math.abs(projectedDeltaV)
    : 0;
```
Apply to ray distances (clamp `[0, maxDistance]`, non-finite → `maxDistance`) and any distance sort key.

**Copy-on-read pattern** (`src/units/Unit.ts:166-179`) — return fresh arrays, never internal references:
```typescript
getEquipment(): readonly IEquipment[] {
    return [...this.equipment];
}
```

---

### `src/control/ControlSystem.ts` (controller / orchestrator, event-driven + batch tick)

**Analog:** `src/physics/PhysicsWorld.ts`

**Duplicate-registration contract** (`src/physics/PhysicsWorld.ts:90-95`):
```typescript
registerUnit(spec: IUnitPhysicsSpec): void {
    if (this.bodies.has(spec.unitId)) {
        throw new Error(
            `PhysicsWorld.registerUnit: unit ${spec.unitId} is already registered`
        );
    }
```
`ControlSystem.registerUnit` must do the same pre-check against its own catalog (Pitfall 9) and register with physics **before** inserting into the catalog (Pitfall 8 consistency).

**Map-by-unitId + dispose cleanup** (`src/physics/PhysicsWorld.ts:154-168`, `438-450`):
```typescript
removeUnit(unitId: number): void {
    const body = this.bodies.get(unitId);
    if (body === undefined) {
        return;
    }
    ...
    this.bodies.delete(unitId);
    this.specs.delete(unitId);
    this.colliders.delete(unitId);
    this.preVelocities.delete(unitId);
}

dispose(): void {
    if (this.disposed) {
        return;
    }
    this.disposed = true;
    ...
}
```
ControlSystem needs per-unit maps `unitId → IUnitAI`, `unitId → IUnitAction`, `unitId → teamId`; idempotent `dispose()` mirroring lines 438-450; removal order = `provider.destroy` → catalog delete → `physics.removeUnit`.

**Tick loop pattern** (`src/physics/PhysicsWorld.ts:207-226`, force reset at `431-434`):
```typescript
tick(): IPhysicsTickResult {
    // 步进前快照……（D-08）
    ...
    this.world.step(this.eventQueue);
    const contacts: IContactEvent[] = [];
    const damages: IDamageEvent[] = [];
    ...
    for (const body of this.bodies.values()) {
        body.resetForces(false);
        body.resetTorques(false);
    }
    return { contacts, damages };
}
```
ControlSystem ordering (RESEARCH Pattern 3 + A5): decision at `tickIndex % DECISION_INTERVAL_TICKS === 0` → re-apply stored action **every** tick (skip when all components are 0, Pitfall 3) → `physics.tick()` → route `damages` to sink → batch-remove dead → `tickIndex++` → return `{ skillIntents }`. Only emit `skillIntent` on decision ticks, once.

**Plugin exception isolation** (`src/units/Unit.ts:186-195` mirrors the input-guard style; Security Domain table):
```typescript
takeDamage(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }
```
`ControlSystem` wraps `ai.decide(observation)` in try/catch → fall back to an all-zero action; clamps non-finite/negative force and torque components to 0 and caps above the constant limit before `applyForce`/`applyTorque` (ASVS V5).

**Force composition / sign convention** (RESEARCH lines 364-367): `fx = forceRight − forceLeft`, `fy = forceUp − forceDown`, `torque = torqueCounterClockwise − torqueClockwise` (Rapier positive torque = CCW, verified by probe).

**Equipment→spec mapping** (`src/units/data.ts:325-386`):
```typescript
export const WEAPON_DEFS: Record<WeaponKind, IWeaponDef> = { ... };
export const ARMOR_DEFS: Record<ArmorKind, IArmorDef> = { ... };
```
`registerUnit` maps `IUnit.getEquipment()` → `IWeaponDef`/`IArmorDef` via these tables; take the **first** weapon (A3) and push a JSDoc note about the accepted single-weapon/physics-snapshot limits (WR-01/D-19).

---

### `src/control/DefaultUnitAI.ts` (service / behavior tree, transform)

**Analog:** none. This is the first AI implementation in the repo.

Partial style reference — smallest class-implements-interface (`src/common/rng.ts:9-18`):
```typescript
/**
 * `IRng` 的默认实现：直接包装 `Math.random`，是非确定的（无种子、无复现保证）。
 */
export class MathRng implements IRng {
    /** 返回 `[0, 1)` 区间内的均匀随机数。 */
    next(): number {
        return Math.random();
    }
}
```

Use RESEARCH §Pattern 1/3 + §"Don't Hand-Roll" (self-built ~100-line behavior tree: `Status` numeric enum + Condition/Action/Sequence/Selector). Requirements:
- `export class DefaultUnitAI implements IUnitAI`
- `private` state: cooldown counters, tree instance — one instance per unit (D-11)
- deterministic: **no `IRng`** (D-15); if a randomized AI is ever tested, inject `IRng` (`@/common/types`) and use `tests/helpers/rng.ts` `mulberry32`
- three behaviors only: chase nearest enemy → attack in range → retreat at low HP (D-16)
- all thresholds read from `@/control/constants` (no magic numbers in the class)
- skill intent only when skill unlocked (`getSkills()`) and cooldown expired (D-17)

---

### `tests/control/arena.ts` (test fixture, analytic geometry)

**Analog:** `tests/physics/tick.test.ts` (harness shape) + `src/physics/constants.ts` (geometry source)

**Fixture/harness pattern** (`tests/physics/tick.test.ts:19-42`):
```typescript
describe('PhysicsWorld — Δv damage events, armor vs body, one-strike exclusivity', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    let world: PhysicsWorld | null = null;

    afterEach(() => {
        world?.dispose();
        world = null;
    });

    function createWorld(): PhysicsWorld {
        return new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(20260606)
        );
    }
```

`ArenaSensingWorld implements ISensingWorld` in `tests/control/arena.ts` needs **no Rapier** — analytic ray×AABB (boundary) + ray×circle (`blockers`) per RESEARCH lines 537-543: ray start angle 0 (+x), step `2π/64`, distance clamped to `[0, maxDistance]`, no hit → `maxDistance`, `queryProjectiles` → `[]`. Export configurable arena bounds. If a loop test also spins a real `PhysicsWorld`, reuse the `beforeAll(RAPIER.init)` / `afterEach(dispose)` shape above. `mulberry32` comes from `../helpers/rng` (`tests/helpers/rng.ts:8-18`).

---

### `tests/control/damage-sink.ts` (test fixture, event-driven) — implied by D-09/D-10

**Analogs:** `src/units/Unit.ts` (damage/experience semantics) + `src/physics/PhysicsWorld.ts` (routing shape)

Implement `IDamageSink.applyDamage(context)` with:
- same-team filter **before** any mutation (D-09): `if (context.attackerTeamId === context.defenderTeamId) return;`
- alive guard before applying a queued damage event (Pitfall 11): `if (!context.defender.isAlive()) return;`
- `defender.takeDamage(event.damage)`, `attacker.gainAttackExperience(event.damage)`, `defender.gainDefenseExperience(event.damageReduced)`
- kill experience only on the alive→dead transition: `attacker.gainKillExperience(defender.getAttribute(AttributeKind.Level))` — call `isAlive()` **after** `takeDamage`
- no `physics.removeUnit` here; ControlSystem owns unregistration (A8)

Guard semantics to mirror (`src/units/Unit.ts:186-195, 202-245`):
```typescript
takeDamage(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }
    ...
}
```
If RESEARCH's fixed file list is kept, this fixture may live at the top of `tests/control/loop.test.ts`; either location is acceptable, but keep it out of `src/control/` (battle rules must not leak into the control module, D-10).

---

### `tests/control/sensing.test.ts` / `loop.test.ts` / `default-ai.test.ts` / `pluggable.test.ts` (tests)

**Analog:** `tests/physics/tick.test.ts` (integration), `tests/units/attributes.test.ts` (unit-level assertions)

Conventions to copy:
- `import { afterEach, beforeAll, describe, expect, it } from 'vitest';`
- top-of-describe `beforeAll(RAPIER.init)` only for tests that construct `PhysicsWorld`
- `afterEach` disposes the world (`world?.dispose(); world = null;`)
- small JSDoc'd local factory helpers (`createWorld`, `makeSpec`, `stateOf`) — see `tests/physics/tick.test.ts:33-114`
- approximate float assertions: `expect(x).toBeCloseTo(expected, 5)` (f32 round-trip, `src/physics/constants.ts:12`)
- deterministic RNG only where needed: `mulberry32(seed)` from `../helpers/rng`

Specific assertions to build:
- sensing: `rayDistances.length === 64`, every value in `[0, 50]`, allies never block, `enemies.length <= 16` sorted ascending, `projectiles` always `[]`
- loop: spy AI records decision ticks = `0, 6, 12`; force re-applied on every tick; damage reaches sink; dead unit removed from catalog + physics; `skillIntents` only on decision ticks
- default-ai: feed hand-built `IUnitObservation` snapshots → assert approach / attack / retreat action shape; no RNG
- pluggable: swap provider (stub `IUnitAI` returning zero action) → simulation runs N ticks, physics/unit files untouched

---

## Shared Patterns

### Path alias & imports
**Source:** `vitest.config.ts:14-21`, `tsconfig.json` (`@/*` → `./src/*`)
```typescript
// 调试图 vitest.config.ts
resolve: { alias: { '@': join(process.cwd(), 'src') } }
```
All new files import via `@/control/...`, `@/physics/...`, `@/units/...`; tests import fixtures relatively (`../helpers/rng`, `./arena`).

### interface-first + numeric enums + JSDoc
**Source:** `AGENTS.md` Code Conventions 1-7; `src/physics/types.ts` / `src/units/types.ts`
Every class `implements` its `I*` interface; every exported enum member and interface member has JSDoc; private members `private` (never `#`, never `_`). No public member absent from the interface.

### Missing values
**Source:** `src/physics/types.ts:33-44, 46-72`
Missing **objects** → `null` (`skillIntent: SkillIntent | null`); missing **literals** → optional/`undefined` (`weaponKind?`). Never mix.

### Defensive numeric guards
**Source:** `src/units/Unit.ts:186-195`, `src/physics/PhysicsWorld.ts:340-343`
`Number.isFinite` gate + clamp at every boundary where plugin/world data enters another system. ControlSystem is the sole execution boundary for AI output (ASVS V5).

### Unknown-id / duplicate-id semantics
**Source:** `src/physics/PhysicsWorld.ts:90-95, 154-168, 190-205`
- duplicate register → `throw new Error('...: unit <id> is already registered')`
- unknown id lookups → `null` (read) / silent no-op (remove/apply)
- `dispose()` idempotent via a `private disposed = false` flag

### Test harness
**Source:** `tests/physics/tick.test.ts:19-42`, `tests/physics/rapier-harness.test.ts:14-23`, `tests/helpers/rng.ts:8-18`
`beforeAll(await RAPIER.init())` → create per-test world → `afterEach` dispose; seeded `mulberry32`; `toBeCloseTo` for f32 values; `expectTypeOf` for contract shapes.

### Gate commands
**Source:** `package.json:10-14`
`pnpm typecheck` (tsc `--noEmit`) + `pnpm test` (`vitest run`) + `pnpm lint` (`eslint .`). Rounds 1 and 2 must both pass all three.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/control/DefaultUnitAI.ts` | service / strategy | transform (snapshot → action) | No AI/behavior-tree code exists yet. Use RESEARCH §Pattern 1/3 and the "Don't Hand-Roll" minimal BT design; borrow only the class/JSDoc shape from `src/common/rng.ts`. |

## Metadata

**Analog search scope:** `src/` (common, physics, units) and `tests/` (physics, units, helpers); configs `vitest.config.ts`, `tsconfig.json`, `package.json`.
**Files scanned:** 20 tracked files (`git ls-files -- src tests` = 20; all analogs verified tracked).
**Pattern extraction date:** 2026-10-19
**Upstream contracts consumed (read-only):** `src/units/types.ts`, `src/physics/types.ts`, `src/physics/PhysicsWorld.ts`, `src/physics/constants.ts`, `src/units/data.ts`, `src/units/Unit.ts`, `src/common/{types,rng}.ts`.
**Known conflict to resolve at the gate:** RESEARCH's Round-1 test snippet imports `IUnitState` from `@/control/types`; it is declared in `@/physics/types`. Either import it from `@/physics/types` or explicitly re-export it in `@/control/types`.
