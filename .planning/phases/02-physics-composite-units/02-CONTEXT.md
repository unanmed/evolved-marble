# Phase 2: Physics & Composite Units - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

把 Phase 1 的确定性核心接上 **Rapier2D**：单位成为**复合刚体**——本体（球）+ 武器（独立刚体 + 旋转关节）+ 防具（跟随本体），各部位是**独立、可单独识别的碰撞体并按部位打标**；物理接触被转成**带部位标记的类型化模拟事件**（含命中法向相对速度 Δv）；全程**固定步长、确定性**，且引入物理后确定性指纹保持绿色。

不包含：伤害/减伤/成长公式（Phase 3）、单位 AI（Phase 4）、渲染（Phase 5）、桥接与录制（Phase 6）。

对应需求：**PHYS-01 / PHYS-02 / PHYS-03**。

</domain>

<decisions>
## Implementation Decisions

### 确定性档位与 Rapier 构建（Determinism & Build）
- **D-17:** 确定性档位**保持同机**（沿用 Phase 1 的 D-02）——同一种子在同一机器/浏览器内重跑一致；**不**接跨机 golden-hash 门禁、**不**接 CI。路标 Phase 2 成功标准 #4 的"跨两机指纹稳定"标记为**延后/放宽**。 — **Reversibility:** costly — 日后升级为跨机位级一致需换构建、重做基线并审计全部数学调用；本阶段主动选择不买。
- **D-18:** 使用 **`@dimforge/rapier2d-deterministic`** 构建（满足 PHYS-03 字面，且自带 libm、预先对齐跨机，日后升级零成本；仅牺牲少量性能）。 — **Reversibility:** reversible — 换包名即可，但换包会改变物理结果/指纹基线。
- **D-19:** **精确钉版**（`package.json` 写死版本、无 `^`）+ **版本变更即硬失败**的冒烟测试（输出当前 Rapier 版本与一条 golden 指纹，版本一变即报错）——防 PITFALLS 第 1 条（快照格式跨版本不稳定）。 — **Reversibility:** reversible。
- **D-20:** 确定性门禁用**双指纹**：既扩展 Phase 1 的 `BattleSim.fingerprint()`（现纳入物理状态），也断言 Rapier 原生 `world.takeSnapshot()` 哈希，**同机双跑均一致**。 — **Reversibility:** reversible。
- **D-21:** Rapier WASM **一次全局初始化**（幂等 `await initPhysics()`，在组合根与测试 setup 各调一次）；`PhysicsWorld` **同步构造**；`BattleSim.step()` 保持**纯同步**。 — **Reversibility:** costly — 初始化契约贯穿组合根、测试与所有世界构造点。
- **D-22:** 无头门禁与物理单测 **Node-only**（vitest），与 Phase 1 一致；Rapier WASM 必须在 Node 下 init 成功并跑完整步。 — **Reversibility:** reversible。
- **D-23:** Node / Vite / 浏览器三环境的 **WASM 解析策略交由研究者确定**（列为 Phase 2 研究/计划任务）。 — **Reversibility:** reversible。

### 复合刚体装配与武器挥击（Composite Rig & Swing）
- **D-24:** 装配拓扑用**混合式**：单位**本体 + 防具为同一刚体**的多个碰撞体；**武器为独立动态刚体**，通过**旋转关节（revolute joint）**铰接到本体，用**关节电机**驱动摆动。理由：规格伤害来自"**武器**与受击方防具/本体的碰撞法向速度差 Δv"，武器必须有**独立速度**。 — **Reversibility:** costly — 装配拓扑决定伤害来源速度、AI 招式与 Phase 5 渲染，改动会波及 2/3/4/5 各层。
- **D-25:** 武器挥砍由**持续往复摆动**驱动——按**数值常量**（振幅/角速度）在扇形内来回摆动，**无需 AI**；命中时自然产生 Δv。使 Phase 2 自包含、单测即可见"活"的抡击。 — **Reversibility:** reversible。
- **D-26:** `CompositeFactory` 接受 `{ weapons: [...], armors: [...] }`，支持**任意数量**武器/防具（数据驱动），直接服务 Phase 3 的职业装备表（如狂战士双斧、骑士剑+头盔+盾）。 — **Reversibility:** reversible。
- **D-27:** 碰撞过滤用**单位级分组**：同一单位各部件（本体/武器/防具）互为无损；**敌我单位之间仍保持物理碰撞**（质量影响推挤/卡位）；武器只与敌方部件产生伤害性接触。 — **Reversibility:** reversible。

