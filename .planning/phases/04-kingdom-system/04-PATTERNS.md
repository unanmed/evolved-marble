# Phase 4: 王国系统 - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 28（Round 1: 2；Round 2: 21；门禁扩展 G-1/G-2: 5）
**Analogs found:** 28 / 28（exact 11；role-match 16；partial 1）
**Scope note:** 本阶段是 **Type-first 两轮门禁**。Round 1 只落地 `src/kingdom/types.ts` + `tests/kingdom/types.test.ts`；其余实现文件属于 Round 2，待用户批准类型后再规划。下文仍为 Round 2 文件给出完整 analog，供 planner 在第二轮直接引用。

---

## File Classification

### Round 1（本轮唯一实现范围）

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/kingdom/types.ts` | types / contract | declaration-only（编译期） | `src/control/types.ts` | exact |
| `tests/kingdom/types.test.ts` | test | compile-time contract + enum pinning | `tests/control/types.test.ts` | exact |

### Round 2（实现轮，待类型门禁批准）

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/kingdom/constants.ts` | config / constants | static | `src/control/constants.ts` | exact |
| `src/kingdom/scenario.ts` | config / data table | static initialization | `src/units/data.ts` | role-match |
| `src/kingdom/TimeSystem.ts` | service / state | tick / time accumulation | `src/control/ControlSystem.ts` | role-match |
| `src/kingdom/Army.ts` | model | state mutation + read view | `src/units/Unit.ts` | role-match |
| `src/kingdom/City.ts` | model | state mutation + read view | `src/units/Unit.ts` | role-match |
| `src/kingdom/BattleSystem.ts` | service / state machine | batch per substep + event queue | `src/control/ControlSystem.ts` | role-match |
| `src/kingdom/DamageSink.ts` | service | event-driven / request-response | `tests/control/damage-sink.ts` | exact（test-glue analog） |
| `src/kingdom/SensingWorld.ts` | service / utility | query / raycast | `tests/control/arena.ts` | exact |
| `src/kingdom/MarchAI.ts` | AI / IUnitAI | transform（snapshot → action） | `src/control/DefaultUnitAI.ts` | exact |
| `src/kingdom/BattleAI.ts` | AI / IUnitAI wrapper | transform（filtered snapshot） | `src/control/DefaultUnitAI.ts` | role-match |
| `src/kingdom/ModeAI.ts` | provider / composite | request-response（delegate） | `src/control/DefaultUnitAI.ts` + `src/control/ControlSystem.ts` | role-match |
| `src/kingdom/Commander.ts` | service / strategy | request-response | `src/control/DefaultUnitAI.ts` | partial |
| `src/kingdom/KingdomWorld.ts` | orchestrator / controller | batch tick（1/24 substeps） | `src/control/ControlSystem.ts` | role-match |
| `tests/kingdom/harness.ts` | test fixture | real Rapier integration | `tests/control/loop.test.ts` | role-match |
| `tests/kingdom/time.test.ts` | test | integration | `tests/control/loop.test.ts` | role-match |
| `tests/kingdom/march.test.ts` | test | integration | `tests/control/loop.test.ts` | role-match |
| `tests/kingdom/battle.test.ts` | test | integration | `tests/control/loop.test.ts` | role-match |
| `tests/kingdom/city.test.ts` | test | integration | `tests/control/loop.test.ts` | role-match |
| `tests/kingdom/vision.test.ts` | test | pure query | `tests/control/sensing.test.ts` | role-match |
| `tests/kingdom/terrain.test.ts` | test | integration（G-2） | `tests/control/loop.test.ts` | role-match |
| `tests/kingdom/scenario.test.ts` | test | unit / data validation | `tests/units/data-classes.test.ts` | role-match |

### 门禁扩展（G-1 / G-2，Round 1 需裁决，Round 2 才实现）

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/units/types.ts`（追加 `IHealableUnit`） | types / contract extension | additive declaration | `src/units/types.ts` 自身（`IUnit`） | exact |
| `src/units/Unit.ts`（追加 `heal`） | model | state mutation | `src/units/Unit.ts` 的 `takeDamage` | exact |
| `src/physics/types.ts`（追加 `IStaticObstacleSpec` / `IStaticObstacleWorld`） | types / contract extension | additive declaration | `src/physics/types.ts` 的 `IPhysicsWorld` | exact |
| `src/physics/PhysicsWorld.ts`（追加静态障碍方法） | service | Rapier 生命周期 | 同文件 `registerUnit` / `removeUnit` | exact |
| `tests/units/heal.test.ts` | test | unit | `tests/units/attributes.test.ts` | exact |

> `Faction.ts` 未出现在 RESEARCH 的推荐目录中。若 Round 2 需要独立类，按 `Army.ts`/`City.ts` 的同一模式落地（见 §7 与 §Conflicts C-8）。

---

## Pattern Assignments

### 1. `src/kingdom/types.ts`（types / contract，declaration-only）

**Analog:** `src/control/types.ts`（主）；`src/physics/types.ts`（次）

**文件头声明约定**（`src/control/types.ts:1-16`）：

```ts
/**
 * 操控系统的全部类型声明：数字枚举 + `I*` 接口（外加唯一类型别名 `SkillIntent`）。
 * 本文件只含声明，不含任何算法、Rapier 调用、类或顶层 `const`。
 * 装备/简讯字段复用 Phase 1 已冻结的类型；运动读数复用 Phase 2 的 `IUnitState`
 * （仅类型引用，不重声明、不扩展 `IPhysicsWorld`）。
 */

import type { IDamageEvent, IUnitState } from '@/physics/types';
import type {
    AttributeKind,
    ClassKind,
    IEquipment,
    IUnit,
    SkillKind,
    WeaponKind
} from '@/units/types';
```

`src/physics/types.ts:1-13` 是同一范式：文件头说明「只含声明、无算法/类/顶层 const」，只 `import type`。

**数字枚举 + 每个成员 JSDoc**（`src/control/types.ts:18-27`）：

```ts
/**
 * 技能意图的判别式：区分武器技能与单位技能。
 * 成员一律为整数——本项目强制使用数字枚举（禁止字符串枚举）。
 */
export enum SkillIntentKind {
    /** 武器技能意图（如 `WeaponKind.Bow` 的射箭）。 */
    Weapon = 0,
    /** 单位技能意图（`SkillKind.ArrowStorm` / `Charge` / `Spin`）。 */
    Unit = 1
}
```

**只读视图接口 + 可选字面量字段**（`src/control/types.ts:29-48`）：

```ts
export interface IUnitBrief {
    /** 单位 id。 */
    readonly unitId: number;
    /** 当前生命值。 */
    readonly health: number;
    /** 等级。 */
    readonly level: number;
    /** 位置的 x 坐标（米）。 */
    readonly x: number;
    /** 位置的 y 坐标（米）。 */
    readonly y: number;
    /** 当前装备列表（只读快照）。 */
    readonly equipment: readonly IEquipment[];
}
```

**方法型接口：每个方法都必须有 JSDoc**（`src/control/types.ts:82-107`）：

```ts
export interface ISensingWorld {
    /**
     * 以 `(originX, originY)` 为原点投射 64 条**世界坐标固定方向**的射线
     * （不随本体旋转）；每条射线的最远距离为 `maxDistance`。
     * 结果数组恰为 64 个距离，每个值位于 `[0, maxDistance]`；未命中时为 `maxDistance`。
     * 命中集合 = 世界自身的边界/预留障碍几何 + 传入的敌方 `blockers`。
     */
    castRayFan(
        originX: number,
        originY: number,
        maxDistance: number,
        blockers: readonly ISensedUnit[]
    ): readonly number[];
    /**
     * 查询半径 `radius` 内、最远 50m 的射弹；Phase 3 恒为空数组。
     */
    queryProjectiles(
        x: number,
        y: number,
        radius: number
    ): readonly IProjectileSighting[];
}
```

**聚合接口的 JSDoc 风格**（`src/control/types.ts:297-318`）：

```ts
/**
 * 操控系统契约（D-06/D-07/D-09/D-10/D-11/D-12/D-13/D-19）：
 * 注册/移除单位、驱动决策并执行动作、把物理伤害路由给 `IDamageSink`。
 * 它检测并处理死亡单位，但**不拥有**战斗规则；注册快照保持冻结（WR-01 已接受）。
 */
export interface IControlSystem extends IUnitCatalog {
    /** 注册一个单位：绑定阵营、构造物理规格并创建该单位的 AI 实例。 */
    registerUnit(request: IControlUnitRegistration): void;
    /** 移除一个单位：销毁 AI 实例、从目录移除并删除其物理刚体。 */
    unregisterUnit(unitId: number): void;
    /** 预留的运行时阵营更新入口（Phase 4 城池易手/转阵营）；Phase 3 不调用。 */
    updateTeam(unitId: number, teamId: number): void;
    tick(): IControlTickResult;
    /** 释放全部 AI 实例与内部状态。 */
    dispose(): void;
}
```

**Round 1 应直接照抄 RESEARCH §Recommended Contract Shape（`04-RESEARCH.md:818-1217`）：**

- 8 个数字枚举：`TimeRate`(1/24)、`ArmyState`(0-3)、`UnitControlMode`(0-3)、`ArmyOrderKind`(0-3)、`BattleState`(0-1)、`BattleTriggerKind`(0-1)、`BattleLifecycleKind`(0-1)、`CityKind`(0-1)。成员值必须逐字钉版。
- 缺失值严格按 AGENTS §8：对象缺失 → `null`；字面量缺失 → 可选字段 / `undefined`。
- 只引用冻结类型：`import type { IUnitBrief } from '@/control/types'`、`import type { ClassKind, IUnit } from '@/units/types'`。依赖方向必须 `kingdom → control/physics/units`，绝不反向。
- 接口方法全部 `getX()`，禁止 JS getter/setter。
- 不要在该文件 import 任何类（`ControlSystem`/`PhysicsWorld`/`Unit`），否则类型文件会把实现拖进运行时图。

**需要新增到该文件的内部可变接口（RESEARCH 未展开，但 AGENTS §5 强制）：**

Round 2 的 `Army`/`City`/`Battle` 需要 `setCenter`/`setHeading`/`setState` 等写方法；若类只 `implements IArmy`，这些公共方法就违反「不允许出现不在 interface 中的公共成员」。因此应在 `types.ts` **末尾**追加并明确标注「内部类型，非门禁契约」：

```ts
/** 内部类型，非门禁契约：World 对军队的写入口。 */
export interface IMutableArmy extends IArmy {
    setCenter(x: number, y: number): void;
    setHeading(heading: number): void;
    setState(state: ArmyState): void;
    setUnitIds(unitIds: readonly number[]): void;
    setCityId(cityId: number | undefined): void;
    setOrder(order: IArmyOrder | null): void;
}
```

`IMutableCity`、`IMutableFaction`、`IMutableBattle` 同理。该类名与接口名必须成对（`I<Name>` + `implements`）。

---

### 2. `tests/kingdom/types.test.ts`（test，compile-time contract）

**Analog:** `tests/control/types.test.ts`

**Import / alias 证明**（`tests/control/types.test.ts:1-19`）：

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';

// 从 `@/control/types` 导入 `SkillIntentKind`：该导入本身就是别名解析的证明，
// 并会传递性地解析 `@/physics/types` 与 `@/units/types`。
import { SkillIntentKind } from '@/control/types';
import type {
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    IUnitBrief,
    IUnitObservation,
    IProjectileSighting,
    ISensor,
    IUnitSkillIntent,
    IWeaponSkillIntent,
    SkillIntent
} from '@/control/types';
```

