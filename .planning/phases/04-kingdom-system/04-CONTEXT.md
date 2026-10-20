# Phase 4: 王国系统 - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

交付王国层：1000×1000 地图、势力、军队、城池、行军、视野、驻扎/训练，以及军队/城池战斗的触发与战后结算。

本阶段不实现：渲染（Phase 5）、录制/播放（Phase 6）、LLM 指挥官/导演（Phase 7）。Phase 4 复用 Phase 3 的 `ControlSystem`/`IUnitAI` 作为战术执行层，并把 Phase 3 预留的 `ISensingWorld` 与 `IDamageSink` 替换为真实王国实现。

**Type-first gate（项目强制）：** 本阶段同样分两轮——Round 1 只写 `src/kingdom/types.ts` + `IFaction`/`IArmy`/`ICity`/`IWorld`/`ITimeSystem` 等接口，经用户审查批准后才规划 Round 2 实现。

</domain>

<decisions>
## Implementation Decisions

### 世界与战斗容器

- **D-01:** 所有单位始终存在于**一个全局 `IPhysicsWorld`**（持久动态刚体），从生成到死亡不销毁重建。**军队是宏观容器**（中心、朝向、单位名册、状态），不是战斗层实体。 — **Reversibility:** costly — 全局物理世界与持久刚体是王国/渲染/录制的共同地基。
- **D-02:** **战斗是单位级的**：任何单位进入 80m 战斗区即加入该战场；战斗层**不存在“军队”概念**，只有单位、阵营与战斗区。 — **Reversibility:** costly — 战斗成员、伤害过滤、结束判定都按单位集合实现。
- **D-03:** 战斗**物理/模拟并发**（多个战场同时真实推进）；Phase 4 对外维护一个**按触发/结束顺序消费的战斗队列**，供 Phase 6/7 依次播放。 — **Reversibility:** costly — 录制与导演的播放顺序依赖该队列。
- **D-04:** 战斗区重叠或新单位进入时**合并为同一战场**；战场成员是单位集合，结束条件只看“区内是否只剩一个阵营的单位”。 — **Reversibility:** costly — 合并/增援语义是战斗成员判定的核心。
- **D-05:** 战斗结束后**双方保留原 `armyId`**，不重排归属；两军距离必须 **>80m** 才能再次触发战斗，避免原地重复触发。 — **Reversibility:** costly — 重战锁定与军队重组逻辑依赖它。
- **D-06:** 单位跨战斗**持久**：生命值/经验/等级/装备保留，死亡永久移除；行军回血 1/h、驻扎回血 2/h 自然生效。 — **Reversibility:** costly — 单位生命周期与统计口径都依赖持久化。

### 时间系统

- **D-07:** 模拟**没有 wall-clock tickrate**；1× 战斗时 **1 tick = 1 游戏分钟**，24× 无战斗时 **1 tick = 24 游戏分钟**。模拟按自己的节奏推进，不等真实时间；成片由 WebCodecs 处理。 — **Reversibility:** costly — tick 的语义贯穿所有系统。
- **D-08:** 所有战略计时（行军 10m/h、回血 1/h 与 2/h、训练 96h/72h）都按**游戏时间**累计，不按真实秒。 — **Reversibility:** costly — 计时单位是数值校准与测试的共同基准。
- **D-09:** 只要有任一战斗在进行，**全局时间切 1×**；未参战军队/势力继续按 1× 行动（时间不停止）。 — **Reversibility:** costly — 全局时间倍率影响所有并行行为。
- **D-10:** 每个战略 tick 需要多少物理子步、如何把 1/24 游戏分钟映射到 Rapier 步进，**不在讨论层锁定**；由 research/planner 决定，但必须保持 D-07/D-08 的游戏时间语义与物理稳定性。 — **Reversibility:** reversible — 纯实现选择，可随实测调整。

### 行军与程序控制

- **D-11:** 行军由 **`MarchAI implements IUnitAI`** 控制（程序阵型，不是行为树 AI）；进入战斗时切换为战斗 AI。复用 Phase 3 的 `IUnitAI` 接缝，**不改 `IPhysicsWorld`/`IUnit`/`src/control/types.ts`**。 — **Reversibility:** costly — AI 切换是行军/战斗共存的唯一接缝。
- **D-12:** 军队中心以固定 **10m/h** 移动；行军单位在中心 **25m 圆**内由程序控制；军队碰到地图边缘**反弹**后继续前进。 — **Reversibility:** costly — 行军是地图层的基础运动学。
- **D-13:** 行军回血 **1/h**、城池驻扎回血 **2/h**，按游戏时间累计。 — **Reversibility:** reversible — 数值可校准。
- **D-14:** 单位离开战斗区即**退出战斗**：不再决策、不再结算伤害，并由程序控制**逐渐刹车**；若战斗区移动回其位置则重新加入。 — **Reversibility:** costly — 离区/回区是战斗成员判定的另一半。
- **D-15:** 同队单位保留物理碰撞，但**不结算伤害**（沿用 Phase 3 D-09）；伤害过滤在 Phase 4 的 `IDamageSink` 中完成。 — **Reversibility:** costly — 与战斗伤害规则绑定。

