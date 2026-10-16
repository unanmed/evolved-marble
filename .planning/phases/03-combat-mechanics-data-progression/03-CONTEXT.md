# Phase 3: Combat Mechanics, Data & Progression - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

把单位变成**数据驱动**并实现规格的战斗与成长机制：

- **数据**（DATA-01/02/03）：单位属性数据化；7 个职业（每级成长 + 装备/技能解锁表）；6 种武器、2 种防具（质量/比率/破甲矩阵）。
- **伤害**（DMG-01/02/03）：由碰撞法向速度 Δv 按规格公式结算；种子化抖动 N(mean, mean/20)；**仅命中防具**触发减伤，破甲比率产生**软克制**。
- **成长**（PROG-01/02/03）：造成/抵挡伤害（>50）与击杀获得经验；达阈值升级、恢复生命上限增量、按职业加属性、解锁装备；单位生成属性按正态随机。
- **命名**（用户追加）：单位达到可调阈值等级时获得中文姓名（服务"追踪重点目标"）。

全部在 Phase 2 的 Rapier2D 物理之上**无头验证**。

不包含：单位 AI（Phase 4）、渲染与 HUD（Phase 5）、技能/能力**执行本体**（v2 ABIL / Phase 4）、RL（后续里程碑）、战斗统计遥测与录像片尾桥段（独立功能，已延后）。

对应需求：**DATA-01/02/03、DMG-01/02/03、PROG-01/02/03**。

</domain>

<decisions>
## Implementation Decisions

### 数据表与属性模型（Data Model）
- **D-37:** 单位数据拆为**三个具名组件**：`IUnitAttrs`（hp/maxHp/attack/defense/weaponRatio/armorRatio/mass）+ `IUnitProgress`（level/xp/controlLevel）+ `IUnitEquip`（classId + 武器/防具 id + 加成）。理由：各自更新节奏与消费者不同（战斗读 attrs+equip，成长写 progress），仍是轻量具名接口而非抽象层。 — **Reversibility:** costly — 组件形状被战斗/成长/装备/快照共同依赖，改动会波及 Phase 3/4/5 与序列化契约。
- **D-38:** 数值表在 `src/sim/content/` 下**分文件**：`classes.ts` / `weapons.ts` / `armor.ts`（+ 扩展 `formulas.ts`）；职业/武器/防具 id 用**数字枚举** `ClassKind`/`WeaponKind`/`ArmorKind`（项目锁定规则 #3），表按枚举 id 索引。 — **Reversibility:** reversible。
- **D-39:** 每职业的每级成长用**成长函数**建模（参数存数据表、按等级求值；规格 `$kL$` 形式按"与等级相关的项"解释）。系数是**校准目标**（规格标注"需实测"）。 — **Reversibility:** reversible。
- **D-40:** 升级**真实改变物理装备**：每职业一张 `level → {weapons[], armors[], skills[]}` 表；升级触发装备变更并在物理层**增补/重挂碰撞体**（Phase 2 D-26 已支持任意数量武器/防具）。**技能仅记录为数据**（执行留 Phase 4/v2）。 — **Reversibility:** costly — 升级期改物理装备触及 CompositeFactory 的生命周期与快照（需保证确定性/顺序稳定）。

### 伤害公式与校准（Damage）
- **D-41:** 一次接触的**攻击方 = 部位为 `Weapon` 的那侧**（`partA`/`partB`）；受击方为另一侧；**仅命中防具**才触发减伤（命中本体不减，DMG-03）；两侧均非武器（本体互撞）不造成伤害。 — **Reversibility:** reversible。
- **D-42:** **所有公式参数集中在 `content/` 便于调整**——伤害/减伤/经验/抖动/阈值等每个数值都作为**具名 content 常量**（含 √Δv 的 `−1` 基线、抖动的 `20`、减伤式的 `100` 与各系数），系统只读不写死；**不藏在系统代码深处**。公式保持规格形态。 — **Reversibility:** reversible。
- **D-43:** **破甲比率方向：高破甲 → 减伤越少 → 伤害越高**。即减伤式中的 `B_A` 直接使用**武器破甲比率**（**不取倒数**），使重锤（头盔5/盾牌3）破盾强、弓箭（0.4/0.2）弱，形成**软克制、无硬克制**。**记录与规格"破甲比例的倒数"字面的偏离**（按设计意图修正）。 — **Reversibility:** costly — 直接决定伤害手感与武器/防具平衡，改向需重做全部破甲矩阵校准。
- **D-44:** 伤害管线顺序：先算均值 `D̄`（不计防具）→ 用**命名随机流 `'damage'`** 施加 `N(D̄, D̄/20)` 得 `D_R` → **仅命中防具**时按减伤式得最终 `D`。**抖动在减伤之前**（与规格"抖动均值为 D̄"一致）。 — **Reversibility:** reversible。