**枚举钉版范式**（`tests/control/types.test.ts:21-42`）：每个成员值 + `typeof === 'number'` + 整数性 + 互异性：

```ts
describe('control-system types — numeric SkillIntentKind enum', () => {
    it('pins Weapon to 0 and proves it is numeric', () => {
        expect(SkillIntentKind.Weapon).toBe(0);
        expect(typeof SkillIntentKind.Weapon).toBe('number');
    });

    it('pins Unit to 1', () => {
        expect(SkillIntentKind.Unit).toBe(1);
    });

    it('every member is an integer and the two members are distinct', () => {
        const members: readonly number[] = [
            SkillIntentKind.Weapon,
            SkillIntentKind.Unit
        ];
        expect(members).toHaveLength(2);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(2);
    });
});
```

**方法签名断言**（`tests/control/types.test.ts:96-114`）：

```ts
it('IUnitAI.decide maps an observation to an action', () => {
    expectTypeOf<IUnitAI['decide']>()
        .parameter(0)
        .toEqualTypeOf<IUnitObservation>();
    expectTypeOf<
        ReturnType<IUnitAI['decide']>
    >().toEqualTypeOf<IUnitAction>();
});

it('IUnitAIProvider.create returns an IUnitAI and ISensor.sense may return null', () => {
    expectTypeOf<
        ReturnType<IUnitAIProvider['create']>
    >().toEqualTypeOf<IUnitAI>();
    expectTypeOf<
        ISensor['sense']
    >().returns.toEqualTypeOf<IUnitObservation | null>();
});
```

**判别式联合收窄**（`tests/control/types.test.ts:116-143`）：用函数参数接收联合，避免赋值提前收窄；分支内 `expectTypeOf(intent).toEqualTypeOf<...>()`。

**Planner 应映射到 Phase 4 的断言：**

- 8 个枚举逐成员钉版；`TimeRate.Normal === 1`、`TimeRate.Fast === 24`。
- `expectTypeOf<IWorld['tick']>().returns.toEqualTypeOf<IWorldTickResult>()`。
- `expectTypeOf<IBattleSystem['getBattleForUnit']>().returns.toEqualTypeOf<IBattle | null>()`。
- `expectTypeOf<ITimeSystem['getRate']>().returns.toEqualTypeOf<TimeRate>()`。
- `expectTypeOf<UnitWeight>().toEqualTypeOf<(unit: IUnit) => number>()`。
- `expectTypeOf<GarrisonSelector>()` 参数/返回值精确。
- 用完整对象字面量构造 `IArmy`/`ICity`/`IBattle`/`IArmyOrder`/`IScenario`，编译期证明字段齐全。
- **注意：`expectTypeOf` 运行时是空操作，真正的门禁是 `pnpm typecheck`。**

---

### 3. `src/kingdom/constants.ts`（config，static）

**Analog:** `src/control/constants.ts`（主）；`src/physics/constants.ts`（次）

**文件头 + 顶层 const JSDoc**（`src/control/constants.ts:1-18`）：

```ts
/**
 * 操控系统的数值常量：决策节奏、感知上限、执行器钳制与默认 AI 参数。
 * 本文件是操控数值的唯一调参入口——改动一行即改动一个行为参数；
 * 全部为类型化顶层 `const` + JSDoc（AGENTS §6），不使用 JSON 数据文件，不使用工厂函数。
 * 固定步长 `DT` 继续来自 `@/physics/constants`，此处**不重复声明**。
 */

/**
 * 决策间隔（控制 tick 数）：每 6 个 tick（0.1 s）决策一次（D-12/CTRL-03）。
 * 节奏以 tick 计数，绝不使用 wall-clock 或帧间隔；可校准（本阶段锁定 6）。
 */
export const DECISION_INTERVAL_TICKS = 6;
```

**常量组之间用 JSDoc 说明「可校准 / 规格值」**（`src/control/constants.ts:38-54`）：

```ts
/**
 * 单个方向的力大小上限（N）：AI 输出经校验后每分量不超过该值（ASVS V5）。
 * 可校准的防御性上限，防止插件把单位弹出世界。
 */
export const MAX_FORCE_MAGNITUDE = 5000;

/**
 * 力矩大小上限（N·m）：AI 输出经校验后不超过该绝对值（ASVS V5）。
 * 可校准的防御性上限。
 */
export const MAX_TORQUE_MAGNITUDE = 2000;

/**
 * 判定「零力/零力矩」的阈值：低于该值时跳过 `applyForce`/`applyTorque`，
 * 避免零力唤醒睡眠刚体（research Pitfall 3）。取极小正数。
 */
export const FORCE_EPSILON = 1e-9;
```

**数值表范式**（`src/physics/constants.ts:16-42`）：`export const DEFAULT_GEOMETRY: IPhysicsGeometry = { ... }`，每个字段一行 JSDoc。

**Phase 4 常量清单（数值来自 CONTEXT/规格，必须逐字保留）：**

| 常量 | 值 | 来源 |
|------|----|------|
| `MAP_WIDTH` / `MAP_HEIGHT` | 1000 / 1000 | KING-01 |
| `ARMY_SPEED_PER_HOUR` | 10 | D-12 |
| `ARMY_FORMATION_RADIUS` | 25 | D-12 |
| `ARMY_VISION_RADIUS` | 100 | D-25 |
| `CITY_VISION_RADIUS` | 150 | D-25 |
| `BATTLE_TRIGGER_DISTANCE` | 80 | D-16 |
| `BATTLE_AREA_HALF_EXTENT` | 40 | D-17 |
| `MARCH_HEAL_PER_HOUR` | 1 | D-13 |
| `GARRISON_HEAL_PER_HOUR` | 2 | D-13 |
| `TRAINING_HOURS_NORMAL` / `TRAINING_HOURS_CAPITAL` | 96 / 72 | D-23 |
| `SUBSTEPS_NORMAL` / `SUBSTEPS_FAST` | 1 / 24 | D-07/D-09 |
| 其余 `[ASSUMED]` | 见 RESEARCH G-4 | 可校准 |

> **不要在此文件重新声明 `DT`。** 引用 `@/physics/constants` 的 `DT = 1/60`（`src/physics/constants.ts:9-14`），保持 Phase 2 冻结语义。

---

### 4. `src/kingdom/scenario.ts`（config，static data table）

**Analog:** `src/units/data.ts`

**类型化数据表 + JSDoc**（`src/units/data.ts:47-57`）：

```ts
/**
 * 控制等级的基础均值：规格固定**所有职业**的初始控制等级均值均为 10，故为共享常量而非职业字段。
 * `spawn.ts` 以 `sampleNormal(rng, CONTROL_LEVEL_BASE, CONTROL_LEVEL_BASE / 8)` 抽取初始控制等级。
 */
export const CONTROL_LEVEL_BASE = 10;

/**
 * 7 职业的完整数值定义，按 `ClassKind` 索引（缺项即编译错误）。
 * 各项基础值均为 1 级数值；`attackGrowth` 为 `k·L` 攻击成长形式的等级缩放系数 `k`，
 * `defenseGrowth` 为每级固定加算值，`maxHpGrowth` 为升级时的生命上限加算值。
 */
export const CLASS_DEFS: Record<ClassKind, IClassDef> = {
    // ...
};
```

**Phase 4 形状：**

```ts
/** 默认可跑场景（D-28）：2 势力、各 1 城 1 军、每军 8–12 单位、城池附近留缺口地形。 */
export const DEFAULT_SCENARIO: IScenario = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    factions: [ /* ... */ ],
    cities: [ /* ... */ ],
    armies: [ /* ... */ ],
    terrain: [ /* ... */ ]
};
```

- 场景与代码分离（D-28）；测试可传入自己的 `IScenario`。
- 不要在该文件做校验或生成单位；校验放在 `KingdomWorld` 构造时（§15）。
- 地形矩形必须给城池留明显缺口（RESEARCH Pitfall 13 / A10）。

---

### 5. `src/kingdom/TimeSystem.ts`（service，tick/time）

**Analog:** `src/control/ControlSystem.ts`

**类骨架 + 私有状态 + 构造 JSDoc**（`src/control/ControlSystem.ts:48-98`）：

```ts
/**
 * 操控系统：注册/移除单位、驱动决策并执行动作、路由伤害、清理死亡单位。
 */
export class ControlSystem implements IControlSystem {
    /** 物理世界：力/力矩的唯一执行器与运动读数来源。 */
    private readonly physics: IPhysicsWorld;
    // ...
    /** 下一个控制 tick 的绝对序号：决策节奏的唯一依据。 */
    private tickIndex = 0;
    /** 是否已释放：`dispose()` 幂等性的唯一标记。 */
    private disposed = false;

    /**
     * 构造操控系统。
     * @param physics 物理世界。
     * @param sensingWorld 感知世界（边界/障碍几何与射弹）。
     * @param provider AI 提供者（唯一的 AI 构造接缝）。
     * @param damageSink 伤害接收方（拥有战斗规则）。
     */
    constructor(
        physics: IPhysicsWorld,
        sensingWorld: ISensingWorld,
        provider: IUnitAIProvider,
        damageSink: IDamageSink
    ) {
        this.physics = physics;
        // ...
    }
}
```

**Phase 4 形状：**

```ts
/** 时间系统：按游戏分钟累计，无 wall-clock（D-07/D-08）。 */
export class TimeSystem implements ITimeSystem {
    /** 自开局累计的游戏分钟。 */
    private gameMinutes = 0;
    /** 当前全局倍率。 */
    private rate = TimeRate.Fast;
    /** 外层 tick 序号（由 World 通过契约中的推进入口递增，见 C-17）。 */
    private tickIndex = 0;

    getGameMinutes(): number { return this.gameMinutes; }
    getRate(): TimeRate { return this.rate; }
    getTickIndex(): number { return this.tickIndex; }
    getSubstepsPerTick(): number { return this.rate; }

    /**
     * 推进游戏分钟（仅 World 调用）。
     * @throws {Error} 当 gameMinutes 非有限或为负时。
     */
    advance(gameMinutes: number): void {
        if (!Number.isFinite(gameMinutes) || gameMinutes < 0) {
            throw new Error('TimeSystem.advance: gameMinutes must be finite and non-negative');
        }
        this.gameMinutes += gameMinutes;
    }

    /** 设置全局倍率（仅 World 调用；D-09 有战斗即 1×）。 */
    setRate(rate: TimeRate): void { this.rate = rate; }
}
```

- `getSubstepsPerTick()` 直接返回倍率值（`TimeRate.Normal = 1`、`Fast = 24`），与枚举定义一致。
- 不要读 `performance.now()` / `Date.now()`（RESEARCH Pitfall 18）。
- **`getTickIndex()` 的递增入口在提案契约中缺失**（`ITimeSystem` 只有 `advance`/`setRate`）。门禁必须在以下方案中选一个（见 C-17）：
  1. 给 `ITimeSystem` 增加 `advanceTick(): void`（推荐；语义最清晰）。
  2. `getTickIndex()` 表示「已推进的游戏分钟数 / 子步数」，由 `advance` 内部递增（改名或改 JSDoc）。
  3. World 自己持有外层 tick 序号；`ITimeSystem.getTickIndex()` 暂不实现（违反接口，需删除该方法）。
- 在未裁决前，planner 不要把 `getTickIndex` 的行为写死进测试。

---

### 6. `src/kingdom/Army.ts`（model，state + read view）

**Analog:** `src/units/Unit.ts`

**私有字段 + 只读 getter 方法 + 构造 JSDoc**（`src/units/Unit.ts:27-104`）：

