# Phase 5: 渲染系统 - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

交付 PixiJS 2D 顶视渲染：单位/武器/防具/阵营可辨，单位级 HUD，自动镜头，以及一个可运行的渲染 demo。渲染只消费 Phase 1–4 的既有读取面，不改动 `IUnit`、`IPhysicsWorld`、`src/control/types.ts` 的既有契约。

本阶段不实现：录制/视频编码（Phase 6）、多场战斗的顺序剪辑与时间回跳（Phase 6）、LLM 指挥官/导演（Phase 7）、伤害/击杀统计系统（Phase 8）。

**Type-first gate（项目强制）：** 本阶段仍分两轮——Round 1 只写 `src/render/types.ts` + `IRenderer`/`IHud`/`ICamera`/`IUnitView` 等接口，经用户审查批准后才规划 Round 2 实现。

</domain>

<decisions>
## Implementation Decisions

### 范围与验收口径

- **D-01:** **REND-05 按用户明确要求放宽**：不追求实时/可交互帧率；渲染慢一点无所谓，视频是逐帧输出的。现阶段只做**最简单的实现 + 最基本的性能优化**（如地图分区渲染/视口裁剪），后续再由用户提出优化方案。验收口径改为“Chrome 下能跑、不崩、能逐帧推进并输出 canvas”，而不是 60fps。 — **Reversibility:** costly — 该口径取代了 REQUIREMENTS.md / ROADMAP.md 中“可交互帧率”的原始措辞，验收与测试都以此为准。
- **D-02:** **多场战斗的顺序展示/回到 15s 属于 Phase 6**：模拟并发推进，Phase 5 只负责“跟拍一个明确的战斗目标 + 平滑切换”。Phase 5 不实现时间回跳、不实现“先播第一场再回放第二场”的剪辑时间线。 — **Reversibility:** costly — 涉及 Phase 5/6 的职责边界与镜头驱动接口。

### 视觉辨识与美术方向

- **D-03:** 默认使用**程序化几何**（PixiJS 直接绘制圆/环/线条/多边形），零美术素材；但必须保留**换成贴图的接缝**。接缝采用 `IUnitView` + `IUnitViewFactory`：默认 `GeometryUnitView`，未来可替换为 `SpriteUnitView`，`IRenderer`/`ICamera`/`IHud` 不需要改动。 — **Reversibility:** costly — 视图工厂是类型门禁契约，后续所有单位/装备视觉都从它创建。
- **D-04:** **阵营用本体填充色区分，颜色可配置**（按 factionId 映射，不写死赤/蓝）。**职业不单独设计视觉**，职业辨识通过装备/武器体现；**6 种武器使用不同几何形状**，**防具使用不同几何形状**（头盔/盾牌可辨）。 — **Reversibility:** costly — 这是 REND-02 的核心视觉契约，影响所有视图与图例。
- **D-05:** 视觉基调为**暗底高饱和**：深灰/墨色战场、低饱和地形、阵营色高饱和，让单位与特效最跳。 — **Reversibility:** reversible — 调色板可整体替换。

### 战斗反馈与 HUD

