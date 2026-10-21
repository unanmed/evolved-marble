# Phase 5: 渲染系统 - Pattern Map

**Mapped:** 2026-10-21
**Files analyzed:** 31 (2 Round-1 files + 11 render files + 6 demo/entry files + 6 test files + config)
**Analogs found:** 25 / 31 (6 files have no in-repo analog: browser entry/DOM/runner timer)

> **Analog provenance:** every analog path below was verified with `git ls-files -- <path>` and prints as tracked source. No `.gsd/capabilities/**` mirror paths are used anywhere in this document.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/render/types.ts` | types/contract | declaration-only | `src/physics/types.ts` | exact |
| `tests/render/types.test.ts` | test | compile-time contract | `tests/kingdom/types.test.ts` | exact |
| `src/render/constants.ts` | config | static data | `src/physics/constants.ts` | exact |
| `src/render/calendar.ts` | utility | transform (minutes → string) | `src/physics/damage.ts` | role-match |
| `src/render/cameraMath.ts` | utility | transform (points → transform) | `src/physics/damage.ts` | role-match |
| `src/render/hudModel.ts` | utility | transform (state → HUD flags) | `src/physics/damage.ts` | role-match |
| `src/render/frameModel.ts` | utility | transform (state → view/cull) | `src/physics/damage.ts` | role-match |
| `src/render/DamageTap.ts` | service/middleware | event-driven | `src/kingdom/DamageSink.ts` | role-match |
| `src/render/UnitViewFactory.ts` | provider/factory | object lifecycle | `src/kingdom/strategies.ts` | partial |
| `src/render/GeometryUnitView.ts` | component | render | `src/kingdom/IdleAI.ts` | partial |
| `src/render/Camera.ts` | service/state machine | transform | `src/kingdom/TimeSystem.ts` | role-match |
| `src/render/Hud.ts` | component/renderer | render (pooled) | `src/control/ControlSystem.ts` | partial |
| `src/render/Renderer.ts` | controller/orchestrator | request-response (per frame) | `src/control/ControlSystem.ts` | partial |
| `src/demo/types.ts` | types/contract | declaration-only | `src/physics/types.ts` | role-match |
| `src/demo/composition.ts` | composition root | lifecycle/CRUD | `tests/kingdom/harness.ts` | exact |
| `src/demo/scenario.ts` | config/data | static data | `src/kingdom/scenario.ts` | exact |
| `src/demo/runner.ts` | controller | event-driven (timer loop) | — | none |
| `src/demo/panel.ts` | view (DOM) | event-driven | — | none |
| `src/main.ts` | entry point | bootstrap | — | none |
| `index.html` | entry point | bootstrap | — | none |
| `src/style.css` | config/styles | — | — | none |
| `package.json` (modify) | config | — | `package.json` itself | exact |
| `tests/render/calendar.test.ts` | test | unit | `tests/physics/damage.test.ts` | exact |
| `tests/render/camera-math.test.ts` | test | unit | `tests/physics/damage.test.ts` | exact |
| `tests/render/hud-model.test.ts` | test | unit | `tests/physics/damage.test.ts` | exact |
| `tests/render/frame-model.test.ts` | test | unit | `tests/physics/damage.test.ts` | exact |
| `tests/render/damage-tap.test.ts` | test | unit (fake sink/physics) | `tests/control/damage-sink.ts` + `tests/control/loop.test.ts` | role-match |
| `tests/render/visual-spec.test.ts` | test | data validation | `tests/units/data-weapons-armors.test.ts` | exact |
| `tests/render/fakes.ts` | test helper | fake | `tests/control/arena.ts` | role-match |
| `tests/demo/runner.test.ts` | test | timer | — | none |
| `tests/demo/composition.test.ts` | test | integration | `tests/kingdom/battle.test.ts` | role-match |

> **Placement note (from RESEARCH):** `IRenderServices` / `RenderServicesProvider` live in `src/render/types.ts` because `IRenderer` (the gate contract) references them. `src/demo/types.ts` only holds demo-only shapes (`IDemoSetup`, `IManualRunner`, `IOperatorPanel`, panel callbacks). Do not duplicate `IRenderServices` in both files.

---

## Pattern Assignments

### `src/render/types.ts` (types/contract, declaration-only)

**Analog:** `src/physics/types.ts` (also `src/control/types.ts`, `src/kingdom/types.ts`)

**File header pattern** (`src/physics/types.ts:1-13`) — state it is declaration-only, then import upstream types with `import type`:

```typescript
/**
 * 物理模拟系统的全部类型声明：数字枚举 + `I*` 接口。
 * 本文件只含声明（枚举与接口），不含任何算法、数据表或运行时逻辑——
 * 无 Rapier 调用、无伤害运算、无类、无顶层 `const`。
 * 装备数值复用 Phase 1 已冻结的 `IWeaponDef`/`IArmorDef`（仅类型引用，不引用 `Unit` 类，D-07）。
 */