```ts
/** 单位：承载生成属性、区分职业、并实现经验累积与升级的状态机。 */
export class Unit implements IUnit {
    /** 职业定义（基础值、成长系数、初始装备与升级解锁表）。 */
    private readonly def: IClassDef;
    // ...
    /** 当前生命值。 */
    private hp: number;
    /** 当前等级，从 1 开始。 */
    private level: number;

    /**
     * 创建一个单位。
     * @param classKind 职业。
     * @param roll 生成时按正态分布抽取的 7 项属性（作为 1 级基础值）。
     * @param modifiers 注入的加成修正器列表，默认空（Phase 1 无自身加成来源）。
     * @param name 单位显示名；省略时回退为职业名（D-12）。
     * @throws {RangeError} 当 `classKind` 不是有效的 `ClassKind` 枚举序号时（数字枚举在运行时可为任意数）。
     */
    constructor(...) { /* ... */ }
}
```

**读取方法返回快照 / 原语**（`src/units/Unit.ts:156-179`）：

```ts
/** 返回单位显示名。 */
getName(): string { return this.name; }

/** 返回当前装备列表的副本。 */
getEquipment(): readonly IEquipment[] {
    return [...this.equipment];
}
```

**Phase 4 形状：**

```ts
/** 军队：宏观容器，不是物理/战斗实体（D-01）。 */
export class Army implements IArmy, IMutableArmy {
    /** 军队 id（跨战斗持久，D-05）。 */
    private readonly id: number;
    /** 所属势力 id。 */
    private readonly factionId: number;
    /** 中心位置的 x 坐标（米）。 */
    private x = 0;
    /** 中心位置的 y 坐标（米）。 */
    private y = 0;
    /** 朝向弧度（0 = +x，逆时针）。 */
    private heading = 0;
    /** 宏观状态。 */
    private state = ArmyState.Marching;
    /** 单位 id 名册。 */
    private unitIds: number[] = [];
    /** 驻扎城池 id；未驻扎为 `undefined`。 */
    private cityId: number | undefined;
    /** 当前宏观指令；无指令为 `null`。 */
    private order: IArmyOrder | null = null;

    getCenter(): IVec2 { return { x: this.x, y: this.y }; }
    getUnitIds(): readonly number[] { return [...this.unitIds]; }
    // ...
    /** 由 World 每子步调用：按 10 m/h 移动中心并处理边缘反弹（D-12）。 */
    setCenter(x: number, y: number): void { /* finite guard */ }
}
```

- `getCenter()` 返回新对象，不泄漏内部可变状态（同 `Unit.getEquipment()`）。
- 名册返回 `[...this.unitIds]`（同 `ControlSystem.listUnitIds()`：`src/control/ControlSystem.ts:317-319`）。
- 缺失对象 `null`、缺失字面量 `undefined`（AGENTS §8）。
- 边缘反弹逻辑建议放在 `KingdomWorld.updateArmies()` 或 `Army` 的私有 `advanceCenter()`，不要放进 `MarchAI`（AI 只输出力）。
- 不要给 `Army` 加任何物理刚体或 `IUnit` 引用；它只持有 `unitId`。

---

### 7. `src/kingdom/City.ts`（model，state + read view）

**Analog:** `src/units/Unit.ts`（与 §6 相同）

**Phase 4 形状：**

```ts
/** 城池：地图上的点，无物理/射线实体（D-26）。 */
export class City implements ICity, IMutableCity {
    /** 城池 id。 */
    private readonly id: number;
    /** 归属势力 id；无主为 `undefined`。 */
    private factionId: number | undefined;
    /** 城池点位置的 x 坐标（米）。 */
    private readonly x: number;
    /** 城池点位置的 y 坐标（米）。 */
    private readonly y: number;
    /** 规模。 */
    private readonly kind: CityKind;
    /** 驻扎军队 id；无驻军为 `undefined`。 */
    private garrisonArmyId: number | undefined;
    /** 驻军上限。 */
    private readonly garrisonCap: number;
    /** 训练职业。 */
    private readonly trainingClass: ClassKind;
    /** 当前训练进度（游戏分钟）。 */
    private trainingProgressMinutes = 0;

    getPosition(): IVec2 { return { x: this.x, y: this.y }; }
    getFactionId(): number | undefined { return this.factionId; }
    // ...
}
```

- 城池没有 collider、没有射线几何（D-26 / Pitfall 19）。
- `setFactionId` / `setGarrisonArmyId` / `setTrainingProgressMinutes` 放在 `IMutableCity`；`KingdomWorld` 在战后结算/训练推进时调用。
- 训练进度边界（Pitfall 15）：驻军满时暂停；产出后减去阈值而不是清零；每次最多产出 1 个。

---

### 8. `src/kingdom/BattleSystem.ts`（service / state machine，batch + event queue）

**Analog:** `src/control/ControlSystem.ts`（tick 编排/守卫）；`src/physics/PhysicsWorld.ts`（批量迭代 + 事件数组）

**tick 编排 + 批量处理**（`src/control/ControlSystem.ts:175-269`）：

```ts
tick(): IControlTickResult {
    if (this.disposed) {
        return { skillIntents: [] };
    }

    const skillIntents: SkillIntent[] = [];
    if (this.tickIndex % DECISION_INTERVAL_TICKS === 0) {
        for (const unitId of this.listUnitIds()) {
            // 感知/插件调用全部 try-catch 隔离
        }
    }

    for (const [unitId, action] of this.actions) {
        // 每 tick 重施加
    }

    const result = this.physics.tick();
    for (const damage of result.damages) {
        this.routeDamage(damage);
    }

    const deadUnitIds: number[] = [];
    for (const [unitId, unit] of this.units) {
        if (!unit.isAlive()) { deadUnitIds.push(unitId); }
    }
    for (const unitId of deadUnitIds) {
        this.removeRegisteredUnit(unitId);
    }
    this.tickIndex += 1;
    return { skillIntents };
}
```

**事件收集 + drain 语义**（`src/physics/PhysicsWorld.ts:223-227,426-435`）：

```ts
const contacts: IContactEvent[] = [];
const damages: IDamageEvent[] = [];
// ...
for (const candidate of damageCandidates.values()) {
    damages.push(candidate);
}
return { contacts, damages };
```

**Phase 4 形状（直接照 RESEARCH Pattern 2 / 骨架 `04-RESEARCH.md:1467-1502`）：**

```ts
/** 战斗容器：单位级成员、加权中心、结束/合并、播放队列（D-02/D-03/D-04）。 */
export class BattleSystem implements IBattleSystem {
    /** 活跃战斗（按开始顺序）。 */
    private active: Battle[] = [];
    /** 已完成战斗（按结束顺序）。 */
    private completed: Battle[] = [];
    /** unitId → battleId（一对一；Pitfall 9）。 */
    private unitToBattle = new Map<number, number>();
    /** 生命周期事件缓冲。 */
    private events: IBattleLifecycleEvent[] = [];
    /** 重战锁定：`armyA:armyB` / `army:city`（D-05 / Pitfall 10）。 */
    private retriggerLocks = new Map<string, true>();

    /**
     * 推进一个物理子步（由 World 每子步调用）。
     * 顺序：剪枝 → 离区 → 加入 → 触发 → 合并 → 重算中心 → 结束。
     */
    tick(): void {
        this.pruneDead();
        for (const battle of this.active) this.removeUnitsOutside(battle);
        for (const battle of this.active) this.addUnitsInside(battle);
        this.triggerArmyBattles();
        this.triggerCityBattles();
        this.mergeOverlapping();
        for (const battle of this.active) this.recomputeWeightedCenter(battle);
        for (const battle of this.active) this.endIfOneFaction(battle);
    }
}
```

**必须照搬的契约细节：**

- `IBattleSystem.tick()` 是契约名（RESEARCH 正文偶写 `reconcile()`；以契约 `tick()` 为准）。
- 构造时注入 `() => time.getGameMinutes()`，避免 `BattleSystem ↔ TimeSystem` 循环依赖（同 `ControlSystem` 构造 `Sensor` 时的 `() => this.tickIndex`，`src/control/ControlSystem.ts:92-97`）。
- 构造时注入 `onEnded(battle)` 回调；`BattleSystem` 只判定结束，城池接管/重组/重战锁定由 `World` 在回调里做（RESEARCH §Pattern 2）。
- 权重函数调用必须 try-catch + 有限/正数守卫（RESEARCH ASVS V5 / Pitfall 6）：

```ts
let weight = 1;
try {
    const raw = this.weightOf(unit);
    if (Number.isFinite(raw) && raw > 0) weight = raw;
} catch {
    weight = 1;
}
```

- 成员中心先按**上一中心**剪枝，再用剪枝后成员重算；加 1m 迟滞（Pitfall 6）。
- `Map<unitId, battleId>` 一对一（Pitfall 9）；合并时重新指向存活战场。
- 事件顺序：保留较早 `battleId`；被吸收者发 `Ended` + `mergedIntoBattleId`（Pitfall 20 / A16）。
- `drainEvents()` 返回新数组并清空内部缓冲，绝不泄漏内部数组。

---

### 9. `src/kingdom/DamageSink.ts`（service，event-driven）

**Analog:** `tests/control/damage-sink.ts`（Phase 3 的生产镜像；目前仓库只有测试胶合实现）

**过滤顺序 + 存活守卫 + 经验**（`tests/control/damage-sink.ts:29-61`）：

```ts
applyDamage(context: IDamageContext): void {
    if (context.attackerTeamId === context.defenderTeamId) {
        return;
    }
    if (!context.defender.isAlive()) {
        return;
    }

    const wasAlive = context.defender.isAlive();
    context.defender.takeDamage(context.event.damage);
    const survivedHit = context.defender.isAlive();

    // 经验会触发升级回血：绝不给已被该击杀死/死亡的单位授予经验，否则会复活。
    if (context.attacker.isAlive()) {
        context.attacker.gainAttackExperience(context.event.damage);
    }
    if (survivedHit) {
        context.defender.gainDefenseExperience(context.event.damageReduced);
    }

    if (wasAlive && !survivedHit && context.attacker.isAlive()) {
        context.attacker.gainKillExperience(
            context.defender.getAttribute(AttributeKind.Level)
        );
    }

    this.onApplied?.(context);
}
```

**Phase 4 过滤流程（RESEARCH `04-RESEARCH.md:541-557`）：**

```ts
applyDamage(context: IDamageContext): void {
    if (context.attackerTeamId === context.defenderTeamId) return;          // 同队免伤
    if (!context.defender.isAlive()) return;                                // 同 tick 已死
    const battle = this.battles.getBattleForUnit(context.event.attackerId);
    if (battle === null) return;                                            // 攻方不在战斗
    if (this.battles.getBattleForUnit(context.event.defenderId) !== battle) return; // 不同战场
    const a = this.physics.getUnitState(context.event.attackerId);
    const d = this.physics.getUnitState(context.event.defenderId);
    if (a === null || d === null) return;
    const c = battle.getCenter();
    const h = battle.getHalfExtent();
    if (!inside(c.x, c.y, h, a.x, a.y)) return;                             // 攻方离区
    if (!inside(c.x, c.y, h, d.x, d.y)) return;                             // 守方离区
    // 之后完全照抄 TestDamageSink 的 takeDamage + 三种经验 + 存活守卫
}
```

- `IDamageContext` 已经解析了 `IUnit` 与 `teamId`（`src/control/types.ts:247-258`）；sink 不需要目录。
- **绝不**调用 `physics.removeUnit`：死亡注销由 `ControlSystem` 统一负责（`tests/control/damage-sink.ts:1-5` 文件头注释）。
- sink 抛错由 `ControlSystem.routeDamage` 隔离（`src/control/ControlSystem.ts:532-536`），因此 sink 内部只需保证不产生 NaN；但仍然要守卫 `isAlive` 与有限值。
- 依赖注入：`physics: IPhysicsWorld` + `battles: IBattleSystem`；不注入 World，避免循环。

