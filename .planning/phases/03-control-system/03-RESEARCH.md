# Phase 3: 操控系统 - Research

**Researched:** 2026-10-19
**Domain:** 单位级 AI 输入/输出契约、可插拔 AI Provider、0.1s 决策节奏（TypeScript / Rapier2D / Vitest）
**Confidence:** HIGH（契约集成面与陷阱）；MEDIUM（契约形状本身——它是待用户审查的设计提案，不是已验证事实）

## Summary

Phase 3 是**纯契约 + 可插拔边界**的一轮：Round 1 只声明 `src/control/types.ts` 与最小编译期测试，用户审查通过后 Round 2 才实现感知、控制循环与默认基线 AI。研究结论：本阶段**零新增依赖**，全部基于 Phase 1（`IUnit`）、Phase 2（`IPhysicsWorld`）、`src/common`（`IRng`）已冻结的契约，以及仓库既有 Vitest 5 `expectTypeOf` 类型测试范式。

三条最重要的集成现实（均已在本会话中读源码/运行时探针验证）：

1. **物理层每个 `tick()` 之后清空力/力矩**（`body.resetForces(false); body.resetTorques(false);`，`PhysicsWorld.ts:432-433`），且**没有任何默认阻尼**（运行时探针：`linearDamping: 0`、`angularDamping: 0`）。因此控制层必须在**每个物理 tick 重新施加**已存动作（D-13 已定），且默认 AI 不能用"恒定力"，必须用速度误差 / PD 式控制才能停下。
2. **`IPhysicsWorld` 没有射线查询、没有射弹概念**（`physics/types.ts:195-212` 仅 9 个方法），且 `IUnitPhysicsSpec` 是冻结快照（`weapon: IWeaponDef | null` + `armors[]`，单武器）。感知因此**不能**依赖物理层，必须由控制层自己的 `ISensingWorld` + `Sensor` 承担（D-01）。
3. **没有地图（Phase 4）**，所以 Round 1 的契约必须能由一个测试竞技场（边界矩形 + 单位圆 + 空射弹）实现；64 射线用解析几何（射线×AABB + 射线×圆）即可，无需 Rapier 射线 API。仓库安装的 `@dimforge/rapier2d-compat@0.21.0` **确实提供** `world.castRay(...)`（`world.d.ts:389`），留作 Phase 4 的实现选项。

**Primary recommendation:** Round 1 只写 `src/control/types.ts`（约 19 个声明：`SkillIntentKind` 数字枚举 + `IUnitObservation` / `IUnitAction` / `IUnitAI` / `IUnitAIProvider` / `ISensor` / `ISensingWorld` / `IDamageSink` / `IControlSystem` 等）与 `tests/control/types.test.ts`（编译期契约断言 + 枚举钉版）；契约值 64/16/16/50/6 只写进 JSDoc，常量文件留到 Round 2。AI 输入是**纯数据快照**，输出是**四向力 + 双向力矩 + 可空技能意图**；`ControlSystem` 只做「决策→施加→步进→路由伤害→清理死亡」的编排，战斗规则全部在注入的 `IDamageSink` 里。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 感知与 AI 输入契约

- **D-01:** 感知是**控制层自己的接口**（`ISensor` / `ISensingWorld`），控制层只依赖该接口，**不扩展、不修改 Phase 2 已冻结的 `IPhysicsWorld`**。Phase 3 由测试/竞技场实现提供边界与单位，Phase 4 由王国世界实现同一接口。 — **Reversibility:** costly — 每个 AI 实现与 Phase 4 世界都依赖该感知边界，替换会波及全部 AI 输入构造。
- **D-02:** 64 条射线**以世界坐标固定方向**均匀分布、不随本体旋转；最远 50m（超出按 50m）。射线命中**竞技场/地图边界 + 敌方单位 + 未来地图障碍物**；友方单位不作为射线障碍。未来障碍物只**预留接口能力**，Phase 3 不实现地图障碍。 — **Reversibility:** costly — 射线数量/坐标系/命中集合是 AI 输入契约，改动会影响所有 AI 的空间判断与调参。
- **D-03:** 16 敌/16 友简讯**先只包含文档明确字段**：`unitId`、生命值、等级、位置、装备（武器/防具种类）；按距离升序、仅存活单位、每类最多 16 个。**不加入速度/职业/朝向等额外字段**；接口允许后续以可选字段扩展，不破坏现有 AI。 — **Reversibility:** reversible — 新增可选字段不会破坏既有 AI 输入。
- **D-04:** 「射弹与单位的距离」用**最小射弹列表**（位置/距离，最远 50m）预留；Phase 3 恒为空数组，后续射弹系统出现时填充，**不改 AI 输入契约**。单位距离由 16 敌/16 友列表覆盖。 — **Reversibility:** reversible — 空列表占位，不影响现有行为。
- **D-05:** AI 输入是**每次决策的纯数据快照**：自身属性读数 + 自身运动状态（位置/朝向/线速度/角速度）+ 感知结果。AI **不直接访问 Rapier、物理世界或 `Unit` 的可变方法**；实现可替换、可单测、可序列化。 — **Reversibility:** costly — 所有 AI 实现与测试夹具都消费该快照形状。
- **D-06:** 控制注册把 `unitId ↔ IUnit ↔ teamId` 绑定起来，并由控制层从 `IUnit` 属性与 `CLASS/WEAPON/ARMOR` 数据表构造 `IUnitPhysicsSpec` 注册到物理世界；物理层契约保持冻结。 — **Reversibility:** costly — 这是控制、单位、物理三系统的唯一胶合点。

#### 阵营与伤害归属

- **D-07:** 阵营标识为**控制注册时注入的数字 `teamId`**（按相等判断敌我，支持任意数量阵营），不修改 `IUnit`。**预留运行时更新入口**（如 `updateTeam`/`setTeamId`）供 Phase 4 城池易手/单位转阵营使用，Phase 3 自身不调用。 — **Reversibility:** costly — Phase 4 势力映射与所有 AI 注册都依赖该契约。
- **D-08:** **感知层负责按 `teamId` 分类并筛选** 16 敌/16 友；AI 只接收已分好的 `enemies[]` / `allies[]`，不重复实现阵营逻辑。 — **Reversibility:** reversible — 分类逻辑集中在感知层。
- **D-09:** **同队单位保留物理碰撞，但不结算伤害**。物理层照常发出 `IDamageEvent`；同队过滤发生在**伤害应用层**，不在物理层，也不改变 `IPhysicsWorld` 语义。 — **Reversibility:** costly — 伤害应用层与 Phase 4 战斗结算都必须遵守该规则。
- **D-10:** 控制层通过**可注入的 `IDamageSink`** 把物理层伤害事件交给上层：Phase 3 的测试胶合层实现「同队免伤 + `takeDamage` + 攻击/防御/击杀经验 + 死亡移除」；Phase 4 换成真实战斗结算。`ControlSystem` 只路由事件，**不拥有战斗规则**。 — **Reversibility:** costly — Phase 4 战斗层通过该接口接入。

#### 可插拔架构与执行时序