import type {
    ArmorKind,
    IArmorDef,
    IWeaponDef,
    WeaponKind
} from '@/units/types';
```

For `src/render/types.ts` the same rule applies, with exactly one allowed external import:

```typescript
/** 渲染层门禁契约：只含枚举/接口/类型别名；唯一外部引用是 Pixi 的 type-only Container。 */
import type { Container } from 'pixi.js';
import type { IUnitCatalog, IDamageContext, IDamageSink } from '@/control/types';
import type { IPhysicsWorld, IUnitState, ColliderPart } from '@/physics/types';
import type { IBattle, IMapBounds, IWorld, IVec2 } from '@/kingdom/types';
import type { ArmorKind, ClassKind, WeaponKind } from '@/units/types';
```

**Numeric enum pattern** (`src/physics/types.ts:15-28`) — JSDoc on the enum and on every member:

```typescript
/**
 * 复合刚体中的部位标识：本体 / 武器 / 防具各为一个独立碰撞体（D-03）。
 * ...
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

Apply the same shape to `CameraMode { Strategic = 0, BattleFocus = 1 }`. Do **not** redeclare `WeaponKind`/`ArmorKind`/`ClassKind`/`AttributeKind`/`ColliderPart`; import them.

**Read-only data interface pattern** (`src/physics/types.ts:74-90`) — every member `readonly` + JSDoc:

```typescript
/**
 * 单位在物理世界中的运动学读数：供操控（Phase 3）与渲染（Phase 5）消费的纯数值。
 */
export interface IUnitState {
    /** 位置的 x 坐标（米）。 */
    readonly x: number;
    /** 位置的 y 坐标（米）。 */
    readonly y: number;
    /** 朝向角（弧度）。 */
    readonly angle: number;
    ...
}
```

**Missing-value convention** (`src/control/types.ts:230-241`) — object → `null`, literal → `undefined`:

```typescript
export interface IUnitCatalog {
    /** 按 id 读取单位；不存在时返回 `null`（缺失对象 → `null`）。 */
    getUnit(unitId: number): IUnit | null;
    /** 按 id 读取阵营；不存在时返回 `undefined`（缺失字面量 → `undefined`）。 */
    getTeam(unitId: number): number | undefined;
    /** 列出当前全部已注册单位 id。 */
    listUnitIds(): readonly number[];
}
```

Apply it to the render contract: `ICamera.getBattleTarget(): number | null`, `IUnitViewSpec.weapon: WeaponKind | undefined`, `IRenderDamageEvent.armorKind: ArmorKind | undefined`.

**Upstream contracts to re-export/reference (do not restate):**

- `IWorld` full read surface: `src/kingdom/types.ts:375-406`
- `IBattle` members/center: `src/kingdom/types.ts:254-273`
- `IArmy` (center/heading/state/unit ids/engaged battle): `src/kingdom/types.ts:181-203`
- `ICity` (position/kind/faction/garrison cap): `src/kingdom/types.ts:210-227`
- `IVec2`: `src/kingdom/types.ts:93-98`; `IMapBounds`: `:101-106`; `ITerrainRect`: `:113-122`
- `IUnitState`: `src/physics/types.ts:77-90`; `IPhysicsWorld`: `:195-212`
- `IUnit` / `AttributeKind` / `WeaponKind` / `ArmorKind` / `IEquipment`: `src/units/types.ts:13-40, 61-82, 129-136, 224-247`

**Gate constraints to encode in the file:** no classes/functions/top-level `const`; no runtime Pixi import; no getters/setters; no inline object parameter types (use `ICameraUpdateInput`, `IHudFrame`, `IUnitViewSpec`, `IUnitViewState`, `IRenderServices`, `IRenderDamageEvent`, `IHudUnitState`); all members JSDoc'd.

---

### `tests/render/types.test.ts` (test, compile-time contract)

**Analog:** `tests/kingdom/types.test.ts`

**Imports + alias proof** (`tests/kingdom/types.test.ts:1-38`):

```typescript
import { describe, expect, expectTypeOf, it } from 'vitest';

// 从 `@/kingdom/types` 导入枚举值：该导入本身就是别名解析的证明，
// 并会传递性解析 `@/control/types` 与 `@/units/types`。
import {
    ArmyOrderKind,
    ArmyState,
    ...
} from '@/kingdom/types';
import type {
    IArmy,
    IArmyOrder,
    IBattle,
    ...
} from '@/kingdom/types';
```

**Numeric enum pin pattern** (`tests/kingdom/types.test.ts:91-114`):

```typescript
describe('kingdom types — numeric ArmyState enum', () => {
    it('pins all five macro states', () => {
        expect(ArmyState.Marching).toBe(0);
        expect(ArmyState.Garrisoned).toBe(1);
        expect(ArmyState.InBattle).toBe(2);
        expect(ArmyState.Reorganizing).toBe(3);
        expect(ArmyState.Engaging).toBe(4);
    });

    it('all members are integers and distinct', () => {
        const members: readonly number[] = [
            ArmyState.Marching,
            ArmyState.Garrisoned,
            ArmyState.InBattle,
            ArmyState.Reorganizing,
            ArmyState.Engaging
        ];
        expect(members).toHaveLength(5);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(5);
    });
});
```

For `tests/render/types.test.ts` mirror this exactly for `CameraMode.Strategic === 0` / `CameraMode.BattleFocus === 1` (2 members, integer + distinct).

**`expectTypeOf` method-signature pattern** (`tests/kingdom/types.test.ts:343-368`):

```typescript
describe('kingdom types — numeric time contract (no rate enum)', () => {
    it('pins per-tick minutes as plain numbers', () => {
        expectTypeOf<
            ITimeSystem['getMinutesPerTick']
        >().returns.toEqualTypeOf<number>();
        expectTypeOf<ITimeSystem['setMinutesPerTick']>()
            .parameter(0)
            .toEqualTypeOf<number>();
        expectTypeOf<
            ITimeSystem['setMinutesPerTick']
        >().returns.toEqualTypeOf<void>();
        ...
    });
});
```

**Optional-literal pattern** (`tests/kingdom/types.test.ts:421-442`):

```typescript
expectTypeOf<ICity['getFactionId']>().returns.toEqualTypeOf<
    number | undefined