### 战斗触发、战斗区与结算

- **D-16:** 军队/城池战斗触发用**军队中心到军队中心**、**军队中心到城池点**的距离；**<80m** 触发。 — **Reversibility:** costly — 触发度量决定所有战斗的时序。
- **D-17:** 战斗区为边长 **80m 的正方形**，中心为**参战单位的加权中心**。 — **Reversibility:** costly — 战斗区是成员/结束判定的空间基准。
- **D-18:** 加权中心的默认权重 = **单位等级**；权重通过注入函数 **`(unit: IUnit) => number`** 提供，用户可随时替换（不是写死常量）。 — **Reversibility:** costly — 权重函数是战斗区契约的一部分。
- **D-19:** 只有**同一场战斗、且双方都在区内**的单位之间才结算伤害；离区/未参战单位即使武器接触也不掉血；同队免伤继续有效。 — **Reversibility:** costly — 伤害范围决定战斗结果与“脱离”语义。
- **D-20:** 战斗结束条件：**战斗区内仅剩一个阵营的单位**；结束后进入重战锁定（D-05），双方重组并继续行军。 — **Reversibility:** costly — 结束/重战是战斗状态机的核心。
- **D-21:** 城池战斗流程与军队战斗相同，区别在战后：**获胜方接管城池**；空城直接接管；败方存活单位重组并向己方城池行军，无己方城池则随机方向；胜方可按可配置入驻规则留下单位。 — **Reversibility:** costly — 城池所有权与势力消长依赖它。
- **D-22:** 入驻规则是**可配置函数**：可按比例、指定单位、全部或一个都不入驻；默认给一个可校准的比例规则。 — **Reversibility:** reversible — 策略可替换。
- **D-23:** 城池训练：普通城 **96h/1**、主城 **72h/1**；驻军上限按城池规模配置；训练职业**可配置**，属性使用文档规定的**正态随机**（`spawnUnit`：均值按职业、σ = 均值/8）。 — **Reversibility:** reversible — 数值/职业表可校准。

### 势力、视野、城池与地形

- **D-24:** 王国层类型集中在 `src/kingdom/types.ts`：`IFaction`/`IArmy`/`ICity`/`IWorld`/`ITimeSystem` 等接口 + 势力/军队状态的**数字枚举**。 — **Reversibility:** costly — 类型门禁冻结后是 Phase 5/7 的共同契约。
- **D-25:** 视野是**查询式当前可见性**：按势力所有军队（100m）与城池（150m）视野半径的并集，查询当前可见的军队/城池/单位；**不维护记忆**。历史/事件簿由 Phase 7 负责。 — **Reversibility:** costly — Phase 7 指挥官与信息申请依赖该读取面。
- **D-26:** 城池是**地图概念（点）**，没有物理/射线实体；驻扎只是**军队的一个状态**；城池本身不影响军队战斗。 — **Reversibility:** costly — 城池/驻军的数据模型影响 Phase 5/7。
- **D-27:** 城池附近存在**可阻挡地形**（静态障碍），**同时阻挡单位移动与 64 条射线**；地形数据来自可配置场景/地形表。 — **Reversibility:** costly — 地形既影响物理移动也影响感知，需要新的静态障碍接缝。
- **D-28:** 初始世界用**可配置场景表**（势力、城池位置/规模/驻军上限、军队位置/方向/单位职业与数量、城池附近地形）；默认给一个小型可跑场景（如 2 势力、各 1 城 1 军、每军 8–12 单位），测试可替换。 — **Reversibility:** reversible — 场景数据与代码分离。
- **D-29:** Phase 4 内置**最小占位指挥官**（每势力一个）：只负责给军队下宏观指令（行军/攻城/驻扎/重组等），具体目标选择由实现自定，**不重要**；通过可替换的 `ICommander`/`IArmyOrder` 接缝接入，Phase 7 可整体替换为 LLM 指挥官。 — **Reversibility:** costly — Phase 7 的接入点依赖它。

### Research Flags（不是用户决策，供 research/planner 解决）