---

### 10. `src/kingdom/SensingWorld.ts`（service / utility，query）

**Analog:** `tests/control/arena.ts`（完全相同的 `ISensingWorld` 实现）

**64 条世界固定方向射线**（`tests/control/arena.ts:43-76`）：

```ts
castRayFan(
    originX: number,
    originY: number,
    maxDistance: number,
    blockers: readonly ISensedUnit[]
): readonly number[] {
    const distances: number[] = [];
    const step = (Math.PI * 2) / RAY_COUNT;
    for (let index = 0; index < RAY_COUNT; index += 1) {
        const angle = index * step;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let nearest = this.rayBoundaryDistance(originX, originY, dx, dy);
        for (const blocker of blockers) {
            const hit = this.rayCircleDistance(
                originX, originY, dx, dy,
                blocker.x, blocker.y, blocker.radius
            );
            if (hit < nearest) { nearest = hit; }
        }
        const bounded = Math.min(nearest, maxDistance);
        distances.push(
            Number.isFinite(bounded) ? Math.max(0, bounded) : maxDistance
        );
    }
    return distances;
}
```

**射线 × AABB slab 法**（`tests/control/arena.ts:99-124`）：

```ts
private rayBoundaryDistance(originX, originY, dx, dy): number {
    const slab = (origin: number, direction: number): [number, number] => {
        if (Math.abs(direction) < 1e-12) {
            const outside = origin < -this.halfExtent || origin > this.halfExtent;
            return outside ? [Infinity, -Infinity] : [-Infinity, Infinity];
        }
        const first = (-this.halfExtent - origin) / direction;
        const second = (this.halfExtent - origin) / direction;
        return first < second ? [first, second] : [second, first];
    };

    const [xEnter, xExit] = slab(originX, dx);
    const [yEnter, yExit] = slab(originY, dy);
    const enter = Math.max(xEnter, yEnter);
    const exit = Math.min(xExit, yExit);
    if (exit < 0 || enter > exit) return Infinity;
    return enter >= 0 ? enter : exit;
}
```

**射线 × 圆**（`tests/control/arena.ts:126-162`）：二次方程；原点在圆内返回 0；无正向交点返回 `Infinity`。

**Phase 4 形状：**

```ts
/** 王国感知世界：地图边界 + 城池附近地形 AABB + 敌方单位圆（D-02/D-27）。 */
export class KingdomSensingWorld implements ISensingWorld {
    /** 地图尺寸。 */
    private readonly bounds: IMapBounds;
    /** 地形矩形（挡射线）。 */
    private readonly terrain: readonly ITerrainRect[];

    /**
     * 投射 64 条世界固定方向射线。
     * 命中集合 = 地图边界 + 地形矩形 + 传入的敌方 blockers。
     */
    castRayFan(originX, originY, maxDistance, blockers): readonly number[] { /* ... */ }

    /** Phase 4 仍无射弹；返回共享只读空数组（同 arena.ts:15-16）。 */
    queryProjectiles(_x, _y, _radius): readonly IProjectileSighting[] {
        return EMPTY_PROJECTILES;
    }
}
```

- 复用 `RAY_COUNT`、`SENSING_MAX_DISTANCE` 来自 `@/control/constants`（`src/control/constants.ts:18,24`）。
- 地形射线用解析几何，不要每单位每决策调 64 次 Rapier（RESEARCH §Alternatives / Pattern 7）。
- 只接收敌方 `blockers`（`ISensingWorld` 契约保证友方永不遮挡，`src/control/types.ts:64-80`）。
- 输出必须恰好 64 个、`[0, maxDistance]`；非有限值取 `maxDistance`。
- 共享空数组用顶层 `const` + JSDoc（`arena.ts:15-16`），避免每次查询分配。

---

### 11. `src/kingdom/MarchAI.ts`（AI，IUnitAI）

**Analog:** `src/control/DefaultUnitAI.ts`

**类声明 + 私有冷却状态 + decide JSDoc**（`src/control/DefaultUnitAI.ts:47-96`）：

```ts
/**
 * 默认基线 AI：确定性的追击 / 冲撞 / 撤退选择器，附带一次性技能意图。
 */
export class DefaultUnitAI implements IUnitAI {
    /** 弓箭射击的下一次可用 tick：0 表示出生即可用（D-17）。 */
    private bowReadyTick = 0;

    /**
     * 基于一次决策快照选择动作。纯计算，不持有物理或单位引用。
     * 优先级：无敌人 → 低生命撤退 → 攻击距离内冲撞 → 否则追击。
     * @param observation 纯数据快照。
     * @returns 世界坐标四向力 + 双向力矩 + 技能意图。
     */
    decide(observation: IUnitObservation): IUnitAction { /* ... */ }
}
```

**速度误差控制 + PD 朝向 + 分量分解**（`src/control/DefaultUnitAI.ts:272-329`）：

```ts
const mass = observation.attributes[AttributeKind.Mass];
const desiredVx = normalizedX * speed;
const desiredVy = normalizedY * speed;
let fx = (desiredVx - observation.motion.vx) * mass * DEFAULT_AI_LINEAR_GAIN;
let fy = (desiredVy - observation.motion.vy) * mass * DEFAULT_AI_LINEAR_GAIN;

const magnitude = Math.hypot(fx, fy);
if (!Number.isFinite(magnitude)) {
    fx = 0;
    fy = 0;
} else if (magnitude > MAX_FORCE_MAGNITUDE) {
    const scale = MAX_FORCE_MAGNITUDE / magnitude;
    fx *= scale;
    fy *= scale;
}

const torque = this.torqueToward(observation, normalizedX, normalizedY);

return {
    forceUp: fy > 0 ? fy : 0,
    forceDown: fy < 0 ? -fy : 0,
    forceLeft: fx < 0 ? -fx : 0,
    forceRight: fx > 0 ? fx : 0,
    torqueClockwise: torque < 0 ? -torque : 0,
    torqueCounterClockwise: torque > 0 ? torque : 0,
    skillIntent
};
```

**PD 力矩**（`src/control/DefaultUnitAI.ts:239-270`）：

```ts
const desiredAngle = Math.atan2(dirY, dirX);
let angleError = desiredAngle - observation.motion.angle;
angleError = Math.atan2(Math.sin(angleError), Math.cos(angleError));
const rawTorque =
    DEFAULT_AI_ANGULAR_GAIN * angleError -
    DEFAULT_AI_ANGULAR_DAMPING * observation.motion.angularVelocity;
if (!Number.isFinite(rawTorque)) return 0;
return Math.max(-MAX_TORQUE_MAGNITUDE, Math.min(MAX_TORQUE_MAGNITUDE, rawTorque));
```

**Phase 4 形状（RESEARCH Pattern 5 / `04-RESEARCH.md:1506-1551`）：**

```ts
/** 行军 AI：追阵型槽位 + 速度误差 + 射线排斥，不含行为树（D-11/D-12）。 */
export class MarchAI implements IUnitAI {
    /** 本 AI 所属单位 id。 */
    private readonly unitId: number;
    /** 阵型槽位/战斗区的只读来源。 */
    private readonly modes: IUnitModeSource;

    /**
     * 构造行军 AI。
     * @param unitId 本 AI 所属单位 id。
     * @param modes 阵型槽位只读来源。
     */
    constructor(unitId: number, modes: IUnitModeSource) {
        this.unitId = unitId;
        this.modes = modes;
    }

    decide(obs: IUnitObservation): IUnitAction {
        const slot = this.modes.getFormationSlot(this.unitId);
        if (slot === null) return ZERO_ACTION;
        // dx/dy → dist → desired speed → 64 ray avoidance → force/torque → 四向分解
    }
}
```

- 不要在 `MarchAI` 里保存「当前模式」；模式属于 World（RESEARCH Pattern 3）。
- 槽位由 World 每子步算好（均匀圆盘：`radius = 25 * sqrt((index + 0.5) / count)`）。
- 力/力矩上限沿用 `MAX_FORCE_MAGNITUDE` / `MAX_TORQUE_MAGNITUDE`（`src/control/constants.ts:38-48`）。
- 零动作可复用 `DefaultUnitAI.zeroAction()` 的形状（`src/control/DefaultUnitAI.ts:98-112`）；建议在 `ModeAI.ts` 或 `constants.ts` 里放一个 `ZERO_ACTION` 顶层 const（+ JSDoc），避免每类重复。

---

### 12. `src/kingdom/BattleAI.ts`（AI wrapper，IUnitAI）

**Analog:** `src/control/DefaultUnitAI.ts`（被包装的内层 AI）

**Phase 4 形状（RESEARCH `04-RESEARCH.md:1553-1575`）：**

```ts
/** 战斗 AI：把 DefaultUnitAI 的敌人过滤到本战斗区。 */
export class BattleAI implements IUnitAI {
    /** 本 AI 所属单位 id。 */
    private readonly unitId: number;
    /** 战斗区只读来源。 */
    private readonly modes: IUnitModeSource;
    /** 内层基线 AI（默认 DefaultUnitAI）。 */
    private readonly inner: IUnitAI;

    /**
     * 构造战斗 AI。
     * @param unitId 本 AI 所属单位 id。
     * @param modes 战斗区只读来源。
     * @param inner 内层基线 AI，默认使用 DefaultUnitAI。
     */
    constructor(
        unitId: number,
        modes: IUnitModeSource,
        inner: IUnitAI = new DefaultUnitAI()
    ) {
        this.unitId = unitId;
        this.modes = modes;
        this.inner = inner;
    }

    decide(obs: IUnitObservation): IUnitAction {
        const battle = this.modes.getBattleArea(this.unitId);
        if (battle === null) return ZERO_ACTION;
        const c = battle.getCenter();
        const h = battle.getHalfExtent();
        const enemies = obs.enemies.filter(
            (e) => Math.abs(e.x - c.x) <= h && Math.abs(e.y - c.y) <= h
        );
        return this.inner.decide({ ...obs, enemies });
    }
}
```

- 默认参数 `new DefaultUnitAI()` 直接复用 Phase 3 的基线行为；不要复制一份 AI 逻辑。
- `obs.rayDistances` 保持全局（不按战斗区过滤）——地形/友军遮挡仍然有效；只有敌人列表按区过滤。
- `BattleAI` 不保存状态；冷却状态在内层 `DefaultUnitAI` 实例里。
- 低血撤退可能离开战斗区（A11）；这是预期行为，由 `BattleSystem` 的离区判定接管。

---

### 13. `src/kingdom/ModeAI.ts`（provider / composite，request-response）

**Analog:** `src/control/DefaultUnitAI.ts`（被委托的四种 AI）+ `src/control/ControlSystem.ts`（provider 生命周期）

**Provider 生命周期**（`src/control/ControlSystem.ts:128-144`）：

```ts
const spec = this.buildSpec(request);
const ai = this.provider.create(request.unitId, request.unit);
try {
    this.physics.registerUnit(spec);
} catch (error) {
    try {
        this.provider.destroy(request.unitId);
    } catch {
        // 清理失败不掩盖原始的物理注册错误。
    }
    throw error;
}

this.units.set(request.unitId, request.unit);
this.teams.set(request.unitId, request.teamId);
this.ais.set(request.unitId, ai);
this.actions.set(request.unitId, this.zeroAction());
```

**Phase 4 形状（RESEARCH `04-RESEARCH.md:566-600`）：**