>();
```

Apply to:

```typescript
expectTypeOf<IRenderer['renderFrame']>().returns.toEqualTypeOf<void>();
expectTypeOf<IRenderer['getCanvas']>().returns.toEqualTypeOf<HTMLCanvasElement>();
expectTypeOf<IRenderer['getCamera']>().returns.toEqualTypeOf<ICamera>();
expectTypeOf<ICamera['setBattleTarget']>().parameter(0).toEqualTypeOf<number | null>();
expectTypeOf<ICamera['update']>().parameter(0).toEqualTypeOf<ICameraUpdateInput>();
expectTypeOf<IUnitView['getRoot']>().returns.toEqualTypeOf<Container>();
expectTypeOf<IDamageFeed['drain']>().returns.toEqualTypeOf<readonly IRenderDamageEvent[]>();
expectTypeOf<IRenderDamageEvent['weaponKind']>().toEqualTypeOf<WeaponKind | undefined>();
expectTypeOf<IRenderConfig['factionColors']>().toEqualTypeOf<Readonly<Record<number, number>>>();
```

`tsconfig.json` includes `tests` and has `strict: true` (`tsconfig.json:19-27`), so all `expectTypeOf` assertions are checked by `pnpm typecheck`, not only by Vitest.

---

### `src/render/constants.ts` (config, static data)

**Analog:** `src/physics/constants.ts` (primary), `src/kingdom/constants.ts`

**Single tuning entry / top-level const + JSDoc** (`src/physics/constants.ts:1-42`):

```typescript
/**
 * 物理模拟系统的数值常量：固定步长与可校准几何尺寸（D-06/D-10）。
 * 本文件是物理数值的唯一调参入口——改动一行即改动一个尺寸；
 * 全部为类型化顶层 `const` + JSDoc（AGENTS §6），不使用 JSON 数据文件，不使用工厂函数。
 */

import type { IPhysicsGeometry } from '@/physics/types';

/**
 * 固定仿真步长（秒），值为 `1 / 60`（D-10）...
 */
export const DT = 1 / 60;

export const DEFAULT_GEOMETRY: IPhysicsGeometry = {
    /** 本体圆半径（米）：单位自身的圆形碰撞体。 */
    bodyRadius: 0.5,
    /** 武器 capsule 半长（米）：细长武器主体长度之半（主轴为局部 y）。 */
    weaponHalfLength: 0.4,
    ...
};
```

For `src/render/constants.ts`, export `DEFAULT_RENDER_CONFIG: IRenderConfig`, `FALLBACK_FACTION_COLORS`, and `validateRenderConfig(config): void`. Give **every** top-level `const` and every nested field a JSDoc comment. Weapon/armor geometry must reuse the same numeric basis as `src/physics/constants.ts:31-42` (`bodyRadius 0.5`, `weaponOffsetX 0.7`, `weaponHalfLength 0.4`, `armorRadius 0.55`) so the visual footprint matches the Rapier capsule.

---

### Pure modules: `calendar.ts`, `cameraMath.ts`, `hudModel.ts`, `frameModel.ts` (utility, transform)

**Analog:** `src/physics/damage.ts`

**Pure-module header + style** (`src/physics/damage.ts:1-19`):

```typescript
/**
 * 物理系统的纯伤害与减伤数学：无 Rapier 依赖、无类、无状态，便于单元测试。
 * 公式逐字转写自 `.planning/reference/ai-marble-kingdom.md`（伤害计算）：
 * ...
 */

import { sampleNormal } from '@/common/rng';
import type { IRng } from '@/common/types';

/**
 * 伤害抖动的标准差除数：规格规定伤害服从正态分布 ...
 * 故标准差 σ = 均值 / 本除数。这是抖动幅度的唯一调参入口。
 */
export const DAMAGE_JITTER_SIGMA_DIVISOR = 20;
```

**Guard-then-return pure function** (`src/physics/damage.ts:31-45`):

```typescript
export function computeDamageMean(
    attack: number,
    weaponRatio: number,
    weaponAttackRatio: number,
    deltaV: number
): number {
    const clampedDeltaV = Number.isFinite(deltaV) && deltaV > 0 ? deltaV : 0;
    return Math.max(
        attack * weaponRatio * weaponAttackRatio * (Math.sqrt(clampedDeltaV) - 1),
        0
    );
}
```

Apply this shape to every render math export:

- `calendar.ts` — `formatCalendar`, `formatSpeed`, `formatGameTime` + `MINUTES_PER_DAY`, `DAYS_PER_MONTH`, `MONTHS_PER_YEAR`, `DAYS_PER_YEAR` (each JSDoc'd).
- `cameraMath.ts` — `fitBox`, `fitTransform`, `smoothstep`/`lerp`, `strategicTransform`, `worldToScreen`, `screenToWorld`; never import Pixi.
- `hudModel.ts` — `healthRatio`, `registerDamage`, `isHealthVisible`, `computeHudScale`; operate on `IHudTimers`.
- `frameModel.ts` — `resolveUnitViewSpec` (from `IUnit` → `IUnitViewSpec`), `isUnitVisible` (viewport cull), `resolveTargetPoints` (battle members → `IVec2[]`).

**Hard rule:** these four files must not import `pixi.js` or Rapier; Vitest is `environment: 'node'` (`vitest.config.ts:5-13`).

---

### `src/render/DamageTap.ts` (service/middleware, event-driven)

**Analog:** `src/kingdom/DamageSink.ts` (production sink), `tests/control/damage-sink.ts` (fake sink)

**Class implements-interface + private dependency fields** (`src/kingdom/DamageSink.ts:28-58`):

```typescript
/**
 * 战斗伤害接收方：同场 + 双方在区 + 异队才结算。
 */