### 命中去重/冷却（Hit Dedup — Phase 2 D-31 显式推迟到本阶段）
- **D-45:** 去重**两种机制并存、参数集中 `content/` 可调**：(a) **摆动周期 hit-set**（每武器每个摆动半周期开始时清空一个"本次挥砍已命中集合"）；(b) **per-(武器, 目标) 冷却**（类似仅对该武器生效的"无敌帧"）。用户明确：不依赖单一摆动周期假设，冷却时长与开关均可调。 — **Reversibility:** reversible。
- **D-46:** 武器在一个挥砍内可命中**多个不同目标**（`per-(武器,目标)` 冷却下，每个不同目标各结算一次）。 — **Reversibility:** reversible。
- **D-47:** **无友伤**：仅对**不同阵营**结算伤害；友军之间仍物理碰撞/推挤但不受伤。需**新增阵营/部队字段**。 — **Reversibility:** costly — 阵营字段被战斗、目标选择（Phase 4 AI）、渲染（Phase 5 HUD 分队）共同依赖。
- **D-48:** 去重/冷却状态（per-weapon hit-set + per-(武器,目标) 冷却剩余 tick）**纳入 sim 状态并序列化**——**快照版本 3 → 4**，保证 restore 后确定性（同机双跑指纹一致，D-17）。 — **Reversibility:** costly — 变更序列化契约；旧版无迁移路径（本阶段快照不出进程，与 Phase 2 一致）。

### 经验/升级/生成随机（Progression）
- **D-49:** XP 照规格口径 + 参数集中 `content/`：攻击经验用**最终伤害 `D`**（经防具减免）`>50` 才计 `R_A·√(D−50)`；防御经验用**被减免量 `ΔD`** `>50` 才计 `R_D·√(ΔD−50)`；击杀 `R_A·10L`；升级阈值 `100·(1+R_E)^L`。（`50` 门槛与系数均为可调 content 常量。） — **Reversibility:** reversible。
- **D-50:** 升级时按**成长函数重算**属性（`stat = f(level)`，与 D-39 一致），并**恢复生命上限增量**；**无硬等级上限**（解锁表在定义等级之外自然不再解锁）。 — **Reversibility:** reversible。
- **D-51:** 单位生成：新增**命名随机流 `'spawn'`**，用**标准正态采样**（如 Box-Muller；`sin/cos/log` 同机允许，D-02）对 7 项属性取 `mean·(1 + z/8)`（标准差 = 均值/8）；**控制等级**也随机（均值 10）且**仅作数据字段**（不驱动行为，留 RL/后续里程碑）；采样法参数可调。 — **Reversibility:** reversible。

### 单位命名（Naming — 用户追加，服务"追踪重点目标"）
- **D-52:** 单位达**可调阈值等级**（默认 2，参数集中 `content/`）时获得姓名；低于阈值不命名。 — **Reversibility:** reversible。
- **D-53:** 姓名来自**内置中文"姓-名"表**（`content/` 数据模块，姓表 + 名表随机组合）。由 **researcher 网搜**一份合适的中文姓名数据集（如百家姓/常见名字用字）并精简成内置表；**不外置 JSON**（符合 D-06）。 — **Reversibility:** reversible。
- **D-54:** 姓名用**命名随机流（如 `'name'`）确定性生成**；**同局内唯一**（重名则重抽或加区分后缀）；姓名**随单位序列化入快照**（可回溯）。 — **Reversibility:** reversible。

