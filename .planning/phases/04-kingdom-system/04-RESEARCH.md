# Phase 4: 王国系统 - Research

**Researched:** 2026-10-20
**Domain:** 1000×1000 地图 / 势力 / 军队 / 城池 / 时间 / 视野 / 单位级战斗（TypeScript + Rapier2D + Vitest）
**Confidence:** HIGH（冻结契约与 Rapier 集成事实——本会话读源码 + 运行时探针）；MEDIUM（王国类型契约——待用户门禁审查的设计提案）；MEDIUM（heal / 静态地形两个冻结目录扩展——需用户在门禁批准）；LOW（规格未给出的默认数值，已标 `[ASSUMED]`）

> **Provenance convention:** `[VERIFIED: path:lines]` = 本会话用 `Read` 打开源码并逐字核对（引文集中在 §Verified Contract Facts）；`[VERIFIED: rapier probe]` = 本会话真实 WASM 运行时探针；`[CITED: .planning/reference/...]` = 项目规格；`[ASSUMED]` = 规格未给出的设计默认值，需门禁/实测确认。

## Summary

Phase 4 是**王国层**：它把 Phase 1–3 已经冻结的「单位 + 物理 + 单位 AI」组装成一个会自行行军、遭遇、开战、攻城、训练、回血的世界。本轮（Round 1）只规划 `src/kingdom/types.ts` + `I*` 契约 + 最小编译期测试；实现（World/Time/Army/City/Battle/Commander/Scenario）留到用户批准类型后的 Round 2。

本会话读到并**运行时验证**了三条决定设计形状的集成事实：

1. **一个全局物理世界、持久动态刚体**是可行的；但冻结的 `IPhysicsWorld` **没有任何静态障碍 API**（`registerUnit`/`removeUnit`/`hasUnit`/`applyForce`/`applyTorque`/`getUnitState`/`tick`/`dispose`，共 8 个方法），且 `PhysicsWorld` 的 Rapier `World` 是 `private readonly`。Rapier 的 `RigidBodyDesc.fixed()` + `ColliderDesc.cuboid()` 在同一 world 里**确实阻挡动态单位**，`world.castRay(..., QueryFilterFlags.EXCLUDE_DYNAMIC)` **确实只命中固定地形**（探针输出见 §Verified Contract Facts）。因此阻塞地形的正确接缝是**向 `PhysicsWorld` 增加一个极小的静态障碍接口**，而不是另建物理世界或把地形伪装成动态单位。 `[VERIFIED: src/physics/types.ts:195-212; src/physics/PhysicsWorld.ts:42; rapier probe]`
2. **`IUnit` 没有任何回血入口**：只有 `takeDamage(amount)`，且 `Unit.takeDamage` 对 `amount <= 0` 直接返回。KING-03 的行军回血 1/h 与 KING-05 的驻扎回血 2/h **无法在冻结契约上实现**。这是本阶段第一个必须由用户裁决的契约缺口；最小修法是新增 `IHealableUnit extends IUnit { heal(amount): void }` + `Unit.heal`（`IUnit` 本体可保持不变）。 `[VERIFIED: src/units/types.ts:224-247; src/units/Unit.ts:186-195]`
3. **AI 切换不需要改 Phase 3 契约**：`IUnitAIProvider.create(unitId, unit)` 在注册时为每个单位创建一个 AI 实例。让这个实例是一个**复合 `ModeAI`**，内部持有 `MarchAI` / `BattleAI` / `BrakeAI` / `IdleAI`，每次 `decide()` 从王国层的 `IUnitModeSource` 读取该单位的当前模式并委托——这是最小、最干净、且完全在冻结接缝内的方案。 `[VERIFIED: src/control/types.ts:201-216]`

**Primary recommendation:** Round 1 只写 `src/kingdom/types.ts`（数字枚举 + `IFaction`/`IArmy`/`ICity`/`IWorld`/`ITimeSystem`/`IBattle`/`IBattleSystem`/`ICommander`/`IArmyOrder`/场景/模式源 + 两个函数类型）与 `tests/kingdom/types.test.ts`（枚举钉版 + `expectTypeOf` 编译期断言）。同时把**两个冻结目录扩展**（`IHealableUnit`/`Unit.heal`、`IStaticObstacleWorld`/`PhysicsWorld` 静态方法）作为**门禁决策**写进 Round 1 计划，等用户批准后再在 Round 2 实现。时间循环采用「**一个物理子步 = 1 游戏分钟；外层 tick 在 1× 跑 1 步、24× 跑 24 步**」，绝不改变 Rapier 的 `DT`；战斗是**单位级成员集合 + 80m 正方形 + 加权中心**，伤害过滤全部在 `IDamageSink` 里完成。

---

## Verified Contract Facts

> 本节把本会话**实际读到的源码**与**运行时探针输出**逐字列出。所有 `[VERIFIED: path:lines]` 断言都以本节引文为准；未在本节出现的数值一律按 `[ASSUMED]` 处理。

### 冻结的 `IPhysicsWorld`：只有 8 个方法，没有静态障碍

```ts
// src/physics/types.ts:195-212
export interface IPhysicsWorld {
    registerUnit(spec: IUnitPhysicsSpec): void;
    removeUnit(unitId: number): void;
    hasUnit(unitId: number): boolean;
    applyForce(unitId: number, forceX: number, forceY: number): void;
    applyTorque(unitId: number, torque: number): void;
    getUnitState(unitId: number): IUnitState | null;
    tick(): IPhysicsTickResult;
    dispose(): void;
}
```

`PhysicsWorld` 的 Rapier world 是私有的：

```ts
// src/physics/PhysicsWorld.ts:42
private readonly world: InstanceType<typeof RAPIER.World>;
```

每个物理 `tick()` 结束时清空力/力矩（所以控制层的动作必须每 tick 重施加）：

```ts
// src/physics/PhysicsWorld.ts:431-434
for (const body of this.bodies.values()) {
    body.resetForces(false);
    body.resetTorques(false);
}
```

固定步长：

```ts
// src/physics/constants.ts:14
export const DT = 1 / 60;
```

### 冻结的 `IControlSystem` / `IUnitAI` / `IDamageSink`

```ts
// src/control/types.ts:302-317
export interface IControlSystem extends IUnitCatalog {
    registerUnit(request: IControlUnitRegistration): void;
    unregisterUnit(unitId: number): void;
    updateTeam(unitId: number, teamId: number): void;   // Phase 4 城池易手预留
    tick(): IControlTickResult;
    dispose(): void;
}
```

```ts
// src/control/types.ts:201-216
export interface IUnitAI {
    decide(observation: IUnitObservation): IUnitAction;
}
export interface IUnitAIProvider {
    create(unitId: number, unit: IUnit): IUnitAI;
    destroy(unitId: number): void;
}
```

```ts
// src/control/types.ts:265-268
export interface IDamageSink {
    applyDamage(context: IDamageContext): void;
}
```

`ControlSystem.tick()` 的顺序是：每 6 tick 决策 → 每 tick 重施加 → `physics.tick()` → 路由伤害 → 批量注销死亡：

```ts
// src/control/ControlSystem.ts:193,252-264
if (this.tickIndex % DECISION_INTERVAL_TICKS === 0) { /* sense + decide */ }
const result = this.physics.tick();
for (const damage of result.damages) {
    this.routeDamage(damage);
}
// ... deadUnitIds -> removeRegisteredUnit
```

### 冻结的 `IUnit`：没有 heal

```ts
// src/units/types.ts:224-247（完整方法集，逐字；JSDoc 省略）
export interface IUnit {
    getAttribute(kind: AttributeKind): number;
    getName(): string;
    getClass(): ClassKind;
    getEquipment(): readonly IEquipment[];
    getModifiers(): readonly IModifier[];
    getSkills(): readonly SkillKind[];
    takeDamage(amount: number): void;
    isAlive(): boolean;
    gainAttackExperience(damageDealt: number): void;
    gainDefenseExperience(damageReduced: number): void;
    gainKillExperience(enemyLevel: number): void;
}
```

`takeDamage` 明确拒绝非正数——**不存在“负伤害 = 回血”的后门**：

```ts
// src/units/Unit.ts:186-195（逐字）
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

升级回血只发生在 `checkLevelUp()` 内（`Unit.ts:297-315`），无法用于按小时回血。

### 感知 / 控制常量

```ts
// src/control/constants.ts:12,18,24,30,36
export const DECISION_INTERVAL_TICKS = 6;
export const RAY_COUNT = 64;
export const SENSING_MAX_DISTANCE = 50;
export const MAX_NEIGHBORS = 16;
export const NEIGHBOR_QUERY_RADIUS = 100;
```

### 单位生成：正态随机（σ = 均值/8）

```ts
// src/units/spawn.ts:31-53（节选）
export function spawnUnit(classKind: ClassKind, rng: IRng): IUnit {
    const def = CLASS_DEFS[classKind];
    const roll = (mean: number): number => sampleNormal(rng, mean, mean / 8);
    const attributes: ISpawnAttributes = {
        maxHp: roll(def.maxHp),
        controlLevel: roll(CONTROL_LEVEL_BASE),
        attack: roll(def.attack),
        defense: roll(def.defense),
        weaponRatio: roll(def.weaponRatio),
        armorRatio: roll(def.armorRatio),
        mass: roll(def.mass)
    };
    const name = `${def.name}#${spawnIndex}`;
    spawnIndex += 1;
    return new Unit(classKind, attributes, [], name);
}
```

### Rapier 0.21.0：静态刚体 + 射线过滤确实可用

```ts
// node_modules/@dimforge/rapier2d-compat/dist/dynamics/rigid_body.d.ts:575
static fixed(): RigidBodyDesc;
// node_modules/@dimforge/rapier2d-compat/dist/geometry/collider.d.ts:748
static cuboid(hx: number, hy: number): ColliderDesc;
// node_modules/@dimforge/rapier2d-compat/dist/pipeline/world.d.ts:173,214,389
createRigidBody(body: RigidBodyDesc): RigidBody;
createCollider(desc: ColliderDesc, parent?: RigidBody): Collider;
castRay(ray: Ray, maxToi: number, solid: boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: Collider, filterExcludeRigidBody?: RigidBody, filterPredicate?: (collider: Collider) => boolean): RayColliderHit | null;
// node_modules/@dimforge/rapier2d-compat/dist/pipeline/query_pipeline.d.ts:16
EXCLUDE_DYNAMIC = 4,
```

**本会话运行时探针（真实 Rapier 0.21.0 WASM）**：

```
# 探针 1：固定墙 + 动态球 + 碰撞事件 + 射线
after 120 steps ball translation QI { x: 9.000006675720215, y: 0 }   # 墙在 x=10、半宽 0.5，球半径 0.5 → 被挡在 9.0
saw wall contact event true
castRay toi 8.500006675720215                                       # 从原点向 +x，命中墙面 8.5
castRay collider handle 5e-324                                       # handle 是不透明数值，只可作 map key/相等比较
getCollider ball ok true
second unit registered 1e-323
after wall removal castRay 8.500006675720215                        # 墙移除后命中的是球（球在 x=9）