```ts
/** 复合 AI：按 World 写入的模式委托到 March/Battle/Brake/Idle。 */
export class ModeAI implements IUnitAI {
    /** 本 AI 所属单位 id。 */
    private readonly unitId: number;
    /** 模式只读来源。 */
    private readonly modes: IUnitModeSource;
    /** 行军模式 AI。 */
    private readonly march: IUnitAI;
    /** 战斗模式 AI。 */
    private readonly battle: IUnitAI;
    /** 离区刹车 AI。 */
    private readonly brake: IUnitAI;
    /** 驻扎待命 AI。 */
    private readonly idle: IUnitAI;

    /**
     * 构造复合 AI。
     * @param unitId 本 AI 所属单位 id。
     * @param modes 模式只读来源。
     * @param march 行军 AI。
     * @param battle 战斗 AI。
     * @param brake 刹车 AI。
     * @param idle 待命 AI。
     */
    constructor(
        unitId: number,
        modes: IUnitModeSource,
        march: IUnitAI,
        battle: IUnitAI,
        brake: IUnitAI,
        idle: IUnitAI
    ) {
        this.unitId = unitId;
        this.modes = modes;
        this.march = march;
        this.battle = battle;
        this.brake = brake;
        this.idle = idle;
    }

    decide(observation: IUnitObservation): IUnitAction {
        switch (this.modes.getMode(this.unitId)) {
            case UnitControlMode.March: return this.march.decide(observation);
            case UnitControlMode.Battle: return this.battle.decide(observation);
            case UnitControlMode.Brake: return this.brake.decide(observation);
            case UnitControlMode.Idle: return this.idle.decide(observation);
            default: return this.idle.decide(observation);
        }
    }
}

/** 唯一 AI 构造接缝：为每个单位创建一个复合 ModeAI。 */
export class KingdomAIProvider implements IUnitAIProvider {
    /** 模式只读来源。 */
    private readonly modes: IUnitModeSource;

    /**
     * 构造 Provider。
     * @param modes 模式只读来源。
     */
    constructor(modes: IUnitModeSource) {
        this.modes = modes;
    }

    create(unitId: number, _unit: IUnit): IUnitAI {
        return new ModeAI(
            unitId, this.modes,
            new MarchAI(unitId, this.modes),
            new BattleAI(unitId, this.modes),
            new BrakeAI(),
            new IdleAI()
        );
    }

    destroy(_unitId: number): void {
        // 无内部状态需释放；保留接缝。
    }
}
```

**四个小类都必须各自 `implements IUnitAI`：**

- `BrakeAI`：速度误差控制到 0；不追击、不使用技能。可用 `DefaultUnitAI` 的 `buildAction` 思路，但目标是零速度。
- `IdleAI`：直接返回 `ZERO_ACTION`；不施力，避免唤醒睡眠刚体。
- `MarchAI` / `BattleAI` 见 §11/§12。
- 数字枚举运行时可能是任意数：`switch` 必须有 `default` 回退 `Idle`，绝不抛错中断 tick（RESEARCH Pattern 3）。
- `destroy` 留空但保留 JSDoc；不要为了「可能有状态」而预留额外字段（anti-over-engineering）。

---

### 14. `src/kingdom/Commander.ts`（service / strategy，partial analog）

**Analog:** `src/control/DefaultUnitAI.ts`（决策函数的形状；仓库没有 `ICommander` 先例）

**Phase 4 形状（D-29）：**

```ts
/** 最小占位指挥官：只输出宏观指令，Phase 7 整体替换（D-29）。 */
export class PlaceholderCommander implements ICommander {
    /**
     * 基于受限视野返回本 tick 的宏观指令。
     * 具体目标选择不重要；只要接口可替换、行为确定、不读取 wall-clock。
     */
    decide(context: ICommanderContext): readonly IArmyOrder[] {
        // 1. 无军队 → []
        // 2. 每支军队：若有可见敌城 → AttackCity；否则若有可见敌军 → March；否则 Garrison/Hold
        // 3. 用平方距离选最近目标；同距离以 id 决胜（确定性，仿 DefaultUnitAI.nearestEnemy）
        return [];
    }
}
```

- 直接照 `DefaultUnitAI.nearestEnemy()` 的确定性选择模式（`src/control/DefaultUnitAI.ts:114-140`）：`distance < best.distance || (distance === best.distance && id < best.id)`。
- 不读 `IRng`，不读 wall-clock；目标选择用视野查询结果（`ICommanderContext`）。
- 异常隔离在调用方（`KingdomWorld` 每 tick 调 commander 时 try-catch，异常回退空指令），不要把 try-catch 塞进指挥官。
- 指令校验在 `IWorld.issueOrder`/`KingdomWorld`：有限数、目标在界内、军队/城池存在；无效订单丢弃（ASVS V5）。

---

### 15. `src/kingdom/KingdomWorld.ts`（orchestrator，batch tick）

**Analog:** `src/control/ControlSystem.ts`（唯一编排器 + 依赖注入 + dispose 语义）；`src/physics/PhysicsWorld.ts`（固定步进/生命周期）

**编排器骨架**（`src/control/ControlSystem.ts:48-98` 字段/构造 + `271-293` dispose）：

```ts
export class ControlSystem implements IControlSystem {
    private readonly physics: IPhysicsWorld;
    private readonly provider: IUnitAIProvider;
    private readonly damageSink: IDamageSink;
    private readonly sensor: ISensor;
    private units = new Map<number, IUnit>();
    private teams = new Map<number, number>();
    private disposed = false;

    /**
     * 释放全部 AI 实例与内部状态。幂等；**不**释放物理世界（不拥有它）。
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        // ...
    }
}
```

**外层 tick + 子步（RESEARCH `04-RESEARCH.md:1437-1465`）：**

```ts
tick(): IWorldTickResult {
    const start = this.time.getGameMinutes();
    const maxSubsteps = this.battles.hasActiveBattle()
        ? 1
        : this.time.getSubstepsPerTick(); // 1 or 24
    let steps = 0;
    while (steps < maxSubsteps) {
        this.stepSubstep();
        steps += 1;
        if (maxSubsteps > 1 && this.battles.hasActiveBattle()) break;
    }
    return {
        gameMinutes: this.time.getGameMinutes() - start,
        rate: this.time.getRate()
    };
}

private stepSubstep(): void {
    this.time.advance(1);                 // 1 game minute
    this.updateArmies();                  // center 10 m/h + bounce + formation slots
    this.battles.tick();                  // trigger/join/exit/merge/center/end
    this.updateUnitModes();               // March/Battle/Brake/Idle
    this.control.tick();                  // one physics step + damage routing
    this.applyHealingAndTraining();       // 1/h, 2/h, 96h/72h
    this.pruneRostersAndBattles();        // dead units
}
```

**构造/绑定顺序（RESEARCH Pattern 1，`04-RESEARCH.md:478-487`）：**

1. `PhysicsWorld`（全局物理）+ `IStaticObstacleWorld`（同一实例，G-2 批准后）。
2. `KingdomSensingWorld`（bounds + terrain + blockers；不依赖 control）。
3. `BattleSystem`（physics + weight + `() => time.getGameMinutes()` + `onEnded`）。
4. `BattleDamageSink`（physics + battles）。
5. `KingdomWorld` 实现 `IUnitModeSource`（先初始化 modes/slots/battle maps）。
6. `KingdomAIProvider(modes)` → `ControlSystem(physics, sensing, provider, sink)`。
7. World 把 `control` 赋给延迟绑定闭包；此后 BattleSystem 可解析单位/阵营。

> **装配方式二选一（门禁记录）：** ① `KingdomWorld` 构造函数内部创建 `control`，外部通过工厂 `createKingdomWorld()` 同时拿到 `{ world, control, physics }`；② 组合根先创建 `control`，再把引用传给 `KingdomWorld`。两种都必须满足 A18/C-19：`IWorld` 不暴露 `getControl()`/`getPhysics()`。

**关键不变量：**

- `unitId` 唯一身份；`factionId` 通过 `control.registerUnit({ teamId: factionId })` 注入，**绝不写回 `IUnit`**（CONTEXT「队伍映射」）。
- `dispose()` 幂等；**不**释放外部传入的 `physics`/`control`（同 `ControlSystem.dispose` 注释）。
- 构造时一次性校验 `IScenario`：有限数、正尺寸、id 唯一、引用存在、位置在界内、出生点不在地形内、单位/军队数上限；失败直接抛错，不进入 tick（ASVS V5）。
- 注入函数（权重/入驻/指挥官）调用 try-catch + 有限/非负守卫；异常回退默认值，继续 tick（ASVS V5 / ControlSystem 的插件隔离范式 `src/control/ControlSystem.ts:199-223`）。
- 只有 World 写 `UnitControlMode`；`BattleSystem` 只暴露成员/离区事实，避免两处写模式导致抖动。
- 死亡单位在子步末从军队名册、`unitToBattle`、模式表剪枝；物理/AI 注销由 `ControlSystem` 负责（`src/control/ControlSystem.ts:257-265`）。

**World 内部映射（建议）：**

```ts
/** 势力 id → 势力。 */
private factions = new Map<number, Faction>();
/** 军队 id → 军队。 */
private armies = new Map<number, Army>();
/** 城池 id → 城池。 */
private cities = new Map<number, City>();
/** unitId → armyId（阵营由 ControlSystem 持有，不写回 IUnit）。 */
private unitToArmy = new Map<number, number>();
/** unitId → 当前控制模式（只有 World 写，见 C-10）。 */
private unitModes = new Map<number, UnitControlMode>();
/** unitId → 当前阵型槽位。 */
private formationSlots = new Map<number, IVec2>();
/** 只标记「曾参战且离区」的单位（Pitfall 12）。 */
private exitedBattle = new Set<number>();
```

---

### 16. `tests/kingdom/harness.ts`（test fixture，real Rapier）

**Analog:** `tests/control/loop.test.ts`（RAPIER 生命周期）+ `tests/helpers/rng.ts`

**真实 Rapier 初始化与清理**（`tests/control/loop.test.ts:251-267`）：

```ts
describe('ControlSystem — execution semantics', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    /** 当前测试持有的真实物理世界（仅 tracer 与同队碰撞测试使用）。 */
    let physics: PhysicsWorld | null = null;
    let control: ControlSystem | null = null;

    afterEach(() => {
        control?.dispose();
        physics?.dispose();
        control = null;
        physics = null;
    });
```

**种子化 RNG**（`tests/helpers/rng.ts:3-18`）：

```ts
/**
 * mulberry32 确定性伪随机发生器：固定种子下产生可复现的 `[0, 1)` 均匀序列。
 * @param seed 初始种子。
 * @returns 一个确定性的 `IRng`。
 */
export function mulberry32(seed: number): IRng {
    let state = seed >>> 0;
    return { next(): number { /* ... */ } };
}
```

**Phase 4 形状：**

```ts
/** 测试夹具：真实 Rapier + 真实 ControlSystem/KingdomWorld 的小场景。 */
export interface IKingdomHarness {
    /** 真实物理世界。 */
    readonly physics: PhysicsWorld;
    /** 真实控制系统（与 world 共享同一 physics）。 */
    readonly control: ControlSystem;
    /** 王国世界。 */
    readonly world: KingdomWorld;
    /** 种子化随机源。 */
    readonly rng: IRng;
    /** 释放顺序：control → physics（world 不拥有二者）。 */
    dispose(): void;
}

/**
 * 构建一个小型可跑场景。
 * @param scenario 可选场景覆盖（默认 2 势力、各 1 城 1 军、每军少量单位）。
 * @param seed 确定性随机种子。
 */
export function createKingdomHarness(
    scenario: IScenario = DEFAULT_SCENARIO,
    seed = 1
): IKingdomHarness {
    // const rng = mulberry32(seed);
    // const physics = new PhysicsWorld({ dt: DT, geometry: DEFAULT_GEOMETRY }, rng);
    // // 组合根创建 control 与 world；World 不暴露 getControl()/getPhysics()
    // const control = /* ... */;
    // const world = new KingdomWorld({ physics, control, scenario, rng });
    // return { physics, control, world, rng, dispose };
}
```

