# Phase 1: Foundation & Deterministic Sim Core - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

交付一个**无头、固定步长、带种子的模拟核心**：无渲染、无 DOM、无网络、无时钟依赖，并能用自动化门禁证明其可复现性。这是后续所有阶段的地基——物理、战斗、AI、渲染、桥接、录制都建立在这个核心之上。

不包含：物理世界与刚体（Phase 2）、战斗数值与成长（Phase 3）、单位 AI（Phase 4）、渲染（Phase 5）、桥接与录制（Phase 6）。

</domain>

<decisions>
## Implementation Decisions

### 确定性策略（Determinism）
- **D-01:** 建**确定性核心**：固定步长 TimeClock + 种子 PRNG（禁用 `Math.random` 影响模拟状态）+ 无头运行模式。步长 = 游戏 1 分钟（1× 下 60 步/秒）。 — **Reversibility:** one-way — 时间步与随机流的接口贯穿所有下游系统（物理、AI、战斗）；后期改动等于重做全部系统契约。
- **D-02:** 确定性目标定为**同机可复现**：同一种子在同一机器/浏览器内重跑结果一致。**不要求跨机位级一致**，因此**不**背负"禁用 `Math.sin/cos`""跨机器 golden hash"这套重纪律。 — **Reversibility:** costly — 日后若需跨机一致，需审计全部数学调用、固定构建/插入顺序并重建 golden 基线。
- **D-03:** 架构保留"日后收紧到跨机一致"的空间（模拟核心与外部 I/O 严格分层、可插入指纹门禁），但不为它现在买单。 — **Reversibility:** reversible。

### 实体模型（Entity Model）
- **D-04:** 采用**组合优先的轻量对象模型**，**不引入 ECS 框架**：实体是对象（稳定 `entityId` + 组件字段），系统写成显式函数（如 `movementSystem(world)`）。理由：并发高保真 AI 单位仅十几/方（≈20–40），ECS/SoA 的收益在此量级体现不出来；旧原型的真正病根是继承式 `Role`/`BodyBase` 桩基类，组合即可避开。 — **Reversibility:** one-way — 实体表示是物理/AI/战斗/渲染共同依赖的数据形状；改为 SoA/ECS 会触及全部系统。
- **D-05:** `entityId` 保持稳定、单调，为未来可能的 SoA/bitECS 迁移预留（仅当并发 AI 单位达数百时再评估）。 — **Reversibility:** reversible。

### 配置与数值来源（Config & Data）
- **D-06:** 数值（职业/武器/防具/公式常量）放在 **TS 数据模块**（`content/` 下类型安全常量，如 `classes.ts`），依赖 Vite HMR 实现改完即时生效。不引入外部 JSON + schema 校验层（本期）。 — **Reversibility:** costly — 若日后改为外部 JSON/模组加载，需为全部数值补 schema 校验与加载路径；但数值契约本身稳定，迁移面有限。

### 工具链与验证（Toolchain & Verification）
- **D-07:** 构建工具链用**最新版**：TS 7 + Vite 8（rolldown），要求 **Node ≥ 22.12**（本地为 v24.21，满足）。 — **Reversibility:** costly — 工具链切换会波及构建、测试与 WASM 资产管线配置。
- **D-08:** 测试框架用 **Vitest**（Vite 原生，零配置，与项目同构）。 — **Reversibility:** reversible。
- **D-09:** 确定性验证用**同机双跑指纹比对**：同种子跑两遍断言状态指纹相等，脚本化并作为提交前门禁。**暂不接 CI**（GitHub Actions）。 — **Reversibility:** reversible。
- **D-10:** 大产物（录像、检查点）一律**输出到仓库外目录并做轮转**，并在 `.gitignore` 中忽略；避免重演旧仓库 140MB checkpoint 入库的问题。 — **Reversibility:** reversible。

### 规模与录制约束（Scale & Recording — 对话中新引入）
- **D-11:** 一集完整模拟预期 **1 小时以上**；全图累计单位可能**上万**（但同屏高保真 AI 单位仍为十几/方）。录制产物按 1080p60 H.264 估为 **GB 级**（8–16 Mbps → 约 3.6–11 GB/集），故 D-10 必不可少；编码优先考虑 H.265/AV1 + CRF 以降体积。 — **Reversibility:** reversible（属录制层约束，Phase 6 落地）。