# 探针 2：先步进、后加地形；EXCLUDE_DYNAMIC 只命中地形
terrain-only toi 9.5
terrain handle matches wall true
all toi (should be unit at 0.5) 0
unit-only toi 0
```

结论：**同一 Rapier world 内加固定 cuboid 可行；地形可在单位注册之后动态加入；接触事件会出现但地形 handle 不在 `PhysicsWorld.index` 中，`tick()` 会安全跳过（无伤害）**。`castRay` 的 `EXCLUDE_DYNAMIC` 可只命中地形，但本阶段推荐地形射线用解析几何（见 §Architecture Patterns Pattern 7），避免每单位每决策 64 次 Rapier 调用与临时对象分配。

### 本会话基线

- `pnpm typecheck` 通过。
- `pnpm test`：**20 个测试文件 / 186 个测试全部通过**（Vitest 5.0.4）。
- Node `v24.21.0`；pnpm `12.5.1`；`@dimforge/rapier2d-compat` 字面量 `0.21.0`。
- `.planning/graphs/graph.json` 不存在 → 本研究会话无图上下文，结论全部来自源码/探针。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 世界与战斗容器

- **D-01:** 所有单位始终存在于**一个全局 `IPhysicsWorld`**（持久动态刚体），从生成到死亡不销毁重建。**军队是宏观容器**（中心、朝向、单位名册、状态），不是战斗层实体。 — **Reversibility:** costly — 全局物理世界与持久刚体是王国/渲染/录制的共同地基。
- **D-02:** **战斗是单位级的**：任何单位进入 80m 战斗区即加入该战场；战斗层**不存在“军队”概念**，只有单位、阵营与战斗区。 — **Reversibility:** costly — 战斗成员、伤害过滤、结束判定都按单位集合实现。
- **D-03:** 战斗**物理/模拟并发**（多个战场同时真实推进）；Phase 4 对外维护一个**按触发/结束顺序消费的战斗队列**，供 Phase 6/7 依次播放。 — **Reversibility:** costly — 录制与导演的播放顺序依赖该队列。
- **D-04:** 战斗区重叠或新单位进入时**合并为同一战场**；战场成员是单位集合，结束条件只看“区内是否只剩一个阵营的单位”。 — **Reversibility:** costly — 合并/增援语义是战斗成员判定的核心。
- **D-05:** 战斗结束后**双方保留原 `armyId`**，不重排归属；两军距离必须 **>80m** 才能再次触发战斗，避免原地重复触发。 — **Reversibility:** costly — 重战锁定与军队重组逻辑依赖它。
- **D-06:** 单位跨战斗**持久**：生命值/经验/等级/装备保留，死亡永久移除；行军回血 1/h、驻扎回血 2/h 自然生效。 — **Reversibility:** costly — 单位生命周期与统计口径都依赖持久化。

#### 时间系统

- **D-07:** 模拟**没有 wall-clock tickrate**；1× 战斗时 **1 tick = 1 游戏分钟**，24× 无战斗时 **1 tick = 24 游戏分钟**。模拟按自己的节奏推进，不等真实时间；成片由 WebCodecs 处理。 — **Reversibility:** costly — tick 的语义贯穿所有系统。
- **D-08:** 所有战略计时（行军 10m/h、回血 1/h 与 2/h、训练 96h/72h）都按**游戏时间**累计，不按真实秒。 — **Reversibility:** costly — 计时单位是数值校准与测试的共同基准。
- **D-09:** 只要有任一战斗在进行，**全局时间切 1×**；未参战军队/势力继续按 1× 行动（时间不停止）。 — **Reversibility:** costly — 全局时间倍率影响所有并行行为。
- **D-10:** 每个战略 tick 需要多少物理子步、如何把 1/24 游戏分钟映射到 Rapier 步进，**不在讨论层锁定**；由 research/planner 决定，但必须保持 D-07/D-08 的游戏时间语义与物理稳定性。 — **Reversibility:** reversible — 纯实现选择，可随实测调整。

#### 行军与程序控制

- **D-11:** 行军由 **`MarchAI implements IUnitAI`** 控制（程序阵型，不是行为树 AI）；进入战斗时切换为战斗 AI。复用 Phase 3 的 `IUnitAI` 接缝，**不改 `IPhysicsWorld`/`IUnit`/`src/control/types.ts`**。 — **Reversibility:** costly — AI 切换是行军/战斗共存的唯一接缝。
- **D-12:** 军队中心以固定 **10m/h** 移动；行军单位在中心 **25m 圆**内由程序控制；军队碰到地图边缘**反弹**后继续前进。 — **Reversibility:** costly — 行军是地图层的基础运动学。
- **D-13:** 行军回血 **1/h**、城池驻扎回血 **2/h**，按游戏时间累计。 — **Reversibility:** reversible — 数值可校准。
- **D-14:** 单位离开战斗区即**退出战斗**：不再决策、不再结算伤害，并由程序控制**逐渐刹车**；若战斗区移动回其位置则重新加入。 — **Reversibility:** costly — 离区/回区是战斗成员判定的另一半。
- **D-15:** 同队单位保留物理碰撞，但**不结算伤害**（沿用 Phase 3 D-09）；伤害过滤在 Phase 4 的 `IDamageSink` 中完成。 — **Reversibility:** costly — 与战斗伤害规则绑定。

#### 战斗触发、战斗区与结算

- **D-16:** 军队/城池战斗触发用**军队中心到军队中心**、**军队中心到城池点**的距离；**<80m** 触发。 — **Reversibility:** costly — 触发度量决定所有战斗的时序。
- **D-17:** 战斗区为边长 **80m 的正方形**，中心为**参战单位的加权中心**。 — **Reversibility:** costly — 战斗区是成员/结束判定的空间基准。
- **D-18:** 加权中心的默认权重 = **单位等级**；权重通过注入函数 **`(unit: IUnit) => number`** 提供，用户可随时替换（不是写死常量）。 — **Reversibility:** costly — 权重函数是战斗区契约的一部分。
- **D-19:** 只有**同一场战斗、且双方都在区内**的单位之间才结算伤害；离区/未参战单位即使武器接触也不掉血；同队免伤继续有效。 — **Reversibility:** costly — 伤害范围决定战斗结果与“脱离”语义。
- **D-20:** 战斗结束条件：**战斗区内仅剩一个阵营的单位**；结束后进入重战锁定（D-05），双方重组并继续行军。 — **Reversibility:** costly — 结束/重战是战斗状态机的核心。
- **D-21:** 城池战斗流程与军队战斗相同，区别在战后：**获胜方接管城池**；空城直接接管；败方存活单位重组并向己方城池行军，无己方城池则随机方向；胜方可按可配置入驻规则留下单位。 — **Reversibility:** costly — 城池所有权与势力消长依赖它。
- **D-22:** 入驻规则是**可配置函数**：可按比例、指定单位、全部或一个都不入驻；默认给一个可校准的比例规则。 — **Reversibility:** reversible — 策略可替换。
- **D-23:** 城池训练：普通城 **96h/1**、主城 **72h/1**；驻军上限按城池规模配置；训练职业**可配置**，属性使用文档规定的**正态随机**（`spawnUnit`：均值按职业、σ = 均值/8）。 — **Reversibility:** reversible — 数值/职业表可校准。

#### 势力、视野、城池与地形

- **D-24:** 王国层类型集中在 `src/kingdom/types.ts`：`IFaction`/`IArmy`/`ICity`/`IWorld`/`ITimeSystem` 等接口 + 势力/军队状态的**数字枚举**。 — **Reversibility:** costly — 类型门禁冻结后是 Phase 5/7 的共同契约。
- **D-25:** 视野是**查询式当前可见性**：按势力所有军队（100m）与城池（150m）视野半径的并集，查询当前可见的军队/城池/单位；**不维护记忆**。历史/事件簿由 Phase 7 负责。 — **Reversibility:** costly — Phase 7 指挥官与信息申请依赖该读取面。
- **D-26:** 城池是**地图概念（点）**，没有物理/射线实体；驻扎只是**军队的一个状态**；城池本身不影响军队战斗。 — **Reversibility:** costly — 城池/驻军的数据模型影响 Phase 5/7。
- **D-27:** 城池附近存在**可阻挡地形**（静态障碍），**同时阻挡单位移动与 64 条射线**；地形数据来自可配置场景/地形表。 — **Reversibility:** costly — 地形既影响物理移动也影响感知，需要新的静态障碍接缝。
- **D-28:** 初始世界用**可配置场景表**（势力、城池位置/规模/驻军上限、军队位置/方向/单位职业与数量、城池附近地形）；默认给一个小型可跑场景（如 2 势力、各 1 城 1 军、每军 8–12 单位），测试可替换。 — **Reversibility:** reversible — 场景数据与代码分离。
- **D-29:** Phase 4 内置**最小占位指挥官**（每势力一个）：只负责给军队下宏观指令（行军/攻城/驻扎/重组等），具体目标选择由实现自定，**不重要**；通过可替换的 `ICommander`/`IArmyOrder` 接缝接入，Phase 7 可整体替换为 LLM 指挥官。 — **Reversibility:** costly — Phase 7 的接入点依赖它。

### the agent's Discretion

- `IFaction`/`IArmy`/`ICity`/`IWorld`/`ITimeSystem` 的具体字段与方法签名。
- 军队阵型槽位分配、`MarchAI` 的转向/速度控制参数、离区刹车的具体力/阻尼。
- 战斗区加权中心权重函数的默认实现（默认返回等级）。
- 入驻函数的默认比例、训练职业配置表的结构。
- 城池规模/驻军上限、训练时间常量、地形几何与场景默认值。
- 占位指挥官的具体目标选择（最近敌城/敌军/巡逻等）；只要接口可替换即可。
- `src/kingdom/` 内部文件拆分（遵循每文件夹一个 `types.ts`）。

### Deferred Ideas (OUT OF SCOPE)

- **LLM 指挥官/导演** — Phase 7；Phase 4 只留可替换的占位指挥官接口，不接真实 LLM。
- **射弹与技能物理**（弓箭/万箭齐发/冲锋/旋转） — 从 Phase 3 继续 deferred；Phase 4 战斗仍以近战碰撞为主。是否在 Phase 4 补最小射弹，留给 research 评估。
- **全地图地形/障碍生成** — 本阶段只做城池附近的可阻挡地形；更丰富的地形属后续。
- **录制/回放顺序** — Phase 6；Phase 4 只提供战斗队列与时间戳。
- **更丰富的战略 AI/势力外交** — Phase 7 或后续；Phase 4 只做最小占位。
- **确定性/重放** — 项目明确 out of scope。

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KING-01 | 1000×1000 地图；军队行军速度固定 10m/h，碰到地图边缘反弹 | `IScenario.width/height` + `IMapBounds`；`ARMY_SPEED_PER_HOUR = 10` → 每游戏分钟 1/6 m；`Army.getCenter()/getHeading()/getState()`；World 每子步移动中心并按 25m 边距反射；地图边界另加 4 面静态墙（A14） |
| KING-02 | 时间系统——战斗时 1× 速、无战斗时 24× 速 | `TimeRate { Normal = 1, Fast = 24 }`；`ITimeSystem.getGameMinutes()/getRate()/getSubstepsPerTick()`；World 外层 tick 在 1× 跑 1 个子步、24× 跑 24 个子步（每子步 1 游戏分钟）；战斗一开始立即 break 切 1×（D-07/D-09） |
| KING-03 | 军队由单位组成；行军时单位聚集于军队中心 25m 圆内并由程序控制（非 AI），行军回血 1/h | `IArmy.getUnitIds()`；`MarchAI implements IUnitAI`（阵型槽位 + 速度误差控制 + 射线避障）；`ARMY_FORMATION_RADIUS = 25`；`heal(1/60)` 每游戏分钟 → **需要新增 `IHealableUnit`/`Unit.heal`（门禁决策 G-1）** |
| KING-04 | 视野——军队半径 100m、城池半径 150m，决定势力可获取的信息 | `IWorld.getVisibleArmies/getVisibleCities/getVisibleUnitIds(factionId)`；按己方军队中心 100m + 己方城池点 150m 的并集做平方距离查询；无记忆（D-25）；Phase 7 直接消费 |
| KING-05 | 城池——驻扎上限、训练单位（普通 96h/1、主城 72h）、驻扎回血 2/h | `ICity.getKind()/getGarrisonCap()/getTrainingClass()/getTrainingProgressMinutes()/getGarrisonArmyId()`；`CityKind { Normal, Capital }`；`TRAINING_HOURS_NORMAL = 96`、`TRAINING_HOURS_CAPITAL = 72`；`spawnUnit` 正态生成；**训练不要求已有驻军，产出时若无驻军则新建**；无主城不训练；驻扎 `heal(2/60)`（同 G-1） |
| KING-06 | 军队战斗——距离 <80m 触发，战斗区为 80m 正方形加权中心，离区/结束判定 | `BattleSystem`：`BATTLE_TRIGGER_DISTANCE = 80`、`BATTLE_AREA_HALF_EXTENT = 40`、`UnitWeight` 注入（默认等级）；单位级 `memberUnitIds`；离区 → `UnitControlMode.Brake`；结束 = 区内只剩一个阵营；队列 `IBattleSystem.listActive/listCompleted/drainEvents` |
| KING-07 | 城池战斗——触发条件与战后结算（获胜方接管、可能入驻；败方重组行军） | 同 KING-06 流程 + `IBattle.getCityId()`；空城直接接管；`GarrisonSelector` 可配置函数；胜方拆分驻军、败方保留 `armyId` 重组并向己方城池/随机方向行军；重战锁定（A15） |
| KING-08 | 势力/阵营概念——多个势力，各拥有军队与城池 | `IFaction.getId()/getArmyIds()/getCityIds()`；`factionId` 直接作为 Phase 3 注册 `teamId`；场景 `IFactionSpawnSpec`；`IWorld.getFactions()` 供渲染/统计；不修改 `IUnit` |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 全局单位物理（持久动态刚体） | Physics（`PhysicsWorld`） | Kingdom World（编排） | D-01：所有单位在一个 world 中，从生到死不重建 |
| 静态地形碰撞（挡移动） | Physics（新增 `IStaticObstacleWorld`） | Kingdom 场景构建 | D-27：固定 cuboid 必须在同一 Rapier world 才挡得住单位 |
| 地形射线（64 条） | Kingdom `KingdomSensingWorld`（`ISensingWorld`） | — | D-27：解析几何即可；不把感知绑到 Rapier 查询 |
| 军队宏观运动（中心/朝向/反弹） | Kingdom World / `Army` | — | D-12：军队是宏观容器，不是物理实体 |
| 行军阵型控制 | Kingdom `MarchAI`（`IUnitAI`） | ControlSystem（执行器） | D-11：程序阵型走 AI 接缝，不改控制契约 |
| 战斗触发/成员/区域/队列 | Kingdom `BattleSystem` | Physics（位置读数） | D-02/D-03/D-04/D-16–D-20：单位级成员 + 并发战场 + 队列 |
| 伤害规则（同场/在区/同队） | Kingdom `BattleDamageSink`（`IDamageSink`） | ControlSystem（只路由） | Phase 3 D-10：战斗规则不在控制层 |
| 城池/驻军/训练 | Kingdom `City` + World | Units（`spawnUnit`）/ Control（注册） | D-26：城池是点；驻扎是军队状态；训练走 Phase 1 生成 |
| 视野 | Kingdom World 查询 | — | D-25：查询式当前可见性，无记忆 |
| 时间/速率 | Kingdom `TimeSystem` | World 子步循环 | D-07–D-09：游戏分钟，1×/24× |
| 指挥官（占位） | Kingdom `Commander`（`ICommander`） | Phase 7 整体替换 | D-29：最小目标选择，不接 LLM |
| 渲染/录制读取面 | Phase 5 / Phase 6 | Kingdom `IWorld` / `IBattleSystem` | 只读契约；不反向依赖渲染/录制 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript（`typescript` = `@typescript/typescript6@^6.0.2`，`@typescript/native` = TS7） | 见 `package.json:18,23` | 类型先行契约 + `expectTypeOf` | 项目既有双 TS 别名方案；本阶段不改 |
| `@dimforge/rapier2d-compat` | `0.21.0`（精确钉版） | 唯一全局物理世界；静态 cuboid；`castRay` 备选 | Phase 2 已锁定；本阶段只消费 + 一个极小的静态障碍扩展 |
| `vitest` | `^5.0.4`（实测 5.0.4） | Round 1 编译期契约测试 + Round 2 行为测试 | 仓库既有；`expectTypeOf` 已在 `tests/control/types.test.ts` 使用 |
| Node.js | `>=24`（实测 v24.21.0） | 运行环境 | `package.json:9` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/common`（`IRng`/`MathRng`/`sampleNormal`） | 仓库内 | 训练生成、随机重组方向、测试可复现 | 生产 `MathRng`；测试注入 `mulberry32`（`tests/helpers/rng.ts`） |
| `@/units`（`spawnUnit`/`CLASS_DEFS`/`AttributeKind`） | 仓库内 | 军队名册、训练生成、加权中心权重 | 训练与场景初始化 |
| `@/control`（`ControlSystem`/`IUnitAI`/`IDamageSink`/`ISensingWorld`） | 仓库内 | 唯一的战术执行层与 AI 接缝 | World 每子步调用一次 `control.tick()` |
| `@/physics`（`PhysicsWorld`/`DT`/`DEFAULT_GEOMETRY`） | 仓库内 | 持久刚体、伤害事件、固定步长 | World 构造一次并长期持有 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 向 `PhysicsWorld` 加最小静态障碍接口 | Phase 4 自建第二个 Rapier world | 两个 world 的单位无法与地形碰撞；除非把单位物理整体重实现（~250 行重复、伤害/接触管线分叉）——不推荐 |
| 向 `PhysicsWorld` 加最小静态障碍接口 | 把地形伪装成不可移动动态单位 | 只有球碰撞体、会出现在控制目录、质量近似而非真静态、tiling 有缝隙——**拒绝** |
| `ModeAI` 复合委托 | 运行时重建 `ControlSystem`/Provider 切换 AI | `IControlSystem` 没有替换单单位 AI 的方法；重建会丢失动作/冷却/目录——不推荐 |
| 解析几何地形射线 | `world.castRay(..., EXCLUDE_DYNAMIC)` | Rapier 射线已验证可用，但每单位每决策 64 次调用 + `Ray` 临时对象；地形只有少量 AABB，解析法更便宜可测（保留为后续复杂地形备选） |
| 1 物理子步 = 1 游戏分钟，24× 跑 24 子步 | 改变 `world.timestep` 到 24/60 | Rapier 文档明确警告 dt 大幅变化会导致不稳定；且破坏 Phase 2 的 `DT = 1/60` 冻结语义——**拒绝** |
| 1 物理子步 = 1 游戏分钟，24× 跑 24 子步 | 24× 时只跑 1 子步、把战略位移 ×24 | 军队中心每子步要走 4m，单位靠力在 1/60s 内跟不上（需要 240 m/s），会拉断阵型/穿墙——**拒绝** |

**Installation:**

```bash
# 本阶段零新增依赖
pnpm typecheck   # Round 1 的真正门禁（类型契约编译通过）
pnpm test        # 契约测试 + Round 2 行为测试
pnpm lint
```

**Version verification:** `@dimforge/rapier2d-compat` 已锁定为字面量 `0.21.0`（`package.json:29`）；`vitest` `^5.0.4`（`package.json:26`）；本阶段不新增任何包，故无需 registry 查询。本会话运行 `pnpm typecheck` 与 `pnpm test`（20 文件 / 186 测试）均通过。

## Package Legitimacy Audit