### 设计克制原则（沿用 Phase 2 D-36）
- **D-55:** 延续 **D-36**：本项目非长期大工程，只做必要抽象；抽象等第二具体用例出现再引入。Phase 3 应主动复核可简化项（例如：成长函数是否必要 vs 固定增量、装备解锁改物理的复杂度是否值当），仅在确无必要时下简，默认保持上述决策。

### the agent's Discretion
- `content/` 下各表的具体字段名与内部组织（在 D-38 的文件划分内）。
- 正态采样/姓名的具体实现细节（在 D-51/D-54 的流与唯一性约束内）。
- 数值的**最终校准值**（规格标注"需实测"，D-39/D-42/D-43/D-49 的系数由无头战斗校准）。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威数值与机制（本阶段核心）
- `.planning/reference/ai-marble-kingdom.md` §单位 — 基本属性清单（DATA-01）、升级机制（§升级机制：XP 公式、阈值 `100(1+R_E)^L`、恢复生命上限增量）。
- `.planning/reference/ai-marble-kingdom.md` §伤害计算 — `D̄ = max[A_A·P_A·W_A·(√Δv−1),0]`、抖动 `N(D̄,D̄/20)`、减伤 `ΔD = D_R(1 − 100B_A/(100B_A + A_D·P_D·S_D))`、最终 `D = D_R − ΔD`。
- `.planning/reference/ai-marble-kingdom.md` §武器 / §防具 — 6 武器、2 防具的质量/攻击·防御比率/破甲矩阵（DATA-03）。
- `.planning/reference/ai-marble-kingdom.md` §职业 — 7 职业的基础属性、每级成长、初始装备与解锁（DATA-02）。
- `.planning/reference/ai-marble-kingdom.md` §单位生成 — 7 项属性的正态随机（均值随职业、标准差=均值/8）。

### 项目与需求
- `.planning/PROJECT.md` — 愿景、Core Value（战斗必须激烈好看）、约束（Phase 2 后已更新）。
- `.planning/REQUIREMENTS.md` — DATA-01..03、DMG-01..03、PROG-01..03（本阶段需求）与全局 Out of Scope。
- `.planning/ROADMAP.md` — Phase 3 目标、成功标准、依赖（Phase 2 已完成）。

### 前序阶段决策（必须遵守）
- `.planning/phases/02-physics-composite-units/02-CONTEXT.md` — D-17 同机确定性、D-20 双指纹、**D-26 任意数量装备**、**D-28..D-31 接触契约（部位枚举/防具子类型/步前 Δv/去重推迟到本阶段）**、D-32 米为世界单位、D-34 Rapier 为真源+快照 v3、D-36 设计克制。
- `.planning/phases/01-foundation-deterministic-sim-core/01-CONTEXT.md` — D-02 同机本机可复现、D-06 数值放 TS 数据模块、D-12..D-16 代码风格。

### 研究结论（技术依据）
- `.planning/research/ARCHITECTURE.md` — `content/` 为纯数据、ECS-lite、事件模型、确定性规则。
- `.planning/research/PITFALLS.md` — Pitfall 5（接触事件洪泛/去重）、Pitfall 7（degenerate 战斗/校准）、Pitfall 12（奖励/校准）。

### 现有代码（本阶段接入的接缝）
- `src/sim/content/formulas.ts` — 现有数值常量（单一来源约定，本阶段扩展为职业/武器/防具/伤害/成长表）。
- `src/sim/core/events.ts` — `SimEventKind.Damage/Kill/Levelup` 已预留、`IContactEvent` 已含部位+Δv（本阶段落地事件）。
- `src/sim/core/rng.ts` — 命名随机流门面（现有 `['ai']`；本阶段加 `'damage'`/`'spawn'`/`'name'`）。
- `src/sim/world/entity-store.ts` — `IUnitAttrs/IUnitXform/IUnitComponents`（本阶段扩展为 attrs/progress/equip）。
- `src/sim/world/composite.ts` — 复合工厂（本阶段用于装备解锁时增补碰撞体）。
- `src/sim/battle-sim.ts` / `src/sim/snapshot.ts` — `step()` 管线与快照（本阶段接入战斗/成长系统、快照 v3→v4）。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`content/` 纯数据模块约定**（D-06）：`formulas.ts` 已建立"数值单一来源、无 DOM 依赖"的范式；Phase 3 按 D-38 扩展为 `classes.ts`/`weapons.ts`/`armor.ts` + 伤害/成长常量。
- **事件契约已就位**：`SimEventKind` 已预留 `Damage=2/Kill=3/Levelup=4`；`IContactEvent` 已带 `partA/partB/armorA/armorB/dv`（Phase 2）——战斗系统只需消费它。
- **命名随机流**：`RandomStreams` 已支持命名流 + `save/restore`；Phase 3 注册 `'damage'`/`'spawn'`/`'name'` 即确定且可快照。
- **复合工厂**：`CompositeFactory` 已支持任意数量武器/防具（D-26）与部位映射——装备解锁改物理（D-40）的接缝。
- **组合实体模型**：`IUnitComponents` 加 `progress`/`equip` 组件即可（D-37），无需 ECS。