### 接触/冲击事件契约（Contact / Impact Events）
- **D-28:** 命中部位标记到 **(entityId, part)**，其中 `part` 为数字枚举 `Body | Weapon | Armor`，并在 `Armor` 上带**子类型** `Helmet | Shield`。理由：规格的破甲矩阵**按防具类型**给（不同武器对头盔/盾牌破甲比率不同），不区分则 Phase 3 无法兑现软克制。 — **Reversibility:** costly — Phase 3 破甲/减伤直接消费该粒度，改粒度要同时改事件契约与 Phase 3。
- **D-29:** 以 **collision-enter**（intersection 开始）作"命中"触发，事件内**附 Δv**；另可发 **contact-force 事件**（magnitude）作诊断/阈值用途，但不作命中判据。 — **Reversibility:** costly — Phase 3 伤害管线消费该事件契约。
- **D-30:** Δv 口径 = **碰撞法向相对速度的大小**（非负标量，与谁撞谁方向无关），使规格公式 `√Δv − 1` 直接可用；敌我/方向判定留给 Phase 3。 — **Reversibility:** costly — Phase 3 伤害公式依赖该口径。
- **D-31:** **去重归 Phase 3**：Phase 2 只发**原始 enter 接触事件**（真实、无状态）；"一次挥砍一次命中"的去重/冷却由 Phase 3 战斗系统在武器状态机上建模（PITFALLS 第 5 条推荐）。 — **Reversibility:** reversible。

### 物理世界约定（World Conventions）
- **D-32:** **米为世界单位**——1 世界单位 = 1 米，地图 1000×1000 米，物理全程 SI（kg / m / s）；**仅在渲染边界换算像素**。 — **Reversibility:** one-way — PITFALLS 第 10 条：比例一旦改变，全部数值调参与 golden 基线作废，且触及物理/AI/渲染所有以距离为输入的系统。
- **D-33:** 竞技场**软钳制边界 = "安全带"**：仅在单位越出安全区（1000×1000 m）时把位置/速度拉回，用于防飞出场/NaN/发射异常；**平时不干预**，不是战斗墙（非物理）。 — **Reversibility:** reversible。
- **D-34:** **Rapier 为真源**，每步后把 body 变换（x, y, rotation, vx, vy, angularVel）**镜像进 `EntityStore`** 供只读视图/AI/渲染消费；`snapshot()` = Rapier `takeSnapshot()` + store 静态组件 + RNG + id 游标。为此 **`IUnitXform` 增加 `rotation` / `angularVelocity`**，**快照版本 2 → 3**（无 v2 迁移路径，本阶段快照不出进程）。 — **Reversibility:** costly — 触及序列化契约与所有位姿消费者；真源选择决定确定性门禁如何成立。
- **D-35:** 全局物理参数：**无重力**（`gravity = {0, 0}`，顶视）、**低弹性**（`restitution ≈ 0`，避免持续抖动/能量注入）、统一小线性/角阻尼；单位/武器/防具**尺寸从 Phase 3 内容表取**（Phase 2 用测试值）。 — **Reversibility:** reversible。

### 设计克制原则（Design Restraint — 用户在讨论末尾追加）
- **D-36:** **最小必要抽象，只做必要拓展。** 本项目**不是**长期演进的大工程，不做没有直接下游用途的抽象；抽象应等**第二个具体用例出现**再引入（对应研究 Anti-Pattern 2：不要提前造 `BodyBase`/`MapBase` 式桩层）。规划与实现时应主动复核以下**可简化候选项**，仅在确有需要时才加码：双指纹门禁是否下简为只用 sim 指纹、武器摆动是否不必用关节电机（可改为直接施加角冲量/角速度）、`PhysicsWorld`/`CompositeFactory`/`ContactBridge`/`Lifecycle` 是否不必强制拆分。 — **Reversibility:** reversible。

### the agent's Discretion
- Node / Vite / 浏览器的 **WASM 解析与打包方案**（D-23，交研究者）。
- `sim/world` 下**模块文件的具体拆分/命名**（`PhysicsWorld` / `CompositeFactory` / `ContactBridge` / `LifecycleSystem` 不强制四文件，按最小自然组织）。
- 摆动、阻尼、restitution、尺寸的**具体数值常量**（集中放 `src/config/sim.ts` 或 `content/`，单一来源）。
- Phase 2 测试用单位的具体几何/装备（Phase 3 落地真实内容表前的临时值）。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威数值与机制（本阶段用于几何/质量/部位）
- `.planning/reference/ai-marble-kingdom.md` §伤害计算 — Δv 法向速度差公式 `D̄ = max[A_A·P_A·W_A·(√Δv − 1), 0]`；防具减伤与破甲比率；**Phase 2 事件的 Δv 口径直接来自此处**。
- `.planning/reference/ai-marble-kingdom.md` §武器 / §防具 — 6 种武器、2 种防具（头盔/盾牌）的质量与破甲矩阵——决定部位打标与防具子类型的必要性。
- `.planning/reference/ai-marble-kingdom.md` §单位 / §职业 — 复合单位的属性（质量、装备、职业）与初始装备/解锁表——决定装备槽数量与尺寸来源。
- `.planning/reference/ai-marble-kingdom.md` §地图 / §时间系统 — 地图 1000×1000、速度 m/s、固定步长（米为世界单位的依据）。