> **Required** whenever this phase installs external packages. 本阶段**不安装任何外部包**，此表为空。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — no packages installed in Phase 4)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*本阶段所有新增代码都是仓库内 TypeScript；不引入行为树库、物理库、路径寻找库或测试工具。*

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         KingdomWorld implements IWorld                       │
│                                                                              │
│  IScenario ──► factions / cities / armies / terrain / initial units          │
│                                                                              │
│  ┌──────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐  │
│  │ TimeSystem   │   │ Army / City / Faction    │   │ Commander (placeholder)│ │
│  │ 1× / 24×     │   │ center heading roster    │   │ IArmyOrder[]          │ │
│  │ game minutes │   │ garrison / training      │   └──────────┬───────────┘  │
│  └──────┬───────┘   └────────────┬─────────────┘              │ orders       │
│         │                        │                            │              │
│         ▼                        ▼                            ▼              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ tick(): 1 or 24 substeps, each = 1 game minute + 1 physics step        │  │
│  │  1. advance game time                                                   │  │
│  │  2. move army centers (10 m/h, edge bounce) + formation slots           │  │
│  │  3. BattleSystem.reconcile(): trigger / join / exit / merge / end       │  │
│  │  4. update UnitControlMode (March / Battle / Brake / Idle)              │  │
│  │  5. ControlSystem.tick()  ──► physics.tick()                           │  │
│  │       └─ damages ──► BattleDamageSink (same battle + in area + team)    │  │
│  │  6. heal (march 1/h, garrison 2/h), training (96h/72h), capture         │  │
│  │  7. prune dead units from rosters / battle members                      │  │
│  └───────────────┬───────────────────────────────┬──────────────────────┘  │
│                  │                               │                         │
│                  ▼                               ▼                         │
│  ┌───────────────────────────┐     ┌───────────────────────────────────┐    │
│  │ ControlSystem (frozen)    │     │ KingdomSensingWorld               │    │
│  │  one IUnitAI per unit     │     │  map bounds + terrain AABBs       │    │
│  │  ModeAI composite         │     │  + enemy circles → 64 rays         │    │
│  └───────────┬───────────────┘     └───────────────────────────────────┘    │
│              │ applyForce / applyTorque / tick                             │
│              ▼                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ PhysicsWorld (frozen IPhysicsWorld + additive IStaticObstacleWorld)   │  │
│  │  persistent dynamic unit bodies                                       │  │
│  │  static terrain cuboids                                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

阅读顺序：Scenario → KingdomWorld.tick → (army centers → battle reconcile → modes → ControlSystem → damage sink → heal/train/capture) → PhysicsWorld。战斗队列与时间戳从 BattleSystem / TimeSystem 读出，供 Phase 6/7 消费；渲染只读 `IWorld` + `IPhysicsWorld.getUnitState`。

### Recommended Project Structure

```
src/kingdom/
├── types.ts            # Round 1 门禁物：数字枚举 + 全部 I* 契约 + 函数类型 + 场景类型
├── constants.ts        # Round 2：地图/速度/半径/战斗/回血/训练/子步常量（顶层 const + JSDoc）
├── scenario.ts         # Round 2：DEFAULT_SCENARIO（2 势力、各 1 城 1 军、8–12 单位、城池附近地形）
├── TimeSystem.ts       # Round 2：class TimeSystem implements ITimeSystem
├── Army.ts             # Round 2：class Army implements IArmy（中心/朝向/名册/状态/阵型槽位）
├── City.ts             # Round 2：class City implements ICity（归属/规模/驻军/训练进度）
├── BattleSystem.ts     # Round 2：class BattleSystem implements IBattleSystem（含内部 Battle 记录）
├── DamageSink.ts       # Round 2：class BattleDamageSink implements IDamageSink
├── SensingWorld.ts     # Round 2：class KingdomSensingWorld implements ISensingWorld
├── MarchAI.ts          # Round 2：class MarchAI implements IUnitAI
├── BattleAI.ts         # Round 2：class BattleAI implements IUnitAI（过滤到战斗区的 DefaultUnitAI 包装）
├── ModeAI.ts           # Round 2：ModeAI + BrakeAI + IdleAI + KingdomAIProvider（4 个小类）
├── Commander.ts        # Round 2：class PlaceholderCommander implements ICommander
└── KingdomWorld.ts     # Round 2：class KingdomWorld implements IWorld（唯一编排器）

tests/kingdom/
├── types.test.ts       # Round 1：枚举钉版 + 编译期契约断言
├── harness.ts          # Round 2：真实 Rapier + 真实 ControlSystem 的小场景夹具
├── time.test.ts        # Round 2：1×/24×、子步数、游戏分钟、边缘反弹
├── march.test.ts       # Round 2：25m 圆、10m/h、行军回血
├── battle.test.ts      # Round 2：<80m 触发、加权中心、离区/回区、合并、结束、重战锁定
├── city.test.ts        # Round 2：空城接管、城池战斗结算、驻军上限、训练 96/72h、驻扎回血
├── vision.test.ts      # Round 2：100m/150m 并集、无记忆
├── terrain.test.ts     # Round 2：静态地形挡移动 + 挡射线（真实 Rapier）
└── scenario.test.ts    # Round 2：默认场景完整性 / id 唯一 / 边界
```

> `src/kingdom/` 不再拆子目录：`types.ts` 仍遵守「每文件夹一个 `types.ts`」。Round 2 若需要 `IMutableArmy`/`IMutableCity` 等**非契约内部类型**，按 Phase 3 先例追加到同一 `types.ts` 末尾并标注「内部类型，非门禁契约」。

### Pattern 1: 一个全局物理世界 + 宏观军队

**What:** 单位从生成到死亡始终是同一个 `IPhysicsWorld` 里的动态复合刚体；`IArmy` 只是中心/朝向/名册/状态的宏观容器，不进入物理、也不进入战斗成员判定。
**When to use:** 所有王国层运行；这是 D-01 的直接实现。
**Example:**

```ts
// World 构造：一个 PhysicsWorld + 一个 ControlSystem，全阶段复用
const physics = new PhysicsWorld({ dt: DT, geometry: DEFAULT_GEOMETRY }, rng);
const terrain = physics as unknown as IStaticObstacleWorld; // 同一实例（见 Pattern 7）
const battles = new BattleSystem(physics, config.unitWeight);
const sink = new BattleDamageSink(physics, battles, controlLookup);
const control = new ControlSystem(physics, sensingWorld, aiProvider, sink);
```

**构造/绑定顺序（避免循环依赖）：**

1. `PhysicsWorld`（全局单位物理）+ `IStaticObstacleWorld`（同一实例）。
2. `KingdomSensingWorld`（地图 bounds + 地形矩形 + blocker 圆；不依赖 control）。
3. `BattleSystem`（需要 `physics` + 权重函数 + `() => time.getGameMinutes()`；军队/城池/单位/阵营查询由 World 的只读视图或 `() => this.control` 延迟绑定；构造时注入 `onEnded(battle)` 回调，World 在回调里做城池结算/重组/重战锁定）。
4. `BattleDamageSink`（只需 `physics` + `battles`；`IDamageContext` 已带 `IUnit`/`teamId`）。
5. `KingdomWorld` 自己实现 `IUnitModeSource`（模式/阵型/战斗区 map 先初始化）。
6. `KingdomAIProvider(modes)` → `ControlSystem(physics, sensing, provider, sink)`。
7. World 把 `control` 赋给延迟绑定闭包；此后 `BattleSystem` 可解析单位/阵营。

**关键不变量：**

- `unitId` 是唯一身份；`factionId` 在 `registerUnit` 时作为 `teamId` 注入，绝不写回 `IUnit`。
- 军队名册是 `unitId[]`；单位死亡后由 `ControlSystem` 注销，World 在子步末剪枝。
- 物理注册快照在注册时冻结（Phase 3 D-19 / WR-01）；升级不刷新伤害输入，本阶段继续接受。

### Pattern 2: 单位级战斗成员 + 80m 正方形 + 加权中心

**What:** 军队中心距离 <80m 是**触发条件**；触发后战场成员是**单位集合**；战斗区是当前区内成员加权中心周围的 ±40m 正方形；单位进出完全按位置判定。
**When to use:** 所有军队战斗与城池战斗；D-02/D-04/D-14/D-17/D-19/D-20 的共同实现。

**每子步 `BattleSystem.reconcile()` 的顺序（推荐）：**

1. **剪枝**：移除已死亡/已注销的单位。
2. **离区**：对每个活跃战场，若成员在正方形外（可加 1m 迟滞），移出成员集，标记该单位「已离场」→ `UnitControlMode.Brake`。
3. **加入**：对每个不在任何战场的单位，若其位置落在某活跃战场正方形内，加入该战场。
4. **触发新战场**：
   - 不同势力、双方军队中心 <80m、且该军队对未被重战锁定 → 初始成员 = 双方军队的全部存活单位（随后被正方形剪枝）。
   - 不同势力、军队中心到敌方城池点 <80m、城池有**实际驻扎**的存活驻军（驻军军队 `Garrisoned` 且中心在城点附近）→ 初始成员 = 攻方军队 + 驻军军队的全部存活单位。
   - 空城（无存活驻军，或驻军只是路过/尚未抵达）→ 不建战场，直接接管。
5. **合并**：正方形重叠的活跃战场合并；保留较早的 `battleId`，被吸收者发出 `Ended` 事件并带 `mergedIntoBattleId`。
6. **重算中心**：对区内成员做加权平均（默认权重 = 等级）；权重非有限/非正 → 按 1；总和为 0 → 保持上一中心。
7. **结束**：区内存活成员只剩一个阵营（或 0 个）→ `Ended`；城池战进入战后结算；写入重战锁定。

**城池入驻不是瞬移：** 胜方按 `GarrisonSelector` 选出单位后，把它们拆成一个**新军队**（新 `armyId`），给该军队 `ArmyOrderKind.Garrison`（目标城池）；军队中心/单位先按 `March` 走到城池点，进入一个小半径（如 5m）后才把状态设为 `Garrisoned`、单位转 `Idle`。若在战斗结束瞬间直接设为 `Garrisoned`，单位会散落在 80m 战斗区里，看起来不像“驻军”。

**结束回调：** `BattleSystem` 只负责判定 `Ended`，通过构造时注入的 `onEnded(battle)` 通知 World；World 在回调中做城池接管/入驻选择/败方重组/重战锁定/`Reorganizing` 状态与中心重算。这样 `BattleSystem` 不需要知道军队/城池的写操作，也不产生循环依赖。

```ts
// 加权中心（核心 6 行）
let sw = 0, sx = 0, sy = 0;
for (const id of members) {
    const unit = control.getUnit(id);
    const state = physics.getUnitState(id);
    if (unit === null || state === null || !unit.isAlive()) continue;
    let w = weightOf(unit);
    if (!Number.isFinite(w) || w <= 0) w = 1;
    sw += w; sx += w * state.x; sy += w * state.y;
}
const center = sw > 0 ? { x: sx / sw, y: sy / sw } : previousCenter;
```

**成员判定：**

```ts
// 正方形（世界轴对齐，不旋转）
function inside(cx: number, cy: number, h: number, x: number, y: number): boolean {
    return Math.abs(x - cx) <= h && Math.abs(y - cy) <= h;
}
```

**`IDamageSink` 过滤流程（D-15/D-19）：**

```ts
applyDamage(ctx: IDamageContext): void {
    if (ctx.attackerTeamId === ctx.defenderTeamId) return;          // 同队免伤
    if (!ctx.defender.isAlive()) return;                            // 同 tick 已死
    const battle = battles.getBattleForUnit(ctx.event.attackerId);
    if (battle === null) return;                                    // 攻方不在战斗
    if (battles.getBattleForUnit(ctx.event.defenderId) !== battle) return; // 不同战场
    const a = physics.getUnitState(ctx.event.attackerId);
    const d = physics.getUnitState(ctx.event.defenderId);
    if (a === null || d === null) return;
    const c = battle.getCenter();
    const h = battle.getHalfExtent();
    if (!inside(c.x, c.y, h, a.x, a.y)) return;                     // 攻方离区
    if (!inside(c.x, c.y, h, d.x, d.y)) return;                     // 守方离区
    // takeDamage + 攻击/防御经验 + 击杀经验（镜像 tests/control/damage-sink.ts）
}
```

**为什么不需要给 `IDamageEvent` 加战斗字段：** `ControlSystem` 只把已解析的 `IDamageContext` 交给 sink；sink 自己持有 `BattleSystem` 与 `IPhysicsWorld`，因此战斗成员/在区判定完全在王国层完成，Phase 2/3 事件形状不动。

### Pattern 3: 复合 `ModeAI` —— 不改 Phase 3 契约的 AI 切换

**What:** Provider 为每个单位创建一个 `ModeAI`；`ModeAI` 内部持有 `MarchAI`/`BattleAI`/`BrakeAI`/`IdleAI`，每次 `decide(observation)` 从王国层注入的 `IUnitModeSource` 读取该单位当前模式并委托。
**When to use:** 所有单位；D-11/D-14 的唯一实现方式。

```ts
// src/kingdom/ModeAI.ts（Round 2）
export class ModeAI implements IUnitAI {
    constructor(
        private readonly unitId: number,
        private readonly modes: IUnitModeSource,
        private readonly march: IUnitAI,
        private readonly battle: IUnitAI,
        private readonly brake: IUnitAI,
        private readonly idle: IUnitAI
    ) {}

    decide(observation: IUnitObservation): IUnitAction {
        switch (this.modes.getMode(this.unitId)) {
            case UnitControlMode.March: return this.march.decide(observation);
            case UnitControlMode.Battle: return this.battle.decide(observation);
            case UnitControlMode.Brake: return this.brake.decide(observation);
            case UnitControlMode.Idle: return this.idle.decide(observation);
            // 数字枚举运行时可能是任意数：保守回退到 Idle，绝不抛错中断 tick。
            default: return this.idle.decide(observation);
        }
    }
}

export class KingdomAIProvider implements IUnitAIProvider {
    constructor(private readonly modes: IUnitModeSource) {}
    create(unitId: number, _unit: IUnit): IUnitAI {
        return new ModeAI(unitId, this.modes,
            new MarchAI(unitId, this.modes),
            new BattleAI(unitId, this.modes),
            new BrakeAI(), new IdleAI());
    }
    destroy(_unitId: number): void { /* 无内部状态需释放；保留接缝 */ }
}
```

**生命周期与延迟：**

- `Provider.create` 在 `ControlSystem.registerUnit` 时调用一次；`destroy` 在注销/`dispose` 时调用。
- 模式切换发生在两子步之间；由于 AI 每 6 个物理子步才决策一次，切换最多有 5 个子步（5 游戏分钟）延迟。对「离区刹车」可接受，且不需要改 `IControlSystem`。
- 模式源由 World 实现：`getMode` 读取 `Map<unitId, UnitControlMode>`；`getFormationSlot` 读取军队阵型；`getBattleArea` 读取 `BattleSystem`。
- **不要**在 `ModeAI` 里保存模式；模式属于 World/BattleSystem，`ModeAI` 只做委托。

**四种模式的行为边界：**

| 模式 | 何时 | 行为 |
|------|------|------|
| `March` | 军队 Marching/Reorganizing，且单位未在战斗区 | 追阵型槽位 + 轻微地形避障；朝向沿军队 heading；无技能意图 |
| `Battle` | 单位在活跃战场区内 | 过滤到本战斗区的 `DefaultUnitAI` 包装（追击/冲撞/低血撤退）；技能意图继续输出但 Phase 4 不执行 |
| `Brake` | 单位曾参战但已离区 | 速度误差控制到 0；不追击、不使用技能；若战场移回则 World 改回 `Battle` |
| `Idle` | 军队 Garrisoned | 零动作（不施力/力矩，避免唤醒睡眠刚体） |

### Pattern 4: 时间 = 子步，不是可变 dt

**What:** 一个物理子步恒为 `DT = 1/60 s`，语义上对应 **1 游戏分钟**；外层 `IWorld.tick()` 在 1× 跑 1 个子步、24× 跑最多 24 个子步。物理 dt 永不改变。
**When to use:** 所有时间推进；D-07/D-08/D-09/D-10 的唯一实现方式。

```ts
// KingdomWorld.tick()（Round 2 形状）
tick(): IWorldTickResult {
    const start = this.time.getGameMinutes();
    const maxSubsteps = this.battles.hasActiveBattle() ? 1 : this.time.getSubstepsPerTick(); // 1 or 24
    let steps = 0;
    while (steps < maxSubsteps) {
        this.stepSubstep(); // +1 game minute +1 control.tick()
        steps += 1;
        // 24× 途中一旦有战斗触发，立即切 1×（D-09）
        if (maxSubsteps > 1 && this.battles.hasActiveBattle()) break;
    }
    // 本 tick 结束时重算倍率：战斗可能在本 tick 内开始/结束
    const rate = this.battles.hasActiveBattle()
        ? TimeRate.Normal
        : TimeRate.Fast;
    this.time.setRate(rate);
    return { gameMinutes: this.time.getGameMinutes() - start, rate };
}
```

