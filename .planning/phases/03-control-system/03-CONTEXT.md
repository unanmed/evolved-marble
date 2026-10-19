# Phase 3: 操控系统 - Context

**Gathered:** 2026-10-19
**Status:** Ready for planning

<domain>
## Phase Boundary

交付单位级操控系统：定义 AI 的输入/输出契约（自身属性、位置、64 条射线、射弹距离、16 敌/16 友；世界坐标四向力、旋转力、武器技能、单位技能）、0.1s（6 tick）决策节奏、可插拔的每单位 AI Provider，以及一个仅用于验证「模拟可自主运行」的默认基线 AI。

本阶段不实现：王国地图/势力/军队/城池/战斗触发与结算（Phase 4）、射弹与技能物理效果、渲染（Phase 5）、LLM 指挥官/导演（Phase 7）。默认基线 AI 不是最终战斗 AI；后续单位控制整体替换为可插拔 AI（项目核心是 AI）。

</domain>

<decisions>
## Implementation Decisions

### 感知与 AI 输入契约

- **D-01:** 感知是**控制层自己的接口**（`ISensor` / `ISensingWorld`），控制层只依赖该接口，**不扩展、不修改 Phase 2 已冻结的 `IPhysicsWorld`**。Phase 3 由测试/竞技场实现提供边界与单位，Phase 4 由王国世界实现同一接口。 — **Reversibility:** costly — 每个 AI 实现与 Phase 4 世界都依赖该感知边界，替换会波及全部 AI 输入构造。
- **D-02:** 64 条射线**以世界坐标固定方向**均匀分布、不随本体旋转；最远 50m（超出按 50m）。射线命中**竞技场/地图边界 + 敌方单位 + 未来地图障碍物**；友方单位不作为射线障碍。未来障碍物只**预留接口能力**，Phase 3 不实现地图障碍。 — **Reversibility:** costly — 射线数量/坐标系/命中集合是 AI 输入契约，改动会影响所有 AI 的空间判断与调参。
- **D-03:** 16 敌/16 友简讯**先只包含文档明确字段**：`unitId`、生命值、等级、位置、装备（武器/防具种类）；按距离升序、仅存活单位、每类最多 16 个。**不加入速度/职业/朝向等额外字段**；接口允许后续以可选字段扩展，不破坏现有 AI。 — **Reversibility:** reversible — 新增可选字段不会破坏既有 AI 输入。
- **D-04:** 「射弹与单位的距离」用**最小射弹列表**（位置/距离，最远 50m）预留；Phase 3 恒为空数组，后续射弹系统出现时填充，**不改 AI 输入契约**。单位距离由 16 敌/16 友列表覆盖。 — **Reversibility:** reversible — 空列表占位，不影响现有行为。
- **D-05:** AI 输入是**每次决策的纯数据快照**：自身属性读数 + 自身运动状态（位置/朝向/线速度/角速度）+ 感知结果。AI **不直接访问 Rapier、物理世界或 `Unit` 的可变方法**；实现可替换、可单测、可序列化。 — **Reversibility:** costly — 所有 AI 实现与测试夹具都消费该快照形状。
- **D-06:** 控制注册把 `unitId ↔ IUnit ↔ teamId` 绑定起来，并由控制层从 `IUnit` 属性与 `CLASS/WEAPON/ARMOR` 数据表构造 `IUnitPhysicsSpec` 注册到物理世界；物理层契约保持冻结。 — **Reversibility:** costly — 这是控制、单位、物理三系统的唯一胶合点。

### 阵营与伤害归属