- **D-11:** **每个单位一个 `IUnitAI` 实例**，由 `IUnitAIProvider.create(unitId, unit)` 创建；Provider 是替换 AI 实现的唯一插拔点。AI 实例可持有目标、冷却、行为树状态。 — **Reversibility:** costly — 所有 AI 实现与模拟胶合层依赖该生命周期契约。
- **D-12:** 控制层提供 `ControlSystem.tick()` 驱动完整循环：每 tick 施加当前动作 → 每 6 tick（0.1s）调用一次 AI 决策 → `physics.tick()` → 把伤害事件交给 `IDamageSink`。决策节奏以 tick 计数，不用 wall-clock。 — **Reversibility:** costly — 循环是所有模拟阶段的驱动骨架。
- **D-13:** AI 输出为**世界坐标四向力**（up/down/left/right 大小）+ **顺时针/逆时针力矩**；控制层合成净力/力矩。动作**保持到下一次决策**，控制层在每个物理 tick 重新施加（物理层每 tick 后清空力/力矩）；技能类输出**只在决策 tick 触发一次**，不重复施加。 — **Reversibility:** costly — 所有 AI 输出与控制执行器都依赖该语义。
- **D-14:** 默认决策结构使用**行为树**（项目已排除 GOAP/HTN/MCTS）；AI 决策是输入快照上的纯函数式选择，不直接驱动物理。 — **Reversibility:** costly — 行为树是后续 AI 的默认结构。
- **D-15:** 不保证确定性；默认基线 AI **确定性**（不依赖随机），需要随机性的测试/实现通过注入 `IRng` 获得可复现序列。 — **Reversibility:** reversible — 随机源可随时注入/替换。
- **D-19:** Phase 2 的**物理注册快照不刷新**（WR-01，已接受）在 Phase 3 继续接受：AI 读取 `IUnit` 的实时属性，但物理伤害仍使用注册时的攻击/防御/装备快照；本阶段不做升级后重新注册。 — **Reversibility:** costly — 解除该限制需要改物理注册/刷新契约。

#### 默认 AI 与技能

- **D-16:** 默认基线 AI **只用于验证契约与自主运行**，不是最终战斗 AI。最小三行为：追击最近敌人、进入接触/攻击距离后攻击、生命过低时远离最近敌人。具体阈值、转向强度、攻击距离等由实现自定，不投入调参；后续整体替换为可插拔 AI。 — **Reversibility:** reversible — 默认实现可被任意 `IUnitAI` 替换。
- **D-17:** 武器技能（弓箭射箭）与单位技能（万箭齐发/冲锋/旋转）在 Phase 3 **只做输出意图 + 冷却**，**不实现射弹、冲锋位移、旋转效果等技能物理**。默认 AI 在技能已解锁且冷却结束时输出意图；实际执行留给后续战斗/技能层（Phase 4 或专门系统）。冷却以控制 tick 计数，文档给出的 5/6/7s 作为初始值，弓箭射击间隔为可校准常量。 — **Reversibility:** costly — 输出契约会被后续技能执行器消费，但执行器尚未落地。
- **D-18:** 控制等级（`AttributeKind.ControlLevel`）在 Phase 3 **不驱动默认 AI 强度**；`IUnitAIProvider` 已足够作为未来按控制等级/训练轮数选择 AI 的接入点。RL/LLM 单位控制留到 v2/Phase 7。 — **Reversibility:** reversible — Provider 可随时按等级选择不同实现。

### the agent's Discretion

- 感知快照的具体字段布局、`ISensor` / `IUnitAI` / `IUnitAIProvider` / `IDamageSink` / `IControlSystem` 的方法签名与命名。
- 64 条射线的角度起点、射线查询实现、邻居排序的并列决胜规则。
- 默认行为树的具体节点划分、低血阈值（如 25%）、攻击距离、力/力矩大小与转向控制参数。
- 冷却计时常量、弓箭射击间隔、技能触发的具体条件。
- 控制/感知/默认 AI 的文件拆分与 `src/control/` 内部组织（遵循每文件夹一个 `types.ts`）。

### Deferred Ideas (OUT OF SCOPE)

- **射弹与技能物理效果**（弓箭射箭、万箭齐发、冲锋位移、旋转效果）——留给后续战斗/技能层（Phase 4 或专门系统）；Phase 3 只输出意图与冷却。
- **丰富的默认 AI 行为/职业战术/个性参数**——默认基线只验证运行；后续用可插拔 AI 实现行为多样性与「激烈好看」。
- **地图障碍物射线感知**——Phase 4 地图出现后由 `ISensingWorld` 实现；Phase 3 只预留接口。
- **运行时阵营更新**——`updateTeam`/`setTeamId` 入口预留，Phase 4 城池易手/单位转阵营时启用。
- **按控制等级选择 AI / RL / LLM 单位控制**——Provider 已预留接入点；实际实现属 v2 / Phase 7。

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTRL-01 | 定义单位级 AI 的输入接口（自身属性、位置、64 条射线距离、射弹距离、16 个最近敌方简讯、16 个最近友方简讯） | `IUnitObservation` 契约（见 §Recommended Contract Shape）；`attributes: Readonly<Record<AttributeKind, number>>`、`motion: IUnitState`（复用物理冻结类型）、`rayDistances: readonly number[]`（钉长 64）、`projectiles: readonly IProjectileSighting[]`（Phase 3 空）、`enemies`/`allies: readonly IUnitBrief[]`（≤16，距离升序）。Round 1 用 `expectTypeOf` + 完整对象字面量做编译期证明 |
| CTRL-02 | 定义单位级 AI 的输出接口（四向力、旋转力、武器技能、单位技能） | `IUnitAction`：`forceUp/Down/Left/Right`（非负大小）+ `torqueClockwise/CounterClockwise`（非负大小）+ `skillIntent: SkillIntent \| null`；`SkillIntent` 为 `IWeaponSkillIntent`（`weapon: WeaponKind`）与 `IUnitSkillIntent`（`skill: SkillKind`）的判别联合。合成规则：`fx = right-left`、`fy = up-down`、`torque = ccw-cw` |
| CTRL-03 | AI 每 0.1s（6 帧）决策一次 | `IControlSystem.tick()` 以 `tickIndex % DECISION_INTERVAL_TICKS === 0` 触发决策（常量 = 6，Round 2 写入 `src/control/constants.ts`）；`IUnitObservation.tick` 暴露绝对 tick 供冷却计算；Round 2 的 loop 测试断言决策恰好发生在 tick 0/6/12 |
| CTRL-04 | AI 控制实现为**可插拔**模块；提供默认基线实现使模拟可自主运行 | `IUnitAIProvider.create(unitId, unit)` 为唯一插拔点（D-11）；`IUnitAI.decide(observation): IUnitAction` 纯快照→动作；Round 2 `DefaultUnitAI implements IUnitAI`；pluggable 测试换 provider 后模拟仍跑 |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AI 输入快照拼装 | Control（`Sensor implements ISensor`） | — | 把单位目录（`IUnit`+`teamId`）、物理运动读数、感知世界三者 join；AI 永不接触物理/单位可变方法（D-05） |
| 环境空间查询（边界/未来障碍/射弹） | Sensing world（`ISensingWorld` 实现） | Control（提供敌方遮挡圆） | 地图几何属于世界层；Phase 3 由测试竞技场实现，Phase 4 由王国世界实现（D-01） |
| 射线命中集合与 64 方向 | Sensing world（射线计算） | Control（只传敌人块） | 结构性保证「友方非障碍」——只把敌人作为 `blockers` 传入（D-02） |
| 单位邻域 / 阵营分类 / 16 筛选 | Control（`Sensor`） | Physics（读 `getUnitState`） | `teamId` 由控制注册持有，物理无阵营概念（D-07/D-08） |
| 每单位 AI 决策 | AI 插件（`IUnitAI`） | Provider（`IUnitAIProvider`） | 快照上的纯函数；Provider 是唯一替换点（D-11/D-14） |
| 动作施加 / 净力合成 / 每 tick 重施加 | Control（`ControlSystem`） | Physics（`applyForce`/`applyTorque`） | 物理每 tick 清空力/力矩，控制层是唯一执行器（D-13） |
| 伤害应用 / 同队过滤 / 经验 | Damage sink（`IDamageSink`） | Control（仅路由） | 战斗规则不出现在控制模块（D-09/D-10） |
| 单位死亡 / 注销生命周期 | Control（`ControlSystem`） | Physics（`removeUnit`） | 注册的拥有者负责注销；sink 只改单位状态 |
| 技能冷却 | AI 插件 | — | 只输出意图；执行留 Phase 4（D-17） |
| 渲染读数 | Physics（`IPhysicsWorld.getUnitState`） | — | Phase 5 只读物理读数与单位属性，不依赖控制内部（Phase 5 约束） |