> **注意：** 这里的 1×/24× 是「外层 tick 跨多少游戏时间」，不是「与真实秒对齐」。D-07 明确没有 wall-clock tickrate；模拟按 CPU 能跑多快就跑多快。Phase 5 的渲染循环 / Phase 6 的录制节奏决定外层 tick 何时发生；成片时间戳由 `ITimeSystem`/战斗事件提供，而不是由真实秒推算。

**推导（全部按游戏时间）：**

| 量 | 1×（有战斗） | 24×（无战斗） |
|----|--------------|----------------|
| 外层 tick | 1 游戏分钟 | 24 游戏分钟 |
| 物理子步数 | 1 | 24 |
| 每子步物理 dt | 1/60 s | 1/60 s（不变） |
| 军队中心位移/子步 | 10 m/h ÷ 60 = **0.1667 m** | 同左（0.1667 m） |
| 行军回血/子步 | 1/h ÷ 60 = **1/60 HP** | 同左 |
| 驻扎回血/子步 | 2/h ÷ 60 = **2/60 HP** | 同左 |
| 训练进度/子步 | 1 游戏分钟 | 1 游戏分钟 |
| AI 决策 | 每 6 子步 = 6 游戏分钟 = 0.1 游戏小时 | 同左（无战斗 AI 实际不跑） |

> 24× 的 CPU 成本是 24 个物理子步/外层 tick；但单位数只有数十，跨完整 100 游戏小时地图也只有 6000 个子步。`SUBSTEPS_FAST = 24` 写在 `constants.ts` 里可校准；若实测性能不足，可降为 6/12，但外层 tick 的游戏分钟数会同比减少（相当于 6×/12×），需同步校准战略计时——这是 D-10 允许的纯实现选择。

### Pattern 5: 行军阵型 —— 槽位 + 速度误差 + 射线避障

**What:** `MarchAI` 为每个单位计算一个确定性阵型槽位（军队中心 25m 圆内的均匀圆盘分布），用速度误差控制追槽位，并对近距射线方向加一个排斥项；不使用行为树、不追击敌人。
**When to use:** `ArmyState.Marching` / `Reorganizing`，且单位不在战斗区。

```ts
// 槽位（World 每子步算好，ModeSource 提供给 MarchAI）
const angle = armyHeading + (Math.PI * 2 * index) / count;
const radius = ARMY_FORMATION_RADIUS * Math.sqrt((index + 0.5) / count); // 均匀铺满 25m 圆
const slotX = centerX + Math.cos(angle) * radius;
const slotY = centerY + Math.sin(angle) * radius;

// MarchAI 期望速度（速度误差控制，避免 Rapier 无阻尼导致持续加速）
const dx = slotX - obs.motion.x;
const dy = slotY - obs.motion.y;
const dist = Math.hypot(dx, dy);
const catchUp = Math.min(dist * MARCH_POSITION_GAIN, MARCH_MAX_SPEED); // 上限防穿墙
let desiredX = (dx / dist) * catchUp + armyVelocityX;
let desiredY = (dy / dist) * catchUp + armyVelocityY;

// 简易避障：64 条射线中取最近几条，反方向加力（地形只在城池附近，场景留缺口）
for (let i = 0; i < RAY_COUNT; i += 1) {
    const d = obs.rayDistances[i];
    if (d < MARCH_AVOID_DISTANCE) {
        const a = (Math.PI * 2 * i) / RAY_COUNT;
        const push = (1 - d / MARCH_AVOID_DISTANCE) * MARCH_AVOID_STRENGTH;
        desiredX -= Math.cos(a) * push;
        desiredY -= Math.sin(a) * push;
    }
}
// force = (desired − currentVelocity) · mass · gain，再按 MAX_FORCE_MAGNITUDE 钳制
```

**边缘反弹（D-12）：** 中心撞到 `[margin, width-margin]` / `[margin, height-margin]` 时反射 heading，并**清除当前 order 的目标点**（否则下一子步会重新朝外瞄准、永久卡在边缘）；军队沿反射后的方向继续前进，直到指挥官下新指令。`margin = ARMY_FORMATION_RADIUS = 25`，保证 25m 圆内的单位仍在图内。

**关键风险：** 军队中心是宏观点，可以穿过地形；`MarchAI` 的避障是局部的，不保证绕过一面长墙。Phase 4 的应对是**场景设计**：城池附近地形留一个明显缺口，且不生成全地图迷宫。**不做 A*/导航网格**（anti-over-engineering；D-27 只要求阻挡，不要求寻路）。

### Pattern 6: 查询式视野（100m / 150m 并集）

**What:** 每次查询实时计算：己方所有军队中心 100m + 己方所有城池点 150m 的并集；己方实体永远可见；敌方军队若中心或任一单位在任一圆内即可见；不做历史/记忆。
**When to use:** `IWorld.getVisibleArmies/getVisibleCities/getVisibleUnitIds`；Phase 7 指挥官与信息申请直接消费。

```ts
private sources(factionId: number): { x: number; y: number; r2: number }[] {
    const sources = [];
    for (const army of this.armiesOf(factionId)) {
        const c = army.getCenter();
        sources.push({ x: c.x, y: c.y, r2: ARMY_VISION_RADIUS ** 2 });
    }
    for (const city of this.citiesOf(factionId)) {
        const p = city.getPosition();
        sources.push({ x: p.x, y: p.y, r2: CITY_VISION_RADIUS ** 2 });
    }
    return sources;
}

private visibleAt(sources: { x: number; y: number; r2: number }[], x: number, y: number): boolean {
    for (const s of sources) {
        const dx = x - s.x, dy = y - s.y;
        if (dx * dx + dy * dy <= s.r2) return true;
    }
    return false;
}
```

复杂度：`O(F × (A + C) × U)`。数十单位 + 少量城池，完全可接受；不需要空间索引。

### Pattern 7: 静态地形接缝 —— 最小、加性、可测

**推荐（门禁决策 G-2）：** 在 `src/physics/types.ts` **新增**（不改 `IPhysicsWorld` 任何既有成员）：

```ts
// src/physics/types.ts（Round 2 追加；IPhysicsWorld 保持逐字不变）
export interface IStaticObstacleSpec {
    readonly x: number;
    readonly y: number;
    readonly halfWidth: number;
    readonly halfHeight: number;
}

export interface IStaticObstacleWorld {
    /** 在同一 Rapier world 中创建一个固定 cuboid；返回 obstacleId。 */
    addStaticObstacle(spec: IStaticObstacleSpec): number;
    /** 移除一个静态障碍；未知 id 为空操作。 */
    removeStaticObstacle(obstacleId: number): void;
}
```

`PhysicsWorld implements IPhysicsWorld, IStaticObstacleWorld`，新增 2 个方法：

```ts
addStaticObstacle(spec: IStaticObstacleSpec): number {
    const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y)
    );
    const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(spec.halfWidth, spec.halfHeight),
        body
    );
    // 不加入 this.index：地形 handle 在 tick() 的 index.get() 处自然被跳过（无接触/无伤害）
    this.obstacles.set(this.nextObstacleId, { body, collider });
    return this.nextObstacleId++;
}
```

**为什么这是最小接缝：**

- `IPhysicsWorld` 的 8 个方法逐字不变；`ControlSystem` 仍只依赖 `IPhysicsWorld`。
- 地形与单位在**同一 Rapier world**，固定 cuboid 真正阻挡动态单位（探针已证）。
- 不把地形放进 `PhysicsWorld.index`，所以不会产生 `IContactEvent`/`IDamageEvent`（`tick()` 对未知 handle 直接 `return`）。
- `dispose()` 释放 world 时地形一并释放；`removeStaticObstacle` 只用于测试/动态场景。
- 唯一成本是 `src/physics/types.ts` + `src/physics/PhysicsWorld.ts` 的**加性**改动。若用户坚持「`src/physics/*` 零改动」，唯一不重复的替代是 Phase 4 自己拥有一个 Rapier world 并重实现单位物理（约 250 行，接触/伤害管线分叉）——**不推荐**；把地形伪装成动态单位——**拒绝**。

**测试（Round 2 `tests/kingdom/terrain.test.ts`）：**

1. 真实 `PhysicsWorld` + 新接口；墙在 `(5,0)`、半宽 0.5/半高 5；单位在 `(0,0)`。
2. 每步 `applyForce(unitId, 5000, 0)`，跑 120 步；断言单位中心 `x ≈ 4.0`（墙左面 4.5 − 本体半径 0.5），且**没有** unit 伤害事件。
3. `KingdomSensingWorld.castRayFan(0, 0, 50, [])` 的第 0 条（+x）≈ 4.5。
4. `removeStaticObstacle` 后再投射线 → 第 0 条 = 50（maxDistance）。
5. `pnpm test` 的 Phase 2 套件仍全绿（证明 `IPhysicsWorld` 语义未变）。

### Anti-Patterns to Avoid

- **把军队塞进物理层或 `IUnit`：** 军队是宏观容器（D-01）；战斗成员是单位集合（D-02）。
- **在 `ControlSystem` 或 AI 里做战斗成员/同队过滤：** 规则属于 `IDamageSink`（Phase 3 D-10 / Phase 4 D-15/D-19）。
- **在 `BattleSystem` 里做伤害公式：** 伤害已在 `PhysicsWorld.tick()` 算好；王国层只做过滤与 `takeDamage`/经验。
- **改变 `world.timestep` 来实现 24×：** 破坏 Phase 2 冻结语义且 Rapier 不稳定；改变子步数。
- **在 24× 时把战略位移 ×24 却只跑 1 个物理子步：** 单位跟不上中心（240 m/s），阵型撕裂/穿墙。
- **为地形另建一个 Rapier world：** 两个 world 的单位无法与地形碰撞。
- **把地形注册成动态单位：** 只有球碰撞体、进入控制目录、质量近似而非真静态。
- **给 `IUnit` 加 `factionId`/`armyId`：** 阵营/军队映射由王国层持有；`teamId` 在注册时注入（Phase 3 D-07）。
- **在 Phase 4 保存视野历史：** D-25 明确无记忆；历史是 Phase 7。
- **把 LLM / 射弹 / 技能物理塞进 Phase 4：** Phase 7 / 后续；本阶段近战碰撞为主。
- **字符串枚举 / JS getter-setter / `#` 私有字段：** AGENTS 强制。
- **用 wall-clock 计时：** 所有战略计时只用 `ITimeSystem.getGameMinutes()`。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 物理步进/复合刚体/伤害公式 | Phase 4 自建物理循环或伤害公式 | `PhysicsWorld` + `src/physics/damage.ts`（已被 `PhysicsWorld` 消费） | 冻结契约已实现；重写会分叉破甲/抖动/Δv 语义 |
| 单位生成属性 | 自己写随机/属性表 | `spawnUnit(classKind, rng)` + `CLASS_DEFS` | 正态 σ=均值/8、装备/等级表已冻结（KING-05 明确要求） |
| 随机源 | 新 `Math.random` 包装 | `IRng` / `MathRng` / `sampleNormal`（`src/common/`） | AGENTS §9；测试可注入 `mulberry32` |
| 单位 AI 执行器 | 在 World 里直接 `applyForce` | `ControlSystem` + `IUnitAI`（`ModeAI` 复合） | Phase 3 已有决策节奏、动作重施加、钳制、伤害路由、死亡注销 |
| 64 射线几何 | 引入碰撞检测库 / 每决策 64 次 Rapier 查询 | 扩展 `tests/control/arena.ts` 的解析「射线×AABB + 射线×圆」 | 地形是少量 AABB；解析法零分配、可单测 |
| 类型契约测试 | 自定义 `tsc` 解析 | `expectTypeOf` + `pnpm typecheck` | 仓库既有范式（`tests/control/types.test.ts`） |
| 行为树 / GOAP / 导航网格 | 引入外部 BT/路径库 | `MarchAI` 的槽位 + 速度误差 + 射线排斥；`BattleAI` 复用 `DefaultUnitAI` | 项目明确排除 GOAP/HTN/MCTS；Phase 4 行军是程序控制，不是行为树 |
| 视频/渲染/统计 | Phase 4 提前做 | Phase 5/6/8 | 本阶段只提供 `IWorld` 与战斗队列/时间戳读取面 |

**Key insight:** Phase 4 的复杂度在**契约边界与状态机**（战斗成员、时间子步、AI 模式、城池结算），不在算法。任何“帮我们抽象”的库都会把冻结契约之外的耦合带进来；唯一值得新增的数学是「射线×AABB」「加权中心」「正方形成员判定」「阵型槽位」。

## Recommended Contract Shape（Round 1 门禁物）

> 以下为 `src/kingdom/types.ts` 的**完整建议形状**。全部为声明；`import type` 仅引用冻结类型；无算法、无类、无顶层 `const`。数字枚举成员值是本提案的一部分，Round 1 测试会逐字钉版。