- **D-07:** 阵营标识为**控制注册时注入的数字 `teamId`**（按相等判断敌我，支持任意数量阵营），不修改 `IUnit`。**预留运行时更新入口**（如 `updateTeam`/`setTeamId`）供 Phase 4 城池易手/单位转阵营使用，Phase 3 自身不调用。 — **Reversibility:** costly — Phase 4 势力映射与所有 AI 注册都依赖该契约。
- **D-08:** **感知层负责按 `teamId` 分类并筛选** 16 敌/16 友；AI 只接收已分好的 `enemies[]` / `allies[]`，不重复实现阵营逻辑。 — **Reversibility:** reversible — 分类逻辑集中在感知层。
- **D-09:** **同队单位保留物理碰撞，但不结算伤害**。物理层照常发出 `IDamageEvent`；同队过滤发生在**伤害应用层**，不在物理层，也不改变 `IPhysicsWorld` 语义。 — **Reversibility:** costly — 伤害应用层与 Phase 4 战斗结算都必须遵守该规则。
- **D-10:** 控制层通过**可注入的 `IDamageSink`** 把物理层伤害事件交给上层：Phase 3 的测试胶合层实现「同队免伤 + `takeDamage` + 攻击/防御/击杀经验 + 死亡移除」；Phase 4 换成真实战斗结算。`ControlSystem` 只路由事件，**不拥有战斗规则**。 — **Reversibility:** costly — Phase 4 战斗层通过该接口接入。

### 可插拔架构与执行时序

- **D-11:** **每个单位一个 `IUnitAI` 实例**，由 `IUnitAIProvider.create(unitId, unit)` 创建；Provider 是替换 AI 实现的唯一插拔点。AI 实例可持有目标、冷却、行为树状态。 — **Reversibility:** costly — 所有 AI 实现与模拟胶合层依赖该生命周期契约。
- **D-12:** 控制层提供 `ControlSystem.tick()` 驱动完整循环：每 tick 施加当前动作 → 每 6 tick（0.1s）调用一次 AI 决策 → `physics.tick()` → 把伤害事件交给 `IDamageSink`。决策节奏以 tick 计数，不用 wall-clock。 — **Reversibility:** costly — 循环是所有模拟阶段的驱动骨架。
- **D-13:** AI 输出为**世界坐标四向力**（up/down/left/right 大小）+ **顺时针/逆时针力矩**；控制层合成净力/力矩。动作**保持到下一次决策**，控制层在每个物理 tick 重新施加（物理层每 tick 后清空力/力矩）；技能类输出**只在决策 tick 触发一次**，不重复施加。 — **Reversibility:** costly — 所有 AI 输出与控制执行器都依赖该语义。
- **D-14:** 默认决策结构使用**行为树**（项目已排除 GOAP/HTN/MCTS）；AI 决策是输入快照上的纯函数式选择，不直接驱动物理。 — **Reversibility:** costly — 行为树是后续 AI 的默认结构。
- **D-15:** 不保证确定性；默认基线 AI **确定性**（不依赖随机），需要随机性的测试/实现通过注入 `IRng` 获得可复现序列。 — **Reversibility:** reversible — 随机源可随时注入/替换。
- **D-19:** Phase 2 的**物理注册快照不刷新**（WR-01，已接受）在 Phase 3 继续接受：AI 读取 `IUnit` 的实时属性，但物理伤害仍使用注册时的攻击/防御/装备快照；本阶段不做升级后重新注册。 — **Reversibility:** costly — 解除该限制需要改物理注册/刷新契约。

### 默认 AI 与技能

- **D-16:** 默认基线 AI **只用于验证契约与自主运行**，不是最终战斗 AI。最小三行为：追击最近敌人、进入接触/攻击距离后攻击、生命过低时远离最近敌人。具体阈值、转向强度、攻击距离等由实现自定，不投入调参；后续整体替换为可插拔 AI。 — **Reversibility:** reversible — 默认实现可被任意 `IUnitAI` 替换。
- **D-17:** 武器技能（弓箭射箭）与单位技能（万箭齐发/冲锋/旋转）在 Phase 3 **只做输出意图 + 冷却**，**不实现射弹、冲锋位移、旋转效果等技能物理**。默认 AI 在技能已解锁且冷却结束时输出意图；实际执行留给后续战斗/技能层（Phase 4 或专门系统）。冷却以控制 tick 计数，文档给出的 5/6/7s 作为初始值，弓箭射击间隔为可校准常量。 — **Reversibility:** costly — 输出契约会被后续技能执行器消费，但执行器尚未落地。
- **D-18:** 控制等级（`AttributeKind.ControlLevel`）在 Phase 3 **不驱动默认 AI 强度**；`IUnitAIProvider` 已足够作为未来按控制等级/训练轮数选择 AI 的接入点。RL/LLM 单位控制留到 v2/Phase 7。 — **Reversibility:** reversible — Provider 可随时按等级选择不同实现。