export class BattleDamageSink implements IDamageSink {
    /** 物理世界：读取双方实时位置以校验战斗区。 */
    private readonly physics: IPhysicsWorld;
    /** 晚绑定的战斗系统访问器（组合根先建 sink、后建 World，故不能直接注入实例）。 */
    private readonly battlesOf: () => IBattleSystem | null;

    /**
     * 构造战斗伤害接收方。
     * @param physics 物理世界。
     * @param battlesOf 返回当前战斗系统的闭包；世界尚未装配时返回 `null`（丢弃伤害）。
     */
    constructor(physics: IPhysicsWorld, battlesOf: () => IBattleSystem | null) {
        this.physics = physics;
        this.battlesOf = battlesOf;
    }

    applyDamage(context: IDamageContext): void {
        if (context.attackerTeamId === context.defenderTeamId) {
            return;
        }
        ...
```

**“Only record what the sink actually applied” + alive transition** (`src/kingdom/DamageSink.ts:84-100`):

```typescript
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
```

**Critical timing to copy** (`src/control/ControlSystem.ts:289-302`): damage is routed **before** dead units are unregistered, so a tap can read the defender's last physics state:

```typescript
const result = this.physics.tick();
for (const damage of result.damages) {
    this.routeDamage(damage);
}

const deadUnitIds: number[] = [];
for (const [unitId, unit] of this.units) {
    if (!unit.isAlive()) {
        deadUnitIds.push(unitId);
    }
}
for (const unitId of deadUnitIds) {
    this.removeRegisteredUnit(unitId);
}
```

`RenderDamageTap` must therefore do `wasAlive`/`healthBefore` → `inner.applyDamage(context)` → `healthAfter` → `killed = wasAlive && !isAlive()` → `getUnitState(defenderId)` **immediately**, and skip when `appliedDamage <= 0 && !killed` (RESEARCH §Pattern 2). It `implements IDamageSink, IDamageFeed`; no other public members.

---

### `src/render/Camera.ts` (service/state machine, transform)

**Analog:** `src/kingdom/TimeSystem.ts`

**Small stateful class, private fields with JSDoc, read methods instead of getters** (`src/kingdom/TimeSystem.ts:14-39`):

```typescript
/**
 * 时间系统：累计游戏分钟、外层 tick 序号与每个 tick 的分钟数/子步数。
 */
export class TimeSystem implements ITimeSystem {
    /** 自开局累计的游戏分钟；只经 `advance` 增长。 */
    private gameMinutes = 0;
    /** 外层 tick 序号；只经 `advanceTick` 递增（C-17）。 */
    private tickIndex = 0;
    /** 当前每个外层 tick 覆盖的游戏分钟数（1 = 战斗，24 = 和平）。 */
    private minutesPerTick = PEACE_TICK_MINUTES;

    /**
     * 自开局累计的游戏分钟。
     * @returns 游戏分钟数。
     */
    getGameMinutes(): number {
        return this.gameMinutes;
    }
```

**Input guard pattern** (`src/kingdom/TimeSystem.ts:59-88`) — reject non-finite/illegal values without throwing:

```typescript
advance(gameMinutes: number): void {
    if (!Number.isFinite(gameMinutes) || gameMinutes <= 0) {
        return;
    }
    this.gameMinutes += gameMinutes;
}

setMinutesPerTick(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) {
        return;
    }
    this.minutesPerTick = minutes;
}
```

`Camera` keeps private state: target id, mode, current transform, transition start/remaining, shake amplitude. All math delegates to `cameraMath.ts`. `reset(bounds, viewport)` is the only allowed instant jump (initialization), per RESEARCH §Camera Algorithms §4.

---

### `src/render/Renderer.ts` (controller/orchestrator, per-frame request-response)

**Analog:** `src/control/ControlSystem.ts` (orchestrator shape), `src/physics/PhysicsWorld.ts` (idempotent dispose)

**Private maps + constructor injection + JSDoc** (`src/control/ControlSystem.ts:48-104`):

```typescript
/**
 * 操控系统：注册/移除单位、驱动决策并执行动作、路由伤害、清理死亡单位。
 */
export class ControlSystem implements IControlSystem {
    /** 物理世界：力/力矩的唯一执行器与运动读数来源。 */
    private readonly physics: IPhysicsWorld;
    /** 唯一的 AI 构造接缝（D-11）。 */
    private readonly provider: IUnitAIProvider;
    /** 注入的战斗规则边界（D-10）。 */
    private readonly damageSink: IDamageSink;
    /** 感知器：每次决策拼装纯数据快照。 */
    private readonly sensor: ISensor;

    /** unitId → 单位实例。 */
    private units = new Map<number, IUnit>();
    ...
    constructor(
        physics: IPhysicsWorld,
        sensingWorld: ISensingWorld,
        provider: IUnitAIProvider,
        damageSink: IDamageSink
    ) {
        this.physics = physics;
        ...
    }
```

**Idempotent dispose pattern** (`src/physics/PhysicsWorld.ts:506-519`):

```typescript
dispose(): void {
    if (this.disposed) {
        return;
    }
    this.disposed = true;
    this.world.free();
    this.eventQueue.free();
    this.bodies.clear();
    this.specs.clear();
    this.colliders.clear();
    this.index.clear();
    this.preVelocities.clear();
    this.obstacles.clear();
}
```

`Renderer` follows the same shape: `private readonly services: RenderServicesProvider`, `private viewpoint`, `private frameIndex`, `private readonly unitViews = new Map<number, IUnitView>()`, plus `app`, layers, `hud`, `camera`, `factory`, `disposed`. `renderFrame()` is the only public per-frame entry; module-level `createRenderer(provider, config): Promise<IRenderer>` performs `new Application()` + `await app.init({ autoStart: false, ... })` (AGENTS §5 forbids adding a public static factory).

**Per-frame order to copy from RESEARCH §Pattern 1:** `services = provider()` → `camera.update(...)` → write `worldLayer` transform → `damageFeed.drain()` → chose `unitLayer` vs `strategicLayer` → sync/update views → `hud.update(...)` → `app.render()`.

---

### `src/render/UnitViewFactory.ts` / `GeometryUnitView.ts` (provider + component, render)

**Analog:** `src/kingdom/strategies.ts` (factory/default-object composition), `src/kingdom/IdleAI.ts` (minimal class implements)

**Small class implements interface** (`src/kingdom/IdleAI.ts:10-22`):

```typescript
/**
 * 待命 AI：不做任何决策，只输出零动作。
 */
export class IdleAI implements IUnitAI {
    /**
     * 恒返回全零动作，不读取快照中的任何量。
     * @param _observation 纯数据快照（未使用）。
     * @returns 全零动作。
     */
    decide(_observation: IUnitObservation): IUnitAction {
        return ZERO_ACTION;
    }
}
```

**Default object + factory function** (`src/kingdom/strategies.ts:77-91`):

```typescript
/**
 * 生产 `IKingdomConfig`：等级权重、25% 入驻（至少 1、受城池上限约束）与占位指挥官。
 * ...
 */
export function createDefaultKingdomConfig(
    commanderFactory: (factionId: number) => ICommander = factionId =>
        new PlaceholderCommander(factionId)
): IKingdomConfig {
    return {
        unitWeight: defaultUnitWeight,
        garrisonSelector: defaultGarrisonSelector,
        commanderFactory
    };
}
```

`UnitViewFactory` creates the nine shared `GraphicsContext`s once and returns `IUnitView` instances. `GeometryUnitView` must follow the v8 rules verified in RESEARCH: root is a `Container`, body rotation is on a child `Container`, body is white + `tint = factionColor`, and `destroy()` never passes `{ context: true }`. Weapon outlines are drawn on the physical capsule footprint at local `x ≈ 0.7` along local **y** (`src/physics/constants.ts:31-42`; `src/physics/PhysicsWorld.ts:130-147`).

---

### `src/render/Hud.ts` (component/renderer, pooled)

**Analog:** `src/control/ControlSystem.ts` (private pools/maps + dispose), `src/kingdom/TimeSystem.ts` (per-frame counters)

Use the same private-map + JSDoc + idempotent-clear discipline:

```typescript
/** unitId → 血条可见到的输出帧（不含）。 */
private visibleUntil = new Map<number, number>();
/** 伤害数字池：存活条目 + 空闲条目，同屏上限由 config 限制。 */
private damageNumbers: Text[] = [];
```

All show/hide/scale decisions come from `hudModel.ts`; `Hud` only writes Pixi properties. Text is assigned only on change (grade/level/damage value), never per frame. Blood-bar fill uses `scale.x = healthRatio` (no mask/filter).

---

### `src/demo/types.ts` (types/contract, declaration-only)

**Analog:** `src/physics/types.ts`

Same declaration-only header and `import type` discipline as `src/render/types.ts`. Declare only `IDemoSetup`, `IManualRunner`, `IOperatorPanel`, `IOperatorPanelOptions`/callbacks. `IRenderServices` stays in `src/render/types.ts`.

---

### `src/demo/composition.ts` (composition root, lifecycle)

**Analog:** `tests/kingdom/harness.ts` — copy the order exactly

**Mandatory wiring order** (`tests/kingdom/harness.ts:140-193`):

```typescript
export function createKingdom(
    options: IKingdomHarnessOptions = {}
): IKingdomFixture {
    const seed = options.seed ?? 7;
    const scenario = options.scenario ?? DEFAULT_SCENARIO;

    const physics = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        mulberry32(seed)
    );
    const sensing = new KingdomSensingWorld(
        scenario.width,
        scenario.height,
        scenario.terrain
    );

    let worldRef: KingdomWorld | null = null;
    const sink = new BattleDamageSink(
        physics,
        () => worldRef?.getBattleSystem() ?? null
    );

    const provider: IUnitAIProvider = {
        create(_unitId: number, _unit: IUnit): IUnitAI {
            return new IdleAI();
        },
        destroy(_unitId: number): void {
            // 无状态。
        }
    };

    const control = new ControlSystem(physics, sensing, provider, sink);
    const rng = mulberry32(seed + 1);
    const world = new KingdomWorld(
        physics,
        control,
        rng,
        scenario,
        options.config ?? defaultKingdomConfig(options.commanderFactory)
    );
    worldRef = world;

    return { world, control, physics, sensing, rng };
}
```

**RAPIER init + idempotent setup** (`tests/kingdom/harness.ts:49-55`):

```typescript
export function initRapier(): Promise<void> {
    return RAPIER.init();
}
```

`src/demo/composition.ts` inserts exactly one layer: `const tap = new RenderDamageTap(sink, unitId => physics.getUnitState(unitId));` and passes `tap` (not `sink`) to `ControlSystem`. The late-bound `worldRef` closure stays. Use `MathRng` from `src/common/rng.ts` (production), not `mulberry32` from `tests/helpers/rng.ts`. `await RAPIER.init()` must run before constructing `PhysicsWorld`.

---

### `src/demo/scenario.ts` (config/data, static)

**Analog:** `src/kingdom/scenario.ts`

Copy the data-table style (`src/kingdom/scenario.ts:272-330`) and the derived-scenario style of `SCENARIO_MINIMAL` (`:359-390`). The `?classes=all` variant should be built by spreading/filtering `DEFAULT_SCENARIO` (add one `Hammer` + one `Knight` to each army) and must **not** modify Phase 4's `DEFAULT_SCENARIO`. Every top-level exported `const` needs JSDoc.

---

### `src/demo/runner.ts` (controller, timer-driven) — **no repo analog**

No `setTimeout` / fake-timer code exists in the repo (grep for `setTimeout`/`useFakeTimers` in `tests/**` returns nothing). Planner must use RESEARCH §Code Examples 6 + §Pattern 5:

- `private running = false`, `private timer: ReturnType<typeof setTimeout> | null = null`;
- `start()` / `pause()` / `stepOnce()` / `setFrameDelay(ms)` clamp `0..1000` and reject non-finite;
- one frame = `services.world.tick()` **exactly once** then `renderer.renderFrame()` then `schedule()`;
- catch errors → `pause()` + `onError`; never call `control.tick()` separately.

Still follow the class conventions from `src/kingdom/TimeSystem.ts` (`implements IManualRunner`, private fields + JSDoc, methods not getters).

---

### `src/main.ts`, `index.html`, `src/style.css` (entry/bootstrap) — **no repo analog**

Repo currently has no `index.html`, `src/main.ts`, `src/style.css`, and `package.json` has no `dev` script (`package.json:10-14`). Use RESEARCH §Code Examples 1 and 8 exactly:

- `async function main(): Promise<void> { ... }` + `main().catch(error => console.error(error));` — no top-level await (RESEARCH Pitfall 23).
- `await RAPIER.init()` before `createDemoSetup()`.
- `await createRenderer(() => setup.services, DEFAULT_RENDER_CONFIG)` then `document.getElementById('stage-host')!.appendChild(renderer.getCanvas())`.
- CSS: fixed 1920×1080 backing store, `aspect-ratio: 16/9`, `max-width/max-height` scaling; panel is a **sibling** of the canvas.
- `index.html` script: `<script type="module" src="/src/main.ts"></script>`.

Add to `package.json` (`package.json:10-14`):

```json
"scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "eslint ."
}
```

and pin `pixi.js` exactly (`pnpm add -E pixi.js@8.22.0`) after the `checkpoint:human-verify` required by RESEARCH §Package Legitimacy Audit.

---

### `tests/render/calendar.test.ts`, `camera-math.test.ts`, `hud-model.test.ts`, `frame-model.test.ts` (test, unit)

**Analog:** `tests/physics/damage.test.ts`

**Pure-function test style** (`tests/physics/damage.test.ts:1-45`):

```typescript
import { describe, expect, it } from 'vitest';

import {
    computeDamageMean,
    computeDamageReduction,
    computeFinalDamage,
    DAMAGE_JITTER_SIGMA_DIVISOR,
    isDamageBearingPair,
    rollDamage
} from '@/physics/damage';
import { ColliderPart } from '@/physics/types';

// 复用 02-01 建立的确定性 IRng 辅助（AGENTS §9：不重复造采样器）。
import { mulberry32 } from '../helpers/rng';

describe('computeDamageMean — spec mean D̄_R', () => {
    it('matches hand-computed values for the spec formula', () => {
        expect(computeDamageMean(60, 1, 1.2, 9)).toBeCloseTo(144, 6);
        ...
    });

    it('guards non-finite / negative Δv to a finite, non-negative result', () => {
        for (const deltaV of [Number.NaN, Number.POSITIVE_INFINITY, -9]) {
            const result = computeDamageMean(60, 1, 1.2, deltaV);
            expect(Number.isFinite(result)).toBe(true);
            expect(result).toBeGreaterThanOrEqual(0);
        }
    });
});
```

Reuse this structure for boundary tables: calendar (`0`, `1439`, `1440`, `43200`, `518400`), camera math (`n = 1/2/16/100`, outlier, 90%-coverage projection, no-teleport between frames, strategic corners), HUD (`15 × fps` frames, `< 6` always-visible, hybrid scale endpoints), frame model (cull boundaries, spec snapshot).

---

### `tests/render/damage-tap.test.ts` (test, unit with fakes)

**Analog:** `tests/control/damage-sink.ts` + `tests/control/loop.test.ts`

**Narrow fake implementing an interface** (`tests/control/damage-sink.ts:17-61`) and **helper constructors** (`tests/control/loop.test.ts:39-64`):

```typescript
export class TestDamageSink implements IDamageSink {
    private readonly onApplied?: (context: IDamageContext) => void;

    constructor(onApplied?: (context: IDamageContext) => void) {
        this.onApplied = onApplied;
    }

    applyDamage(context: IDamageContext): void {
        if (context.attackerTeamId === context.defenderTeamId) {
            return;
        }
        if (!context.defender.isAlive()) {
            return;
        }
        const wasAlive = context.defender.isAlive();
        context.defender.takeDamage(context.event.damage);
        ...
        this.onApplied?.(context);
    }
}
```

```typescript
/**
 * 构造一个静止的运动读数。
 */
function stateAt(x: number, y: number): IUnitState {
    return { x, y, angle: 0, vx: 0, vy: 0, angularVelocity: 0 };
}

/**
 * 生成一个用于注册的真实单位。
 */
function makeUnit(seed: number): IUnit {
    return spawnUnit(ClassKind.Swordsman, mulberry32(seed));
}
```

Use a fake `IDamageSink` whose behavior is configurable (reject / apply partial / kill) and a fake `UnitStateLookup`. Assert: rejected damage records nothing; applied damage records exact HP loss; lethal hit records `killed: true` and the pre-removal position; buffer cap holds.

---

### `tests/render/fakes.ts` (test helper, fakes)

**Analog:** `tests/control/arena.ts`, `tests/control/damage-sink.ts`

Copy the header-comment + narrow-class style:

```typescript
/**
 * 测试竞技场：`class ArenaSensingWorld implements ISensingWorld`（D-01/D-02/D-04）。
 * ...
 * 不引入 Rapier：射线计算全部为纯数学。
 */
export class ArenaSensingWorld implements ISensingWorld {
    /** 矩形边界的半边长（米）... */
    private readonly halfExtent: number;
    ...
}
```

`tests/render/fakes.ts` should export factory functions (not a grab-bag of mutable globals) for `IUnit`, `IUnitState`, `IUnitCatalog`, `IPhysicsWorld` lookups, and `IDamageSink`. Every public class member must exist on the implemented interface (AGENTS §5).

---

### `tests/render/visual-spec.test.ts` (test, data validation)

**Analog:** `tests/units/data-weapons-armors.test.ts`

**Completeness + ordering pattern** (`tests/units/data-weapons-armors.test.ts:11-29, 51-61`):

```typescript
describe('units/data — WEAPON_DEFS completeness', () => {
    it('holds exactly the 6 WeaponKind entries', () => {
        expect(Object.keys(WEAPON_DEFS)).toHaveLength(6);
        expect(ALL_WEAPON_KINDS).toHaveLength(6);
    });

    it('ALL_WEAPON_KINDS lists the 6 values in order and no reverse-mapped strings', () => {
        expect(ALL_WEAPON_KINDS).toEqual([
            WeaponKind.Longsword,
            ...
        ]);
        for (const kind of ALL_WEAPON_KINDS) {
            expect(typeof kind).toBe('number');
        }
    });
});

it('gives each weapon a penetration entry for BOTH armor kinds', () => {
    ...
});
```

`visual-spec.test.ts` should assert: every `WeaponKind`/`ArmorKind` has a geometry builder, every `ClassKind` maps to its initial equipment (`src/units/data.ts`, 6 weapons / 2 armors coverage), and faction color resolution is total (fallback for unknown ids).

---

### `tests/demo/composition.test.ts` (test, integration)

**Analog:** `tests/kingdom/battle.test.ts` (real Rapier setup + harness import)

**Setup/teardown pattern** (`tests/kingdom/battle.test.ts:1-47`):

```typescript
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
...
import { createKingdom, initRapier } from './harness';
import type { IKingdomFixture } from './harness';
```

Use `beforeAll(() => initRapier())`, build the demo setup, run a handful of `world.tick()` calls, assert `tap.drain()` yields only real damage events and that the composition order holds. Dispose in `afterEach` in harness order: `world.dispose()` → `control.dispose()` → `physics.dispose()` (`tests/kingdom/harness.ts:57-67`).

---

### `tests/demo/runner.test.ts` (test, timer) — **no repo analog**

No existing fake-timer test. Use Vitest's `vi.useFakeTimers()` / `vi.advanceTimersByTime()`; do not rely on real 4 ms clamping. Assert: `start()` schedules one frame; `pause()` cancels; `stepOnce()` runs exactly one `world.tick()` + one `renderFrame()`; `setFrameDelay` clamps; errors pause the loop.

---

## Shared Patterns

### Declaration-only organization (AGENTS §1/§2/§3/§4/§5/§6/§8/§10/§11)

**Source:** `src/physics/types.ts:1-6`, `src/control/types.ts:1-6`, `src/kingdom/types.ts:88-98`
**Apply to:** `src/render/types.ts`, `src/demo/types.ts`, `tests/render/types.test.ts`

- One `types.ts` per folder; no extra type files.
- Numeric enums only; no string enums.
- Every interface member/method JSDoc'd; every top-level `const` JSDoc'd.
- Missing object → `null`; missing literal → `undefined`.
- No getters/setters; no `#` fields; no `_` prefix; private members use `private`.
- No public class member outside its implemented interface.

### Class implementation skeleton

**Source:** `src/physics/PhysicsWorld.ts:37-104`, `src/control/ControlSystem.ts:48-104`, `src/kingdom/TimeSystem.ts:14-39`
**Apply to:** `Camera`, `Hud`, `Renderer`, `GeometryUnitView`, `UnitViewFactory`, `RenderDamageTap`, `ManualRunner`, `OperatorPanel`

```typescript
/**
 * <一句话职责>：`class X implements IX`。
 */
export class X implements IX {
    /** <字段含义>。 */
    private readonly dep: IDep;

    /**
     * 构造 X。
     * @param dep <含义>。
     */
    constructor(dep: IDep) {
        this.dep = dep;
    }

    /** <方法含义>。 */
    doThing(): void {
        ...
    }
}
```

### Idempotent teardown

**Source:** `src/physics/PhysicsWorld.ts:506-519`, `src/control/ControlSystem.ts:308-311`
**Apply to:** `Renderer.dispose()`, `Hud.dispose()`, `Camera.reset()`, demo `reset()`

Guard with a private `disposed` boolean, early-return on second call, clear every Map/array and free only owned resources. Never dispose externally injected `IWorld`/`IControlSystem`/`IPhysicsWorld` (`IWorld.dispose()` docs at `src/kingdom/types.ts:404-405`).

### Composition root order

**Source:** `tests/kingdom/harness.ts:140-193`
**Apply to:** `src/demo/composition.ts`, `tests/demo/composition.test.ts`

`RAPIER.init()` → `PhysicsWorld` → `KingdomSensingWorld` → `BattleDamageSink` (late-bound `worldRef`) → `RenderDamageTap(sink)` → `IdleAI` provider → `ControlSystem(physics, sensing, provider, tap)` → `KingdomWorld(physics, control, rng, scenario, config)` → `worldRef = world`. Never reorder; never build sink after world.

### Per-frame simulation/render contract

**Source:** `src/kingdom/KingdomWorld.ts:264-292, 841-855`; `src/control/ControlSystem.ts:289-302`
**Apply to:** `src/demo/runner.ts`, `src/render/Renderer.ts`

Exactly one `IWorld.tick()` per output frame; `KingdomWorld.stepSubstep()` already calls `control.tick()`, so the runner must never call it again (`KingdomWorld.ts:851`). `IRenderer.renderFrame()` only reads/paints; `app.render()` is synchronous.

### Test style

**Source:** `tests/kingdom/types.test.ts:91-114`, `tests/physics/damage.test.ts:1-45`, `tests/units/data-weapons-armors.test.ts:11-29`
**Apply to:** all `tests/render/*` and `tests/demo/*`

- `describe` names use `area — behavior` (em dash).
- Enum tests pin exact numeric values and assert integers/distinctness.
- Pure math tests include boundary and non-finite guards.
- Import deterministic RNG from `../helpers/rng` (`mulberry32`), never `Math.random` in tests.
- Real Rapier tests call `initRapier()` once and dispose via the harness helpers.

### Import / formatting conventions

**Source:** `vite.config.ts:4-13`, `vitest.config.ts:5-21`, `tsconfig.json:19-27`, `package.json:10-14`
**Apply to:** every new file

- Use the `@/` alias for `src/**` (both Vite and Vitest configure it separately).
- 4-space indentation, single quotes, semicolons (Prettier is enforced by ESLint).
- `strict: true`; no `any` unless unavoidable (`@typescript-eslint/no-explicit-any` is off but avoid it).
- Type-only imports use `import type`.
- Run `pnpm typecheck`, `pnpm test`, `pnpm lint` before every wave merge.

### Visual/physics consistency

**Source:** `src/physics/constants.ts:31-42`, `src/physics/PhysicsWorld.ts:130-147`
**Apply to:** `GeometryUnitView`, `UnitViewFactory`, `visual-spec.test.ts`

Weapon capsule sits at local `(0.7, 0)` with its long axis along local **y**; armor is a concentric circle of radius `0.55`; body circle radius `0.5`. Draw every weapon on that footprint (grip connecting body to `x ≈ 0.7`), otherwise the picture will not match the collision behavior.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/demo/runner.ts` | controller | event-driven (setTimeout) | No timer loop or `setTimeout` usage exists in `src/` or `tests/`; use RESEARCH §Pattern 5 / Code Example 6 |
| `src/demo/panel.ts` | view (DOM) | event-driven | Repo has no DOM/UI code at all; use RESEARCH §Code Example 7 and ASVS V5/V1 rules (`textContent`, `Number.isFinite`, clamps) |
| `src/main.ts` | entry point | bootstrap | No Vite entry exists; use RESEARCH §Code Example 1 |
| `index.html` | entry point | bootstrap | No HTML file exists; use RESEARCH §Code Example 8 |
| `src/style.css` | config/styles | — | No stylesheet exists; use RESEARCH §Code Example 8 |
| `tests/demo/runner.test.ts` | test | timer | No fake-timer tests exist; use Vitest `vi.useFakeTimers()` per RESEARCH §Validation |

---

## Metadata

**Analog search scope:** `src/` (common, control, kingdom, physics, units), `tests/` (control, helpers, kingdom, physics, units), root config (`package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`)
**Files scanned:** 40+ (all listed analogs read directly; large `KingdomWorld.ts`/`ControlSystem.ts`/`PhysicsWorld.ts` read via targeted line ranges)
**Tracked-source check:** all named analog paths verified with `git ls-files -- <path>` (non-empty); no gitignored mirror paths used
**Pattern extraction date:** 2026-10-21