```ts
// src/kingdom/types.ts — Round 1（仅声明）
import type { IUnitBrief } from '@/control/types';
import type { ClassKind, IUnit } from '@/units/types';

/** 时间倍率：枚举值即倍率本身（1× / 24×）。 */
export enum TimeRate {
    /** 战斗进行中：外层 tick = 1 游戏分钟，1 个物理子步。 */
    Normal = 1,
    /** 场上无任何战斗：外层 tick = 24 游戏分钟，24 个物理子步。 */
    Fast = 24
}

/** 军队宏观状态（不是战斗层实体；D-01）。 */
export enum ArmyState {
    /** 正在行军：中心按 10 m/h 移动，单位追阵型槽位。 */
    Marching = 0,
    /** 驻扎在城池中：中心固定，单位 Idle，回血 2/h。 */
    Garrisoned = 1,
    /** 至少一个单位在活跃战场中：中心冻结。 */
    InBattle = 2,
    /** 战斗结束、幸存单位重新集结：中心重算，随后恢复行军。 */
    Reorganizing = 3
}

/** 单位级控制模式：由王国层写入，ModeAI 读取并委托（不改 Phase 3 契约）。 */
export enum UnitControlMode {
    /** 程序阵型控制（MarchAI）。 */
    March = 0,
    /** 战斗 AI（BattleAI，过滤到本战斗区）。 */
    Battle = 1,
    /** 离区刹车（BrakeAI）：逐渐停止，不再决策/伤害。 */
    Brake = 2,
    /** 驻扎待命（IdleAI）：零动作。 */
    Idle = 3
}

/** 指挥官给军队的宏观指令种类（D-29）。 */
export enum ArmyOrderKind {
    /** 沿目标点直线行军；无目标时保持当前朝向。 */
    March = 0,
    /** 向敌方城池行军并在 <80m 触发城池战斗。 */
    AttackCity = 1,
    /** 返回己方城池并驻扎。 */
    Garrison = 2,
    /** 原地待命。 */
    Hold = 3
}

/** 战场生命周期（D-03/D-04）。 */
export enum BattleState {
    /** 正在推进。 */
    Active = 0,
    /** 已结束（保留在完成队列中供播放）。 */
    Ended = 1
}

/** 战斗触发来源（D-16）。 */
export enum BattleTriggerKind {
    /** 军队中心到军队中心 <80m。 */
    Army = 0,
    /** 军队中心到敌方城池点 <80m 且有驻军。 */
    City = 1
}

/** 战斗队列事件种类（D-03）。 */
export enum BattleLifecycleKind {
    /** 战场开始。 */
    Started = 0,
    /** 战场结束（含被合并）。 */
    Ended = 1
}

/** 城池规模（决定训练时长/默认驻军上限）。 */
export enum CityKind {
    /** 普通城：96h / 1 单位。 */
    Normal = 0,
    /** 主城：72h / 1 单位。 */
    Capital = 1
}

/** 二维点/向量（王国层读取面；Phase 5 可直接复用）。 */
export interface IVec2 {
    /** x 坐标（米）。 */
    readonly x: number;
    /** y 坐标（米）。 */
    readonly y: number;
}

/** 地图尺寸（米）。 */
export interface IMapBounds {
    /** 地图宽度。 */
    readonly width: number;
    /** 地图高度。 */
    readonly height: number;
}

/** 轴对齐矩形地形（挡移动 + 挡射线；D-27）。 */
export interface ITerrainRect {
    /** 中心 x。 */
    readonly x: number;
    /** 中心 y。 */
    readonly y: number;
    /** 半宽。 */
    readonly halfWidth: number;
    /** 半高。 */
    readonly halfHeight: number;
}

/** 势力：拥有军队与城池（KING-08）。 */
export interface IFaction {
    /** 势力 id；同时作为 Phase 3 注册的 teamId。 */
    getId(): number;
    /** 显示名。 */
    getName(): string;
    /** 当前军队 id 列表（只读快照）。 */
    getArmyIds(): readonly number[];
    /** 当前城池 id 列表（只读快照）。 */
    getCityIds(): readonly number[];
}

/** 军队：宏观容器，不是物理/战斗实体（D-01）。 */
export interface IArmy {
    /** 军队 id（跨战斗持久，D-05）。 */
    getId(): number;
    /** 所属势力 id。 */
    getFactionId(): number;
    /** 中心位置（米）。 */
    getCenter(): IVec2;
    /** 朝向弧度（0 = +x，逆时针）。 */
    getHeading(): number;
    /** 宏观状态。 */
    getState(): ArmyState;
    /** 当前单位 id 名册（只读快照；死亡单位会被 World 剪枝）。 */
    getUnitIds(): readonly number[];
    /** 驻扎城池 id；未驻扎时为 `undefined`（缺失字面量）。 */
    getCityId(): number | undefined;
    /** 当前宏观指令；无指令时为 `null`（缺失对象）。 */
    getOrder(): IArmyOrder | null;
}

/** 城池：地图上的点，无物理/射线实体（D-26）。 */
export interface ICity {
    /** 城池 id。 */
    getId(): number;
    /** 归属势力 id；无主时为 `undefined`（缺失字面量）。 */
    getFactionId(): number | undefined;
    /** 城池点位置（米）。 */
    getPosition(): IVec2;
    /** 规模。 */
    getKind(): CityKind;
    /** 驻扎军队 id；无驻军时为 `undefined`（缺失字面量）。 */
    getGarrisonArmyId(): number | undefined;
    /** 驻军上限。 */
    getGarrisonCap(): number;
    /** 训练职业。 */
    getTrainingClass(): ClassKind;
    /** 当前训练进度（游戏分钟；达到 96h/72h 时产出）。 */
    getTrainingProgressMinutes(): number;
}

/** 时间系统：只读 + 由 World 推进（D-07/D-08）。 */
export interface ITimeSystem {
    /** 自开局累计的游戏分钟。 */
    getGameMinutes(): number;
    /** 当前全局倍率。 */
    getRate(): TimeRate;
    /** 外层 tick 序号（不是 Phase 3 的物理/控制 tick；后者见 `IUnitObservation.tick`）。 */
    getTickIndex(): number;
    /** 当前倍率下外层 tick 的物理子步数（1 或 24）。 */
    getSubstepsPerTick(): number;
    /** 推进游戏分钟（仅 World 调用；集中计时，杜绝 wall-clock）。 */
    advance(gameMinutes: number): void;
    /** 设置当前全局倍率（仅 World 调用；D-09 有战斗即 1×）。 */
    setRate(rate: TimeRate): void;
}

/** 一场战斗的只读视图（D-02/D-03/D-17）。 */
export interface IBattle {
    /** 战斗 id（合并时保留较早者）。 */
    getId(): number;
    /** 生命周期状态。 */
    getState(): BattleState;
    /** 触发来源。 */
    getTriggerKind(): BattleTriggerKind;
    /** 城池战对应的城池 id；军队战为 `undefined`。 */
    getCityId(): number | undefined;
    /** 当前加权中心（米）。 */
    getCenter(): IVec2;
    /** 战斗区半边长（米），默认 40（即 80m 正方形）。 */
    getHalfExtent(): number;
    /** 当前区内成员单位 id（只读快照）。 */
    getMemberUnitIds(): readonly number[];
    /** 开始时的游戏分钟。 */
    getStartedAtMinutes(): number;
    /** 结束时的游戏分钟；未结束为 `undefined`。 */
    getEndedAtMinutes(): number | undefined;
}

/** 战斗队列事件（D-03；Phase 6/7 消费）。 */
export interface IBattleLifecycleEvent {
    /** 事件种类。 */
    readonly kind: BattleLifecycleKind;
    /** 战斗 id。 */
    readonly battleId: number;
    /** 事件发生的游戏分钟。 */
    readonly gameMinutes: number;
    /** 被合并进的战斗 id；仅 Ended 且因合并而结束时存在。 */
    readonly mergedIntoBattleId?: number;
}

/** 战斗容器：成员判定、加权中心、队列（D-02/D-03/D-04）。 */
export interface IBattleSystem {
    /** 推进一个物理子步的成员/中心/结束判定（由 World 每子步调用）。 */
    tick(): void;
    /** 当前是否有任一活跃战斗（决定全局 1×/24×，D-09）。 */
    hasActiveBattle(): boolean;
    /** 单位当前所在活跃战斗；不在战场时为 `null`（缺失对象）。 */
    getBattleForUnit(unitId: number): IBattle | null;
    /** 活跃战斗列表（按开始顺序）。 */
    listActiveBattles(): readonly IBattle[];
    /** 已完成战斗列表（按结束顺序；供 Phase 6/7 播放）。 */
    listCompletedBattles(): readonly IBattle[];
    /** 取走自上次调用以来的生命周期事件（按发生顺序）。 */
    drainEvents(): readonly IBattleLifecycleEvent[];
}

/** 指挥官给一支军队的宏观指令（D-29）。 */
export interface IArmyOrder {
    /** 目标军队 id。 */
    readonly armyId: number;
    /** 指令种类。 */
    readonly kind: ArmyOrderKind;
    /** 目标点 x；March/AttackCity 可选。 */
    readonly targetX?: number;
    /** 目标点 y；March/AttackCity 可选。 */
    readonly targetY?: number;
    /** 目标城池 id；AttackCity/Garrison 使用。 */
    readonly cityId?: number;
    /** 开始生效的游戏分钟；省略表示立即。 */
    readonly startAtMinutes?: number;
}

/** 指挥官决策输入（受限视野；Phase 7 可替换为 LLM 输入）。 */
export interface ICommanderContext {
    /** 本势力 id。 */
    readonly factionId: number;
    /** 当前游戏分钟。 */
    readonly gameMinutes: number;
    /** 本势力军队。 */
    readonly armies: readonly IArmy[];
    /** 本势力城池。 */
    readonly cities: readonly ICity[];
    /** 当前可见的敌方军队（只读视图，含中心/朝向/名册）。 */
    readonly visibleEnemyArmies: readonly IArmy[];
    /** 当前可见的敌方城池（只读视图，含归属/驻军/训练）。 */
    readonly visibleEnemyCities: readonly ICity[];
    /** 当前可见的敌方单位简讯（HP/等级/位置/装备）。 */
    readonly visibleEnemyUnits: readonly IUnitBrief[];
}

/** 占位/可替换指挥官（D-29；Phase 7 整体替换）。 */
export interface ICommander {
    /** 基于受限视野返回本 tick 的宏观指令（可为空）。 */
    decide(context: ICommanderContext): readonly IArmyOrder[];
}

/** 战斗区加权中心权重；默认实现返回等级（D-18）。 */
export type UnitWeight = (unit: IUnit) => number;

/** 战后入驻规则；返回要留在城中的单位 id（D-22）。 */
export type GarrisonSelector = (
    city: ICity,
    candidates: readonly IUnit[]
) => readonly number[];

/** 王国层可注入策略（只留必要定制点）。 */
export interface IKingdomConfig {
    /** 战斗区权重函数；默认 `(u) => u.getAttribute(AttributeKind.Level)`。 */
    readonly unitWeight: UnitWeight;
    /** 入驻规则；默认按比例（可校准）。 */
    readonly garrisonSelector: GarrisonSelector;
    /** 每势力指挥官工厂；Phase 7 替换为 LLM 指挥官。 */
    readonly commanderFactory: (factionId: number) => ICommander;
}

/** 单位模式/阵型/战斗区读取面：ModeAI 与 BattleAI 的唯一外部状态来源。 */
export interface IUnitModeSource {
    /** 该单位当前控制模式。 */
    getMode(unitId: number): UnitControlMode;
    /** 该单位当前阵型槽位；不处于行军/集结时为 `null`（缺失对象）。 */
    getFormationSlot(unitId: number): IVec2 | null;
    /** 该单位所在活跃战场；不在战场时为 `null`（缺失对象）。 */
    getBattleArea(unitId: number): IBattle | null;
}

/** 外层 tick 结果（供 Phase 5/6 知道本帧跨了多少游戏时间）。 */
export interface IWorldTickResult {
    /** 本外层 tick 推进的游戏分钟（1 或最多 24）。 */
    readonly gameMinutes: number;
    /** 本 tick 结束时的全局倍率。 */
    readonly rate: TimeRate;
}

/** 王国世界：唯一编排器与渲染/指挥读取面（D-24）。 */
export interface IWorld {
    /** 推进一个外层 tick（1× 1 子步 / 24× 最多 24 子步）。 */
    tick(): IWorldTickResult;
    /** 时间系统只读视图。 */
    getTime(): ITimeSystem;
    /** 地图尺寸。 */
    getBounds(): IMapBounds;
    /** 地形矩形（供渲染/调试）。 */
    getTerrain(): readonly ITerrainRect[];
    /** 全部势力（上帝视角；指挥官请用可见性查询）。 */
    getFactions(): readonly IFaction[];
    /** 按 id 读取军队；不存在时 `null`（缺失对象）。 */
    getArmy(armyId: number): IArmy | null;
    /** 按 id 读取城池；不存在时 `null`（缺失对象）。 */
    getCity(cityId: number): ICity | null;
    /** 该势力当前可见的军队（含己方）。 */
    getVisibleArmies(factionId: number): readonly IArmy[];
    /** 该势力当前可见的城池（含己方）。 */
    getVisibleCities(factionId: number): readonly ICity[];
    /** 该势力当前可见的单位 id（含己方）。 */
    getVisibleUnitIds(factionId: number): readonly number[];
    /** 战斗系统只读面（队列/事件/成员）。 */
    getBattleSystem(): IBattleSystem;
    /** 下达/覆盖一条军队指令（指挥官与测试使用）。 */
    issueOrder(order: IArmyOrder): void;
    /** 释放所有内部引用（不释放外部传入的 physics/control）。 */
    dispose(): void;
}

/** 势力初始配置。 */
export interface IFactionSpawnSpec {
    /** 势力 id（同时作为 teamId）。 */
    readonly id: number;
    /** 显示名。 */
    readonly name: string;
}

/** 军队内的单位配置。 */
export interface IUnitSpawnSpec {
    /** 职业。 */
    readonly classKind: ClassKind;
    /** 数量。 */
    readonly count: number;
}

/** 军队初始配置。 */
export interface IArmySpawnSpec {
    /** 军队 id。 */
    readonly id: number;
    /** 所属势力。 */
    readonly factionId: number;
    /** 初始中心 x。 */
    readonly x: number;
    /** 初始中心 y。 */
    readonly y: number;
    /** 初始朝向弧度。 */
    readonly heading: number;
    /** 单位构成。 */
    readonly units: readonly IUnitSpawnSpec[];
}

/** 城池初始配置。 */
export interface ICitySpawnSpec {
    /** 城池 id。 */
    readonly id: number;
    /** 归属势力；省略表示无主。 */
    readonly factionId?: number;
    /** 城池点 x。 */
    readonly x: number;
    /** 城池点 y。 */
    readonly y: number;
    /** 规模。 */
    readonly kind: CityKind;
    /** 驻军上限（场景可覆盖规模默认值）。 */
    readonly garrisonCap: number;
    /** 训练职业。 */
    readonly trainingClass: ClassKind;
}

/** 可配置场景表（D-28）。 */
export interface IScenario {
    /** 地图宽（米）。 */
    readonly width: number;
    /** 地图高（米）。 */
    readonly height: number;
    /** 势力。 */
    readonly factions: readonly IFactionSpawnSpec[];
    /** 城池。 */
    readonly cities: readonly ICitySpawnSpec[];
    /** 军队。 */
    readonly armies: readonly IArmySpawnSpec[];
    /** 城池附近的可阻挡地形（轴对齐矩形）。 */
    readonly terrain: readonly ITerrainRect[];
}
```

**契约设计说明（供门禁审查）：**

1. **缺失值严格按 AGENTS §8：** id/枚举/数字缺失 → `undefined`（`ICity.getFactionId`、`ICity.getGarrisonArmyId`、`IBattle.getCityId`、`IBattle.getEndedAtMinutes`）；对象缺失 → `null`（`IArmy.getOrder`、`IBattleSystem.getBattleForUnit`、`IUnitModeSource.getFormationSlot`、`IWorld.getArmy/getCity`）。
2. **没有 getter/setter 访问器：** 全部是 `getX()` 方法（与 `IUnit.getAttribute`/`IPhysicsWorld.getUnitState` 一致），不是 JS `get`/`set`。
3. **`ITimeSystem.advance` 是唯一的可变方法：** 只由 `KingdomWorld` 调用；这样 `TimeSystem` 不必有接口外的公共成员（AGENTS §5）。
4. **`IArmy`/`ICity` 是只读视图：** Round 2 若需要 World 内部变更，按 Phase 3 先例在 `types.ts` 末尾追加非契约的 `IMutableArmy`/`IMutableCity`（`extends IArmy`/`ICity` + 内部 `update(...)` 方法），对外仍只暴露只读接口。
5. **`IWorld` 不暴露 `IControlSystem`/`IPhysicsWorld`：** 渲染/录制按需从组合根同时拿 `IWorld` + `IPhysicsWorld`（单位位置）+ `IControlSystem`（`getTeam` 颜色）；避免王国契约泄露执行器。
6. **`IVec2` 放 `src/kingdom/types.ts`：** Phase 5 会从 `IWorld`/`IArmy` 读取它，无需提升到 `src/common/`；若用户希望通用化，可在门禁改为 `src/common/types.ts`（A13）。

## Critical Contract Gaps & Gate Decisions

> 以下两项是**冻结目录的加性扩展**，Round 1 类型门禁必须明确裁决；否则 Round 2 无法同时满足 KING-03/05 与 D-27。

### G-1（阻塞）：`IUnit` 没有回血入口

**事实：** `IUnit` 只有 `takeDamage`（`src/units/types.ts:238`），`Unit.takeDamage` 对 `<= 0` 直接返回（`src/units/Unit.ts:186-195`），升级回血只在 `checkLevelUp` 内发生。**KING-03 行军回血 1/h、KING-05 驻扎回血 2/h 在当前契约上不可实现。** `[VERIFIED: src/units/types.ts:224-247; src/units/Unit.ts:186-195,297-315]`

**推荐（最小、保留 `IUnit` 不变）：**

```ts
// src/units/types.ts（Round 2 追加；IUnit 逐字不变）
export interface IHealableUnit extends IUnit {
    /** 恢复生命值；非有限/非正值忽略，结果钳制到生命上限。 */
    heal(amount: number): void;
}

// src/units/Unit.ts
export class Unit implements IUnit, IHealableUnit {
    heal(amount: number): void {
        if (!Number.isFinite(amount) || amount <= 0) return;
        const maxHealth = this.applyModifiers(AttributeKind.MaxHealth, this.maxHealth());
        this.hp = Math.min(this.hp + amount, maxHealth);
    }
}
```