## System Architecture Diagram

```
                      Phase 3 test arena / Phase 4 kingdom world
                      ┌───────────────────────────────────────┐
                      │ ISensingWorld                          │
                      │  castRayFan(origin, maxDist, blockers) │◄── 敌人圆（只传敌人=D-02）
                      │  queryProjectiles(x, y, radius)        │     Phase 3 恒空（D-04）
                      └───────────────┬───────────────────────┘
                                      │ 64 距离
   IUnitCatalog (unitId→IUnit,teamId) │
        ▲                             ▼
        │   ┌──────────────────────────────────────────────┐
        │   │ Sensor implements ISensor                     │
        │   │  sense(unitId) → IUnitObservation | null      │
        │   │   = 自身属性/装备/技能 (IUnit)                 │
        │   │   + motion (IPhysicsWorld.getUnitState)        │
        │   │   + rayDistances / enemies[≤16] / allies[≤16]  │
        │   │   + projectiles[]                              │
        │   └───────────────┬──────────────────────────────┘
        │                   │ IUnitObservation（纯数据快照）
        │                   ▼
        │   ┌───────────────────────────────┐   create(unitId, unit)
        │   │ IUnitAI.decide(obs) → IUnitAction │◄── IUnitAIProvider（唯一插拔点 D-11）
        │   └───────────────┬───────────────┘
        │                   │ 动作存续到下一次决策（D-13）
        ▼                   ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ ControlSystem implements IControlSystem                       │
 │  registerUnit → 由 IUnit + WEAPON/ARMOR_DEFS 构造 spec        │
 │                → IPhysicsWorld.registerUnit（D-06）           │
 │  tick():                                                      │
 │   1. 每 6 tick：sensor.sense → ai.decide → 存动作/收集技能意图 │
 │   2. 每 tick：合成净力/力矩 → applyForce/applyTorque（重施加）│
 │   3. physics.tick() → IPhysicsTickResult{contacts, damages}   │
 │   4. damages → IDamageSink.applyDamage(IDamageContext)（D-10）│
 │   5. 死亡单位：provider.destroy + 目录删除 + physics.removeUnit│
 │   6. tickIndex++  → { skillIntents }                          │
 └───────────────────────────┬──────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
 IPhysicsWorld（冻结）                    IDamageSink（注入，Phase 4 换真实结算）
  每 tick 后 resetForces/resetTorques       同队免伤 + takeDamage + 攻击/防御/击杀经验
```

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript（`typescript` = `@typescript/typescript6@^6.0.2`，`@typescript/native` = TS7） | 见 `package.json:18,23` | 类型先行契约 | 项目既有双 TS 别名方案（Phase 1 定），本阶段不改 |
| `@dimforge/rapier2d-compat` | `0.21.0`（精确钉版） | 物理执行器 `applyForce`/`applyTorque`/`getUnitState`/`tick` | Phase 2 已锁定；本阶段只消费，不升级 |
| `vitest` | `^5.0.4` | 契约/行为测试（`expectTypeOf` 类型级断言） | 仓库既有（`package.json:26`；`tests/units/types.test.ts:1` 已在用 `expectTypeOf`） |
| Node.js | `>=24` | 运行环境 | `package.json:8`；本机 `v24.21.0` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/common`（`IRng`/`MathRng`/`sampleNormal`） | 仓库内 | 需要随机性的 AI/测试夹具的唯一随机源 | 默认 AI 确定性，不使用；测试注入 `mulberry32`（`tests/helpers/rng.ts`） |
| `@/units/data`（`WEAPON_DEFS`/`ARMOR_DEFS`） | 仓库内 | 由 `IUnit.getEquipment()` 构造 `IUnitPhysicsSpec`（D-06） | `ControlSystem.registerUnit` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 自研最小行为树（~100 行） | `@bt-studio/core` / `ts-behavior-tree` | 外部库带 8 种 composite、30+ decorator、blackboard、编辑器、JSX/SVG——严重违反 Anti-Over-Engineering 与「只留必要接口」。D-14 只要求行为树结构 |
| 解析几何射线（AABB+圆） | Rapier `world.castRay` | `castRay` 需要把单位/边界放进同一 Rapier world，而 `IPhysicsWorld` 不暴露其 Rapier world（冻结），且 `castRay` 每次分配 `Ray` 对象。Phase 3 测试竞技场用解析几何更快更可测；Phase 4 地图障碍可选 `castRay`（已验证 `world.d.ts:389`） |
| `SkillIntentKind` 判别联合 | 两个可空字段 `weaponSkill\|null` + `unitSkill\|null` | 可空字段不变量不可由类型保证；判别联合 + 数字枚举符合仓库「数字枚举」约定，并可被测试钉版 |

**Installation:**

```bash
# 本阶段零新增依赖
pnpm typecheck   # Round 1 的真正门禁（类型契约编译通过）
pnpm test        # Round 2 行为测试
```

**Version verification:** `@dimforge/rapier2d-compat` 已在 `package.json:29` 锁定为字面量 `0.21.0`；`vitest` `package.json:26`。本阶段不新增任何包，故无需 registry 查询。

## Package Legitimacy Audit

> 本阶段**不安装任何外部包**（零新增依赖），因此本审计表为空。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — no packages installed in Phase 3)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### Recommended Project Structure

```
src/control/
├── types.ts          # Round 1（门禁物）：SkillIntentKind + 全部 I* 契约；Round 2 在文件末尾追加
│                     #   「默认 AI 内部类型」分区（行为树节点/状态，非契约，AGENTS §2 要求集中于此）
├── constants.ts      # Round 2：DECISION_INTERVAL_TICKS=6 / RAY_COUNT=64 / SENSING_MAX_DISTANCE=50
│                     #   / MAX_NEIGHBORS=16 / 技能冷却 tick / 默认 AI 参数（全部顶层 const + JSDoc）
├── Sensor.ts         # Round 2：class Sensor implements ISensor
├── ControlSystem.ts  # Round 2：class ControlSystem implements IControlSystem
└── DefaultUnitAI.ts  # Round 2：class DefaultUnitAI implements IUnitAI（内含最小行为树）