### 项目与需求
- `.planning/PROJECT.md` — 项目愿景、Core Value（战斗必须激烈好看）、约束
- `.planning/REQUIREMENTS.md` — PHYS-01/02/03（本阶段需求）、全局 Out of Scope
- `.planning/ROADMAP.md` — Phase 2 目标、成功标准（#4 跨机项已按 D-17 放宽）、计划草案 02-01/02/03

### 研究结论（技术决策依据）
- `.planning/research/ARCHITECTURE.md` — Pattern 3（复合单位 = 一刚体多碰撞体 + 武器关节）、Pattern 4（ECS-lite，`xform` 每步从 Rapier 镜像）、Pattern 6（Rapier 事件 → EventLog，读 manifold 取 Δv）、Pattern 7（快照/指纹）、Determinism Strategy、Anti-Pattern 2。**注意：其"WASM 无需构建标志即跨机确定"之说与 PITFALLS 第 1 条矛盾，D-17/D-18 已按同机档位消解，研究者需复核。**
- `.planning/research/PITFALLS.md` — Pitfall 1（确定性假设）、Pitfall 4（快速武器穿透/CCD）、Pitfall 5（接触事件洪泛与去重）、Pitfall 10（像素当米）
- `.planning/research/STACK.md` — 版本与依赖 rationale
- `.planning/research/SUMMARY.md` — 五层架构与阶段结构

### 前身代码（仅作反面教材，**不**复用）
- `.planning/codebase/ARCHITECTURE.md` — 旧原型反模式（重复渲染、`Role` 桩基类、无消息关联）
- `.planning/codebase/CONCERNS.md` — 旧仓库已观测问题（接触处理 `undefined` 解引用、无测试、大产物入库）

### 现有代码（本阶段接入的接缝）
- `.planning/phases/01-foundation-deterministic-sim-core/01-CONTEXT.md` — Phase 1 决策 D-01..D-16（固定步长、同机确定性、组合实体、代码风格约定）
- `src/sim/battle-sim.ts` — `BattleSim` 门面与 `step()` 顺序（每 tick 顶部 drain 命令）——物理步与接触 drain 接入点
- `src/sim/world/world.ts` — `ISimState` 聚合根（需新增 `PhysicsWorld`）
- `src/sim/world/entity-store.ts` — `IUnitComponents`/`IUnitXform`（需扩展物理句柄/部位映射与 rotation/angularVel）
- `src/sim/core/events.ts` — `SimEventKind.Contact` 与 `IContactEvent`（需按 D-28..D-31 落地）
- `src/sim/commands.ts` — `CommandKind.Torque`/`WeaponAbility`（Phase 1 为 wired-but-inert，Phase 2 需决定其活跃范围）
- `src/sim/snapshot.ts` — 规范序列化 + 指纹（VERSION 2→3，纳入 Rapier 快照）
- `src/config/sim.ts` — 集中数值常量；`src/sim/content/formulas.ts` — 单一数值来源

</canonical_refs>

<code_context>
## Existing Code Insights

> 本项目为 Phase 1 后的**新地基**（旧 `src/`/`model/` 已废弃重写）。

### Reusable Assets
- **确定性核心（`src/sim/`）**：`TickClock`（固定步长）、`RandomStreams`（命名种子流）、`CommandQueue`（每 tick 顶部 drain 一次）、`EventLog`（每 tick 清空的类型化事件）、`EntityStore`（有序 `entityId`）、`snapshot`/`fingerprint`（规范字节 + 非加密哈希）。Phase 2 全部复用，只做必要扩展。
- **`src/config/sim.ts`**：`FIXED_DT = 1/60`、`AI_INTERVAL`、`MAX_FRAME/MAX_STEPS` 等集中常量——物理新常量应并入此处或 `content/`（单一来源）。
- **`src/sim/content/formulas.ts`**：数值常量的单一来源约定（Phase 3 扩展为职业/武器/防具表）。
- **Phase 1 双门禁工具链**：`pnpm gate`（`tests/determinism`）+ 约定门禁 `tests/style/conventions.test.ts`（JSDoc/结构），Phase 2 沿用并扩展。