- **D-06:** 采用**强反馈**：受击闪白、伤害数字、火花/粒子、死亡碎裂/淡出、轻微镜头震动。所有特效对象池化并设同屏上限；性能只做基本优化，不做复杂 LOD。 — **Reversibility:** reversible — 特效强度与上限均为可调常量。
- **D-07:** 单位头顶只画**血条**：颜色 = 阵营色；**不显示当前/最大生命值文本，不显示单位名**。血条默认隐藏，单位受击后显示 **15 × 输出帧率** 帧；场上总单位数 **< 6** 时常亮（阈值可调）。 — **Reversibility:** costly — HUD 显隐规则与反馈事件流绑定。
- **D-08:** **等级数字常亮**，绘制在单位本体上，**不随单位旋转**（始终直立）。等级**永远跟随视角缩放**（世界尺寸），不做屏幕恒定。 — **Reversibility:** costly — 等级是每单位常驻视觉元素，缩放行为已锁定。
- **D-09:** 血条缩放采用**混合模式**：近景屏幕恒定像素大小；镜头缩远到阈值后**平滑过渡**为世界尺寸，避免大量单位 HUD 重叠。阈值与过渡区间可调。 — **Reversibility:** costly — 需要与镜头缩放状态耦合。
- **D-10:** 伤害数字**仅大伤害显示**（阈值可调，初始 50）：数字向上飘并淡出；轻击只闪白/火花，不刷数字。 — **Reversibility:** reversible — 阈值与样式可调。
- **D-11:** 视频内左上角只显示**时间 + 速度**（如“第 1 年 3 月 12 日 14:00 / 24×”），不显示势力图例、不显示战况统计。日期用**简化历**：1 年 = 12 月 × 30 天，1 天 = 24 小时；0 游戏分钟 = 第 1 年 1 月 1 日 0 时。 — **Reversibility:** reversible — 显示字段与历法换算可调。
- **D-12:** 操作者专用面板（**视频中永不出现**）用 **HTML/CSS 覆盖层**实现，位于 canvas 之外。第一版提供：暂停/继续、单步、重置、镜头模式切换、**每帧延时**（速度）、选中军队后下 `MoveTo`/`Garrison`/`Hold`（复用 `IWorld.issueOrder`）。不提供强制结束战斗、单位传送、碰撞体/射线叠加。 — **Reversibility:** costly — 操作界面与模拟控制循环、`issueOrder` 的接线方式绑定。

### 自动镜头与画布构图

- **D-13:** 画布默认 **1920×1080**，作为可配置参数；内部按固定 16:9 分辨率渲染，页面内等比缩放居中。 — **Reversibility:** reversible — 分辨率与缩放策略可调。
- **D-14:** 镜头有**两种状态**：
    1. **无战斗全景**：显示整张地图，只画地图 + 军队标志 + 城池标志，**不渲染单位**。军队 = 阵营色箭头（指示朝向）+ 实力标记（人数）；城池 = 阵营色方块/旗 + 规模（主城更大）。地形用低饱和色块表示。
    2. **战斗特写**：平滑推近到战斗区，镜头中心尽量贴合战斗区中心；**至少保证 90% 的参战单位在画面内**，不足则拉远。所有镜头运动必须平滑，禁止瞬移。 — **Reversibility:** costly — 镜头状态机、缩放与构图规则是 Phase 6 录制取景的基础。
- **D-15:** Phase 5 的镜头跟拍目标由调用方显式指定（如 `setBattleTarget(battleId)`）；demo 默认跟当前活跃战斗，Phase 6 可按战斗队列驱动镜头依次展示。Phase 5 自身不做“最激烈战斗评分”或顺序剪辑。 — **Reversibility:** costly — 这是 Phase 5/6 的镜头控制契约。

### 接入方式与播放节奏

- **D-16:** 新增**最小可运行 demo 页**：Vite `index.html` + `main.ts`，用真实 `DEFAULT_SCENARIO` 接线 `PhysicsWorld` + `KingdomSensingWorld` + `BattleDamageSink` + `ControlSystem` + `KingdomWorld` + Pixi 渲染器；`pnpm dev` 可直接观看。它是验证用 harness，**不是最终 app shell**，不做菜单/场景选择/录制按钮。 — **Reversibility:** reversible — 页面与接线可替换。
- **D-17:** 渲染循环**不按真实时间节流**：每输出一帧推进**恰好 1 个外层 `IWorld.tick()`**（战斗中 1 游戏分钟、无战斗最多 24 分钟），然后渲染。每帧结束用 **`setTimeout` 让出事件循环**，再立刻下一帧；`setTimeout` 的延时就是操作者面板的“速度”控制。不使用固定 fps 累加器、不使用 rAF 作为主节拍。输出帧率只作为视频编码/时长与 HUD 15s 换算参数。 — **Reversibility:** costly — 这是渲染/模拟耦合的核心时序契约。
- **D-18:** 渲染器**不拥有循环**：`IRenderer.renderFrame()` 只画一帧，`getCanvas()` 暴露 canvas；推进、暂停、单步、延时由 demo/上层 runner 负责。Phase 6 直接拿 canvas 逐帧编码。 — **Reversibility:** costly — Phase 6 的帧采集接口依赖它。
- **D-19:** demo/未来应用使用**真实组合根**接线（参照 `tests/kingdom/harness.ts` 的顺序：物理 → 感知 → 伤害接收方 → 控制 → 王国世界），不伪造单位/战斗数据；`RAPIER.init()` 必须在构造世界前完成。 — **Reversibility:** reversible — 接线细节可重构。
- **D-20:** 所有视觉/时序可调项集中到渲染层常量或配置（阵营色表、分辨率、输出帧率、HUD 阈值、伤害数字阈值、镜头平滑参数、每帧延时的默认值），不在各处写魔法数。 — **Reversibility:** reversible — 调参入口可整理。