- 接口 `IKingdomHarness` 的成员必须 JSDoc；返回对象字面量。
- **不要给 `KingdomWorld` 加 `getControl()`/`getPhysics()` 公共方法**——它们不在 `IWorld` 中，会违反 AGENTS §5。组合根/测试夹具自己保留引用，或由工厂返回 `{ world, control, physics }`（见 C-19）。
- `RAPIER.init()` 放在使用 harness 的测试文件的 `beforeAll`，不要放在 harness 函数里（幂等但重复 await 不利于测试可读性）。
- `afterEach` 调 `harness.dispose()`，内部顺序：`control.dispose()` → `physics.dispose()`；World 不拥有 physics/control（与 `ControlSystem.dispose` 一致）。
- RNG 一律 `mulberry32(seed)`；生产用 `MathRng`。
- 不要 mock Rapier；Phase 2/3 的既有范式是真实 WASM。

---

### 17-23. `tests/kingdom/*.test.ts`（7 个行为测试）

**Analog:** `tests/control/loop.test.ts`（真实 Rapier tracer + 调度断言）；纯查询测试参考 `tests/control/sensing.test.ts`。

**tracer 范式**（`tests/control/loop.test.ts:1626-1707`）：

```ts
it('tracer: two opposite teams decide, move, and route a damage event to the sink', () => {
    const world = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        mulberry32(20261020)
    );
    // registerUnit(...)
    for (let tick = 0; tick < 300; tick += 1) {
        const result = controller.tick();
        // 断言运动/伤害/事件
    }
    expect(decidedTicks[0]).toBe(0);
    expect(sawMovement).toBe(true);
    expect(applied.length).toBeGreaterThan(0);
});
```

**每个测试文件的断言边界：**

| File | 真实 Rapier? | 核心断言 | 依赖 |
|------|--------------|----------|------|
| `time.test.ts` | 否（纯 TimeSystem + 小 World） | 1× 跑 1 子步、24× 跑 24 子步、游戏分钟累计、战斗中切 1×、边缘反弹 | — |
| `march.test.ts` | 是 | 中心 10 m/h = 每子步 1/6 m；单位在 25m 圆内；行军回血 1/h（每子步 1/60） | G-1 |
| `battle.test.ts` | 是 | 两军中心 <80m 触发；正方形 ±40m；加权中心默认等级；离区 → Brake；区移回 → Battle；合并；只剩一阵营 → Ended；重战锁定 | — |
| `city.test.ts` | 是 | 空城直接接管；城池战结算；驻军上限；训练 96h/72h；驻扎回血 2/h；败方重组 | G-1 |
| `vision.test.ts` | 否（纯查询） | 军队 100m + 城池 150m 并集；己方永远可见；敌方中心或任一单位在圆内；无记忆 | — |
| `terrain.test.ts` | 是 | 固定 cuboid 挡住动态单位（x ≈ 4.0）；射线命中墙面（≈ 4.5）；移除后射线 = maxDistance；无 unit 伤害事件 | G-2 |
| `scenario.test.ts` | 否 | `DEFAULT_SCENARIO` id 唯一、引用存在、位置在界内、出生点不在地形内、2 势力/各 1 城 1 军/8–12 单位 | — |

**纯查询测试参考（`tests/control/sensing.test.ts`）：**

- 用 `StubPhysicsWorld implements IPhysicsWorld` 只实现 `getUnitState`，其余为安全空操作（`tests/control/sensing.test.ts:62-80`）；射线/视野测试同样不需要真实 Rapier。
- 辅助函数收窄 `null`（`tests/control/sensing.test.ts:48-60`）：

```ts
function senseOrFail(sensor: Sensor, unitId: number): IUnitObservation {
    const observation = sensor.sense(unitId);
    if (observation === null) {
        throw new Error(`expected an observation for unit ${unitId}`);
    }
    return observation;
}
```

**纯数据校验测试参考（`tests/units/data-classes.test.ts`）：**

- 完整性用 `Object.keys(TABLE).length` + 显式值列表（`tests/units/data-classes.test.ts:21-40`）：

```ts
it('holds exactly the 7 ClassKind entries', () => {
    expect(Object.keys(CLASS_DEFS)).toHaveLength(7);
    expect(ALL_CLASS_KINDS).toHaveLength(7);
});

it('ALL_CLASS_KINDS lists the 7 values in order and no reverse-mapped strings', () => {
    expect(ALL_CLASS_KINDS).toEqual([
        ClassKind.Swordsman, ClassKind.Archer, /* ... */
    ]);
    for (const kind of ALL_CLASS_KINDS) {
        expect(typeof kind).toBe('number');
    }
});
```

- `scenario.test.ts` 按同一范式断言：势力/城池/军队 id 数量、唯一性、引用存在、位置在界内、出生点不在地形内。

**通用约定：**

- 行为测试只钉规格值（10 m/h、25m、100m、150m、80m、96h/72h、1/h、2/h），其余默认值用 `toBeCloseTo` 或范围断言，不钉死 `[ASSUMED]` 数值（RESEARCH Open Question 4）。
- 每个测试文件自己 `beforeAll(RAPIER.init)`、`afterEach` dispose；不要共享全局 physics。
- 用 `expect(...).toBeCloseTo` 而非精确相等（Rapier f32 往返，`src/physics/constants.ts:12`）。
- 纯查询测试不需要 Rapier；不要为了「统一」而引入 WASM。

---

### 24. `src/units/types.ts`（G-1，追加 `IHealableUnit`）

**Analog:** 同文件 `IUnit`（`src/units/types.ts:223-247`）

**现有 `IUnit` 方法集（逐字，无 heal）**（`src/units/types.ts:223-247`）：

```ts
/** 单位核心契约：数值统一经 `getAttribute` 读取，禁止 getter/setter。 */
export interface IUnit {
    /** 统一数值读取入口；已存储的值直接返回，随等级派生的值按当前等级实时计算。 */
    getAttribute(kind: AttributeKind): number;
    /** 返回单位显示名；名称在生成时确定，用于录像中的辨识与追踪。 */
    getName(): string;
    /** 返回单位职业。 */
    getClass(): ClassKind;
    /** 返回当前装备列表。 */
    getEquipment(): readonly IEquipment[];
    /** 返回当前加成修正器列表。 */
    getModifiers(): readonly IModifier[];
    /** 返回已通过等级解锁习得的技能列表。 */
    getSkills(): readonly SkillKind[];
    /** 扣减生命值（用于让升级回复生命的效果可观察）。 */
    takeDamage(amount: number): void;
    /** 生命值归零后返回 `false`。 */
    isAlive(): boolean;
    gainAttackExperience(damageDealt: number): void;
    gainDefenseExperience(damageReduced: number): void;
    gainKillExperience(enemyLevel: number): void;
}
```

**追加（RESEARCH G-1，`04-RESEARCH.md:1238-1243`）：**

```ts
/** 可回血单位：Phase 4 的行军/驻扎回血入口（G-1）。 */
export interface IHealableUnit extends IUnit {
    /** 恢复生命值；非有限/非正值忽略，结果钳制到生命上限。 */
    heal(amount: number): void;
}
```

- **必须放在 `src/units/types.ts`**，不能放 `src/kingdom/types.ts`：否则 `Unit` 要 `implements` 一个来自 kingdom 的接口，依赖方向变成 units → kingdom（循环）。
- `IUnit` 本体逐字不变；这是纯加性扩展。
- 如果用户拒绝任何 `src/units/` 改动，KING-03/05 的回血无法满足，必须在门禁显式降级并记录（RESEARCH G-1 备选方案全部不推荐）。

---

### 25. `src/units/Unit.ts`（G-1，追加 `heal`）

**Analog:** 同文件 `takeDamage` 与 `checkLevelUp`

**现有 `takeDamage`（钳制 + 非正数守卫）**（`src/units/Unit.ts:181-195`）：

```ts
/**
 * 扣减生命值。策略：`amount` 非有限或非正时视为无效伤害并直接忽略（不改变状态、不引入
 * `NaN`/`Infinity`）；合法伤害将生命值钳制到 `[0, 生命上限]`，其中生命上限取经修正器调整后的
 * 值，以维持 `getAttribute(Health) <= getAttribute(MaxHealth)` 的公开不变量。
 */
takeDamage(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }
    const maxHealth = this.applyModifiers(
        AttributeKind.MaxHealth,
        this.maxHealth()
    );
    this.hp = Math.max(0, Math.min(this.hp - amount, maxHealth));
}
```

**升级回血（说明为什么不能复用它做按小时回血）**（`src/units/Unit.ts:292-315`）：

```ts
private checkLevelUp(): void {
    while (this.xp >= this.levelThreshold()) {
        this.xp -= this.levelThreshold();
        const previousMaxHealth = this.applyModifiers(
            AttributeKind.MaxHealth,
            this.maxHealth()
        );
        this.level += 1;
        const currentMaxHealth = this.applyModifiers(
            AttributeKind.MaxHealth,
            this.maxHealth()
        );
        this.hp = Math.min(
            this.hp + (currentMaxHealth - previousMaxHealth),
            currentMaxHealth
        );
        this.applyUnlocks();
    }
}
```

**追加实现（RESEARCH G-1，`04-RESEARCH.md:1245-1252`）：**

```ts
/** 单位：承载生成属性、区分职业、并实现经验累积与升级的状态机。 */
export class Unit implements IUnit, IHealableUnit {
    /**
     * 恢复生命值。策略：`amount` 非有限或非正时忽略；合法回血钳制到当前生命上限，
     * 维持 `Health <= MaxHealth` 的公开不变量（与 `takeDamage` 对称）。
     */
    heal(amount: number): void {
        if (!Number.isFinite(amount) || amount <= 0) {
            return;
        }
        const maxHealth = this.applyModifiers(
            AttributeKind.MaxHealth,
            this.maxHealth()
        );
        this.hp = Math.min(this.hp + amount, maxHealth);
    }
}
```

- 放在 `takeDamage` 附近，保持对称。
- `spawnUnit` 当前返回 `IUnit`（`src/units/spawn.ts:31`）。**不要为了回血改它的返回类型**，除非门禁明确批准。推荐：`spawnUnit` 仍返回 `IUnit`；World 在用 `spawnUnit` 生成后，按 `IHealableUnit` 存储：
  - 最干净：把 `spawnUnit` 的返回类型改为 `IHealableUnit`（结构上 `Unit` 已满足；只影响类型，不影响调用方），但这会改 Phase 1 的公开签名，需门禁批准。
  - 备选：`const unit = spawnUnit(...) as IHealableUnit;`（单点断言，因 `Unit` 结构性满足；不要在每个回血点重复断言）。
- 不要用负 `takeDamage`、升级回血或重建 `Unit` 来模拟回血（RESEARCH Pitfall 1）。

---

### 26. `src/physics/types.ts`（G-2，追加静态障碍接口）

**Analog:** 同文件 `IPhysicsWorld`（`src/physics/types.ts:190-212`）

**现有 `IPhysicsWorld` 的 8 个方法（逐字，不可改）**（`src/physics/types.ts:195-212`）：