### Established Patterns
- **接口先于类 + `I` 前缀**：每类先定义 `I<ClassName>` 并 `implements`，**禁止用类当类型**（Phase 1 D-13）。Phase 2 新类（`PhysicsWorld`/`CompositeFactory`/`ContactBridge`/`LifecycleSystem`）必须遵守。
- **数字枚举 + 判别联合**：`CommandKind`/`SimEventKind`/`Command`/`SimEvent` 均为数字枚举与具名接口联合（D-14/D-16）——部位枚举 `Body|Weapon|Armor`、防具子类型 `Helmet|Shield` 照此办理。
- **有序迭代契约**：系统只遍历 `store.ids()` 的**有序数组**，绝不遍历 `Map`/`Set`/对象键顺序（确定性 Pitfall 4）。
- **`sim/**` 无头边界**：`tsconfig.sim.json`（DOM-free）+ ESLint `no-restricted-imports/globals/properties/syntax`（禁 `Math.random`、`Date.now`、`performance.now`；`Math.sin/cos` 允许，D-02）。Rapier 依赖需在此边界内成立（Node 无头）。
- **每 tick 事件清空**：`BattleSim.step()` 顶部 `events.clear()` + `commands.drain()`——接触事件必须在本 tick 内从 Rapier 队列 drain 并翻译，避免跨 tick 归属错乱。
- **穷尽性守卫**：`SimEventKind`/`CommandKind` 的 switch 有 `never` 守卫，禁止静默 no-op——新增事件/命令变体必须是编译错误而非遗漏。

### Integration Points
- **`BattleSim.step()`**：在 `clock.step()` 之后、Phase-1 系统之前/后插入 `PhysicsWorld.step(dt)` + `world.step(eventQueue)` + `ContactBridge` drain → `EventLog`。命令应用（Force/Torque）改为经由 Rapier（施加冲量/力）而非直接改 `xform`。
- **`ISimState`**：新增 `physics: IPhysicsWorld` 字段；`build()`/`restore()`/`snapshot()` 同步扩展。
- **`IUnitComponents`/`IUnitXform`**：新增物理组件（body handle、`collider → (entityId, part)` 映射）与 `rotation`/`angularVelocity`。
- **`ICommandQueue` → Rapier**：`Force`（上下左右四向力）、`Torque`（旋转力）映射到 Rapier `applyImpulse`/`addForce`/`applyTorqueImpulse`；`WeaponAbility`/`UnitAbility` 是否本阶段变活需 planner 裁定（D-36 克制原则）。
- **`snapshot.ts`（VERSION 2→3）**：纳入 Rapier 状态与旋转字段；`fingerprint()` 覆盖镜像位姿 + Rapier 快照哈希（D-20）。
- **`tests/determinism`**：新增物理双跑/双指纹门禁；Node 下先 `await initPhysics()`。

</code_context>

<specifics>
## Specific Ideas

- 用户对规模与克制的明确表态：**"我怀疑现在的设计开始有点设计过度了，这个项目不是那种需要长期拓展的大项目，可以避免一些没有必要的抽象，仅做必要的拓展。"** 及 **"目前还没有看到明显的问题，但是似乎有这个倾向，后续做规划与实现的时候注意一下即可。"** —— 这是**设计原则**（D-36），要求下游 agent 在规划/实现时主动抵制过度抽象，而非待办清单。
- 用户选择**同机确定性**（沿用 Phase 1 D-02），主动**不买**跨机成本；但接受用 `-deterministic` 构建 + 精确钉版作为零代码成本的"预设对齐"。
- 用户接受**软钳制"安全带"**（而非反弹墙）——倾向以最小机制保障稳定性，把"玩法边界"（地图边缘反弹）留给后续层。
- 武器**持续往复摆动**（无需 AI 即可演示）——服务于 Core Value"战斗必须激烈好看"，且让 Phase 2 独立可测。

</specifics>

<deferred>
## Deferred Ideas

- **跨机位级确定性**（禁用平台三角函数 + 跨机 golden-hash + CI）——沿用 D-02/D-03，架构保留升级空间，本阶段不做。
- **进阶武器招式**（前摇/后摇、指令强砍、技能旋转）——Phase 3/4 技能层落地。
- **地图边缘反弹**（规格的"军队碰边反弹"）——王国/地图层阶段。
- **硬边界/反弹墙**——本轮选了软钳制安全带；若玩法需要再引入（会改确定性基线）。
- **待规划复核的简化候选（D-36）**：双指纹门禁是否下简为只用 sim 指纹；武器摆动是否不必用关节电机（改为直接施加角冲量/角速度）；`sim/world` 是否不必强制四文件拆分。**默认保持现状，仅在实现发现确无必要时才下简。**

</deferred>

---

*Phase: 2-Physics & Composite Units*
*Context gathered: 2026-10-16*