tests/control/
├── types.test.ts     # Round 1：枚举钉版 + 编译期契约断言（expectTypeOf）
├── arena.ts          # Round 2：ArenaSensingWorld implements ISensingWorld（测试夹具，不放 src）
├── sensing.test.ts   # Round 2：64 射线/50m 截断/16 敌 16 友/射弹恒空
├── loop.test.ts      # Round 2：6 tick 节奏 / 力每 tick 重施加 / 伤害路由 / 死亡注销
├── default-ai.test.ts# Round 2：合成 observation 下的接近/攻击/脱离行为节点
└── pluggable.test.ts # Round 2：替换 Provider 后物理/单位不动、模拟持续运行
```

### Pattern 1: 每决策纯数据快照（D-05）

**What:** AI 只消费一次决策的不可变数据快照，绝不持有物理世界/`Unit` 引用。
**When to use:** 全部单位级 AI；可插拔、可序列化、可单测。
**Example:**

```ts
// Source: 本仓库 D-05 + 外部佐证（openturn bots：「decide receives what the seat is allowed to know」）
export interface IUnitObservation {
    readonly unitId: number;
    readonly tick: number;
    readonly attributes: Readonly<Record<AttributeKind, number>>;
    readonly classKind: ClassKind;
    readonly equipment: readonly IEquipment[];
    readonly skills: readonly SkillKind[];
    readonly motion: IUnitState;
    readonly rayDistances: readonly number[];
    readonly enemies: readonly IUnitBrief[];
    readonly allies: readonly IUnitBrief[];
    readonly projectiles: readonly IProjectileSighting[];
}
export interface IUnitAI {
    decide(observation: IUnitObservation): IUnitAction;
}
```

### Pattern 2: Provider 作为唯一插拔点（D-11）

```ts
// Source: 本仓库 D-11/D-18 + 外部佐证（biomata-engine：Protocol 类插件不改 core）
export interface IUnitAIProvider {
    create(unitId: number, unit: IUnit): IUnitAI;
    destroy(unitId: number): void;
}
```

`create` 只拿到 `unitId` 与 `IUnit`（可读 `ControlLevel`、职业、技能），因此 v2 的 RL/LLM controller 或「按控制等级阶梯选模型」无需改动物理/单位/控制循环。

### Pattern 3: 控制循环编排（D-12）

```ts
// Source: 本仓库 D-12/D-13；力/力矩清空经 PhysicsWorld.ts:432-433 验证
tick(): IControlTickResult {
    // 1) 决策：全局对齐的每 6 tick 一次（tickIndex % 6 === 0）
    // 2) 施加：对每单位合成净力/力矩，逐物理 tick 重新施加（物理层每 tick 后清空）
    // 3) physics.tick() → 拿 damages
    // 4) damages → this.damageSink.applyDamage(context)（同队过滤在 sink，D-09）
    // 5) 死亡：provider.destroy + 目录删除 + physics.removeUnit
}
```

**决策先于施加**（而非 D-12 字面「先施加再决策」）：决策 tick 的动作从**当 tick 起**生效，避免 1 tick（16ms）延迟，且让「tick 0/6/12 各决策一次」成为可硬断言的契约。见 Assumptions A5。

### Pattern 4: 判别联合的技能意图（D-17）

```ts
export enum SkillIntentKind { Weapon = 0, Unit = 1 }
export interface IWeaponSkillIntent {
    readonly kind: SkillIntentKind.Weapon;
    readonly unitId: number;
    readonly weapon: WeaponKind;   // Phase 3 仅弓箭即可射（WeaponKind.Bow = 4）
}
export interface IUnitSkillIntent {
    readonly kind: SkillIntentKind.Unit;
    readonly unitId: number;
    readonly skill: SkillKind;     // ArrowStorm=0 / Charge=1 / Spin=2
}
export type SkillIntent = IWeaponSkillIntent | IUnitSkillIntent;
```

### Anti-Patterns to Avoid

- **让 AI 直接调用 `applyForce`/`physics`：** 破坏可插拔与可测（D-05）。AI 只返回动作，控制层施加。
- **在 `ControlSystem` 里写同队过滤/伤害公式/经验：** 违反 D-09/D-10「ControlSystem 只路由」。
- **扩展 `IPhysicsWorld` 加射线/阵营/项目：** 冻结契约，D-01 明确禁止。
- **把力/力矩只施加一次：** 物理每 tick 后清空（`PhysicsWorld.ts:432-433`），一次施加后下一 tick 归零。
- **依赖 `expectTypeOf` 在 `vitest run` 中失败：** `expectTypeOf` 运行时是空操作（类型被擦除）；类型回归只能靠 `pnpm typecheck` 捕获——Round 1 必须同时跑两者。
- **一个行为树实例在多个单位间共享：** 无状态 memoryless 树可安全共享，但只要节点持有 `Running`/`current` 状态，就必须每单位一份（我们的设计是每单位一个 `IUnitAI`，天然 safel；外部资料明确警告跨 agent 共享有状态节点的 bug）。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 类型契约测试 | 自定义 `tsc` 输出解析 / 手写 dtslint | Vitest `expectTypeOf`（仓库已在 `tests/units/types.test.ts` 使用，`vitest/globals.d.ts` 已声明） | 零依赖、已在门禁链中（`pnpm typecheck` + `pnpm test`） |
| 随机源 | 新随机实现 | `IRng` + `MathRng` + `sampleNormal`（`src/common/`，AGENTS §9） | 通用抽象已存在，测试用 `tests/helpers/rng.ts` 的 `mulberry32` |
| 装备→物理数值映射 | 重新定义装备表 | `WEAPON_DEFS`/`ARMOR_DEFS`（`src/units/data.ts`）+ `IUnit.getEquipment()` | 唯一数据源；否则破甲/质量会分叉 |
| 行为树运行时 | 引入外部 BT 库（8 composites/30+ decorators/编辑器/blackboard） | 自研 ~100 行最小树（Sequence/Selector/Condition/Action + 3 值状态枚举） | 项目明确排除 GOAP/HTN/MCTS 且反对过度工程；外部资料佐证核心树约 100 行，生产级特性（跨 agent blackboard、enter/exit hooks、数据驱动树）本阶段都不需要 |
| 感知射线几何 | 引入碰撞检测库 | 解析「射线×AABB（边界）+ 射线×圆（单位）」约 30 行 | 单位是圆、边界是矩形；Phase 4 地图障碍可选择 Rapier `castRay`（已验证存在） |

**Key insight:** 本阶段的复杂度全在**契约边界**上，不在算法上。任何"帮我们抽象"的库都会把冻结契约之外的耦合带进来，与本项目「只留必要接口」的方向相反。

## Common Pitfalls

### Pitfall 1: 物理每 tick 清空力/力矩 —— 动作必须每 tick 重施加
**What goes wrong:** 只在决策 tick 施力，单位只在 1/60 秒内受力，随后速度恒定（无阻尼）或停在原地。
**Why it happens:** `PhysicsWorld.tick()` 末尾对每个刚体执行 `body.resetForces(false); body.resetTorques(false);`（`PhysicsWorld.ts:432-433`）。`applyForce` 是 `addForce(..., true)`（累积，`PhysicsWorld.ts:179`）。
**How to avoid:** `ControlSystem` 保存每单位当前 `IUnitAction`，**每个物理 tick** 施加一次（D-13），在 `physics.tick()` 之前。
**Warning signs:** 单位"脉冲式"移动、位移不随决策间隔增长。

### Pitfall 2: Rapier 无默认阻尼 —— 恒定力会持续加速
**What goes wrong:** 默认 AI 对目标施固定大小的力 → 单位越跑越快、越过目标、无限打转。
**Why it happens:** 运行时探针（Rapier 0.21.0）确认 `linearDamping: 0`、`angularDamping: 0`；`IPhysicsConfig` 无阻尼字段且契约冻结。
**How to avoid:** AI 用**速度误差控制**：`f = clamp(kp·(vDesired − vCurrent) ± ...)`；转向用 PD（`torque = kp·angleError − kd·angularVelocity`）。默认 AI 只求"能跑"，不必调参，但必须能停/能绕。
**Warning signs:** 单位在目标附近高速振荡。

### Pitfall 3: 零力施力会唤醒睡眠刚体
**What goes wrong:** 每 tick 对所有单位 `applyForce(0,0)`/`applyTorque(0)`（`wake=true`），Rapier 的休眠机制失效，数十单位性能下降。
**Why it happens:** `applyForce` 固定用 `addForce(..., true)`（`PhysicsWorld.ts:179`），wake 参数不可配。
**How to avoid:** 动作的净力/力矩全为 0 时**跳过施加**。Round 2 加一个 smoke/perf 断言可选。
**Warning signs:** 空闲单位的 `isSleeping()` 始终为 false。

### Pitfall 4: 冻结的物理注册快照（WR-01 / D-19）
**What goes wrong:** AI 读到升级后的实时攻击/防御/装备，但物理伤害仍用注册时快照 → 表现与数值不一致。
**Why it happens:** `PhysicsWorld.specs` 按引用保存 `readonly IUnitPhysicsSpec`，无刷新入口（`PhysicsWorld.ts:49-58` 注释明确 WR-01）。
**How to avoid:** Phase 3 **接受**该局限（D-19），不重新注册；在测试与文档中明示，不要让默认 AI 假设物理会用实时数值。
**Warning signs:** 升级后伤害不变。

### Pitfall 5: `IUnitPhysicsSpec` 只支持单武器，而装备可有多把
**What goes wrong:** 4 级狂战士解锁第二把斧头（`data.ts:154-160` `level: 4, ... WeaponKind.Axe`），但 `IUnitPhysicsSpec.weapon` 是单值（`physics/types.ts:68` `readonly weapon: IWeaponDef | null;`）。
**Why it happens:** 物理契约冻结，无多武器表示。
**How to avoid:** `registerUnit` 取 `getEquipment()` 中**第一件武器**（初始武器优先），并在 JSDoc 明确记录为已接受局限（见 Assumptions A3）；不要改动物理契约。
**Warning signs:** 第二次解锁的武器"没有质量/不参与碰撞"（预期）。

### Pitfall 6: `IPhysicsWorld` 无射线查询，别去扩展它
**What goes wrong:** 试图给物理层加 `raycast` 满足 64 射线 → 违反 D-01 冻结契约。
**Why it happens:** `IPhysicsWorld` 仅 9 个方法（`physics/types.ts:195-212`），`IUnitState` 也不含几何。
**How to avoid:** 感知全部走 `ISensingWorld`（D-01）；Phase 3 解析几何，Phase 4 可选 Rapier `castRay`（`castRay(ray, maxToi, solid, ...): RayColliderHit | null`，`world.d.ts:389`）。
**Warning signs:** 对 `src/physics/types.ts` 的 diff。

### Pitfall 7: `expectTypeOf` 是运行时空操作
**What goes wrong:** 只跑 `pnpm test` 就以为类型契约被验证 → 类型回归漏检。
**Why it happens:** 类型在运行前被擦除，`expectTypeOf` 只被 `tsc` 检查（`tests/units/types.test.ts:66-72` 就是这种范式）。
**How to avoid:** Round 1 的门禁命令是 **`pnpm typecheck` + `pnpm test` + `pnpm lint`** 三者。
**Warning signs:** 改了 `IUnitObservation` 字段但测试仍绿。

### Pitfall 8: `getUnitState` 对未知 id 返回 `null`
**What goes wrong:** 单位已从物理移除但仍在控制目录 → `sense` 时拿到 `null`，抛错或产生 NaN 运动读数。
**Why it happens:** `getUnitState` 明确「未知 id 返回 `null`」（`physics/types.ts:206-207`、`PhysicsWorld.ts:190-205`）。
**How to avoid:** `Sensor.sense(unitId)` 返回 `IUnitObservation | null`；`ControlSystem` 跳过 null（该单位本 tick 不决策/不施力）。`registerUnit` 先 `physics.registerUnit` 再入目录，保持一致。
**Warning signs:** 决策时报 "cannot read x of null"。

### Pitfall 9: `registerUnit` 对重复 id 抛错
**What goes wrong:** 重复注册（同 id）→ `PhysicsWorld.registerUnit` 抛 `unit ${id} is already registered`（`PhysicsWorld.ts:91-95`）。
**How to avoid:** `ControlSystem.registerUnit` 先检查目录；文档化"重复注册抛错"语义。
**Warning signs:** 测试 setup 重用时崩溃。

### Pitfall 10: 力矩/角度符号约定
**What goes wrong:** `torqueClockwise` 与 `torqueCounterClockwise` 合成后方向反了，单位朝错误方向旋转。
**Why it happens:** 需要确认 Rapier 正力矩方向。**运行时探针已验证**：`addTorque(100)` 一步后 `angle: +0.00198`、`angvel: +0.1905` → **正力矩 = 逆时针（CCW）**。
**How to avoid:** 明确约定 `torque = torqueCounterClockwise − torqueClockwise`；`forceUp = +y`、`forceRight = +x`（Rapier 2D 为 y 向上、角度逆时针）。Round 2 用一条 `applyTorque` 回归测试钉住符号。
**Warning signs:** 默认 AI 越转向越偏。

### Pitfall 11: 同 tick 内对已死单位的后续伤害事件
**What goes wrong:** 一个单位本 tick 死亡后，同一 tick 的后续 `IDamageEvent` 仍打到它 → 负血量/重复击杀经验。
**How to avoid:** sink 在 `applyDamage` 前检查 `defender.isAlive()`（或 `ControlSystem` 在路由前过滤）；死亡注销在本 tick 全部事件处理完之后批量执行。
**Warning signs:** 击杀经验被重复累加。

## Runtime State Inventory

> 本阶段为**新建模块**（greenfield），非 rename/refactor/migration 阶段 → 本节按协议可省略。确认：Phase 3 不重命名任何已存在的字符串/路径，不涉及存储数据、活动服务配置、OS 注册项、密钥/环境变量、构建产物。

## Code Examples

以下为契约骨架（Round 1 的实际产物草稿），全部值均与已冻结契约一致。

### 推荐的 Round 1 契约集合（`src/control/types.ts`）

```ts
// 全部为声明（数字枚举 + 接口 + 一个判别联合别名）；无算法、无 Rapier、无顶层 const。
import type { IDamageEvent, IUnitState } from '@/physics/types';
import type {
    AttributeKind, ClassKind, IEquipment, IUnit, SkillKind, WeaponKind
} from '@/units/types';