```ts
export interface IPhysicsWorld {
    /** 注册一个单位：创建**一个**复合刚体（本体/武器/防具碰撞体，各自质量与固定局部偏移，D-03/D-05）并索引其全部碰撞体 handle。 */
    registerUnit(spec: IUnitPhysicsSpec): void;
    /** 移除单位：删除其刚体与全部碰撞体，并清除该单位在各 handle 映射中的所有条目（handle 复用风险）。 */
    removeUnit(unitId: number): void;
    /** 该单位是否已注册。 */
    hasUnit(unitId: number): boolean;
    /** 对本单位施加线力（操控系统的线性执行器，Phase 3）。 */
    applyForce(unitId: number, forceX: number, forceY: number): void;
    /** 对本单位施加力矩（操控系统的转动执行器）。 */
    applyTorque(unitId: number, torque: number): void;
    /** 读取本单位的运动学读数；未知 id 返回 `null`（缺失对象 → `null`）。 */
    getUnitState(unitId: number): IUnitState | null;
    /** 推进恰好一个固定步长并返回本步的类型化事件（D-10）。 */
    tick(): IPhysicsTickResult;
    /** 释放 Rapier world 与事件队列。 */
    dispose(): void;
}
```

**追加（RESEARCH Pattern 7，`04-RESEARCH.md:733-746`）：**

```ts
/** 静态障碍规格：轴对齐矩形（王国层 ITerrainRect 逐字段映射而来；有意重复以避免反向依赖）。 */
export interface IStaticObstacleSpec {
    /** 中心 x。 */
    readonly x: number;
    /** 中心 y。 */
    readonly y: number;
    /** 半宽。 */
    readonly halfWidth: number;
    /** 半高。 */
    readonly halfHeight: number;
}

/** 静态障碍世界：在同一 Rapier world 中创建固定 cuboid（G-2）。 */
export interface IStaticObstacleWorld {
    /** 在同一 Rapier world 中创建一个固定 cuboid；返回 obstacleId。 */
    addStaticObstacle(spec: IStaticObstacleSpec): number;
    /** 移除一个静态障碍；未知 id 为空操作。 */
    removeStaticObstacle(obstacleId: number): void;
}
```

- `IPhysicsWorld` 的 8 个方法逐字不变；`ControlSystem` 仍只依赖 `IPhysicsWorld`。
- `IStaticObstacleSpec` 与 `ITerrainRect` 形状相同是**有意重复**：依赖方向必须是 kingdom → physics，物理层不能 import 王国层。
- 门禁必须明确批准「`src/physics/types.ts` + `PhysicsWorld.ts` 的加性改动」；否则 D-27 只能降级（RESEARCH G-2）。

---

### 27. `src/physics/PhysicsWorld.ts`（G-2，追加静态障碍实现）

**Analog:** 同文件 `registerUnit` / `removeUnit` / `dispose`

**现有 Rapier 创建范式**（`src/physics/PhysicsWorld.ts:90-112`）：

```ts
registerUnit(spec: IUnitPhysicsSpec): void {
    if (this.bodies.has(spec.unitId)) {
        throw new Error(
            `PhysicsWorld.registerUnit: unit ${spec.unitId} is already registered`
        );
    }
    const geometry = this.config.geometry;
    const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(spec.x, spec.y)
    );
    const colliders: InstanceType<typeof RAPIER.Collider>[] = [];

    const bodyCollider = this.world.createCollider(
        RAPIER.ColliderDesc.ball(geometry.bodyRadius)
            .setMass(spec.mass)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
    );
    // ...
}
```

**Rapier world 是私有的**（`src/physics/PhysicsWorld.ts:42`）：

```ts
private readonly world: InstanceType<typeof RAPIER.World>;
```

**tick 对未知 handle 直接跳过**（`src/physics/PhysicsWorld.ts:229-241`）：

```ts
this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    if (!started) return;
    const tagA = this.index.get(handle1);
    const tagB = this.index.get(handle2);
    if (tagA === undefined || tagB === undefined) {
        return; // 地形 handle 不在 index → 无接触/无伤害
    }
    // ...
});
```

**每 tick 清空力/力矩**（`src/physics/PhysicsWorld.ts:431-434`）：

```ts
for (const body of this.bodies.values()) {
    body.resetForces(false);
    body.resetTorques(false);
}
```

**dispose 释放 world / eventQueue**（`src/physics/PhysicsWorld.ts:438-450`）：

```ts
dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
    this.eventQueue.free();
    this.bodies.clear();
    // ...
}
```

**追加（RESEARCH Pattern 7 / `04-RESEARCH.md:1579-1606`）：**

```ts
/** 物理世界：同时实现动态单位与静态障碍（G-2）。 */
export class PhysicsWorld implements IPhysicsWorld, IStaticObstacleWorld {
    /** obstacleId → 固定刚体与碰撞体（仅用于移除；绝不加入 index）。 */
    private obstacles = new Map<
        number,
        {
            body: InstanceType<typeof RAPIER.RigidBody>;
            collider: InstanceType<typeof RAPIER.Collider>;
        }
    >();
    /** 下一个静态障碍 id。 */
    private nextObstacleId = 1;

    addStaticObstacle(spec: IStaticObstacleSpec): number {
        const body = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y)
        );
        const collider = this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(spec.halfWidth, spec.halfHeight),
            body
        );
        // 不加入 this.index：地形 handle 在 tick() 的 index.get() 处自然被跳过。
        const id = this.nextObstacleId++;
        this.obstacles.set(id, { body, collider });
        return id;
    }

    removeStaticObstacle(obstacleId: number): void {
        const entry = this.obstacles.get(obstacleId);
        if (entry === undefined) return;
        this.world.removeRigidBody(entry.body);
        this.obstacles.delete(obstacleId);
    }
}
```

- `dispose()` 增加 `this.obstacles.clear()`（world.free 已释放所有 body）。
- 不要给地形 `setActiveEvents`；不要加入 `index`；否则会产生 `IContactEvent`/`IDamageEvent`（RESEARCH Pattern 7 / Pitfall 2）。
- 地图边界 4 面墙（A14）也通过 `addStaticObstacle` 创建，但不进入 `IScenario.terrain`（World 内部自动加）。
- 真实 Rapier 探针已验证：固定墙挡住动态球、`castRay(..., EXCLUDE_DYNAMIC)` 只命中地形（RESEARCH §Verified Contract Facts）。

---

### 28. `tests/units/heal.test.ts`（test，unit）

**Analog:** `tests/units/attributes.test.ts`

**伤害/死亡断言范式**（`tests/units/attributes.test.ts:64-77`）：

```ts
describe('Unit — damage and death', () => {
    it('reduces Health by the damage amount and reports death at zero', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.isAlive()).toBe(true);

        unit.takeDamage(30);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(170);
        expect(unit.isAlive()).toBe(true);

        unit.takeDamage(1000);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(0);
        expect(unit.isAlive()).toBe(false);
    });
});
```

**输入守卫范式**（`tests/units/attributes.test.ts:80-113`）：

```ts
it('ignores non-finite or non-positive damage without corrupting Health', () => {
    const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);
    for (const invalid of [NaN, Infinity, -Infinity, -100, 0]) {
        unit.takeDamage(invalid);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(200);
    }
});
```

**Phase 4 断言：**

- `heal(10)` → Health +10（未满时）。
- 超过上限 → 钳制到 `MaxHealth`。
- `NaN` / `Infinity` / `-Infinity` / 负数 / 0 → 忽略，Health 不变。
- 与 `takeDamage` 对称：先 `takeDamage` 再 `heal`，最终不超过上限。
- 使用 `SWORDSMAN_ROLL` 固定生成属性（`tests/units/attributes.test.ts:21-32`），不要依赖随机。

---

## Shared Patterns

### S-1. Interface-first + 每文件夹一个 `types.ts`

**Source:** `src/control/types.ts` + `src/physics/types.ts` + `src/units/types.ts`
**Apply to:** 所有 `src/kingdom/` 文件、G-1/G-2 扩展

- 每个类先有 `I<Name>`，再 `implements`。
- `src/kingdom/types.ts` 是唯一类型文件；不拆子目录。
- 类不能有接口外的公共成员；内部可变入口用 `IMutable*`（同文件末尾、标注非契约）。
- 类型文件只 `import type`，不 import 类/实现。

### S-2. 类骨架：`private readonly` 依赖 + `Map` 状态 + `disposed`

**Source:** `src/control/ControlSystem.ts:48-98`
**Apply to:** `TimeSystem`、`BattleSystem`、`DamageSink`、`Commander`、`KingdomWorld`

```ts
export class X implements IX {
    /** 依赖说明。 */
    private readonly dep: IDep;
    /** 状态说明。 */
    private items = new Map<number, T>();
    /** 是否已释放。 */
    private disposed = false;

    /**
     * 构造。
     * @param dep 依赖说明。
     */
    constructor(dep: IDep) { this.dep = dep; }
}
```

- 私有字段一律 `private`，禁止 `#`、禁止 `_` 前缀（AGENTS §10）。
- 私有方法/私有字段必须有 JSDoc（AGENTS §4）。

### S-3. 依赖注入 + 闭包打破循环

**Source:** `src/control/ControlSystem.ts:92-97`（`() => this.tickIndex`）
**Apply to:** `BattleSystem`（`() => time.getGameMinutes()`）、`KingdomWorld`（延迟绑定 `control`）

```ts
this.sensor = new Sensor(
    physics,
    this,
    sensingWorld,
    () => this.tickIndex
);
```

- 不要在构造时互相 `new` 形成环；用 `() => value` 或构造后赋值。
- 只在真正需要时注入；不要引入 DI 容器（anti-over-engineering）。

### S-4. 不可信输入隔离

**Source:** `src/control/ControlSystem.ts:199-223`, `469-474`, `532-536`
**Apply to:** 权重函数、入驻函数、指挥官、场景校验、训练/订单输入

```ts
let action: IUnitAction;
try {
    action = this.sanitizeAction(ai.decide(observation), unitId);
} catch {
    action = this.zeroAction();
}
```

```ts
private readMagnitude(value: unknown, cap: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return 0;
    }
    return Math.min(value, cap);
}
```

- 有限性/非负是默认守卫；非法值回退默认而不是抛错中断 tick。
- 场景构造是例外：校验失败直接抛错（不进入 tick）。
- `ControlSystem` 已隔离 sink/AI/感知异常；王国层只需隔离自己的注入函数。

### S-5. 顶层 `const` + JSDoc；数值集中

**Source:** `src/control/constants.ts:1-18`, `src/units/data.ts:47-57`
**Apply to:** `src/kingdom/constants.ts`、`src/kingdom/scenario.ts`

- 每个顶层 `const` 必须有 JSDoc（AGENTS §6）。
- 数值只在一个文件调参；不要在类里散落魔法数。
- `DT` 不重复声明；从 `@/physics/constants` 引用。

### S-6. 只读快照返回

**Source:** `src/control/ControlSystem.ts:317-319`（`[...this.units.keys()]`）、`src/units/Unit.ts:166-179`（数组副本）
**Apply to:** `Army.getUnitIds()`、`Faction.getArmyIds()`、`Battle.getMemberUnitIds()`、`drainEvents()`

```ts
listUnitIds(): readonly number[] {
    return [...this.units.keys()];
}
```

- 返回新数组；绝不返回内部 `Map`/`Set`/数组引用。
- `getCenter()`/`getPosition()` 返回新对象 `{ x, y }`。

### S-7. 缺失值约定

**Source:** `src/control/types.ts:234-241`、`src/physics/types.ts:206-207`
**Apply to:** 全部 `I*` 接口

- 缺失对象 → `null`（`getUnit`、`getUnitState`、`getOrder`、`getBattleForUnit`、`getFormationSlot`、`getBattleArea`）。
- 缺失字面量 → `undefined` 或可选字段（`getTeam`、`getFactionId`、`getCityId`、`getGarrisonArmyId`、`getEndedAtMinutes`）。
- 不要混用 `null` 与 `undefined`。