### Research Flags（不是用户决策，供 research/planner 解决）

- **REND-05 文档同步：** REQUIREMENTS.md / ROADMAP.md 仍写着“可交互帧率”，与本阶段 D-01 冲突。规划/验收必须以 CONTEXT 的 D-01 为准；是否在 transition 时同步修订文档由后续流程决定。
- **伤害事件来源：** `IControlSystem.tick()` 只返回 `skillIntents`，伤害事件在 `ControlSystem` 内部直接路由给 `IDamageSink`；渲染层目前拿不到 `IDamageEvent`。需要研究一个**不修改冻结契约**的读取接缝（例如组合根用装饰器包装 `BattleDamageSink`，把伤害事件旁路给渲染层；或在 demo runner 中记录）。受击闪白、伤害数字、HUD 15s 计时都依赖它。
- **死亡反馈：** 单位死亡后会被 `ControlSystem` 注销并从物理世界移除；渲染层需要检测“上一帧存在、这一帧消失”的单位并在最后位置播放碎裂/淡出。
- **镜头 90% 拟合：** 需要定义“参战单位”口径（建议 `IBattle.getMemberUnitIds()` 中的存活成员）、拟合算法与边距；多场战斗时由调用方指定目标。Phase 6 会驱动顺序切换。
- **HUD 缩放过渡：** 血条的屏幕恒定 ↔ 世界尺寸平滑过渡需要读取当前镜头缩放；阈值/过渡区间待调。
- **视图工厂与 Pixi 类型边界：** `IUnitView` / `IUnitViewFactory` 是否直接暴露 Pixi `Container`，还是用不透明句柄，需在类型门禁决定；目标是换贴图实现时不改 `IRenderer`/`ICamera`/`IHud`。
- **PixiJS 接入：** 尚未安装 PixiJS；无 `index.html`、无 `main.ts`、无 `dev` script。需确定 PixiJS 版本（建议 v8）、初始化方式、WebGL/WebGPU 选择与 Vite 集成。
- **逐帧 setTimeout：** 每帧 `setTimeout(…, 0)` 可能被浏览器嵌套计时器钳制到约 4ms；用户接受先这样模拟未来 WebSocket 推理延迟，若吞吐问题明显后续再改。
- **时间格式：** `ITimeSystem` 只有游戏分钟；需要纯函数换算到 360 天简化历并格式化。

### the agent's Discretion

- 每种武器/防具的具体几何造型、线宽、尺寸与配色细节；阵营色调的具体色值。
- 镜头平滑/缩放的缓动曲线、过渡时长、90% 拟合的边距与评分细节。
- 血条尺寸、等级字体大小、伤害数字样式、粒子数量与池上限。
- 操作者面板的布局、文案、镜头模式的具体命名与快捷键。
- `src/render/` 内部文件拆分（遵循每文件夹一个 `types.ts`）与 demo 文件位置。
- demo 默认场景（默认 `DEFAULT_SCENARIO`）、初始镜头状态、是否显示调试网格。
- PixiJS 版本与具体 API 用法。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威规格