### the agent's Discretion
- 无头泵的具体实现（`raf` | `headless` | `fixed-fps`）细节、指纹的具体哈希算法与快照格式、`content/` 目录的内部组织——由规划/执行决定。
- 工具链具体小版本号（TS 7.x / Vite 8.x）以锁定时的 npm registry 实测为准。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威数值与机制（本阶段用于时间系统）
- `.planning/reference/ai-marble-kingdom.md` §时间系统 — tick 间隔 = 游戏 1 分钟；1× 下推理间隔 = 现实 1 秒的 1/60；无战斗 24× 速。**D-01 的固定步长直接来自此处。**
- `.planning/reference/ai-marble-kingdom.md` §AI 控制 — "每 6 帧操作一次（0.1 秒）"，是后续 AI 决策节流依据。

### 项目与需求
- `.planning/PROJECT.md` — 项目愿景、Core Value（战斗必须激烈好看）、约束
- `.planning/REQUIREMENTS.md` — SIM-01..SIM-04（本阶段需求）、全局 Out of Scope
- `.planning/ROADMAP.md` — Phase 1 目标、成功标准、依赖顺序（确定性优先）

### 研究结论（技术决策依据）
- `.planning/research/SUMMARY.md` — 五层架构、确定性优先、建议阶段结构
- `.planning/research/ARCHITECTURE.md` — SimLoop（固定步长累加器 + 可换泵）、`RandomStreams`、`Command` 契约、`EntityStore`、`sim/` 无 DOM/WebGL/网络/时钟 的边界约束
- `.planning/research/STACK.md` — TS 7 / Vite 8 / Vitest / WASM 资产管线等版本与 rationale
- `.planning/research/PITFALLS.md` — 确定性陷阱（Rapier 只保证"喂给它的东西"、后台标签页节流、桥接失败等）；Phase 1 关注固定步长累加器与种子化

### 前身代码（仅作反面教材，**不**复用）
- `.planning/codebase/ARCHITECTURE.md` — 旧原型的架构与反模式（重复渲染、硬编码场景、`Role` 桩、无消息关联）
- `.planning/codebase/CONCERNS.md` — 旧仓库已观测问题（监听器泄漏、奖励恒零、无测试、大产物入库）

</canonical_refs>

<code_context>
## Existing Code Insights

> **注意：本项目为完全重写**，`src/` 与 `model/` 均已废弃。以下仅说明"哪些**不**可复用"以及可借鉴的教训。

### Reusable Assets
- 无可复用源码。旧 `planck-js` 物理封装、RLlib 循环、`@motajs/client` 渲染层均随重写废弃。
- 可复用**资产**：`public/battle.webp`（背景图，Phase 5 用）。

### Established Patterns
- 无既有代码模式可继承——本阶段即用于建立新地基与约定。
- 反面教训（来自 CONCERNS.md，务必避免）：模块级可变全局单例、无关联 ID 的消息协议、`requestAnimationFrame` 直接当模拟时钟、桩基类 `throw new Error('Method not implemented.')`。

### Integration Points
- 本阶段在现有仓库内**全新起模**：新建 `sim/`（无 DOM/网络/时钟依赖）、`host/`（SimLoop 泵）等目录；不接入旧 `src/` 代码。
- 与后续阶段的接口：Phase 2 物理世界、Phase 4 AI、Phase 6 桥接均作为 `sim/` 之上的消费者（只读或经 `Command` 注入），本阶段需明确该边界。

</code_context>

<specifics>
## Specific Ideas

- 用户明确："这个规模真的需要 ECS 吗？" → 确认**不需要**，用组合优先对象模型。
- 用户明确："不需要对回放做要求……蝴蝶效应会很明显……先用确定性核心，录像回放后续再考虑" → 确定性核心照做，**行为数组回放推迟**。
- 用户选择**最新工具链**（TS7/Vite8）而非稳定版——愿意承担前沿风险换取新特性。
- 规模信息（用户提供）：一集 1+ 小时、累计上万单位、录像 GB 级。

</specifics>

<deferred>
## Deferred Ideas

- **行为数组回放（记录 AI 指令流 + 种子，重放重现同一局）** — 用户认为蝴蝶效应会让长局回放变脆，决定推迟。待确定性核心稳定后再评估；届时若需跨设备分享，可能要求把 D-02 收紧到跨机位级一致。
- **跨机位级确定性（禁用 `Math.sin/cos`、跨机器 golden hash、CI 门禁）** — 不在本阶段；架构保留升级空间（D-03）。
- **GitHub Actions CI** — 用户选择暂不接 CI，仅同机双跑门禁（D-09）。
- **外部 JSON 数值 + schema 校验 / 模组加载** — 本期用 TS 数据模块（D-06）；v1.x 的"数值热重载"与未来模组化再议。

</deferred>

---

*Phase: 1-Foundation & Deterministic Sim Core*
*Context gathered: 2026-10-15*