/** 技能意图判别式。 */
export enum SkillIntentKind { Weapon = 0, Unit = 1 }

/** 16 敌/16 友简讯：仅文档明确字段（D-03）。 */
export interface IUnitBrief {
    readonly unitId: number;
    readonly health: number;
    readonly level: number;
    readonly x: number;
    readonly y: number;
    readonly equipment: readonly IEquipment[];
}

/** 射弹简讯（Phase 3 恒为空数组，D-04）。 */
export interface IProjectileSighting {
    readonly x: number;
    readonly y: number;
    readonly distance: number;
}

/** 可作为射线遮挡的空间单位事实（只由 Sensor 传入敌人，D-02）。 */
export interface ISensedUnit {
    readonly unitId: number;
    readonly teamId: number;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
}

/** 感知世界：环境几何（边界/未来障碍）与射弹；实现由测试竞技场（Phase 3）/王国世界（Phase 4）提供（D-01）。 */
export interface ISensingWorld {
    castRayFan(originX: number, originY: number, maxDistance: number,
               blockers: readonly ISensedUnit[]): readonly number[];
    queryProjectiles(x: number, y: number, radius: number): readonly IProjectileSighting[];
}

/** AI 输入：一次决策的纯数据快照（D-05）。 */
export interface IUnitObservation {
    readonly unitId: number;
    readonly tick: number;
    readonly attributes: Readonly<Record<AttributeKind, number>>;
    readonly classKind: ClassKind;
    readonly equipment: readonly IEquipment[];
    readonly skills: readonly SkillKind[];
    readonly motion: IUnitState;
    readonly rayDistances: readonly number[];
    readonly enemies: readonly IUnitBrief[];
    readonly allies: readonly IUnitBrief[];
    readonly projectiles: readonly IProjectileSighting[];
}