- `.planning/reference/ai-marble-kingdom.md` § 时间系统 — 1×/24×、tick = 游戏 1 分钟、无 wall-clock。
- `.planning/reference/ai-marble-kingdom.md` § 战斗 — 80m 战斗区、参战单位、离区/结束；渲染镜头跟拍的空间基准。
- `.planning/reference/ai-marble-kingdom.md` § 行军 / § 城池 / § 视野 — 全景视角里军队、城池、地形标记的语义。
- `.planning/reference/ai-marble-kingdom.md` § 单位 / § 武器 / § 防具 / § 职业 — 6 武器、2 防具、7 职业；视觉辨识的信息来源。
- 规格中**没有**渲染/美术章节，视觉方案完全由本 CONTEXT 决定。

### 需求与路线图

- `.planning/REQUIREMENTS.md` § REND（REND-01..05） — 本阶段需求；注意 REND-05 已被 D-01 放宽。
- `.planning/ROADMAP.md` § Phase 5: 渲染系统 — 目标、成功标准、Type-first gate、UI hint。
- `.planning/PROJECT.md` § Core Value / Out of Scope / Constraints — “战斗必须激烈好看”、PixiJS、Chrome-only、禁止每单位 filter/mask、反过度设计。

### 已冻结的上游契约

- `src/kingdom/types.ts` — `IWorld`、`ITimeSystem`、`IBattleSystem`、`IBattle`、`IArmy`、`ICity`、`IFaction`、`IVec2`、`ITerrainRect`、`IMapBounds`；渲染读取面。
- `src/kingdom/scenario.ts` — `DEFAULT_SCENARIO` / `SCENARIO_MINIMAL`，demo 与测试场景。
- `src/control/types.ts` — `IControlSystem`、`IUnitCatalog`、`IUnitBrief`、`IDamageSink`、`IUnitAIProvider`；单位目录与伤害路由。
- `src/physics/types.ts` — `IPhysicsWorld`、`IUnitState`、`IPhysicsTickResult`、`IDamageEvent`；位置/朝向/速度与伤害数值。
- `src/physics/constants.ts` — `DT = 1/60`、本体 0.5m / 防具 0.55m / 武器半长 0.4m 的几何基准。
- `src/units/types.ts` — `IUnit`、`AttributeKind`、`ClassKind`、`WeaponKind`、`ArmorKind`、`IEquipment`；单位视觉与 HUD 数据。
- `src/units/data.ts` — `CLASS_DEFS`/`WEAPON_DEFS`/`ARMOR_DEFS`；视觉/图例可读取的装备定义。
- `tests/kingdom/harness.ts` — 真实组合根接线范例（物理 → 感知 → 伤害接收方 → 控制 → 王国世界）。
- `.planning/phases/04-kingdom-system/04-CONTEXT.md` — D-01（全局持久物理世界）、D-03（战斗队列）、D-07/D-08（游戏时间）、D-17（80m 战斗区）、D-25（视野查询）。
- `.planning/phases/03-control-system/03-CONTEXT.md` — D-05（纯数据快照）、D-07（teamId）、D-09（同队免伤）、D-13（动作保持）。
- `AGENTS.md` § Code Conventions（强制） — 接口 `I` 前缀、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、缺失值 null/undefined、通用抽象放 `src/common/`。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `KingdomWorld`（`src/kingdom/KingdomWorld.ts`）实现 `IWorld`：时间、地图、势力/军队/城池、战斗系统、地形；渲染的主要世界读取面。
- `IControlSystem`（`src/control/ControlSystem.ts`）继承 `IUnitCatalog`：`getUnit`/`getTeam`/`listUnitIds`，渲染据此拿到全部单位及阵营。
- `IPhysicsWorld.getUnitState`（`src/physics/PhysicsWorld.ts`）：每单位位置/朝向/线速度/角速度；渲染每帧读取。
- `IUnit`（`src/units/Unit.ts`）：`getAttribute(Health/MaxHealth/Level/Mass/...)`、`getClass`、`getEquipment`、`getSkills`、`isAlive`；HUD 与视觉数据。
- `DEFAULT_SCENARIO`（`src/kingdom/scenario.ts`）：2 势力 × 8 单位、2 城、4 块地形；可直接作为 demo 场景。
- `tests/kingdom/harness.ts`：`PhysicsWorld` + `KingdomSensingWorld` + `BattleDamageSink` + `ControlSystem` + `KingdomWorld` 的强制接线顺序；demo 组合根可照此抽取。
- `tests/helpers/rng.ts`：`mulberry32`；demo 可用固定种子复现展示。