### the agent's Discretion

- 感知快照的具体字段布局、`ISensor` / `IUnitAI` / `IUnitAIProvider` / `IDamageSink` / `IControlSystem` 的方法签名与命名。
- 64 条射线的角度起点、射线查询实现、邻居排序的并列决胜规则。
- 默认行为树的具体节点划分、低血阈值（如 25%）、攻击距离、力/力矩大小与转向控制参数。
- 冷却计时常量、弓箭射击间隔、技能触发的具体条件。
- 控制/感知/默认 AI 的文件拆分与 `src/control/` 内部组织（遵循每文件夹一个 `types.ts`）。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威规格
- `.planning/reference/ai-marble-kingdom.md` § AI 控制（约 144–162 行） — AI 输入（自身属性、位置、64 射线 50m、射弹/单位距离、16 敌/16 友简讯）与输出（四向力、旋转力、武器技能、单位技能）、每 6 帧/0.1s 决策。
- `.planning/reference/ai-marble-kingdom.md` § 战斗（约 63–85 行） — 战斗由 AI 控制、军队/城池战斗触发；本阶段只做单位级控制，不实现触发/结算。
- `.planning/reference/ai-marble-kingdom.md` § 行军（约 87–93 行） — 行军时单位由程序控制、非 AI；说明 AI 控制的适用边界。
- `.planning/reference/ai-marble-kingdom.md` § 时间系统（约 18–24 行） — 战斗 1×、tick = 游戏 1 分钟、AI 推理间隔为现实 1 秒的 1/60。
- `.planning/reference/ai-marble-kingdom.md` § 职业/技能（约 269–397 行） — 技能解锁等级与冷却（万箭齐发 5s、冲锋 7s、旋转 6s）。

### 需求与路线图
- `.planning/REQUIREMENTS.md` § CTRL（CTRL-01..04） — 本阶段 v1 需求清单。
- `.planning/ROADMAP.md` § Phase 3: 操控系统 — 目标、5 条成功标准、Type-first gate（Wave 1 类型 → 用户审查 → Wave 2 实现）。
- `.planning/PROJECT.md` § Core Value / Out of Scope / Constraints — 「战斗必须激烈好看」、排除 GOAP/HTN/MCTS（用行为树）、可插拔 AI 只留必要接口、无确定性。

### 已冻结的上游契约
- `src/units/types.ts` — `IUnit`、`AttributeKind`、`IEquipment`、`IWeaponDef`、`IArmorDef`、`SkillKind`、`WeaponKind`、`ArmorKind`、`getAttribute`/`getEquipment`/`getSkills`。
- `src/physics/types.ts` — `IPhysicsWorld`、`IUnitPhysicsSpec`、`IUnitState`、`IContactEvent`、`IDamageEvent`、`IPhysicsTickResult`。
- `src/physics/PhysicsWorld.ts` — `applyForce`/`applyTorque`/`getUnitState`/`tick` 的实际行为；每 tick 后清空力/力矩；注册快照不刷新（WR-01）。
- `src/physics/constants.ts` — `DT = 1/60`、默认几何尺寸。
- `src/common/types.ts` + `src/common/rng.ts` — `IRng`、`MathRng`、`sampleNormal`（控制器需要随机性时复用）。
- `src/units/data.ts` — `CLASS_DEFS`/`WEAPON_DEFS`/`ARMOR_DEFS`，用于从 `IUnit` 构造 `IUnitPhysicsSpec`。

