# AI 版球球王国（Evolved Marble）

## What This Is

一个 AI 驱动的战争模拟：在 1000×1000 的地图上，多个势力调动军队、争夺城池、彼此攻伐；每场战斗中的每个单位由 AI 实时操控。产物是可观看、可出片的模拟录像，同时作为"多智能体 AI / 可插拔 AI 控制"的研究平台。

上一版因**设计过度**被推翻——公式化的工程架构、层级化推进、无意义的中间态、过度的接口预留，导致体量膨胀、理解困难、无法继续推进。本版由用户主导方向与设计，聚焦"最终形态 + 代码设计的合理性"，规模约 10k–20k 行，**单里程碑、不拆分**。参考规格缓存于 `.planning/reference/ai-marble-kingdom.md`。

## Core Value

**战斗必须激烈好看。**

当权衡取舍时，优先保证：单位行为多样、战局有悬念、画面值得观看。战略层与导演层再聪明，若战斗本身不好看也没有意义——因为成片标准就是"战斗激烈好看"。

## Requirements

### Validated

- ✓ 游戏设计规格（机制与数值）—— 已由用户在飞书知识库确立（`杂项 / AI 版球球王国`），缓存于 `.planning/reference/ai-marble-kingdom.md`
- ✓ **单位系统** —— 16 项单位属性、7 个职业、6 种武器、2 种防具、等级/经验/升级、正态生成 — Phase 1
- ✓ **物理模拟系统** —— Rapier2D 复合刚体、部位标记类型化事件、伤害/减伤、固定 tick — Phase 2
- ✓ **操控系统** —— 单位级 AI 输入/输出契约、每 0.1s（6 tick）决策、可插拔 `IUnitAIProvider` + 默认基线 AI — Phase 3

### Active

项目由 8 个相对独立、低耦合的系统构成。**一阶段只攻一个系统**，不按层级纵向推进。

- [ ] **王国系统** —— 地图、行军、视野、军队、城池、驻扎/训练、军队/城池战斗触发与战后结算
- [ ] **渲染系统** —— PixiJS 顶视渲染、HUD（HP/等级/阵营）、镜头
- [ ] **录制系统** —— 全程持续帧采集 → 视频（浏览器 WebCodecs + Mediabunny 库）
- [ ] **AI 接入系统** —— 可插拔的 LLM 指挥官 / 导演接入点（首期只定义接口，不实际接入）
- [ ] **统计与精彩回放系统** —— 战斗统计；精彩回放从**已有录像**中原样截取片段

### Out of Scope

| 排除项 | 原因 |
|--------|------|
| 确定性 / 重放 / 指令录像系统 | 不做重放、不保证确定性（用户明确移除）；精彩回放走"录像片段截取"而非模拟重放 |
| LLM 指挥官 / 导演的**实际接入** | 首期只预留学生明确要求的**可插拔接口**；上来就接不是好想法 |
| RL 单位控制**本体** | 首期只预留可插拔接口；Python 训练链路保留设计位，不实现 |
| 硬克制（长矛克骑兵等） | 杀死悬念；改用软克制（装甲/破甲比率） |
| 手绘动画 / 骨骼绑定 | 物理驱动的混乱感才是本作美学与卖点 |
| 玩家操控单位 | 这是观赏模拟，非可玩游戏 |
| 每单位 Pixi filter/mask | 性能昂贵；用着色与粒子替代 |
| GOAP / HTN / MCTS | 对 0.1s × 数十单位过重，用行为树 |

## Context

- 参考文档描述的完整系统含三层 AI：单位级（每 0.1s 决策）、LLM 指挥官（每 84 游戏小时 + 重大事件决策）、LLM 导演（镜头与解说）。三层差异极大——首期只做单位级 + 可插拔接入点。
- 时间系统：战斗 1× 速（1 秒 = 游戏 1 小时），无战斗 24× 速；tick = 游戏 1 分钟；推理间隔为现实 1 秒对应时长的 1/60。
- 成片场景：2D 顶视，Chrome-only。
- 旧实现存在于 `origin/video-codec` 分支（Vue + `@motajs/client` + `planck-js` + Python RLlib 原型）；被删的历史规划存在于 `b8bb56b^`（阶段 01–03）。两者**仅作参考**，不背负旧架构。
- 旧版教训：重复渲染、硬编码场景、stub 层、无测试——本版用"类型先行 + 审查门禁 + 测试"正面解决。

## Constraints