export interface IWeaponSkillIntent {
    readonly kind: SkillIntentKind.Weapon; readonly unitId: number; readonly weapon: WeaponKind;
}
export interface IUnitSkillIntent {
    readonly kind: SkillIntentKind.Unit; readonly unitId: number; readonly skill: SkillKind;
}
export type SkillIntent = IWeaponSkillIntent | IUnitSkillIntent;

/** AI 输出：世界坐标四向力 + 双向力矩 + 可空技能意图（D-13）。 */
export interface IUnitAction {
    readonly forceUp: number;
    readonly forceDown: number;
    readonly forceLeft: number;
    readonly forceRight: number;
    readonly torqueClockwise: number;
    readonly torqueCounterClockwise: number;
    readonly skillIntent: SkillIntent | null;
}

export interface IUnitAI { decide(observation: IUnitObservation): IUnitAction; }

export interface IUnitAIProvider {
    create(unitId: number, unit: IUnit): IUnitAI;
    destroy(unitId: number): void;
}

export interface ISensor { sense(unitId: number): IUnitObservation | null; }

export interface IUnitCatalog {
    getUnit(unitId: number): IUnit | null;
    getTeam(unitId: number): number | undefined;
    listUnitIds(): readonly number[];
}

export interface IDamageContext {
    readonly event: IDamageEvent;
    readonly attacker: IUnit;
    readonly defender: IUnit;
    readonly attackerTeamId: number;
    readonly defenderTeamId: number;
}
export interface IDamageSink { applyDamage(context: IDamageContext): void; }

export interface IControlUnitRegistration {
    readonly unitId: number;
    readonly unit: IUnit;
    readonly teamId: number;
    readonly x: number;
    readonly y: number;
}

export interface IControlTickResult { readonly skillIntents: readonly SkillIntent[]; }

export interface IControlSystem extends IUnitCatalog {
    registerUnit(request: IControlUnitRegistration): void;
    unregisterUnit(unitId: number): void;
    updateTeam(unitId: number, teamId: number): void;   // D-07 预留
    tick(): IControlTickResult;
    dispose(): void;
}
```

### Round 1 编译期契约测试（`tests/control/types.test.ts`）

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { SkillIntentKind } from '@/control/types';
import type { IUnitAI, IUnitAIProvider, IUnitAction, IUnitObservation,
              IUnitState, IUnitBrief } from '@/control/types';

describe('control-system types', () => {
    it('pins SkillIntentKind to numeric ordinals', () => {
        expect(SkillIntentKind.Weapon).toBe(0);
        expect(SkillIntentKind.Unit).toBe(1);
        expect(typeof SkillIntentKind.Weapon).toBe('number');
    });

    it('IUnitObservation is constructible; RayFan/briefs are readonly arrays', () => {
        // 完整对象字面量 = 编译期证明 attributes 覆盖全部 13 个 AttributeKind。
        const obs: IUnitObservation = { /* ...全部字段... */ };
        expectTypeOf(obs.rayDistances).toEqualTypeOf<readonly number[]>();
        expectTypeOf(obs.enemies).toEqualTypeOf<readonly IUnitBrief[]>();
        expectTypeOf(obs.motion).toEqualTypeOf<IUnitState>();
        expect(obs).toBeTruthy();
    });

    it('IUnitAI maps a snapshot to an action; provider is a factory', () => {
        expectTypeOf<IUnitAI['decide']>().parameter(0).toEqualTypeOf<IUnitObservation>();
        expectTypeOf<ReturnType<IUnitAI['decide']>>().toEqualTypeOf<IUnitAction>();
        expectTypeOf<ReturnType<IUnitAIProvider['create']>>().toEqualTypeOf<IUnitAI>();
    });
});
```

### 感知竞技场射线几何（Round 2 参考实现，测试夹具）