- **静态地形碰撞接缝：** 冻结的 `IPhysicsWorld` 只有动态单位注册，没有静态障碍 API。Phase 4 必须为“阻挡移动的地形”找到一个**不破坏 Phase 2 契约**的接缝（新增独立静态障碍接口 / 在王国层自建静态碰撞 / 以最小向后兼容方式扩展）。这是本阶段最高风险的技术点。
- **AI 切换：** `IUnitAIProvider` 在构造时注入，`IControlSystem` 没有“替换某单位 AI”的方法。优先用**复合/委托型 `IUnitAI`**（内部在 MarchAI / 战斗 AI / 离区刹车之间切换），避免修改冻结的 Phase 3 契约；若必须扩展，需在类型门禁提出。
- **感知范围：** Phase 3 的 16 敌/16 友是**全局最近**，不按战斗区过滤；战斗/伤害过滤只在 `IDamageSink` 做。确认这是预期（AI 可以感知区外敌人，但只对同场在区单位结算伤害）。
- **射弹/技能物理仍 deferred：** Phase 3 的 AI 只输出意图，没有射弹/冲锋/旋转物理。Phase 4 的战斗仍以近战碰撞为主；弓箭手没有远程攻击。若这会让“战斗激烈好看”不可接受，需要在 research 中明确是 Phase 4 补最小射弹还是继续后置。
- **24× 的物理子步：** D-10 留给 research/planner；1× 战斗的物理稳定性优先。
- **队伍映射：** Phase 4 的 `factionId` 直接作为 Phase 3 注册时的 `teamId`；不得在 `IUnit` 上增加阵营字段。

### the agent's Discretion

- `IFaction`/`IArmy`/`ICity`/`IWorld`/`ITimeSystem` 的具体字段与方法签名。
- 军队阵型槽位分配、`MarchAI` 的转向/速度控制参数、离区刹车的具体力/阻尼。
- 战斗区加权中心权重函数的默认实现（默认返回等级）。
- 入驻函数的默认比例、训练职业配置表的结构。
- 城池规模/驻军上限、训练时间常量、地形几何与场景默认值。
- 占位指挥官的具体目标选择（最近敌城/敌军/巡逻等）；只要接口可替换即可。
- `src/kingdom/` 内部文件拆分（遵循每文件夹一个 `types.ts`）。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威规格
- `.planning/reference/ai-marble-kingdom.md` § 地图 — 1000×1000 地图、100 小时贯穿、边缘反弹。
- `.planning/reference/ai-marble-kingdom.md` § 时间系统 — 战斗 1×、无战斗 24×、tick = 游戏 1 分钟、推理间隔语义。
- `.planning/reference/ai-marble-kingdom.md` § 战斗 — 单位级 AI 控制、军队战斗触发/80m 战斗区/离区/结束、城池战斗与战后结算。
- `.planning/reference/ai-marble-kingdom.md` § 行军 — 10m/h、25m 聚集、程序控制、行军回血 1/h。
- `.planning/reference/ai-marble-kingdom.md` § 城池 — 驻扎上限、训练 96h/72h、驻扎回血 2/h。
- `.planning/reference/ai-marble-kingdom.md` § 视野 — 军队 100m、城池 150m。
- `.planning/reference/ai-marble-kingdom.md` § 指挥系统 — 势力/军队宏观指令；LLM 部分属 Phase 7，仅作接口语义参考。
- `.planning/reference/ai-marble-kingdom.md` § 单位生成 — 正态随机（σ = 均值/8）。

### 需求与路线图
- `.planning/REQUIREMENTS.md` § KING（KING-01..08） — 本阶段 v1 需求清单。
- `.planning/ROADMAP.md` § Phase 4: 王国系统 — 目标、5 条成功标准、Type-first gate。
- `.planning/PROJECT.md` § Core Value / Out of Scope / Constraints — 战斗必须激烈好看、无确定性、可插拔 AI、反过度设计。