### 阶段上下文
- `.planning/phases/01-unit-system/01-CONTEXT.md` — 单位契约决策 D-01..D-12（无 getter/setter、null/undefined、`src/common/`）。
- `.planning/phases/02-physics-simulation/02-CONTEXT.md` — 物理决策 D-01..D-14（复合刚体、部位事件、伤害公式、dt=1/60、物理层不拥有 Unit）。
- `AGENTS.md` § Code Conventions（强制）+ § Constraints — 接口 `I` 前缀、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、缺失值 null/undefined、通用抽象放 `src/common/`、类型先行+审查门禁。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IUnit.getAttribute(AttributeKind)` / `getEquipment()` / `getSkills()` / `isAlive()`：控制层构造自身属性快照、装备/技能列表与目标存活判断的唯一入口。
- `IPhysicsWorld.applyForce` / `applyTorque` / `getUnitState` / `tick`：AI 动作的唯一执行器；`getUnitState` 提供位置/朝向/速度读数。
- `CLASS_DEFS` / `WEAPON_DEFS` / `ARMOR_DEFS`：把 `IUnit.getEquipment()` 的枚举映射为 `IWeaponDef` / `IArmorDef`，用于构造 `IUnitPhysicsSpec`。
- `IRng` / `MathRng` / `sampleNormal`（`src/common/`）与 `tests/helpers/rng.ts`：任何随机行为/测试夹具的共享随机源。
- 现有 Vitest 物理测试（`tests/physics/*`）可作为控制测试的 Rapier 初始化、固定步进与单位注册范本。

### Established Patterns
- interface-first、每文件夹一个 `types.ts`、数字枚举、接口/私有成员 JSDoc、无 getter/setter、缺失对象 `null` / 缺失字面量 `undefined`。
- 路径别名 `@/*` → `./src/*`；质量门 `pnpm typecheck` / `pnpm test` / `pnpm lint`。
- 系统低耦合：物理层只按 `unitId` 引用单位；控制层同样应只通过接口消费单位/物理/感知。

### Integration Points
- 新建 `src/control/`：`types.ts`（输入/输出、`IUnitAI`、`IUnitAIProvider`、`ISensor`/`ISensingWorld`、`IDamageSink`、`IControlSystem`）+ 感知、控制循环、默认 AI、常量。
- 控制注册：`unitId ↔ IUnit ↔ teamId`，并从 `IUnit` 属性/装备构造 `IUnitPhysicsSpec` 注册到 `IPhysicsWorld`。
- Phase 4 替换点：用王国世界实现 `ISensingWorld`（地图边界/障碍/势力），用真实战斗结算实现 `IDamageSink`；`IUnitAIProvider` 可接 RL/LLM 单位控制。
- Phase 5 渲染只读 `IUnitState` 与单位属性，不依赖控制内部状态。

</code_context>

<specifics>
## Specific Ideas

- 用户明确：**默认 AI 行为并不重要，只要验证能跑就行，后续会全部使用 AI 控制，因为这个项目的核心就是 AI。** 因此不要把默认 AI 做成最终玩法，重点放在契约、可插拔性和可测性。
- 射线命中：边界算、敌方单位算、未来地图障碍也算（现在没有，预留接口）；友方单位不算障碍。
- 同队之间有物理碰撞，但没有伤害。
- 邻居简讯先只加文档明确字段，后续再考虑运动信息等扩展。
- 技能只做意图 + 冷却，不提前实现射弹/技能物理。

</specifics>

<deferred>
## Deferred Ideas

- **射弹与技能物理效果**（弓箭射箭、万箭齐发、冲锋位移、旋转效果）——留给后续战斗/技能层（Phase 4 或专门系统）；Phase 3 只输出意图与冷却。
- **丰富的默认 AI 行为/职业战术/个性参数**——默认基线只验证运行；后续用可插拔 AI 实现行为多样性与「激烈好看」。
- **地图障碍物射线感知**——Phase 4 地图出现后由 `ISensingWorld` 实现；Phase 3 只预留接口。
- **运行时阵营更新**——`updateTeam`/`setTeamId` 入口预留，Phase 4 城池易手/单位转阵营时启用。
- **按控制等级选择 AI / RL / LLM 单位控制**——Provider 已预留接入点；实际实现属 v2 / Phase 7。

</deferred>

---

*Phase: 3-操控系统*
*Context gathered: 2026-10-19*