- **Tech Stack**: 物理用 Rapier2D（`@dimforge/rapier2d`，WASM）；渲染用 PixiJS；录制用浏览器 WebCodecs + Mediabunny（不用 ffmpeg）；模拟主体在浏览器运行；Python 侧训练链路保留设计位。
- **Compatibility**: 仅支持 Chrome（不要求 Firefox / Safari）。
- **Scale / Milestones**: **单里程碑，不拆分**，约 10k–20k 行。
- **No Determinism**: 不保证物理/模拟跨平台或跨运行可复现；无重放、无指令录像。
- **Pluggable AI**: AI 控制与 LLM 接入必须做成可插拔模块，可替换不同系统；但不预留多余定制接口，**只留必要的**。
- **Anti-Over-Engineering**: 不做公式化工程架构；每个系统相对独立，一阶段只攻一个系统；不做无意义的中间态。
- **Type-First + Review Gate**: 每个阶段**先写类型声明（`types.ts` + `I*` 接口），经用户审查确认设计合理后才能进入实现**；实现中容许并预期多次重构。**规划也分两轮**：先**只规划类型声明**，待用户确认类型设计无误后，**再规划实现计划**——避免类型契约变动导致实现计划返工。
- **角色分工**: 用户主导方向与设计决策；AI 负责设计讨论与实现。实现细节 AI 自主，除非出现领域级大问题（如性能崩坏）。
- **Spec Authority**: 数值与机制以参考文档为准，但需实测校准。

### Code Conventions（强制）

1. 每个类**先写接口 `I<Name>`，再 `implements` 它**。接口一律**大写 `I` 开头**。
2. 所有类型声明集中到**每个文件夹一个 `types.ts`**。
3. **枚举使用数字枚举**，禁止字符串枚举。
4. 接口的成员与方法**必须写 JSDoc**；类实现接口的成员/方法可省略 JSDoc，但**私有方法 / 私有成员必须有 JSDoc**。
5. **不允许出现不在 interface 中的公共成员**。
6. **所有顶层 `const` 声明必须写 JSDoc**。
7. 其余注释从简，不写过多无用注释。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 推翻旧版、用户主导重来 | 旧版设计过度、公式化、层级化推进、无意义中间态，无法推进 | — Pending |
| 单里程碑、按 8 系统分阶段 | 内容不多且系统相对独立；避免里程碑/中间态开销 | — Pending |
| 保留 Rapier2D 物理 | 数十单位混战需要性能 + 活跃维护（放弃旧 planck-js） | — Pending |
| 保留 PixiJS 渲染 | 主流、生态与文档好（替换旧 `@motajs/client`） | — Pending |
| 保留 Python 训练设计位 | 保留"控制等级 = 训练轮数"设定，首期不实现 | — Pending |
| **移除确定性** | 不重放、不做指令录像，无需跨机/跨运行可复现 | — Pending |
| AI 控制 / LLM 接入**可插拔** | 首期不接入，仅留必要接口，后续可接不同系统 | — Pending |
| 精彩回放 = 录像片段原样截取 | 模拟全程持续录制，无需确定性重放 | — Pending |
| 类型先行 + 用户审查门禁 | 保证接口/代码设计合理，便于用户理解与拓展 | — Pending |
| 规划分两轮（先类型、后实现） | 避免类型契约在实现规划后才变动，导致实现计划返工 | — Pending |
| 缺失值：对象用 null、字面量用 undefined | 一眼可辨量是否为对象 | — Pending |
| 通用可复用抽象放 `src/common/`（如 `IRng`） | 简单抽象即做；供各系统共享，不重复实现 | — Pending |
| 操控系统类型契约（D-01..D-19）经门禁批准 | 类型先行 + 用户审查；契约冻结后 round 2 实现 | ✓ Phase 3 |
| 感知走控制层 `ISensingWorld`/`Sensor`，不扩展 `IPhysicsWorld` | 保持物理契约冻结；Phase 4 可替换为王国世界 | ✓ Phase 3 |
| 阵营 `teamId` 注册注入；同队保留碰撞但不结算伤害 | 不在 `IUnit` 提前引入势力；伤害过滤在应用层 | ✓ Phase 3 |
| 每单位 `IUnitAI` 由 `IUnitAIProvider` 创建；动作保持 6 tick 每 tick 重施加 | 可插拔 AI + 物理每 `tick()` 清空力/力矩 | ✓ Phase 3 |
| 默认基线 AI 仅验证用最小三行为；技能只输出意图 + 冷却 | 核心是 AI，后续整体替换；不提前做射弹/技能物理 | ✓ Phase 3 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-20 after Phase 3*