```ts
// 射线起点角 0（+x），逆时针累加 2π/64（agent's discretion；D-02 未指定起点）。
// 距离 = min(边界 AABB, 最近敌人圆)，钳制到 [0, maxDistance]；无命中 = maxDistance。
// 敌人圆由 Sensor 传入（只有敌人，友方结构性地不遮挡，D-02）。
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 单一全局 AI / 内嵌 if-else | 每单位一个可插拔 controller，消费纯 observation 快照 | 本项目提出的 v1 契约 | 可换 RL/LLM（v2/Phase 7）而不动模拟；可单测行为 |
| 同步阻塞等待远程模型 | 感知/决策/动作解耦；决策可离线，动作在 tick 边界入队 | 外部资料（Limina fixed-timestep 文章） | 本阶段 `decide` 保持**同步**（默认 AI 是纯计算）；契约的快照形状让 v2 异步 provider 能在 tick 之间自行准备动作（见 A2） |
| 数据驱动/异步 BT 库 | 最小同步 memoryless BT（每单位一树） | 外部资料佐证核心 ~100 行 | 无需 blackboard/editor/enter-exit hooks |

**Deprecated/outdated:** 无（本阶段全部为新建）。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ISensingWorld` 只负责**环境几何**（边界/未来障碍/射弹 + 对传入 `blockers` 的射线计算）；单位位置/阵营由 `Sensor` 从 `IUnitCatalog` + `IPhysicsWorld` 取得 | Standard Stack / Architecture | D-01 原文「竞技场实现提供边界与单位」可读作「世界拥有单位」。若用户要求世界拥有单位，需要给 `ISensingWorld` 加注册/查询单位的方法（协议面扩大） |
| A2 | `IUnitAI.decide` 为**同步**纯函数；v2 异步（RL/LLM）provider 自行在 tick 之间准备动作 | Pattern 1 | 若要求 async decide，控制循环需改为 await/队列，破坏固定 tick 的同步骨架 |
| A3 | 多件武器时 `ControlSystem` 取 `getEquipment()` 中**第一件武器**构造 `IUnitPhysicsSpec`（物理只支持单武器） | Pitfall 5 | 若用户希望取最高攻击/其它规则（如第二把斧头生效），需在 Round 2 前定夺；影响 Phase 1 数据表的多武器职业 |
| A4 | 动作的四个力与两个力矩为**非负大小**；`ControlSystem` 对非有限/负数做钳制（防御性） | Pattern 4 | 若允许负值表示反向，则合成规则需改为有符号语义 |
| A5 | 决策 tick 的动作为「**先决策、后施加、再 physics.tick()**」，决策发生在 tick 0/6/12… | Pattern 3 | 与 D-12 字面「先施加再决策」有 1 tick 偏差；改字面实现则决策发生在 tick 6/12 并延后一 tick 生效 |
| A6 | 邻居查询半径取常量（约 100m，见规格军队视野半径），默认 AI 只取半径内最近 16 | CTRL-01 / Open Questions | 半径过小会漏掉"最近 16"；需实测校准 |
| A7 | 技能**冷却由 AI 实例持有**（D-11 允许），控制层只把 `skillIntent` 转发进 `IControlTickResult`；无 `ISkillSink` | Pattern 4 | 若用户希望控制层统一管理冷却/执行，需增加 sink 或把冷却移入 `ControlSystem` |
| A8 | **死亡注销由 `ControlSystem` 统一执行**（provider.destroy + 目录删除 + physics.removeUnit）；`IDamageSink` 只做伤害/经验 | Architecture | D-10 字面把「死亡移除」列在测试胶合 sink 内；单点拥有注销更安全（避免双移除/泄漏），但改变了字面分工 |
| A9 | 64 射线起点角为 0（+x），逆时针步进 2π/64 | Pattern 4 / pitfall | 起点仅影响数组下标与 AI 的空间索引；用户可能在门禁时指定 |
| A10 | 射线对单位的遮挡用本体半径（`DEFAULT_GEOMETRY.bodyRadius = 0.5`） | Sensing | 若应包含武器/防具半径，射线距离会略小；Phase 3 用本体半径最简单 |

**If this table is empty:** 不适用——上表非空，用户需在门禁时确认 A1/A3/A5/A7/A8。

## Open Questions

1. **`ISensingWorld` 是否拥有单位？（A1）**
   - What we know: D-01 说「竞技场实现提供边界与单位」；D-02 说射线命中敌人但不命中友方。
   - What's unclear: 「提供单位」是指世界层持有单位位置/阵营，还是仅由 Sensor 把敌人圆传入射线计算。
   - Recommendation: 采用 A1（环境层 + Sensor 传敌人块）——最少循环依赖、最易测试；在 Round 1 类型门禁时请用户明确。

2. **技能意图的产出通道（A7）**
   - What we know: D-17 只要求意图 + 冷却；执行留 Phase 4。
   - What's unclear: 意图应经 `IControlTickResult` 返回，还是经注入的 `ISkillSink`（对称于 `IDamageSink`）。
   - Recommendation: `IControlTickResult.skillIntents`（不加接口，测试可直接断言；Phase 4 驱动时能拿到返回值）。

3. **冷却归属（A7）**
   - Recommendation: AI 实例持有（D-11 明示 AI 可持有冷却），控制层不做技能逻辑。

4. **邻居半径（A6）**
   - Recommendation: Round 2 常量 `NEIGHBOR_QUERY_RADIUS = 100`，标注可校准；若需要"最近 16"无上限，则需要全量遍历（更贵）。

5. **`IControlSystem` 是否暴露单位/阵营读接口（`IUnitCatalog`）**
   - What we know: `Sensor` 需要 unitId→IUnit/teamId；sink 通过 `IDamageContext` 拿到已解析的单位。
   - Recommendation: 暴露 `IUnitCatalog`（`getUnit`/`getTeam`/`listUnitIds`），由 `ControlSystem` 实现；这是 Sensor 与测试的必要读路径，不是"多余定制点"。

6. **Round 2 追加内部类型到 `types.ts` 是否越界门禁**
   - Recommendation: 门禁冻结的是**契约**（插件边界上的类型）；行为树节点/状态等默认 AI 内部类型属实现细节，Round 2 追加到同一文件末尾并明确标注"非契约"。若用户要求门禁冻结整文件，则 Round 1 需把 BT 内部类型也一并声明。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 全部 | ✓ | v24.21.0 | — |
| pnpm | 依赖/脚本 | ✓ | 12.5.1 | — |
| `@dimforge/rapier2d-compat` | 物理执行器（Phase 2 产物） | ✓ | 0.21.0（精确钉版） | — |
| Vitest | Round 1/2 测试 | ✓ | 5.0.4 | — |
| TypeScript 工具链 | `pnpm typecheck` | ✓ | 双别名（TS6/TS7） | — |
| 知识图谱 `.planning/graphs/graph.json` | 图上下文研究 | ✗ | — | 无图上下文，按现状研究（本文件即结论） |

**Missing dependencies with no fallback:**
- 无。

**Missing dependencies with fallback:**
- 知识图谱不存在——不影响本阶段；研究基于源码/运行时探针完成。