### 已冻结的上游契约
- `src/control/types.ts` — `IControlSystem`、`IUnitAI`、`IUnitAIProvider`、`ISensingWorld`、`IDamageSink`、`IUnitObservation`、`IUnitAction`、`IControlUnitRegistration`；Phase 4 替换 `ISensingWorld`/`IDamageSink`，不改该文件。
- `.planning/phases/03-control-system/03-CONTEXT.md` — 操控系统 D-01..D-19（感知、阵营、时序、默认 AI、技能只输出意图）。
- `src/physics/types.ts` — `IPhysicsWorld`、`IUnitPhysicsSpec`、`IUnitState`、`IDamageEvent`；注意没有静态障碍 API。
- `src/physics/PhysicsWorld.ts` — 每 tick 后清空力/力矩；注册快照冻结；没有静态刚体注册入口。
- `src/physics/constants.ts` — `DT = 1/60`。
- `src/units/types.ts` — `IUnit`、`AttributeKind`、`ClassKind`、`SkillKind` 等。
- `src/units/data.ts` — `CLASS_DEFS`/`WEAPON_DEFS`/`ARMOR_DEFS`。
- `src/units/spawn.ts` — `spawnUnit` 正态随机生成。
- `src/common/types.ts` + `src/common/rng.ts` — `IRng`/`MathRng`/`sampleNormal`。
- `AGENTS.md` § Code Conventions（强制） — 接口 `I` 前缀、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、null/undefined、`src/common/`。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ControlSystem`（`src/control/ControlSystem.ts`）：可驱动一个 `IPhysicsWorld`、每 6 tick 决策、重施力/力矩、路由伤害；Phase 4 的 World 应把它作为唯一战术循环。
- `Sensor`/`ISensingWorld`（`src/control/Sensor.ts`、`src/control/types.ts`）：Phase 4 实现 `ISensingWorld` 提供地图边界 + 城池附近地形 + 敌方单位 blocker。
- `IDamageSink`（`src/control/types.ts`）：Phase 4 实现真实战斗结算（同场/在区/同队过滤、`takeDamage`、经验、死亡移除）。
- `IUnitAI`/`IUnitAIProvider`（`src/control/types.ts`）：`MarchAI` 与战斗 AI 都实现 `IUnitAI`；切换优先用复合/委托实现，不改契约。
- `IPhysicsWorld`（`src/physics/types.ts`）：全局持久刚体、`applyForce`/`applyTorque`/`getUnitState`/`tick`；Phase 4 需要为静态地形找接缝。
- `IUnit`/`AttributeKind`/`spawnUnit`：军队名册、训练生成、加权中心权重（等级）都从这里读取。
- `IRng`/`sampleNormal`：训练生成与场景随机化的共享随机源。

### Established Patterns
- interface-first、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、缺失对象 `null` / 缺失字面量 `undefined`、通用抽象放 `src/common/`。
- Phase 3 的两轮类型门禁：Round 1 仅类型 + 用户审查，Round 2 实现。
- Vitest 测试夹具：真实 Rapier + `RAPIER.init()` + `afterEach` dispose + 种子化 `mulberry32`。

### Integration Points
- `src/kingdom/` 新目录：`types.ts` + 地图/世界、势力/军队/城池、时间、战斗队列、占位指挥官、场景数据；测试放 `tests/kingdom/`。
- Phase 4 实现 `ISensingWorld`（地图边界、城池附近地形、敌方 blocker）与 `IDamageSink`（战斗成员/同队/在区过滤、经验、死亡）。
- Phase 4 World 驱动 `ControlSystem.tick()`；军队状态变化时切换单位的 `IUnitAI`（MarchAI / 战斗 AI / 离区刹车）。
- Phase 5 渲染消费 `IWorld` 的军队/城池/单位状态；Phase 6 消费战斗队列与时间戳；Phase 7 替换占位指挥官并做视野受限的信息申请。

</code_context>

<specifics>
## Specific Ideas

- 用户明确：**单位是永久模拟的**；**任何单位进入 80m 范围就直接加入战场**；**军队只是宏观概念，战斗层没有军队**。
- 城池本身只是一个地图概念；驻扎是军队状态；城池不影响战斗；**城池附近有可阻挡地形**，挡移动也挡射线。
- 战斗区加权中心默认按**等级**，但必须暴露 `(unit) => number` 的注入函数，方便用户自己改。
- 入驻规则要灵活：按比例、指定部分单位、全部、或一个都不入驻，都通过可配置函数表达。
- 训练职业可配置；单位数值仍用文档规定的正态随机方案。
- 初始世界用可配置场景表；占位指挥官只要接口可替换，具体行为不重要。

</specifics>

<deferred>
## Deferred Ideas

- **LLM 指挥官/导演** — Phase 7；Phase 4 只留可替换的占位指挥官接口，不接真实 LLM。
- **射弹与技能物理**（弓箭/万箭齐发/冲锋/旋转） — 从 Phase 3 继续 deferred；Phase 4 战斗仍以近战碰撞为主。是否在 Phase 4 补最小射弹，留给 research 评估。
- **全地图地形/障碍生成** — 本阶段只做城池附近的可阻挡地形；更丰富的地形属后续。
- **录制/回放顺序** — Phase 6；Phase 4 只提供战斗队列与时间戳。
- **更丰富的战略 AI/势力外交** — Phase 7 或后续；Phase 4 只做最小占位。
- **确定性/重放** — 项目明确 out of scope。

</deferred>

---

*Phase: 4-王国系统*
*Context gathered: 2026-10-20*