### Established Patterns

- interface-first、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、缺失对象 `null` / 缺失字面量 `undefined`。
- 两轮类型门禁：Round 1 仅类型 + 用户审查，Round 2 实现。
- 物理/控制/王国层只通过接口引用单位；渲染层同样只读 `IWorld` + `IControlSystem` + `IPhysicsWorld`，不触碰内部实现。
- 测试夹具使用真实 Rapier + `RAPIER.init()` + `afterEach` dispose。

### Integration Points

- 新建 `src/render/`：`types.ts`（`IRenderer`/`IHud`/`ICamera`/`IUnitView`/`IUnitViewFactory` 与配置类型）+ 渲染器、镜头、HUD、视图实现、常量。
- 新建最小 demo 入口（`index.html` + `src/main.ts` 或等价位置）与组合根；`package.json` 需补 `dev` script 与 PixiJS 依赖。
- 渲染读取：`IWorld`（时间/地图/军队/城池/地形/战斗）、`IControlSystem`（单位目录/阵营）、`IPhysicsWorld`（运动状态）、`IUnit`（属性/装备）。
- 伤害/死亡反馈需要一条只读旁路（Research Flag）：不能改 `IControlSystem` 冻结契约，优先在组合根包装 `IDamageSink`。
- Phase 6 接管：`IRenderer.renderFrame()` + `getCanvas()` 逐帧取图；`ICamera.setBattleTarget(...)` 供顺序播放驱动。

</code_context>

<specifics>
## Specific Ideas

- 用户原话：**“视频是一帧一帧输出的，不是录制出来的”**；因此不追求实时帧率，渲染慢一点无所谓。
- 用户原话：**“帧率应该是一个可调整的参数，真正的帧数是 15 × framerate”**；HUD 15s 按输出帧数算，不按游戏时间或 wall-clock。
- 用户原话：**“视角缩小到一定程度时，切换成跟随世界尺寸……最好设定一个合适的阈值，能够平滑过渡”**；血条采用混合缩放，等级永远跟随视角。
- 用户原话：**“无战斗时全景显示……用一张地图 + 军队标志 + 城池标志渲染，不渲染单位”**；战斗时拉近，中心贴战斗区，至少 90% 参战单位在画面内，否则拉远，禁止瞬移。
- 用户原话：**“多场战斗同时录制，按顺序展示……战斗结束后加一个简短的过渡后回到 15s 展示第二场”**；该顺序剪辑归 Phase 6，Phase 5 只提供可控镜头。
- 用户原话：**“操作者面板……视频中不出现”**；用 HTML/CSS 覆盖层，提供暂停/单步/重置/镜头模式/每帧延时/军队指令。
- 用户原话：**“等级在单位本体上显示，不随单位旋转”**；等级常亮，世界缩放。
- 用户原话：**“阵营用本体的颜色区分，可以通过配置调；职业通过武器区分，不需要单独设计”**。

</specifics>

<deferred>
## Deferred Ideas

- **多场战斗顺序播放/时间回跳/剪辑时间线** — Phase 6；Phase 5 只做目标战斗跟拍。
- **强制结束战斗、单位传送、碰撞体/射线/战斗区叠加等完整调试干预** — 需要 Phase 4 调试接缝；第一版操作面板不做。
- **更进一步的性能优化**（超出基本分区/裁剪） — 用户明确留到后续按实际情况提出。
- **真实贴图/图集/动画资源** — 通过 `IUnitViewFactory` 后续替换，本阶段只做程序化几何。
- **战斗“激烈度”评分与自动选战斗** — 顺序展示归 Phase 6；Phase 5 由调用方指定目标。
- **伤害/击杀统计** — Phase 8，不进入 HUD。

</deferred>

---

*Phase: 5-渲染系统*
*Context gathered: 2026-10-21*