### S-8. 测试：真实 Rapier + 种子化 RNG + afterEach dispose

**Source:** `tests/control/loop.test.ts:251-267`, `tests/helpers/rng.ts:3-18`
**Apply to:** `tests/kingdom/harness.ts` 与所有集成测试

```ts
beforeAll(async () => { await RAPIER.init(); });
afterEach(() => { control?.dispose(); physics?.dispose(); });
```

- 不 mock Rapier；使用真实 WASM。
- 生产 RNG `MathRng`；测试 `mulberry32(seed)`。
- `toBeCloseTo` 处理 f32 往返。

### S-9. 数字枚举 + 保守 `default`

**Source:** `src/control/types.ts:22-27`, RESEARCH Pattern 3
**Apply to:** 所有 `switch (enum)`，尤其 `ModeAI.decide`

- 禁止字符串枚举。
- 运行时数字可能是任意值；`switch` 必须有 `default` 回退（`Idle` / 空动作），不抛错。
- 枚举成员值逐字钉版在 `tests/kingdom/types.test.ts`。

### S-10. 无 getter/setter、无 `#`、无 `_`

**Source:** AGENTS §4/§5/§10；`src/units/Unit.ts` 全文件
**Apply to:** 所有新类

- 读方法 `getX()`；写方法仅在 `IMutable*` 中。
- 私有字段 `private name: T`；私有方法 `private foo(): T`。
- 接口成员/方法 JSDoc；类实现可省略，但私有成员必须有。

---

## Conflicts / Gate Decisions（必须由 Round 1 门禁裁决）

| ID | Conflict | Existing Code / Decision | Recommended Resolution |
|----|----------|--------------------------|------------------------|
| C-1 | CONTEXT D-11 说「不改 `IPhysicsWorld`/`IUnit`/`src/control/types.ts`」；G-1/G-2 需要改 `src/units/types.ts` + `Unit.ts`、`src/physics/types.ts` + `PhysicsWorld.ts` | D-11 原文只点名 `IPhysicsWorld`/`IUnit`/control types；G-1/G-2 是**追加新接口**，既有接口逐字不变 | 门禁明确批准「加性扩展」：`IUnit`/`IPhysicsWorld` 不改，新增 `IHealableUnit`/`IStaticObstacleWorld`。若用户理解为「这两个文件零改动」，则 KING-03/05 与 D-27 必须显式降级 |
| C-2 | `spawnUnit` 返回 `IUnit`（`src/units/spawn.ts:31`）；World 需要 `heal` | G-1 推荐 `IHealableUnit`；未规定 `spawnUnit` 返回类型 | 门禁二选一：① `spawnUnit` 返回类型改为 `IHealableUnit`（只影响类型，推荐）；② 保持 `IUnit`，World 单点断言为 `IHealableUnit`（`Unit` 结构满足） |
| C-3 | `ITimeSystem` 暴露 `advance`/`setRate`（可变），与「只读视图」直觉冲突 | RESEARCH Open Question 10 建议暴露；`IWorld` 持有实例 | 保留在接口中（AGENTS §5：公共方法必须在 interface），并在 JSDoc 标注「仅 World 调用」。若要求严格只读，另加 `IMutableTimeSystem` 内部接口 |
| C-4 | `IVec2` 放 `src/kingdom/types.ts` vs AGENTS §9「通用可复用抽象放 `src/common/`」 | RESEARCH A13 建议留在 kingdom；Phase 5 会消费 | 若只有 kingdom/phase5 使用，留 kingdom；若决定通用化，移到 `src/common/types.ts` 并在门禁记录。**不要两处重复定义** |
| C-5 | RESEARCH 正文写 `BattleSystem.reconcile()`，契约写 `IBattleSystem.tick()` | 契约形状 `04-RESEARCH.md:1029-1043` 用 `tick()` | 以 `tick()` 为准；`reconcile` 只作为私有方法名或注释，不进入接口 |
| C-6 | `IWorld` 不暴露 `IControlSystem`/`IPhysicsWorld`（A18），但 Phase 5 需要单位位置/HP/阵营 | 组合根同时持有三者；`IWorld` 只给军队/城池/可见性 | 维持 A18；在 `KingdomWorld` 构造时由组合根同时拿到 `IWorld` + `IPhysicsWorld` + `IControlSystem`。若 Phase 5 要求单一入口，需扩 `IWorld`（会膨胀契约） |
| C-7 | `Army`/`City`/`Battle`/`Faction` 需要写方法，但 `IArmy`/`ICity`/`IBattle`/`IFaction` 只有读方法 | AGENTS §5：不允许接口外公共成员 | 在 `src/kingdom/types.ts` 末尾追加 `IMutableArmy`/`IMutableCity`/`IMutableBattle`/`IMutableFaction`，明确标注「内部类型，非门禁契约」；类 `implements` 两者 |
| C-8 | RESEARCH 推荐目录没有 `Faction.ts`，但 `IFaction` 需要实现 | `IFaction` 只有 `getId/getName/getArmyIds/getCityIds` | 二选一：① 新增 `src/kingdom/Faction.ts`（推荐，和 Army/City 对称）；② 在 `KingdomWorld` 内部用私有实现类。无论哪种，`IMutableFaction` 先加到 `types.ts` |
| C-9 | `IFaction.getArmyIds/getCityIds` 的「只读快照」实现方式未定 | `ControlSystem.listUnitIds()` 返回 `[...keys]`（`src/control/ControlSystem.ts:317-319`） | 照抄：返回新数组；城池/军队增删由 World 调 `IMutableFaction.setArmyIds` 等 |
| C-10 | 谁写 `UnitControlMode`：World 还是 BattleSystem | RESEARCH Pattern 3 说「模式属于 World/BattleSystem，ModeAI 只委托」 | **只有 World 写** `unitModes`；BattleSystem 只暴露 `getBattleForUnit`/`getExitedUnits` 事实。避免两处写导致每 tick 抖动（Pitfall 6/12） |
| C-11 | `IDamageEvent` 没有战斗字段；伤害过滤需要战斗成员 | Phase 2/3 冻结事件形状；Phase 3 D-10 说规则在 sink | 不改事件；`BattleDamageSink` 自己持有 `IBattleSystem` + `IPhysicsWorld` 做过滤（RESEARCH Pattern 2） |
| C-12 | `IBattleSystem` 构造需要读时间，直接依赖 `ITimeSystem` 会形成环 | `ControlSystem` 用闭包 `() => this.tickIndex` | 注入 `() => time.getGameMinutes()`，不注入 `ITimeSystem` 实例；同理 World 用延迟闭包绑定 control |
| C-13 | `ArmyState.InBattle` 与 `UnitControlMode.Battle` 语义重叠 | 两个枚举分别描述宏观军队与单位模式 | 明确映射：`ArmyState.InBattle` 时中心冻结；单位模式仍按「是否在区内」独立判定（区外增援保持 March，Pitfall 12） |
| C-14 | 城池战败方重组目标未定（多个己方城池） | D-21 只说「向己方城池/随机方向」 | 按 RESEARCH Open Question 5：最近己方城池（平方距离）；无则 `IRng` 随机方向。占位指挥官不重要 |
| C-15 | 训练产出绕过 `ControlSystem` 的风险 | Phase 3 注册是唯一入口（`ControlSystem.registerUnit`） | 固定流程：`spawnUnit` → 分配 `unitId` → `control.registerUnit({ teamId: factionId, x, y })` → 加入名册；注册失败回滚，不加入名册（Pitfall 14） |
| C-16 | 地形与城池混淆 | D-26 城池不是物理/射线实体；D-27 地形是独立矩形 | 城池不建 collider、不进 terrain；地形是场景表里的 `ITerrainRect`，映射为 `IStaticObstacleSpec`（G-2） |
| C-17 | `ITimeSystem.getTickIndex()` 没有对应的递增方法（契约只有 `advance`/`setRate`） | RESEARCH 的 `ITimeSystem.advance` 只推进分钟；`getTickIndex` 的 JSDoc 说「外层 tick 序号」 | 门禁三选一：① 增加 `advanceTick(): void`（推荐）；② 把 `getTickIndex` 定义为子步计数并在 `advance` 内递增；③ 删除 `getTickIndex`，由 World 持有外层计数。不要保留一个永远为 0 的 getter |
| C-18 | `IControlSystem.updateTeam` 是城池易手预留入口，但 D-21 只说「接管城池」 | RESEARCH A17：城池易手**不转移单位阵营**；单位保留原 `armyId` | Phase 4 **不调用** `updateTeam`；城池归属变化只改 `ICity.factionId`。若未来要俘获/倒戈，再单独加规则 |
| C-19 | `IWorld` 不暴露 `IControlSystem`/`IPhysicsWorld`（A18），但 World 内部又需要创建/持有它们 | AGENTS §5：类不能有接口外公共成员 | 用组合根/工厂返回 `{ world, control, physics }`（或让构造函数接收已创建的依赖）；**不要**给 `KingdomWorld` 加 `getControl()`/`getPhysics()` 公共方法。Phase 5 从工厂拿到三者 |

---

## No Analog Found

| File / Type | Role | Data Flow | Reason | Planner Guidance |
|-------------|------|-----------|--------|------------------|
| `src/kingdom/Commander.ts`（`ICommander` / `PlaceholderCommander`） | service / strategy | request-response | 仓库没有指挥官/战略层先例；Phase 3 只有单位 AI | 用 `DefaultUnitAI.decide` 的形状（输入快照 → 输出决策）和 `nearestEnemy` 的确定性选择；接口来自 RESEARCH §Contract Shape |
| `src/kingdom/DamageSink.ts`（生产 sink） | service | event-driven | 只有 `tests/control/damage-sink.ts` 的测试胶合实现，没有生产 sink | 以测试 sink 为逐字模板，追加 `IBattleSystem` 成员/在区过滤；保留同队/存活/经验顺序 |
| `IMutableArmy` / `IMutableCity` / `IMutableBattle` / `IMutableFaction` | internal contract | state mutation | 仓库没有「内部可变视图」先例；AGENTS §5 要求公共方法在 interface 中 | 追加到 `src/kingdom/types.ts` 末尾，标注「内部类型，非门禁契约」；类 `implements` 读接口 + 可变接口 |
| `src/kingdom/KingdomWorld.ts`（完整编排器） | orchestrator | batch tick | 最接近的 `ControlSystem` 只编排单系统；没有多系统组合先例 | 按 RESEARCH Pattern 1 的构造顺序与 `stepSubstep` 顺序；复用 `ControlSystem` 的私有字段/守卫/dispose 风格 |
| `src/kingdom/Faction.ts`（若拆分） | model | state + read view | RESEARCH 推荐目录未列；无先例 | 按 `Army.ts`/`City.ts` 同一模式；`IMutableFaction` 先入 types.ts |

---

## Metadata

**Analog search scope:** `src/control/`, `src/physics/`, `src/units/`, `src/common/`, `tests/control/`, `tests/units/`, `tests/helpers/`
**Files scanned:** 20 source/test files（全部通过 `git ls-files -- <path>` 验证为 tracked source，未使用任何 gitignored mirror / `.gsd/` 镜像路径）
**Pattern extraction date:** 2026-10-20
**Round 1 gate artifact:** `src/kingdom/types.ts` + `tests/kingdom/types.test.ts`；G-1/G-2 需在同一门禁中明确批准或显式降级
**Verification baseline:** `pnpm typecheck` 通过；`pnpm test` 20 文件 / 186 测试全绿（RESEARCH §Verified Contract Facts）