- `spawnUnit` 仍返回 `IUnit`；World 在生成时把同一个对象按 `IHealableUnit` 保存（`Unit` 结构性满足），或让 `spawnUnit` 的返回类型改为 `IHealableUnit`（更干净，但会改 Phase 1 的返回类型——只影响类型，不影响调用方）。
- 测试：`tests/units/heal.test.ts`（heal 10 → +10；超过上限钳制；`NaN`/负数忽略）+ `tests/kingdom/march.test.ts` / `city.test.ts`（1/h、2/h）。
- **替代方案（若用户拒绝编辑 `src/units/`）：**
  - `IHealableUnit` 放 `src/kingdom/types.ts`、`Unit` 只加方法不声明 `implements` → 违反 AGENTS §5（公共成员不在 interface 中），不推荐。
  - 影分身 HP 装饰器 `class KingdomUnit implements IUnit`（自己维护 HP、委托其余方法、镜像升级回血）→ 复杂、易分叉，**拒绝**。
  - 把 `takeDamage` 改成接受负值 → 语义滥用，**拒绝**。
  - 砍掉回血 → 违反 KING-03/KING-05，**不可接受**。

### G-2（阻塞）：`IPhysicsWorld` 没有静态障碍接缝

**事实：** `IPhysicsWorld` 只有 8 个动态单位方法（`src/physics/types.ts:195-212`），`PhysicsWorld.world` 是 `private readonly`（`PhysicsWorld.ts:42`）。D-27 要求地形**同时挡移动与挡射线**；挡移动必须与单位在**同一 Rapier world**。 `[VERIFIED: src/physics/types.ts:195-212; src/physics/PhysicsWorld.ts:42; rapier probe]`

**推荐（最小、加性、不改 `IPhysicsWorld`）：** 按 §Pattern 7 在 `src/physics/types.ts` 新增 `IStaticObstacleSpec`/`IStaticObstacleWorld`，`PhysicsWorld implements IPhysicsWorld, IStaticObstacleWorld` 新增 `addStaticObstacle`/`removeStaticObstacle`；地形不加入 `index`，因此不产生伤害/接触事件。`IStaticObstacleSpec` 与 `ITerrainRect` 形状相同是**有意重复**：物理层不能反向 import 王国层（依赖方向必须是 kingdom → physics）；`KingdomWorld` 在场景构建时把 `ITerrainRect` 逐字段映射为 `IStaticObstacleSpec`。

**替代方案：**

| 方案 | 结论 |
|------|------|
| Phase 4 自建第二个 Rapier world | 两个 world 的单位不能与地形碰撞；除非重实现单位物理（~250 行重复，伤害/接触分叉）——不推荐 |
| Phase 4 自建完整 `IPhysicsWorld` 实现（拥有 world + 静态 + 单位） | 零改 `src/physics/`，但复制 Phase 2 复合刚体/事件/伤害管线；Phase 2 的 `PhysicsWorld` 生产路径变死代码——不推荐 |
| 把地形注册成不可移动动态单位 | 只有球碰撞体、进入控制目录、质量近似、tiling 缝隙——**拒绝** |
| 运行时反射访问 `(physics as any).world` | 零改文件但破坏封装；`PhysicsWorld` 未来重命名/改结构即断——**拒绝**（可作为最后手段，但门禁应明确否掉） |

**若用户坚持零改动：** Phase 4 无法同时满足 D-27 与 D-01；必须显式降级（例如地形只挡射线、不挡移动），并在 `04-CONTEXT.md` 记录。研究建议不要这样做。

### G-3（需确认，不阻塞类型）：初始战斗成员

**推荐：** 军队战触发时，初始成员 = **双方军队的全部存活单位**；随后 `reconcile` 立即按 80m 正方形剪枝。这样「参战单位」在触发瞬间就是两军全员，符合 D-17 字面；被剪掉的后排单位进入 `Brake`，若战斗区移回则重新加入（D-14）。**替代：** 只让触发瞬间落在中点 40m 正方形内的单位参战——更“整齐”，但引入一个规格没有的初始半径。建议 A2 采用前者。

### G-4（需确认）：默认数值

规格未给出的值全部标 `[ASSUMED]`，门禁可改：

| 常量 | 建议默认 | 依据 |
|------|----------|------|
| `CITY_GARRISON_CAP_NORMAL` | 10 | `[ASSUMED]`；场景可覆盖 |
| `CITY_GARRISON_CAP_CAPITAL` | 20 | `[ASSUMED]`；场景可覆盖 |
| 默认 `GarrisonSelector` | 存活攻方 25%，至少 1，且不超上限 | `[ASSUMED]`；D-22 允许比例 |
| `MARCH_POSITION_GAIN` / `MARCH_MAX_SPEED` | 2 / 12 m/s | `[ASSUMED]`；需实测校准 |
| `MARCH_AVOID_DISTANCE` / `MARCH_AVOID_STRENGTH` | 6 m / 0.5 | `[ASSUMED]`；城池地形留缺口 |
| `BATTLE_AREA_HYSTERESIS` | 1 m | `[ASSUMED]`；防成员抖动 |
| 边界墙厚度 | 10 m | `[ASSUMED]`；防击退出界 |

## Runtime State Inventory

> 本阶段为**新建模块**（greenfield），不是 rename/refactor/migration。逐类显式回答：

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — 无数据库/持久化；所有状态在内存中（World/Army/City/Battle）。 | 无 |
| Live service config | **None** — 无外部服务/UI 配置。 | 无 |
| OS-registered state | **None** — 无任务计划/服务/启动项。 | 无 |
| Secrets/env vars | **None** — 无密钥/环境变量；场景与数值全部在源码常量/场景表中。 | 无 |
| Build artifacts | **None** — 不新增包、不生成构建产物；`src/kingdom/` 是新源码目录。 | 无 |

**Canonical question:** 仓库内所有文件更新后，运行时系统里还有哪些旧字符串/旧路径被缓存？——Phase 4 不重命名任何现有字符串/路径，答案：**没有**（逐类已确认）。

---

## Common Pitfalls

### Pitfall 1: `IUnit` 没有 heal —— 回血需求直接撞墙
**What goes wrong:** 实现行军/驻扎回血时发现 `takeDamage` 只减不增，`amount <= 0` 被忽略；KING-03/05 无法满足。
**Why it happens:** Phase 1 的单位契约没有回血入口（`src/units/types.ts:238`；`Unit.ts:186-195`）。
**How to avoid:** 门禁 G-1 批准 `IHealableUnit extends IUnit` + `Unit.heal`（推荐），并在 Round 2 先写 heal 测试再写 World。
**Warning signs:** 试图用负伤害/升级回血/重建 Unit 来“模拟”回血。

### Pitfall 2: `IPhysicsWorld` 没有静态障碍 API
**What goes wrong:** 想让地形挡单位，却只能拿到 `registerUnit`（动态球）；另建 world 或伪装单位都会失败。
**Why it happens:** Phase 2 只做了动态单位注册（`src/physics/types.ts:195-212`；`PhysicsWorld.ts:42` 的 world 私有）。
**How to avoid:** 门禁 G-2 批准最小 `IStaticObstacleWorld`；真实 Rapier 探针已验证 fixed cuboid 阻挡动态球、`EXCLUDE_DYNAMIC` 射线过滤可用。
**Warning signs:** 单位穿墙、地形出现在 `IContactEvent`/`IDamageEvent`、或 `src/physics/types.ts` 出现对 `IPhysicsWorld` 既有成员的修改。

### Pitfall 3: 物理每 tick 清空力/力矩
**What goes wrong:** MarchAI 只在决策 tick 施力；下一 tick 力被清零，单位不再加速/停不住。
**Why it happens:** `PhysicsWorld.tick()` 末尾 `resetForces/resetTorques`（`PhysicsWorld.ts:431-434`）；`ControlSystem` 已经每 tick 重施加保持中的动作。
**How to avoid:** 把 MarchAI/BattleAI/BrakeAI 都实现为 `IUnitAI`，让 `ControlSystem` 负责每 tick 重施加；不要在 World 里另写施力循环。
**Warning signs:** 单位“脉冲式”移动；刹车不生效。

### Pitfall 4: 用可变 `world.timestep` 实现 24×
**What goes wrong:** 把 Rapier dt 改成 24/60，碰撞穿透、求解器爆炸、Phase 2 的 `DT = 1/60` 语义被破坏。
**Why it happens:** 误把“游戏时间倍率”当成“物理 dt 倍率”。
**How to avoid:** dt 恒为 1/60；24× 通过 24 个物理子步实现（Pattern 4）。每个子步仍推进 1 游戏分钟。
**Warning signs:** `world.timestep` 在运行中被赋值；单位在 24× 时穿过地形/彼此。

### Pitfall 5: 24× 只跑 1 个子步却把位移 ×24
**What goes wrong:** 军队中心一 tick 走 4m，单位需要 240 m/s 才能跟上；阵型撕裂、穿墙。
**Why it happens:** 把战略位移与物理位移混为一谈。
**How to avoid:** 每个子步中心只走 0.1667m；24× 跑 24 个子步。单位物理速度与 1× 完全一致。
**Warning signs:** 24× 时单位被甩在中心后面几十米。

### Pitfall 6: 战斗区中心每子步重算导致成员抖动
**What goes wrong:** 边缘单位一会儿在区内、一会儿在区外，中心来回跳，战斗永远结束不了/伤害时有时无。
**Why it happens:** 用“当前区内成员”重算中心，成员进出改变中心，中心又改变成员。
**How to avoid:** 先按上一中心剪枝，再用**剪枝后**成员重算中心；加 1m 迟滞（`BATTLE_AREA_HYSTERESIS`）；中心移动后离区单位进入 `Brake`，只有区移回才重新加入（D-14）。
**Warning signs:** 同一单位在 `Battle`/`Brake` 间每 tick 切换；`Ended` 事件迟迟不出现。

### Pitfall 7: 伤害过滤放错层
**What goes wrong:** 同队伤害、不同战场伤害、区外伤害仍然掉血；或者为了过滤去改 `IDamageEvent`/`ControlSystem`。
**Why it happens:** 把战斗规则写进物理/控制层。
**How to avoid:** 全部在 `BattleDamageSink.applyDamage`：同队 → 不同战场 → 攻方在区 → 守方在区；`ControlSystem` 只路由（Phase 3 D-10）。`IDamageEvent` 形状不动。
**Warning signs:** `src/control/` 或 `src/physics/` 出现战斗成员逻辑。

### Pitfall 8: 死亡单位在同一 tick 继续吃伤害/拿经验
**What goes wrong:** 一个单位本 tick 已死，后续伤害事件仍打到它；击杀经验重复累加；升级回血把死者“复活”。
**Why it happens:** `ControlSystem` 在本 tick 全部伤害路由后才批量注销；sink 只看事件不看存活。
**How to avoid:** 镜像 `tests/control/damage-sink.ts`：`defender.isAlive()` 守卫；只在存活→死亡转变时给击杀经验；攻击者死亡则不给经验。World 在子步末再剪枝名册/战斗成员。
**Warning signs:** 负血量；击杀经验翻倍；死者复活。

### Pitfall 9: 战斗成员与 `unitToBattle` 不是一对一
**What goes wrong:** 一个单位同时加入两个战场；合并时重复计数；伤害过滤拿到不同 battle 对象。
**Why it happens:** 用数组/多值映射保存成员。
**How to avoid:** `Map<unitId, battleId>` 一对一；新单位进入已有战场时先检查；合并时把被吸收战场的成员重新指向存活战场；`getBattleForUnit` 只返回活跃战场。
**Warning signs:** 同一单位出现在两个 `getMemberUnitIds`；`battles.getBattleForUnit(a) !== battles.getBattleForUnit(b)` 但伤害仍结算。

### Pitfall 10: 重战锁定写成“全局冷却”
**What goes wrong:** 战斗结束后所有军队都不能再战；或原地立刻重复触发。
**Why it happens:** D-05 是**军队对**（以及军队-城池对）的锁定，不是全局。
**How to avoid:** `Map<"armyA:armyB" | "army:city", true>`；结束时写入；每子步检查距离 >80m 才删除（重新武装）；未参战军队不受影响（D-05 原文）。
**Warning signs:** 一场战斗后全图安静；或两军原地反复开战。

### Pitfall 11: 战斗结束后军队中心停在旧位置
**What goes wrong:** 幸存单位在地图上被拉回几十米外的旧中心，或新战斗触发距离用错中心。
**Why it happens:** 军队中心是宏观量，战斗期间冻结；战斗结束后没有重算。
**How to avoid:** `Ended` 时把中心设为幸存单位的（加权）中心，状态 `Reorganizing`；下一 tick 再按新指令行军。
**Warning signs:** 战斗结束后单位集体“回拉”；军队中心与名册质心长期偏离。

### Pitfall 12: 单位从未参战却被当成“离区刹车”
**What goes wrong:** 同一军队的增援单位还没进过战斗区，就被 `Brake` 卡在战场外。
**Why it happens:** 只看 `ArmyState.InBattle`，不区分「曾参战并离区」与「从未加入」。
**How to avoid:** `exitedBattle: Set<unitId>` 只标记**曾经是成员且离区**的单位；从未加入的单位保持 `March`（追阵型槽位/战斗中心）。
**Warning signs:** 战斗越打人越少，增援永远到不了。

### Pitfall 13: 军队中心穿过地形，单位被拖进墙
**What goes wrong:** 中心是宏观点，无视地形；MarchAI 的局部避障绕不过长墙，单位卡住。
**Why it happens:** D-27 只要求地形阻挡，没有要求寻路；中心不是物理实体。
**How to avoid:** 场景设计：城池附近地形留明显缺口；MarchAI 用 64 射线做排斥；不做 A*/导航网格。若必须绕长墙，后续再加简单 waypoint（不在 Phase 4）。
**Warning signs:** 军队在城墙外原地抖动；单位被挤成一条线。

### Pitfall 14: 训练生成绕过 `ControlSystem`
**What goes wrong:** 直接 `spawnUnit` 塞进名册，但没注册物理/AI/teamId；单位不动、不受伤、不可见。
**Why it happens:** 只看到“生成单位”，忘了 Phase 3 的注册是唯一入口。
**How to avoid:** 训练产出流程固定为：`spawnUnit(class, rng)` → 分配 `unitId` → `control.registerUnit({unitId, unit, teamId: factionId, x, y})` → 加入驻军名册。注册失败要回滚（不加入名册）。
**Warning signs:** 新单位在 HUD 有但物理世界没有；`getUnitState` 返回 `null`。

### Pitfall 15: 驻军上限/训练进度边界
**What goes wrong:** 驻军已满仍在训练，产出时无处放；或进度无限累积，一旦有空位瞬间产出多个。
**How to avoid:** 驻军满时训练进度**暂停**（不累积）；产出时检查上限；进度达到阈值后减去阈值（保留余量），不要清零丢失时间。
**Warning signs:** 一次空位弹出 3 个单位；驻军超上限。

### Pitfall 16: 视野查询用了“军队中心在半径内”但漏掉单位
**What goes wrong:** 敌军中心在 101m，但其前锋单位在 99m；指挥官看不到任何东西，或只看中心导致信息不一致。
**How to avoid:** 敌方军队可见 = 中心在任一圆内 **或** 任一单位在任一圆内；单位可见按单位位置；己方永远可见（A? 推荐语义）。全部用平方距离，无 `Math.hypot` 分配。
**Warning signs:** 敌军贴脸但 `getVisibleArmies` 为空；`getVisibleUnitIds` 有单位但军队列表没有。

### Pitfall 17: 24× 的性能误判
**What goes wrong:** 24 个子步/外层 tick × 60 外层 tick/s = 1440 物理步/s；在低端机上卡顿。
**Why it happens:** 把“无战斗快进”当成“免费”。
**How to avoid:** 单位只有数十；完整 100 游戏小时地图 = 6000 子步，实测应远低于 1s。若不足，把 `SUBSTEPS_FAST` 降为 6/12（同时外层 tick 游戏分钟数同比减少，相当于 6×/12×）——D-10 允许。**不要**改 `DT`。
**Warning signs:** 24× 时帧率骤降；Rapier `timingStep()` 飙升。