### Established Patterns
- **每个类先定义 `I<ClassName>` 接口并 `implements`**（D-13）；**数字枚举**（D-14）；**无 `_` 前缀**（D-15）；**具名接口而非内联联合**（D-16）；**中文 JSDoc（@param/@returns）全覆盖**。
- **有序迭代**：一切系统遍历 `store.ids()` 有序数组（确定性）。
- **参数集中**：数值放 `content/`（本阶段 D-42 强化为"全部公式参数集中可调"）。
- **每 tick 事件清空**：`BattleSim.step()` 顶部 `events.clear()`；新系统在继承接触 drain 后运行并入 `EventLog`。
- **快照规范化**：`serializeState`/`fingerprint` 可分离；RNG 按名字典序；实体按有序 id（v3→v4 扩展）。

### Integration Points
- **`BattleSim.step()`**：在 contact drain / 位姿镜像之后插入**战斗系统**（伤害结算 + 去重/冷却 + Kill/Levelup）与**成长系统**（XP/升级/装备解锁）。顺序须确定且记录。
- **`snapshot.ts`（v3→v4）**：纳入去重/冷却状态、`IUnitProgress`、`IUnitEquip`、姓名（+ 随机流状态）。
- **`IUnitComponents`**：加 `progress: IUnitProgress`、`equip: IUnitEquip`（attrs 扩展战斗字段）。
- **`CompositeFactory`**：升级解锁时增补/重挂碰撞体（顺序稳定）。
- **`content/`**：新增职业/武器/防具/姓名表 + 伤害/成长/去重常量。
- **`tests/determinism`**：新增战斗/成长的确定性门禁（覆盖新随机流与新快照字段）。

</code_context>

<specifics>
## Specific Ideas

- 用户明确：**"所有的公式、参数都应该放到方便调整的地方，便于调整，不要藏在代码深处"**（D-42）——这是本阶段的核心工程约束，不只是伤害，XP/成长/去重/生成的每个数值同理。
- 用户追加：**单位命名**——单位达到可调等级时随机获得中文姓名，**目的是方便追踪重点目标**；建议网搜姓名数据集（D-52..D-54）。
- 用户认可对"一次挥砍一次命中"不确定摆动周期是否合理，故**并存"摆动周期 hit-set + per-(武器,目标) 冷却"两机制**并留可调参数（D-45）。
- 用户权衡后**整体延后战斗统计/遥测与录像片尾桥段**（见 Deferred）。

</specifics>

<deferred>
## Deferred Ideas

- **战斗统计/遥测 + 录像片尾桥段**（用户提出）：每单位 uid 的总伤/总承伤/击杀/助攻/行动轨迹（每 N tick 采样，非每 tick）/战斗胜次；用于片尾统计与精彩回放桥段。用户判定为**独立功能，整体延后**（未来录制/统计阶段）。本阶段只保证伤害/击杀事件携带足够信息。
- **技能/能力执行本体**（万箭齐发/冲锋/旋转）——v2 ABIL 或 Phase 4；本阶段仅数据表与解锁记录。
- **控制等级驱动 AI/RL**——后续里程碑；本阶段仅数据字段（D-51）。
- **待复核的简化候选（沿用 D-36/D-55）**：成长函数是否必要（vs 固定增量）、装备解锁改物理的复杂度是否值当。默认保持现状。

</deferred>

---

*Phase: 3-Combat Mechanics, Data & Progression*
*Context gathered: 2026-10-16*