**Baseline verification（本会话实测）:** `pnpm typecheck` 通过；`pnpm test` = 15 文件 / 113 测试全绿；`node --version` = v24.21.0；`pnpm --version` = 12.5.1。

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4 |
| Config file | `vitest.config.ts`（`environment: 'node'`；`include: ['tests/**/*.test.ts']`；别名 `@` → `src/`） |
| Quick run command | `pnpm vitest run tests/control/types.test.ts` |
| Full suite command | `pnpm test`（+ **`pnpm typecheck`** —— Round 1 的真实门禁；+ `pnpm lint`） |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-01 | `IUnitObservation` 可构造、字段类型正确、64/16/16/空射弹语义 | unit（编译期）| `pnpm typecheck` + `pnpm vitest run tests/control/types.test.ts` | ❌ Wave 0（Round 1） |
| CTRL-01 | 感知产出 64 条 [0,50] 距离、≤16 敌/≤16 友、射弹恒空 | integration | `pnpm vitest run tests/control/sensing.test.ts` | ❌ Round 2 |
| CTRL-02 | `IUnitAction` 可构造；净力/力矩合成正确；技能意图只在决策 tick 出现一次 | unit + integration | `pnpm vitest run tests/control/loop.test.ts` | ❌ Round 2 |
| CTRL-03 | 决策恰好发生在 tick 0/6/12…，其余 tick 不决策 | integration | `pnpm vitest run tests/control/loop.test.ts` | ❌ Round 2 |
| CTRL-04 | 换 provider 后物理/单位代码不变、模拟跑 N tick 不崩 | integration | `pnpm vitest run tests/control/pluggable.test.ts` | ❌ Round 2 |
| CTRL-04 | 默认 AI 自主：接近→攻击→脱离；无人工输入 | integration + unit | `pnpm vitest run tests/control/default-ai.test.ts` | ❌ Round 2 |

### Sampling Rate

- **Per task commit:** `pnpm typecheck` + `pnpm vitest run tests/control/`（快）
- **Per wave merge:** `pnpm test` + `pnpm lint`
- **Phase gate:** 全套绿（含 `pnpm typecheck`）后才进入 `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/control/` 目录 + `tests/control/types.test.ts`（Round 1 的唯一脚手架；无框架安装）
- [ ] Round 2：`tests/control/arena.ts`（`ArenaSensingWorld` 测试夹具）+ 4 个行为测试文件
- [ ] 无需新增依赖、无需改 `vitest.config.ts`

*(No gap: 现有 Vitest/别名/TS 配置完全覆盖本阶段；Round 1 只是新增一个测试目录。)*

## Security Domain

> `security_enforcement: true`（`.planning/config.json:47`），ASVS level 1。本阶段为纯本地单进程模拟，无网络/认证/持久化面。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 无身份/登录面 |
| V3 Session Management | no | 无会话 |
| V4 Access Control | no | 无多用户/权限 |
| V5 Input Validation | **yes** | 校验并钳制 AI 输出（`Number.isFinite`、非负、上限）；`ControlSystem` 是唯一执行边界；AI 无物理/单位可变引用（D-05） |
| V6 Cryptography | no | 无加密面 |

### Known Threat Patterns for 可插拔 AI（in-process plugin）

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AI 返回 `NaN`/`Infinity` 污染物理与状态 | Tampering | 施加前 `Number.isFinite` 检查，非有限按 0；负数钳为 0（镜像 `Unit.takeDamage` 的 `Number.isFinite` 护栏，`Unit.ts:186-195`） |
| 恶意/有 Bug 的插件 `decide` 抛异常导致整场模拟崩溃 | Denial of Service | `ControlSystem` 用 try/catch 包裹 `decide`，异常时回退**零动作**（单位停止）并继续模拟；不把异常泄漏进 tick 循环 |
| AI 通过返回极端力值把单位弹出世界 | Tampering | 对净力/力矩加上限常量（Round 2 默认 AI 参数同源），超限钳制 |
| 插件无限循环阻塞固定 tick | DoS | 契约上 `decide` 必须是短同步函数；v1 无法在 JS 内强制中断（记录为已知限制，v2 远程/异步 provider 时重新评估） |

## Sources

### Primary (HIGH confidence — 本会话读了源码 / 运行时探针)
- `src/physics/PhysicsWorld.ts:174-205, 207-436` — `applyForce`/`applyTorque`/`getUnitState`；`tick()` 末尾 `resetForces/resetTorques`（432-433）；`specs` 快照 WR-01（49-58）。
- `src/physics/types.ts:21-28, 35-44, 51-72, 77-90, 128-149, 195-212` — `ColliderPart`、`IUnitPhysicsSpec`（单 `weapon`）、`IUnitState`、`IDamageEvent`、`IPhysicsWorld` 9 方法。
- `src/physics/constants.ts:14, 31-42` — `DT = 1 / 60`；`DEFAULT_GEOMETRY.bodyRadius = 0.5`。
- `src/units/types.ts:13-40, 85-92, 224-247` — `AttributeKind`（Health=0…Mass=12）；`SkillKind`（ArrowStorm=0/Charge=1/Spin=2、Bow=4）；`IUnit` 方法集。
- `src/units/Unit.ts:106-154, 167-169, 186-195` — `getAttribute`、`getEquipment` 返回副本、`takeDamage` 护栏。
- `src/units/data.ts:154-166, 325-368` — 狂战士 4 级第二把斧头；`WEAPON_DEFS`。
- `src/common/types.ts:11-13`、`src/common/rng.ts:13-45` — `IRng`/`MathRng`/`sampleNormal`。
- `tests/units/types.test.ts:1, 66-72`、`tests/physics/tick.test.ts`、`tests/helpers/rng.ts` — `expectTypeOf` 与 Rapier 夹具范式；`mulberry32`。
- `node_modules/@dimforge/rapier2d-compat/dist/pipeline/world.d.ts:389` — `castRay(ray, maxToi, solid, ...): RayColliderHit | null`；`dist/geometry/ray.d.ts:9-108`。
- 运行时探针（Rapier 0.21.0）：`addTorque(+100)` → 正角度/正角速度（正 = CCW）；`linearDamping()/angularDamping()` 均为 0；力在每步 reset 后速度保持（无阻尼）。
- `package.json:8, 18, 23, 26, 29`、`tsconfig.json:20-27`、`vitest.config.ts:1-21`、`.planning/config.json:24,47`、`ROADMAP.md:114-128`。
- 仓库基线：`pnpm typecheck` 通过；`pnpm test` 15 文件/113 测试全绿。

### Secondary (MEDIUM confidence — 外部资料，与官方/一手实现交叉)
- https://www.behaviortrees.com/learn/how-to-implement-a-behavior-tree/ — 核心树约 100 行（Status/Node/Condition/Action/Sequence/Selector）；生产级增量（blackboard、enter/exit hooks、数据驱动）。
- https://www.liminaengine.com/concepts/loop/ — 固定步长循环；「感知/动作在帧上、决策在帧外」——佐证契约应可序列化以支持 v2 异步 provider。
- https://openturn.io/docs/concepts/bots — bot = 对 view 的 `decide` 纯函数，引擎不感知 bot/人类之别——佐证 D-11 插拔点形状。
- `node_modules/vitest/globals.d.ts:7` — `expectTypeOf` 全局声明。

### Tertiary (LOW confidence)
- 无（所有外部资料仅用于佐证设计方向，不承载具体数值）。

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 本阶段零新增依赖；全部版本经 `package.json` 与安装目录核实。
- Architecture: MEDIUM — 契约形状是待用户门禁审查的**设计提案**；集成现实（力清空、无射线、冻结快照、无阻尼、单武器）为 HIGH（读源码/探针）。
- Pitfalls: HIGH — 11 条陷阱中 8 条源于本会话读到的冻结契约或运行时探针。

**Research date:** 2026-10-19
**Valid until:** 2026-11-18（稳定；依赖的 Rapier/Vitest 均为钉版/既有，变化源主要来自用户对 A1/A3/A5/A7/A8 的门禁决定）