### Pitfall 18: 用 wall-clock / `performance.now` 计时
**What goes wrong:** 训练/回血/指挥官节奏随真实帧率变化；无战斗快进时时间语义崩坏。
**Why it happens:** 习惯性用 `dt` 秒。
**How to avoid:** 所有战略计时只用 `ITimeSystem.getGameMinutes()`；AI 冷却用 `IUnitObservation.tick`（Phase 3 已如此）。
**Warning signs:** 同一场景两次运行训练时间不同；暂停渲染导致训练暂停。

### Pitfall 19: 城池被当成物理/射线实体
**What goes wrong:** 给城池加 collider，单位撞城；或射线被城池挡住。
**Why it happens:** 误读 D-26。
**How to avoid:** 城池只是 `ICity` 点 + 归属/驻军/训练；战斗触发用「军队中心→城池点」距离；地形是**城池附近**的独立矩形（D-27），不是城池本身。
**Warning signs:** `PhysicsWorld` 出现 city collider；`castRayFan` 命中城池点。

### Pitfall 20: 合并战斗时丢掉播放顺序
**What goes wrong:** 两个战场合并后，Phase 6 看到两个 Started 但只有一个 Ended；播放队列错位。
**How to avoid:** 保留较早 `battleId`；被吸收战场发 `Ended` 且带 `mergedIntoBattleId`；`listCompletedBattles` 按 `endedAtMinutes` 排序、id 决胜；`drainEvents` 按发生顺序。
**Warning signs:** 录像回放漏掉一场战斗；事件数与 Started/Ended 不配对。

## Code Examples

### 外层 tick + 子步（Round 2 骨架）

```ts
// src/kingdom/KingdomWorld.ts
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

### 战斗成员判定 + 结束（Round 2 骨架）

```ts
// src/kingdom/BattleSystem.ts（节选）
tick(): void {
    this.pruneDead();
    for (const battle of this.active) {
        this.removeUnitsOutside(battle);  // -> exitedBattle + Brake
        this.addUnitsInside(battle);
    }
    this.triggerArmyBattles();
    this.triggerCityBattles();
    this.mergeOverlapping();
    for (const battle of this.active) this.recomputeWeightedCenter(battle);
    for (const battle of this.active) this.endIfOneFaction(battle);
}

private endIfOneFaction(battle: Battle): void {
    const teams = new Set<number>();
    for (const id of battle.members) {
        const team = this.teamOf(id);
        if (team !== undefined) teams.add(team);
    }
    if (teams.size <= 1) {
        battle.state = BattleState.Ended;
        battle.endedAtMinutes = this.time.getGameMinutes();
        this.events.push({
            kind: BattleLifecycleKind.Ended,
            battleId: battle.id,
            gameMinutes: battle.endedAtMinutes
        });
        this.lockRetrigger(battle);
        this.settle(battle);
    }
}
```

### `MarchAI` 的动作构造（Round 2 骨架）

```ts
// src/kingdom/MarchAI.ts（节选）
decide(obs: IUnitObservation): IUnitAction {
    const slot = this.modes.getFormationSlot(this.unitId);
    if (slot === null) return ZERO_ACTION;

    const dx = slot.x - obs.motion.x;
    const dy = slot.y - obs.motion.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.min(dist * MARCH_POSITION_GAIN, MARCH_MAX_SPEED);
    const inv = dist > FORCE_EPSILON ? 1 / dist : 0;

    let desiredX = dx * inv * speed;
    let desiredY = dy * inv * speed;
    // ray avoidance (64 world-fixed rays)
    for (let i = 0; i < RAY_COUNT; i += 1) {
        const d = obs.rayDistances[i];
        if (d < MARCH_AVOID_DISTANCE) {
            const a = (Math.PI * 2 * i) / RAY_COUNT;
            const push = (1 - d / MARCH_AVOID_DISTANCE) * MARCH_AVOID_STRENGTH;
            desiredX -= Math.cos(a) * push;
            desiredY -= Math.sin(a) * push;
        }
    }

    const mass = obs.attributes[AttributeKind.Mass];
    let fx = (desiredX - obs.motion.vx) * mass * MARCH_LINEAR_GAIN;
    let fy = (desiredY - obs.motion.vy) * mass * MARCH_LINEAR_GAIN;
    const cap = Math.hypot(fx, fy);
    if (cap > MAX_FORCE_MAGNITUDE) {
        fx *= MAX_FORCE_MAGNITUDE / cap;
        fy *= MAX_FORCE_MAGNITUDE / cap;
    }
    const torque = torqueToward(obs, desiredX, desiredY); // reuse DefaultUnitAI PD idea

    return {
        forceUp: fy > 0 ? fy : 0,
        forceDown: fy < 0 ? -fy : 0,
        forceLeft: fx < 0 ? -fx : 0,
        forceRight: fx > 0 ? fx : 0,
        torqueClockwise: torque < 0 ? -torque : 0,
        torqueCounterClockwise: torque > 0 ? torque : 0,
        skillIntent: null
    };
}
```

### `BattleAI`：过滤到本战斗区的 `DefaultUnitAI` 包装

```ts
// src/kingdom/BattleAI.ts
export class BattleAI implements IUnitAI {
    constructor(
        private readonly unitId: number,
        private readonly modes: IUnitModeSource,
        private readonly inner: IUnitAI = new DefaultUnitAI()
    ) {}

    decide(obs: IUnitObservation): IUnitAction {
        const battle = this.modes.getBattleArea(this.unitId);
        if (battle === null) return ZERO_ACTION;
        const c = battle.getCenter();
        const h = battle.getHalfExtent();
        const enemies = obs.enemies.filter(e =>
            Math.abs(e.x - c.x) <= h && Math.abs(e.y - c.y) <= h
        );
        return this.inner.decide({ ...obs, enemies });
    }
}
```

### 静态障碍接缝（Round 2，G-2 批准后）

```ts
// src/physics/types.ts（追加；IPhysicsWorld 不动）
export interface IStaticObstacleSpec {
    readonly x: number;
    readonly y: number;
    readonly halfWidth: number;
    readonly halfHeight: number;
}

export interface IStaticObstacleWorld {
    addStaticObstacle(spec: IStaticObstacleSpec): number;
    removeStaticObstacle(obstacleId: number): void;
}

// src/physics/PhysicsWorld.ts（追加）
addStaticObstacle(spec: IStaticObstacleSpec): number {
    const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y)
    );
    const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(spec.halfWidth, spec.halfHeight),
        body
    );
    const id = this.nextObstacleId++;
    this.obstacles.set(id, { body, collider });
    return id;
}
```

### 地形射线（解析几何，`KingdomSensingWorld`）

```ts
// 射线 × 轴对齐矩形：slab 法；原点在矩形内 → 0；无正向交点 → Infinity。
// 64 条方向与世界固定，起点角 0（+x），逆时针 2π/64（与 ArenaSensingWorld 一致）。
// 命中集合 = 地图边界 + 地形矩形 + 传入的敌方 blocker 圆；结果 clamp 到 [0, maxDistance]。
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 把军队作为战斗实体/物理聚合 | 军队只是宏观容器；战斗成员是单位集合 | 本项目 D-01/D-02 | 增援/离区/合并都按单位位置自然实现；无需“军队战斗对象” |
| 全局固定 tick 间隔 | 外层 tick 1/24 游戏分钟；物理子步恒定 1/60s | 本项目 D-07–D-10 | 战斗 1×、快进 24×，物理稳定；所有计时用游戏分钟 |
| 每场战斗新建物理世界/暂停 | 所有战场并发推进，只维护播放队列 | 本项目 D-03 | 录制顺序与真实并发解耦；Phase 6/7 按队列播放 |
| 视野记忆/迷雾地图 | 查询式当前可见性（100m/150m 并集） | 本项目 D-25 | 无状态、易测；历史归 Phase 7 |
| 单位 AI 直接改物理 | `IUnitAI` 只输出动作；`ControlSystem` 执行 | Phase 3 | 行军/战斗/刹车都在同一接缝切换（`ModeAI`） |

**Deprecated/outdated:**

- **可变 Rapier `timestep` 实现倍速**：不稳定且破坏 Phase 2 契约；用子步数。
- **为地形另建物理世界**：无法与单位碰撞。
- **把地形伪装成动态单位**：形状/目录/静态性都不对。
- **在 `IUnit` 上加阵营/军队字段**：`teamId` 注册注入、军队映射由王国层持有。
- **`takeDamage` 负数回血**：语义滥用；用 `IHealableUnit.heal`。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 1 个物理子步 = 1 游戏分钟；24× 外层 tick 跑 24 子步 | Pattern 4 | 若用户希望 24× 用更少子步（6/12），战略计时需同比缩放；不影响契约 |
| A2 | 军队战初始成员 = 双方军队全部存活单位，随后按 80m 正方形剪枝 | Pattern 2 / G-3 | 若用户希望只让“前锋”参战，需定义额外初始半径；战斗形状会变 |
| A3 | 军队 InBattle 时中心冻结；战斗结束后重算为幸存单位（加权）中心 | Pattern 2 / Pitfall 11 | 若中心继续移动，阵型槽位会拖着单位离开战场，战斗不激烈 |
| A4 | 只有“曾参战并离区”的单位进入 Brake；从未加入的同军增援保持 March | Pattern 3 / Pitfall 12 | 若所有 InBattle 军队的外围单位都 Brake，增援到不了 |
| A5 | 驻军上限默认普通 10 / 主城 20 | G-4 | 规格未给出；影响训练/守城强度，可校准 |
| A6 | 默认入驻规则 = 存活攻方 25%（至少 1，不超上限） | G-4 | 规格未给出；影响攻城后守军规模，可校准 |
| A7 | 静态障碍接缝 = `src/physics/types.ts` 新增 `IStaticObstacleWorld` + `PhysicsWorld` 2 方法 | G-2 / Pattern 7 | 若用户拒绝任何 `src/physics/` 改动，D-27 无法满足（或需重实现物理） |
| A8 | 回血接缝 = `src/units/types.ts` 新增 `IHealableUnit` + `Unit.heal`（`IUnit` 不变） | G-1 | 若用户拒绝任何 `src/units/` 改动，KING-03/05 无法满足 |
| A9 | 地形为轴对齐矩形（无旋转） | Pattern 7 / Sensing | 若需要斜墙，物理可用 cuboid rotation，但解析射线要加 OBB 变换；本阶段不需要 |
| A10 | 行军避障用 64 射线局部排斥，不做 A*/导航网格 | Pattern 5 / Pitfall 13 | 长墙/迷宫会卡住；场景需留缺口 |
| A11 | BattleAI = 过滤到战斗区的 `DefaultUnitAI` 包装；低血撤退可能离开战斗区 | Pattern 3 | 若要求“绝不撤退”，需改战斗 AI；当前保留动态性 |
| A12 | 射弹/技能物理继续 deferred；Phase 4 近战碰撞为主 | Deferred | 若“战斗激烈好看”必须有远程，需另立射弹系统（不建议塞进 Phase 4） |
| A13 | `IVec2` 暂放 `src/kingdom/types.ts`，不提升到 `src/common/` | Contract | Phase 5 仍可从 kingdom 导入；若多系统复用再迁移 |
| A14 | 地图边界另加 4 面静态墙（厚 10m），防止击退出界；射线仍用解析地图矩形 | KING-01 / G-4 | 多 4 个静态 body；可去掉，但单位可能被击出地图 |
| A15 | 重战锁定同时覆盖军队-军队与军队-城池对，直到距离 >80m | Pattern 2 / D-05 | 若不锁军队-城池，败军可能在城下反复触发 |
| A16 | 合并战斗保留较早 id；被吸收战场发 `Ended` + `mergedIntoBattleId` | Pattern 2 / Pitfall 20 | Phase 6 播放队列需要该字段；否则合并事件不配对 |
| A17 | 城池易手不转移单位阵营；`updateTeam` 在 Phase 4 不使用 | KING-07 | 规格只说“接管城池”，未说守军倒戈；若用户要求俘获/倒戈，需另加规则 |
| A18 | `IWorld` 不暴露 `IControlSystem`/`IPhysicsWorld`；渲染/录制从组合根同时拿三者 | Contract | 若 Phase 5 希望只拿 `IWorld`，需在 `IWorld` 增加单位读数（会扩大契约） |
| A19 | 城池易手时训练进度重置为 0；训练职业/驻军上限沿用城池配置 | KING-05/07 | 规格未说明；影响新主多久能产出第一个单位，可校准 |
| A20 | 驻军军队处于 InBattle 时训练暂停；战斗结束后恢复 | KING-05 | 围城期间不应继续产兵；若用户希望继续训练，改动很小 |
| A21 | 可见敌方军队暴露完整名册（`IArmy.getUnitIds`）；单位级可见性另由 `visibleEnemyUnits` 给出 | ICommanderContext | 若要求“只看到视野内的单位、看不到名册”，Phase 7 应改用 army brief；Phase 4 占位指挥官不受影响 |

## Open Questions

1. **G-1 回血契约（阻塞 Round 2）**
   - What we know: `IUnit` 无 heal；`Unit.takeDamage` 拒绝非正数；KING-03/05 明确要求 1/h、2/h。
   - What's unclear: 用户是否接受 `src/units/types.ts` 的加性 `IHealableUnit`（推荐），还是坚持零改动。
   - Recommendation: 门禁批准 `IHealableUnit extends IUnit` + `Unit.heal`；若拒绝，必须显式砍掉回血并改需求。

2. **G-2 静态地形接缝（阻塞 Round 2）**
   - What we know: `IPhysicsWorld` 无静态 API；Rapier fixed cuboid 在同一 world 可用（探针）。
   - What's unclear: 用户是否接受 `src/physics/types.ts` + `PhysicsWorld.ts` 的加性改动。
   - Recommendation: 按 Pattern 7 批准；拒绝则 D-27 只能降级为“地形只挡射线”，需用户书面接受。

3. **G-3 初始战斗成员（A2）**
   - Recommendation: 双方全军 → 立即按正方形剪枝；请用户在门禁确认。

4. **G-4 默认数值（A5/A6/A9/A14）**
   - Recommendation: 先用表中可校准默认值；Round 2 测试钉住行为而非具体数值（除 10m/h、25m、100m、150m、80m、96h/72h、1/h、2/h 这些规格值）。

5. **城池战败方目标**
   - What we know: D-21 “向己方城池行军，无己方城池则随机方向”。
   - What's unclear: 多个己方城池时选最近、最远还是主城。
   - Recommendation: 最近己方城池（平方距离），无则 RNG 随机方向；占位指挥官不重要（D-29）。

6. **是否在 Phase 4 补最小射弹**
   - What we know: Phase 3 只输出技能意图；Phase 4 的 KING-06/07 只要求近战触发/结算。
   - Recommendation: **继续 deferred**。射弹需要新的物理体/CCD/伤害路由，是一个独立系统；Phase 4 先把单位级战斗跑通。若用户认为“没有远程就不够好看”，另立后续阶段。

7. **城池易手是否触发 `updateTeam`**
   - Recommendation: 不触发。D-21 只说接管城池；单位保留原阵营/armyId（D-05）。`updateTeam` 保持预留。

8. **`IWorld` 的读取面是否足够 Phase 5**
   - What we know: Phase 5 需要单位位置/HP/等级/阵营；`IWorld` 只给军队/城池/可见性，单位读数在 `IPhysicsWorld` + `IControlSystem`。
   - Recommendation: 组合根同时把三者交给 Phase 5；不在 `IWorld` 里复制单位读数（避免契约膨胀）。

9. **地图边界是否加物理墙（A14）**
   - Recommendation: 加 4 面薄墙，成本可忽略；若不希望地形列表包含边界，可在 World 内部自动加，不进 `IScenario.terrain`。

10. **`ITimeSystem.advance` 是否暴露给消费者**
    - Recommendation: 暴露；只有 World 持有实例并调用。若用户希望严格只读，可改为内部 `IMutableTimeSystem`（多一个类型），但收益很小。

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 全部 | ✓ | v24.21.0 | — |
| pnpm | 依赖/脚本 | ✓ | 12.5.1 | — |
| `@dimforge/rapier2d-compat` | 物理/静态地形/探针 | ✓ | 0.21.0（精确钉版） | — |
| Vitest | Round 1/2 测试 | ✓ | 5.0.4 | — |
| TypeScript 工具链 | `pnpm typecheck` | ✓ | 双别名（TS6/TS7） | — |
| `.planning/graphs/graph.json` | 图上下文研究 | ✗ | — | 无图上下文；本文件即结论（源码 + 探针） |
| Context7 MCP（research-plan seam 建议的 provider） | 外部 Rapier 文档 | ✗（本会话无该 MCP 工具） | — | 已用**已安装包的 `.d.ts` + 真实 WASM 运行时探针**替代；证据更强（版本精确） |

**Missing dependencies with no fallback:** 无。

**Missing dependencies with fallback:**
- 知识图谱不存在——不影响本阶段；研究基于源码/运行时探针。
- Context7 不可用——Rapier 事实全部由 `node_modules/@dimforge/rapier2d-compat@0.21.0` 的类型声明 + 真实运行时探针验证，不依赖外部文档。

**Baseline verification（本会话实测）:** `pnpm typecheck` 通过；`pnpm test` = 20 文件 / 186 测试全绿；`node --version` = v24.21.0；`pnpm --version` = 12.5.1。

## Validation Architecture

> `workflow.nyquist_validation: true`（`.planning/config.json:24`），本节必须保留。

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4 |
| Config file | `vitest.config.ts`（`environment: 'node'`；`include: ['tests/**/*.test.ts']`；别名 `@` → `src/`） |
| Quick run command | `pnpm vitest run tests/kingdom/types.test.ts`（Round 1）；Round 2 加 `tests/kingdom/` |
| Full suite command | `pnpm test` + **`pnpm typecheck`**（Round 1 的真实门禁；`expectTypeOf` 运行时是空操作）+ `pnpm lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KING-01 | 1000×1000、10m/h、边缘反弹 | unit + integration | `pnpm vitest run tests/kingdom/time.test.ts tests/kingdom/march.test.ts` | ❌ Round 2 |
| KING-02 | 战斗 1× / 无战斗 24×；子步数 1/24；游戏分钟 | unit + integration | `pnpm vitest run tests/kingdom/time.test.ts` | ❌ Round 2 |
| KING-03 | 25m 圆内、程序控制、行军回血 1/h | integration | `pnpm vitest run tests/kingdom/march.test.ts` | ❌ Round 2（依赖 G-1） |
| KING-04 | 军队 100m / 城池 150m 并集、无记忆 | unit + integration | `pnpm vitest run tests/kingdom/vision.test.ts` | ❌ Round 2 |
| KING-05 | 驻军上限、训练 96/72h、驻扎回血 2/h | integration | `pnpm vitest run tests/kingdom/city.test.ts` | ❌ Round 2（依赖 G-1） |
| KING-06 | <80m 触发、80m 正方形加权中心、离区/结束 | integration | `pnpm vitest run tests/kingdom/battle.test.ts` | ❌ Round 2 |
| KING-07 | 城池战触发/结算/接管/入驻/败方重组 | integration | `pnpm vitest run tests/kingdom/city.test.ts` | ❌ Round 2 |
| KING-08 | 多势力、各拥有军队/城池、teamId 映射 | unit + integration | `pnpm vitest run tests/kingdom/scenario.test.ts tests/kingdom/types.test.ts` | ❌ Round 1/2 |
| — | 静态地形挡移动 + 挡射线（D-27） | integration（真实 Rapier） | `pnpm vitest run tests/kingdom/terrain.test.ts` | ❌ Round 2（依赖 G-2） |
| — | `IUnit.heal` 行为（G-1） | unit | `pnpm vitest run tests/units/heal.test.ts` | ❌ Round 2（依赖 G-1） |

### Round 1 vs Round 2（类型门禁的可验证边界）

**Round 1 可以验证：**

- 所有数字枚举成员值（`TimeRate.Normal === 1`、`TimeRate.Fast === 24`、`ArmyState.Marching === 0` …）。
- 枚举成员都是整数且互异（`Number.isInteger` + `Set` 大小）。
- `IFaction`/`IArmy`/`ICity`/`IBattle`/`IArmyOrder`/`IScenario`/`ITimeSystem` 可以用完整对象字面量构造（编译期证明字段齐全）。
- `expectTypeOf` 断言方法签名：`IWorld['tick']` 返回 `IWorldTickResult`、`IBattleSystem['getBattleForUnit']` 返回 `IBattle | null`、`ITimeSystem['getRate']` 返回 `TimeRate`、`UnitWeight`/`GarrisonSelector` 类型精确。
- `@/kingdom/types` 别名解析（导入本身即证明）。
- `pnpm typecheck` + `pnpm lint` 通过（`expectTypeOf` 运行时空操作，必须靠 typecheck）。

**Round 1 不能验证（必须留到 Round 2）：**

- 任何 World/Time/Army/City/Battle/March/Commander 行为。
- `IUnit.heal` / `IStaticObstacleWorld` 的实际实现（门禁批准后才写）。
- 真实 Rapier 下的地形阻挡/射线、战斗伤害过滤、训练生成。
- 性能/帧率。

### Sampling Rate

- **Per task commit:** `pnpm typecheck` + `pnpm vitest run tests/kingdom/`（快）。
- **Per wave merge:** `pnpm test` + `pnpm lint`。
- **Phase gate:** 全套绿（含 `pnpm typecheck`）后才进入 `/gsd-verify-work`。

### Wave 0 Gaps

- [ ] `tests/kingdom/` 目录 + `tests/kingdom/types.test.ts`（Round 1 唯一脚手架；无框架安装）。
- [ ] Round 2：`tests/kingdom/harness.ts`（真实 `RAPIER.init()` + 真实 `PhysicsWorld`/`ControlSystem`/`KingdomWorld` 小场景；`afterEach` dispose；种子化 `mulberry32`）。
- [ ] Round 2：`time/march/battle/city/vision/terrain/scenario` 七个行为测试文件。
- [ ] Round 2（若 G-1 批准）：`tests/units/heal.test.ts`。
- [ ] 无需新增依赖、无需改 `vitest.config.ts`/`tsconfig.json`。

## Security Domain

> `security_enforcement: true`，ASVS level 1（`.planning/config.json:47-48`）。本阶段为纯本地单进程模拟，无网络/认证/持久化面。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 无身份/登录面 |
| V3 Session Management | no | 无会话 |
| V4 Access Control | no | 无多用户/权限 |
| V5 Input Validation | **yes** | 场景表校验（有限数、正尺寸、id 唯一、势力/城池引用存在、位置在界内、**出生点不在地形矩形内**、总单位/军队数防御性上限）；指令校验（有限数、合法枚举、军队/城池存在、目标在界内）；注入函数（权重/入驻/指挥官）try-catch + 有限/非负守卫；伤害事件有限/正数 |
| V6 Cryptography | no | 无加密面 |

### Known Threat Patterns for 可插拔指挥官 / 场景配置（in-process）

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 场景含 `NaN`/`Infinity`/负尺寸/重复 id → 物理/战斗状态污染 | Tampering | 构造 `KingdomWorld` 时一次性校验并抛错；不进入 tick |
| 指挥官/入驻/权重函数抛异常 → 整场模拟崩溃 | Denial of Service | 每次调用 try-catch；异常时回退 `Hold`/空入驻/权重 1，继续 tick（镜像 Phase 3 的 plugin 守卫） |
| 指挥官返回极端坐标/巨大 `startAtMinutes` → 军队飞出地图 | Tampering | 订单校验：有限数、目标在 `[0,width]×[0,height]`、时间非负；无效订单丢弃 |
| 训练无限产出 → 单位数爆炸 | Denial of Service | 驻军上限硬约束；满员暂停训练；每次训练产出 1 个 |
| 恶意注入函数无限循环 | Denial of Service | 同步函数无法在 JS 内强制中断；记录为已知限制（同 Phase 3）；v1 只接受可信注入 |
| 单位 id 重用/碰撞 → 错误伤害归属 | Tampering | World 单调递增分配 id；不重用死亡 id；`ControlSystem.registerUnit` 重复 id 抛错 |

## Sources

### Primary (HIGH confidence — 本会话读源码 / 运行时探针)

- `src/physics/types.ts:195-212` — `IPhysicsWorld` 8 个方法；**无静态障碍/射线 API**。
- `src/physics/PhysicsWorld.ts:42` — `private readonly world: InstanceType<typeof RAPIER.World>`。
- `src/physics/PhysicsWorld.ts:90-152` — `registerUnit` 复合刚体（body/weapon/armor 各自 collider 与 mass）。
- `src/physics/PhysicsWorld.ts:154-168` — `removeUnit` 清 handle 索引。
- `src/physics/PhysicsWorld.ts:207-436` — `tick()` 预速度快照、事件排空、伤害计算、`resetForces/resetTorques`（431-434）。
- `src/physics/PhysicsWorld.ts:229-241` — 未在 `index` 中的 handle（如地形）被跳过，无接触/伤害。
- `src/physics/constants.ts:14,31-42` — `DT = 1 / 60`；`DEFAULT_GEOMETRY.bodyRadius = 0.5`。
- `src/control/types.ts:86-107` — `ISensingWorld.castRayFan/queryProjectiles`。
- `src/control/types.ts:201-216` — `IUnitAI` / `IUnitAIProvider`。
- `src/control/types.ts:247-268` — `IDamageContext` / `IDamageSink`。
- `src/control/types.ts:302-317` — `IControlSystem`（注册/注销/updateTeam/tick/dispose）。
- `src/control/ControlSystem.ts:111-145` — `registerUnit`（AI 先建、物理注册、失败回滚）。
- `src/control/ControlSystem.ts:187-269` — 6-tick 决策、每 tick 重施加、physics.tick、伤害路由、死亡注销。
- `src/control/ControlSystem.ts:513-537` — `routeDamage` 的 `IDamageContext` 解析。
- `src/control/ControlSystem.ts:546-564` — 单点注销顺序（destroy → 目录删除 → physics.removeUnit）。
- `src/control/constants.ts:12,18,24,30,36` — 6 / 64 / 50 / 16 / 100。
- `src/units/types.ts:224-247` — `IUnit` 方法集；**无 heal**。
- `src/units/Unit.ts:186-195` — `takeDamage` 拒绝 `amount <= 0`。
- `src/units/Unit.ts:297-315` — 升级回血只发生在 `checkLevelUp`。
- `src/units/spawn.ts:31-53` — `spawnUnit` 正态随机（σ = 均值/8）。
- `src/common/types.ts:11-13`、`src/common/rng.ts:36-45` — `IRng` / `sampleNormal`。
- `src/units/data.ts:57-306,325-386` — `CLASS_DEFS` / `WEAPON_DEFS` / `ARMOR_DEFS`。
- `tests/control/types.test.ts:1-143` — `expectTypeOf` 契约测试范式。
- `tests/control/arena.ts:1-163` — 解析「射线×AABB + 射线×圆」+ 64 方向起点角 0/逆时针。
- `tests/control/damage-sink.ts:17-62` — 同队免伤/存活守卫/经验/击杀经验的生产镜像。
- `tests/helpers/rng.ts` — `mulberry32` 种子化 `IRng`。
- `vitest.config.ts:5-21` — Node 环境、`tests/**/*.test.ts`、`@` 别名。
- `package.json:9,18,23,26,29` — Node >=24、双 TS、Vitest、Rapier 0.21.0。
- `tsconfig.json:20-27` — `strict: true`、`paths: { "@/*": ["./src/*"] }`、`include: ["src","tests"]`。
- `.planning/config.json:24,47-48` — `nyquist_validation: true`、`security_enforcement: true`、ASVS 1。
- `node_modules/@dimforge/rapier2d-compat/dist/pipeline/world.d.ts:73,173,214,389` — `step` / `createRigidBody` / `createCollider` / `castRay`。
- `node_modules/@dimforge/rapier2d-compat/dist/pipeline/query_pipeline.d.ts:16` — `EXCLUDE_DYNAMIC = 4`。
- `node_modules/@dimforge/rapier2d-compat/dist/dynamics/rigid_body.d.ts:575` — `static fixed(): RigidBodyDesc`。
- `node_modules/@dimforge/rapier2d-compat/dist/geometry/collider.d.ts:681,748,926` — `static ball` / `static cuboid` / `setCollisionGroups`。
- 运行时探针 1：固定墙在 x=10 挡住动态球（球停在 x≈9.0）；墙接触事件出现；`castRay` 命中墙面 8.5；移除墙后命中球。
- 运行时探针 2：先步进后加地形可行；`castRay(..., EXCLUDE_DYNAMIC)` 只命中地形（toi 9.5），`EXCLUDE_FIXED` 只命中单位。
- 基线：`pnpm typecheck` 通过；`pnpm test` 20 文件 / 186 测试全绿。

### Secondary (MEDIUM confidence — 外部资料 / 项目规格)

- `.planning/reference/ai-marble-kingdom.md` § 地图 / 时间系统 / 战斗 / 行军 / 城池 / 视野 / 单位生成 — 1000×1000、10m/h、25m、100m、150m、80m、96h/72h、回血 1/2、正态 σ=均值/8。
- `.planning/phases/04-kingdom-system/04-CONTEXT.md` § Implementation Decisions — D-01..D-29（用户锁定的设计）。
- `.planning/phases/03-control-system/03-RESEARCH.md` — Phase 3 的 11 条陷阱（力清空、无阻尼、冻结快照、单武器、`expectTypeOf` 空操作等）在本阶段继续适用。

### Tertiary (LOW confidence)

- 规格未给出的默认数值（驻军上限、入驻比例、MarchAI 增益、避障阈值、迟滞、边界墙厚度）——全部标 `[ASSUMED]`，需 Round 2 实测校准。

### Research-plan seam 记录

`gsd_run query research-plan` 对唯一的外部问题（Rapier 静态碰撞/射线过滤）返回了 `provider: context7`。本会话没有 Context7 MCP 工具，因此未执行该 fetch；改用**已安装的 `@dimforge/rapier2d-compat@0.21.0` 类型声明 + 真实 WASM 运行时探针**验证同一问题。这比外部文档更精确（版本锁定、行为实测），故不影响置信度。

## Metadata

**Confidence breakdown:**

- **Standard Stack: HIGH** — 本阶段零新增依赖；Rapier/Vitest/Node/TS 版本均经 `package.json` 与安装目录核实；基线 186 测试绿。
- **Frozen-contract integration: HIGH** — `IPhysicsWorld`/`IControlSystem`/`IUnit`/`ControlSystem.tick`/`PhysicsWorld.tick` 逐字读过；静态地形与射线过滤经真实 Rapier 探针验证。
- **Architecture (contract shape): MEDIUM** — `src/kingdom/types.ts` 是待用户门禁审查的设计提案，不是已验证事实；字段/方法签名可能按用户反馈调整。
- **Gate decisions (heal / static obstacle): MEDIUM** — 两个加性扩展是最小可行方案，但需要用户批准；拒绝会改变范围。
- **Pitfalls: HIGH** — 20 条中约 14 条直接源于本会话读到的冻结契约/探针（力清空、无 heal、无静态 API、事件索引跳过、6-tick 决策、升级回血位置等）。
- **Default values: LOW** — 规格未给出的数值全部 `[ASSUMED]`，Round 2 实测校准。

**Research date:** 2026-10-20
**Valid until:** 2026-11-19（30 天；稳定。变化源主要是用户对 G-1/G-2 的门禁裁决，以及 Round 2 的数值校准）

